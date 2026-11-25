import { logError } from "../utils/log";
import {
  resolveItem,
  resolveNote,
  tagDeletionAllowed,
  type ApprovedChange,
  type ItemIdentity,
} from "./request";

type TagChange = { tag: string; before: number | null; after: number | null };
type Reversal =
  | { kind: "tags"; tags: TagChange[] }
  | { kind: "created-note"; noteKey: string; after: string }
  | { kind: "edited-note"; noteKey: string; before: string; after: string };

export interface HistoryEntry {
  id: string;
  target: ItemIdentity;
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
  change: ApprovedChange,
  track: TrackChanges,
): Promise<Reversal | undefined> {
  const parent = await resolveItem(change.target);
  switch (change.operation) {
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
      if (deleting && !tagDeletionAllowed())
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

export async function applyWithHistory(
  change: ApprovedChange,
  signal: AbortSignal,
): Promise<string | null | undefined> {
  await init();
  // Keep the Zotero mutation and its undo data in the same transaction.
  return transaction(async (track) => {
    if (signal.aborted) return null;
    const reversal = await apply(change, track);
    if (!reversal) return;
    const id = Zotero.Utilities.randomString(24);
    await Zotero.DB.queryAsync(
      `INSERT INTO ${table} (id, time, target, operation, reversal) VALUES (?, ?, ?, ?, ?)`,
      [
        id,
        Date.now(),
        JSON.stringify(change.target),
        change.operation,
        JSON.stringify(reversal),
      ],
    );
    return id;
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
    const parent = await resolveItem(JSON.parse(row.target) as ItemIdentity);
    const reversal = JSON.parse(row.reversal) as Reversal;
    if (reversal.kind === "tags") {
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
    await Zotero.DB.queryAsync(`UPDATE ${table} SET undone = 1 WHERE id = ?`, [
      id,
    ]);
  });
}
