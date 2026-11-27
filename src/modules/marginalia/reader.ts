import { Bot, MessageSquare, PanelRight, Pencil, X } from "lucide";
import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { logWarn } from "../../utils/log";
import { h, iconButton } from "../ui/dom";
import {
  pdfViewBounds,
  projectPdfMark,
  readerPdfViews,
  type PdfPosition,
  type ProjectedMark,
} from "./geometry";
import { MARGINALIA_STYLES } from "./reader-styles";

type Reader = _ZoteroTypes.ReaderInstance;
type PdfView = _ZoteroTypes.Reader.PDFView;

interface ReaderActions {
  enabled(): boolean;
  editable(annotation: Zotero.Item): boolean;
  ask(reader: Reader, annotation: Zotero.Item): void;
  saveComment(
    annotation: Zotero.Item,
    comment: string,
    previousComment: string,
  ): Promise<void>;
}

const GAP = 8;
const MARKER = 24;
const MIN_CARD = 172;
const MAX_CARD = 238;
const VIEW_EVENTS = [
  "pagesinit",
  "pagesloaded",
  "pagerendered",
  "scalechanging",
  "rotationchanging",
  "scrollmodechanged",
  "spreadmodechanged",
];

function positionOf(annotation: Zotero.Item): PdfPosition | undefined {
  try {
    const { pageIndex, rects } = JSON.parse(annotation.annotationPosition);
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || !Array.isArray(rects))
      return;
    return { pageIndex, rects: rects.filter(Array.isArray) };
  } catch {
    return;
  }
}

function annotationsOf(reader: Reader) {
  return reader._item.getAnnotations().flatMap((item) => {
    if (
      item.deleted ||
      !["highlight", "underline"].includes(item.annotationType) ||
      !item.annotationComment.trim()
    )
      return [];
    const position = positionOf(item);
    return position ? [{ item, position }] : [];
  });
}

function createCard(
  doc: Document,
  reader: Reader,
  original: Zotero.Item,
  position: PdfPosition,
  actions: ReaderActions,
  toggle: () => void,
  schedule: () => void,
) {
  let current = original;
  let before = "";
  let editing = false;
  const page = h(doc, "span", { class: "sap-marginalia-page" });
  const quote = h(doc, "blockquote");
  const comment = h(doc, "div", { class: "sap-marginalia-comment" });
  const error = h(doc, "span", {
    class: "sap-marginalia-error",
    role: "alert",
    hidden: true,
  });
  const input = h(doc, "textarea", {
    rows: 3,
    "aria-label": getString("marginalia-reader-edit"),
  });
  const marker = iconButton(
    doc,
    "",
    MessageSquare,
    toggle,
    "sap-marginalia-marker",
  );
  marker.hidden = true;
  const edit = iconButton(
    doc,
    getString("marginalia-reader-edit"),
    Pencil,
    () => {
      before = current.annotationComment;
      input.value = before;
      setEditing(true);
      input.focus();
    },
  );
  const ask = iconButton(doc, getString("context-add-selection"), Bot, () => {
    actions.ask(reader, current);
  });
  const close = iconButton(
    doc,
    getString("marginalia-reader-close"),
    X,
    toggle,
  );
  const cancel = h(
    doc,
    "button",
    {
      type: "button",
      click: () => {
        setEditing(false);
        edit.focus();
      },
    },
    getString("prefs-agent-cancel"),
  );
  const save = h(
    doc,
    "button",
    { type: "button", click: () => void commit() },
    getString("prefs-agent-save"),
  );
  const editor = h(
    doc,
    "div",
    { hidden: true },
    input,
    error,
    h(doc, "div", { class: "sap-marginalia-actions" }, cancel, save),
  );
  const card = h(
    doc,
    "article",
    {
      class: "sap-marginalia-card",
      "data-annotation-key": original.key,
      hidden: true,
    },
    h(
      doc,
      "header",
      { class: "sap-marginalia-header" },
      page,
      edit,
      ask,
      close,
    ),
    quote,
    comment,
    editor,
  );
  card.id = `sap-marginalia-${reader._instanceID}-${original.key}-${Services.uuid.generateUUID()}`;
  marker.dataset.annotationKey = original.key;
  marker.setAttribute("aria-controls", card.id);
  card.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Escape" || save.disabled) return;
    if (editing) {
      setEditing(false);
      edit.focus();
    } else if (!close.hidden) {
      toggle();
      marker.focus();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  });

  function render(annotation: Zotero.Item) {
    current = annotation;
    const label =
      annotation.annotationPageLabel || String(position.pageIndex + 1);
    page.textContent = getString("marginalia-reader-page", { page: label });
    const name = getString("marginalia-reader-show-comment", { page: label });
    marker.title = name;
    marker.setAttribute("aria-label", name);
    quote.textContent = annotation.annotationText;
    quote.hidden = !quote.textContent;
    comment.textContent = annotation.annotationComment;
    edit.hidden = editing || !actions.editable(annotation);
    for (const node of [card, marker]) {
      node.style.setProperty(
        "--sap-annotation-color",
        annotation.annotationColor,
      );
    }
  }

  function setEditing(next: boolean) {
    editing = next;
    card.dataset.editing = String(next);
    editor.hidden = !next;
    comment.hidden = next;
    error.hidden = true;
    edit.hidden = next || !actions.editable(current);
    schedule();
  }

  async function commit() {
    cancel.disabled = save.disabled = true;
    try {
      if (current.annotationComment !== before) {
        error.textContent = getString("marginalia-reader-comment-changed");
        error.hidden = false;
        return;
      }
      await actions.saveComment(current, input.value, before);
      setEditing(false);
      edit.focus();
    } catch (cause) {
      logWarn("Could not save a marginal comment", cause);
      error.textContent = getString("marginalia-reader-save-error");
      error.hidden = false;
    } finally {
      cancel.disabled = save.disabled = false;
    }
  }

  function showCard(
    left: number,
    top: number,
    width: number,
    expanded: boolean,
  ) {
    Object.assign(card.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
    });
    card.hidden = false;
    card.dataset.expanded = String(expanded);
    close.hidden = !expanded;
    marker.setAttribute("aria-expanded", String(expanded));
    if (!expanded) marker.hidden = true;
  }
  function showMarker(left: number, top: number) {
    Object.assign(marker.style, { left: `${left}px`, top: `${top}px` });
    marker.hidden = false;
  }
  render(original);
  return {
    card,
    marker,
    render,
    showCard,
    showMarker,
    get editing() {
      return editing;
    },
    hide() {
      card.hidden = marker.hidden = true;
      marker.setAttribute("aria-expanded", "false");
    },
    remove() {
      card.remove();
      marker.remove();
    },
  };
}

function attachView(
  doc: Document,
  reader: Reader,
  view: PdfView,
  actions: ReaderActions,
) {
  const win = doc.defaultView!;
  const viewWindow = view._iframeWindow!;
  const layer = h(doc, "div", { class: "sap-marginalia-layer" });
  doc.body?.append(layer);
  const cards = new Map<string, ReturnType<typeof createCard>>();
  let marks = annotationsOf(reader);
  let opened: string | undefined;
  let frame: number | undefined;
  let bus: typeof viewWindow.PDFViewerApplication.eventBus;
  let requestFocus = false;
  let disposed = false;

  function schedule() {
    if (disposed) return;
    frame ??= win.requestAnimationFrame(render);
  }
  const resize = new (Zotero.getMainWindow().ResizeObserver)(schedule);
  resize.observe(view._iframe);
  viewWindow.document.addEventListener("scroll", schedule, true);
  viewWindow.addEventListener("resize", schedule);
  void view.initializedPromise?.then(schedule, () => {});

  function render() {
    frame = undefined;
    const nextBus = viewWindow.PDFViewerApplication?.eventBus;
    if (nextBus !== bus) {
      for (const event of VIEW_EVENTS) bus?.off(event, schedule);
      bus = nextBus;
      for (const event of VIEW_EVENTS) bus?.on(event, schedule);
    }
    const bounds = pdfViewBounds(view);
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    Object.assign(layer.style, {
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    if (width < 48 || height < 48) {
      for (const entry of cards.values()) entry.hide();
      return;
    }

    const visible = marks
      .flatMap(({ item, position }) => {
        const mark = projectPdfMark(view, position);
        return mark && mark.bottom > bounds.top && mark.top < bounds.bottom
          ? [{ item, position, mark }]
          : [];
      })
      .sort((left, right) => left.mark.top - right.mark.top);
    const visibleKeys = new Set<string>();
    const ends = { left: GAP, right: GAP };
    let nextMarkerTop = GAP;
    let nextMarkerColumn = 0;
    for (const { item, position, mark } of visible) {
      const key = item.key;
      visibleKeys.add(key);
      let entry = cards.get(key);
      if (!entry) {
        entry = createCard(
          doc,
          reader,
          item,
          position,
          actions,
          () => {
            opened = opened === key ? undefined : key;
            requestFocus = opened === key;
            schedule();
          },
          schedule,
        );
        cards.set(key, entry);
        layer.append(entry.marker, entry.card);
      }
      entry.render(item);
      const open = opened === key;
      const top = Math.max(
        GAP,
        (mark.top + mark.bottom) / 2 - bounds.top - MARKER / 2,
      );
      const placement = marginPlacement(mark, bounds.left, width);
      if (placement && !open) {
        const y = Math.max(top, ends[placement.side]);
        entry.showCard(placement.left, y, placement.width, false);
        const end = y + entry.card.offsetHeight;
        // A nearby mark gets its own marker once the cards would obscure their neighbours.
        if (end <= height - GAP && (entry.editing || y - top <= 64)) {
          ends[placement.side] = end + GAP;
          continue;
        }
      }
      const markerY = Math.max(top, nextMarkerTop);
      const markerX = Math.min(
        width - MARKER - GAP,
        Math.max(GAP, mark.pageRight - bounds.left - MARKER - GAP),
      );
      // At the bottom edge, use another column so nearby markers stay clickable.
      if (markerY + MARKER > height - GAP) nextMarkerColumn++;
      entry.showMarker(
        Math.max(GAP, markerX - nextMarkerColumn * (MARKER + 3)),
        Math.min(markerY, height - MARKER - GAP),
      );
      nextMarkerTop = markerY + MARKER + 3;
      if (!open && !entry.editing) {
        entry.card.hidden = true;
        entry.marker.setAttribute("aria-expanded", "false");
        continue;
      }
      const size = Math.min(MAX_CARD, width - GAP * 2);
      const x = placement?.left ?? Math.max(GAP, markerX - size - GAP);
      entry.showCard(Math.min(x, width - size - GAP), top, size, true);
      entry.card.style.top = `${Math.max(GAP, Math.min(top, height - entry.card.offsetHeight - GAP))}px`;
      if (requestFocus && open) {
        requestFocus = false;
        entry.card
          .querySelector<HTMLButtonElement>("button:not([hidden])")
          ?.focus();
      }
    }
    for (const [key, entry] of cards) {
      if (visibleKeys.has(key)) continue;
      if (entry.editing) {
        entry.hide();
        continue;
      }
      entry.remove();
      cards.delete(key);
    }
  }

  schedule();
  return {
    refresh() {
      marks = annotationsOf(reader);
      schedule();
    },
    dispose() {
      disposed = true;
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      resize.disconnect();
      viewWindow.document.removeEventListener("scroll", schedule, true);
      viewWindow.removeEventListener("resize", schedule);
      for (const event of VIEW_EVENTS) bus?.off(event, schedule);
      layer.remove();
    },
  };
}

function marginPlacement(mark: ProjectedMark, origin: number, width: number) {
  const before = mark.pageLeft - origin - GAP * 2;
  const after = width - (mark.pageRight - origin) - GAP * 2;
  if (Math.max(before, after) < MIN_CARD) return;
  if (after >= before) {
    return {
      side: "right" as const,
      left: mark.pageRight - origin + GAP,
      width: Math.min(after, MAX_CARD),
    };
  }
  const size = Math.min(before, MAX_CARD);
  return {
    side: "left" as const,
    left: mark.pageLeft - origin - GAP - size,
    width: size,
  };
}

export function mountMarginaliaReader(actions: ReaderActions) {
  const readers = new Map<Reader, ReturnType<typeof mountReader>>();

  function mountReader(
    reader: Reader,
    doc: Document,
    append: (button: HTMLButtonElement) => void,
  ) {
    const views = new Map<PdfView, ReturnType<typeof attachView>>();
    const style = h(doc, "style", {}, MARGINALIA_STYLES);
    doc.head?.append(style);
    let active = true;
    const label = getString("marginalia-reader-toolbar");
    const button = iconButton(
      doc,
      label,
      PanelRight,
      () => {
        active = !active;
        sync();
      },
      "toolbar-button sap-marginalia-toggle",
    );
    button.dataset.tabstop = "1";
    button.hidden = !actions.enabled();
    append(button);
    const observer = new (Zotero.getMainWindow().MutationObserver)(
      (changes: MutationRecord[]) => {
        if (
          changes.some(
            ({ target }) =>
              target?.nodeType === 1 &&
              !(target as Element).closest(".sap-marginalia-layer"),
          )
        )
          sync();
      },
    );
    if (doc.body)
      observer.observe(doc.body, { childList: true, subtree: true });

    function sync() {
      const enabled = actions.enabled();
      button.hidden = !enabled;
      button.setAttribute("aria-pressed", String(active && enabled));
      button.classList.toggle("active", active && enabled);
      const open =
        active && enabled
          ? readerPdfViews(reader).filter(
              (view) =>
                view._iframe?.isConnected && view._iframeWindow?.document?.body,
            )
          : [];
      for (const [view, attached] of views) {
        if (open.includes(view)) continue;
        attached.dispose();
        views.delete(view);
      }
      for (const view of open) {
        if (!views.has(view))
          views.set(view, attachView(doc, reader, view, actions));
      }
    }
    doc.defaultView!.addEventListener("unload", dispose, { once: true });
    void reader._initPromise.then(sync, () => {});
    function dispose() {
      observer.disconnect();
      doc.defaultView?.removeEventListener("unload", dispose);
      for (const view of views.values()) view.dispose();
      views.clear();
      button.remove();
      style.remove();
      readers.delete(reader);
    }
    sync();
    return {
      sync,
      appendTo(append: (control: HTMLButtonElement) => void) {
        if (!button.isConnected) append(button);
      },
      refresh() {
        sync();
        for (const view of views.values()) view.refresh();
      },
      dispose,
    };
  }

  const toolbar: _ZoteroTypes.Reader.EventHandler<"renderToolbar"> = ({
    reader,
    doc,
    append,
  }) => {
    if (!reader._item?.isPDFAttachment()) return;
    const mounted = readers.get(reader);
    if (mounted) mounted.appendTo(append);
    else readers.set(reader, mountReader(reader, doc, append));
  };
  Zotero.Reader.registerEventListener("renderToolbar", toolbar, config.addonID);
  function findOpenReaders() {
    for (const reader of Zotero.Reader._readers) {
      if (readers.has(reader) || !reader._item?.isPDFAttachment()) continue;
      const doc = reader._iframeWindow?.document;
      const slot = doc?.querySelector(".toolbar .custom-sections");
      if (doc && slot)
        readers.set(
          reader,
          mountReader(reader, doc, (button) =>
            slot.append(h(doc, "div", { class: "section" }, button)),
          ),
        );
    }
  }
  const notifier = Zotero.Notifier.registerObserver(
    {
      notify(event, type, ids) {
        if (type === "tab" && event === "close") {
          for (const [reader, mounted] of readers)
            if (ids.some((id) => String(id) === reader.tabID))
              mounted.dispose();
        } else if (type === "tab") {
          findOpenReaders();
        } else if (type === "item") {
          for (const mounted of readers.values()) mounted.refresh();
        }
      },
    },
    ["tab", "item"],
    "sapientia-marginalia",
  );
  findOpenReaders();
  return {
    refresh() {
      findOpenReaders();
      for (const mounted of readers.values()) mounted.sync();
    },
    dispose() {
      Zotero.Reader.unregisterEventListener("renderToolbar", toolbar);
      Zotero.Notifier.unregisterObserver(notifier);
      for (const mounted of readers.values()) mounted.dispose();
    },
  };
}
