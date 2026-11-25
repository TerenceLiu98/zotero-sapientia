import type { LaunchSpec } from "../agents/launch";
import type { FromAgent, ToAgent } from "./types";
import { UserError } from "../utils/errors";
import { runHelper, subprocess, type GeckoProcess } from "./subprocess";

/** An agent process connected to the plugin over its standard streams. */
export interface AgentProcess {
  readonly pid: number;
  /** Bytes written here reach the agent's stdin. */
  readonly stdin: ToAgent;
  /** Bytes the agent writes to stdout, ending when the agent closes it. */
  readonly stdout: FromAgent;
  /** Resolves with the exit code; a negative code means the agent was signalled. */
  readonly exited: Promise<number>;
  /** The last few kilobytes the agent wrote to stderr, for diagnostics. */
  stderrTail(): string;
  /** Ends the agent and every process it started, and waits for it to be gone. */
  terminate(): Promise<void>;
}

/** How long an agent gets to exit on its own once its stdin is closed. */
const EXIT_GRACE_MS = 2000;
/** How long a signalled agent gets to exit before it is killed. */
const TERM_GRACE_MS = 1000;
const STDERR_TAIL_CHARS = 4096;

class GeckoAgentProcess implements AgentProcess {
  readonly pid: number;
  readonly stdin: ToAgent;
  readonly stdout: FromAgent;
  readonly exited: Promise<number>;

  private readonly decoder = new TextDecoder();
  private rootExited = false;
  private stderr = "";

  constructor(private readonly raw: GeckoProcess) {
    this.pid = raw.pid;
    this.exited = raw
      .wait()
      .then(
        ({ exitCode }) => exitCode,
        () => -1,
      )
      .finally(() => {
        this.rootExited = true;
      });
    void this.collectStderr();

    this.stdout = new ReadableStream({
      pull: async (controller: ReadableStreamDefaultController) => {
        try {
          const chunk = await raw.stdout.read();
          if (chunk.byteLength === 0) {
            controller.close();
          } else {
            controller.enqueue(new Uint8Array(chunk));
          }
        } catch (error) {
          controller.error(error);
        }
      },
    }) as unknown as FromAgent;

    this.stdin = new WritableStream({
      // The pipe takes a string and encodes it itself, which keeps buffer
      // ownership inside Gecko's subprocess module.
      write: async (chunk: Uint8Array) => {
        await raw.stdin.write(this.decoder.decode(chunk));
      },
    }) as unknown as ToAgent;
  }

  stderrTail(): string {
    return this.stderr.trim();
  }

  async terminate(): Promise<void> {
    if (this.rootExited) {
      return;
    }
    if (Zotero.isWin) {
      // taskkill can traverse the tree only while the agent still owns it.
      const taskkill = PathUtils.join(
        Services.env.get("SystemRoot") || "C:\\Windows",
        "System32",
        "taskkill.exe",
      );
      await runHelper(taskkill, ["/PID", String(this.pid), "/T", "/F"], {});
      await this.killRoot(0);
      return;
    }

    // Collect the tree before closing stdin, which can make the agent exit
    // and reparent any children it leaves behind.
    const children = await descendantsOf(this.pid);
    void this.raw.stdin.close(true).catch(() => {});
    const exited = await this.waitForExit(EXIT_GRACE_MS);
    await Promise.all([
      exited ? Promise.resolve() : this.killRoot(TERM_GRACE_MS),
      stopDescendants(children),
    ]);
  }

  private async killRoot(timeout: number): Promise<void> {
    // Gecko identifies the agent by its process handle.
    void this.raw.kill(timeout).catch(() => {});
    await this.waitForExit(timeout + 500);
  }

  private async waitForExit(ms: number): Promise<boolean> {
    return Promise.race([
      this.exited.then(() => true),
      Zotero.Promise.delay(ms).then(() => false),
    ]);
  }

  private async collectStderr(): Promise<void> {
    try {
      for (let chunk; (chunk = await this.raw.stderr.readString());) {
        this.stderr = (this.stderr + chunk).slice(-STDERR_TAIL_CHARS);
      }
    } catch {
      // The pipe closed, which happens whenever the agent is terminated.
    }
  }
}

export async function launchProcess(spec: LaunchSpec): Promise<AgentProcess> {
  let raw: GeckoProcess;
  try {
    raw = await subprocess().call({
      command: spec.command,
      arguments: spec.args,
      environment: spec.env,
      workdir: spec.cwd,
      stderr: "pipe",
    });
  } catch (error) {
    throw new UserError(
      "process-launch-failed",
      { detail: describe(error) },
      { cause: error },
    );
  }
  return new GeckoAgentProcess(raw);
}

interface ProcessEntry {
  pid: number;
  parent: number;
  state: string;
  startedAt: string;
}

async function readProcessTable(): Promise<Map<number, ProcessEntry>> {
  const output = await runHelper(
    "/bin/ps",
    ["-ax", "-o", "pid=,ppid=,stat=,lstart="],
    { LC_ALL: "C" },
  );
  const entries = new Map<number, ProcessEntry>();
  for (const line of output.split("\n")) {
    const match = /^\s*([1-9]\d*)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    if (match) {
      const pid = Number(match[1]);
      entries.set(pid, {
        pid,
        parent: Number(match[2]),
        state: match[3],
        startedAt: match[4],
      });
    }
  }
  return entries;
}

async function descendantsOf(pid: number): Promise<ProcessEntry[]> {
  const entries = await readProcessTable();
  const children = new Map<number, ProcessEntry[]>();
  for (const entry of entries.values()) {
    const siblings = children.get(entry.parent) ?? [];
    siblings.push(entry);
    children.set(entry.parent, siblings);
  }
  const descendants = (parent: number): ProcessEntry[] =>
    (children.get(parent) ?? []).flatMap((entry) => [
      ...descendants(entry.pid),
      entry,
    ]);
  return descendants(pid);
}

async function stopDescendants(children: ProcessEntry[]): Promise<void> {
  if (!children.length) {
    return;
  }
  const live = await surviving(children);
  if (!live.length) {
    return;
  }
  await runHelper("/bin/kill", ["-TERM", ...live.map(String)], {});

  const deadline = Date.now() + TERM_GRACE_MS;
  let remaining = await surviving(children);
  while (remaining.length && Date.now() < deadline) {
    await Zotero.Promise.delay(50);
    remaining = await surviving(children);
  }
  if (remaining.length) {
    await runHelper("/bin/kill", ["-KILL", ...remaining.map(String)], {});
  }
}

async function surviving(children: ProcessEntry[]): Promise<number[]> {
  const entries = await readProcessTable();
  return children
    .filter(({ pid, startedAt }) => {
      const entry = entries.get(pid);
      // A reaped child's PID can be reused by an unrelated process.
      return entry?.startedAt === startedAt && !entry.state.startsWith("Z");
    })
    .map(({ pid }) => pid);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
