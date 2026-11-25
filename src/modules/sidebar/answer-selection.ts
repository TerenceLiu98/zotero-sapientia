import type { AnswerSelection } from "../../chat/transcript";
import { getString } from "../../utils/locale";
import { h } from "../ui/dom";

export function createAnswerSelection(
  transcript: HTMLElement,
  attach: (selection: AnswerSelection) => void,
) {
  const doc = transcript.ownerDocument!;
  const window = doc.defaultView!;
  let excerpt: AnswerSelection | undefined;
  const button = h(
    doc,
    "button",
    {
      class: "sap-chat-button sap-answer-ask",
      type: "button",
      popover: "manual",
      mousedown: (event) => event.preventDefault(),
      click: () => {
        if (!excerpt) return;
        attach(excerpt);
        window.getSelection()?.removeAllRanges();
        hide();
      },
    },
    getString("context-add-selection"),
  );

  function hide() {
    excerpt = undefined;
    if (button.matches(":popover-open")) button.hidePopover();
  }

  function update() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) {
      hide();
      return;
    }
    const range = selection.getRangeAt(0);
    const ancestor = range.commonAncestorContainer;
    const element =
      ancestor.nodeType === 1 ? (ancestor as Element) : ancestor.parentElement;
    const answer = element?.closest(".sap-answer-text");
    const id = answer
      ?.closest("[data-answer-id]")
      ?.getAttribute("data-answer-id");
    const text = range.toString().trim();
    if (!id || !answer || !transcript.contains(answer) || !text) {
      hide();
      return;
    }

    const first =
      range.getClientRects()?.item(0) ?? range.getBoundingClientRect();
    const bounds = transcript.getBoundingClientRect();
    if (!first || first.bottom <= bounds.top || first.top >= bounds.bottom) {
      hide();
      return;
    }

    excerpt = { answerId: id, text };
    if (!button.matches(":popover-open")) button.showPopover();
    const above = first.top - button.offsetHeight - 5;
    const left = Math.max(bounds.left + 4, first.left);
    button.style.top = `${above < 4 ? first.bottom + 5 : above}px`;
    button.style.left = `${Math.min(left, bounds.right - button.offsetWidth - 4)}px`;
  }

  doc.addEventListener("selectionchange", update);
  transcript.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  return {
    element: button,
    hide,
    destroy() {
      hide();
      doc.removeEventListener("selectionchange", update);
      transcript.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    },
  };
}
