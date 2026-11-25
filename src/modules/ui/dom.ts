import type { IconNode } from "lucide";

const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";

type Child = Node | string | false | null | undefined;

export type Attributes = Record<
  string,
  string | number | boolean | EventListener | null | undefined
>;

/**
 * Builds an HTML element in a document, which may be a XUL one. Text children
 * become text nodes, so nothing passed here is ever parsed as markup.
 *
 * Boolean attributes are set when true; event listeners are attached.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = doc.createElementNS(HTML_NS, tag) as HTMLElementTagNameMap[K];
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) {
      continue;
    }
    if (value instanceof Function) {
      element.addEventListener(name, value);
    } else if (value === true) {
      element.setAttribute(name, "");
    } else {
      element.setAttribute(name, String(value));
    }
  }
  element.append(
    ...children.filter(
      (child) => child !== false && child !== null && child !== undefined,
    ),
  );
  return element;
}

/** An SVG icon drawn with the current text color. `path` is a single path's `d`. */
export function icon(doc: Document, d: string, size = 16): SVGSVGElement {
  const svg = doc.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  ) as unknown as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  const shape = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", d);
  shape.setAttribute("fill", "currentColor");
  svg.append(shape);
  return svg;
}

export const ICON = {
  check: "M6.5 11.2 3.3 8l-1.1 1.1 4.3 4.3 7.3-7.3L12.7 5z",
  chevronDown: "M4.2 6.2 8 10l3.8-3.8 1 1L8 12 3.2 7.2z",
  close:
    "M4.3 3.2 8 6.9l3.7-3.7 1.1 1.1L9.1 8l3.7 3.7-1.1 1.1L8 9.1l-3.7 3.7-1.1-1.1L6.9 8 3.2 4.3z",
  plus: "M7.3 2.7h1.4v4.6h4.6v1.4H8.7v4.6H7.3V8.7H2.7V7.3h4.6z",
} as const;

export function lucideIcon(
  doc: Document,
  glyph: IconNode,
  size = 16,
): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg") as unknown as SVGSVGElement;
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.8",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(name, String(value));
  for (const [tag, attrs] of glyph) {
    const part = doc.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs))
      part.setAttribute(name, String(value));
    svg.append(part);
  }
  return svg;
}

export function setIconButton(
  button: HTMLButtonElement,
  label: string,
  glyph: IconNode,
): void {
  if (button.getAttribute("aria-label") === label) return;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.replaceChildren(lucideIcon(button.ownerDocument!, glyph));
}

export function iconButton(
  doc: Document,
  label: string,
  glyph: IconNode,
  action: () => void,
  className = "sap-chat-button sap-icon-button",
): HTMLButtonElement {
  const button = h(doc, "button", {
    class: className,
    type: "button",
    click: action,
  });
  setIconButton(button, label, glyph);
  return button;
}
