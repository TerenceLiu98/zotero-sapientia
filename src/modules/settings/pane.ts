import { Pencil, Plus, RotateCcw, Star, Trash2, X } from "lucide";
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
  mergeProfiles,
  saveProfiles,
  setDefaultProfileId,
} from "../../agents/store";
import { getString, type MessageId } from "../../utils/locale";
import { agentIcon } from "../ui/agent-icon";
import { h, iconButton, lucideIcon } from "../ui/dom";
import { SURFACE_STYLES } from "../ui/styles";
import { createSelectionShortcutSettings } from "../marginalia/shortcut-settings";
import { createLibraryModelSettings } from "./library-model";
import { SETTINGS_STYLES } from "./styles";

const HTML_NS = "http://www.w3.org/1999/xhtml";

/** The editor's text fields. */
type TextField = "name" | "command" | "args" | "cwd";

type ButtonAction =
  "add" | "save" | "cancel" | "add-variable" | "drop-variable";

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
  style.textContent = SURFACE_STYLES + SETTINGS_STYLES;

  let profiles = loadProfiles();
  let detected: AgentProfile[] = [];
  /** The agent being added or edited; null while the editor is closed. */
  let draft: { id: string } | null = null;
  /** The id of one of the pane's elements. */
  const id = (part: string) => `${config.addonRef}-${part}`;

  const list = h(doc, "div", {
    class: "sap-prefs-list",
    role: "list",
    "aria-label": getString("prefs-agents"),
  });
  const name = field("name");
  const command = field("command");
  const args = field("args");
  const cwd = field("cwd");
  const variableRows = h(doc, "div", { class: "sap-prefs-env" });
  const error = h(doc, "div", { class: "sap-prefs-error", role: "alert" });
  const discardSlot = h(doc, "div", {
    class: "sap-prefs-discard",
    hidden: true,
  });
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
      button("prefs-agent-cancel", "", "cancel", () => {
        const previous = draft?.id;
        closeEditor();
        focusEdit(previous);
      }),
      discardSlot,
    ),
  );
  editor.id = id("agent-editor");
  const addButton = button("prefs-agent-add", "", "add", () =>
    startEditing(""),
  );
  addButton.prepend(lucideIcon(doc, Plus, 15));
  const addEditor = h(doc, "div");
  const libraryModel = createLibraryModelSettings(doc, closeEditor);
  const marginaliaLabel = getString("marginalia-settings");
  const marginaliaPref = `${config.prefsPrefix}.marginalia`;
  const marginaliaEnabled = h(doc, "input", {
    id: id("marginalia-enabled"),
    type: "checkbox",
    checked: Zotero.Prefs.get(marginaliaPref, true) === true,
    change(event) {
      Zotero.Prefs.set(
        marginaliaPref,
        (event.target as HTMLInputElement).checked,
        true,
      );
    },
  });
  const root = h(
    doc,
    "div",
    { class: "sap-prefs" },
    h(
      doc,
      "div",
      { class: "sap-prefs-section" },
      h(doc, "div", { class: "sap-prefs-heading" }, getString("prefs-agents")),
      list,
      addButton,
      addEditor,
    ),
    h(
      doc,
      "div",
      { class: "sap-prefs-section" },
      h(
        doc,
        "label",
        { class: "sap-prefs-row", for: marginaliaEnabled.id },
        marginaliaEnabled,
        marginaliaLabel,
      ),
      createSelectionShortcutSettings(doc),
    ),
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
      lucideIcon(doc, X),
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
    libraryModel.close();
    const known = mergeProfiles(profiles, detected).find(
      (profile) => profile.id === profileId,
    );
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
    renderList();
    name.input.focus();
  }

  function closeEditor(): void {
    draft = null;
    editor.hidden = true;
    editor.remove();
    addButton.hidden = false;
    renderList();
  }

  function focusEdit(profileId?: string): void {
    const row = [...list.querySelectorAll<HTMLElement>("[data-profile]")].find(
      (row) => row.dataset.profile === profileId,
    );
    (
      (row?.querySelector('[data-action="edit"]') as HTMLButtonElement) ??
      addButton
    ).focus();
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
    profiles = profiles.some((existing) => existing.id === profile.id)
      ? profiles.map((existing) =>
          existing.id === profile.id ? profile : existing,
        )
      : [...profiles, profile];
    closeEditor();
    commit();
    focusEdit(profile.id);
  }

  function remove(profile: AgentProfile): void {
    profiles = profiles.filter((existing) => existing.id !== profile.id);
    if (draft?.id === profile.id) {
      closeEditor();
    }
    commit();
    focusEdit(profile.id);
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
    const available = mergeProfiles(profiles, detected);
    libraryModel.render(available);
    const detectedIDs = new Set(detected.map(({ id }) => id));
    const ordered = [
      ...detected.map((profile) =>
        available.find(({ id }) => id === profile.id)!,
      ),
      ...available.filter(({ id }) => !detectedIDs.has(id)),
    ];
    const defaultId = getDefaultProfile(available)?.id;
    list.replaceChildren(
      ...(ordered.length
        ? ordered.map((profile) => {
            const editing = draft?.id === profile.id;
            const edit = iconButton(
              doc,
              getString("prefs-agent-edit", { name: profile.name }),
              Pencil,
              () => (editing ? closeEditor() : startEditing(profile.id)),
              "sap-prefs-button-icon",
            );
            edit.dataset.action = "edit";
            edit.setAttribute("aria-expanded", String(editing));
            edit.setAttribute("aria-controls", editor.id);
            const makeDefault = iconButton(
              doc,
              getString("prefs-agent-make-default", { name: profile.name }),
              Star,
              () => {
                setDefaultProfileId(profile.id);
                focusEdit(profile.id);
              },
              "sap-prefs-button-icon",
            );
            makeDefault.dataset.action = "make-default";
            if (editing) {
              const saved = profiles.some(({ id }) => id === profile.id);
              discardSlot.hidden = !saved;
              discardSlot.replaceChildren();
              if (saved) {
                const detected = detectedIDs.has(profile.id);
                const discard = iconButton(
                  doc,
                  getString(
                    detected ? "prefs-agent-reset" : "prefs-agent-delete",
                    { name: profile.name },
                  ),
                  detected ? RotateCcw : Trash2,
                  () => remove(profile),
                  "sap-prefs-button-icon",
                );
                discard.dataset.action = "remove";
                discardSlot.append(discard);
              }
            }
            return h(
              doc,
              "div",
              {
                class: "sap-prefs-entry",
                role: "listitem",
                "data-profile": profile.id,
              },
              h(
                doc,
                "div",
                { class: "sap-prefs-row" },
                h(
                  doc,
                  "span",
                  { class: "sap-prefs-agent-icon" },
                  agentIcon(doc, profile, 20),
                ),
                h(
                  doc,
                  "div",
                  { class: "sap-prefs-row-label" },
                  h(doc, "span", { class: "sap-prefs-row-name" }, profile.name),
                  h(
                    doc,
                    "span",
                    { class: "sap-prefs-row-command", title: profile.command },
                    profile.command,
                  ),
                ),
                profile.id === defaultId
                  ? h(
                      doc,
                      "span",
                      { class: "sap-prefs-default-tag" },
                      getString("prefs-agent-default"),
                    )
                  : makeDefault,
                edit,
              ),
              editing ? editor : null,
            );
          })
        : [
            h(
              doc,
              "div",
              { class: "sap-prefs-empty", role: "listitem" },
              getString("prefs-no-agent"),
            ),
          ]),
      libraryModel.element,
    );
    addButton.hidden = draft?.id === "";
    if (addButton.hidden) {
      discardSlot.hidden = true;
      addEditor.append(editor);
    }
  }

  closeEditor();
  container.replaceChildren(style, root);

  const profileObserver = Zotero.Prefs.registerObserver(
    `${config.prefsPrefix}.profiles`,
    () => {
      profiles = loadProfiles();
      renderList();
    },
    true,
  );
  const defaultObserver = Zotero.Prefs.registerObserver(
    `${config.prefsPrefix}.defaultProfileId`,
    renderList,
    true,
  );
  let disposed = false;
  void discoverAgentProfiles().then((result) => {
    if (disposed) return;
    detected = result;
    renderList();
  });
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    libraryModel.dispose();
    doc.defaultView?.removeEventListener("unload", dispose);
    Zotero.Prefs.unregisterObserver(profileObserver);
    Zotero.Prefs.unregisterObserver(defaultObserver);
  };
  doc.defaultView?.addEventListener("unload", dispose, { once: true });
  return dispose;
}
