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
  background: var(--fill-quinary);
  box-shadow: 0 2px 5px color-mix(in srgb, var(--fill-primary) 7%, transparent);
}
.sap-chat-composer:focus-within {
  border-color: var(--color-focus-border);
}
.sap-composer-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 11px 10px 9px;
  border-radius: 14px;
  background: var(--color-control);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--fill-primary) 11%, transparent);
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
  outline: none;
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
.sap-composer-agent {
  position: relative;
  min-width: 0;
  max-width: calc(100% - 42px);
  color: var(--fill-secondary);
}
.sap-composer-agent-select {
  appearance: none;
  display: block;
  width: 100%;
  height: 29px;
  padding: 0 24px 0 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--fill-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  cursor: pointer;
}
.sap-composer-agent-select:hover:enabled,
.sap-chat-composer button.sap-composer-settings:hover {
  background: var(--fill-quinary);
}
.sap-composer-agent-select:disabled {
  color: var(--fill-tertiary);
  cursor: default;
}
.sap-composer-agent-chevron {
  position: absolute;
  top: 50%;
  display: flex;
  inset-inline-end: 6px;
  transform: translateY(-50%);
  pointer-events: none;
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
.sap-chat-composer button.sap-composer-settings {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  padding: 3px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--fill-secondary);
  font-size: 11px;
  cursor: pointer;
}
.sap-composer-tray {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 4px 10px;
}
.sap-composer-settings svg { flex: none; }
.sap-composer-settings[data-workspace="true"] svg { color: var(--accent-blue); }
.sap-composer-settings-label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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
.sap-composer-agent-select:focus-visible,
.sap-chat-composer button:focus-visible {
  outline: 2px solid var(--color-focus-border);
  outline-offset: 1px;
}
`;
