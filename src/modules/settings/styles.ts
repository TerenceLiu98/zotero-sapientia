/** Styles of the settings pane, scoped under `.sap-prefs` and using Zotero's theme variables. */
export const SETTINGS_STYLES = `
.sap-prefs {
  max-width: 560px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--fill-primary);
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
  border-radius: 7px;
}
.sap-prefs-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 4px 4px 10px;
  cursor: pointer;
}
.sap-prefs-row + .sap-prefs-row {
  border-top: 1px solid var(--color-border);
}
.sap-prefs-row:hover {
  background: var(--fill-quinary);
}
.sap-prefs-row-name {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sap-prefs-row-command {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--fill-secondary);
  font-family: var(--monospace-font);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sap-prefs-empty {
  padding: 8px 10px;
  color: var(--fill-secondary);
}

.sap-prefs-button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-control);
  color: var(--fill-primary);
  font-size: 13px;
  font-weight: 500;
}
.sap-prefs-button:hover:enabled {
  background: var(--fill-quinary);
}
.sap-prefs-button:enabled:active {
  background: var(--fill-quarternary);
}
.sap-prefs-button:focus-visible {
  outline: 2px solid var(--color-focus-border);
  outline-offset: 2px;
}
.sap-prefs-button[data-variant="primary"] {
  border-color: transparent;
  background: var(--fill-primary);
  color: var(--color-background);
}
.sap-prefs-button[data-variant="quiet"] {
  border-color: transparent;
  background: transparent;
}
.sap-prefs-button-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--fill-secondary);
}
.sap-prefs-button-icon:hover {
  background: var(--fill-quarternary);
  color: var(--fill-primary);
}

.sap-prefs-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
}
.sap-prefs-field {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.sap-prefs-field-label {
  text-align: end;
}
.sap-prefs-input {
  width: 100%;
  height: 28px;
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: var(--color-control);
  box-shadow: 0 0 0 1px var(--color-border);
  color: var(--fill-primary);
  font-size: 13px;
}
.sap-prefs-input:focus {
  box-shadow: 0 0 0 1px var(--fill-secondary);
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
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) 24px;
  align-items: center;
  gap: 4px;
}
.sap-prefs-error {
  color: var(--color-invalid);
}
.sap-prefs-actions {
  display: flex;
  gap: 8px;
}
`;
