import { X } from "lucide";
import { config } from "../../../package.json";
import { getLibraryDefaultModel } from "../../agents/store";
import { formatError, UserError } from "../../utils/errors";
import { getString } from "../../utils/locale";
import { logError } from "../../utils/log";
import { h, iconButton } from "../ui/dom";
import { runMarginaliaPrompt } from "./agent";
import {
  getSelectionShortcut,
  resolveSelectionPrompt,
  selectionShortcutKey,
} from "./shortcut-prefs";
import { SELECTION_RESULT_STYLES } from "./shortcut-styles";

type Reader = _ZoteroTypes.ReaderInstance<"pdf">;
type Annotation = _ZoteroTypes.Annotations.AnnotationJson;
type SelectionPopup = {
  annotation?: Annotation;
  rect?: [number, number, number, number];
};
type SelectionViewState = {
  primaryViewSelectionPopup?: SelectionPopup;
  secondaryViewSelectionPopup?: SelectionPopup;
};

function runSelectionShortcut(
  prompt: string,
  text: string,
  signal: AbortSignal,
): Promise<string> {
  const model = getLibraryDefaultModel();
  if (!model) throw new UserError("marginalia-shortcut-model-required");
  return runMarginaliaPrompt(
    model,
    prompt,
    text,
    signal,
    "library-default-model-unavailable",
  );
}

interface ShortcutActions<Source> {
  capture(reader: Reader, annotation: Annotation): Source | undefined;
  edit(source: Source, answer: string, anchor: HTMLElement): void;
}

function isEditable(event: KeyboardEvent): boolean {
  return event.composedPath().some((node) => {
    const element = node as Element;
    return (
      element.matches?.("input, textarea, select") ||
      (element as HTMLElement).isContentEditable
    );
  });
}

export function mountSelectionShortcut<Source>({
  capture,
  edit,
}: ShortcutActions<Source>): () => void {
  const detachments = new Set<() => void>();
  const bound = new WeakMap<Document, Set<Window>>();
  let closeResult: (() => void) | undefined;

  const onSelection: _ZoteroTypes.Reader.EventHandler<
    "renderTextSelectionPopup"
  > = ({ reader: instance, doc }) => {
    const window = doc.defaultView;
    if (!window || !instance._item?.isPDFAttachment()) return;
    const reader = instance as Reader;
    const internal = reader._internalReader;
    const binding = bound.get(doc) ?? new Set<Window>();
    bound.set(doc, binding);
    const views = [
      window,
      internal?._primaryView?._iframeWindow,
      internal?._secondaryView?._iframeWindow,
    ];
    for (const view of views) {
      if (!view || binding.has(view)) continue;
      binding.add(view);
      const handle = (event: KeyboardEvent) => {
        if (!event.isTrusted || isEditable(event)) return;
        if (event.key === "Escape") {
          closeResult?.();
          return;
        }
        if (event.repeat) return;
        const binding = getSelectionShortcut();
        if (!binding || binding !== selectionShortcutKey(event)) return;
        const state = internal?._state as SelectionViewState | undefined;
        const popup =
          internal?._lastViewPrimary === false
            ? state?.secondaryViewSelectionPopup
            : state?.primaryViewSelectionPopup;
        const annotation = popup?.annotation;
        if (!annotation?.text.trim()) return;
        const source = capture(reader, annotation);
        if (!source) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closeResult?.();
        const result = showSelectionResult(
          doc,
          popup?.rect,
          source,
          edit,
          () => {
            if (closeResult === result.close) closeResult = undefined;
          },
        );
        closeResult = result.close;
        void result.run(annotation.text);
      };
      const detach = () => {
        view.removeEventListener("keydown", handle, true);
        view.removeEventListener("unload", detach);
        binding.delete(view);
        detachments.delete(detach);
      };
      view.addEventListener("keydown", handle, true);
      view.addEventListener("unload", detach, { once: true });
      detachments.add(detach);
    }
  };
  Zotero.Reader.registerEventListener(
    "renderTextSelectionPopup",
    onSelection,
    config.addonID,
  );
  return () => {
    Zotero.Reader.unregisterEventListener(
      "renderTextSelectionPopup",
      onSelection,
    );
    closeResult?.();
    for (const detach of detachments) detach();
  };
}

function showSelectionResult<Source>(
  doc: Document,
  rect: SelectionPopup["rect"],
  source: Source,
  edit: ShortcutActions<Source>["edit"],
  onClose: () => void,
) {
  const window = doc.defaultView!;
  const abort = new AbortController();
  const dispose = () => {
    abort.abort();
    panel.remove();
    style.remove();
    window.removeEventListener("resize", position);
    window.removeEventListener("unload", dispose);
    onClose();
  };
  const title = getString("marginalia-shortcut-result");
  const content = h(
    doc,
    "div",
    {
      class: "sap-selection-result-content",
      role: "status",
    },
    getString("marginalia-shortcut-running"),
  );
  let answer = "";
  const dismiss = iconButton(
    doc,
    getString("marginalia-shortcut-cancel"),
    X,
    dispose,
  );
  const copy = h(
    doc,
    "button",
    {
      type: "button",
      click: () => Zotero.Utilities.Internal.copyTextToClipboard(answer),
    },
    getString("marginalia-shortcut-copy"),
  );
  const add = h(
    doc,
    "button",
    {
      type: "button",
      click: () => edit(source, answer, panel),
    },
    getString("marginalia-shortcut-add"),
  );
  const actions = h(
    doc,
    "div",
    { class: "sap-selection-result-actions", hidden: true },
    copy,
    add,
  );
  const panel = h(
    doc,
    "section",
    { class: "sap-selection-result", "aria-label": title },
    h(doc, "header", {}, h(doc, "strong", {}, title), dismiss),
    content,
    actions,
  );
  const style = h(doc, "style", {}, SELECTION_RESULT_STYLES);

  function position() {
    const [left, top, , bottom] = rect ?? [12, 12, 12, 12];
    const above = top - panel.offsetHeight - 8;
    const desiredTop = above > 8 ? above : bottom + 8;
    panel.style.left = `${Math.max(8, Math.min(left, window.innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(desiredTop, window.innerHeight - panel.offsetHeight - 8))}px`;
  }

  doc.head?.append(style);
  (doc.body ?? doc.documentElement)?.append(panel);
  window.addEventListener("resize", position);
  window.addEventListener("unload", dispose, { once: true });
  position();
  return {
    close: dispose,
    async run(text: string) {
      try {
        answer = await runSelectionShortcut(
          resolveSelectionPrompt(Zotero.locale),
          text,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        content.textContent = answer;
        actions.hidden = false;
      } catch (error) {
        if (abort.signal.aborted) return;
        logError("PDF selection shortcut failed", error);
        content.textContent =
          error instanceof UserError
            ? formatError(error)
            : getString("marginalia-shortcut-failed");
      }
      dismiss.title = getString("marginalia-shortcut-close");
      dismiss.setAttribute("aria-label", dismiss.title);
      position();
    },
  };
}
