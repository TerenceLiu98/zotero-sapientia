import { ANSWER_STYLES } from "./answer-styles";
import { COMPOSER_STYLES } from "./composer-styles";

export const CHAT_STYLES =
  `
.sap-chat {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  height: 100%;
  font-size: 13px;
  line-height: 1.55;
  color: var(--fill-primary);
}
.sap-chat, .sap-chat * { box-sizing: border-box; font-family: inherit; }
.sap-chat [hidden] { display: none !important; }
.sap-chat-header {
  display: flex;
  align-items: center;
  flex: none;
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
.sap-chat-actions { display: flex; align-items: center; flex: none; gap: 2px; }
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
.sap-chat-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fill-tertiary); }
.sap-chat[data-connection="connected"] .sap-chat-dot { background: var(--accent-green); }
.sap-chat[data-connection="error"] .sap-chat-dot { background: var(--accent-red); }
.sap-chat[data-connection="connecting"] .sap-chat-dot { animation: sap-chat-pulse 1s ease-in-out infinite; }
@keyframes sap-chat-pulse { 50% { opacity: 0.25; } }

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
.sap-chat-notice-actions { margin-top: 6px; }
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
.sap-msg-assistant { display: flex; flex-direction: column; gap: 10px; min-width: 0; margin: 0; }
.sap-msg-note { color: var(--fill-secondary); font-size: 12px; }
.sap-chat-context { flex: none; min-width: 0; padding: 0 14px 6px; }
.sap-context-paper, .sap-context-quote, .sap-context-add {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.sap-context-paper svg, .sap-context-quote svg { flex: none; }
.sap-context-title, .sap-turn-source { overflow-wrap: anywhere; }
.sap-context-title { font-weight: 600; }
.sap-context-materials { display: flex; flex-wrap: wrap; gap: 2px 10px; }
.sap-context-materials, .sap-context-notice, .sap-turn-source { color: var(--fill-secondary); font-size: 11px; }
.sap-context-add { margin-block: 3px; }
.sap-context-attached { max-height: 112px; overflow: auto; }
.sap-context-quote { margin-block: 4px; padding: 3px 4px 3px 7px; border-radius: 6px; background: var(--fill-quinary); }
.sap-context-quote-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sap-context-quote-text strong { margin-inline-end: 6px; }
.sap-context-notice { margin: 3px 0 0; }

.sap-thinking { min-width: 0; color: var(--fill-secondary); font-size: 13px; }
.sap-thinking-header {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 25px;
  width: fit-content;
  max-width: 100%;
  border-radius: 4px;
  cursor: pointer;
  list-style: none;
}
.sap-thinking-header::-webkit-details-marker { display: none; }
.sap-thinking-header:hover { color: var(--fill-primary); }
.sap-thinking-icon, .sap-thinking-chevron, .sap-thinking-step-icon {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
}
.sap-thinking-time { color: var(--fill-tertiary); font-variant-numeric: tabular-nums; }
.sap-thinking-chevron { margin-inline-start: 1px; opacity: .65; }
.sap-thinking[open] .sap-thinking-chevron { transform: rotate(180deg); }
.sap-thinking-pixels { display: grid; grid-template-columns: repeat(3, 3px); gap: 1px; }
.sap-thinking-pixels span {
  width: 3px;
  height: 3px;
  border-radius: .6px;
  background: var(--accent-blue);
  opacity: .35;
  animation: sap-chat-pulse 1.2s ease-in-out infinite alternate;
}
.sap-thinking-pixels span:nth-child(3n+1) { animation-delay: .15s; opacity: .8; }
.sap-thinking-pixels span:nth-child(3n+2) { animation-delay: .4s; opacity: .55; }
.sap-thinking-pixels span:nth-child(n+7) { animation-delay: .7s; }
.sap-thinking-steps {
  display: grid;
  gap: 8px;
  margin: 9px 0 5px 7px;
  padding: 0;
  list-style: none;
  border-inline-start: 1px solid var(--color-border);
}
.sap-thinking-step {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
  margin-inline-start: -8px;
  padding-inline-end: 4px;
  white-space: pre-wrap;
}
.sap-thinking-step-icon { background: var(--material-sidepane); color: var(--fill-tertiary); }
.sap-thinking-step[data-status="in_progress"] .sap-thinking-step-icon { color: var(--accent-blue); }
.sap-thinking-step[data-status="failed"] .sap-thinking-step-icon { color: var(--accent-red); }
@media (prefers-reduced-motion: reduce) {
  .sap-thinking-pixels span, .sap-chat .sap-chat-dot { animation: none; }
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
.sap-chat-button:hover:enabled { background: var(--fill-quinary); }
.sap-chat-button:enabled:active { background: var(--fill-quarternary); }
.sap-chat-button:disabled { color: var(--fill-tertiary); }
.sap-chat-button:focus-visible, .sap-thinking-header:focus-visible {
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
` +
  COMPOSER_STYLES +
  ANSWER_STYLES;
