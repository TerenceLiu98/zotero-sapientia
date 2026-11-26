export const COMPOSER_STYLES = `
.sap-chat-composer {
  container-type: inline-size;
  display: flex;
  flex: none;
  flex-direction: column;
  align-self: center;
  width: calc(100% - 24px);
  min-width: 0;
  max-width: 680px;
  margin-bottom: 12px;
  border: 1px solid var(--color-border50, var(--color-border));
  border-radius: 20px;
  background: var(--color-control);
}
.sap-composer-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 16px 12px 12px;
  cursor: text;
}
.sap-context-attached:not([hidden]) {
  display: flex;
  gap: 8px;
  min-width: 0;
  margin-top: -4px;
  padding-bottom: 2px;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-width: thin;
  cursor: auto;
}
.sap-context-quote {
  position: relative;
  display: flex;
  flex: 0 0 clamp(106px, calc((100% - 16px) / 3), 122px);
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
  height: 122px;
  padding: 7px 8px 5px;
  border: 1px solid var(--color-border50, var(--color-border));
  border-radius: 15px;
  background: var(--fill-quinary);
}
.sap-context-quote-text {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  padding-inline-end: 13px;
  overflow-wrap: anywhere;
  color: var(--fill-secondary);
  font-size: 12px;
  line-height: 18px;
}
.sap-context-quote-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--fill-primary);
  font-size: 12px;
  line-height: 18px;
}
.sap-context-quote-footer svg { flex: none; }
.sap-context-quote-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sap-context-quote button.sap-context-remove {
  display: grid;
  position: absolute;
  inset-block-start: 3px;
  inset-inline-end: 3px;
  opacity: 0;
  width: 18px;
  min-width: 0;
  height: 18px;
  padding: 0;
}
.sap-context-quote:hover button.sap-context-remove,
.sap-context-quote:focus-within button.sap-context-remove { opacity: 1; }
.sap-context-quote button.sap-context-remove svg { width: 12px; height: 12px; }
.sap-chat-composer .sap-chat-input {
  width: 100%;
  display: block;
  min-height: 50px;
  max-height: 35vh;
  margin: 0;
  padding: 2px 4px;
  resize: none;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 15px;
  line-height: 22px;
}
.sap-chat-composer textarea.sap-chat-input:is(:focus, :focus-visible) {
  outline: none !important;
  box-shadow: none !important;
}
.sap-chat-composer .sap-chat-input::placeholder {
  color: var(--fill-secondary);
  opacity: 1;
}
.sap-chat-composer .sap-composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}
.sap-composer-picker {
  flex: 0 1 auto;
  width: max-content;
  min-width: 0;
  max-width: calc(100% - 42px);
}
.sap-composer-permissions { flex: none; margin-inline-end: auto; }
.sap-chat-composer .sap-permission-trigger {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  margin: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--fill-primary);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.sap-permission-trigger:is(:hover, [aria-expanded="true"]) { background: var(--fill-quinary); }
.sap-permission-icon { display: inline-flex; color: var(--fill-secondary); }
@container (max-width: 320px) {
  .sap-permission-trigger-label { display: none; }
}
.sap-permission-panel {
  position: fixed;
  inset: auto;
  box-sizing: border-box;
  margin: 0;
  padding: 4px;
  overflow: auto;
  border: 1px solid var(--color-border50, var(--color-border));
  border-radius: 14px;
  background: var(--color-control);
  color: var(--fill-primary);
  box-shadow: 0 12px 25px -10px rgb(0 0 0 / .22), 0 2px 5px rgb(0 0 0 / .04);
  cursor: default;
}
.sap-permission-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 10px 3px;
  min-height: 32px;
  color: var(--fill-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.sap-permission-panel button.sap-permission-help {
  flex: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fill-secondary);
  font: inherit;
  cursor: pointer;
}
.sap-permission-panel button.sap-permission-help:hover { text-decoration: underline; }
.sap-permission-panel button.sap-permission-option {
  appearance: none;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 16px;
  gap: 10px;
  align-items: start;
  width: 100%;
  min-height: 58px;
  max-height: none;
  padding: 7px 10px;
  margin: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--fill-primary);
  font: inherit;
  text-align: start;
  white-space: normal;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.sap-permission-panel button.sap-permission-option:is(:hover, :focus-visible):enabled { background: var(--fill-quinary); }
.sap-permission-panel button.sap-permission-option:disabled { opacity: .48; cursor: default; }
.sap-permission-option-icon, .sap-permission-check { display: flex; padding-top: 3px; justify-content: center; }
.sap-permission-option-icon, .sap-permission-option-scope { color: var(--fill-secondary); }
.sap-permission-option-text { display: grid; gap: 2px; min-width: 0; line-height: 1.35; }
.sap-permission-option-label { font-size: 15px; }
.sap-permission-option-scope { font-size: 13px; }
.sap-permission-check { visibility: hidden; }
.sap-permission-option[aria-checked="true"] .sap-permission-check { visibility: visible; }
.sap-permission-option[data-permission="tag-deletion"] :is(.sap-permission-option-label, .sap-permission-option-icon) {
  color: light-dark(#b63113, #ff886b);
}
.sap-chat-composer button.sap-composer-picker-trigger {
  appearance: none;
  display: grid;
  grid-template-columns: 17px minmax(0, 1fr) 13px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  height: auto;
  min-height: 34px;
  max-height: none;
  margin: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--fill-primary);
  font-size: 15px;
  line-height: 20px;
  text-align: start;
  cursor: pointer;
}
.sap-composer-picker-trigger:hover:enabled,
.sap-composer-picker-trigger[aria-expanded="true"] {
  background: var(--fill-quinary);
}
.sap-composer-picker-trigger:disabled {
  color: var(--fill-tertiary);
  cursor: default;
}
.sap-composer-picker-chevron {
  display: flex;
  flex: none;
  color: var(--fill-secondary);
}
.sap-composer-picker-trigger[aria-expanded="true"] .sap-composer-picker-chevron {
  transform: rotate(180deg);
}
.sap-composer-picker-label {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: normal;
}
.sap-composer-picker-option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sap-composer-picker-list {
  position: fixed;
  inset: auto;
  box-sizing: border-box;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--color-border50, var(--color-border));
  border-radius: 12px;
  background: var(--color-control);
  color: var(--fill-primary);
  box-shadow: 0 14px 34px -13px rgba(0, 0, 0, .25), 0 2px 5px rgba(0, 0, 0, .06);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.sap-composer-picker-group + .sap-composer-picker-group {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--color-border50, var(--color-border));
}
.sap-composer-picker-option {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 17px;
  align-items: center;
  gap: 12px;
  min-height: 38px;
  padding: 4px 10px;
  border-radius: 7px;
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
  user-select: none;
}
.sap-composer-picker-option.is-active,
.sap-composer-picker-option:hover {
  background: var(--fill-quinary);
}
.sap-composer-picker-option[aria-disabled="true"] { cursor: default; }
.sap-composer-picker-icon,
.sap-composer-picker-check { display: flex; align-items: center; justify-content: center; }
.sap-composer-picker-icon { color: var(--fill-secondary); }
.sap-composer-picker-icon[data-provider="claude"] { color: #d97858; }
.sap-composer-picker-check { visibility: hidden; }
.sap-composer-picker-option[aria-selected="true"] .sap-composer-picker-check { visibility: visible; }
.sap-composer-picker-status { padding: 6px 10px; color: var(--fill-secondary); font-size: 12px; }
.sap-chat-composer button.sap-composer-send {
  display: grid;
  flex: 0 0 34px;
  place-items: center;
  width: 34px;
  min-width: 34px;
  height: 34px;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: var(--fill-primary);
  color: var(--color-control);
  cursor: pointer;
}
.sap-chat-composer button.sap-composer-send:hover:enabled {
  background: var(--fill-secondary);
}
.sap-chat-composer button.sap-composer-send:disabled {
  background: var(--fill-quinary);
  color: var(--fill-tertiary);
  cursor: default;
}
.sap-chat-composer button:focus-visible {
  outline: 2px solid var(--color-focus-border);
  outline-offset: 1px;
}
`;
