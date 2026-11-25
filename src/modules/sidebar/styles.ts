/**
 * Styles of the chat section. They are scoped under `.sap-chat` and use
 * Zotero's theme variables, so the section follows Zotero's light and dark
 * themes. The layout follows affectUI's Chat Composer and AI Answer.
 */
export const CHAT_STYLES = `
.sap-chat {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  box-sizing: border-box;
  font-size: inherit;
  line-height: 1.45;
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
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0 0 4px;
}
.sap-chat-agent {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sap-chat-status {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  color: var(--fill-secondary);
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
  margin: 0 0 6px;
  padding: 6px 8px;
  border-radius: 4px;
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
  gap: 8px;
  min-height: 80px;
  margin: 0;
  padding: 4px 2px 4px 0;
  overflow-y: auto;
  scrollbar-width: thin;
  overflow-wrap: anywhere;
}
.sap-msg {
  white-space: pre-wrap;
}
.sap-msg-user {
  align-self: flex-end;
  max-width: 92%;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--fill-quinary);
}
.sap-msg-assistant {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sap-block-thought {
  color: var(--fill-secondary);
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
  align-items: flex-end;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--color-border);
}
.sap-chat-input {
  flex: 1;
  min-height: 26px;
  max-height: 40vh;
  margin: 0;
  padding: 4px 6px;
  resize: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-control);
  color: inherit;
  font-size: inherit;
  line-height: 1.4;
}
.sap-chat-input:focus {
  border-color: var(--fill-secondary);
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
