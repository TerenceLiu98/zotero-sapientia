export const SURFACE_STYLES = `
:is(.sap-chat, .sap-prefs) {
  --sap-control-size: 28px;
  --sap-control-radius: 8px;
  --sap-menu-radius: 12px;
  --sap-menu-shadow: 0 8px 24px -6px rgb(0 0 0 / .24), 0 2px 5px rgb(0 0 0 / .06);
  --sap-border: var(--color-border50, var(--color-border));
  --sap-hover: var(--fill-quinary);
  --sap-pressed: var(--fill-quarternary);
  font-size: 13px;
  line-height: 1.5;
  color: var(--fill-primary);
}
:where(.sap-chat, .sap-prefs, .sap-chat *, .sap-prefs *) {
  scrollbar-width: none;
}
:is(.sap-chat, .sap-prefs) :is(button, a, summary, [tabindex="0"]):focus-visible {
  outline: 2px solid var(--color-focus-border);
  outline-offset: -2px;
}
`;
