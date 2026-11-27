import { config } from "../../package.json";

export interface PaperAttachment {
  itemID: number;
  itemKey: string;
  uri: string;
  pageIndex?: number;
  pageLabel?: string;
}

export interface PaperContext {
  itemID: number;
  itemKey: string;
  libraryID: number;
  title: string;
  authors: string[];
  abstract: string;
  doi: string;
  year: string;
  attachment?: PaperAttachment;
  attachments?: PaperAttachment[];
}

export interface SelectedText {
  text: string;
  itemTitle: string;
  itemKey: string;
  libraryID: number;
  attachmentKey: string;
  pageIndex?: number;
  pageLabel?: string;
  uri: string;
}

type Reader = _ZoteroTypes.ReaderInstance;
type ReaderState = Reader["_internalReader"]["_state"];
type Selection = {
  text?: string;
  pageLabel?: string;
  position?: { pageIndex?: number };
};

// These two fields exist in Zotero 10's PDF reader state and are missing from zotero-types.
type PdfReaderState = ReaderState & {
  primaryViewSelectionPopup?: { annotation?: Selection };
  secondaryViewSelectionPopup?: { annotation?: Selection };
};
function readerState(reader: Reader) {
  return reader._internalReader?._state as PdfReaderState | undefined;
}

export function pdfURI(attachment: Zotero.Item): string {
  const { libraryID, key } = attachment;
  const library =
    libraryID === Zotero.Libraries.userLibraryID
      ? "library"
      : `groups/${Zotero.Groups.getGroupIDFromLibraryID(libraryID)}`;
  return `zotero://open-pdf/${library}/items/${key}`;
}

export function paperAttachments(item: Zotero.Item): Zotero.Item[] {
  if (item.isPDFAttachment()) return [item];
  return Zotero.Items.get(item.getAttachments()).filter(
    (attachment) => !attachment.deleted && attachment.isPDFAttachment(),
  );
}

export function describeAttachment(attachment: Zotero.Item): PaperAttachment {
  return {
    itemID: attachment.id,
    itemKey: attachment.key,
    uri: pdfURI(attachment),
  };
}

function selectionFrom(
  attachment: Zotero.Item,
  selection: Selection | undefined,
): SelectedText | undefined {
  const text = selection?.text?.trim();
  if (!text) return;
  const item = attachment.parentItem ?? attachment;
  if (attachment.deleted || item.deleted) return;
  const pageIndex = selection?.position?.pageIndex;
  const uri = pdfURI(attachment);
  return {
    text,
    itemTitle: item.getDisplayTitle(),
    itemKey: item.key,
    libraryID: item.libraryID,
    attachmentKey: attachment.key,
    pageIndex,
    pageLabel: selection?.pageLabel || undefined,
    uri: pageIndex === undefined ? uri : `${uri}?page=${pageIndex + 1}`,
  };
}

export function paperIdentity(item: Zotero.Item) {
  return { itemID: item.id, itemKey: item.key, libraryID: item.libraryID };
}

export function paperMetadata(item: Zotero.Item) {
  const primaryCreator = Zotero.CreatorTypes.getPrimaryIDForType(
    item.itemTypeID,
  );
  const authors = item
    .getCreators()
    .filter(({ creatorTypeID }) => creatorTypeID === primaryCreator)
    .map(({ firstName, lastName }) =>
      [firstName, lastName].filter(Boolean).join(" "),
    );
  const year = item.getField("year");
  return {
    ...paperIdentity(item),
    title: item.getDisplayTitle(),
    authors,
    abstract: item.getField("abstractNote"),
    doi: item.getField("DOI"),
    year: year === "0000" ? "" : year,
  };
}

export type TagItem = ReturnType<typeof paperMetadata>;

export function findTagItem(
  items: readonly TagItem[],
  {
    itemID,
    itemKey,
    libraryID,
  }: Partial<Pick<TagItem, "itemID" | "itemKey" | "libraryID">>,
) {
  if (itemID === undefined && itemKey === undefined) return;
  const matching = items.filter(
    (item) =>
      (itemID === undefined || itemID === item.itemID) &&
      (itemKey === undefined || itemKey === item.itemKey) &&
      (libraryID === undefined || libraryID === item.libraryID),
  );
  if (matching.length === 1) return matching[0];
}

function paperFrom(
  item: Zotero.Item,
  attachment: Zotero.Item | undefined,
  reader: Reader | undefined,
): PaperContext {
  const state = reader && readerState(reader);
  const stats =
    reader?._internalReader?._lastViewPrimary === false
      ? state?.secondaryViewStats
      : state?.primaryViewStats;
  return {
    ...paperMetadata(item),
    attachment: attachment && {
      ...describeAttachment(attachment),
      pageIndex: stats?.pageIndex,
      pageLabel: stats?.pageLabel,
    },
    attachments: paperAttachments(item).map(describeAttachment),
  };
}

function currentSelection(reader: Reader): Selection | undefined {
  const state = readerState(reader);
  const current =
    reader._internalReader?._lastViewPrimary === false
      ? state?.secondaryViewSelectionPopup
      : state?.primaryViewSelectionPopup;
  return current?.annotation?.text?.trim() ? current.annotation : undefined;
}

function activeReader(window: Window): Reader | undefined {
  const tabs = window.Zotero_Tabs;
  return tabs.selectedType === "reader"
    ? Zotero.Reader.getByTabID(tabs.selectedID)
    : undefined;
}

export function readActivePaperSelection(
  window: Window,
): SelectedText | undefined {
  const reader = activeReader(window);
  if (reader?._item?.isPDFAttachment())
    return selectionFrom(reader._item, currentSelection(reader));
}

export function createPaperContext(
  window: Window,
  onChange: () => void,
  onAttach: (selection: SelectedText) => void,
  addToChatLabel: string,
) {
  let timer: number | undefined;
  let disposed = false;
  let previous: string | null | undefined;
  const listeners = [
    window.document.getElementById("zotero-items-tree"),
    window.document.getElementById("zotero-collections-tree"),
  ];

  function target() {
    const reader = activeReader(window);
    let item: Zotero.Item | undefined;
    if (reader) {
      item = reader._item;
    } else if (window.Zotero_Tabs.selectedType === "library") {
      const selected = window.ZoteroPane.getSelectedItems();
      if (selected.length === 1) item = selected[0];
    }
    if (!item || item.deleted || item.isFeedItem) return;

    if (item.isPDFAttachment()) {
      const parent = item.parentItem ?? item;
      if (!parent.deleted) {
        return { item: parent, attachment: item, reader };
      }
    } else if (item.isRegularItem()) {
      const [attachment] = paperAttachments(item);
      return { item, attachment };
    }
  }

  function read(): PaperContext | undefined {
    const active = target();
    return active && paperFrom(active.item, active.attachment, active.reader);
  }

  function readTagItems(): TagItem[] | undefined {
    if (window.Zotero_Tabs.selectedType !== "library") return;
    const selected = window.ZoteroPane.getSelectedItems();
    if (selected.length < 2) return;
    const papers = new Set<Zotero.Item>();
    for (const selectedItem of selected) {
      if (selectedItem.deleted) continue;
      const item = selectedItem.isPDFAttachment()
        ? selectedItem.parentItem
        : selectedItem;
      if (item?.isRegularItem() && !item.deleted && !item.isFeedItem)
        papers.add(item);
    }
    if (papers.size > 1) return Array.from(papers, paperMetadata);
  }

  function refresh() {
    if (timer === undefined) return;
    const signature = JSON.stringify(read() ?? readTagItems());
    if (signature !== previous) {
      previous = signature;
      onChange();
    }
  }

  const onPopup: _ZoteroTypes.Reader.EventHandler<
    "renderTextSelectionPopup"
  > = ({ reader, doc, params, append }) => {
    if (reader !== activeReader(window) || !reader._item?.isPDFAttachment())
      return;
    const selection = selectionFrom(reader._item, params.annotation);
    if (!selection) return;
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "toolbar-button wide-button";
    button.setAttribute("data-tabstop", "1");
    button.textContent = addToChatLabel;
    button.addEventListener("click", () => {
      if (!disposed && reader === activeReader(window)) onAttach(selection);
    });
    append(button);
    refresh();
  };

  const notifier = Zotero.Notifier.registerObserver(
    { notify: refresh },
    ["tab", "item"],
    config.addonRef,
  );
  Zotero.Reader.registerEventListener(
    "renderTextSelectionPopup",
    onPopup,
    config.addonID,
  );
  for (const el of listeners) el?.addEventListener("select", refresh);

  function setVisible(visible: boolean) {
    if (disposed || visible === (timer !== undefined)) return;
    if (visible) {
      timer = window.setInterval(refresh, 400);
      previous = null;
      refresh();
    } else {
      window.clearInterval(timer);
      timer = undefined;
    }
  }

  function dispose() {
    setVisible(false);
    disposed = true;
    for (const el of listeners) el?.removeEventListener("select", refresh);
    Zotero.Notifier.unregisterObserver(notifier);
    Zotero.Reader.unregisterEventListener("renderTextSelectionPopup", onPopup);
  }

  return {
    read,
    readTagItems,
    readSelection: () => readActivePaperSelection(window),
    setVisible,
    dispose,
  };
}
