export const MARGINALIA_STYLES = `
.sap-marginalia-layer {
  position: fixed;
  overflow: hidden;
  z-index: 8;
  pointer-events: none;
  color: var(--fill-primary, CanvasText);
  font: 13px/1.4 system-ui, sans-serif;
}
.sap-marginalia-layer [hidden] { display: none !important; }
.sap-marginalia-layer button:focus-visible {
  outline: 2px solid var(--color-focus-border, Highlight);
  outline-offset: -1px;
}
.sap-marginalia-connectors {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.sap-marginalia-connectors path {
  fill: none;
  stroke: var(--sap-annotation-color);
  stroke-width: 1.6;
  opacity: .8;
}
.sap-marginalia-card, .sap-marginalia-marker {
  position: absolute;
  box-sizing: border-box;
  pointer-events: auto;
}
.sap-marginalia-card {
  --sap-note-border: color-mix(in srgb, var(--sap-annotation-color) 85%, Canvas);
  --sap-note-surface: light-dark(#fff, #242424);
  --sap-note-muted: light-dark(#737373, #aeaeae);
  display: grid;
  gap: 7px;
  padding: 9px 10px;
  border: 1px solid var(--sap-note-border);
  border-radius: 8px;
  background: var(--sap-note-surface);
  box-shadow: 0 2px 8px rgb(0 0 0 / .07);
  overflow-wrap: anywhere;
}
.sap-marginalia-card[data-expanded="true"],
.sap-marginalia-card[data-editing="true"] { z-index: 1; }
.sap-marginalia-card[data-editing="true"] {
  box-shadow: 0 5px 24px rgb(0 0 0 / .12);
}
.sap-marginalia-card[data-menu-open="true"] { z-index: 2; }
.sap-marginalia-header, .sap-marginalia-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.sap-marginalia-type {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 7px;
  color: color-mix(in srgb, var(--sap-annotation-color) 63%, CanvasText);
  background: color-mix(in srgb, var(--sap-annotation-color) 24%, var(--sap-note-surface));
}
.sap-marginalia-page {
  flex: 1;
  margin-inline-start: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sap-note-muted);
  font-size: 11px;
}
.sap-marginalia-card blockquote, .sap-marginalia-comment {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  margin: 0;
  min-width: 0;
  max-height: 6.5em;
  overflow: hidden;
  white-space: pre-wrap;
}
.sap-marginalia-card blockquote {
  -webkit-line-clamp: 3;
  color: var(--sap-note-muted);
  padding-inline-start: 8px;
  border-inline-start: 2px solid var(--sap-note-border);
  font-size: 12px;
}
.sap-marginalia-comment {
  -webkit-line-clamp: 2;
  font-weight: 500;
}
.sap-marginalia-card[data-expanded="true"] .sap-marginalia-comment {
  display: block;
  max-height: min(240px, 34vh);
  overflow: auto;
  overscroll-behavior: contain;
}
.sap-marginalia-card[data-expanded="true"] .sap-marginalia-disclosure svg {
  transform: rotate(180deg);
}
.sap-marginalia-icon, .sap-marginalia-marker, .sap-marginalia-menu button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sap-marginalia-icon {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 6px;
  color: var(--sap-note-muted);
}
.sap-marginalia-header .sap-marginalia-icon svg { width: 14px; height: 14px; }
.sap-marginalia-icon:not(:disabled):hover, .sap-marginalia-icon[aria-expanded="true"],
.sap-marginalia-menu button:hover { background: var(--fill-quinary, ButtonFace); }
.sap-marginalia-disclosure[aria-expanded="true"] { background: transparent; }
.sap-marginalia-icon:disabled { opacity: .45; cursor: default; }
.sap-marginalia-marker {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--sap-annotation-color);
  border-radius: 6px;
  color: color-mix(in srgb, var(--sap-annotation-color) 55%, CanvasText);
  background: color-mix(in srgb, var(--sap-annotation-color) 21%, Canvas);
}
.sap-marginalia-tags { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.sap-marginalia-tags span {
  max-width: 100%;
  padding: 1px 5px;
  border: 1px solid light-dark(#e4e4e4, #484848);
  border-radius: 5px;
  color: var(--sap-note-muted);
  background: light-dark(#f0f0f0, #353535);
  font-size: 10px;
}
.sap-marginalia-editor {
  position: relative;
  min-width: 0;
  border: 1px solid var(--sap-note-border);
  border-radius: 7px;
}
.sap-marginalia-card textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 61px;
  max-height: min(225px, 36vh);
  padding: 6px 8px 0;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: inherit;
  font: inherit;
}
.sap-marginalia-actions { justify-content: flex-end; padding: 2px 4px 3px 8px; }
.sap-marginalia-count {
  flex: 1;
  min-width: 0;
  color: var(--sap-note-muted);
  font-size: 10px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.sap-marginalia-error {
  padding: 0 8px 4px;
  color: var(--color-invalid, #b00020);
  font-size: 11px;
}
.sap-marginalia-menu {
  position: absolute;
  z-index: 2;
  top: calc(100% + 4px);
  right: 0;
  display: grid;
  gap: 2px;
  min-width: 144px;
  padding: 5px;
  border: 1px solid light-dark(#ebebeb, #3d3d3d);
  border-radius: 8px;
  background: var(--sap-note-surface);
  box-shadow: 0 7px 23px rgb(0 0 0 / .14);
}
.sap-marginalia-ai-menu { right: auto; left: calc(100% - 78px); }
.sap-marginalia-options { min-width: 70px; padding: 4px; }
.sap-marginalia-options button { min-height: 27px; gap: 6px; }
.sap-marginalia-ai-menu.sap-menu-inset { right: 0; left: auto; }
.sap-marginalia-menu.sap-menu-above { top: auto; bottom: calc(100% + 4px); }
.sap-marginalia-menu button {
  min-height: 32px;
  padding: 4px 7px;
  justify-content: flex-start;
  gap: 8px;
  border-radius: 5px;
  white-space: nowrap;
  font-weight: 500;
}
.sap-marginalia-toggle[hidden] { display: none !important; }
`;
