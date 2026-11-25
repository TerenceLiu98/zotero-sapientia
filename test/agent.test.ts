import { assert } from "chai";
import { ChatController } from "../src/chat/controller";
import {
  isAlive,
  lastAnswer,
  makeAgent,
  plugin,
  type FixtureAgent,
  reset,
  until,
  use,
  SECRET,
} from "./helpers";

describe("connecting to an agent", function () {
  this.timeout(60000);

  let agent: FixtureAgent;

  beforeEach(async () => {
    await reset();
    agent = await makeAgent("connection");
  });

  /** What the agent reported about itself when it started. */
  async function started(): Promise<Record<string, any>> {
    const [first] = await agent.processes();
    assert.isOk(first, "the agent was started");
    return first;
  }

  it("launches the process with the configured command, arguments, environment and working directory", async () => {
    use(agent.profile(["--note", "two words", `it's "quoted"`]));

    assert.isTrue(await plugin().chat.connect());
    assert.isTrue(await plugin().chat.send("env:SAPIENTIA_TEST_TOKEN"));

    const reported = JSON.parse(lastAnswer(plugin().chat.getState()));
    assert.equal(reported.cwd, agent.dir, "the working directory");
    assert.equal(
      reported.env.SAPIENTIA_TEST_TOKEN,
      SECRET,
      "the environment variable",
    );
    // The script's path contains spaces, and must still arrive as one argument.
    assert.equal(reported.argv[0], agent.script);
    assert.include(reported.argv, "two words");
    assert.include(reported.argv, `it's "quoted"`);
    assert.equal(
      reported.argv.length,
      agent.profile(["--note", "two words", `it's "quoted"`]).args.length,
    );
    assert.isTrue(await isAlive(reported.pid), "the process is running");
  });

  it("negotiates the protocol before it opens a session", async () => {
    use(agent.profile());

    assert.isTrue(await plugin().chat.connect());

    const received = await agent.received();
    assert.deepEqual(
      received.map((entry) => entry.method),
      ["initialize", "session/new"],
    );
    assert.equal(received[0].params.protocolVersion, 1);
    assert.equal(received[0].params.clientInfo.name, "zotero-sapientia");
    assert.equal(received[1].params.cwd, agent.dir);
    assert.equal(plugin().chat.getState().connection, "connected");
  });

  it("does not hand the process an enclosing agent session", async () => {
    use(agent.profile());

    await plugin().chat.connect();

    assert.isFalse((await started()).insideClaudeCode);
  });

  it("ends the process on disconnect, and starts a new one to reconnect", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    assert.isTrue(await chat.send("echo:first turn"));
    const first = (await started()).pid;

    await chat.disconnect();
    assert.equal(chat.getState().connection, "disconnected");
    await until(async () => !(await isAlive(first)));

    assert.isTrue(await chat.send("echo:second turn"));
    const processes = await agent.processes();
    assert.lengthOf(processes, 2);
    assert.notEqual(processes[1].pid, first);
    assert.equal(lastAnswer(chat.getState()), "second turn ");
  });

  it("ends the process, and what it started, when the conversation is shut down", async () => {
    const controller = new ChatController();
    use(agent.profile());

    assert.isTrue(await controller.send("spawn-child"));
    const agentPid = (await started()).pid;
    const childPid = (await agent.received()).find(
      (entry) => entry.event === "child",
    )?.pid;
    assert.isNumber(childPid, "the agent started a child process");
    assert.isTrue(await isAlive(childPid));

    await controller.shutdown();

    await until(async () => !(await isAlive(agentPid)));
    await until(async () => !(await isAlive(childPid)));
    assert.equal(controller.getState().connection, "disconnected");
    assert.deepEqual(controller.getState().messages, []);
  });

  it("reaps a child that ignores TERM after its agent disconnects", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    assert.isTrue(await chat.send("spawn-stubborn-child"));
    const agentPid = (await started()).pid;
    const childPid = (await agent.received()).find(
      (entry) => entry.event === "child",
    )?.pid;
    assert.isNumber(childPid, "the agent started a child process");
    assert.isTrue(await isAlive(childPid));

    await chat.disconnect();

    await until(async () => !(await isAlive(agentPid)));
    await until(async () => !(await isAlive(childPid)));
    assert.equal(chat.getState().connection, "disconnected");
  });

  it("reports a command that cannot be found", async () => {
    use(agent.profile([], { command: "sapientia-no-such-binary" }));

    assert.isFalse(await plugin().chat.connect());

    const { connection, error } = plugin().chat.getState();
    assert.equal(connection, "error");
    assert.equal(error?.key, "launch-command-not-found");
    assert.equal(error?.params.command, "sapientia-no-such-binary");
    assert.lengthOf(await agent.processes(), 0, "nothing was started");
  });

  it("reports a working directory that cannot be used", async () => {
    use(agent.profile([], { cwd: "/sapientia no such dir/x" }));

    assert.isFalse(await plugin().chat.connect());

    assert.equal(plugin().chat.getState().error?.key, "launch-workdir-invalid");
  });

  it("reports an agent that refuses the handshake", async () => {
    use(agent.profile(["--mode", "init-fail"]));

    assert.isFalse(await plugin().chat.connect());

    const { error } = plugin().chat.getState();
    assert.equal(error?.key, "acp-request-failed");
    assert.include(String(error?.params.message), "initialize refused");
    const pid = (await started()).pid;
    await until(async () => !(await isAlive(pid)), { timeout: 8000 });
  });

  it("reports an agent that speaks another protocol version", async () => {
    use(agent.profile(["--mode", "bad-protocol"]));

    assert.isFalse(await plugin().chat.connect());

    assert.deepEqual(plugin().chat.getState().error?.params, {
      agent: 99,
      client: 1,
    });
  });

  it("reports an agent that exits in the middle of an answer, and lets a reconnect work", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    assert.isTrue(await chat.send("crash"));

    const state = chat.getState();
    assert.equal(state.connection, "error");
    assert.equal(state.execution, "idle", "the execution state was cleared");
    assert.equal(state.error?.key, "acp-agent-exited");
    assert.equal(state.error?.params.code, 3);
    assert.include(String(state.error?.params.detail), "fixture: fatal error");

    assert.isTrue(
      await chat.connect(),
      "Zotero is still usable, and a reconnect works",
    );
    assert.isTrue(await chat.send("echo:after the crash"));
    assert.equal(lastAnswer(chat.getState()), "after the crash ");
  });

  it("reports an error the agent returns", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    assert.isTrue(await chat.send("fail:the model is overloaded"));

    assert.equal(chat.getState().error?.key, "acp-request-failed");
    assert.include(
      String(chat.getState().error?.params.message),
      "the model is overloaded",
    );
  });

  it("recovers when the ACP stream closes while the agent is still running", async () => {
    use(agent.profile());
    const chat = plugin().chat;
    await chat.send("close-stdout");

    await until(() => chat.getState().connection === "error");
    assert.equal(chat.getState().error?.key, "acp-connection-lost");
    const pid = (await started()).pid;
    await until(async () => !(await isAlive(pid)));
    assert.isTrue(await chat.send("echo:reconnected"));
    assert.equal(lastAnswer(chat.getState()), "reconnected ");
  });
});
