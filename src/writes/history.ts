import { logError } from "../utils/log";
import { metadataMatches, setMetadata, type MetadataChange } from "./metadata";
import {
  existingCollection,
  requireCollection,
  resolveItem,
  resolveNote,
  tagDeletionAllowed,
  writeAllowed,
  type ApprovedChange,
  type ItemIdentity,
  type WriteTarget,
} from "./request";

type TagChange = { tag: string; before: number | null; after: number | null };
type Reversal =
  | { kind: "tags"; tags: TagChange[] }
  | { kind: "metadata"; change: MetadataChange }
  | { kind: "collection-membership"; collectionKey: string; after: boolean }
  | {
      kind: "created-collection";
      collectionKey: string;
      name: string;
      parentCollectionKey?: string;
    }
  | { kind: "created-note"; noteKey: string; after: string }
  | { kind: "edited-note"; noteKey: string; before: string; after: string };

export interface HistoryEntry {
  id: string;
  target: WriteTarget;
  operation: ApprovedChange["operation"];
  time: number;
  undone: boolean;
}

const table = "sapientiaWriteHistory";
let initialized: Promise<unknown> | undefined;

function init() {
  initialized ??= Zotero.DB.queryAsync(
    `CREATE TABLE IF NOT EXISTS ${table} (
      id TEXT PRIMARY KEY,
      time INTEGER NOT NULL,
      target TEXT NOT NULL,
      operation TEXT NOT NULL,
      reversal TEXT NOT NULL,
      undone INTEGER NOT NULL DEFAULT 0
    )`,
  ).catch((error) => {
    initialized = undefined;
    throw error;
  });
  return initialized;
}

export async function listHistory(): Promise<HistoryEntry[]> {
  await init();
  const rows = await Zotero.DB.queryAsync(
    `SELECT id, time, target, operation, undone FROM ${table} ORDER BY time DESC, rowid DESC`,
  );
  return (rows ?? []).map((row) => ({
    id: row.id,
    target: JSON.parse(row.target),
    operation: row.operation,
    time: row.time,
    undone: !!row.undone,
  }));
}

function tagTypes(item: Zotero.Item) {
  return new Map(item.getTags().map(({ tag, type }) => [tag, type ?? 0]));
}

type TrackChanges = (item: Zotero.Item, ...fields: string[]) => void;

async function transaction<T>(run: (track: TrackChanges) => Promise<T>) {
  const affected = new Map<Zotero.Item, string[]>();
  try {
    return await Zotero.DB.executeTransaction(() =>
      run((item, ...fields) => affected.set(item, fields)),
    );
  } catch (error) {
    // A failed save may have changed the in-memory item before rollback.
    for (const [item, fields] of affected) {
      try {
        const dataTypes = fields.filter((field) => field !== "deleted");
        for (const field of fields) item._clearChanged(field);
        await item.reload(dataTypes, true);
      } catch (reloadError) {
        logError("Could not reload a rolled-back Zotero item", reloadError);
      }
    }
    throw error;
  }
}

async function apply(
  change: Exclude<
    ApprovedChange,
    { operation: "create_collection" | "report_metadata_unresolved" }
  >,
  track: TrackChanges,
  canDeleteTags: () => boolean,
): Promise<Reversal | undefined> {
  const parent = await resolveItem(change.target);
  switch (change.operation) {
    case "add_to_collection":
    case "remove_from_collection": {
      const { collection, before, after } = change.change;
      if (before === after) return;
      const target = await requireCollection(collection.key);
      if (target.name !== collection.title)
        throw new Error(
          "The collection changed since preview. Request a new proposal.",
        );
      if (parent.inCollection(target.id) === after) return;
      await setMembership(parent, target.id, after, track);
      return {
        kind: "collection-membership",
        collectionKey: collection.key,
        after,
      };
    }
    case "update_metadata": {
      const metadata = change.change;
      if (
        !metadata.newItemTypeID &&
        !metadata.fields.length &&
        !metadata.creators
      )
        return;
      if (!metadataMatches(parent, metadata, "before"))
        throw new Error(
          "The item metadata changed since preview. Request a new proposal.",
        );
      track(parent, "primaryData", "itemData", "creators");
      setMetadata(parent, metadata, "after");
      await parent.save();
      return { kind: "metadata", change: metadata };
    }
    case "create_note": {
      const note = new Zotero.Item("note");
      note.libraryID = parent.libraryID;
      note.parentID = parent.id;
      note.setNote(change.change.html);
      track(parent, "childItems");
      await note.save();
      return { kind: "created-note", noteKey: note.key, after: note.getNote() };
    }
    case "edit_note": {
      const note = await resolveNote(parent, change.change.noteKey);
      const before = note.getNote();
      if (before !== change.note?.previousHTML)
        throw new Error(
          "The note changed since preview. Request a new proposal.",
        );
      track(note, "note", "primaryData");
      track(parent, "childItems");
      if (!note.setNote(change.change.html)) return;
      await note.save();
      return {
        kind: "edited-note",
        noteKey: note.key,
        before,
        after: note.getNote(),
      };
    }
    case "delete_tags":
    case "add_tags": {
      const deleting = change.operation === "delete_tags";
      if (deleting && !canDeleteTags())
        throw new Error("Tag deletion is disabled in Zotero settings.");
      const current = tagTypes(parent);
      const tags: TagChange[] = [];
      track(parent, "tags", "primaryData");
      for (const tag of change.change.tags) {
        const before = current.get(tag) ?? null;
        if (deleting ? before === null : before !== null) continue;
        const after = deleting ? null : 0;
        if (deleting) parent.removeTag(tag);
        else parent.addTag(tag);
        tags.push({ tag, before, after });
      }
      if (!tags.length) return;
      await parent.save();
      return { kind: "tags", tags };
    }
  }
}

async function setMembership(
  item: Zotero.Item,
  collectionID: number,
  included: boolean,
  track: TrackChanges,
) {
  track(item, "collections", "primaryData");
  if (included) item.addToCollection(collectionID);
  else item.removeFromCollection(collectionID);
  await item.save();
}

export async function applyWithHistory(
  change: ApprovedChange,
  signal: AbortSignal,
  permissions?: {
    writeAllowed?: () => boolean;
    tagDeletionAllowed?: () => boolean;
  },
): Promise<{ target: WriteTarget; historyID?: string } | null> {
  await init();
  // Keep the Zotero mutation and its undo data in the same transaction.
  return transaction(async (track) => {
    if (signal.aborted) return null;
    if (!(permissions?.writeAllowed ?? writeAllowed)())
      throw new Error("Zotero is in read-only mode.");
    let target = change.target;
    let reversal: Reversal | undefined;
    if (change.operation === "create_collection") {
      const { name, parent: expectedParent, unchanged } = change.change;
      const parent = expectedParent
        ? await requireCollection(expectedParent.key)
        : undefined;
      if (expectedParent && parent?.name !== expectedParent.title)
        throw new Error(
          "The parent collection changed since preview. Request a new proposal.",
        );
      const existing = existingCollection(name, parent);
      if (existing)
        return { target: { ...target, collectionKey: existing.key } };
      if (unchanged)
        throw new Error(
          "The collection has changed since preview. Request a new proposal.",
        );
      const collection = new Zotero.Collection({
        name,
        libraryID: target.libraryID,
        parentID: parent?.id,
      });
      await collection.save();
      target = { ...change.target, collectionKey: collection.key };
      reversal = {
        kind: "created-collection",
        collectionKey: collection.key,
        name,
        parentCollectionKey: parent?.key,
      };
    } else if (change.operation !== "report_metadata_unresolved") {
      reversal = await apply(
        change,
        track,
        permissions?.tagDeletionAllowed ?? tagDeletionAllowed,
      );
    }
    if (!reversal) return { target };
    const id = Zotero.Utilities.randomString(24);
    await Zotero.DB.queryAsync(
      `INSERT INTO ${table} (id, time, target, operation, reversal) VALUES (?, ?, ?, ?, ?)`,
      [
        id,
        Date.now(),
        JSON.stringify(target),
        change.operation,
        JSON.stringify(reversal),
      ],
    );
    return { target, historyID: id };
  });
}

export async function undoWrite(id: string): Promise<void> {
  await init();
  await transaction(async (track) => {
    const [row] =
      (await Zotero.DB.queryAsync(
        `SELECT target, reversal FROM ${table} WHERE id = ? AND undone = 0`,
        [id],
      )) ?? [];
    if (!row) throw new Error("This change is no longer available to undo.");
    const reversal = JSON.parse(row.reversal) as Reversal;
    if (reversal.kind === "created-collection") {
      const collection = await requireCollection(reversal.collectionKey);
      if (
        collection.getChildItems(true, true).length ||
        collection.getChildCollections(true, true).length ||
        collection.name !== reversal.name ||
        (collection.parentKey || undefined) !== reversal.parentCollectionKey
      )
        throw new Error(
          "The collection has changed or gained contents. It cannot be undone.",
        );
      await collection.erase({ deleteItems: false });
    } else {
      const parent = await resolveItem(JSON.parse(row.target) as ItemIdentity);
      if (reversal.kind === "metadata") {
        if (!metadataMatches(parent, reversal.change, "after"))
          throw new Error("The item metadata has changed since approval.");
        track(parent, "primaryData", "itemData", "creators");
        setMetadata(parent, reversal.change, "before");
        await parent.save();
      } else if (reversal.kind === "tags") {
        const current = tagTypes(parent);
        if (
          reversal.tags.some(
            ({ tag, after }) => (current.get(tag) ?? null) !== after,
          )
        )
          throw new Error("These tags have changed since approval.");
        track(parent, "tags", "primaryData");
        for (const { tag, before } of reversal.tags) {
          if (before === null) parent.removeTag(tag);
          else parent.addTag(tag, before);
        }
        await parent.save();
      } else if (reversal.kind === "collection-membership") {
        const collection = await requireCollection(reversal.collectionKey);
        if (parent.inCollection(collection.id) !== reversal.after)
          throw new Error("Collection membership has changed since approval.");
        await setMembership(parent, collection.id, !reversal.after, track);
      } else {
        const note = await resolveNote(parent, reversal.noteKey);
        if (note.getNote() !== reversal.after)
          throw new Error("This note has changed since approval.");
        track(note, "note", "primaryData", "deleted");
        track(parent, "childItems");
        if (reversal.kind === "created-note") note.deleted = true;
        else note.setNote(reversal.before);
        await note.save();
      }
    }
    await Zotero.DB.queryAsync(`UPDATE ${table} SET undone = 1 WHERE id = ?`, [
      id,
    ]);
  });
}
