import { Redactor } from "../agents/secrets";

/** Every line the plugin writes goes through here, so secrets never reach the log. */
export const redactor = new Redactor();

/** Logs a diagnostic detail (Zotero debug level 5). */
export function logDebug(message: string): void {
  Zotero.debug(`[sapientia] ${redactor.redact(message)}`);
}

/** Logs something that went wrong without stopping the plugin (level 3). */
export function logWarn(message: string, error?: unknown): void {
  write(3, message, error);
}

/** Logs a failure (level 1). */
export function logError(message: string, error?: unknown): void {
  write(1, message, error);
}

function write(level: number, message: string, error: unknown): void {
  let detail = "";
  if (error instanceof Error) {
    detail = `${error.name}: ${error.message}`;
    if (error.cause instanceof Error) {
      detail += `\n  caused by ${error.cause.name}: ${error.cause.message}`;
    }
  } else if (error !== undefined) {
    detail = String(error);
  }
  Zotero.debug(
    redactor.redact(`[sapientia] ${message}${detail ? `\n  ${detail}` : ""}`),
    level,
  );
}
