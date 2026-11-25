import { z } from "zod";
import {
  describeAttachment,
  paperAttachments,
  pdfURI,
  type PaperContext,
  type SelectedText,
} from "./paper";
import { readAllowed, type ReadMaterial } from "./read-scope";

export const READ_CURRENT_PAPER = "read_current_paper";
export const PROPOSE_ZOTERO_WRITE = "propose_zotero_write";

const target = {
  turnId: z.string().min(1).describe("The turn ID supplied in the prompt."),
  itemKey: z
    .string()
    .min(1)
    .optional()
    .describe("The current paper's item key."),
  itemID: z.number().int().positive().optional(),
  libraryID: z.number().int().positive().optional(),
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
const writeArgs = z.strictObject({
  ...target,
  operation: z.enum(["create_note", "edit_note", "add_tags"]),
  change: z.record(z.string(), z.unknown()),
});
type WriteRequest = z.infer<typeof writeArgs>;
export type WriteProposal = Pick<WriteRequest, "operation" | "change"> & {
  target: Pick<PaperContext, "itemID" | "itemKey" | "libraryID" | "title">;
};

export interface ToolTurn {
  paper: PaperContext;
  readSelection?: () => SelectedText | undefined;
  signal: AbortSignal;
}

export type ResolveTurn = (id: string) => ToolTurn | undefined;
export type WriteHandoff = (
  proposal: WriteProposal,
  signal: AbortSignal,
) => Promise<void>;

const readers = {
  read_paper_metadata: {
    material: "metadata",
    description:
      "Read the current Zotero paper's metadata and PDF attachments.",
    schema: z.strictObject(target),
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
    description: "Read the current paper's tags.",
    schema: z.strictObject(target),
  },
} satisfies Record<
  string,
  { material: ReadMaterial; description: string; schema: z.ZodType }
>;

export function listPaperTools() {
  return Object.entries(readers).map(([name, { description, schema }]) => ({
    name,
    description,
    inputSchema: z.toJSONSchema(schema, { target: "draft-7" }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }));
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

function currentItem(turn: ToolTurn, args: z.infer<typeof pdfArgs>) {
  const { paper } = turn;
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
  return toolResult({
    attachmentID: attachment.id,
    attachmentKey: attachment.key,
    url: uri,
    totalPages,
    extractedPages: pages.length,
    text: texts.join("\n\n"),
    pages,
  });
}

export async function callPaperTool(
  name: unknown,
  input: unknown,
  active: ResolveTurn,
  handoff: WriteHandoff,
) {
  if (name === PROPOSE_ZOTERO_WRITE) {
    const parsed = writeArgs.safeParse(input);
    if (!parsed.success) return toolError("Invalid Zotero write proposal.");
    const { turnId, operation, change } = parsed.data;
    const turn = active(turnId);
    const item = turn && currentItem(turn, parsed.data);
    if (!turn || !item)
      return toolError("The requested target is outside the active turn.");
    await handoff(
      {
        operation,
        change,
        target: {
          itemID: item.id,
          itemKey: item.key,
          libraryID: item.libraryID,
          title: item.getDisplayTitle(),
        },
      },
      turn.signal,
    );
    return toolResult({
      status: "cancelled",
      message: "Zotero writes are disabled in this release.",
    });
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
  if (!readAllowed(material))
    return toolError("This material is disabled in Zotero read settings.");
  const turn = active(args.turnId);
  const item = turn && currentItem(turn, args);
  if (!turn || !item)
    return toolError("The requested target is outside the active turn.");
  const { paper } = turn;
  const identity = {
    itemID: item.id,
    itemKey: item.key,
    libraryID: item.libraryID,
  };

  switch (material) {
    case "metadata":
      return toolResult({
        ...identity,
        title: paper.title,
        authors: paper.authors,
        abstract: paper.abstract || null,
        doi: paper.doi || null,
        year: paper.year || null,
        attachment: paper.attachment ?? null,
        attachments: paperAttachments(item).map(describeAttachment),
      });
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
      return toolResult({ ...identity, tags: item.getTags() });
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
        const target = current && currentItem(current, args);
        return (
          current?.signal === turn.signal &&
          readAllowed("pdf") &&
          !!target &&
          currentAttachment(target, paper, args)?.id === attachment.id
        );
      };
      try {
        const result = await readPdf(attachment, args, authorized);
        if (authorized()) return result;
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
