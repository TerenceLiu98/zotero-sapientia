#!/usr/bin/env node
/**
 * A deterministic ACP agent for the tests.
 *
 * It speaks Agent Client Protocol over stdio with hand-written JSON-RPC, and
 * does not depend on the SDK, so it checks the plugin's side of the protocol
 * independently. What it receives is appended to the file named by `--log`,
 * which is how a test checks what the plugin really sent.
 *
 *   --log <file>          append every request it receives, as JSON lines
 *   --store <file>        saved sessions, as JSON, so that they survive a restart
 *   --capabilities <json> agent capabilities to advertise (default: loadSession)
 *   --mode <name>         normal | init-fail | bad-protocol | hang | ignore-eof
 *
 * A prompt chooses the turn by its first word:
 *
 *   echo:<text>           stream the text in three chunks
 *   think:<text>          a thought chunk, a tool call, then the text
 *   slow:<ms>:<count>     one chunk every <ms>, honouring cancellation
 *   crash                 exit with code 3 after a first chunk
 *   fail:<message>        answer the prompt with a protocol error
 *   refuse                end the turn with stopReason "refusal"
 *   spawn-child           start a child process that must not outlive the agent
 *   spawn-stubborn-child  start a child process that ignores SIGTERM
 *   env:<name>            report the working directory and the named variable
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  appendFileSync,
  closeSync,
  existsSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};

const logPath = arg("log");
const storePath = arg("store");
const capabilities = JSON.parse(arg("capabilities", '{"loadSession":true}'));
const mode = arg("mode", "normal");
const offersModels = argv.includes("--models");
const modelConfig = (currentValue = "fast") => [
  {
    id: "fixture-model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue,
    options: [
      {
        group: "fixture",
        name: "Fixture",
        options: [
          { value: "fast", name: "Fixture Fast" },
          {
            value: "careful",
            name: "Fixture Careful Research Model with Extended Reasoning",
          },
        ],
      },
    ],
  },
];
const STORE_VERSION = 1;

let sessionCounter = 0;
/** The turn that is running, if any. */
let turn = null;

// Written synchronously, so that nothing is lost when the agent exits.
const send = (message) => writeSync(1, `${JSON.stringify(message)}\n`);
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const refuse = (id, code, message) =>
  send({ jsonrpc: "2.0", id, error: { code, message } });
const update = (sessionId, value) =>
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update: value },
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(entry) {
  if (logPath) {
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  }
}

function readStore() {
  try {
    return JSON.parse(readFileSync(storePath, "utf8")).sessions;
  } catch {
    return {};
  }
}

function writeStore(sessions) {
  if (storePath) {
    writeFileSync(
      storePath,
      JSON.stringify({ version: STORE_VERSION, sessions }),
    );
  }
}

/** What a test may check without reading the whole environment. */
function describeProcess() {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("SAPIENTIA_")) {
      env[name] = value;
    }
  }
  return {
    pid: process.pid,
    cwd: process.cwd(),
    argv,
    env,
    insideClaudeCode: Boolean(process.env.CLAUDECODE),
  };
}

/** An update that belongs to the transcript, stored so that a session can be replayed. */
function record(session, value) {
  session.updates.push(value);
  const sessions = readStore();
  sessions[session.sessionId] = session;
  writeStore(sessions);
}

async function readCurrentPaper(server, turnId) {
  const headers = Object.fromEntries(
    server.headers.map(({ name, value }) => [name, value]),
  );
  async function request(id, method, params) {
    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        ...headers,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(5000),
    });
    return id === undefined ? response.status : (await response.json()).result;
  }
  const initialized = await request(1, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "fixture", version: "1.0.0" },
  });
  if (!initialized?.capabilities.tools)
    throw new Error("MCP did not offer tools");
  if ((await request(undefined, "notifications/initialized")) !== 202)
    throw new Error("MCP did not accept initialization");
  const catalog = await request(2, "tools/list");
  if (!catalog?.tools.some(({ name }) => name === "read_current_paper"))
    throw new Error("MCP did not list the PDF reader");
  return request(3, "tools/call", {
    name: "read_current_paper",
    arguments: { turnId },
  });
}

async function runTurn(id, session, prompt) {
  const text = prompt.find((block) => block.type === "text")?.text ?? "";
  const [, command, ...rest] = /^([\w-]+)(?::(.*))?$/.exec(text) ?? [];
  const say = (value) => {
    update(session.sessionId, value);
    record(session, value);
  };
  const chunk = (value) =>
    say({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: value },
    });
  const end = (stopReason) => reply(id, { stopReason });

  record(session, {
    sessionUpdate: "user_message_chunk",
    content: { type: "text", text },
  });
  switch (command) {
    case "echo": {
      const words = rest[0].split(" ");
      for (const word of words) {
        await sleep(30);
        if (turn.cancelled) return end("cancelled");
        chunk(`${word} `);
      }
      return end("end_turn");
    }
    case "think":
    case "think-slow": {
      say({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "Thinking about it." },
      });
      say({
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        title: "Reading the paper",
        status: "pending",
      });
      if (command === "think-slow") await sleep(1200);
      await sleep(20);
      say({
        sessionUpdate: "tool_call_update",
        toolCallId: "t1",
        title: "Reading the paper",
        status: "in_progress",
      });
      await sleep(20);
      say({
        sessionUpdate: "tool_call_update",
        toolCallId: "t1",
        status: "completed",
      });
      chunk(rest[0]);
      if (command === "think-slow") await sleep(600);
      return end("end_turn");
    }
    case "slow": {
      const [interval, count] = rest[0].split(":").map(Number);
      for (let index = 1; index <= count; index++) {
        await sleep(interval);
        if (turn.cancelled) {
          // A badly behaved agent keeps talking after it was cancelled.
          await sleep(60);
          update(session.sessionId, {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "late chunk " },
          });
          return end("cancelled");
        }
        chunk(`chunk ${index} `);
      }
      return end("end_turn");
    }
    case "cite": {
      chunk("**Result**\n\n");
      const switched = join(process.cwd(), "paper-switched");
      for (let step = 0; step < 150 && !existsSync(switched); step++) {
        await sleep(50);
        if (turn.cancelled) return end("cancelled");
      }
      if (!existsSync(switched)) throw new Error("Reader did not switch PDFs");
      const metadata = prompt.find((block) =>
        block.text?.startsWith("Current Zotero paper (metadata):\n"),
      );
      const { pdfTool } = JSON.parse(metadata.text.split("\n", 2)[1]);
      const { turnId } = pdfTool;
      session.previousPdfTurnId = turnId;
      const result = await readCurrentPaper(session.mcpServers[0], turnId);
      log({ event: "pdf-text", result });
      if (turn.cancelled) return end("cancelled");
      chunk(
        "[A long citation label for the specific source passage on page 2](#page=2)\n\n```text\nSource citation\n```",
      );
      return end("end_turn");
    }
    case "recall": {
      const stale = await readCurrentPaper(
        session.mcpServers[0],
        session.previousPdfTurnId,
      );
      log({ event: "stale-pdf-text", result: stale });
      const cited = session.updates.some((update) =>
        update.content?.text?.includes("Source citation"),
      );
      chunk(cited ? "Earlier result: Source citation" : "No earlier result");
      return end("end_turn");
    }
    case "remote": {
      const response = await fetch(arg("remote-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prompt),
      });
      chunk(await response.text());
      return end("end_turn");
    }
    case "crash": {
      chunk("before the crash ");
      await sleep(40);
      // What an agent prints when it dies: something useful, and a credential.
      writeSync(
        2,
        `fixture: fatal error, token ${process.env.SAPIENTIA_TEST_TOKEN ?? "none"}\n`,
      );
      process.exit(3);
    }
    case "fail":
      return refuse(id, -32603, rest[0]);
    case "refuse":
      return end("refusal");
    case "close-stdout": {
      end("end_turn");
      closeSync(1);
      return;
    }
    case "spawn-child": {
      const child = spawn("sleep", ["600"], { stdio: "ignore" });
      log({ event: "child", pid: child.pid });
      child.unref();
      return end("end_turn");
    }
    case "spawn-stubborn-child": {
      const child = spawn(
        process.execPath,
        [
          "-e",
          'process.on("SIGTERM", () => {}); setInterval(() => {}, 60000); process.stdout.write("ready");',
        ],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      log({ event: "child", pid: child.pid });
      await once(child.stdout, "data");
      child.stdout.destroy();
      child.unref();
      return end("end_turn");
    }
    case "env":
      chunk(
        JSON.stringify({
          cwd: process.cwd(),
          env: rest[0]
            ? { [rest[0]]: process.env[rest[0]] ?? null }
            : undefined,
          argv: process.argv.slice(1),
          pid: process.pid,
        }),
      );
      return end("end_turn");
    default:
      chunk(`You said: ${text}`);
      return end("end_turn");
  }
}

async function handle(message) {
  if (message.id === undefined) {
    log({ ...message });
    if (message.method === "session/cancel" && turn) {
      turn.cancelled = true;
    }
    return;
  }
  log({
    ...message,
    process: message.method === "initialize" ? describeProcess() : undefined,
  });
  const { id, method, params } = message;

  switch (method) {
    case "initialize":
      if (mode === "hang") return;
      if (mode === "init-fail")
        return refuse(id, -32603, "fixture: initialize refused");
      if (mode === "bad-protocol") return reply(id, { protocolVersion: 99 });
      return reply(id, {
        protocolVersion: 1,
        agentCapabilities: capabilities,
        agentInfo: { name: "fixture-agent", version: "1.0.0" },
      });
    case "session/new": {
      const sessions = readStore();
      let sessionId;
      do {
        sessionId = `fixture-${++sessionCounter}`;
      } while (Object.hasOwn(sessions, sessionId));
      sessions[sessionId] = {
        sessionId,
        cwd: params.cwd,
        mcpServers: params.mcpServers,
        updates: [],
      };
      writeStore(sessions);
      return reply(id, {
        sessionId,
        ...(offersModels ? { configOptions: modelConfig() } : {}),
      });
    }
    case "session/load": {
      const session = readStore()[params.sessionId];
      if (!session) return refuse(id, -32002, "session not found");
      for (const value of session.updates) {
        update(params.sessionId, value);
      }
      return reply(
        id,
        offersModels ? { configOptions: modelConfig(session.model) } : {},
      );
    }
    case "session/set_config_option": {
      const sessions = readStore();
      const session = sessions[params.sessionId];
      if (!session || !offersModels || params.configId !== "fixture-model")
        return refuse(id, -32602, "unknown model option");
      session.model = params.value;
      writeStore(sessions);
      return reply(id, { configOptions: modelConfig(session.model) });
    }
    case "session/prompt": {
      const sessions = readStore();
      const session = sessions[params.sessionId];
      if (!session) return refuse(id, -32002, "session not found");
      turn = { cancelled: false };
      try {
        await runTurn(id, session, params.prompt);
      } finally {
        turn = null;
      }
      return;
    }
    default:
      return refuse(id, -32601, `fixture: unknown method ${method}`);
  }
}

createInterface({ input: process.stdin })
  .on("line", (line) => {
    if (line.trim()) {
      const message = JSON.parse(line);
      void handle(message).catch((error) =>
        refuse(message.id ?? null, -32603, String(error)),
      );
    }
  })
  .on("close", () => {
    if (mode !== "ignore-eof") {
      process.exit(0);
    }
  });
