/** A saved agent the user can talk to. */
export interface AgentProfile {
  /** Stable id, which the default selection refers to. */
  id: string;
  /** Name shown in the interface. */
  name: string;
  /** The agent's executable, as an absolute path or a name looked up on PATH. */
  command: string;
  /** Arguments passed to the executable, one per boundary. */
  args: string[];
  /** Environment variables added to the agent's environment. */
  env: Record<string, string>;
  /** Working directory, or "" to use the plugin's workspace. */
  cwd: string;
}

export type ProfileField = "name" | "command" | "args" | "env" | "cwd";

/** A profile value that cannot be used; `field` names the offending one. */
export class ProfileError extends Error {
  readonly field: ProfileField;

  constructor(field: ProfileField, detail: string) {
    super(`${field}: ${detail}`);
    this.name = "ProfileError";
    this.field = field;
  }
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Gecko's subprocess arguments and paths must reject embedded control bytes.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\0-\x1f\x7f]/;

export function newProfileId(): string {
  return Zotero.Utilities.randomString(8);
}

/**
 * Splits a command line into arguments the way a POSIX shell splits words:
 * whitespace separates, single and double quotes group, and a backslash
 * escapes the next character. Nothing is expanded, so `$HOME` and `~` are
 * passed on as typed.
 *
 * @throws {ProfileError} on an unterminated quote or a trailing backslash.
 */
export function parseArgs(text: string): string[] {
  const args: string[] = [];
  let current = "";
  let started = false;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }
    } else if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (
        char === "\\" &&
        i + 1 < text.length &&
        /["\\]/.test(text[i + 1])
      ) {
        current += text[++i];
      } else {
        current += char;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === "\\") {
      if (i + 1 >= text.length) {
        throw new ProfileError("args", "trailing backslash");
      }
      current += text[++i];
      started = true;
    } else if (/\s/.test(char)) {
      if (started) {
        args.push(current);
        current = "";
        started = false;
      }
    } else {
      current += char;
      started = true;
    }
  }

  if (quote) {
    throw new ProfileError(
      "args",
      `unterminated ${quote === "'" ? "single" : "double"} quote`,
    );
  }
  if (started) {
    args.push(current);
  }
  return args;
}

/** Quotes an argument so that `parseArgs` reads it back unchanged. */
export function formatArg(arg: string): string {
  if (arg === "") {
    return "''";
  }
  if (!/[\s'"\\]/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function formatArgs(args: string[]): string {
  return args.map(formatArg).join(" ");
}

export function isValidEnvName(name: string): boolean {
  return ENV_NAME.test(name);
}

/**
 * Checks a profile as it is about to be saved or launched.
 *
 * @throws {ProfileError} on the first invalid field.
 */
export function parseProfile(value: unknown): AgentProfile {
  const raw = (value ?? {}) as Partial<AgentProfile>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const command = typeof raw.command === "string" ? raw.command.trim() : "";
  const args = Array.isArray(raw.args) ? raw.args : [];
  const env = raw.env && typeof raw.env === "object" ? raw.env : {};
  const cwd = typeof raw.cwd === "string" ? raw.cwd.trim() : "";

  if (!name) {
    throw new ProfileError("name", "required");
  }
  if (!command || CONTROL_CHARS.test(command)) {
    throw new ProfileError("command", "required");
  }
  for (const arg of args) {
    if (typeof arg !== "string" || CONTROL_CHARS.test(arg)) {
      throw new ProfileError(
        "args",
        "arguments must be strings without control characters",
      );
    }
  }
  for (const [key, val] of Object.entries(env)) {
    if (
      !isValidEnvName(key) ||
      typeof val !== "string" ||
      CONTROL_CHARS.test(val)
    ) {
      throw new ProfileError("env", `invalid entry ${key}`);
    }
  }
  if (CONTROL_CHARS.test(cwd)) {
    throw new ProfileError("cwd", "control characters");
  }

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newProfileId(),
    name,
    command,
    args: [...args],
    env: { ...env },
    cwd,
  };
}
