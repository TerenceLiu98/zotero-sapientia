import { ArrowUp, Square } from "lucide";
import { config } from "../../../package.json";
import { discoverAgentProfiles } from "../../agents/discovery";
import type { AgentProfile } from "../../agents/profile";
import {
  getDefaultProfile,
  loadProfiles,
  mergeProfiles,
} from "../../agents/store";
import type { ChatState } from "../../chat/controller";
import { getString } from "../../utils/locale";
import { h, iconButton, setIconButton } from "../ui/dom";
import { createComposerPicker } from "./composer-picker";
import { createComposerPermissions } from "./composer-permissions";

interface ComposerActions {
  send(text: string): Promise<boolean>;
  stop(): Promise<void>;
  selectAgent(id: string): Promise<void>;
  selectModel(id: string): Promise<void>;
  selectReasoning(id: string): Promise<void>;
  cancelWrites(): void;
}

export function createComposer(
  doc: Document,
  actions: ComposerActions,
  attachments: HTMLElement,
) {
  const window = doc.defaultView!;
  const input = h(doc, "textarea", {
    class: "sap-chat-input",
    rows: 2,
    placeholder: getString("composer-placeholder"),
    "aria-label": getString("composer-placeholder"),
  });
  const picker = createComposerPicker(doc, ({ kind, id }) => {
    void switchSelection(kind, id);
  });
  const permissions = createComposerPermissions(doc, actions.cancelWrites);
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
      attachments,
      input,
      h(
        doc,
        "div",
        { class: "sap-composer-toolbar" },
        permissions.element,
        picker.element,
        send,
      ),
    ),
  );

  let state: ChatState | undefined;
  let submitting = false;
  let switching: "agent" | "model" | "reasoning" | null = null;
  let discoveredProfiles: AgentProfile[] = [];
  let profiles: AgentProfile[] = [];
  let disposed = false;

  function resize(): void {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, Math.round(window.innerHeight * 0.35))}px`;
  }

  function renderControls(): void {
    const running =
      state?.execution === "executing" || state?.execution === "cancelling";
    const pending =
      submitting ||
      Boolean(switching) ||
      state?.changingModel ||
      state?.connection === "connecting";
    setIconButton(
      send,
      getString(running ? "action-stop" : "action-send"),
      running ? Square : ArrowUp,
    );
    send.disabled = running
      ? state?.execution === "cancelling"
      : pending || !input.value.trim();
    send.dataset.mode = running ? "stop" : "send";
    const agent = getDefaultProfile(profiles);
    picker.render({
      agents: profiles,
      agent,
      models: switching === "agent" ? null : state?.models,
      reasoning: switching === "agent" ? null : state?.reasoning,
      loading: switching === "agent" || state?.connection === "connecting",
      pending: Boolean(switching || state?.changingModel),
      disabled: running || submitting,
    });
  }

  function renderProfiles(): void {
    profiles = mergeProfiles(loadProfiles(), discoveredProfiles);
    renderControls();
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

  async function switchSelection(
    kind: "agent" | "model" | "reasoning",
    id: string,
  ): Promise<void> {
    if (switching) return;
    switching = kind;
    renderControls();
    try {
      if (kind === "agent") await actions.selectAgent(id);
      else if (kind === "model") await actions.selectModel(id);
      else await actions.selectReasoning(id);
    } finally {
      switching = null;
      renderProfiles();
    }
  }
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
  void discoverAgentProfiles().then((profiles) => {
    if (disposed) return;
    discoveredProfiles = profiles;
    renderProfiles();
  });

  return {
    element,
    input,
    closeMenus() {
      permissions.close();
      picker.close();
    },
    render(nextState: ChatState) {
      state = nextState;
      renderControls();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      picker.destroy();
      permissions.destroy();
      Zotero.Prefs.unregisterObserver(profileObserver);
      Zotero.Prefs.unregisterObserver(defaultObserver);
    },
  };
}
