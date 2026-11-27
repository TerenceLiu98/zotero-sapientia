export const MARGINALIA_STYLES = `
.sap-marginalia-layer {
  position: fixed;
  overflow: hidden;
  z-index: 8;
  pointer-events: none;
  color: var(--fill-primary);
  font: 12px/1.45 system-ui, sans-serif;
}
.sap-marginalia-layer [hidden] { display: none !important; }
.sap-marginalia-layer :is(button, textarea):focus-visible {
  outline: 2px solid var(--color-focus-border, Highlight);
  outline-offset: -1px;
}
.sap-marginalia-card, .sap-marginalia-marker {
  position: absolute;
  box-sizing: border-box;
  pointer-events: auto;
}
.sap-marginalia-card {
  display: grid;
  gap: 6px;
  max-height: min(176px, 80vh);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 8px 9px;
  border: 1px solid var(--color-border);
  border-inline-start: 3px solid var(--sap-annotation-color);
  border-radius: 8px;
  background: var(--material-background, Canvas);
  box-shadow: 0 2px 8px rgb(0 0 0 / .07);
  overflow-wrap: anywhere;
}
.sap-marginalia-card[data-editing="true"] { max-height: min(265px, 85vh); }
.sap-marginalia-card[data-expanded="true"] { z-index: 2; }
.sap-marginalia-header { display: flex; align-items: center; gap: 3px; }
.sap-marginalia-page { flex: 1; color: var(--fill-secondary); font-size: 11px; }
.sap-marginalia-card blockquote,
.sap-marginalia-comment { margin: 0; white-space: pre-wrap; }
.sap-marginalia-card blockquote {
  color: var(--fill-secondary);
  padding-inline-start: 7px;
  border-inline-start: 2px solid var(--color-border);
}
.sap-marginalia-card button, .sap-marginalia-marker {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 24px;
  height: 24px;
  padding: 0 5px;
  border: 0;
  border-radius: 6px;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sap-marginalia-card button { background: transparent; }
.sap-marginalia-card button:hover { background: var(--fill-quinary); }
.sap-marginalia-marker {
  width: 24px;
  padding: 0;
  border: 1px solid var(--color-border);
  background: var(--material-background, Canvas);
  box-shadow: inset 0 -3px var(--sap-annotation-color);
}
.sap-marginalia-card textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  resize: vertical;
  background: var(--material-background, Field);
  color: inherit;
  font: inherit;
}
.sap-marginalia-actions { display: flex; justify-content: flex-end; gap: 3px; }
.sap-marginalia-error { color: var(--color-invalid, #b00020); }
.sap-marginalia-toggle[hidden] { display: none !important; }
`;
