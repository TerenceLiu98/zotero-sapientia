import { assert } from "chai";
import { config } from "../package.json";
import type { AgentProfile } from "../src/agents/profile";
import { saveProfiles, setDefaultProfileId } from "../src/agents/store";
import type { ChatState } from "../src/chat/controller";

export const ADDON_ID: string = config.addonID;
export const PREFS_PANE_ID = `${config.addonRef}-prefs`;

/** A credential the tests give the agent, recognizable wherever it turns up. */
export const SECRET = "sapiEntia-secret-token-4711";

const HTML_NS = "http://www.w3.org/1999/xhtml";

/** The plugin under test, as `addon/bootstrap.js` reaches it. */
export function plugin(): NonNullable<typeof Zotero.Sapientia> {
  assert.isOk(Zotero.Sapientia, "the plugin is running");
  return Zotero.Sapientia!;
}

export interface FixtureAgent {
  /** The directory the agent runs in. Its name contains spaces on purpose. */
  readonly dir: string;
  readonly script: string;
  readonly log: string;
  readonly store: string;
  /** A profile that starts the agent, with these extra arguments. */
  profile(args?: string[], overrides?: Partial<AgentProfile>): AgentProfile;
  /** Everything the agent has received so far. */
  received(): Promise<Record<string, any>[]>;
  /** What a running instance reported about itself when it started. */
  processes(): Promise<Record<string, any>[]>;
}

/** Copies the fixture agent to a fresh directory. */
export async function makeAgent(name: string): Promise<FixtureAgent> {
  const parent = Zotero.getTempDirectory().clone();
  parent.normalize();
  const dir = await IOUtils.createUniqueDirectory(
    parent.path,
    `sapientia test ${name}`,
  );
  const script = PathUtils.join(dir, "fixture agent.mjs");
  await IOUtils.copy(Services.env.get("SAPIENTIA_TEST_FIXTURE_AGENT")!, script);
  const log = PathUtils.join(dir, "received.jsonl");
  const store = PathUtils.join(dir, "sessions.json");

  /** Everything the agent has received so far. */
  async function received(): Promise<Record<string, any>[]> {
    let text = "";
    try {
      text = await IOUtils.readUTF8(log);
    } catch {
      // The agent has not written anything yet.
    }
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  const agent: FixtureAgent = {
    dir,
    script,
    log,
    store,
    profile(args = [], overrides = {}) {
      return {
        id: "fixture",
        name: "Fixture Agent",
        command: Services.env.get("SAPIENTIA_TEST_NODE") || "node",
        args: [script, "--log", log, "--store", store, ...args],
        env: { SAPIENTIA_TEST_TOKEN: SECRET },
        cwd: dir,
        ...overrides,
      };
    },
    received,
    /** What each instance reported about itself when it started. */
    async processes() {
      return (await received())
        .filter((entry) => entry.process)
        .map((entry) => ({ ...entry.process, method: entry.method }));
    },
  };
  agents.push(agent);
  return agent;
}

/** Every agent a test has made, so that a failed test leaves no process behind. */
const agents: FixtureAgent[] = [];

afterEach(async function () {
  this.timeout(10000);
  // Only processes the fixture agents reported are touched: never a process
  // found by name, which could be the Zotero the user has open.
  const pids = new Set<number>();
  for (const agent of agents.splice(0)) {
    for (const entry of await agent.received()) {
      if (entry.process?.pid) {
        pids.add(entry.process.pid as number);
      }
      if (entry.event === "child" && entry.pid) {
        pids.add(entry.pid as number);
      }
    }
  }
  for (const pid of pids) {
    if (await isAlive(pid)) {
      await kill(pid);
    }
  }
});

async function kill(pid: number): Promise<void> {
  const proc = await ChromeUtils.importESModule(
    "resource://gre/modules/Subprocess.sys.mjs",
  ).Subprocess.call({
    command: "/bin/sh",
    arguments: ["-c", 'kill -KILL "$1"', "sh", String(pid)],
  });
  await proc.wait();
}

/** Makes a profile the agent a conversation talks to. */
export function use(profile: AgentProfile): void {
  saveProfiles([profile]);
  setDefaultProfileId(profile.id);
}

/** Ends any conversation and forgets the saved agents. */
export async function reset(): Promise<void> {
  await plugin().chat.shutdown();
  saveProfiles([]);
  setDefaultProfileId("");
}

/** Polls `condition`, which may return anything truthy, such as a found element. */
export async function until(
  condition: () => unknown | Promise<unknown>,
  { timeout = 15000, step = 50 } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for a condition");
    }
    await Zotero.Promise.delay(step);
  }
}

/** Whether a process with this id is running. */
export async function isAlive(pid: number): Promise<boolean> {
  const proc = await ChromeUtils.importESModule(
    "resource://gre/modules/Subprocess.sys.mjs",
  ).Subprocess.call({
    command: "/bin/sh",
    arguments: ["-c", 'kill -0 "$1" 2>/dev/null', "sh", String(pid)],
  });
  return (await proc.wait()).exitCode === 0;
}

/** The text of every assistant message, in order. */
export function answers(state: ChatState): string[] {
  return state.messages
    .filter((message) => message.role === "assistant")
    .map((message) =>
      message.role === "assistant"
        ? message.blocks
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("")
        : "",
    );
}

export function lastAnswer(state: ChatState): string {
  return answers(state).at(-1) ?? "";
}

type AssistantMessage = Extract<
  ChatState["messages"][number],
  { role: "assistant" }
>;

/** The last message, which must be an assistant's. */
export function lastAssistant(state: ChatState): AssistantMessage {
  const last = state.messages.at(-1);
  assert.equal(last?.role, "assistant");
  return last as AssistantMessage;
}

/** Who sent each message of the transcript, in order. */
export function roles(state: ChatState): string[] {
  return state.messages.map((message) => message.role);
}

/** How many of the received entries have this method. */
export function count(entries: Record<string, any>[], method: string): number {
  return entries.filter((entry) => entry.method === method).length;
}

// Zotero only keeps its debug log for `pluginLog()` to read once this is set,
// so it is set while the test files load, before any test runs.
Zotero.Prefs.set("debug.store", true);

/** What the plugin has written to Zotero's debug log. */
export function pluginLog(): string {
  const log: string = Zotero.Debug.get();
  return log
    .split("\n")
    .filter((line) => line.includes("[sapientia]"))
    .join("\n");
}

/** The window of the Zotero main window's document. */
export function mainWindow(): Window {
  return Zotero.getMainWindow()!;
}

/** A place in the main window to build interface pieces in. */
export function scratch(): HTMLElement {
  const doc = mainWindow().document;
  const container = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  container.style.cssText =
    "position:fixed;inset:40px auto auto 40px;width:320px;z-index:9999";
  doc.documentElement!.append(container);
  return container;
}

/** The chat sections the plugin has registered with Zotero. */
export function chatSections(): { paneID: string }[] {
  const manager = Zotero.ItemPaneManager as unknown as {
    customSectionData: { options: { pluginID: string; paneID: string }[] };
  };
  return manager.customSectionData.options.filter(
    (option) => option.pluginID === ADDON_ID,
  );
}

/** The id the plugin's chat section is registered under. */
export function chatPaneID(): string {
  const [section] = chatSections();
  assert.isOk(section, "the chat section is registered");
  return section!.paneID;
}
