import { formatError, UserError } from "../../utils/errors";
import { getString } from "../../utils/locale";
import { logError } from "../../utils/log";
import { h } from "../ui/dom";
import {
  readAnnotationTarget,
  saveAnnotationComment,
  type AnnotationSource,
} from "./annotation";

export async function openAnnotationDraft(
  source: AnnotationSource,
  text: string,
  anchor: HTMLElement,
  options: { label?: string; onSaved?(item: Zotero.Item): void } = {},
): Promise<void> {
  const doc = anchor.ownerDocument;
  const window = doc?.defaultView;
  if (!doc || !window || !anchor.isConnected) return;
  const previous = doc.querySelector<HTMLFormElement>(".sap-annotation-draft");
  if (previous?.getAttribute("aria-busy") === "true") return;
  previous?.remove();
  const label = getString("marginalia-comment");
  const title = options.label ?? label;
  const input = h(doc, "textarea", { rows: 5, "aria-label": label });
  Object.assign(input.style, {
    minWidth: "0",
    resize: "vertical",
    font: "inherit",
    color: "inherit",
  });
  input.value = text;
  const quote = h(doc, "blockquote", {}, source.text);
  Object.assign(quote.style, {
    margin: "0",
    maxHeight: "4.5em",
    overflow: "auto",
    paddingInlineStart: "8px",
    borderInlineStart: "2px solid var(--color-border, GrayText)",
    overflowWrap: "anywhere",
  });
  const feedback = h(doc, "div", { role: "alert", hidden: true });
  const save = h(
    doc,
    "button",
    { type: "submit", disabled: true },
    getString("prefs-agent-save"),
  );
  const cancel = h(
    doc,
    "button",
    { type: "button", click: () => draft.hidePopover() },
    getString("prefs-agent-cancel"),
  );
  const draft = h(
    doc,
    "form",
    {
      class: "sap-annotation-draft",
      popover: "auto",
      role: "dialog",
      "aria-label": title,
    },
    h(doc, "strong", {}, title),
    h(
      doc,
      "small",
      { style: "overflow-wrap: anywhere" },
      getString("context-selection-source", {
        title: source.itemTitle,
        page: source.pageLabel,
      }),
    ),
    quote,
    input,
    feedback,
    h(
      doc,
      "div",
      { style: "display: flex; justify-content: flex-end; gap: 6px" },
      cancel,
      save,
    ),
  );
  const { left, top, bottom } = anchor.getBoundingClientRect();
  const width = Math.max(1, Math.min(360, window.innerWidth - 16));
  const draftTop =
    bottom <= window.innerHeight - 300 ? bottom + 6 : Math.max(8, top - 300);
  Object.assign(draft.style, {
    position: "fixed",
    inset: "auto",
    margin: "0",
    boxSizing: "border-box",
    left: `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`,
    top: `${draftTop}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(1, window.innerHeight - draftTop - 8)}px`,
    overflow: "auto",
    padding: "10px",
    gap: "6px",
    borderRadius: "8px",
    background: "var(--material-background, Canvas)",
    color: "var(--fill-primary, CanvasText)",
    border: "1px solid var(--color-border, GrayText)",
    boxShadow: "0 8px 24px rgb(0 0 0 / .16)",
    font: "13px system-ui",
  });
  const style = h(
    doc,
    "style",
    {},
    ".sap-annotation-draft:popover-open { display: grid; }",
  );
  draft.append(style);
  draft.addEventListener("toggle", () => {
    if (!draft.matches(":popover-open")) draft.remove();
  });
  let before = "";
  function report(error: unknown) {
    feedback.textContent =
      error instanceof UserError
        ? formatError(error)
        : getString("marginalia-save-failed");
    feedback.hidden = false;
    if (!(error instanceof UserError))
      logError("Could not save Zotero annotation comment", error);
  }
  draft.addEventListener("submit", (event) => {
    event.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    cancel.disabled = true;
    input.readOnly = true;
    draft.setAttribute("aria-busy", "true");
    void saveAnnotationComment(source, input.value, before).then(
      (item) => {
        draft.remove();
        options.onSaved?.(item);
      },
      (error) => {
        report(error);
        save.disabled = false;
        cancel.disabled = false;
        input.readOnly = false;
        draft.removeAttribute("aria-busy");
      },
    );
  });
  input.readOnly = true;
  (doc.body ?? doc.documentElement)?.append(draft);
  draft.showPopover();
  try {
    const target = await readAnnotationTarget(source);
    if (!draft.isConnected) return;
    before = target.comment;
    input.value = [before, text].filter(Boolean).join("\n\n");
    if (!target.editable) throw new UserError("marginalia-target-read-only");
    input.readOnly = false;
    save.disabled = false;
    input.focus();
  } catch (error) {
    if (draft.isConnected) report(error);
  }
}
