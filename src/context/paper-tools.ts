import { z } from "zod";
import {
  itemIdentifier,
  libraryWriteInputSchema,
  libraryWriteSchema,
  prepareWrite,
  PROPOSE_ZOTERO_WRITE,
  writeAllowed,
  writeInputSchema,
  writeSchema,
  type WriteHandoff,
} from "../writes/request";
import { writeError } from "../writes/approval";
import {
  bibliographicItemTypes,
  metadataFieldNames,
  metadataItemType,
} from "../writes/metadata";
import {
  describeAttachment,
  findTagItem,
  paperAttachments,
  paperIdentity,
  paperMetadata,
  pdfURI,
  type PaperContext,
  type SelectedText,
  type TagItem,
} from "./paper";
import {
  isPersonalPaper,
  libraryCollectionsSchema,
  librarySearchSchema,
  listLibraryCollections,
  resolveLibraryPaper,
  searchLibrary,
} from "./library";

export const READ_CURRENT_PAPER = "read_current_paper";

const target = {
  turnId: z.string().min(1).describe("The turn ID supplied in the prompt."),
  ...itemIdentifier,
};
const attachmentTarget = {
  ...target,
  attachmentKey: z.string().min(1).optional(),
  attachmentID: z.number().int().positive().optional(),
};
const page = z.number().int().positive();
const pdfArgs = z.strictObject({
  ...attachmentTarget,
  page: page.optional(),
  startPage: page.optional(),
  endPage: page.optional(),
});
export interface ToolTurn {
  paper?: PaperContext;
  tagItems?: readonly TagItem[];
  readSelection?: () => SelectedText | undefined;
  signal: AbortSignal;
  recordPdfRead?(pages: readonly { uri: string; text: string }[]): void;
}

export type ResolveTurn = (id: string) => ToolTurn | undefined;

export interface PaperToolOptions {
  library?: boolean;
  writeAllowed?: () => boolean;
  tagDeletionAllowed?: () => boolean;
}

const readers = {
  read_paper_metadata: {
    material: "metadata",
    description:
      "Read the current Zotero paper's metadata and PDF attachments. Pass itemType to look up editable fields and creator roles for a proposed type.",
    schema: z.strictObject({
      ...target,
      itemType: metadataItemType.optional(),
    }),
  },
  [READ_CURRENT_PAPER]: {
    material: "pdf",
    description:
      "Read PDF text for this turn. Pass page for one physical page (1-based), or startPage and endPage for an inclusive range. Omit all three for full text. Pass attachmentKey or attachmentID to select a PDF of the current paper.",
    schema: pdfArgs,
  },
  read_paper_selection: {
    material: "selection",
    description: "Read the current PDF selection, if it still exists.",
    schema: z.strictObject(attachmentTarget),
  },
  read_paper_annotations: {
    material: "annotations",
    description:
      "Read a PDF's annotations and highlights. Omit the attachment to use the turn's active PDF.",
    schema: z.strictObject(attachmentTarget),
  },
  read_paper_notes: {
    material: "notes",
    description: "Read the current paper's child notes.",
    schema: z.strictObject(target),
  },
  read_paper_tags: {
    material: "tags",
    description:
      "Read the current paper's tags. For a tagging turn with multiple selected papers, omit the item identifier to read all selected papers' tags, or pass itemID or itemKey for one.",
    schema: z.strictObject(target),
  },
} satisfies Record<
  string,
  {
    material:
      "metadata" | "pdf" | "selection" | "annotations" | "notes" | "tags";
    description: string;
    schema: z.ZodType;
  }
>;

const libraryReaders = {
  search_library: {
    description:
      "Search regular papers in the personal Zotero library. Combine title, author, DOI, year, tag, and collection filters. Use nextCursor with the same filters to continue.",
    schema: librarySearchSchema,
  },
  list_library_collections: {
    description:
      "List collections in the personal Zotero library with optional name filtering. Use nextCursor to continue.",
    schema: libraryCollectionsSchema,
  },
};

const libraryDescriptions = {
  read_paper_metadata:
    "Read a personal-library paper's bibliographic metadata and PDF attachments. Pass itemType to look up editable fields and creator roles.",
  [READ_CURRENT_PAPER]:
    "Read PDF text from a personal-library paper. Pass page for one physical page (1-based), or startPage and endPage for a range. Omit all three for full text. Pass attachmentKey or attachmentID to select a PDF of the paper.",
  read_paper_selection:
    "Read the current PDF selection if it belongs to the specified personal-library paper.",
  read_paper_annotations:
    "Read a personal-library paper's PDF annotations. Omit the attachment to use its first PDF.",
  read_paper_notes: "Read a personal-library paper's child notes.",
  read_paper_tags: "Read a personal-library paper's tags.",
};

export function listPaperTools(options: PaperToolOptions = {}) {
  const readTool = (name: string, description: string, schema: z.ZodType) => ({
    name,
    description,
    inputSchema: z.toJSONSchema(schema, { target: "draft-7" }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  });
  const reads = Object.entries(readers).map(([name, { description, schema }]) =>
    readTool(
      name,
      options.library
        ? `${libraryDescriptions[name as keyof typeof readers]} Supply itemID or itemKey.`
        : description,
      schema,
    ),
  );
  if (options.library) {
    for (const [name, { description, schema }] of Object.entries(
      libraryReaders,
    ))
      reads.push(readTool(name, description, schema));
  }
  return (options.writeAllowed ?? writeAllowed)()
    ? [
        ...reads,
        {
          name: PROPOSE_ZOTERO_WRITE,
          description: options.library
            ? "Propose up to 50 ordered changes to the personal Zotero library. Use explicit item IDs or keys for item operations. Include source evidence for metadata corrections, or report unresolved items when evidence conflicts or is insufficient. Wait for the result before reporting changes."
            : 'Request user approval to update Zotero bibliographic metadata, create or edit child notes, or add or remove tags. For a type change, use operation "update_metadata" with change { "itemType": "journalArticle" }. Use read_paper_metadata to find supported types, fields and creator roles. Wait for the result before reporting changes.',
          inputSchema: options.library
            ? libraryWriteInputSchema
            : writeInputSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
      ]
    : reads;
}

function toolText(text: string) {
  return [{ type: "text", text }];
}

export function toolError(text: string) {
  return { isError: true, content: toolText(text) };
}

function toolResult(value: object) {
  return { content: toolText(JSON.stringify(value)) };
}

function paperTags(item: Zotero.Item) {
  return {
    ...paperIdentity(item),
    tags: item.getTags(),
  };
}

function currentItem(paper: TagItem, args: z.infer<typeof pdfArgs>) {
  if (
    (args.itemKey !== undefined && args.itemKey !== paper.itemKey) ||
    (args.itemID !== undefined && args.itemID !== paper.itemID) ||
    (args.libraryID !== undefined && args.libraryID !== paper.libraryID)
  )
    return;
  const item = Zotero.Items.get(paper.itemID);
  if (
    item &&
    !item.deleted &&
    item.key === paper.itemKey &&
    item.libraryID === paper.libraryID
  )
    return item;
}

function currentAttachment(
  item: Zotero.Item,
  paper: PaperContext | undefined,
  args: z.infer<typeof pdfArgs>,
) {
  const { attachmentKey, attachmentID } = args;
  return paperAttachments(item).find((attachment) => {
    if (attachment.libraryID !== item.libraryID) return false;
    if (attachmentKey === undefined && attachmentID === undefined)
      return (
        !paper ||
        (attachment.id === paper.attachment?.itemID &&
          attachment.key === paper.attachment.itemKey)
      );
    return (
      (attachmentKey === undefined || attachment.key === attachmentKey) &&
      (attachmentID === undefined || attachment.id === attachmentID)
    );
  });
}

function annotationPage(position: string): number | undefined {
  try {
    const index: unknown = JSON.parse(position)?.pageIndex;
    if (typeof index === "number" && Number.isSafeInteger(index) && index >= 0)
      return index + 1;
  } catch {
    // Some annotations have no usable page position.
  }
}

async function readPdf(
  attachment: Zotero.Item,
  args: z.infer<typeof pdfArgs>,
  authorized: () => boolean,
) {
  const range = args.startPage !== undefined || args.endPage !== undefined;
  if (
    range &&
    (args.page !== undefined ||
      args.startPage === undefined ||
      args.endPage === undefined ||
      args.startPage > args.endPage)
  )
    return toolError(
      "Supply page alone, or both startPage and endPage in ascending order.",
    );

  // Zotero 10's worker accepts zero-based index arrays. An empty array
  // obtains the page count without extracting any page text.
  const extract = (
    indices: number[],
  ): Promise<{ text: string; totalPages: number }> => {
    if (!authorized()) throw new Error("Read no longer authorized");
    return Zotero.PDFWorker.getFullText(attachment.id, indices, true);
  };
  const { totalPages } = await extract([]);
  const first = args.page ?? args.startPage ?? 1;
  const last = args.page ?? args.endPage ?? totalPages;
  if (first > totalPages || last > totalPages)
    return toolError(
      `This PDF has ${totalPages} pages. Request pages from 1 to ${totalPages}.`,
    );
  const uri = pdfURI(attachment);
  const numbers = Array.from(
    { length: last - first + 1 },
    (_, index) => first + index,
  );

  async function extractPages(pages: number[]): Promise<string[]> {
    const { text } = await extract(pages.map((number) => number - 1));
    if (!text) return pages.map(() => "");
    const segments = text.split("\f");
    if (segments.length === pages.length)
      return segments.map((segment) => segment.trim());
    // The worker trims separators at the ends when edge pages are empty.
    // Split the range until the page positions can be recovered unambiguously.
    if (pages.length === 1) return [text.trim()];
    const middle = Math.floor(pages.length / 2);
    return [
      ...(await extractPages(pages.slice(0, middle))),
      ...(await extractPages(pages.slice(middle))),
    ];
  }

  const texts = await extractPages(numbers);
  if (!texts.some(Boolean))
    return toolError(
      "The requested PDF pages contain no extractable text. Use an OCR tool for scanned pages.",
    );
  const pages = numbers.map((number, index) => ({
    page: number,
    uri: `${uri}?page=${number}`,
    text: texts[index],
  }));
  return {
    attachmentID: attachment.id,
    attachmentKey: attachment.key,
    url: uri,
    totalPages,
    extractedPages: pages.length,
    text: texts.join("\n\n"),
    pages,
  };
}

export async function callPaperTool(
  name: unknown,
  input: unknown,
  active: ResolveTurn,
  handoff: WriteHandoff,
  options: PaperToolOptions = {},
) {
  const allowed = options.writeAllowed ?? writeAllowed;
  if (name === PROPOSE_ZOTERO_WRITE) {
    if (!allowed()) return toolError("Zotero is in read-only mode.");
    const parsed = (
      options.library ? libraryWriteSchema : writeSchema
    ).safeParse(input);
    if (!parsed.success)
      return toolError(
        `Invalid Zotero write proposal: ${z.prettifyError(parsed.error)}`,
      );
    const turn = active(parsed.data.turnId);
    if (!turn || turn.signal.aborted)
      return toolError("The write proposal requires an active turn.");
    try {
      const proposal = await prepareWrite(
        parsed.data,
        options.library ? undefined : turn.paper,
        options.library ? undefined : turn.tagItems,
        options,
      );
      if (!allowed()) return toolError("Zotero is in read-only mode.");
      if (!turnIsActive(turn, active(parsed.data.turnId)))
        return toolError("The turn is no longer active.");
      const result = await handoff(proposal, turn.signal);
      return toolResult({
        status: result?.status ?? "cancelled",
        outcomes:
          result?.outcomes.map(({ target, ...outcome }) => ({
            ...outcome,
            target: {
              itemID: target.itemID,
              itemKey: target.itemKey,
              libraryID: target.libraryID,
              ...("collectionKey" in target && {
                collectionKey: target.collectionKey,
              }),
            },
          })) ?? [],
      });
    } catch (error) {
      return toolError(writeError(error));
    }
  }
  if (options.library) {
    if (name === "search_library")
      return callLibraryRead(
        name,
        input,
        active,
        librarySearchSchema,
        searchLibrary,
      );
    if (name === "list_library_collections")
      return callLibraryRead(
        name,
        input,
        active,
        libraryCollectionsSchema,
        listLibraryCollections,
      );
  }
  if (typeof name !== "string" || !Object.hasOwn(readers, name))
    return toolError("Unknown Zotero tool.");
  const reader = readers[name as keyof typeof readers];
  const parsed = reader.schema.safeParse(input);
  if (!parsed.success)
    return toolError(
      `Invalid arguments for ${name}: ${z.prettifyError(parsed.error)}`,
    );
  const args = parsed.data;
  const { material } = reader;
  const turn = active(args.turnId);
  if (!turn || turn.signal.aborted)
    return toolError("The requested target is outside the active turn.");
  if (!options.library && turn.tagItems?.length && material === "tags") {
    if (args.itemID !== undefined || args.itemKey !== undefined) {
      const target = findTagItem(turn.tagItems, args);
      const item = target && currentItem(target, args);
      return item
        ? toolResult(paperTags(item))
        : toolError("The requested target is outside the active turn.");
    }
    return toolResult({
      items: turn.tagItems.flatMap((target) => {
        const item = currentItem(target, args);
        return item ? [paperTags(item)] : [];
      }),
    });
  }
  const paper = options.library ? undefined : turn.paper;
  const item = options.library
    ? await resolveLibraryPaper(args)
    : paper && currentItem(paper, args);
  if (!item || !turnIsActive(turn, active(args.turnId)))
    return toolError(
      options.library
        ? "Specify an available paper in the personal Zotero library."
        : "The requested target is outside the active turn.",
    );
  switch (material) {
    case "metadata": {
      const metadata = paperMetadata(item);
      const types = item.isRegularItem() ? bibliographicItemTypes() : [];
      const requestedType = "itemType" in args ? args.itemType : undefined;
      const selectedType =
        requestedType === undefined
          ? types.find(({ id }) => id === item.itemTypeID)
          : types.find(({ name }) => name === requestedType);
      if (requestedType && !selectedType)
        return toolError(
          `'${requestedType}' is not a Zotero bibliographic item type.`,
        );
      const fields = item.isRegularItem()
        ? metadataFieldNames(item.itemTypeID)
        : [];
      return toolResult({
        ...metadata,
        abstract: metadata.abstract || null,
        doi: metadata.doi || null,
        year: metadata.year || null,
        itemType: Zotero.ItemTypes.getName(item.itemTypeID),
        editableItemTypes: types.map(({ name }) => name),
        editableItemType: selectedType?.name ?? null,
        editableFields: selectedType ? metadataFieldNames(selectedType.id) : [],
        fields: Object.fromEntries(
          fields
            .map((field): [string, string] => [field, item.getField(field)])
            .filter(([, value]) => value),
        ),
        creators: item.getCreatorsJSON(),
        creatorTypes: selectedType
          ? Zotero.CreatorTypes.getTypesForItemType(selectedType.id).map(
              ({ name }) => name,
            )
          : [],
        attachment: paper?.attachment ?? null,
        attachments: paperAttachments(item).map(describeAttachment),
      });
    }
    case "notes":
      return toolResult({
        ...paperIdentity(item),
        notes: Zotero.Items.get(item.getNotes())
          .filter((note) => !note.deleted)
          .map((note) => ({
            itemKey: note.key,
            html: note.getNote(),
          })),
      });
    case "tags":
      return toolResult(paperTags(item));
    default: {
      if (material === "selection") {
        const selection = turn.readSelection?.();
        const explicitAttachment =
          ("attachmentKey" in args && args.attachmentKey !== undefined) ||
          ("attachmentID" in args && args.attachmentID !== undefined);
        const useActiveSelection =
          options.library && selection && !explicitAttachment;
        const attachment = currentAttachment(
          item,
          paper,
          useActiveSelection
            ? { ...args, attachmentKey: selection.attachmentKey }
            : args,
        );
        if (!attachment) {
          if (options.library && !explicitAttachment)
            return toolResult({ ...paperIdentity(item), selection: null });
          return toolError("No matching PDF belongs to the current paper.");
        }
        const matches =
          selection?.attachmentKey === attachment.key &&
          selection.libraryID === attachment.libraryID;
        return toolResult({
          ...describeAttachment(attachment),
          selection: matches
            ? {
                text: selection.text,
                page:
                  selection.pageIndex === undefined
                    ? undefined
                    : selection.pageIndex + 1,
                pageLabel: selection.pageLabel,
                uri: selection.uri,
              }
            : null,
        });
      }
      const attachment = currentAttachment(item, paper, args);
      if (!attachment)
        return toolError("No matching PDF belongs to the current paper.");
      const source = describeAttachment(attachment);
      if (material === "annotations") {
        return toolResult({
          ...source,
          annotations: attachment
            .getAnnotations()
            .filter((annotation) => !annotation.deleted)
            .map((annotation) => {
              const page = annotationPage(annotation.annotationPosition);
              return {
                itemKey: annotation.key,
                type: annotation.annotationType,
                text: annotation.annotationText || undefined,
                comment: annotation.annotationComment || undefined,
                page,
                pageLabel: annotation.annotationPageLabel || undefined,
                uri:
                  page === undefined
                    ? source.uri
                    : `${source.uri}?page=${page}`,
              };
            }),
        });
      }
      const authorized = () => {
        const current = active(args.turnId);
        const target = options.library
          ? Zotero.Items.get(item.id)
          : current?.paper && currentItem(current.paper, args);
        return (
          turnIsActive(turn, current) &&
          !!target &&
          (!options.library ||
            (isPersonalPaper(target) && target.key === item.key)) &&
          currentAttachment(target, paper, args)?.id === attachment.id
        );
      };
      try {
        const result = await readPdf(attachment, args, authorized);
        if (authorized()) {
          if (!("pages" in result)) return result;
          turn.recordPdfRead?.(result.pages);
          return toolResult(result);
        }
      } catch {
        if (authorized())
          return toolError(
            "The PDF could not be read. Check that the attachment is available locally and can be opened.",
          );
      }
      return toolError("The turn or its read permission is no longer active.");
    }
  }
}

function turnIsActive(turn: ToolTurn, current: ToolTurn | undefined) {
  return !turn.signal.aborted && current?.signal === turn.signal;
}

async function callLibraryRead<T extends { turnId: string }>(
  name: string,
  input: unknown,
  active: ResolveTurn,
  schema: z.ZodType<T>,
  read: (query: T) => Promise<object> | object,
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return toolError(
      `Invalid arguments for ${name}: ${z.prettifyError(parsed.error)}`,
    );
  const { turnId } = parsed.data;
  const turn = active(turnId);
  if (!turn || turn.signal.aborted)
    return toolError("The turn is no longer active.");
  try {
    const result = await read(parsed.data);
    if (turnIsActive(turn, active(turnId))) return toolResult(result);
  } catch (error) {
    return toolError(writeError(error));
  }
  return toolError("The turn is no longer active.");
}
