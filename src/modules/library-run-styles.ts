export const LIBRARY_RUN_STYLES = `
.sap-library-run-inspector, .sap-library-run-surface {
  --run-border: var(--sap-library-line);
  --run-surface: var(--material-background, Field);
  --run-muted: light-dark(#6b6b6b, #aeaeae);
  --run-panel: light-dark(#f7f7f7, #282828);
  --run-blue: var(--accent-blue, #5589f3);
  --run-orange: light-dark(#bb5714, #f4a468);
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  color: var(--fill-primary, CanvasText);
  font: 12px/1.45 system-ui, sans-serif;
  background: var(--run-surface);
}
.sap-library-run-inspector *, .sap-library-run-surface * { box-sizing: border-box; }
.sap-library-run-inspector [hidden], .sap-library-run-surface [hidden] { display: none !important; }
.sap-library-run-inspector {
  overflow: auto;
  padding: 12px 16px;
}
.sap-library-run-inspector .sap-library-close-progress {
  position: absolute;
  inset: 9px 10px auto auto;
}
.sap-library-run-section {
  padding-block: 14px;
  border-block-end: 1px solid var(--run-border);
}
.sap-library-run-section:first-of-type { padding-block-start: 0; padding-inline-end: 20px; }
.sap-library-run-section > summary, .sap-library-run-output summary, .sap-library-run-tool summary {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
  list-style: none;
  cursor: pointer;
}
.sap-library-run-section > summary { font-weight: 600; }
.sap-library-run-section > summary svg,
.sap-library-run-tool summary svg:last-child,
.sap-library-run-output summary svg:last-child { flex: none; color: var(--run-muted); }
.sap-library-run-section:not([open]) > summary svg:last-child,
.sap-library-run-tool:not([open]) > summary svg:last-child,
.sap-library-run-output:not([open]) > summary svg:last-child { transform: rotate(-90deg); }
.sap-library-run-inspector > .sap-library-run-link { margin-top: 12px; padding-inline: 0; }
.sap-library-run-inspector[data-presentation="run"] > .sap-library-run-link { display: none; }
.sap-library-run-requests .sap-write-review,
.sap-library-run-requests .sap-agent-permission {
  width: 100%;
  max-width: none;
  margin: 0 0 8px;
}
.sap-library-run-requests .sap-write-review { padding: 10px; border-radius: 12px; }
.sap-library-run-request-region[data-pending="true"] .sap-write-review[data-phase="pending"],
.sap-library-run-request-region[data-pending="true"] .sap-agent-permission {
  border-color: color-mix(in srgb, var(--run-orange) 29%, var(--run-border));
}
.sap-library-run-requests .sap-write-header, .sap-library-run-requests .sap-write-actions { flex-wrap: wrap; gap: 4px; }
.sap-library-run-requests .sap-write-header > .sap-write-heading { min-width: 80px; }
.sap-library-run-request-region h2 {
  margin: 0 0 8px;
  color: var(--run-muted);
  font-size: 12px;
  font-weight: 600;
}
.sap-library-run-request-region { padding-inline-end: 0; padding-block-end: 8px; }
.sap-library-run-surface { display: flex; flex: 1; flex-direction: column; }
.sap-library-run-toolbar {
  display: flex;
  align-items: center;
  flex: none;
  gap: 8px;
  min-height: 45px;
  padding: 8px 15px;
}
.sap-library-run-crumb-title { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.sap-library-run-link, .sap-library-run-icon, .sap-library-run-stop {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  gap: 5px;
  min-height: 26px;
  padding: 0 5px;
  border: 0;
  border-radius: 6px;
  color: var(--run-muted);
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.sap-library-run-icon { width: 22px; min-height: 22px; padding: 0; }
.sap-library-run-icon svg { width: 13px; height: 13px; }
.sap-library-run-toggle { margin-inline-start: auto; }
.sap-library-run-stop:not([hidden]) + .sap-library-run-toggle { margin-inline-start: 0; }
.sap-library-run-stop {
  margin-inline-start: auto;
  padding-inline: 6px;
  border: 1px solid var(--run-border);
  color: inherit;
}
.sap-library-run-link:hover, .sap-library-run-icon:hover, .sap-library-run-stop:hover:enabled { background: var(--run-panel); color: inherit; }
.sap-library-run-stop:disabled { opacity: .55; cursor: default; }
.sap-library-run-status {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 8px;
  color: var(--run-muted);
  background: var(--run-panel);
  font-size: 11px;
}
.sap-library-run-status::before {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  content: "";
}
.sap-library-run-status[data-status="running"] { color: var(--run-blue); }
.sap-library-run-status[data-status="needs-input"] {
  color: var(--run-orange);
  background: color-mix(in srgb, var(--run-orange) 12%, transparent);
}
.sap-library-run-scroll { min-height: 0; overflow: auto; }
.sap-library-run-main {
  max-width: 820px;
  margin-inline: auto;
  padding: 24px clamp(16px, 5%, 36px) 32px;
}
.sap-library-run-meta, .sap-library-run-panel-summary { color: var(--run-muted); font-size: 11px; }
.sap-library-run-main h1 {
  margin: 9px 0 14px;
  font-size: 21px;
  line-height: 1.25;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.sap-library-run-bar {
  appearance: none;
  display: block;
  width: 100%;
  height: 4px;
  overflow: hidden;
  border: 0;
  border-radius: 3px;
  background: var(--run-panel);
  color: var(--run-blue);
}
.sap-library-run-bar[data-status="needs-input"] { color: var(--run-orange); }
.sap-library-run-bar::-moz-progress-bar { background: currentColor; }
.sap-library-run-counters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(71px, 1fr));
  gap: 9px;
  margin: 19px 0 27px;
  font-variant-numeric: tabular-nums;
}
.sap-library-run-counters dt { margin-bottom: 3px; color: var(--run-muted); font-size: 11px; }
.sap-library-run-counters dd { margin: 0; font-size: 14px; font-weight: 600; }
.sap-library-run-panel {
  margin-block: 10px;
  padding: 13px 15px;
  border-radius: 8px;
  background: var(--run-panel);
}
.sap-library-run-panel h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
}
.sap-library-run-panel h2 > svg { color: var(--run-muted); }
.sap-library-run-panel-summary { margin-inline-start: auto; font-weight: 400; }
.sap-library-run-timeline { margin: 0; padding: 0; list-style: none; }
.sap-library-run-progress-items { margin-top: 7px; }
.sap-library-run-step {
  position: relative;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  column-gap: 8px;
  min-height: 27px;
  padding-block: 4px 7px;
  overflow-wrap: anywhere;
}
.sap-library-run-step:not(:last-child)::before {
  position: absolute;
  inset: 18px auto 0 7px;
  width: 1px;
  background: var(--run-border);
  content: "";
}
.sap-library-run-step-icon {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border: 1px solid var(--run-border);
  border-radius: 50%;
  color: var(--run-muted);
}
.sap-library-run-step[data-status="completed"] .sap-library-run-step-icon {
  border-color: var(--run-blue);
  background: var(--run-blue);
  color: white;
}
.sap-library-run-progress-items .sap-library-run-step[data-status="completed"] .sap-library-run-step-icon {
  border: 0;
  background: var(--run-muted);
}
.sap-library-run-step[data-status="in_progress"] .sap-library-run-step-icon { border: 0; color: var(--run-blue); }
.sap-library-run-step[data-status="in_progress"] .sap-library-run-step-icon svg { animation: sap-library-run-spin 1s linear infinite; }
.sap-library-run-step[data-status="pending"], .sap-library-run-earlier { color: var(--run-muted); }
.sap-library-run-earlier { padding-inline-start: 20px; }
.sap-library-run-earlier .sap-library-run-link { justify-content: start; min-height: 20px; padding: 0; text-align: start; }
.sap-library-run-tool summary > span, .sap-library-run-output summary > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.sap-library-run-tool summary > time { min-width: 30px; color: var(--run-muted); text-align: end; }
.sap-library-run-tool p { margin: 6px 0; color: var(--run-muted); }
.sap-library-run-tool pre, .sap-library-run-output pre {
  max-height: 180px;
  overflow: auto;
  margin: 6px 0 0;
  padding: 7px;
  border: 1px solid var(--run-border);
  border-radius: 6px;
  color: var(--run-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.sap-library-run-output-items, .sap-library-run-used-items {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}
.sap-library-run-output {
  padding: 7px;
  border: 1px solid var(--run-border);
  border-radius: 7px;
}
.sap-library-run-used-items > div, .sap-library-run-artifact { display: flex; align-items: center; gap: 7px; color: var(--run-muted); }
.sap-library-run-used-items > div > svg { flex: none; }
.sap-library-run-used-items span, .sap-library-run-artifact span { overflow-wrap: anywhere; }
.sap-library-run-artifact { min-height: 26px; }
@keyframes sap-library-run-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .sap-library-run-step[data-status="in_progress"] .sap-library-run-step-icon svg { animation: none; }
}
`;
