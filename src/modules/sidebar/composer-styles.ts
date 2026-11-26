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
  border: 1px solid var(--sap-border);
  border-radius: 20px;
  background: var(--material-button);
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
  border: 1px solid var(--sap-border);
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
  min-width: 0;
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
  border-radius: var(--sap-control-radius);
  background: transparent;
  color: var(--fill-primary);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.sap-permission-trigger:is(:hover, [aria-expanded="true"]) { background: var(--sap-hover); }
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
  border: 1px solid var(--sap-border);
  border-radius: var(--sap-menu-radius);
  background: var(--material-button);
  color: var(--fill-primary);
  box-shadow: var(--sap-menu-shadow);
  cursor: default;
}
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
  border-radius: var(--sap-control-radius);
  background: transparent;
  color: var(--fill-primary);
  font: inherit;
  text-align: start;
  white-space: normal;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.sap-permission-panel button.sap-permission-option:is(:hover, :focus-visible):enabled { background: var(--sap-hover); }
.sap-permission-panel button.sap-permission-option[aria-checked="true"] { background: var(--sap-hover); }
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
  display: flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: 100%;
  min-width: 0;
  height: auto;
  min-height: 34px;
  max-height: none;
  margin: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--sap-control-radius);
  background: transparent;
  color: var(--fill-primary);
  font-size: 14px;
  line-height: 20px;
  text-align: start;
  cursor: pointer;
}
.sap-composer-picker-trigger .sap-composer-picker-icon { flex: none; width: 17px; }
.sap-composer-picker-trigger:hover:enabled,
.sap-composer-picker-trigger[aria-expanded="true"] {
  background: var(--sap-hover);
}
.sap-composer-picker-trigger:disabled {
  color: var(--fill-tertiary);
  cursor: default;
}
.sap-composer-picker-label,
.sap-composer-picker-option-label {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}
.sap-composer-picker-list:popover-open {
  position: fixed;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  grid-template-rows: minmax(0, 1fr);
  inset: auto;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 1px solid var(--sap-border);
  border-radius: var(--sap-menu-radius);
  background: var(--material-button);
  color: var(--fill-primary);
  box-shadow: var(--sap-menu-shadow);
  overflow: hidden;
  overscroll-behavior: contain;
}
.sap-composer-picker-agents {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow: clip;
  padding: 7px 5px;
  border-inline-end: 1px solid var(--sap-border);
}
.sap-composer-picker-list button:is(.sap-composer-picker-agent, .sap-composer-picker-level) {
  appearance: none;
  position: relative;
  min-width: 0;
  margin: 0;
  border: 0;
  border-radius: var(--sap-control-radius);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sap-composer-picker-list button.sap-composer-picker-agent {
  width: 32px;
  height: 34px;
  padding: 0;
  color: var(--fill-secondary);
}
.sap-composer-picker-list button[aria-pressed="true"] { color: var(--fill-primary); }
.sap-composer-picker-agent[aria-pressed="true"]::after {
  position: absolute;
  inset-block: 7px;
  inset-inline-end: -4px;
  width: 3px;
  border-radius: 2px;
  background: var(--color-focus-border);
  content: "";
}
.sap-composer-picker-main, .sap-composer-picker-reasoning {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 0 8px 8px;
}
.sap-composer-picker-models, .sap-composer-picker-levels {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
}
.sap-composer-picker-search {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-height: 43px;
  padding: 0 7px;
  margin-bottom: 5px;
  border-bottom: 1px solid var(--sap-border);
  background: var(--material-button);
  color: var(--fill-secondary);
  cursor: text;
}
.sap-composer-picker-search svg { flex: none; }
.sap-composer-picker-search input {
  appearance: none;
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 5px 1px;
  margin: 0;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--fill-primary);
  font: inherit;
  font-size: 14px;
}
.sap-composer-picker-search input::placeholder { color: var(--fill-secondary); opacity: 1; }
.sap-composer-picker-search input:focus-visible { outline-offset: 0; }
.sap-composer-picker-reasoning {
  width: 178px;
  border-inline-start: 1px solid var(--sap-border);
}
.sap-composer-picker-reasoning-title {
  flex: none;
  padding: 13px 8px 12px;
  margin-bottom: 5px;
  border-bottom: 1px solid var(--sap-border);
  color: var(--fill-secondary);
  font-size: 13px;
  line-height: 18px;
}
.sap-composer-picker-list button.sap-composer-picker-level {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  text-align: start;
  white-space: normal;
  overflow-wrap: anywhere;
}
.sap-composer-picker-list.is-compact:popover-open { grid-template-columns: 44px minmax(0, 1fr); }
.sap-composer-picker-list.is-compact:popover-open:has(.sap-composer-picker-reasoning:not([hidden])) {
  grid-template-rows: repeat(2, minmax(0, 1fr));
}
.sap-composer-picker-list.is-compact:has(.sap-composer-picker-reasoning:not([hidden])) .sap-composer-picker-agents { grid-row: 1 / span 2; }
.sap-composer-picker-list.is-compact .sap-composer-picker-reasoning {
  grid-column: 2;
  width: auto;
  border-inline-start: 0;
  border-top: 1px solid var(--sap-border);
}
.sap-composer-picker-option {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 17px;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 4px 8px;
  border-radius: var(--sap-control-radius);
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
  user-select: none;
}
.sap-composer-picker-option.is-active,
.sap-composer-picker-list button:is(.sap-composer-picker-agent, .sap-composer-picker-level):is(:hover, :focus-visible) {
  background: var(--sap-hover);
}
.sap-composer-picker-list [aria-disabled="true"] { opacity: .5; cursor: default; }
.sap-composer-picker-icon,
.sap-composer-picker-check { display: flex; align-items: center; justify-content: center; }
.sap-composer-picker-icon { color: var(--fill-secondary); }
.sap-composer-picker-icon picture,
.sap-composer-provider-image { display: block; }
.sap-composer-provider-image { object-fit: contain; }
.sap-composer-picker-check { visibility: hidden; }
.sap-composer-picker-option[aria-selected="true"] .sap-composer-picker-check,
.sap-composer-picker-level[aria-pressed="true"] .sap-composer-picker-check { visibility: visible; }
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
  border-radius: var(--sap-control-radius);
  background: var(--fill-primary);
  color: var(--color-background);
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
`;
