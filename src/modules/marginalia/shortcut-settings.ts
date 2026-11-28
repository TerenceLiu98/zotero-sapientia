import { X } from "lucide";
import { getString } from "../../utils/locale";
import { h, iconButton } from "../ui/dom";
import {
  getSelectionPrompt,
  getSelectionShortcut,
  selectionShortcutKey,
  setSelectionPrompt,
  setSelectionShortcut,
} from "./shortcut-prefs";

export function createSelectionShortcutRows(doc: Document): HTMLElement[] {
  const shortcutLabel = getString("marginalia-shortcut-binding");
  const promptLabel = getString("marginalia-shortcut-prompt");
  let capturing = false;
  const binding = h(doc, "button", {
    id: "sapientia-selection-shortcut",
    type: "button",
    class: "sap-prefs-button",
    click: () => {
      capturing = true;
      render();
    },
    keydown(event) {
      if (!capturing) return;
      const keyboard = event as KeyboardEvent;
      if (keyboard.key === "Tab") return;
      event.preventDefault();
      event.stopPropagation();
      if (keyboard.key !== "Escape") {
        const key = selectionShortcutKey(keyboard);
        if (!key || keyboard.repeat) return;
        setSelectionShortcut(key);
      }
      capturing = false;
      render();
    },
    blur: () => {
      capturing = false;
      render();
    },
  });
  const clear = iconButton(
    doc,
    getString("marginalia-shortcut-clear"),
    X,
    () => {
      setSelectionShortcut("");
      capturing = false;
      render();
      binding.focus();
    },
    "sap-prefs-button-icon",
  );
  const prompt = h(doc, "textarea", {
    id: "sapientia-selection-prompt",
    class: "sap-prefs-input",
    rows: 2,
    input: () => setSelectionPrompt(prompt.value),
    blur: () => {
      prompt.value = getSelectionPrompt();
    },
  });
  prompt.value = getSelectionPrompt();

  function render() {
    const value = getSelectionShortcut();
    const status = capturing
      ? getString("marginalia-shortcut-record")
      : value || getString("marginalia-shortcut-unassigned");
    binding.textContent = status;
    binding.setAttribute("aria-label", `${shortcutLabel}: ${status}`);
    clear.disabled = !value;
  }

  render();
  return [
    h(
      doc,
      "div",
      { class: "sap-prefs-option" },
      h(doc, "label", { for: binding.id }, shortcutLabel),
      h(doc, "div", { class: "sap-prefs-option-actions" }, binding, clear),
    ),
    h(
      doc,
      "div",
      { class: "sap-prefs-option sap-prefs-option-multiline" },
      h(doc, "label", { for: prompt.id }, promptLabel),
      prompt,
    ),
  ];
}
