import { config } from "../../../package.json";

const SHORTCUT_PREF = `${config.prefsPrefix}.selectionShortcut`;
const PROMPT_PREF = `${config.prefsPrefix}.selectionPrompt`;
export const DEFAULT_SELECTION_PROMPT = "Translate this to {language}";

export function getSelectionShortcut(): string {
  return (Zotero.Prefs.get(SHORTCUT_PREF, true) as string) ?? "";
}

export function setSelectionShortcut(value: string): void {
  Zotero.Prefs.set(SHORTCUT_PREF, value, true);
}

export function getSelectionPrompt(): string {
  const value = Zotero.Prefs.get(PROMPT_PREF, true) as string | undefined;
  return value?.trim() ? value : DEFAULT_SELECTION_PROMPT;
}

export function setSelectionPrompt(value: string): void {
  Zotero.Prefs.set(PROMPT_PREF, value, true);
}

export function selectionShortcutKey(event: KeyboardEvent): string {
  if (
    !event.key ||
    event.isComposing ||
    [
      "Alt",
      "AltGraph",
      "Control",
      "Meta",
      "Shift",
      "Dead",
      "Unidentified",
      "Escape",
      "Tab",
    ].includes(event.key)
  )
    return "";
  const key = event.key === " " ? "Space" : event.key.toUpperCase();
  return [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Meta",
    key,
  ]
    .filter(Boolean)
    .join("+");
}

export function resolveSelectionPrompt(locale: string): string {
  const language = new Intl.DisplayNames([locale], { type: "language" }).of(
    locale,
  );
  return getSelectionPrompt().replaceAll("{language}", language ?? locale);
}
