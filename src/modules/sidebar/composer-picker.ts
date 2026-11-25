import {
  Aperture,
  Bot,
  Check,
  ChevronDown,
  Sparkles,
  Sun,
  Terminal,
} from "lucide";
import type { AgentProfile } from "../../agents/profile";
import { getString } from "../../utils/locale";
import { h, lucideIcon } from "../ui/dom";

type ModelList = { currentId: string; options: { id: string; name: string }[] };
type PickerChoice = { kind: "agent" | "model"; id: string };

interface Selection {
  agents: AgentProfile[];
  agent?: AgentProfile;
  models?: ModelList | null;
  loading: boolean;
  disabled: boolean;
}

let nextPickerId = 0;

export function createComposerPicker(
  doc: Document,
  choose: (choice: PickerChoice) => void,
) {
  const window = doc.defaultView!;
  const listId = `sap-composer-picker-${++nextPickerId}`;
  const label = h(doc, "span", { class: "sap-composer-picker-label" });
  const trigger = h(
    doc,
    "button",
    {
      class: "sap-composer-picker-trigger",
      type: "button",
      role: "combobox",
      "aria-label": getString("composer-agent-model"),
      "aria-expanded": "false",
      "aria-controls": listId,
    },
    label,
    h(
      doc,
      "span",
      { class: "sap-composer-picker-chevron" },
      lucideIcon(doc, ChevronDown, 13),
    ),
  );
  const list = h(doc, "div", {
    class: "sap-composer-picker-list",
    id: listId,
    role: "listbox",
    "aria-label": getString("composer-agent-model"),
    popover: "manual",
  });
  const element = h(
    doc,
    "div",
    { class: "sap-composer-picker" },
    trigger,
    list,
  );
  let selection: Selection = { agents: [], loading: false, disabled: false };
  let rows: HTMLElement[] = [];
  let active = -1;
  let opened = false;

  function position() {
    const anchor = trigger.getBoundingClientRect();
    const drawer = trigger.closest(".sap-chat")?.getBoundingClientRect();
    const width =
      Math.min(318, drawer?.width ?? window.innerWidth, window.innerWidth) - 16;
    const left = Math.max(
      8,
      Math.min(anchor.right - width, window.innerWidth - width - 8),
    );
    list.style.left = `${left}px`;
    list.style.bottom = `${window.innerHeight - anchor.top + 5}px`;
    list.style.width = `${width}px`;
    list.style.maxHeight = `${Math.max(0, Math.min(248, anchor.top - 13))}px`;
  }

  function highlight(index: number, scroll = true) {
    if (active !== index) rows[active]?.classList.remove("is-active");
    active = index;
    const row = rows[active];
    if (row) {
      row.classList.add("is-active");
      trigger.setAttribute("aria-activedescendant", row.id);
      if (scroll) row.scrollIntoView({ block: "nearest" });
    } else {
      trigger.removeAttribute("aria-activedescendant");
    }
  }

  function row(
    choice: PickerChoice,
    name: string,
    agent: AgentProfile | undefined,
    selected: boolean,
  ) {
    const presentation =
      choice.kind === "model"
        ? modelPresentation(name, choice.id, agent)
        : agentPresentation(agent);
    const index = rows.length;
    const unavailable = choice.kind === "model" && selection.loading;
    const option = h(
      doc,
      "div",
      {
        id: `${listId}-${index}`,
        class: "sap-composer-picker-option",
        role: "option",
        "aria-selected": String(selected),
        [`data-${choice.kind}-id`]: choice.id,
        title: name,
        "aria-disabled": String(unavailable),
        mousedown: (event: Event) => event.preventDefault(),
        pointerenter: () => highlight(index, false),
        click: () => {
          if (selection.disabled || unavailable) return;
          close();
          choose(choice);
        },
      },
      h(
        doc,
        "span",
        {
          class: "sap-composer-picker-icon",
          "data-provider": presentation.provider,
        },
        lucideIcon(doc, presentation.icon, 19),
      ),
      h(doc, "span", { class: "sap-composer-picker-option-label" }, name),
      h(
        doc,
        "span",
        { class: "sap-composer-picker-check" },
        lucideIcon(doc, Check, 17),
      ),
    );
    rows.push(option);
    return option;
  }

  function renderOptions() {
    const { agent, agents, models, loading } = selection;
    const preserve = rows[active]?.dataset;
    rows = [];
    const groups: HTMLElement[] = [];
    if (models?.options.length) {
      groups.push(
        h(
          doc,
          "div",
          {
            class: "sap-composer-picker-group",
            role: "group",
            "aria-label": getString("composer-models"),
          },
          ...models.options.map(({ id, name }) =>
            row({ kind: "model", id }, name, agent, id === models.currentId),
          ),
        ),
      );
    } else if (loading) {
      groups.push(
        h(
          doc,
          "div",
          { class: "sap-composer-picker-status", role: "status" },
          getString("composer-models-loading"),
        ),
      );
    }
    const modelSelected = models?.options.some(
      ({ id }) => id === models.currentId,
    );
    groups.push(
      h(
        doc,
        "div",
        {
          class: "sap-composer-picker-group",
          role: "group",
          "aria-label": getString("prefs-agents"),
        },
        ...agents.map((entry) =>
          row(
            { kind: "agent", id: entry.id },
            entry.name,
            entry,
            !modelSelected && entry.id === agent?.id,
          ),
        ),
      ),
    );
    list.replaceChildren(...groups);
    const previous =
      preserve &&
      rows.findIndex((option) =>
        preserve.modelId
          ? option.dataset.modelId === preserve.modelId
          : option.dataset.agentId === preserve.agentId,
      );
    const selected = rows.findIndex(
      (option) => option.getAttribute("aria-selected") === "true",
    );
    highlight(
      previous != null && previous >= 0 ? previous : Math.max(0, selected),
    );
  }

  function open() {
    if (opened || trigger.disabled || !selection.agents.length) return;
    opened = true;
    trigger.focus({ preventScroll: true });
    trigger.setAttribute("aria-expanded", "true");
    position();
    list.showPopover();
    renderOptions();
  }

  function close() {
    if (!opened) return;
    opened = false;
    list.hidePopover();
    trigger.setAttribute("aria-expanded", "false");
    highlight(-1);
  }

  function onOutsidePress(event: Event) {
    if (!event.composedPath().includes(element)) close();
  }

  trigger.addEventListener("click", () => (opened ? close() : open()));
  trigger.addEventListener("blur", close);
  trigger.addEventListener("keydown", (event) => {
    switch ((event as KeyboardEvent).key) {
      case "ArrowUp":
      case "ArrowDown": {
        event.preventDefault();
        if (!opened) {
          open();
        } else {
          const step = (event as KeyboardEvent).key === "ArrowUp" ? -1 : 1;
          highlight((active + step + rows.length) % rows.length);
        }
        break;
      }
      case "Home":
      case "End":
        if (opened) {
          event.preventDefault();
          highlight(
            (event as KeyboardEvent).key === "Home" ? 0 : rows.length - 1,
          );
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (opened) rows[active]?.click();
        else open();
        break;
      case "Escape":
        if (opened) {
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
  function onResize() {
    if (opened) position();
  }
  doc.addEventListener("pointerdown", onOutsidePress, true);
  window.addEventListener("resize", onResize);

  return {
    element,
    render(next: Selection) {
      const changed =
        selection.agents !== next.agents ||
        selection.agent !== next.agent ||
        selection.models !== next.models ||
        selection.loading !== next.loading;
      selection = next;
      const current = next.models?.options.find(
        ({ id }) => id === next.models?.currentId,
      );
      const text = current?.name ?? next.agent?.name ?? "";
      label.textContent = text;
      trigger.title = text;
      trigger.disabled = next.disabled;
      element.hidden = !next.agents.length;
      if (trigger.disabled || element.hidden) close();
      if (opened && changed) renderOptions();
    },
    destroy() {
      close();
      doc.removeEventListener("pointerdown", onOutsidePress, true);
      window.removeEventListener("resize", onResize);
    },
  };
}

function agentPresentation(agent?: AgentProfile) {
  const identity = `${agent?.id ?? ""} ${agent?.name ?? ""}`.toLowerCase();
  if (identity.includes("claude")) return { provider: "claude", icon: Sun };
  if (identity.includes("codex")) return { provider: "codex", icon: Aperture };
  if (identity.includes("opencode"))
    return { provider: "opencode", icon: Terminal };
  return { provider: "custom", icon: Bot };
}

function modelPresentation(name: string, id: string, agent?: AgentProfile) {
  const identity = `${id} ${name}`.toLowerCase();
  if (id.toLowerCase() === "auto" || name.toLowerCase() === "auto") {
    return { provider: "auto", icon: Sparkles };
  }
  if (/claude/.test(identity)) return { provider: "claude", icon: Sun };
  if (/\b(?:gpt|openai|codex)\b/.test(identity)) {
    return { provider: "codex", icon: Aperture };
  }
  return agentPresentation(agent);
}
