/** Styles of the settings pane, scoped under `.sap-prefs` and using Zotero's theme variables. */
export const SETTINGS_STYLES = `
.sap-prefs {
  container-type: inline-size;
  max-width: 560px;
}
#prefs-content:has(> .pane-container:not([hidden]) .sap-prefs) {
  scrollbar-width: none;
}
.sap-prefs * {
  box-sizing: border-box;
  font-family: inherit;
}
.sap-prefs [hidden] {
  display: none !important;
}
.sap-prefs-section {
  margin-top: 16px;
}
.sap-prefs-heading {
  display: block;
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}
.sap-prefs-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--material-button);
}
.sap-prefs-entry + .sap-prefs-entry,
.sap-prefs-list > .sap-prefs-library-model:not(:first-child) { border-top: 1px solid var(--color-border); }
.sap-prefs-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
  align-items: center;
  gap: 12px;
  min-height: 42px;
  padding: 7px 10px;
}
.sap-prefs-option + .sap-prefs-option { border-top: 1px solid var(--color-border); }
.sap-prefs-option label { overflow-wrap: anywhere; }
.sap-prefs-option input[type="checkbox"] {
  justify-self: end;
  margin: 0;
  accent-color: var(--color-accent);
}
.sap-prefs-option-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.sap-prefs-option-actions button:first-child {
  min-width: 0;
  overflow-wrap: anywhere;
}
.sap-prefs-option-actions button:disabled { opacity: .45; }
.sap-prefs-option-multiline textarea {
  height: auto;
  min-height: calc(var(--sap-control-size) * 2);
  padding: 6px 8px;
  resize: vertical;
}
@container (max-width: 340px) {
  .sap-prefs-option-multiline {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
}
.sap-prefs-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto var(--sap-control-size);
  align-items: center;
  gap: 8px;
  min-height: 53px;
  padding: 7px 10px;
}
.sap-prefs-library-model > .sap-prefs-row {
  grid-template-columns: 32px minmax(0, 1fr) var(--sap-control-size);
}
.sap-prefs-agent-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  color: var(--fill-secondary);
}
.sap-prefs-agent-icon img { display: block; object-fit: contain; }
.sap-prefs-row-label {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.sap-prefs-row-name {
  overflow-wrap: anywhere;
  font-weight: 600;
}
.sap-prefs-row-command {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fill-secondary);
  font-size: 11px;
}
.sap-prefs-default-tag {
  padding: 3px 7px;
  border-radius: 5px;
  background: var(--fill-quarternary);
  color: var(--fill-secondary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.sap-prefs-empty {
  padding: 8px 10px;
  color: var(--fill-secondary);
}

.sap-prefs-button {
  min-height: var(--sap-control-size);
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--sap-control-radius);
  background: var(--material-button);
  color: var(--fill-primary);
  font-size: 13px;
  font-weight: 500;
}
.sap-prefs-button:hover:enabled {
  background: var(--sap-hover);
}
.sap-prefs-button:enabled:active {
  background: var(--sap-pressed);
}
.sap-prefs-button[data-variant="primary"] {
  border-color: transparent;
  background: var(--fill-primary);
  color: var(--color-background);
}
.sap-prefs-button[data-variant="primary"]:hover:enabled {
  background: var(--fill-secondary);
}
.sap-prefs-button:disabled { color: var(--fill-tertiary); }
.sap-prefs-button[data-variant="quiet"] {
  border-color: transparent;
  background: transparent;
}
.sap-prefs-button[data-action="add"] {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
.sap-prefs-button-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--sap-control-size);
  min-width: var(--sap-control-size);
  height: var(--sap-control-size);
  padding: 0;
  border: 0;
  border-radius: var(--sap-control-radius);
  background: transparent;
  color: var(--fill-secondary);
}
.sap-prefs-button-icon:hover {
  background: var(--sap-hover);
  color: var(--fill-primary);
}
.sap-prefs-button-icon[aria-expanded="true"] { background: var(--sap-hover); }

.sap-prefs-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--sap-menu-radius);
}
:is(.sap-prefs-entry, .sap-prefs-library-model) > .sap-prefs-editor {
  margin-top: 0;
  border-width: 1px 0 0;
  border-radius: 0;
}
.sap-prefs-field {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.sap-prefs-field-label {
  text-align: end;
  overflow-wrap: anywhere;
}
@container (max-width: 340px) {
  .sap-prefs-field {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
  .sap-prefs-field-label { text-align: start; }
}
.sap-prefs-input {
  width: 100%;
  height: var(--sap-control-size);
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: var(--sap-control-radius);
  background: var(--material-background);
  box-shadow: 0 0 0 1px var(--color-border);
  color: var(--fill-primary);
  font-size: 13px;
}
.sap-prefs-input:focus {
  box-shadow: 0 0 0 1px var(--color-focus-border);
  outline: none;
}
.sap-prefs-input::placeholder {
  color: var(--fill-tertiary);
  opacity: 1;
}
.sap-prefs-input[aria-invalid="true"] {
  box-shadow: 0 0 0 1px var(--color-invalid);
}
.sap-prefs-env-field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.sap-prefs-env {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}
.sap-prefs-env-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) var(--sap-control-size);
  align-items: center;
  gap: 4px;
}
.sap-prefs-error {
  color: var(--color-invalid);
}
.sap-prefs-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sap-prefs-discard { margin-inline-start: auto; }
.sap-prefs-select-field { display: flex; align-items: center; gap: 6px; min-width: 0; }
.sap-prefs-select-field select { min-width: 0; flex: 1; }
.sap-prefs-select-field button:disabled { opacity: 0.45; }
`;
