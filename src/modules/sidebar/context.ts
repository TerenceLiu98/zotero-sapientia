import { FileText, MessageSquareText, X } from "lucide";
import type { ChatSelection } from "../../chat/transcript";
import { createPaperContext } from "../../context/paper";
import { getString } from "../../utils/locale";
import { h, iconButton, lucideIcon } from "../ui/dom";

export function createContextView(doc: Document, onAttach?: () => void) {
  const title = h(doc, "span", { class: "sap-context-title" });
  const element = h(
    doc,
    "div",
    { class: "sap-chat-context sap-context-paper", hidden: true },
    lucideIcon(doc, FileText, 15),
    title,
  );
  const attached = h(doc, "div", {
    class: "sap-context-attached",
    hidden: true,
  });
  const selections = new Map<number, ChatSelection>();
  let nextId = 0;
  const tracker = createPaperContext(
    doc.defaultView!,
    render,
    attach,
    getString("context-add-selection"),
  );

  function render() {
    const current = tracker.read();
    element.hidden = !current;
    title.textContent = current?.title ?? "";
  }

  function renderAttachments() {
    attached.hidden = selections.size === 0;
    attached.replaceChildren(
      ...Array.from(selections, ([id, selection], index) => {
        const origin = selectionSource(selection);
        const label = getString("context-selection-number", {
          number: index + 1,
        });
        const remove = iconButton(
          doc,
          getString("context-remove-selection"),
          X,
          () => {
            selections.delete(id);
            renderAttachments();
            const buttons =
              attached.querySelectorAll<HTMLButtonElement>("button");
            const next = buttons[Math.min(index, buttons.length - 1)];
            (
              next ??
              attached.parentElement?.querySelector<HTMLTextAreaElement>(
                "textarea",
              )
            )?.focus();
          },
          "sap-chat-button sap-icon-button sap-context-remove",
        );
        return h(
          doc,
          "div",
          {
            class: "sap-context-quote",
            title: origin ? `${origin}\n${selection.text}` : selection.text,
          },
          h(doc, "div", { class: "sap-context-quote-text" }, selection.text),
          h(
            doc,
            "div",
            { class: "sap-context-quote-footer" },
            lucideIcon(doc, MessageSquareText, 13),
            h(
              doc,
              "span",
              { class: "sap-context-quote-label", title: label },
              label,
            ),
            remove,
          ),
        );
      }),
    );
  }

  function attach(selection: ChatSelection) {
    if (
      Array.from(selections.values()).some((existing) => {
        if (existing.text !== selection.text) return false;
        if ("answerId" in existing) {
          return (
            "answerId" in selection && existing.answerId === selection.answerId
          );
        }
        return (
          !("answerId" in selection) &&
          existing.libraryID === selection.libraryID &&
          existing.attachmentKey === selection.attachmentKey &&
          existing.pageIndex === selection.pageIndex
        );
      })
    )
      return;
    selections.set(++nextId, selection);
    renderAttachments();
    onAttach?.();
  }

  return {
    element,
    attachments: attached,
    attach,
    setVisible(visible: boolean) {
      tracker.setVisible(visible);
      if (visible) render();
    },
    snapshot() {
      return {
        paper: tracker.read(),
        selections: Array.from(selections.values()),
        readSelection: tracker.readSelection,
      };
    },
    consume(sent: readonly ChatSelection[]) {
      for (const [id, selection] of selections)
        if (sent.includes(selection)) selections.delete(id);
      renderAttachments();
    },
    clear() {
      selections.clear();
      renderAttachments();
    },
    destroy: () => tracker.dispose(),
  };
}

export function selectionSource(selection: ChatSelection) {
  if ("answerId" in selection) return undefined;
  const page =
    selection.pageLabel ??
    (selection.pageIndex === undefined
      ? undefined
      : String(selection.pageIndex + 1));
  return page
    ? getString("context-selection-source", {
        title: selection.itemTitle,
        page,
      })
    : selection.itemTitle;
}
