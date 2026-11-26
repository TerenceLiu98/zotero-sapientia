import { z } from "zod";
import { config } from "../../package.json";
import {
  findTagItem,
  paperIdentity,
  type PaperContext,
  type TagItem,
} from "../context/paper";
import {
  metadataSchema,
  prepareMetadata,
  type MetadataChange,
} from "./metadata";

export const PROPOSE_ZOTERO_WRITE = "propose_zotero_write";
export const TAG_DELETION_PREF = `${config.prefsPrefix}.allowTagDeletion`;
export const READ_ONLY_PREF = `${config.prefsPrefix}.readOnly`;

export function writeAllowed(): boolean {
  return Zotero.Prefs.get(READ_ONLY_PREF, true) !== true;
}

export function setWriteAllowed(allowed: boolean): void {
  Zotero.Prefs.set(READ_ONLY_PREF, !allowed, true);
}

export function tagDeletionAllowed(): boolean {
  return Zotero.Prefs.get(TAG_DELETION_PREF, true) === true;
}

export function setTagDeletionAllowed(allowed: boolean): void {
  Zotero.Prefs.set(TAG_DELETION_PREF, allowed, true);
}

export const itemIdentifier = {
  itemKey: z.string().min(1).optional(),
  itemID: z.number().int().positive().optional(),
  libraryID: z.number().int().positive().optional(),
};
const turnId = z
  .string()
  .min(1)
  .describe("The turn ID supplied in the prompt.");
const html = z.string().min(1);
const noteKey = z.string().min(1);
const tags = z.array(z.string().trim().normalize().min(1)).min(1).max(100);
const operationSchemas = [
  z.strictObject({
    ...itemIdentifier,
    operation: z.literal("create_note"),
    change: z.strictObject({ html }),
  }),
  z.strictObject({
    ...itemIdentifier,
    operation: z.literal("edit_note"),
    change: z.strictObject({ noteKey, html }),
  }),
  z.strictObject({
    ...itemIdentifier,
    operation: z.literal("add_tags"),
    change: z.strictObject({ tags }),
  }),
  z.strictObject({
    ...itemIdentifier,
    operation: z.literal("delete_tags"),
    change: z.strictObject({ tags }),
  }),
  z.strictObject({
    ...itemIdentifier,
    operation: z.literal("update_metadata"),
    change: metadataSchema,
  }),
] as const;
const operationSchema = z.discriminatedUnion("operation", operationSchemas);
const operations = z
  .array(operationSchema)
  .min(1)
  .max(50)
  .describe(
    "Ordered batch. Identify non-current items by key or ID in the current library. When tagging a multi-selection, identify each selected item explicitly.",
  );
export const writeSchema = z.union([
  z.strictObject({ turnId, operations }),
  ...operationSchemas.map((schema) => schema.extend({ turnId })),
]);

// Some MCP clients accept only a root object schema for tool arguments.
export const writeInputSchema = z.toJSONSchema(
  z.strictObject({
    turnId,
    operations: operations.optional(),
    ...itemIdentifier,
    operation: z
      .enum(operationSchemas.map(({ shape }) => shape.operation.value))
      .optional()
      .describe(
        "For one change, supply operation and change instead of operations.",
      ),
    change: z
      .strictObject({
        html: html.optional(),
        noteKey: noteKey.optional(),
        tags: tags.optional(),
        ...metadataSchema.shape,
      })
      .optional()
      .describe(
        "Use html for create_note, noteKey and html for edit_note, tags for add_tags and delete_tags, or itemType, fields, and/or creators for update_metadata.",
      ),
  }),
  { target: "draft-7", io: "input" },
);

export type ItemIdentity = Pick<
  PaperContext,
  "itemID" | "itemKey" | "libraryID" | "title"
>;
type Operation = z.infer<typeof operationSchema>;
type Change<T> = T extends Operation ? Pick<T, "operation" | "change"> : never;
export type ApprovedChange = (
  | (Change<Exclude<Operation, { operation: "update_metadata" }>> & {
      note?: { title: string; previousHTML: string };
    })
  | { operation: "update_metadata"; change: MetadataChange; note?: never }
) & { target: ItemIdentity };

export interface WriteProposal {
  operations: readonly ApprovedChange[];
}

export type WriteOutcome = {
  status: "applied" | "unchanged" | "failed" | "cancelled";
  target: ItemIdentity;
  operation: Operation["operation"];
  error?: string;
  historyID?: string;
};
export type WriteResult = {
  status: "completed" | "cancelled" | "busy";
  outcomes: WriteOutcome[];
};
export type WriteHandoff = (
  proposal: WriteProposal,
  signal: AbortSignal,
) => Promise<WriteResult | void>;

export async function resolveItem(target: ItemIdentity): Promise<Zotero.Item> {
  const item = await Zotero.Items.getAsync(target.itemID);
  if (
    !item ||
    item.deleted ||
    item.key !== target.itemKey ||
    item.libraryID !== target.libraryID ||
    !item.isEditable()
  )
    throw new Error("The target is no longer available for editing.");
  return item;
}

export async function resolveNote(
  parent: Zotero.Item,
  key: string,
): Promise<Zotero.Item> {
  const note = await Zotero.Items.getByLibraryAndKeyAsync(
    parent.libraryID,
    key,
  );
  if (
    !note ||
    !note.isNote() ||
    note.deleted ||
    note.parentID !== parent.id ||
    !note.isEditable()
  )
    throw new Error("The target note is no longer available for editing.");
  return note;
}

export function parseNoteHTML(
  src: string,
  container: HTMLElement,
): DocumentFragment {
  const classes = Components.classes as unknown as Record<
    string,
    { getService<T>(iid: nsJSIID<T>): T }
  >;
  const parser = classes["@mozilla.org/parserutils;1"].getService(
    Components.interfaces.nsIParserUtils,
  );
  return parser.parseFragment(
    src,
    parser.SanitizerDropForms! | parser.SanitizerDropMedia!,
    false,
    Services.io.newURI("about:blank"),
    container,
  );
}

function sanitizeNote(src: string): string {
  const doc =
    Zotero.getMainWindow().document.implementation.createHTMLDocument();
  const body = doc.body!;
  body.append(parseNoteHTML(src, body));
  const html = String(body.innerHTML).trim();
  if (!html) throw new Error("The proposed note has no supported content.");
  return html;
}

export async function prepareWrite(
  request: z.infer<typeof writeSchema>,
  paper?: PaperContext,
  tagItems?: readonly TagItem[],
): Promise<WriteProposal> {
  const current = paper && (await resolveItem(paper));
  if (!current && !tagItems?.length)
    throw new Error("The write proposal requires paper context.");
  const operations: ApprovedChange[] = [];
  const previewTags = new Map<number, Set<string>>();
  for (const operation of "operations" in request
    ? request.operations
    : [request]) {
    const { itemKey, itemID, libraryID } = operation;
    let item: Zotero.Item | false | undefined;
    if (tagItems?.length) {
      if (
        operation.operation !== "add_tags" &&
        operation.operation !== "delete_tags"
      )
        throw new Error("A multi-item selection supports tag changes only.");
      const selected = findTagItem(tagItems, operation);
      if (!selected)
        throw new Error("Tag changes must identify a selected Zotero item.");
      item = await resolveItem(selected);
    } else if (current) {
      if ((libraryID ?? current.libraryID) !== current.libraryID)
        throw new Error(
          "Write targets must belong to the current paper's library.",
        );
      item =
        itemID !== undefined
          ? await Zotero.Items.getAsync(itemID)
          : itemKey !== undefined
            ? await Zotero.Items.getByLibraryAndKeyAsync(
                current.libraryID,
                itemKey,
              )
            : current;
    }
    if (
      !item ||
      item.deleted ||
      item.isFeedItem ||
      (!tagItems?.length && item.libraryID !== current?.libraryID) ||
      (itemKey !== undefined && item.key !== itemKey) ||
      !item.isEditable() ||
      !item.isRegularItem()
    )
      throw new Error(
        "A write target is not an editable paper in the current library.",
      );
    const target = { ...paperIdentity(item), title: item.getDisplayTitle() };
    switch (operation.operation) {
      case "update_metadata":
        operations.push({
          target,
          operation: operation.operation,
          change: prepareMetadata(item, operation.change),
        });
        break;
      case "create_note":
        operations.push({
          target,
          operation: operation.operation,
          change: { html: sanitizeNote(operation.change.html) },
        });
        break;
      case "edit_note": {
        const { noteKey, html } = operation.change;
        const note = await resolveNote(item, noteKey);
        operations.push({
          target,
          operation: operation.operation,
          change: { noteKey, html: sanitizeNote(html) },
          note: { title: note.getNoteTitle(), previousHTML: note.getNote() },
        });
        break;
      }
      case "delete_tags":
      case "add_tags": {
        const deleting = operation.operation === "delete_tags";
        if (deleting && !tagDeletionAllowed())
          throw new Error("Tag deletion is disabled in Zotero settings.");
        let proposed = previewTags.get(item.id);
        if (!proposed) {
          proposed = new Set(item.getTags().map(({ tag }) => tag));
          previewTags.set(item.id, proposed);
        }
        const tags: string[] = [];
        for (const tag of operation.change.tags) {
          if (deleting ? !proposed.delete(tag) : proposed.has(tag)) continue;
          if (!deleting) proposed.add(tag);
          tags.push(tag);
        }
        operations.push({
          target,
          operation: operation.operation,
          change: { tags },
        });
      }
    }
  }
  return { operations };
}
