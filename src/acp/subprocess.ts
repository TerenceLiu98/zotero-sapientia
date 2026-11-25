/**
 * The parts of Gecko's `Subprocess.sys.mjs` that the plugin uses.
 * https://searchfox.org/mozilla-esr140/source/toolkit/modules/subprocess/Subprocess.sys.mjs
 */
export interface GeckoPipeReader {
  /** Resolves with the next bytes, or an empty buffer at end of file. */
  read(): Promise<ArrayBuffer>;
  /** Resolves with the next chunk, or "" at end of file. */
  readString(): Promise<string>;
}

export interface GeckoPipeWriter {
  write(data: string | ArrayBuffer): Promise<{ bytesWritten: number }>;
  close(force?: boolean): Promise<void>;
}

export interface GeckoProcess {
  readonly pid: number;
  readonly stdin: GeckoPipeWriter;
  readonly stdout: GeckoPipeReader;
  readonly stderr: GeckoPipeReader;
  /** Resolves once the process has exited; a negative code means it was signalled. */
  wait(): Promise<{ exitCode: number }>;
  kill(timeout?: number): Promise<{ exitCode: number }>;
}

export interface GeckoCallOptions {
  command: string;
  arguments?: string[];
  /** `null` values remove the variable; without `environmentAppend` this is the whole environment. */
  environment?: Record<string, string | null>;
  environmentAppend?: boolean;
  workdir?: string;
  stderr?: "ignore" | "stdout" | "pipe";
}

export interface Subprocess {
  ERROR_BAD_EXECUTABLE: number;
  call(options: GeckoCallOptions): Promise<GeckoProcess>;
  getEnvironment(): Record<string, string>;
  pathSearch(
    command: string,
    environment?: Record<string, string>,
  ): Promise<string>;
}

export function subprocess(): Subprocess {
  return ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs")
    .Subprocess as Subprocess;
}

/** Runs a short helper to completion and returns what it wrote to stdout. */
export async function runHelper(
  command: string,
  args: string[],
  environment: Record<string, string>,
): Promise<string> {
  try {
    const proc = await subprocess().call({
      command,
      arguments: args,
      environment,
      stderr: "ignore",
    });
    const read = async () => {
      let output = "";
      for (let chunk; (chunk = await proc.stdout.readString());) {
        output += chunk;
      }
      await proc.wait();
      return output;
    };
    const result = await Promise.race([
      read(),
      Zotero.Promise.delay(500).then(() => null),
    ]);
    if (result === null) {
      void proc.kill(0).catch(() => {});
    }
    return result ?? "";
  } catch {
    return "";
  }
}
