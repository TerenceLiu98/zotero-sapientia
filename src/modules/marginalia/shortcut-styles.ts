export const SELECTION_RESULT_STYLES = `
.sap-selection-result {
  position: fixed;
  z-index: 1000;
  box-sizing: border-box;
  width: min(340px, calc(100vw - 16px));
  max-height: min(380px, calc(100vh - 16px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border, GrayText);
  border-radius: 8px;
  background: var(--color-background, Canvas);
  color: var(--fill-primary, CanvasText);
  font: 13px/1.45 system-ui, sans-serif;
  box-shadow: 0 8px 24px -12px rgb(0 0 0 / .32);
}
.sap-selection-result header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.sap-selection-result-content {
  min-height: 0;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  user-select: text;
}
.sap-selection-result-actions:not([hidden]) {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.sap-selection-result button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 3px 8px;
  border: 0;
  border-radius: 6px;
  background: var(--fill-quinary, transparent);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sap-selection-result header button { background: transparent; }
.sap-selection-result button:hover { background: var(--fill-quarternary, ButtonFace); }
.sap-selection-result button:focus-visible { outline: 2px solid var(--color-focus-border, Highlight); }
`;
