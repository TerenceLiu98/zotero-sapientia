import { z } from "zod";
import { config } from "../../package.json";
import type { PaperContext } from "../context/paper";

export const PROPOSE_ZOTERO_WRITE = "propose_zotero_write";
const deletePref = `${config.prefsPrefix}.allowTagDeletion`;

export function tagDeletionAllowed(): boolean {
  return Zotero.Prefs.get(deletePref, true) === true;
}

export function setTagDeletionAllowed(allowed: boolean): void {
  Zotero.Prefs.set(deletePref, allowed, true);
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
const tags = z.array(z.string().trim().normalize().min(1)).min(1).max(100);
const operationShapes = [
  { operation: z.literal("create_note"), change: z.strictObject({ html }) },
  {
    operation: z.literal("edit_note"),
    change: z.strictObject({ noteKey: z.string().min(1), html }),
  },
  { operation: z.literal("add_tags"), change: z.strictObject({ tags }) },
  { operation: z.literal("delete_tags"), change: z.strictObject({ tags }) },
] as const;
const operationSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...itemIdentifier, ...operationShapes[0] }),
  z.strictObject({ ...itemIdentifier, ...operationShapes[1] }),
  z.strictObject({ ...itemIdentifier, ...operationShapes[2] }),
  z.strictObject({ ...itemIdentifier, ...operationShapes[3] }),
]);
const operations = z
  .array(operationSchema)
  .min(1)
  .max(50)
  .describe(
    "Ordered batch. Identify non-current items by key or ID in the current library.",
  );
const batch = z.strictObject({ turnId, operations });

export const writeSchema = z.union([
  batch,
  z.strictObject({ turnId, ...itemIdentifier, ...operationShapes[0] }),
  z.strictObject({ turnId, ...itemIdentifier, ...operationShapes[1] }),
  z.strictObject({ turnId, ...itemIdentifier, ...operationShapes[2] }),
  z.strictObject({ turnId, ...itemIdentifier, ...operationShapes[3] }),
]);

// Some MCP clients accept only a root object schema for tool arguments.
export const writeInputSchema = z.toJSONSchema(
  z.strictObject({
    turnId,
    operations: operations.optional(),
    ...itemIdentifier,
    operation: z
      .enum(["create_note", "edit_note", "add_tags", "delete_tags"])
      .optional()
      .describe(
        "For one change, supply operation and change instead of operations.",
      ),
    change: z
      .strictObject({
        html: html.optional(),
        noteKey: z.string().min(1).optional(),
        tags: tags.optional(),
      })
      .optional()
      .describe(
        "Use html for create_note, noteKey and html for edit_note, or tags for add_tags and delete_tags.",
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
export type ApprovedChange = Change<Operation> & {
  target: ItemIdentity;
  note?: { title: string; previousHTML: string };
};

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

export function itemIdentity(item: Zotero.Item): ItemIdentity {
  return {
    itemID: item.id,
    itemKey: item.key,
    libraryID: item.libraryID,
    title: item.getDisplayTitle(),
  };
}

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

function sanitizeNote(src: string): string {
  const classes = Components.classes as unknown as Record<
    string,
    { getService<T>(iid: nsJSIID<T>): T }
  >;
  const parser = classes["@mozilla.org/parserutils;1"].getService(
    Components.interfaces.nsIParserUtils,
  );
  const doc =
    Zotero.getMainWindow().document.implementation.createHTMLDocument();
  const body = doc.body!;
  body.append(
    parser.parseFragment(
      src,
      parser.SanitizerDropForms! | parser.SanitizerDropMedia!,
      false,
      Services.io.newURI("about:blank"),
      body,
    ),
  );
  const html = String(body.innerHTML).trim();
  if (!html) throw new Error("The proposed note has no supported content.");
  return html;
}

export async function prepareWrite(
  request: z.infer<typeof writeSchema>,
  paper: PaperContext,
): Promise<WriteProposal> {
  const current = await resolveItem(paper);
  const operations: ApprovedChange[] = [];
  for (const operation of "operations" in request
    ? request.operations
    : [request]) {
    const { itemKey, itemID, libraryID } = operation;
    if ((libraryID ?? current.libraryID) !== current.libraryID)
      throw new Error(
        "Write targets must belong to the current paper's library.",
      );
    const item =
      itemID !== undefined
        ? await Zotero.Items.getAsync(itemID)
        : itemKey !== undefined
          ? await Zotero.Items.getByLibraryAndKeyAsync(
              current.libraryID,
              itemKey,
            )
          : current;
    if (
      !item ||
      item.deleted ||
      item.isFeedItem ||
      item.libraryID !== current.libraryID ||
      (itemKey !== undefined && item.key !== itemKey) ||
      !item.isEditable() ||
      !item.isRegularItem()
    )
      throw new Error(
        "A write target is not an editable paper in the current library.",
      );
    const target = itemIdentity(item);
    switch (operation.operation) {
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
        if (!tagDeletionAllowed())
          throw new Error("Tag deletion is disabled in Zotero settings.");
      // Fall through to normalize tag names as Zotero does.
      case "add_tags":
        operations.push({
          target,
          operation: operation.operation,
          change: { tags: [...new Set(operation.change.tags)] },
        });
    }
  }
  return { operations };
}
