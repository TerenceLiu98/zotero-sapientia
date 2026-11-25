import { ArrowUp, ChevronDown, Square } from "lucide";
import { config } from "../../../package.json";
import { discoverAgentProfiles } from "../../agents/discovery";
import type { AgentProfile } from "../../agents/profile";
import { getDefaultProfile, loadProfiles } from "../../agents/store";
import type { ChatState } from "../../chat/controller";
import { getString } from "../../utils/locale";
import { h, iconButton, lucideIcon, setIconButton } from "../ui/dom";

interface ComposerActions {
  send(text: string): Promise<boolean>;
  stop(): Promise<void>;
  selectAgent(id: string): Promise<void>;
}

export function createComposer(doc: Document, actions: ComposerActions) {
  const window = doc.defaultView!;
  const input = h(doc, "textarea", {
    class: "sap-chat-input",
    rows: 2,
    placeholder: getString("composer-placeholder"),
    "aria-label": getString("composer-placeholder"),
  });
  const picker = h(doc, "select", {
    class: "sap-composer-agent-select",
    "aria-label": getString("prefs-default-agent"),
  });
  const agentPicker = h(
    doc,
    "div",
    { class: "sap-composer-agent" },
    picker,
    h(
      doc,
      "span",
      { class: "sap-composer-agent-chevron" },
      lucideIcon(doc, ChevronDown, 13),
    ),
  );
  const send = iconButton(
    doc,
    getString("action-send"),
    ArrowUp,
    () => {
      if (state?.execution === "executing") void actions.stop();
      else void submit();
    },
    "sap-composer-send",
  );
  const element = h(
    doc,
    "div",
    { class: "sap-chat-composer" },
    h(
      doc,
      "div",
      { class: "sap-composer-card" },
      input,
      h(doc, "div", { class: "sap-composer-toolbar" }, agentPicker, send),
    ),
  );

  let state: ChatState | undefined;
  let submitting = false;
  let switching = false;
  let discoveredProfiles: AgentProfile[] = [];
  let disposed = false;

  function resize(): void {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, Math.round(window.innerHeight * 0.35))}px`;
  }

  function renderControls(): void {
    const running =
      state?.execution === "executing" || state?.execution === "cancelling";
    const pending =
      submitting || switching || state?.connection === "connecting";
    setIconButton(
      send,
      getString(running ? "action-stop" : "action-send"),
      running ? Square : ArrowUp,
    );
    send.disabled = running
      ? state?.execution === "cancelling"
      : pending || !input.value.trim();
    send.dataset.mode = running ? "stop" : "send";
    picker.disabled = running || pending;
  }

  function renderProfiles(): void {
    const profiles = [...loadProfiles(), ...discoveredProfiles];
    const selected = getDefaultProfile(profiles);
    picker.replaceChildren(
      ...profiles.map(({ id, name }) => h(doc, "option", { value: id }, name)),
    );
    picker.value = selected?.id ?? "";
    picker.title = selected?.name ?? "";
    agentPicker.hidden = !selected;
  }

  async function submit(): Promise<void> {
    if (send.disabled || (state && state.execution !== "idle")) return;
    const draft = input.value;
    submitting = true;
    input.value = "";
    resize();
    renderControls();
    let sent = false;
    try {
      sent = await actions.send(draft);
    } finally {
      if (!sent && !input.value) {
        input.value = draft;
        resize();
      }
      submitting = false;
      renderControls();
    }
  }

  picker.addEventListener("change", async () => {
    switching = true;
    renderControls();
    try {
      await actions.selectAgent(picker.value);
    } finally {
      switching = false;
      renderProfiles();
      renderControls();
    }
  });
  input.addEventListener("input", () => {
    resize();
    renderControls();
  });
  input.addEventListener("keydown", (event) => {
    const key = event as KeyboardEvent;
    if (key.key === "Enter" && !key.shiftKey && !key.isComposing) {
      event.preventDefault();
      void submit();
    }
  });
  element.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (
      target.classList?.contains("sap-composer-card") ||
      target.classList?.contains("sap-composer-toolbar")
    ) {
      input.focus();
    }
  });

  const profileObserver = Zotero.Prefs.registerObserver(
    `${config.prefsPrefix}.profiles`,
    renderProfiles,
    true,
  );
  const defaultObserver = Zotero.Prefs.registerObserver(
    `${config.prefsPrefix}.defaultProfileId`,
    renderProfiles,
    true,
  );
  renderProfiles();
  renderControls();
  void discoverAgentProfiles().then((profiles) => {
    if (disposed) return;
    discoveredProfiles = profiles;
    renderProfiles();
  });

  return {
    element,
    input,
    render(nextState: ChatState) {
      state = nextState;
      renderControls();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      Zotero.Prefs.unregisterObserver(profileObserver);
      Zotero.Prefs.unregisterObserver(defaultObserver);
    },
  };
}
