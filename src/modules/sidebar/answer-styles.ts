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
.sap-answer-source-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fill-secondary);
  font-size: 11px;
}
.sap-source-stack { display: inline-flex; padding-inline-start: 3px; }
.sap-source-stack svg {
  box-sizing: content-box;
  margin-inline-start: -3px;
  padding: 2px;
  border: 1px solid var(--material-sidepane);
  border-radius: 4px;
  background: var(--fill-quinary);
}
.sap-answer-sources {
  display: flex;
  gap: 5px;
  min-width: 0;
  padding: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}
.sap-answer button.sap-answer-source {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  max-width: 80%;
  min-width: 0;
  height: auto;
  min-height: 25px;
  padding: 3px 6px;
  margin: 0;
  border: 1px solid var(--color-border50, var(--color-border));
  border-radius: 5px;
  background: transparent;
  color: var(--fill-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.sap-answer button.sap-answer-source:is(:hover, [aria-pressed="true"]) {
  background: var(--fill-quinary);
  color: var(--fill-primary);
}
.sap-answer-source span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sap-answer-source svg, .sap-answer-source-index { flex: none; }
.sap-answer-source-index { color: var(--fill-tertiary); }
.sap-answer-source-preview {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border50, var(--color-border));
  border-radius: 8px;
  overflow-wrap: anywhere;
}
.sap-source-preview-header, .sap-source-preview-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--fill-secondary);
  font-size: 11px;
}
.sap-source-preview-header svg { flex: none; }
.sap-source-preview-origin {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sap-answer-source-preview blockquote {
  padding-inline-start: 7px;
  margin: 0;
  border-inline-start: 2px solid var(--color-border);
  color: var(--fill-secondary);
  font-size: 12px;
}
.sap-source-preview-actions { flex-wrap: wrap; }
.sap-source-preview-actions .sap-source-open { border-color: var(--color-border); text-decoration: none; }
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
  user-select: text;
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
.sap-answer-text .katex { font-family: KaTeX_Main, "Times New Roman", serif; }
.sap-answer-text .katex-block {
  overflow-x: auto;
  overflow-wrap: normal;
  scrollbar-width: thin;
}
.sap-answer .sap-citation-index {
  display: inline-block;
  min-width: 1.35em;
  padding: 0 3px;
  border-radius: 4px;
  background: var(--fill-quinary);
  color: var(--fill-secondary);
  font-size: .8em;
  font-weight: 500;
  text-align: center;
  text-decoration: none;
  vertical-align: .12em;
}
.sap-answer .sap-citation:is(:hover, [aria-expanded="true"]) {
  background: var(--fill-quarternary);
  color: var(--fill-primary);
}
.sap-answer .sap-answer-has-source { color: var(--fill-secondary); }
.sap-answer-source-match {
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
  color: var(--fill-primary);
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
