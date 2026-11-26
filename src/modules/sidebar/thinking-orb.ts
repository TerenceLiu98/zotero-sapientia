import { h } from "../ui/dom";

const dotCount = 44;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));

const dots = Array.from({ length: dotCount }, (_, index) => {
  const height = 1 - (2 * (index + 0.5)) / dotCount;
  const ring = Math.sqrt(1 - height * height);
  const angle = index * goldenAngle;
  const depth = ring * Math.sin(angle);
  const x = 50 + 45 * ring * Math.cos(angle);
  const y = 50 + 45 * height;
  return `left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--depth:${(0.55 + depth * 0.34).toFixed(2)};animation-delay:${(depth - 1).toFixed(2)}s`;
});

export function thinkingOrb(doc: Document): HTMLElement {
  return h(
    doc,
    "span",
    { class: "sap-thinking-orb", "aria-hidden": "true" },
    ...dots.map((style) => h(doc, "span", { style })),
  );
}
