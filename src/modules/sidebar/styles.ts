/**
 * Styles of the docked chat. They are scoped under `.sap-chat` and use
 * Zotero's theme variables, so the section follows Zotero's light and dark
 * themes. The layout follows affectUI's Chat Composer and AI Answer.
 */
export const CHAT_STYLES = `
.sap-chat {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  font-size: 13px;
  line-height: 1.55;
  color: var(--fill-primary);
}
.sap-chat * {
  box-sizing: border-box;
  font-family: inherit;
}
.sap-chat [hidden] {
  display: none !important;
}

.sap-chat-header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 53px;
  padding: 6px 12px 6px 14px;
  border-bottom: 1px solid var(--color-border);
}
.sap-chat-identity {
  display: flex;
  align-items: center;
  justify-content: end;
  margin-inline-start: auto;
  gap: 5px;
  padding: 2px 7px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  min-width: 0;
}
.sap-chat-actions {
  display: flex;
  align-items: center;
  flex: none;
  gap: 2px;
}
.sap-chat-agent {
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sap-chat-status {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  color: var(--fill-secondary);
  font-size: 11px;
  white-space: nowrap;
}
.sap-chat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fill-tertiary);
}
.sap-chat[data-connection="connected"] .sap-chat-dot {
  background: var(--accent-green);
}
.sap-chat[data-connection="error"] .sap-chat-dot {
  background: var(--accent-red);
}
.sap-chat[data-connection="connecting"] .sap-chat-dot {
  animation: sap-chat-pulse 1s ease-in-out infinite;
}
@keyframes sap-chat-pulse {
  50% { opacity: 0.25; }
}

.sap-chat-notice {
  flex: none;
  margin: 10px 12px 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--color-invalid-background);
  color: var(--color-invalid);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.sap-chat-notice-actions {
  margin-top: 6px;
}

.sap-chat-transcript {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  margin: 0;
  padding: 16px 14px 12px;
  overflow-y: auto;
  scrollbar-width: thin;
  overflow-wrap: anywhere;
}
.sap-msg-user {
  align-self: flex-end;
  max-width: 88%;
  padding: 7px 11px;
  border-radius: 8px;
  background: var(--fill-quinary);
  white-space: pre-wrap;
}
.sap-msg-assistant {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  margin: 0;
}
.sap-answer-text > :first-child { margin-top: 0; }
.sap-answer-text > :last-child { margin-bottom: 0; }
.sap-answer-text p, .sap-answer-text ul, .sap-answer-text ol, .sap-answer-text pre {
  margin: 0 0 9px;
}
.sap-answer-text ul, .sap-answer-text ol { padding-inline-start: 22px; }
.sap-answer-text pre {
  padding: 8px 10px;
  overflow: auto;
  background: var(--fill-quinary);
  border-radius: 6px;
}
.sap-answer-text code { font-family: ui-monospace, monospace; }
.sap-answer-text a { color: var(--accent-blue); }
.sap-answer-text .sap-citation {
  background: var(--fill-quinary);
  border-radius: 5px;
  padding: 1px 5px;
  font-size: 0.87em;
  font-weight: 600;
  text-decoration: none;
}
.sap-answer-text .sap-citation:hover { text-decoration: underline; }
.sap-answer-actions { display: flex; }
.sap-msg-assistant[aria-busy="true"]::after {
  content: "";
  width: 6px;
  height: 6px;
  margin-block: 2px;
  border-radius: 50%;
  background: var(--accent-blue);
  animation: sap-chat-pulse 1s ease-in-out infinite;
}
.sap-block-thought {
  color: var(--fill-secondary);
  white-space: pre-wrap;
}
.sap-block-tool {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fill-secondary);
  font-size: 0.92em;
}
.sap-block-tool-icon {
  display: inline-flex;
  flex: none;
  width: 14px;
  height: 14px;
  align-items: center;
  justify-content: center;
}
.sap-block-tool[data-status="completed"] .sap-block-tool-icon {
  color: var(--accent-green);
}
.sap-block-tool[data-status="failed"] .sap-block-tool-icon {
  color: var(--accent-red);
}
.sap-msg-note {
  color: var(--fill-tertiary);
  font-size: 0.92em;
}

.sap-chat-composer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  margin: 0 12px 12px;
  padding: 7px 8px 6px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-control);
}
.sap-chat-composer:focus-within {
  border-color: var(--color-focus-border);
}
.sap-composer-toolbar {
  display: flex;
  justify-content: flex-end;
}
.sap-chat-input {
  width: 100%;
  min-height: 29px;
  max-height: 40vh;
  margin: 0;
  padding: 4px 3px;
  resize: none;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
  line-height: 1.4;
}
.sap-chat-input:focus {
  outline: none;
}
.sap-chat-input::placeholder {
  color: var(--fill-tertiary);
  opacity: 1;
}
.sap-chat-button {
  flex: none;
  min-width: 52px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-control);
  color: var(--fill-primary);
  font-size: inherit;
}
.sap-chat-button:hover:enabled {
  background: var(--fill-quinary);
}
.sap-chat-button:enabled:active {
  background: var(--fill-quarternary);
}
.sap-chat-button:disabled {
  color: var(--fill-tertiary);
}
.sap-chat-button:focus-visible {
  outline: 2px solid var(--color-focus-border);
  outline-offset: 1px;
}
.sap-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  min-width: 27px;
  height: 27px;
  padding: 0;
  border-color: transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--fill-secondary);
}
.sap-composer-send {
  width: 30px;
  min-width: 30px;
  height: 30px;
  background: var(--fill-quinary);
  color: var(--fill-primary);
}
.sap-chat-button[data-variant="primary"] {
  border-color: transparent;
  background: var(--accent-blue);
  color: var(--accent-white);
}
.sap-chat-button[data-variant="primary"]:hover:enabled {
  background: var(--accent-blue);
  filter: brightness(1.1);
}
.sap-chat-button[data-variant="primary"]:disabled {
  background: var(--fill-quarternary);
  color: var(--fill-tertiary);
}
`;
