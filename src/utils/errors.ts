import type { FluentMessageId } from "../../typings/i10n";
import { getString } from "./locale";

/**
 * A failure the user can act on. `key` names the Fluent message that explains
 * it and `params` fills that message's placeholders, so the wording of an
 * error lives in the locale files and can be localized. A `detail` param is
 * shown below the message instead of inside it.
 */
export class UserError extends Error {
  readonly key: FluentMessageId;
  readonly params: Record<string, string | number>;

  constructor(
    key: FluentMessageId,
    params: Record<string, string | number> = {},
    options?: { cause?: unknown },
  ) {
    super(key, options);
    this.name = "UserError";
    this.key = key;
    this.params = params;
  }
}

/** The failure as the user reads it: the localized message, then its detail. */
export function formatError(error: UserError): string {
  const { detail, ...args } = error.params;
  const message = getString(error.key, args);
  return detail ? `${message}\n\n${detail}` : message;
}
