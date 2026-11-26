import { assert } from "chai";
import type { PaperContext, SelectedText } from "../src/context/paper";
import { formatError } from "../src/utils/errors";
import {
  count,
  isAlive,
  lastAnswer,
  lastAssistant,
  makeAgent,
  plugin,
  pluginLog,
  type FixtureAgent,
  reset,
  roles,
  SECRET,
  until,
  use,
} from "./helpers";

describe("a conversation", function () {
  this.timeout(60000);

  let agent: FixtureAgent;

  beforeEach(async () => {
    await reset();
    agent = await makeAgent("conversation");
  });

  it("shows the answer while it is still being written, then leaves the executing state", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    const sending = chat.send("slow:300:3");
    await until(() => lastAnswer(chat.getState()).includes("chunk 1"));

    assert.equal(chat.getState().execution, "executing");
    assert.equal(lastAnswer(chat.getState()), "chunk 1 ");
    assert.isNull(lastAssistant(chat.getState()).stopReason);

    await sending;

    assert.equal(chat.getState().execution, "idle");
    assert.equal(lastAnswer(chat.getState()), "chunk 1 chunk 2 chunk 3 ");
    assert.equal(lastAssistant(chat.getState()).stopReason, "end_turn");
  });

  it("keeps the thought, the tool call and the answer in the order they arrived", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    assert.isTrue(await chat.send("think:the answer"));

    assert.deepEqual(roles(chat.getState()), ["user", "assistant"]);
    const { blocks } = lastAssistant(chat.getState());
    assert.deepEqual(
      blocks.map((block) => block.type),
      ["thought", "tool", "text"],
    );
    const tool = blocks[1];
    assert.equal(tool.type === "tool" && tool.title, "Reading the paper");
    assert.equal(tool.type === "tool" && tool.status, "completed");
    assert.equal(lastAnswer(chat.getState()), "the answer");
  });

  it("keeps the session across follow-ups", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    assert.isTrue(await chat.send("echo:first question"));
    assert.isTrue(await chat.send("echo:follow up"));

    const received = await agent.received();
    assert.equal(count(received, "session/new"), 1);
    const prompts = received.filter(
      (entry) => entry.method === "session/prompt",
    );
    assert.lengthOf(prompts, 2);
    assert.equal(prompts[0].params.sessionId, prompts[1].params.sessionId);
    assert.deepEqual(roles(chat.getState()), [
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("binds metadata and explicit excerpts to each prompt, including after restoration", async () => {
    use(agent.profile());
    const chat = plugin().chat;
    const paperA = fixturePaper("PAPERA01", "ATTACHA1", 1);
    const paperB = fixturePaper("PAPERB02", "ATTACHB2", 3);
    const quoteA = fixtureExcerpt(paperA, "Excerpt from A", 2);
    const quoteB = fixtureExcerpt(paperB, "Excerpt from B", 6);
    const draft = { paper: paperA, selections: [quoteA] };

    const first = chat.send("slow:200:3", draft);
    await until(() => lastAnswer(chat.getState()).includes("chunk 1"));
    draft.paper = paperB;
    draft.selections.splice(0, 1, quoteB);
    assert.isTrue(await first);
    assert.deepEqual(lastAssistant(chat.getState()).context, {
      paper: paperA,
      selections: [quoteA],
    });

    assert.isTrue(await chat.send("echo:follow up", draft));
    const messages = chat.getState().messages;
    await chat.disconnect();
    await chat.restore();
    assert.deepEqual(chat.getState().messages, messages);
    assert.isTrue(await chat.regenerate(lastAssistant(chat.getState()).id));

    const prompts = (await agent.received())
      .filter((entry) => entry.method === "session/prompt")
      .map((entry) => entry.params.prompt);
    assert.lengthOf(prompts, 3);
    assert.deepEqual(prompts[0][0], { type: "text", text: "slow:200:3" });
    assert.include(prompts[0][1].text, paperA.title);
    assert.include(prompts[0][1].text, paperA.abstract);
    assert.include(prompts[0][2].text, "[p. 3](#page=3)");
    assert.include(prompts[0][3].text, quoteA.text);
    assert.include(prompts[0][3].text, quoteA.uri);
    assert.notInclude(JSON.stringify(prompts[0]), quoteB.text);
    assert.include(prompts[1][1].text, paperB.title);
    assert.include(prompts[1][3].text, quoteB.text);
    assert.include(prompts[1][3].text, quoteB.uri);
    assert.notInclude(JSON.stringify(prompts[1]), quoteA.text);
    assert.deepEqual(prompts[2], prompts[1]);
  });

  it("starts a new session, and an empty transcript, for a new conversation", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    assert.isTrue(await chat.send("echo:old conversation"));
    await chat.newConversation();

    assert.deepEqual(chat.getState().messages, []);
    assert.isTrue(await chat.send("echo:new conversation"));

    assert.equal(count(await agent.received(), "session/new"), 2);
    assert.deepEqual(roles(chat.getState()), ["user", "assistant"]);
    assert.equal(lastAnswer(chat.getState()), "new conversation ");
  });

  it("cancels a streamed turn when clearing and isolates the next session", async () => {
    use(agent.profile());
    const chat = plugin().chat;
    const oldTurn = chat.send("slow:300:20");
    await until(() => lastAnswer(chat.getState()).includes("chunk 1"));

    const clearing = chat.newConversation();
    assert.deepEqual(chat.getState().messages, []);
    await Promise.all([clearing, oldTurn]);

    assert.isTrue(await chat.send("echo:new conversation"));
    assert.deepEqual(roles(chat.getState()), ["user", "assistant"]);
    assert.equal(lastAnswer(chat.getState()), "new conversation ");

    const received = await agent.received();
    const prompts = received.filter(
      (entry) => entry.method === "session/prompt",
    );
    const cancel = received.find((entry) => entry.method === "session/cancel");
    assert.equal(cancel?.params.sessionId, prompts[0].params.sessionId);
    assert.notEqual(prompts[0].params.sessionId, prompts[1].params.sessionId);
  });

  it("ends a process that is still initializing when disconnected", async () => {
    use(agent.profile(["--mode", "hang"]));
    const chat = plugin().chat;
    const connecting = chat.connect();
    await until(async () => count(await agent.received(), "initialize") === 1);
    const pid = (await agent.processes())[0].pid;

    await chat.disconnect();

    assert.isFalse(await connecting);
    assert.equal(chat.getState().connection, "disconnected");
    await until(async () => !(await isAlive(pid)));
    use(agent.profile());
    assert.isTrue(await chat.connect());
  });

  it("sends only one prompt when two sends wait for the same connection", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    const results = await Promise.all([
      chat.send("slow:100:3"),
      chat.send("echo:second"),
    ]);

    assert.deepEqual(results, [true, false]);
    assert.equal(count(await agent.received(), "session/prompt"), 1);
  });

  it("notes when the agent declines to answer", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    assert.isTrue(await chat.send("refuse"));

    assert.equal(lastAssistant(chat.getState()).stopReason, "refusal");
    assert.equal(chat.getState().execution, "idle");
  });
});

describe("stopping a turn", function () {
  this.timeout(60000);

  let agent: FixtureAgent;

  beforeEach(async () => {
    await reset();
    agent = await makeAgent("stop");
  });

  it("stops the turn, drops what still arrives, and lets the next prompt run", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    const sending = chat.send("slow:300:20");
    await until(() => lastAnswer(chat.getState()).includes("chunk 2 "));

    const stopping = chat.stop();
    assert.equal(chat.getState().execution, "cancelling");
    await Promise.all([stopping, sending]);

    // Four chunks at most can have arrived in the time it took to stop.
    assert.equal(lastAnswer(chat.getState()), "chunk 1 chunk 2 ");
    assert.equal(lastAssistant(chat.getState()).stopReason, "cancelled");
    assert.equal(chat.getState().execution, "idle");

    assert.isTrue(await chat.send("echo:after stopping"));
    assert.equal(lastAnswer(chat.getState()), "after stopping ");

    const received = await agent.received();
    assert.equal(count(received, "session/cancel"), 1);
    // The next prompt ran in the same session.
    const prompts = received.filter(
      (entry) => entry.method === "session/prompt",
    );
    assert.equal(prompts[0].params.sessionId, prompts[1].params.sessionId);
  });
});

describe("restoring a session", function () {
  this.timeout(60000);

  let agent: FixtureAgent;

  beforeEach(async () => {
    await reset();
    agent = await makeAgent("restore");
  });

  it("reopens the remembered session when the agent can restore it", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    assert.isTrue(await chat.send("echo:remember this"));
    await chat.disconnect();

    assert.isTrue(chat.getState().canRestore);
    await chat.restore();

    assert.equal(chat.getState().connection, "connected");
    assert.isFalse(chat.getState().canRestore);
    assert.equal(
      lastAnswer(chat.getState()),
      "remember this ",
      "the visible history was preserved",
    );
    assert.deepEqual(roles(chat.getState()), ["user", "assistant"]);

    // What comes next continues that session.
    assert.isTrue(await chat.send("echo:and continue"));
    const received = await agent.received();
    const load = received.find((entry) => entry.method === "session/load");
    const prompts = received.filter(
      (entry) => entry.method === "session/prompt",
    );
    assert.isOk(load, "the agent was asked to restore the session");
    assert.equal(load!.params.sessionId, "fixture-1");
    assert.equal(prompts[1].params.sessionId, load.params.sessionId);
    assert.equal(count(received, "session/new"), 1);
  });

  it("opens a new session without asking when the agent cannot restore it", async () => {
    use(agent.profile(["--capabilities", '{"loadSession":false}']));
    const chat = plugin().chat;

    assert.isTrue(await chat.send("echo:first conversation"));
    await chat.disconnect();

    assert.isFalse(chat.getState().canRestore);
    await chat.restore();
    assert.isTrue(await chat.send("echo:second conversation"));

    const received = await agent.received();
    assert.equal(count(received, "session/load"), 0);
    assert.equal(count(received, "session/new"), 2);
    // The transcript belongs to the new session alone.
    assert.deepEqual(roles(chat.getState()), ["user", "assistant"]);
  });

  it("opens a new session when the agent no longer remembers the old one", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    assert.isTrue(await chat.send("echo:remember this"));
    await chat.disconnect();
    await IOUtils.remove(agent.store);

    await chat.restore();

    assert.equal(chat.getState().connection, "connected");
    assert.deepEqual(chat.getState().messages, []);
    assert.equal(count(await agent.received(), "session/new"), 2);
  });
});

function fixturePaper(
  itemKey: string,
  attachmentKey: string,
  itemID: number,
): PaperContext {
  return {
    itemID,
    itemKey,
    libraryID: 1,
    title: `Paper ${itemKey}`,
    authors: ["A. Author"],
    abstract: `Abstract of ${itemKey}`,
    doi: "",
    year: "2026",
    attachment: {
      itemID: itemID + 1,
      itemKey: attachmentKey,
      uri: `zotero://open-pdf/library/items/${attachmentKey}`,
    },
  };
}

function fixtureExcerpt(
  paper: PaperContext,
  text: string,
  pageIndex: number,
): SelectedText {
  const attachment = paper.attachment!;
  return {
    text,
    itemTitle: paper.title,
    itemKey: paper.itemKey,
    libraryID: paper.libraryID,
    attachmentKey: attachment.itemKey,
    pageIndex,
    pageLabel: String(pageIndex + 1),
    uri: `${attachment.uri}?page=${pageIndex + 1}`,
  };
}

describe("keeping credentials out of sight", function () {
  this.timeout(60000);

  let agent: FixtureAgent;

  beforeEach(async () => {
    await reset();
    agent = await makeAgent("redaction");
  });

  it("masks them in the sidebar's error and in the log, while the agent gets them", async () => {
    use(agent.profile());
    const chat = plugin().chat;

    assert.isTrue(await chat.send("env:SAPIENTIA_TEST_TOKEN"));
    assert.equal(
      JSON.parse(lastAnswer(chat.getState())).env.SAPIENTIA_TEST_TOKEN,
      SECRET,
    );

    assert.isTrue(await chat.send("crash"));

    const shown = formatError(chat.getState().error!);
    assert.include(
      shown,
      "fixture: fatal error",
      "what is useful about the failure stays",
    );
    assert.include(shown, "••••••", "the credential is masked");
    assert.notInclude(shown, SECRET);
    assert.notInclude(pluginLog(), SECRET);
  });
});
