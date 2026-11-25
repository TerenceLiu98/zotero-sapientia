import { FileText, Quote, X } from "lucide";
import { createPaperContext, type SelectedText } from "../../context/paper";
import { getString, type MessageId } from "../../utils/locale";
import { h, iconButton, lucideIcon } from "../ui/dom";

const MATERIALS = {
  metadata: "context-metadata",
  pdfText: "context-pdf-text",
  selectedText: "context-selection",
  annotations: "context-annotations",
} as const satisfies Record<string, MessageId>;

export function createContextView(doc: Document, onAttach?: () => void) {
  const title = h(doc, "span", { class: "sap-context-title" });
  const paper = h(
    doc,
    "div",
    { class: "sap-context-paper" },
    lucideIcon(doc, FileText, 15),
    title,
  );
  const materials = h(doc, "div", { class: "sap-context-materials" });
  const attached = h(doc, "div", { class: "sap-context-attached" });
  const selections = new Map<number, SelectedText>();
  let nextId = 0;
  const add = h(
    doc,
    "button",
    {
      class: "sap-chat-button sap-context-add",
      type: "button",
      click: () => {
        const selection = tracker.readSelection();
        if (selection) attach(selection);
      },
    },
    lucideIcon(doc, Quote, 13),
    getString("context-add-selection"),
  );
  const element = h(
    doc,
    "div",
    { class: "sap-chat-context" },
    paper,
    materials,
    add,
    attached,
    h(
      doc,
      "p",
      { class: "sap-context-notice" },
      getString("context-processing"),
    ),
  );
  const tracker = createPaperContext(
    doc.defaultView!,
    render,
    attach,
    getString("context-add-selection"),
  );

  function render() {
    const current = tracker.read();
    title.textContent = current?.title ?? "";
    paper.hidden = !current;
    materials.hidden = !current;
    add.hidden = !tracker.readSelection();
    if (current) {
      materials.replaceChildren(
        ...Object.entries(MATERIALS).flatMap(([key, label]) =>
          current.materials[key as keyof typeof MATERIALS]
            ? [h(doc, "span", {}, getString(label))]
            : [],
        ),
      );
    }
  }

  function renderAttachments() {
    attached.replaceChildren(
      ...Array.from(selections, ([id, selection]) => {
        const source =
          selection.pageLabel ??
          (selection.pageIndex === undefined
            ? ""
            : String(selection.pageIndex + 1));
        const label = source
          ? getString("context-selection-source", {
              title: selection.itemTitle,
              page: source,
            })
          : selection.itemTitle;
        return h(
          doc,
          "div",
          { class: "sap-context-quote", title: `${label}\n${selection.text}` },
          lucideIcon(doc, Quote, 13),
          h(
            doc,
            "span",
            { class: "sap-context-quote-text" },
            h(doc, "strong", {}, label),
            selection.text,
          ),
          iconButton(doc, getString("context-remove-selection"), X, () => {
            selections.delete(id);
            renderAttachments();
          }),
        );
      }),
    );
  }

  function attach(selection: SelectedText) {
    if (
      Array.from(selections.values()).some(
        (existing) =>
          existing.libraryID === selection.libraryID &&
          existing.attachmentKey === selection.attachmentKey &&
          existing.pageIndex === selection.pageIndex &&
          existing.text === selection.text,
      )
    )
      return;
    selections.set(++nextId, selection);
    renderAttachments();
    onAttach?.();
  }

  return {
    element,
    setVisible(visible: boolean) {
      tracker.setVisible(visible);
      if (visible) render();
    },
    snapshot() {
      return {
        paper: tracker.read(),
        selections: Array.from(selections.values()),
      };
    },
    consume(sent: readonly SelectedText[]) {
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
