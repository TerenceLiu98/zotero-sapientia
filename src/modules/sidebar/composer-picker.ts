import { Check, Search } from "lucide";
import type { AgentProfile } from "../../agents/profile";
import { getString } from "../../utils/locale";
import { agentProvider, providerIcon, type Provider } from "../ui/agent-icon";
import { h, lucideIcon } from "../ui/dom";

type Options = { currentId: string; options: { id: string; name: string }[] };
type PickerChoice = { kind: "agent" | "model" | "reasoning"; id: string };

interface Selection {
  agents: AgentProfile[];
  agent?: AgentProfile;
  models?: Options | null;
  reasoning?: Options | null;
  loading: boolean;
  pending: boolean;
  disabled: boolean;
}

let nextPickerId = 0;

export function createComposerPicker(
  doc: Document,
  choose: (choice: PickerChoice) => void,
) {
  const window = doc.defaultView!;
  const id = `sap-composer-picker-${++nextPickerId}`;
  const title = getString("composer-agent-model");
  const mark = h(doc, "span", { class: "sap-composer-picker-icon" });
  const label = h(doc, "span", { class: "sap-composer-picker-label" });
  const trigger = h(
    doc,
    "button",
    {
      class: "sap-composer-picker-trigger",
      type: "button",
      "aria-label": title,
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
      "aria-controls": id,
    },
    mark,
    label,
  );
  const agents = h(doc, "div", {
    class: "sap-composer-picker-agents",
    role: "group",
    "aria-label": getString("prefs-agents"),
  });
  const modelLabel = getString("composer-search-models");
  const search = h(doc, "input", {
    type: "text",
    role: "combobox",
    "aria-label": modelLabel,
    placeholder: modelLabel,
    "aria-autocomplete": "list",
    "aria-controls": `${id}-models`,
    "aria-expanded": "true",
  });
  const models = h(doc, "div", {
    class: "sap-composer-picker-models",
    id: `${id}-models`,
    role: "listbox",
    "aria-label": getString("composer-models"),
  });
  const status = h(doc, "div", {
    class: "sap-composer-picker-status",
    role: "status",
    hidden: true,
  });
  const reasoningOptions = h(doc, "div", {
    class: "sap-composer-picker-levels",
  });
  const reasoning = h(
    doc,
    "div",
    {
      class: "sap-composer-picker-reasoning",
      role: "group",
      "aria-label": getString("composer-reasoning"),
      hidden: true,
    },
    h(
      doc,
      "div",
      { class: "sap-composer-picker-reasoning-title" },
      getString("composer-reasoning"),
    ),
    reasoningOptions,
  );
  const panel = h(
    doc,
    "div",
    {
      class: "sap-composer-picker-list",
      id,
      role: "dialog",
      "aria-label": title,
      popover: "manual",
    },
    agents,
    h(
      doc,
      "div",
      { class: "sap-composer-picker-main" },
      h(
        doc,
        "label",
        { class: "sap-composer-picker-search" },
        lucideIcon(doc, Search, 16),
        search,
      ),
      models,
      status,
    ),
    reasoning,
  );
  const element = h(
    doc,
    "div",
    { class: "sap-composer-picker" },
    trigger,
    panel,
  );

  let selection: Selection = {
    agents: [],
    loading: false,
    pending: false,
    disabled: false,
  };
  let rows: HTMLElement[] = [];
  let active = -1;
  let opened = false;
  let previousProvider: Provider | undefined;

  function position() {
    const anchor = trigger.getBoundingClientRect();
    const width = Math.min(
      reasoning.hidden ? 400 : 570,
      window.innerWidth - 16,
    );
    const above = anchor.top - 14;
    const below = window.innerHeight - anchor.bottom - 14;
    const openAbove = above >= Math.min(260, below);
    panel.style.left = `${Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8))}px`;
    panel.style.top = openAbove ? "auto" : `${anchor.bottom + 6}px`;
    panel.style.bottom = openAbove
      ? `${window.innerHeight - anchor.top + 6}px`
      : "auto";
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(0, Math.min(368, openAbove ? above : below))}px`;
    panel.classList.toggle("is-compact", width < 460);
  }

  function highlight(index: number, scroll = true) {
    rows[active]?.classList.remove("is-active");
    active = index;
    const row = rows[active];
    if (!row) {
      search.removeAttribute("aria-activedescendant");
      return;
    }
    row.classList.add("is-active");
    search.setAttribute("aria-activedescendant", row.id);
    if (scroll) {
      const option = row.getBoundingClientRect();
      const viewport = models.getBoundingClientRect();
      const delta =
        option.top < viewport.top
          ? option.top - viewport.top
          : Math.max(0, option.bottom - viewport.bottom);
      models.scrollTop += delta;
    }
  }

  function renderModels(preserve = true) {
    const previous = preserve ? rows[active]?.dataset.modelId : undefined;
    const { agent, loading, models: modelList, pending } = selection;
    const query = search.value.trim().toLowerCase();
    const options =
      modelList?.options.filter(({ name, id: modelId }) =>
        `${name} ${modelId}`.toLowerCase().includes(query),
      ) ?? [];
    rows = options.map(({ id: modelId, name }, index) => {
      const selected = modelId === modelList?.currentId;
      const provider = modelProvider(name, modelId, agent);
      return h(
        doc,
        "div",
        {
          id: `${id}-model-${index}`,
          class: "sap-composer-picker-option",
          role: "option",
          "aria-selected": String(selected),
          "aria-disabled": String(pending || loading),
          "data-model-id": modelId,
          title: name,
          mousedown: (event: Event) => event.preventDefault(),
          pointerenter: () => highlight(index, false),
          click: () => {
            if (!selection.pending && !selection.loading && !selected)
              choose({ kind: "model", id: modelId });
          },
        },
        h(
          doc,
          "span",
          { class: "sap-composer-picker-icon", "data-provider": provider },
          providerIcon(doc, provider, 17),
        ),
        h(
          doc,
          "span",
          { class: "sap-composer-picker-option-label" },
          modelLabelForAgent(name, agent),
        ),
        h(
          doc,
          "span",
          { class: "sap-composer-picker-check" },
          lucideIcon(doc, Check, 15),
        ),
      );
    });
    models.replaceChildren(...rows);
    status.hidden = rows.length > 0;
    if (!status.hidden)
      status.textContent = getString(
        loading
          ? "composer-models-loading"
          : query
            ? "composer-no-matching-models"
            : "composer-no-models",
      );
    const match = options.findIndex(
      ({ id: modelId }) => modelId === (previous ?? modelList?.currentId),
    );
    active = -1;
    highlight(
      rows.length ? Math.max(0, match) : -1,
      !preserve || previous === undefined,
    );
  }

  function renderPanel(preserve = true) {
    const focused = doc.activeElement?.closest("button");
    const { agent, pending, loading, reasoning: levels } = selection;
    agents.replaceChildren(
      ...selection.agents.map((profile) => {
        const provider = agentProvider(profile);
        return h(
          doc,
          "button",
          {
            class: "sap-composer-picker-agent sap-composer-picker-icon",
            type: "button",
            title: profile.name,
            "aria-label": profile.name,
            "aria-pressed": String(profile.id === agent?.id),
            "data-agent-id": profile.id,
            "data-provider": provider,
            "aria-disabled": String(pending),
            click: () => {
              if (
                selection.pending ||
                (profile.id === selection.agent?.id && selection.models)
              )
                return;
              search.value = "";
              choose({ kind: "agent", id: profile.id });
            },
          },
          providerIcon(doc, provider, 20),
        );
      }),
    );
    reasoning.hidden = !levels?.options.length;
    reasoningOptions.replaceChildren(
      ...(levels?.options.map(({ id: levelId, name }) =>
        h(
          doc,
          "button",
          {
            class: "sap-composer-picker-level",
            type: "button",
            "aria-pressed": String(levelId === levels.currentId),
            "aria-disabled": String(pending || loading),
            "data-reasoning-id": levelId,
            click: () => {
              if (
                !selection.pending &&
                !selection.loading &&
                levelId !== levels.currentId
              )
                choose({ kind: "reasoning", id: levelId });
            },
          },
          name,
          h(
            doc,
            "span",
            { class: "sap-composer-picker-check" },
            lucideIcon(doc, Check, 15),
          ),
        ),
      ) ?? []),
    );
    position();
    renderModels(preserve);
    if (focused && !focused.isConnected) {
      const buttons = panel.querySelectorAll<HTMLButtonElement>("button");
      const key = focused.hasAttribute("data-agent-id")
        ? "data-agent-id"
        : "data-reasoning-id";
      const previous = [...buttons].find(
        (button) => button.getAttribute(key) === focused.getAttribute(key),
      );
      (previous ?? search).focus({ preventScroll: true });
    }
  }

  function open() {
    if (opened || trigger.disabled || !selection.agents.length) return;
    opened = true;
    search.value = "";
    trigger.setAttribute("aria-expanded", "true");
    panel.showPopover();
    reasoningOptions.scrollTop = 0;
    renderPanel(false);
    search.focus({ preventScroll: true });
  }

  function close(restoreFocus = false) {
    if (!opened) return;
    opened = false;
    panel.hidePopover();
    trigger.setAttribute("aria-expanded", "false");
    highlight(-1);
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function onOutsidePress(event: Event) {
    if (!event.composedPath().includes(element)) close();
  }
  function onResize() {
    if (opened) position();
  }
  trigger.addEventListener("click", () => (opened ? close(true) : open()));
  trigger.addEventListener("keydown", (event) => {
    const { key } = event as KeyboardEvent;
    if (key !== "ArrowDown" && key !== "ArrowUp") return;
    event.preventDefault();
    open();
  });
  panel.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  });
  element.addEventListener("focusout", (event: Event) => {
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (next && !element.contains(next)) close();
  });
  search.addEventListener("input", () => renderModels(false));
  search.addEventListener("keydown", (event) => {
    const { key, isComposing } = event as KeyboardEvent;
    if (!rows.length || isComposing) return;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      const step = key === "ArrowDown" ? 1 : -1;
      highlight((active + step + rows.length) % rows.length);
    } else if (key === "Enter") {
      event.preventDefault();
      rows[active]?.click();
    }
  });
  doc.addEventListener("pointerdown", onOutsidePress, true);
  window.addEventListener("resize", onResize);

  return {
    element,
    close,
    render(next: Selection) {
      const changed =
        selection.agents !== next.agents ||
        selection.agent !== next.agent ||
        selection.models !== next.models ||
        selection.reasoning !== next.reasoning ||
        selection.loading !== next.loading ||
        selection.pending !== next.pending;
      selection = next;
      const current = next.models?.options.find(
        ({ id }) => id === next.models?.currentId,
      );
      const level = next.reasoning?.options.find(
        ({ id }) => id === next.reasoning?.currentId,
      );
      const fullText = current
        ? [current.name, level?.name].filter(Boolean).join(" · ")
        : (next.agent?.name ?? "");
      const provider = current
        ? modelProvider(current.name, current.id, next.agent)
        : agentProvider(next.agent);
      if (previousProvider !== provider) {
        mark.replaceChildren(providerIcon(doc, provider, 17));
        mark.dataset.provider = provider;
        previousProvider = provider;
      }
      label.textContent = current
        ? [modelLabelForAgent(current.name, next.agent), level?.name]
            .filter(Boolean)
            .join(" · ")
        : fullText;
      trigger.title = fullText;
      trigger.disabled = next.disabled;
      element.hidden = !next.agents.length;
      if (trigger.disabled || element.hidden) close();
      if (opened && changed) renderPanel();
    },
    destroy() {
      close();
      doc.removeEventListener("pointerdown", onOutsidePress, true);
      window.removeEventListener("resize", onResize);
    },
  };
}

function modelProvider(
  name: string,
  id: string,
  agent?: AgentProfile,
): Provider {
  const identity = `${id} ${name}`.toLowerCase();
  if (id.toLowerCase() === "auto" || name.toLowerCase() === "auto")
    return "auto";
  if (identity.includes("claude")) return "claude";
  if (/\b(?:gpt|openai|codex)\b/.test(identity)) return "codex";
  return agentProvider(agent);
}

function modelLabelForAgent(name: string, agent?: AgentProfile) {
  return agentProvider(agent) === "opencode"
    ? name.replace(/^opencode\//i, "")
    : name;
}
