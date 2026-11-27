export const LIBRARY_STYLES = `
.sap-library-shell {
  display: grid;
  grid-template-columns: clamp(108px, 23%, 176px) minmax(0, 1fr);
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 5px;
  color: var(--fill-primary);
  background: var(--material-sidepane);
}
.sap-library-shell[data-history-collapsed="true"] {
  grid-template-columns: 36px minmax(0, 1fr);
}
.sap-library-nav {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  padding: 8px 6px 8px 2px;
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
.sap-library-nav button[aria-current="true"] { background: var(--fill-quarternary); }
.sap-library-nav button:focus-visible {
  outline: 2px solid var(--color-focus-border);
  outline-offset: -2px;
}
.sap-library-nav-actions {
  display: flex;
  align-items: center;
  gap: 3px;
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
.sap-library-shell[data-history-collapsed="true"] .sap-library-nav-actions {
  flex-direction: column-reverse;
}
.sap-library-shell[data-history-collapsed="true"] .sap-library-new-chat {
  justify-content: center;
  padding-inline: 0;
}
.sap-library-shell[data-history-collapsed="true"] .sap-library-new-chat span { display: none; }
.sap-library-nav h2 {
  margin: 16px 7px 4px;
  color: var(--fill-secondary);
  font-size: 12px;
  font-weight: 500;
}
#sap-library-history:not([hidden]) {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sap-library-threads {
  min-height: 0;
  overflow-y: auto;
}
.sap-library-surface {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--color-border50, var(--color-border));
  border-radius: 8px;
  background: var(--material-background, Field);
}
.sap-library-chat {
  --sap-library-content-width: 680px;
  --sap-composer-border: color-mix(in srgb, var(--fill-primary, CanvasText) 15%, transparent);
  --sap-composer-background: Field;
}
.sap-library-chat .sap-chat-header {
  justify-content: flex-end;
  min-height: 42px;
  padding: 6px 9px;
  border: 0;
}
.sap-library-chat .sap-chat-identity {
  margin-inline-start: 0;
  padding: 0 4px;
  border: 0;
}
.sap-library-chat .sap-chat-transcript {
  padding-inline: max(12px, calc((100% - var(--sap-library-content-width)) / 2));
}
.sap-library-chat .sap-write-history {
  align-self: center;
  width: calc(100% - 24px);
  max-width: var(--sap-library-content-width);
  max-height: 35%;
  overflow-y: auto;
}
.sap-library-compose {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
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
@media (max-width: 520px) {
  .sap-library-chat .sap-chat-agent { max-width: 80px; }
  .sap-library-chat .sap-chat-actions { margin-inline-end: auto; }
}
`;
