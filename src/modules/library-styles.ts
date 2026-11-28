export const LIBRARY_STYLES = `
.sap-library-shell {
  --sap-library-history-width: clamp(144px, 18.6vw, 238px);
  --sap-library-progress-width: clamp(248px, 21vw, 300px);
  --sap-library-history-track: var(--sap-library-history-width);
  --sap-library-progress-track: 0px;
  --sap-library-panel-gap: 6px;
  --sap-library-panel-motion: 220ms cubic-bezier(.2, .75, .3, 1);
  --sap-library-content-width: min(80%, 750px);
  --sap-library-panel: light-dark(#fff, #242424);
  --sap-library-rail: light-dark(#f7f7f7, #292929);
  --sap-library-line: light-dark(#ededed, #393939);
  position: relative;
  display: grid;
  grid-template-columns: var(--sap-library-history-track) minmax(0, 1fr) var(--sap-library-progress-track);
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 7px;
  color: var(--fill-primary);
  background: var(--sap-library-rail);
  font-size: 13px;
  overflow: clip;
  transition: grid-template-columns var(--sap-library-panel-motion);
}
.sap-library-shell[data-history-collapsed="true"] {
  --sap-library-history-track: 36px;
}
.sap-library-shell[data-progress="true"] {
  --sap-library-progress-track: calc(var(--sap-library-progress-width) + var(--sap-library-panel-gap));
}
.sap-library-shell > [hidden], .sap-library-surface > [hidden] { display: none !important; }
.sap-library-nav {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  padding: 8px 9px 8px 2px;
  font-size: 13px;
}
.sap-library-nav button {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
  min-height: 30px;
  padding: 4px 7px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.sap-library-nav button svg { flex: none; color: var(--fill-secondary); }
.sap-library-nav button span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sap-library-nav button:hover,
.sap-library-nav button[aria-current="true"] { background: light-dark(#ededed, #363636); }
.sap-library-nav button:focus-visible {
  outline: 2px solid var(--color-focus-border);
  outline-offset: -2px;
}
.sap-library-nav-actions {
  display: flex;
  flex-direction: column;
  align-items: start;
  gap: 3px;
  width: calc(var(--sap-library-history-width) - 11px);
}
.sap-library-nav .sap-library-history-toggle {
  display: grid;
  place-items: center;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
}
.sap-library-nav h2 {
  margin: 16px 7px 4px;
  color: var(--fill-secondary);
  font-size: 12px;
  font-weight: 500;
}
#sap-library-history {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: calc(var(--sap-library-history-width) - 11px);
}
#sap-library-history, .sap-library-new-chat span {
  transition: opacity var(--sap-library-panel-motion);
}
.sap-library-shell[data-history-collapsed="true"] #sap-library-history,
.sap-library-shell[data-history-collapsed="true"] .sap-library-new-chat span { opacity: 0; }
.sap-library-threads {
  min-height: 0;
  overflow-y: auto;
}
.sap-library-thread {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  align-items: center;
  border-radius: 7px;
}
.sap-library-thread:hover, .sap-library-thread:focus-within,
.sap-library-thread:has([aria-current="true"]) { background: light-dark(#ededed, #363636); }
.sap-library-thread button { padding-inline: 9px; }
.sap-library-thread button[aria-current="true"] { background: transparent; }
.sap-library-thread .sap-library-delete-thread {
  display: grid;
  place-items: center;
  width: 26px;
  min-height: 24px;
  padding: 0;
  opacity: .65;
}
.sap-library-delete-thread:hover, .sap-library-delete-thread:focus-visible { opacity: 1; }
.sap-library-delete-thread:hover svg { color: light-dark(#b83939, #ff9393); }
.sap-library-delete-dialog {
  box-sizing: border-box;
  width: min(360px, calc(100% - 28px));
  padding: 18px;
  color: var(--fill-primary);
  background: var(--sap-library-panel);
  border: 1px solid var(--sap-library-line);
  border-radius: 11px;
  box-shadow: 0 10px 30px rgb(0 0 0 / .16);
}
.sap-library-delete-dialog::backdrop { background: rgb(0 0 0 / .22); }
.sap-library-delete-dialog h2 {
  margin: 0 0 8px;
  font-size: 15px;
}
.sap-library-delete-dialog p {
  margin: 0 0 16px;
  overflow-wrap: anywhere;
}
.sap-library-delete-actions {
  display: flex;
  gap: 7px;
  justify-content: end;
}
.sap-library-delete-actions .sap-chat-button {
  border-color: var(--sap-library-line);
}
.sap-library-delete-actions .sap-library-delete-confirm {
  color: light-dark(#a91d24, #ffacac);
  background: light-dark(#fbe9ea, #472629);
}
.sap-library-surface {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--sap-library-line);
  border-radius: 11px;
  background: var(--sap-library-panel);
}
.sap-library-inspector-slot {
  position: relative;
  grid-column: 3;
  min-width: 0;
  min-height: 0;
  overflow: clip;
}
.sap-library-inspector {
  position: absolute;
  inset-block: 0;
  inset-inline-start: var(--sap-library-panel-gap);
  width: var(--sap-library-progress-width);
  min-width: 0;
  min-height: 0;
  background: var(--sap-library-panel);
  border: 1px solid var(--sap-library-line);
  border-radius: 11px;
  box-sizing: border-box;
}
.sap-library-inspector .sap-write-review,
.sap-library-inspector .sap-agent-permission {
  width: 100%;
  max-height: none;
  margin: 0;
  --sap-border: var(--sap-library-line);
  --sap-hover: var(--sap-library-rail);
  --sap-control-radius: 7px;
}
.sap-library-inspector [hidden] { display: none !important; }
.sap-library-progress-toggle { position: relative; }
.sap-library-progress-toggle[data-needs-input="true"]::after {
  content: "";
  position: absolute;
  inset: 2px 2px auto auto;
  width: 6px;
  height: 6px;
  background: var(--accent-orange, #db790f);
  border-radius: 50%;
}
.sap-library-chat {
  --sap-composer-border: color-mix(in srgb, var(--fill-primary, CanvasText) 15%, transparent);
  --sap-composer-background: var(--sap-library-panel);
}
.sap-library-chat .sap-chat-header {
  justify-content: flex-end;
  min-height: 38px;
  padding: 6px 9px;
  border: 0;
}
.sap-library-chat .sap-chat-identity {
  margin-inline-start: 0;
  padding: 0 4px;
  border: 0;
}
.sap-library-chat .sap-chat-transcript {
  gap: 18px;
  padding: 15px max(18px, calc((100% - var(--sap-library-content-width)) / 2)) 20px;
  scrollbar-width: thin;
}
.sap-library-chat .sap-msg-user {
  max-width: 80%;
  padding: 9px 13px;
  border-radius: 15px;
  background: light-dark(#f3f3f3, #343434);
  line-height: 1.48;
}
.sap-library-reply-status {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 24px;
  color: light-dark(#6b6b6b, #aeaeae);
  font-size: 12px;
}
.sap-library-writing-icon {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 16px;
  height: 16px;
  color: var(--accent-blue);
}
.sap-library-writing-icon svg {
  transform-origin: 30% 80%;
  animation: sap-library-pen-writing 1.15s ease-in-out infinite;
}
@keyframes sap-library-pen-writing {
  0%, 100% { transform: translate(0, 0) rotate(-9deg); }
  45% { transform: translate(2px, -1px) rotate(7deg); }
  75% { transform: translate(1px, 1px) rotate(-4deg); }
}
@media (prefers-reduced-motion: reduce) {
  .sap-library-writing-icon svg { animation: none; }
}
.sap-library-compose {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.sap-library-chat[data-empty="false"] .sap-library-compose { padding-block-end: 9px; }
.sap-library-chat .sap-chat-composer { max-width: var(--sap-library-content-width); }
.sap-library-chat[data-empty="true"] .sap-library-compose {
  flex: 1;
  justify-content: safe center;
  overflow: auto;
  padding-block: 16px 24px;
}
.sap-library-heading {
  margin: 0 12px 17px;
  color: var(--fill-primary);
  font-size: 23px;
  font-weight: 550;
  line-height: 1.3;
  text-align: center;
}
.sap-library-shortcuts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 8px;
  margin-inline: 12px;
}
.sap-library-shortcuts button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 7px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--fill-secondary);
  font: inherit;
  cursor: pointer;
}
.sap-library-shortcuts button:hover { background: var(--sap-hover); color: var(--fill-primary); }
@media (max-width: 900px) {
  .sap-library-shell[data-progress="true"] {
    --sap-library-progress-track: 0px;
  }
  .sap-library-inspector-slot {
    position: absolute;
    grid-column: auto;
    z-index: 5;
    inset: 7px 7px 7px auto;
    width: min(var(--sap-library-progress-width), calc(100% - 14px));
    overflow: visible;
    transform: translateX(calc(100% + 7px));
    transition: transform var(--sap-library-panel-motion), visibility 0s 220ms;
    visibility: hidden;
  }
  .sap-library-inspector-slot:dir(rtl) {
    inset: 7px auto 7px 7px;
    transform: translateX(calc(-100% - 7px));
  }
  .sap-library-shell[data-progress="true"] .sap-library-inspector-slot {
    transform: none;
    transition-delay: 0s;
    visibility: visible;
  }
  .sap-library-inspector {
    inset-inline-start: 0;
    width: 100%;
    box-shadow: 0 5px 25px rgb(0 0 0 / .15);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sap-library-shell,
  .sap-library-shell #sap-library-history,
  .sap-library-shell .sap-library-new-chat span,
  .sap-library-shell .sap-library-inspector-slot { transition: none; }
}
@media (max-width: 520px) {
  .sap-library-shell { --sap-library-history-width: 106px; }
  .sap-library-chat .sap-chat-agent { max-width: 80px; }
  .sap-library-chat .sap-chat-actions { margin-inline-end: auto; }
  .sap-library-chat .sap-chat-transcript { padding-inline: 11px; }
  .sap-library-chat .sap-chat-composer { max-width: none; }
}
`;
