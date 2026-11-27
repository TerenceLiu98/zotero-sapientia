import { z } from "zod";
import { paperMetadata } from "./paper";

const turnId = z
  .string()
  .min(1)
  .describe("The turn ID supplied in the prompt.");
const pagination = {
  cursor: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Pass nextCursor from the previous page with the same filters."),
  limit: z.number().int().min(1).max(100).default(25),
};
const filter = z.string().trim().min(1).max(1024).optional();

export const librarySearchSchema = z.strictObject({
  turnId,
  ...pagination,
  title: filter,
  author: filter,
  doi: filter,
  year: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  tag: filter,
  collectionID: z.number().int().positive().optional(),
  collectionKey: filter,
});

export const libraryCollectionsSchema = z.strictObject({
  turnId,
  ...pagination,
  name: filter,
});

export function isPersonalPaper(
  item: Zotero.Item | false | undefined,
): item is Zotero.Item {
  return (
    !!item &&
    item.libraryID === Zotero.Libraries.userLibraryID &&
    !item.deleted &&
    !item.isFeedItem &&
    item.isRegularItem()
  );
}

export async function resolveLibraryPaper({
  itemID,
  itemKey,
  libraryID,
}: {
  itemID?: number;
  itemKey?: string;
  libraryID?: number;
}): Promise<Zotero.Item | undefined> {
  const personal = Zotero.Libraries.userLibraryID;
  if (libraryID !== undefined && libraryID !== personal) return;
  const item =
    itemID !== undefined
      ? await Zotero.Items.getAsync(itemID)
      : itemKey !== undefined &&
        (await Zotero.Items.getByLibraryAndKeyAsync(personal, itemKey));
  if (isPersonalPaper(item) && (itemKey === undefined || item.key === itemKey))
    return item;
}

export async function resolveLibraryCollection({
  collectionID,
  collectionKey,
  libraryID,
}: {
  collectionID?: number;
  collectionKey?: string;
  libraryID?: number;
}): Promise<Zotero.Collection | undefined> {
  const personal = Zotero.Libraries.userLibraryID;
  if (libraryID !== undefined && libraryID !== personal) return;
  const collection =
    collectionID !== undefined
      ? await Zotero.Collections.getAsync(collectionID)
      : collectionKey !== undefined &&
        (await Zotero.Collections.getByLibraryAndKeyAsync(
          personal,
          collectionKey,
        ));
  if (
    !collection ||
    (collectionKey !== undefined && collection.key !== collectionKey)
  )
    return;
  let current = collection;
  while (current.libraryID === personal && !current.deleted) {
    if (!current.parentID) return collection;
    const parent = await Zotero.Collections.getAsync(current.parentID);
    if (!parent) return;
    current = parent;
  }
}

export async function searchLibrary({
  title,
  author,
  doi,
  year,
  tag,
  collectionID,
  collectionKey,
  cursor = 0,
  limit,
}: z.infer<typeof librarySearchSchema>) {
  const search = new Zotero.Search({
    libraryID: Zotero.Libraries.userLibraryID,
  });
  search.addCondition("noChildren", "true");
  if (title !== undefined) search.addCondition("title", "contains", title);
  if (author !== undefined) search.addCondition("author", "contains", author);
  if (doi !== undefined)
    search.addCondition(
      "DOI",
      "is",
      doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ""),
    );
  if (year !== undefined) search.addCondition("year", "is", year);
  if (tag !== undefined) search.addCondition("tag", "is", tag);
  if (collectionID !== undefined || collectionKey !== undefined) {
    const collection = await resolveLibraryCollection({
      collectionID,
      collectionKey,
    });
    if (!collection)
      throw new Error(
        "The collection is outside the personal library or unavailable.",
      );
    search.addCondition("collection", "is", collection.key);
  }

  const ids = (await search.search())
    .filter((id) => id > cursor)
    .sort((a, b) => a - b);
  const results: Zotero.Item[] = [];
  // Zotero Search returns IDs. Load at most one batch past the requested page.
  const batchSize = limit + 1;
  for (
    let index = 0;
    index < ids.length && results.length <= limit;
    index += batchSize
  ) {
    const items = await Zotero.Items.getAsync(
      ids.slice(index, index + batchSize),
    );
    results.push(...items.filter(isPersonalPaper).sort((a, b) => a.id - b.id));
  }
  return {
    items: results.slice(0, limit).map((item) => ({
      ...paperMetadata(item),
      tags: item.getTags().map(({ tag }) => tag),
    })),
    nextCursor: results.length > limit ? results[limit - 1].id : null,
  };
}

export function listLibraryCollections({
  name,
  cursor = 0,
  limit,
}: z.infer<typeof libraryCollectionsSchema>) {
  const personal = Zotero.Libraries.userLibraryID;
  const query = name?.toLowerCase();
  const results = Zotero.Collections.getByLibrary(personal, true)
    .filter(
      (collection) =>
        collection.libraryID === personal &&
        !collection.deleted &&
        collection.id > cursor &&
        (query === undefined || collection.name.toLowerCase().includes(query)),
    )
    .sort((a, b) => a.id - b.id);
  return {
    collections: results.slice(0, limit).map((collection) => ({
      collectionID: collection.id,
      collectionKey: collection.key,
      name: collection.name,
      parentCollectionKey: collection.parentKey || null,
    })),
    nextCursor: results.length > limit ? results[limit - 1].id : null,
  };
}
