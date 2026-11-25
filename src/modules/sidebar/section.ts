import { config } from "../../../package.json";
import type { ChatController } from "../../chat/controller";
import { getString } from "../../utils/locale";
import { h } from "../ui/dom";
import { createContextView } from "./context";
import { CHAT_STYLES } from "./styles";
import { createChatView, type ChatView } from "./view";

export const CHAT_PANE_ID = "sapientia-chat-pane";
export const CHAT_TOGGLE_ID = "sapientia-chat-toggle";

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 300;
const MAX_WIDTH = 640;

/** The deck owns the library and reader tabs. Its sibling stays mounted across tab switches. */
export function mountChatSidebar(
  window: Window,
  chat: ChatController,
): (() => void) | undefined {
  const doc = window.document;
  const row = doc.getElementById("tabs-deck")?.parentElement;
  const toolbar = doc.getElementById("zotero-tabs-toolbar");
  if (!row || !toolbar) {
    return;
  }

  const label = getString("prefs-title");
  const panel = doc.createXULElement("vbox") as XULElement;
  panel.id = CHAT_PANE_ID;
  panel.setAttribute("role", "complementary");
  panel.setAttribute("aria-label", label);
  panel.hidden = true;
  panel.style.cssText = `box-sizing: border-box; flex: 0 0 auto; min-height: 0; min-width: ${MIN_WIDTH}px; max-width: min(${MAX_WIDTH}px, 60vw); position: relative; overflow: hidden; border-inline-start: 1px solid var(--color-border); background: var(--material-sidepane);`;

  const content = h(doc, "div", {
    style: "display: flex; flex: 1; min-height: 0; min-width: 0; width: 100%",
  });
  content.append(
    h(
      doc,
      "style",
      {},
      CHAT_STYLES,
      `
      #${CHAT_TOGGLE_ID} .toolbarbutton-icon { width: 20px; height: 20px; }
      #${CHAT_PANE_ID} .sap-chat-resize:is(:hover, :focus-visible) { background: var(--fill-quarternary); }
    `,
    ),
  );

  const edge = h(doc, "div", {
    class: "sap-chat-resize",
    role: "separator",
    tabindex: 0,
    "aria-label": label,
    "aria-orientation": "vertical",
    "aria-valuemin": MIN_WIDTH,
    "aria-valuemax": MAX_WIDTH,
    style:
      "position: absolute; inset-block: 0; inset-inline-start: 0; width: 5px; cursor: col-resize; touch-action: none; z-index: 1",
  });
  const resize = (value: number) => {
    const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value));
    panel.style.width = `${width}px`;
    edge.setAttribute("aria-valuenow", String(Math.round(width)));
  };
  resize(DEFAULT_WIDTH);

  const side = () =>
    window.getComputedStyle(panel)?.direction === "rtl" ? -1 : 1;
  let drag: { pointerId: number; x: number; width: number } | undefined;
  edge.addEventListener("pointerdown", (event) => {
    const pointer = event as PointerEvent;
    if (pointer.button !== 0) return;
    drag = {
      pointerId: pointer.pointerId,
      x: pointer.clientX,
      width: panel.getBoundingClientRect().width,
    };
    edge.setPointerCapture(pointer.pointerId);
  });
  edge.addEventListener("pointermove", (event) => {
    const pointer = event as PointerEvent;
    if (!drag || drag.pointerId !== pointer.pointerId) return;
    resize(drag.width + (drag.x - pointer.clientX) * side());
  });
  edge.addEventListener("lostpointercapture", () => {
    drag = undefined;
  });
  edge.addEventListener("keydown", (event) => {
    const { key } = event as KeyboardEvent;
    if (key !== "ArrowLeft" && key !== "ArrowRight") return;
    event.preventDefault();
    const change = key === "ArrowLeft" ? 20 : -20;
    resize(panel.getBoundingClientRect().width + change * side());
  });

  panel.append(content, edge);
  row.append(panel);

  const button = doc.createXULElement("toolbarbutton") as XULElement;
  button.id = CHAT_TOGGLE_ID;
  button.className = "zotero-tb-button";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-controls", CHAT_PANE_ID);
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("tooltiptext", label);
  button.style.listStyleImage = `url("chrome://${config.addonRef}/content/icons/sapientia.svg")`;
  toolbar.insertBefore(
    button,
    doc.getElementById("zotero-tb-tabs-menu")?.nextSibling ?? null,
  );

  let view: ChatView | undefined;
  const context = createContextView(doc, () => {
    if (panel.hidden) setOpen(true);
  });
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    button.setAttribute("aria-pressed", String(open));
    if (!open) {
      view?.setVisible(false);
      button.removeAttribute("open");
      button.focus();
      return;
    }
    button.setAttribute("open", "true");
    if (!view) {
      view = createChatView(doc, chat, () => setOpen(false), context);
      content.append(view.element);
    }
    view.setVisible(true);
    void chat.warm();
    view.element.querySelector("textarea")?.focus();
  };

  button.addEventListener("command", () => setOpen(panel.hidden));

  return () => {
    if (view) view.destroy();
    else context.destroy();
    button.remove();
    panel.remove();
  };
}
