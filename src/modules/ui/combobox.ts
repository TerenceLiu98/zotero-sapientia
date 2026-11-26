import { Check, ChevronDown } from "lucide";
import { h, lucideIcon } from "./dom";

export interface ComboboxOption {
  value: string;
  label: string;
  /** A second line of the row, in a quieter color. */
  hint?: string;
}

export interface ComboboxOptions {
  /** Prefixes the element ids, so a `<label>` can point at the field. */
  id: string;
  label: string;
  placeholder: string;
  emptyText: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}

export interface Combobox {
  element: HTMLElement;
  setOptions(options: ComboboxOption[]): void;
  setValue(value: string | null): void;
  destroy(): void;
}

/** The list never opens narrower than this. */
const MIN_LIST_WIDTH_PX = 180;
const LIST_GAP_PX = 4;
const MAX_LIST_HEIGHT_PX = 288;
const MIN_LIST_HEIGHT_PX = 120;

/**
 * A single-choice combobox: a text field that opens a searchable list below
 * it. Layout and interaction follow affectUI's Combobox and Select.
 *
 * Type to filter. Up and down open the list and move in it, Enter picks the
 * active row, Escape closes the list, Tab closes it and moves on.
 */
export function createCombobox(
  doc: Document,
  options: ComboboxOptions,
): Combobox {
  const listId = `${options.id}-list`;
  const list = h(doc, "div", {
    class: "sap-combobox-list",
    id: listId,
    role: "listbox",
    // The top layer keeps the list clear of scroll containers.
    popover: "manual",
  });
  const field = h(
    doc,
    "div",
    { class: "sap-combobox-field" },
    h(doc, "input", {
      class: "sap-combobox-input",
      id: options.id,
      type: "text",
      role: "combobox",
      autocomplete: "off",
      spellcheck: "false",
      "aria-expanded": "false",
      "aria-controls": listId,
      "aria-autocomplete": "list",
      placeholder: options.placeholder,
    }),
    h(
      doc,
      "span",
      { class: "sap-combobox-chevron" },
      lucideIcon(doc, ChevronDown),
    ),
  );
  const element = h(
    doc,
    "div",
    { class: "sap-combobox" },
    h(
      doc,
      "label",
      { class: "sap-combobox-label", for: options.id },
      options.label,
    ),
    field,
    list,
  );
  const input = field.querySelector("input")!;
  const popover = typeof list.showPopover === "function";
  if (!popover) {
    list.setAttribute("hidden", "");
  }

  let choices = options.options;
  let value = options.value;
  let query = "";
  let rows: HTMLElement[] = [];
  let active = -1;

  function selected(): ComboboxOption | undefined {
    return choices.find((choice) => choice.value === value);
  }

  function matches(): ComboboxOption[] {
    if (!query) {
      return choices;
    }
    const words = query.split(/\s+/);
    return choices.filter((choice) => {
      const text = `${choice.label} ${choice.hint ?? ""}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }

  function isOpen(): boolean {
    return input.getAttribute("aria-expanded") === "true";
  }

  function position(): void {
    const rect = field.getBoundingClientRect();
    const { innerWidth, innerHeight } = doc.defaultView!;
    const below = innerHeight - rect.bottom;
    const width = Math.min(innerWidth, Math.max(rect.width, MIN_LIST_WIDTH_PX));
    list.style.left = `${Math.max(0, Math.min(rect.left, innerWidth - width))}px`;
    list.style.width = `${width}px`;
    if (below >= MIN_LIST_HEIGHT_PX || below >= rect.top) {
      list.style.top = `${rect.bottom + LIST_GAP_PX}px`;
      list.style.bottom = "auto";
      list.style.maxHeight = `${Math.min(MAX_LIST_HEIGHT_PX, below - LIST_GAP_PX)}px`;
    } else {
      list.style.top = "auto";
      list.style.bottom = `${innerHeight - rect.top + LIST_GAP_PX}px`;
      list.style.maxHeight = `${Math.min(MAX_LIST_HEIGHT_PX, rect.top - LIST_GAP_PX)}px`;
    }
  }

  function renderRows(): void {
    const matching = matches();
    active = matching.findIndex((choice) => choice.value === value);
    if (active === -1 && query && matching.length > 0) {
      active = 0;
    }
    rows = matching.map((choice) =>
      h(
        doc,
        "div",
        {
          class: "sap-combobox-option",
          role: "option",
          "data-value": choice.value,
          "aria-selected": String(choice.value === value),
          mousedown: (event: Event) => event.preventDefault(),
          click: () => pick(choice.value),
        },
        h(doc, "span", { class: "sap-combobox-option-label" }, choice.label),
        choice.hint
          ? h(doc, "span", { class: "sap-combobox-option-hint" }, choice.hint)
          : null,
        h(doc, "span", { class: "sap-combobox-check" }, lucideIcon(doc, Check)),
      ),
    );
    rows.forEach((row, index) => {
      row.id = `${listId}-${index}`;
    });
    list.replaceChildren(
      ...(rows.length
        ? rows
        : [h(doc, "div", { class: "sap-combobox-empty" }, options.emptyText)]),
    );
    highlight();
  }

  /** Shows the active row's check mark and tells the field which row is active. */
  function highlight(): void {
    rows.forEach((row, index) => {
      row.classList.toggle("is-active", index === active);
      if (index === active) {
        input.setAttribute("aria-activedescendant", row.id);
        row.scrollIntoView({ block: "nearest" });
      }
    });
    if (active === -1) {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function open(): void {
    if (isOpen()) {
      return;
    }
    if (popover) {
      list.showPopover();
    } else {
      list.removeAttribute("hidden");
    }
    input.setAttribute("aria-expanded", "true");
    renderRows();
    position();
  }

  function close(): void {
    if (!isOpen()) {
      return;
    }
    if (popover) {
      list.hidePopover();
    } else {
      list.setAttribute("hidden", "");
    }
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    query = "";
    showSelected();
  }

  function pick(picked: string): void {
    close();
    if (picked === value) {
      return;
    }
    value = picked;
    showSelected();
    options.onChange(picked);
  }

  function showSelected(): void {
    input.value = selected()?.label ?? "";
  }

  function move(step: 1 | -1): void {
    if (!isOpen()) {
      open();
    }
    if (!rows.length) {
      return;
    }
    active =
      active === -1 && step === -1
        ? rows.length - 1
        : (active + step + rows.length) % rows.length;
    highlight();
  }

  // Typing replaces the selected label, which is why the text is selected on focus.
  input.addEventListener("focus", () => {
    open();
    input.select();
  });
  input.addEventListener("click", open);
  input.addEventListener("blur", close);
  input.addEventListener("input", () => {
    query = input.value.trim().toLowerCase();
    if (isOpen()) {
      renderRows();
    } else {
      open();
    }
  });
  input.addEventListener("keydown", (event) => {
    switch ((event as KeyboardEvent).key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Enter":
        if (isOpen()) {
          event.preventDefault();
          rows[active]?.click();
        }
        break;
      case "Escape":
        if (isOpen()) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
      case "Tab":
        close();
        break;
    }
  });
  // A press anywhere else closes the list. Pointer down, so that it is closed
  // before whatever was pressed takes effect.
  const closeOnOutsidePress = (event: Event) => {
    const target = event.target as Node | null;
    if (isOpen() && !element.contains(target) && !list.contains(target)) {
      close();
    }
  };
  doc.addEventListener("pointerdown", closeOnOutsidePress, true);
  showSelected();

  return {
    element,
    setOptions(next) {
      choices = next;
      if (!selected()) {
        value = null;
      }
      if (isOpen()) {
        renderRows();
      } else {
        showSelected();
      }
    },
    setValue(next) {
      value = next;
      if (isOpen()) {
        renderRows();
      } else {
        showSelected();
      }
    },
    destroy() {
      close();
      doc.removeEventListener("pointerdown", closeOnOutsidePress, true);
    },
  };
}

export const COMBOBOX_STYLES = `
.sap-combobox {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  max-width: 320px;
}
.sap-combobox-label {
  font-size: 13px;
  font-weight: 500;
}
.sap-combobox-field {
  position: relative;
  display: flex;
  align-items: center;
  min-height: var(--sap-control-size);
  padding: 0 6px 0 8px;
  border-radius: var(--sap-control-radius);
  background: var(--material-background);
  box-shadow: 0 0 0 1px var(--color-border);
  transition: box-shadow 120ms ease;
  cursor: text;
}
.sap-combobox-field:hover {
  box-shadow: 0 0 0 1px var(--fill-tertiary);
}
.sap-combobox-field:focus-within {
  box-shadow: 0 0 0 1px var(--color-focus-border);
}
.sap-combobox-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  margin: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--fill-primary);
  font: inherit;
  font-size: 13px;
}
.sap-combobox-input::placeholder {
  color: var(--fill-tertiary);
  opacity: 1;
}
.sap-combobox-chevron {
  display: inline-flex;
  flex: none;
  color: var(--fill-secondary);
  transition: transform 160ms ease;
}
.sap-combobox-input[aria-expanded="true"] + .sap-combobox-chevron {
  transform: rotate(180deg);
}
.sap-combobox-list {
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--sap-border);
  border-radius: var(--sap-menu-radius);
  background: var(--material-button);
  box-shadow: var(--sap-menu-shadow);
  color: var(--fill-primary);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.sap-combobox-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--sap-control-size);
  padding: 4px 8px;
  border-radius: var(--sap-control-radius);
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  user-select: none;
}
.sap-combobox-option.is-active {
  background: var(--sap-hover);
}
.sap-combobox-option-label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.sap-combobox-option[aria-selected="true"] .sap-combobox-option-label {
  font-weight: 500;
}
.sap-combobox-option-hint {
  flex: 2;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--fill-secondary);
}
.sap-combobox-check {
  display: grid;
  flex: none;
  place-items: center;
  width: 16px;
  height: 16px;
  color: var(--accent-blue);
  visibility: hidden;
}
.sap-combobox-option[aria-selected="true"] .sap-combobox-check {
  visibility: visible;
}
.sap-combobox-empty {
  padding: 6px 8px;
  color: var(--fill-secondary);
  font-size: 13px;
}
@media (prefers-reduced-motion: reduce) {
  .sap-combobox * {
    transition-duration: 0ms !important;
  }
}
`;
