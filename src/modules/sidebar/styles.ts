import { SURFACE_STYLES } from "../ui/styles";
import { ANSWER_STYLES } from "./answer-styles";
import { COMPOSER_STYLES } from "./composer-styles";

export const CHAT_STYLES =
  SURFACE_STYLES +
  `
.sap-chat {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  height: 100%;
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
.sap-agent-permission {
  align-self: center;
  box-sizing: border-box;
  flex: none;
  width: calc(100% - 24px);
  max-width: 680px;
  margin: 0 0 8px;
  padding: 8px 10px;
  border: 1px solid var(--sap-border);
  border-radius: 8px;
  overflow-wrap: anywhere;
}
.sap-agent-permission-details {
  max-height: 100px;
  overflow: auto;
  margin: 6px 0 0;
  white-space: pre-wrap;
  color: var(--fill-secondary);
}
.sap-agent-permission-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
.sap-chat-transcript {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  margin: 0;
  padding: 16px 14px 12px;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
.sap-msg-user {
  align-self: flex-end;
  max-width: 88%;
  padding: 7px 11px;
  border-radius: var(--sap-control-radius);
  background: var(--fill-quinary);
  white-space: pre-wrap;
}
.sap-sent-selection {
  margin-block-end: 6px;
  padding: 4px 6px;
  border-inline-start: 2px solid var(--color-border);
  font-size: 12px;
}
.sap-sent-selection summary { cursor: pointer; white-space: normal; }
.sap-sent-selection summary svg { margin-inline: 2px 5px; vertical-align: text-bottom; }
.sap-sent-selection-text { margin-block-start: 5px; user-select: text; }
.sap-sent-selection-source { color: var(--fill-secondary); }
.sap-sent-selection-source:empty { display: none; }
.sap-msg-assistant { display: flex; flex-direction: column; gap: 10px; min-width: 0; margin: 0; }
.sap-msg-note { color: var(--fill-secondary); font-size: 12px; }
.sap-chat-context { flex: none; min-width: 0; padding: 0 14px 6px; }
.sap-context-paper {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.sap-context-paper svg { flex: none; }
.sap-context-title, .sap-turn-source { overflow-wrap: anywhere; }
.sap-context-title { font-weight: 600; }
.sap-turn-source { color: var(--fill-secondary); font-size: 11px; }
.sap-chat button.sap-answer-ask {
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 4px 9px;
  border: 1px solid var(--sap-border);
  border-radius: var(--sap-control-radius);
  background: var(--material-button);
  color: var(--fill-primary);
  box-shadow: var(--sap-menu-shadow);
  font-size: 12px;
}

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
.sap-thinking-orb {
  position: relative;
  display: inline-block;
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--accent-blue);
  animation: sap-orb-turn 6s linear infinite;
}
.sap-thinking-orb > span {
  position: absolute;
  width: 1.4px;
  height: 1.4px;
  border-radius: 50%;
  background: currentColor;
  opacity: var(--depth);
  transform: translate(-50%, -50%);
  animation: sap-orb-pulse 1.8s ease-in-out infinite alternate;
}
@keyframes sap-orb-turn {
  0% { transform: rotate(0deg); }
  25% { transform: rotate(90deg) scaleX(.86); }
  50% { transform: rotate(180deg); }
  75% { transform: rotate(270deg) scaleX(.86); }
  100% { transform: rotate(360deg); }
}
@keyframes sap-orb-pulse {
  to { opacity: calc(var(--depth) * .5); transform: translate(-50%, -50%) scale(.62); }
}
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
  .sap-thinking-orb, .sap-thinking-orb > span, .sap-chat .sap-chat-dot { animation: none; }
}

.sap-chat-button {
  flex: none;
  min-width: 52px;
  min-height: var(--sap-control-size);
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--sap-control-radius);
  background: var(--material-button);
  color: var(--fill-primary);
  font-size: inherit;
}
.sap-chat-button:hover:enabled { background: var(--sap-hover); }
.sap-chat-button:enabled:active { background: var(--sap-pressed); }
.sap-chat-button:disabled { color: var(--fill-tertiary); }
.sap-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--sap-control-size);
  min-width: var(--sap-control-size);
  height: var(--sap-control-size);
  padding: 0;
  border-color: transparent;
  border-radius: var(--sap-control-radius);
  background: transparent;
  color: var(--fill-secondary);
}
.sap-write-history {
  flex: none;
  min-width: 0;
  margin: 6px 10px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow-wrap: anywhere;
}
.sap-write-review {
  flex: none;
  align-self: center;
  width: calc(100% - 24px);
  max-width: 460px;
  min-width: 0;
  margin: 4px 0 9px;
  padding: 14px;
  border: 1px solid var(--sap-border);
  border-radius: 16px;
  background: var(--material-button);
  color: var(--fill-primary);
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.sap-write-header { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.sap-write-symbol {
  display: grid;
  flex: 0 0 32px;
  place-items: center;
  inline-size: 32px;
  block-size: 32px;
  border: 1px solid var(--sap-border);
  border-radius: var(--sap-control-radius);
}
.sap-write-heading { flex: 1; min-inline-size: 0; }
.sap-write-heading h3 { margin: 0; font-size: 13px; line-height: 1.45; font-weight: 600; }
.sap-write-subtitle { margin: 2px 0 0; color: var(--fill-secondary); font-size: 12px; }
.sap-write-badge {
  flex: none;
  padding: 3px 6px;
  border-radius: 6px;
  background: var(--fill-quinary);
  color: var(--fill-secondary);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
}
.sap-write-badge[data-treatment="medium"] {
  background: light-dark(#faf2dc, #40371e);
  color: light-dark(#755100, #f4ca6a);
}
.sap-write-badge[data-treatment="approved"] {
  background: color-mix(in srgb, var(--accent-green) 14%, transparent);
  color: var(--fill-primary);
}
.sap-write-review > .sap-write-list {
  margin-block-start: 12px;
  padding-block-start: 10px;
  border-block-start: 1px solid var(--sap-border);
}
.sap-write-review .sap-write-row { padding: 0 0 9px; border: 0; }
.sap-write-review .sap-write-row:last-child { padding-bottom: 0; }
.sap-write-review .sap-write-row + .sap-write-row {
  padding-block-start: 9px;
  border-block-start: 1px solid var(--sap-border);
}
.sap-write-operation { display: block; margin-bottom: 4px; font-weight: 600; }
.sap-write-fields {
  display: grid;
  grid-template-columns: minmax(42px, max-content) minmax(0, 1fr);
  gap: 5px 10px;
  margin: 0;
  font-size: 12px;
}
.sap-write-fields dt { color: var(--fill-secondary); }
.sap-write-fields dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.sap-write-metadata-diff { display: grid; gap: 3px; white-space: pre-wrap; }
.sap-write-metadata-diff del { color: var(--fill-secondary); }
.sap-write-metadata-diff ins { font-weight: 600; text-decoration: none; }
.sap-write-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 22vh;
  overflow: auto;
}
.sap-write-row { padding: 5px 2px; border-top: 1px solid var(--color-border); }
.sap-write-note {
  min-inline-size: 0;
  margin: 0;
  padding-inline-start: 8px;
  border-inline-start: 2px solid var(--color-border);
  overflow: auto;
  overflow-wrap: anywhere;
  user-select: text;
}
.sap-write-note :is(p, ul, ol, pre, blockquote, h1, h2, h3, h4, h5, h6) { margin: 0 0 5px; }
.sap-write-note > :last-child { margin-bottom: 0; }
.sap-write-note :is(ul, ol) { padding-inline-start: 19px; }
.sap-write-note :is(h1, h2, h3, h4, h5, h6) { font-size: inherit; }
.sap-write-note pre { white-space: pre-wrap; }
.sap-write-note a[title] { text-decoration: underline; }
.sap-write-tags { margin: 0; padding-inline-start: 16px; }
.sap-write-target, .sap-write-status { font-size: 11px; color: var(--fill-secondary); }
.sap-write-error { color: var(--color-invalid); }
.sap-write-actions {
  display: flex;
  align-items: center;
  justify-content: end;
  flex-wrap: wrap;
  gap: 5px;
  margin-block-start: 12px;
  padding-block-start: 11px;
  border-block-start: 1px solid var(--sap-border);
}
.sap-write-actions .sap-write-status { margin-inline-end: auto; }
.sap-write-review button.sap-write-action {
  min-width: 0;
  height: 33px;
  padding: 0 10px;
  margin: 0;
  border: 1px solid transparent;
  border-radius: var(--sap-control-radius);
  background: transparent;
  color: var(--fill-primary);
  font-size: 12px;
  cursor: pointer;
}
.sap-write-review button.sap-write-action:hover:enabled { background: var(--sap-hover); }
.sap-write-review button.sap-write-action.sap-write-approve {
  background: var(--fill-primary);
  color: var(--color-background);
}
.sap-write-review button.sap-write-action.sap-write-approve:hover:enabled {
  background: var(--fill-secondary);
}
.sap-write-review button.sap-write-action:disabled { color: var(--fill-tertiary); cursor: default; }
.sap-write-review[data-phase="resolved"] { padding-block: 9px; }
.sap-write-review[data-phase="resolved"] .sap-write-header { align-items: center; gap: 5px; }
.sap-write-review[data-phase="resolved"] .sap-write-symbol { flex-basis: 25px; inline-size: 25px; block-size: 25px; border: 0; }
.sap-write-review[data-phase="resolved"] .sap-write-subtitle { display: none; }
.sap-write-review[data-phase="resolved"] .sap-write-heading h3 {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.sap-write-review button[aria-expanded="true"] svg { transform: rotate(180deg); }
.sap-write-review[data-phase="running"] .sap-write-symbol svg { animation: sap-write-spin 1.4s linear infinite; }
@keyframes sap-write-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .sap-write-review[data-phase="running"] .sap-write-symbol svg { animation: none; }
}
.sap-write-history-row { display: flex; justify-content: space-between; align-items: start; gap: 6px; }
.sap-write-history-row > div { min-width: 0; }
.sap-write-history-row > button { flex: none; }
` +
  COMPOSER_STYLES +
  ANSWER_STYLES;
