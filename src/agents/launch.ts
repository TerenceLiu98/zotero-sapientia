import { subprocess } from "../acp/subprocess";
import { logWarn } from "../utils/log";
import { UserError } from "../utils/errors";
import type { AgentProfile } from "./profile";

/** Everything needed to start an agent process. */
export interface LaunchSpec {
  /** Absolute path of the executable. */
  command: string;
  args: string[];
  /** The process's whole environment. */
  env: Record<string, string>;
  /** The process's working directory, always set. */
  cwd: string;
}

/** Environment variables that mark a process as part of an enclosing Claude Code session. */
const PARENT_SESSION_VARS = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_CODE_SSE_PORT",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_PID",
  "CLAUDE_EFFORT",
];

/** Anything else that is about the enclosing session rather than the user's own configuration. */
const PARENT_SESSION_PREFIXES = [
  "CLAUDE_CODE_SESSION",
  "CLAUDE_CODE_MESSAGING",
  "CLAUDE_AGENT_SDK",
];

const ENV_MARKER = "__SAPIENTIA_ENV__";
const LOGIN_TIMEOUT_MS = 10000;
const FALLBACK_PATH = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "~/.local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

let baseEnvironmentPromise: Promise<Record<string, string>> | null = null;

/**
 * The environment agents are started in. Zotero launched from the Dock or the
 * Start menu inherits a bare PATH, so the user's login shell is asked for its
 * environment once and that is reused.
 */
export function baseEnvironment(): Promise<Record<string, string>> {
  baseEnvironmentPromise ??= loadBaseEnvironment();
  return baseEnvironmentPromise;
}

async function loadBaseEnvironment(): Promise<Record<string, string>> {
  const process = subprocess().getEnvironment();
  if (Zotero.isWin) {
    return process;
  }

  const login = await loginShellEnvironment();
  const merged = { ...process, ...login };
  if (!login.PATH) {
    const home = process.HOME ?? "";
    merged.PATH = [
      process.PATH,
      ...FALLBACK_PATH.map((dir) => dir.replace("~", home)),
    ]
      .filter(Boolean)
      .join(":");
  }
  for (const name of Object.keys(merged)) {
    if (
      PARENT_SESSION_VARS.includes(name) ||
      PARENT_SESSION_PREFIXES.some((prefix) => name.startsWith(prefix))
    ) {
      delete merged[name];
    }
  }
  return merged;
}

/** The environment of the user's interactive login shell, or {} if it cannot be read. */
async function loginShellEnvironment(): Promise<Record<string, string>> {
  const shell = Services.env.get("SHELL");
  if (!shell) {
    return {};
  }
  try {
    // `-i` as well as `-l`: version managers such as nvm are usually set up in
    // the interactive rc file, which a login shell alone does not read.
    const proc = await subprocess().call({
      command: shell,
      arguments: ["-lic", `printf '\\n${ENV_MARKER}\\n'; /usr/bin/env`],
      environmentAppend: true,
      stderr: "pipe",
    });
    let output = "";
    const read = (async () => {
      for (let chunk; (chunk = await proc.stdout.readString());) {
        output += chunk;
      }
    })();
    const completed = await Promise.race([
      read.then(() => true),
      Zotero.Promise.delay(LOGIN_TIMEOUT_MS).then(() => false),
    ]);
    if (!completed) {
      await proc.kill(0);
      return {};
    }
    // Interactive shells print banners and prompts before the command runs.
    const start = output.lastIndexOf(ENV_MARKER);
    return start === -1
      ? {}
      : parseEnvironment(output.slice(start + ENV_MARKER.length));
  } catch (error) {
    logWarn("Could not read the login shell environment", error);
    return {};
  }
}

function parseEnvironment(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) {
      env[match[1]] = match[2];
    }
  }
  return env;
}

/** The directory agents work in when the profile does not name one. */
export function defaultWorkspace(): string {
  return PathUtils.join(
    (Zotero as unknown as { Profile: { dir: string } }).Profile.dir,
    "sapientia",
  );
}

/**
 * Turns a saved profile into everything needed to start the agent, resolving
 * the executable on the agent's PATH and checking the working directory.
 */
export async function resolveLaunchSpec(
  profile: AgentProfile,
): Promise<LaunchSpec> {
  const env = { ...(await baseEnvironment()), ...profile.env };
  let command: string;
  try {
    command = await subprocess().pathSearch(profile.command, env);
  } catch (error) {
    throw new UserError(
      "launch-command-not-found",
      { command: profile.command },
      { cause: error },
    );
  }

  const cwd = profile.cwd || defaultWorkspace();
  try {
    if (profile.cwd) {
      const stat = await IOUtils.stat(cwd);
      if (stat.type !== "directory") {
        throw new Error("not a directory");
      }
    } else {
      await IOUtils.makeDirectory(cwd, { ignoreExisting: true });
    }
  } catch (error) {
    throw new UserError(
      "launch-workdir-invalid",
      { path: cwd },
      { cause: error },
    );
  }

  return { command, args: profile.args, env, cwd };
}
