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
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
}
.sap-prefs-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--sap-control-radius);
}
.sap-prefs-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 4px;
}
.sap-prefs-row + .sap-prefs-row {
  border-top: 1px solid var(--color-border);
}
.sap-prefs button.sap-prefs-row-edit {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--sap-control-radius);
  background: transparent;
  color: var(--fill-primary);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.sap-prefs button.sap-prefs-row-edit:hover {
  background: var(--sap-hover);
}
.sap-prefs-row-name {
  flex: none;
  max-width: 45%;
  overflow-wrap: anywhere;
  font-weight: 500;
}
.sap-prefs-row-command {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--fill-secondary);
  font-family: var(--monospace-font);
  font-size: 12px;
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

.sap-prefs-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--sap-menu-radius);
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
`;
