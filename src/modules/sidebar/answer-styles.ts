export const ANSWER_STYLES = `
.sap-answer {
  display: grid;
  gap: 9px;
  min-width: 0;
  color: var(--fill-primary);
}
.sap-answer [hidden] { display: none !important; }
.sap-answer-question {
  margin: 0;
  color: var(--fill-primary);
  font-size: 1.08em;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.sap-answer-sources {
  display: flex;
  align-items: stretch;
  gap: 5px;
  min-width: 0;
  position: relative;
}
.sap-answer-source-row {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  min-width: 0;
}
.sap-answer-source {
  display: grid;
  align-content: start;
  gap: 5px;
  min-width: 0;
  padding: 7px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--fill-primary);
  text-decoration: none;
  line-height: 1.4;
}
.sap-answer-source:hover, .sap-answer-source-more summary:hover {
  background: var(--fill-quinary);
}
.sap-answer-source-label {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--fill-secondary);
  font-size: .87em;
}
.sap-answer-source-label svg, .sap-answer-source-index { flex: none; }
.sap-answer-source-index { margin-inline-start: auto; color: var(--fill-tertiary); }
.sap-answer-source-origin {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sap-answer-source-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
}
.sap-answer-source-more summary {
  display: grid;
  place-items: center;
  width: 32px;
  box-sizing: border-box;
  height: 100%;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  list-style: none;
  font-weight: 600;
}
.sap-answer-source-more summary::-webkit-details-marker { display: none; }
.sap-answer-source-extra {
  position: absolute;
  z-index: 2;
  inset: calc(100% + 4px) 0 auto;
  padding: 5px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--material-sidepane);
}
.sap-answer-writing {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--fill-secondary);
  font-size: .9em;
}
.sap-answer-writing svg {
  color: var(--accent-blue);
  fill: currentColor;
}
.sap-answer .sap-answer-text {
  position: relative;
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.55;
}
.sap-answer-text > :first-child { margin-top: 0; }
.sap-answer-text > :last-child { margin-bottom: 0; }
.sap-answer-text p, .sap-answer-text ul, .sap-answer-text ol, .sap-answer-text pre {
  margin: 0 0 8px;
}
.sap-answer-text ul, .sap-answer-text ol { padding-inline-start: 20px; }
.sap-answer-text pre {
  padding: 8px 10px;
  overflow: auto;
  background: var(--fill-quinary);
  border-radius: 6px;
}
.sap-answer-text code { font-family: ui-monospace, monospace; }
.sap-answer .sap-citation {
  display: inline;
  padding: 1px 5px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--fill-quinary);
  color: var(--fill-secondary);
  font-size: .86em;
  font-weight: 500;
  text-decoration: none;
  box-decoration-break: clone;
}
.sap-answer .sap-citation:hover { color: var(--fill-primary); text-decoration: none; }
.sap-citation-preview {
  display: none;
  position: absolute;
  z-index: 3;
  inset-inline-start: 0;
  inset-inline-end: auto;
  max-inline-size: min(210px, 100%);
  margin-block-start: 1.6em;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--material-sidepane);
  color: var(--fill-secondary);
  pointer-events: none;
  font-size: .89em;
}
.sap-citation-preview strong { color: var(--fill-primary); }
.sap-citation-wrap:not([data-dismissed]):is(:hover, :focus-within) .sap-citation-preview {
  display: inline-grid;
}
.sap-answer-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-block-start: 3px;
  border-block-start: 1px solid var(--color-border);
}
.sap-answer-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
  height: 26px;
  min-width: 26px;
  padding: 0 5px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--fill-secondary);
  font: inherit;
  font-size: .9em;
  cursor: pointer;
}
.sap-answer-action:hover { color: var(--fill-primary); background: var(--fill-quinary); }
.sap-answer-action:disabled { opacity: .55; cursor: default; }
.sap-answer-streaming .sap-answer-action { color: var(--fill-primary); border-color: var(--color-border); }
.sap-answer-streaming .sap-answer-action svg { fill: currentColor; width: 12px; }
.sap-answer :is(a, button, summary):focus-visible { outline: 2px solid var(--color-focus-border); outline-offset: 1px; }
.sap-answer-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`;
