import { redactor } from "./log";

/**
 * Web platform constructors the plugin's bootstrap sandbox does not expose,
 * which the ACP SDK relies on. They are borrowed from Zotero's main window and
 * installed as plugin globals. The SDK only touches them inside functions, so
 * this has to run before the first connection, not before the plugin loads.
 */
const BORROWED = [
  "ReadableStream",
  "WritableStream",
  "MessageChannel",
  "AbortController",
] as const;

/**
 * Gives the plugin's scope the globals it lacks. It runs before anything in
 * the plugin uses them: Zotero's own startup has to be over first, because
 * the borrowed constructors belong to its main window.
 */
export function installGlobals(): void {
  const mainWindow = Zotero.getMainWindow();
  for (const name of BORROWED) {
    if (!(name in _globalThis)) {
      _globalThis[name] = mainWindow[name];
    }
  }
  // The SDK reports a message it had to drop through `console`, so without
  // one here, that report would itself throw and take the connection down.
  if (!("console" in _globalThis)) {
    const write =
      (level: number) =>
      (...args: unknown[]) =>
        Zotero.debug(
          redactor.redact(`[sapientia] ${args.map(describe).join(" ")}`),
          level,
        );
    _globalThis.console = {
      error: write(1),
      warn: write(3),
      info: write(5),
      log: write(5),
      debug: write(5),
    };
  }
}

function describe(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
