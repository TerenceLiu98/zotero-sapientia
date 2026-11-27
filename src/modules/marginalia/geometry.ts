type PdfView = _ZoteroTypes.Reader.PDFView;

export interface PdfPosition {
  pageIndex: number;
  rects: number[][];
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ProjectedMark extends Bounds {
  pageLeft: number;
  pageRight: number;
  pageTop: number;
  pageBottom: number;
}

export function readerPdfViews(reader: _ZoteroTypes.ReaderInstance): PdfView[] {
  if (!reader._item?.isPDFAttachment()) return [];
  const internal = reader._internalReader as
    _ZoteroTypes.Reader.InternalReader<"pdf"> | undefined;
  if (!internal?._primaryView) return [];
  return internal._secondaryView
    ? [internal._primaryView, internal._secondaryView]
    : [internal._primaryView];
}

export function pdfViewBounds(view: PdfView): Bounds {
  const frame = view._iframe.getBoundingClientRect();
  const width = view._iframeWindow?.document.documentElement?.clientWidth;
  const height = view._iframeWindow?.document.documentElement?.clientHeight;
  return {
    left: frame.left,
    top: frame.top,
    right: frame.left + Math.min(width || frame.width, frame.width),
    bottom: frame.top + Math.min(height || frame.height, frame.height),
  };
}

export function projectPdfMark(
  view: PdfView,
  position: PdfPosition,
): ProjectedMark | undefined {
  const page = view._iframeWindow?.PDFViewerApplication?.pdfViewer?.getPageView(
    position.pageIndex,
  );
  if (!page?.viewport || !page.div?.isConnected || !position.rects.length)
    return;
  const frame = view._iframe.getBoundingClientRect();
  const bounds = page.div.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const pageLeft = frame.left + bounds.left;
  const pageTop = frame.top + bounds.top;
  const [a, b, c, d, e, f] = page.viewport.transform;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const [x1, y1, x2, y2] of position.rects) {
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    for (const x of [x1, x2]) {
      for (const y of [y1, y2]) {
        const px = pageLeft + a * x + c * y + e;
        const py = pageTop + b * x + d * y + f;
        left = Math.min(left, px);
        top = Math.min(top, py);
        right = Math.max(right, px);
        bottom = Math.max(bottom, py);
      }
    }
  }
  if (!Number.isFinite(left)) return;
  return {
    left,
    top,
    right,
    bottom,
    pageLeft,
    pageRight: pageLeft + bounds.width,
    pageTop,
    pageBottom: pageTop + bounds.height,
  };
}
