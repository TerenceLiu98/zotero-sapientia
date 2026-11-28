import { logError } from "../utils/log";
import { metadataMatches, setMetadata } from "./metadata";
import {
  existingCollection,
  requireCollection,
  resolveItem,
  resolveNote,
  tagDeletionAllowed,
  writeAllowed,
  type ApprovedChange,
  type WriteTarget,
} from "./request";

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
        for (const field of fields) item._clearChanged(field);
        await item.reload(fields, true);
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
): Promise<boolean> {
  const parent = await resolveItem(change.target);
  switch (change.operation) {
    case "add_to_collection":
    case "remove_from_collection": {
      const { collection, before, after } = change.change;
      if (before === after) return false;
      const target = await requireCollection(collection.key);
      if (target.name !== collection.title)
        throw new Error(
          "The collection changed since preview. Request a new proposal.",
        );
      if (parent.inCollection(target.id) === after) return false;
      track(parent, "collections", "primaryData");
      if (after) parent.addToCollection(target.id);
      else parent.removeFromCollection(target.id);
      await parent.save();
      return true;
    }
    case "update_metadata": {
      const metadata = change.change;
      if (
        !metadata.newItemTypeID &&
        !metadata.fields.length &&
        !metadata.creators
      )
        return false;
      if (!metadataMatches(parent, metadata))
        throw new Error(
          "The item metadata changed since preview. Request a new proposal.",
        );
      track(parent, "primaryData", "itemData", "creators");
      setMetadata(parent, metadata);
      await parent.save();
      return true;
    }
    case "create_note": {
      const note = new Zotero.Item("note");
      note.libraryID = parent.libraryID;
      note.parentID = parent.id;
      note.setNote(change.change.html);
      track(parent, "childItems");
      await note.save();
      return true;
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
      if (!note.setNote(change.change.html)) return false;
      await note.save();
      return true;
    }
    case "delete_tags":
    case "add_tags": {
      const deleting = change.operation === "delete_tags";
      if (deleting && !canDeleteTags())
        throw new Error("Tag deletion is disabled in Zotero settings.");
      const current = new Set(parent.getTags().map(({ tag }) => tag));
      const tags = change.change.tags.filter(
        (tag) => current.has(tag) === deleting,
      );
      if (!tags.length) return false;
      track(parent, "tags", "primaryData");
      for (const tag of tags) {
        if (deleting) parent.removeTag(tag);
        else parent.addTag(tag);
      }
      await parent.save();
      return true;
    }
  }
}

export async function applyWrite(
  change: Exclude<ApprovedChange, { operation: "report_metadata_unresolved" }>,
  signal: AbortSignal,
  permissions?: {
    writeAllowed?: () => boolean;
    tagDeletionAllowed?: () => boolean;
  },
): Promise<{ target: WriteTarget; status: "applied" | "unchanged" } | null> {
  return transaction(async (track) => {
    if (signal.aborted) return null;
    if (!(permissions?.writeAllowed ?? writeAllowed)())
      throw new Error("Zotero is in read-only mode.");
    const { target } = change;
    if (change.operation !== "create_collection") {
      const changed = await apply(
        change,
        track,
        permissions?.tagDeletionAllowed ?? tagDeletionAllowed,
      );
      return { target, status: changed ? "applied" : "unchanged" };
    }
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
      return {
        target: { ...target, collectionKey: existing.key },
        status: "unchanged",
      };
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
    return {
      target: { ...target, collectionKey: collection.key },
      status: "applied",
    };
  });
}
