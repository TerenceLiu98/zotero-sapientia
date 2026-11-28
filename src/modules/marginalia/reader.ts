import { PanelRight } from "lucide";
import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { h, iconButton } from "../ui/dom";
import {
  pdfViewBounds,
  projectPdfMark,
  readerPdfViews,
  type PdfPosition,
} from "./geometry";
import { createCard, type ReaderActions } from "./reader-card";
import { MARGINALIA_STYLES } from "./reader-styles";

type Reader = _ZoteroTypes.ReaderInstance;
type PdfView = _ZoteroTypes.Reader.PDFView;

const GAP = 10;
const MARKER = 24;
const MIN_CARD = 172;
const MAX_CARD = 288;
const SVG = "http://www.w3.org/2000/svg";
const PDF_SCROLLBAR_STYLE = "#viewerContainer { scrollbar-width: none; }";
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
  const pages = new Map<
    number,
    { item: Zotero.Item; position: PdfPosition }[]
  >();
  for (const item of reader._item.getAnnotations()) {
    if (
      item.deleted ||
      !["highlight", "underline"].includes(item.annotationType) ||
      !item.annotationComment?.trim()
    )
      continue;
    const position = positionOf(item);
    if (!position) continue;
    const entries = pages.get(position.pageIndex);
    if (entries) entries.push({ item, position });
    else pages.set(position.pageIndex, [{ item, position }]);
  }
  return pages;
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
  const connectors = doc.createElementNS(SVG, "svg");
  connectors.setAttribute("class", "sap-marginalia-connectors");
  connectors.setAttribute("aria-hidden", "true");
  layer.append(connectors);
  doc.body?.append(layer);
  const gutterStyle = h(viewWindow.document, "style", {}, PDF_SCROLLBAR_STYLE);
  viewWindow.document.head?.append(gutterStyle);
  let gutters = { left: 0, right: 0 };
  const cards = new Map<string, ReturnType<typeof createCard>>();
  let marks: ReturnType<typeof annotationsOf> | undefined;
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

    const viewer = viewWindow.PDFViewerApplication?.pdfViewer;
    if (!viewer?.pagesCount) return;
    marks ??= annotationsOf(reader);
    const side =
      marks.size && width >= 620
        ? Math.min(
            MAX_CARD + GAP * 2,
            Math.max(MIN_CARD + GAP * 2, Math.floor(width * 0.22)),
          )
        : 0;
    const left = width >= 820 ? side : 0;
    if (gutters.left !== left || gutters.right !== side) {
      gutters = { left, right: side };
      gutterStyle.textContent = side
        ? `${PDF_SCROLLBAR_STYLE} #viewerContainer { left: ${left}px; right: ${side}px; }`
        : PDF_SCROLLBAR_STYLE;
      restoreAutomaticScale(viewer);
    }
    const { ids } = viewer._getVisiblePages() as { ids: Set<number> };
    const visible = Array.from(ids)
      .flatMap((page) => marks?.get(page - 1) ?? [])
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
        connectors.append(entry.connector);
        layer.append(entry.marker, entry.card);
      }
      const open = opened === key;
      const anchorY = (mark.top + mark.bottom) / 2 - bounds.top;
      const top = Math.max(GAP, anchorY - 88);
      const pageStart = Math.max(gutters.left, mark.pageLeft - bounds.left);
      const pageEnd = Math.min(
        width - gutters.right,
        mark.pageRight - bounds.left,
      );
      const placements = marginPlacements(pageStart, pageEnd, width);
      const nearest =
        (mark.left + mark.right) / 2 <= (mark.pageLeft + mark.pageRight) / 2
          ? "left"
          : "right";
      placements.sort((a, b) => {
        const offset = (side: "left" | "right") =>
          Math.max(0, ends[side] - top);
        return (
          offset(a.side) - offset(b.side) ||
          Number(b.side === nearest) - Number(a.side === nearest)
        );
      });
      const connect = (
        placement: (typeof placements)[number],
        y: number,
        end: number,
      ) => {
        const isLeft = placement.side === "left";
        const x = (isLeft ? mark.left : mark.right) - bounds.left;
        entry.connect(
          Math.max(gutters.left, Math.min(x, width - gutters.right)),
          Math.max(0, Math.min(anchorY, height)),
          isLeft ? placement.left + placement.width : placement.left,
          Math.min(y + 38, end - 12),
        );
      };
      let placed = false;
      for (const placement of placements) {
        if (open) break;
        const y = Math.min(
          Math.max(top, ends[placement.side]),
          height - GAP - 30,
        );
        if (y < ends[placement.side]) continue;
        entry.showCard(placement.left, y, placement.width, false);
        const end = y + entry.card.offsetHeight;
        if (end <= height - GAP) {
          ends[placement.side] = end + GAP;
          connect(placement, y, end);
          entry.positionMenu();
          placed = true;
          break;
        }
      }
      if (placed) continue;
      entry.disconnect();
      const markerY = Math.max(anchorY - MARKER / 2, nextMarkerTop);
      const markerX = Math.min(
        width - MARKER - GAP,
        Math.max(GAP, pageEnd - MARKER - GAP),
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
      const placement = placements[0];
      const x = placement?.left ?? Math.max(GAP, markerX - size - GAP);
      entry.showCard(
        Math.min(x, width - (placement?.width ?? size) - GAP),
        top,
        placement?.width ?? size,
        true,
      );
      const cardHeight = entry.card.offsetHeight;
      const y = Math.max(GAP, Math.min(top, height - cardHeight - GAP));
      entry.card.style.top = `${y}px`;
      if (placement) connect(placement, y, y + cardHeight);
      entry.positionMenu();
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
      marks = undefined;
      const items = Zotero.Items.get(
        [...cards.keys()]
          .map((key) =>
            Zotero.Items.getIDFromLibraryAndKey(reader._item.libraryID, key),
          )
          .filter((id): id is number => typeof id === "number"),
      );
      for (const item of items) cards.get(item.key)?.render(item);
      schedule();
    },
    dispose() {
      disposed = true;
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      resize.disconnect();
      viewWindow.document.removeEventListener("scroll", schedule, true);
      viewWindow.removeEventListener("resize", schedule);
      for (const event of VIEW_EVENTS) bus?.off(event, schedule);
      gutterStyle.remove();
      const viewer = viewWindow.PDFViewerApplication?.pdfViewer;
      if (viewer && gutters.right) restoreAutomaticScale(viewer);
      for (const entry of cards.values()) entry.remove();
      cards.clear();
      layer.remove();
    },
  };
}

function restoreAutomaticScale(
  viewer: NonNullable<
    NonNullable<PdfView["_iframeWindow"]>["PDFViewerApplication"]["pdfViewer"]
  >,
) {
  const scale = viewer.currentScaleValue;
  if (["auto", "page-width", "page-fit"].includes(scale))
    viewer.currentScaleValue = scale;
  viewer.update();
}

function marginPlacements(pageStart: number, pageEnd: number, width: number) {
  const before = pageStart - GAP * 2;
  const after = width - pageEnd - GAP * 2;
  const size = Math.min(before, MAX_CARD);
  return [
    {
      side: "left" as const,
      left: GAP,
      width: size,
    },
    {
      side: "right" as const,
      left: width - GAP - Math.min(after, MAX_CARD),
      width: Math.min(after, MAX_CARD),
    },
  ].filter((placement) => placement.width >= MIN_CARD);
}

export function mountMarginaliaReader(actions: ReaderActions) {
  const readers = new Map<Reader, ReturnType<typeof mountReader>>();

  function mountReader(
    reader: Reader,
    doc: Document,
    append: (button: HTMLButtonElement) => void,
  ) {
    const win = doc.defaultView!;
    const views = new Map<PdfView["_iframe"], ReturnType<typeof attachView>>();
    const style = h(doc, "style", {}, MARGINALIA_STYLES);
    doc.head?.append(style);
    let active = true;
    let pendingSync: number | undefined;
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
        // Only native view changes can change which overlays we need to mount.
        if (
          changes.some(({ addedNodes, removedNodes }) =>
            [...addedNodes, ...removedNodes].some(
              (node) =>
                node?.nodeType === 1 &&
                ((node as Element).matches("iframe") ||
                  (node as Element).querySelector("iframe")),
            ),
          )
        ) {
          pendingSync ??= win.requestAnimationFrame(() => {
            pendingSync = undefined;
            sync();
          });
        }
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
      for (const [iframe, attached] of views) {
        if (open.some((view) => view._iframe === iframe)) continue;
        attached.dispose();
        views.delete(iframe);
      }
      for (const view of open) {
        if (!views.has(view._iframe))
          views.set(view._iframe, attachView(doc, reader, view, actions));
      }
    }
    doc.defaultView!.addEventListener("unload", dispose, { once: true });
    void reader._initPromise.then(sync, () => {});
    function dispose() {
      observer.disconnect();
      if (pendingSync !== undefined) win.cancelAnimationFrame(pendingSync);
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
