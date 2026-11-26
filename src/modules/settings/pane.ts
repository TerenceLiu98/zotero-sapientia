import { config } from "../../../package.json";
import { discoverAgentProfiles } from "../../agents/discovery";
import {
  formatArgs,
  isValidEnvName,
  parseArgs,
  parseProfile,
  ProfileError,
  type AgentProfile,
  type ProfileField,
} from "../../agents/profile";
import {
  getDefaultProfile,
  getDefaultProfileId,
  loadProfiles,
  saveProfiles,
  setDefaultProfileId,
} from "../../agents/store";
import { getString, type MessageId } from "../../utils/locale";
import { COMBOBOX_STYLES, createCombobox } from "../ui/combobox";
import { h, icon, ICON } from "../ui/dom";
import { SETTINGS_STYLES } from "./styles";

const HTML_NS = "http://www.w3.org/1999/xhtml";

/** The editor's text fields. */
type TextField = "name" | "command" | "args" | "cwd";

type ButtonAction =
  | "add"
  | "edit"
  | "remove"
  | "save"
  | "cancel"
  | "add-variable"
  | "drop-variable";

const FIELD_MESSAGE: Record<ProfileField, MessageId> = {
  name: "prefs-error-name",
  command: "prefs-error-command",
  args: "prefs-error-args",
  env: "prefs-error-env",
  cwd: "prefs-error-cwd",
};

interface Field {
  input: HTMLInputElement;
  row: HTMLElement;
}

/**
 * Fills the plugin's settings pane in Zotero's Settings window: the list of
 * agents, the editor for one of them, and the default agent.
 *
 * @returns a function that tears the pane down
 */
export function renderSettingsPane(
  doc: Document,
  container: Element,
): () => void {
  const style = doc.createElementNS(HTML_NS, "style");
  style.textContent = `${SETTINGS_STYLES}\n${COMBOBOX_STYLES}`;

  let profiles = loadProfiles();
  let detected: AgentProfile[] = [];
  /** The agent being added or edited; null while the editor is closed. */
  let draft: { id: string } | null = null;
  /** The id of one of the pane's elements. */
  const id = (part: string) => `${config.addonRef}-${part}`;

  const list = h(doc, "div", { class: "sap-prefs-list" });
  const name = field("name");
  const command = field("command");
  const args = field("args");
  const cwd = field("cwd");
  const variableRows = h(doc, "div", { class: "sap-prefs-env" });
  const error = h(doc, "div", { class: "sap-prefs-error", role: "alert" });
  const editor = h(
    doc,
    "div",
    { class: "sap-prefs-editor" },
    name.row,
    command.row,
    args.row,
    cwd.row,
    h(
      doc,
      "div",
      { class: "sap-prefs-field" },
      h(
        doc,
        "span",
        { class: "sap-prefs-field-label" },
        getString("prefs-agent-env"),
      ),
      h(
        doc,
        "div",
        { class: "sap-prefs-env-field" },
        variableRows,
        button("prefs-env-add", "quiet", "add-variable", () =>
          addVariable("", ""),
        ),
      ),
    ),
    error,
    h(
      doc,
      "div",
      { class: "sap-prefs-actions" },
      button("prefs-agent-save", "primary", "save", save),
      button("prefs-agent-cancel", "", "cancel", closeEditor),
    ),
  );
  const defaultAgent = createCombobox(doc, {
    id: `${config.addonRef}-default-agent`,
    label: getString("prefs-default-agent"),
    placeholder: getString("prefs-default-placeholder"),
    emptyText: getString("prefs-combobox-empty"),
    options: [],
    value: null,
    onChange: (value) => setDefaultProfileId(value ?? ""),
  });
  const root = h(
    doc,
    "div",
    { class: "sap-prefs" },
    h(
      doc,
      "div",
      { class: "sap-prefs-section" },
      h(
        doc,
        "label",
        { class: "sap-prefs-heading" },
        getString("prefs-agents"),
      ),
      list,
      button("prefs-agent-add", "", "add", () => startEditing("")),
      editor,
    ),
    h(doc, "div", { class: "sap-prefs-section" }, defaultAgent.element),
  );

  function field(text: TextField): Field {
    const input = h(doc, "input", {
      class: "sap-prefs-input",
      type: text === "args" ? "password" : "text",
      id: id(text),
      autocomplete: "off",
    });
    return {
      input,
      row: h(
        doc,
        "div",
        { class: "sap-prefs-field" },
        h(
          doc,
          "label",
          { class: "sap-prefs-field-label", for: input.id },
          getString(`prefs-agent-${text}`),
        ),
        input,
      ),
    };
  }

  function button(
    label: MessageId,
    variant: "" | "primary" | "quiet",
    action: ButtonAction,
    onClick: () => void,
  ): HTMLButtonElement {
    return h(
      doc,
      "button",
      {
        class: "sap-prefs-button",
        type: "button",
        "data-variant": variant,
        "data-action": action,
        click: onClick,
      },
      getString(label),
    );
  }

  function addVariable(key = "", value = ""): void {
    const nameInput = h(doc, "input", {
      class: "sap-prefs-input",
      type: "text",
      placeholder: "NAME",
      "aria-label": getString("prefs-env-name"),
      spellcheck: "false",
    });
    // A password field, so that a value is not shown on screen by default.
    const valueInput = h(doc, "input", {
      class: "sap-prefs-input",
      type: "password",
      autocomplete: "off",
      placeholder: "••••••••",
      "aria-label": getString("prefs-env-value"),
    });
    const drop = h(
      doc,
      "button",
      {
        class: "sap-prefs-button-icon",
        type: "button",
        "data-action": "drop-variable",
      },
      icon(doc, ICON.close),
    );
    const row = h(
      doc,
      "div",
      { class: "sap-prefs-env-row" },
      nameInput,
      valueInput,
      drop,
    );
    nameInput.value = key;
    valueInput.value = value;
    drop.addEventListener("click", () => row.remove());
    variableRows.append(row);
  }

  /** Opens the editor on an agent, or on a blank one when given "". */
  function startEditing(profileId: string): void {
    const known = profiles.find((profile) => profile.id === profileId);
    draft = { id: known?.id ?? "" };
    name.input.value = known?.name ?? "";
    command.input.value = known?.command ?? "";
    args.input.value = known ? formatArgs(known.args) : "";
    cwd.input.value = known?.cwd ?? "";
    variableRows.replaceChildren();
    for (const [key, value] of Object.entries(known?.env ?? {})) {
      addVariable(key, value);
    }
    showError(null);
    editor.hidden = false;
    name.input.focus();
  }

  function closeEditor(): void {
    draft = null;
    editor.hidden = true;
  }

  /** Reads the editor into a profile. Throws a `ProfileError` naming the first invalid field. */
  function readDraft(): AgentProfile {
    const env: Record<string, string> = Object.create(null);
    for (const row of variableRows.children) {
      const [keyInput, valueInput] = row.querySelectorAll("input");
      const key = keyInput.value.trim();
      if (!key && !valueInput.value) {
        continue;
      }
      if (!isValidEnvName(key) || key in env) {
        throw new ProfileError("env", key);
      }
      env[key] = valueInput.value;
    }
    return parseProfile({
      id: draft?.id,
      name: name.input.value,
      command: command.input.value,
      args: parseArgs(args.input.value),
      env,
      cwd: cwd.input.value,
    });
  }

  /** Marks the field a `ProfileError` names and says what is wrong with it. */
  function showError(field: ProfileField | null): void {
    const fields: Record<ProfileField, HTMLElement | undefined> = {
      name: name.input,
      command: command.input,
      args: args.input,
      env: variableRows.querySelector("input") ?? undefined,
      cwd: cwd.input,
    };
    for (const key of Object.keys(fields) as ProfileField[]) {
      if (key === field) {
        fields[key]?.setAttribute("aria-invalid", "true");
      } else {
        fields[key]?.removeAttribute("aria-invalid");
      }
    }
    error.textContent = field ? getString(FIELD_MESSAGE[field]) : "";
    error.hidden = !field;
  }

  function save(): void {
    if (!draft) {
      return;
    }
    let profile: AgentProfile;
    try {
      profile = readDraft();
    } catch (error) {
      if (!(error instanceof ProfileError)) {
        throw error;
      }
      showError(error.field);
      return;
    }
    profiles = [
      ...profiles.filter((existing) => existing.id !== profile.id),
      profile,
    ];
    closeEditor();
    commit();
  }

  function remove(profile: AgentProfile): void {
    profiles = profiles.filter((existing) => existing.id !== profile.id);
    if (draft?.id === profile.id) {
      closeEditor();
    }
    commit();
  }

  function commit(): void {
    saveProfiles(profiles);
    if (detected.some((profile) => profile.id === getDefaultProfileId()))
      return;
    const defaultId = getDefaultProfile(profiles)?.id ?? "";
    if (getDefaultProfileId() !== defaultId) {
      setDefaultProfileId(defaultId);
    }
  }

  function renderList(): void {
    list.replaceChildren(
      ...(profiles.length
        ? profiles.map((profile) =>
            h(
              doc,
              "div",
              {
                class: "sap-prefs-row",
                role: "button",
                tabindex: "0",
                "data-action": "edit",
                "data-profile": profile.id,
                click: () => startEditing(profile.id),
                keydown: (event: Event) => {
                  if ((event as KeyboardEvent).key === "Enter") {
                    startEditing(profile.id);
                  }
                },
              },
              h(doc, "span", { class: "sap-prefs-row-name" }, profile.name),
              // Arguments are left out, because they may carry credentials.
              h(
                doc,
                "span",
                { class: "sap-prefs-row-command" },
                profile.command,
              ),
              h(
                doc,
                "button",
                {
                  class: "sap-prefs-button-icon",
                  type: "button",
                  "data-action": "remove",
                  "aria-label": getString("prefs-agent-delete", {
                    name: profile.name,
                  }),
                  click: (event: Event) => {
                    event.stopPropagation();
                    remove(profile);
                  },
                },
                icon(doc, ICON.close),
              ),
            ),
          )
        : [
            h(
              doc,
              "div",
              { class: "sap-prefs-empty" },
              getString("prefs-no-agent"),
            ),
          ]),
    );
  }

  function renderDefaultAgent(): void {
    const available = [...profiles, ...detected];
    defaultAgent.setOptions(
      available.map((profile) => ({
        value: profile.id,
        label: profile.name,
        hint: profiles.includes(profile) ? profile.command : undefined,
      })),
    );
    defaultAgent.setValue(getDefaultProfile(available)?.id ?? null);
  }

  closeEditor();
  renderList();
  renderDefaultAgent();
  container.replaceChildren(style, root);

  const profileObserver = Zotero.Prefs.registerObserver(
    `${config.prefsPrefix}.profiles`,
    () => {
      profiles = loadProfiles();
      renderList();
      renderDefaultAgent();
    },
    true,
  );
  const defaultObserver = Zotero.Prefs.registerObserver(
    `${config.prefsPrefix}.defaultProfileId`,
    renderDefaultAgent,
    true,
  );
  let disposed = false;
  void discoverAgentProfiles().then((result) => {
    if (disposed) return;
    detected = result;
    renderDefaultAgent();
  });
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    doc.defaultView?.removeEventListener("unload", dispose);
    Zotero.Prefs.unregisterObserver(profileObserver);
    Zotero.Prefs.unregisterObserver(defaultObserver);
    defaultAgent.destroy();
  };
  doc.defaultView?.addEventListener("unload", dispose, { once: true });
  return dispose;
}
