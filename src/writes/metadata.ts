import { z } from "zod";

const creatorType = z.string().min(1);
const creator = z.union([
  z.strictObject({ creatorType, name: z.string().trim().min(1) }),
  z
    .strictObject({
      creatorType,
      firstName: z.string().trim().optional(),
      lastName: z.string().trim(),
    })
    .refine(
      ({ firstName, lastName }) => firstName || lastName,
      "Supply a name.",
    ),
]);
const metadataFields = z
  .record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/i), z.string())
  .describe(
    "Zotero field names such as title, publicationTitle, date, DOI, or abstractNote. Use an empty string to clear a field.",
  );
const metadataCreators = z
  .array(creator)
  .describe(
    "Complete ordered list of Zotero creators. Read the existing list first and preserve entries you are not changing.",
  );
export const metadataItemType = z
  .string()
  .trim()
  .min(1)
  .describe(
    "Zotero bibliographic item type name, such as journalArticle or preprint. Other fields and creator roles are validated against this type when supplied.",
  );
export const metadataSchema = z
  .strictObject({
    itemType: metadataItemType.optional(),
    fields: metadataFields.optional(),
    creators: metadataCreators.optional(),
  })
  .refine(
    ({ fields, creators, itemType }) =>
      Object.keys(fields ?? {}).length > 0 ||
      creators !== undefined ||
      itemType !== undefined,
    "Supply itemType, fields, or creators.",
  );

type Creator = _ZoteroTypes.Item.CreatorJSON;
type FieldChange = {
  field: string;
  before: string;
  after: string;
  beforeDisplay: string;
  afterDisplay: string;
};

export interface MetadataChange {
  itemTypeID: number;
  newItemTypeID?: number;
  fields: FieldChange[];
  creators?: { before: Creator[]; after: Creator[] };
}

export function bibliographicItemTypes() {
  return Zotero.ItemTypes.getAll().filter(
    ({ name }) =>
      name !== "attachment" && name !== "note" && name !== "annotation",
  );
}

export function metadataFieldNames(itemTypeID: number): string[] {
  return Zotero.ItemFields.getItemTypeFields(itemTypeID).map((id: number) =>
    Zotero.ItemFields.getName(id),
  );
}

function sameCreators(a: Creator[], b: Creator[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function convertType(item: Zotero.Item, itemTypeID: number) {
  if (!Zotero.CreatorTypes.itemTypeHasCreators(itemTypeID))
    item.setCreators([]);
  item.setType(itemTypeID);
}

export function prepareMetadata(
  item: Zotero.Item,
  input: z.infer<typeof metadataSchema>,
): MetadataChange {
  const { itemTypeID } = item;
  const type =
    input.itemType === undefined
      ? undefined
      : bibliographicItemTypes().find(({ name }) => name === input.itemType);
  if (input.itemType !== undefined && !type)
    throw new Error(
      `'${input.itemType}' is not a Zotero bibliographic item type.`,
    );
  const targetTypeID = type?.id ?? itemTypeID;
  const changesType = targetTypeID !== itemTypeID;
  const draft = new Zotero.Item();
  draft.setType(itemTypeID);
  const originalCreators =
    input.creators || changesType ? item.getCreatorsJSON() : undefined;
  if (changesType) {
    for (const field of metadataFieldNames(itemTypeID))
      draft.setField(field, item.getField(field, true));
    draft.setCreators(originalCreators!);
    convertType(draft, targetTypeID);
  }
  const seen = new Set<string>();

  for (const [name, value] of Object.entries(input.fields ?? {})) {
    const id = Zotero.ItemFields.getID(name);
    const mapped =
      id &&
      (Zotero.ItemFields.getFieldIDFromTypeAndBase(targetTypeID, id) || id);
    if (!mapped || !Zotero.ItemFields.isValidForType(mapped, targetTypeID))
      throw new Error(
        `'${name}' is not a bibliographic field for this Zotero item type.`,
      );
    const field: string = Zotero.ItemFields.getName(mapped);
    if (seen.has(field))
      throw new Error(`'${field}' was specified more than once.`);
    seen.add(field);
    if (field === "accessDate" && value.trim() === "CURRENT_TIMESTAMP")
      throw new Error("Specify an explicit access date.");
    draft.setField(field, value);
    const after = draft.getField(field, true);
    if (!after && value.trim())
      throw new Error(`Invalid value for '${field}'.`);
  }

  if (input.creators)
    draft.setCreators(input.creators as Creator[], { strict: true });
  let creators: MetadataChange["creators"];
  if (originalCreators) {
    const after = draft.getCreatorsJSON();
    if (changesType || !sameCreators(originalCreators, after))
      creators = { before: originalCreators, after };
  }
  // Preserve all fields on a conversion, including empty values, so an
  // intervening edit cannot be overwritten or lost on approval or undo.
  const names = changesType
    ? new Set([
        ...metadataFieldNames(itemTypeID),
        ...metadataFieldNames(targetTypeID),
      ])
    : seen;
  const fields: FieldChange[] = [];
  for (const field of names) {
    const before = item.getField(field, true);
    const after = draft.getField(field, true);
    if (changesType || before !== after)
      fields.push({
        field,
        before,
        after,
        beforeDisplay: item.getField(field),
        afterDisplay: draft.getField(field),
      });
  }
  return {
    itemTypeID,
    newItemTypeID: changesType ? targetTypeID : undefined,
    fields,
    creators,
  };
}

export function metadataMatches(
  item: Zotero.Item,
  change: MetadataChange,
  side: "before" | "after",
) {
  return (
    item.itemTypeID ===
      (side === "after"
        ? (change.newItemTypeID ?? change.itemTypeID)
        : change.itemTypeID) &&
    change.fields.every(
      ({ field, [side]: value }) => item.getField(field, true) === value,
    ) &&
    (!change.creators ||
      sameCreators(item.getCreatorsJSON(), change.creators[side]))
  );
}

export function setMetadata(
  item: Zotero.Item,
  change: MetadataChange,
  side: "before" | "after",
) {
  if (change.newItemTypeID !== undefined)
    convertType(
      item,
      side === "before" ? change.itemTypeID : change.newItemTypeID,
    );
  const validFields = new Set(metadataFieldNames(item.itemTypeID));
  for (const { field, [side]: value } of change.fields) {
    if (validFields.has(field)) item.setField(field, value);
  }
  if (change.creators)
    item.setCreators(change.creators[side], { strict: true });
}
