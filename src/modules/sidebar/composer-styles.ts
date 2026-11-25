export const COMPOSER_STYLES = `
.sap-chat-composer {
  display: flex;
  flex: none;
  flex-direction: column;
  align-self: center;
  width: calc(100% - 24px);
  min-width: 0;
  max-width: 680px;
  margin-bottom: 12px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-control);
}
.sap-composer-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 11px 10px 9px;
  cursor: text;
}
.sap-chat-composer .sap-chat-input {
  width: 100%;
  min-height: 48px;
  max-height: 35vh;
  margin: 0;
  padding: 2px 3px;
  resize: none;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
  line-height: 1.5;
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
  min-width: 0;
  max-width: calc(100% - 42px);
}
.sap-composer-picker-trigger {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  height: 34px;
  padding: 0 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--fill-primary);
  font-size: 14px;
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
.sap-composer-picker-label,
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
}
.sap-chat-composer button.sap-composer-send {
  display: grid;
  flex: 0 0 34px;
  place-items: center;
  width: 34px;
  min-width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  cursor: pointer;
}
.sap-chat-composer button.sap-composer-send {
  border-radius: 8px;
  background: var(--fill-primary);
  color: var(--color-control);
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
