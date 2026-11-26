import { z } from "zod";
import {
  itemIdentifier,
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
  paperMetadata,
  pdfURI,
  type PaperContext,
  type SelectedText,
  type TagItem,
} from "./paper";

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

export function listPaperTools() {
  const reads = Object.entries(readers).map(
    ([name, { description, schema }]) => ({
      name,
      description,
      inputSchema: z.toJSONSchema(schema, { target: "draft-7" }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    }),
  );
  return writeAllowed()
    ? [
        ...reads,
        {
          name: PROPOSE_ZOTERO_WRITE,
          description:
            'Request user approval to update Zotero bibliographic metadata, create or edit child notes, or add or remove tags. For a type change, use operation "update_metadata" with change { "itemType": "journalArticle" }. Use read_paper_metadata to find supported types, fields and creator roles. Wait for the result before reporting changes.',
          inputSchema: writeInputSchema,
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
    itemID: item.id,
    itemKey: item.key,
    libraryID: item.libraryID,
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
  paper: PaperContext,
  args: z.infer<typeof pdfArgs>,
) {
  const { attachmentKey, attachmentID } = args;
  return paperAttachments(item).find((attachment) => {
    if (attachmentKey === undefined && attachmentID === undefined)
      return (
        attachment.id === paper.attachment?.itemID &&
        attachment.key === paper.attachment.itemKey
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
) {
  if (name === PROPOSE_ZOTERO_WRITE) {
    if (!writeAllowed()) return toolError("Zotero is in read-only mode.");
    const parsed = writeSchema.safeParse(input);
    if (!parsed.success)
      return toolError(
        `Invalid Zotero write proposal: ${z.prettifyError(parsed.error)}`,
      );
    const turn = active(parsed.data.turnId);
    if (!turn)
      return toolError(
        "The write proposal requires an active turn with a paper.",
      );
    try {
      const proposal = await prepareWrite(
        parsed.data,
        turn.paper,
        turn.tagItems,
      );
      if (!writeAllowed()) return toolError("Zotero is in read-only mode.");
      const result = await handoff(proposal, turn.signal);
      return toolResult({
        status: result?.status ?? "cancelled",
        outcomes:
          result?.outcomes.map(
            ({ target: { itemID, itemKey, libraryID }, ...outcome }) => ({
              ...outcome,
              target: { itemID, itemKey, libraryID },
            }),
          ) ?? [],
      });
    } catch (error) {
      return toolError(writeError(error));
    }
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
  if (turn?.tagItems?.length && material === "tags") {
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
  const paper = turn?.paper;
  const item = paper && currentItem(paper, args);
  if (!turn || !paper || !item)
    return toolError("The requested target is outside the active turn.");
  const identity = {
    itemID: item.id,
    itemKey: item.key,
    libraryID: item.libraryID,
  };

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
        attachment: paper.attachment ?? null,
        attachments: paperAttachments(item).map(describeAttachment),
      });
    }
    case "notes":
      return toolResult({
        ...identity,
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
      const attachment = currentAttachment(item, paper, args);
      if (!attachment)
        return toolError("No matching PDF belongs to the current paper.");
      const source = describeAttachment(attachment);
      if (material === "selection") {
        const selection = turn.readSelection?.();
        const matches =
          selection?.attachmentKey === attachment.key &&
          selection.libraryID === attachment.libraryID;
        return toolResult({
          ...source,
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
        const target = current?.paper && currentItem(current.paper, args);
        return (
          current?.signal === turn.signal &&
          !!target &&
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
