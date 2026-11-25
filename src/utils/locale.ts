import { config } from "../../package.json";
import type { FluentMessageId } from "../../typings/i10n";

/** An id in the plugin's locale files. */
export type MessageId = FluentMessageId;

let localization: Localization | null = null;

/** Loads the plugin's strings for Zotero's current locale. */
export function initLocale(): void {
  localization = new Localization([`${config.addonRef}-addon.ftl`], true);
}

/** Looks a string up in the plugin's locale files; the id is returned when it is missing. */
export function getString(
  id: MessageId,
  args?: Record<string, string | number>,
): string {
  const key = `${config.addonRef}-${id}`;
  const value = localization?.formatValueSync(key, args);
  if (value != null) return value;

  // A temporary add-on can start before Zotero refreshes its Fluent sources.
  initLocale();
  return localization?.formatValueSync(key, args) ?? id;
}
