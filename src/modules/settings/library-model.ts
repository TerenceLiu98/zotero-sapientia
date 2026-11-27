import { Library, Pencil, RotateCw } from "lucide";
import { AgentConnection } from "../../acp/connection";
import { sessionChoicesFromConfig } from "../../acp/models";
import { resolveLaunchSpec } from "../../agents/launch";
import type { AgentProfile } from "../../agents/profile";
import { secretValues } from "../../agents/secrets";
import {
  getLibraryDefaultModel,
  setLibraryDefaultModel,
} from "../../agents/store";
import { getString, type MessageId } from "../../utils/locale";
import { logWarn, redactor } from "../../utils/log";
import { agentIcon } from "../ui/agent-icon";
import { h, iconButton, lucideIcon } from "../ui/dom";

export function createLibraryModelSettings(
  doc: Document,
  closeAgentEditor?: () => void,
) {
  let selectedId = "";
  let savedModelName:
    { profileId: string; modelId: string; name: string } | undefined;
  let profiles: readonly AgentProfile[] = [];
  let source: AgentProfile | undefined;
  let pending: AbortController | undefined;
  const agent = h(doc, "select", {
    class: "sap-prefs-input",
    id: "sapientia-library-default-agent",
  });
  const model = h(doc, "select", {
    class: "sap-prefs-input",
    id: "sapientia-library-default-model",
  });
  const refresh = iconButton(
    doc,
    getString("prefs-library-model-refresh"),
    RotateCw,
    () => void loadModels(profiles.find(({ id }) => id === selectedId)),
    "sap-prefs-button-icon",
  );
  const icon = h(doc, "span", { class: "sap-prefs-agent-icon" });
  const summary = h(doc, "span", { class: "sap-prefs-row-command" });
  const label = getString("prefs-library-model-heading");
  const edit = iconButton(
    doc,
    getString("prefs-agent-edit", { name: label }),
    Pencil,
    () => {
      if (!editor.hidden) {
        close();
        return;
      }
      closeAgentEditor?.();
      selectedId = getLibraryDefaultModel()?.profileId ?? "";
      editor.hidden = false;
      edit.setAttribute("aria-expanded", "true");
      renderAgentOptions();
      void loadModels(profiles.find(({ id }) => id === selectedId));
      agent.focus();
    },
    "sap-prefs-button-icon",
  );
  const save = h(
    doc,
    "button",
    {
      type: "button",
      class: "sap-prefs-button",
      "data-variant": "primary",
      "data-library-action": "save",
      click: () => {
        if (save.disabled) return;
        const modelId = model.value;
        const selected = model.selectedOptions[0] as
          HTMLOptionElement | undefined;
        savedModelName =
          selectedId && modelId && selected
            ? { profileId: selectedId, modelId, name: selected.label }
            : undefined;
        setLibraryDefaultModel(
          selectedId ? { profileId: selectedId, modelId } : null,
        );
        renderSummary();
        close();
      },
    },
    getString("prefs-agent-save"),
  );

  function renderSummary() {
    const saved = getLibraryDefaultModel();
    const profile = profiles.find(({ id }) => id === saved?.profileId);
    const name =
      savedModelName?.profileId === saved?.profileId &&
      savedModelName?.modelId === saved?.modelId
        ? savedModelName?.name
        : undefined;
    summary.textContent = saved
      ? `${profile?.name ?? getString("prefs-library-agent-unavailable")} · ${name ?? saved.modelId}`
      : getString("prefs-library-agent-automatic");
    summary.title = summary.textContent;
    icon.replaceChildren(
      profile ? agentIcon(doc, profile, 20) : lucideIcon(doc, Library, 18),
    );
  }

  function syncSave() {
    const selected = model.selectedOptions[0] as HTMLOptionElement | undefined;
    save.disabled = Boolean(
      selectedId && (model.disabled || !model.value || selected?.disabled),
    );
  }

  function option(value: string, label: string) {
    return h(doc, "option", { value }, label);
  }

  function status(key: MessageId) {
    model.replaceChildren(option("", getString(key)));
    model.disabled = true;
    syncSave();
  }

  async function loadModels(profile?: AgentProfile) {
    pending?.abort();
    source = profile;
    if (!profile) {
      refresh.disabled = true;
      status("prefs-library-model-select-agent");
      return;
    }

    const abort = new AbortController();
    pending = abort;
    refresh.disabled = true;
    status("composer-models-loading");
    const release = redactor.retainSecrets(secretValues(profile));
    let connection: AgentConnection | undefined;
    const stop = () => void connection?.close().catch(() => {});
    abort.signal.addEventListener("abort", stop, { once: true });
    try {
      const spec = await resolveLaunchSpec(profile);
      connection = await AgentConnection.open(spec, abort.signal);
      abort.signal.throwIfAborted();
      const { configOptions } = await connection.newSession(spec.cwd);
      abort.signal.throwIfAborted();
      const models = sessionChoicesFromConfig(configOptions).models;
      if (!models) {
        status("composer-no-models");
        return;
      }
      const saved = getLibraryDefaultModel();
      const current = saved?.profileId === profile.id ? saved.modelId : "";
      const available = models.options.some(({ id }) => id === current);
      model.replaceChildren(
        option("", getString("prefs-library-model-choose")),
        ...models.options.map(({ id, name }) => option(id, name)),
      );
      if (current && !available) {
        const missing = option(
          current,
          getString("library-default-model-unavailable", { model: current }),
        );
        missing.disabled = true;
        model.append(missing);
      }
      model.value = current;
      model.disabled = false;
      if (saved && current && available) {
        const name = models.options.find(({ id }) => id === current)?.name;
        if (name) {
          savedModelName = { ...saved, name };
          renderSummary();
        }
      }
      syncSave();
    } catch (error) {
      if (!abort.signal.aborted) {
        status("prefs-library-model-load-error");
        logWarn("Could not load Library Agent models", error);
      }
    } finally {
      abort.signal.removeEventListener("abort", stop);
      try {
        await connection?.close();
      } catch (error) {
        logWarn(
          "Could not close the Library Agent model discovery process",
          error,
        );
      } finally {
        release();
        if (pending === abort) {
          pending = undefined;
          refresh.disabled = !source;
        }
      }
    }
  }

  function field(
    label: MessageId,
    input: HTMLSelectElement,
    action?: HTMLButtonElement,
  ) {
    return h(
      doc,
      "div",
      { class: "sap-prefs-field" },
      h(
        doc,
        "label",
        { class: "sap-prefs-field-label", for: input.id },
        getString(label),
      ),
      h(doc, "div", { class: "sap-prefs-select-field" }, input, action),
    );
  }

  const editor = h(
    doc,
    "div",
    {
      id: "sapientia-library-model-editor",
      class: "sap-prefs-editor",
      hidden: true,
    },
    field("prefs-library-agent-label", agent),
    field("prefs-library-model-label", model, refresh),
    h(
      doc,
      "div",
      { class: "sap-prefs-actions" },
      save,
      h(
        doc,
        "button",
        { type: "button", class: "sap-prefs-button", click: () => close() },
        getString("prefs-agent-cancel"),
      ),
    ),
  );
  edit.dataset.libraryAction = "edit";
  edit.setAttribute("aria-controls", editor.id);
  edit.setAttribute("aria-expanded", "false");
  const element = h(
    doc,
    "div",
    { class: "sap-prefs-library-model", role: "listitem" },
    h(
      doc,
      "div",
      { class: "sap-prefs-row" },
      icon,
      h(
        doc,
        "div",
        { class: "sap-prefs-row-label" },
        h(doc, "span", { class: "sap-prefs-row-name" }, label),
        summary,
      ),
      edit,
    ),
    editor,
  );

  function close(focus = true) {
    pending?.abort();
    pending = undefined;
    source = undefined;
    editor.hidden = true;
    edit.setAttribute("aria-expanded", "false");
    if (focus) edit.focus();
  }

  function renderAgentOptions() {
    agent.replaceChildren(
      option("", getString("prefs-library-agent-automatic")),
      ...profiles.map(({ id, name }) => option(id, name)),
    );
    if (selectedId && !profiles.some(({ id }) => id === selectedId)) {
      const missing = option(
        selectedId,
        getString("prefs-library-agent-unavailable"),
      );
      missing.disabled = true;
      agent.append(missing);
    }
    agent.value = selectedId;
  }

  agent.addEventListener("change", () => {
    selectedId = agent.value;
    void loadModels(profiles.find(({ id }) => id === selectedId));
  });
  model.addEventListener("change", syncSave);

  status("prefs-library-model-select-agent");
  refresh.disabled = true;

  return {
    element,
    render(next: readonly AgentProfile[]) {
      profiles = next;
      renderSummary();
      if (editor.hidden) return;
      const profile = profiles.find(({ id }) => id === selectedId);
      renderAgentOptions();
      if (source !== profile) void loadModels(profile);
    },
    close: () => close(false),
    dispose: () => close(false),
  };
}
