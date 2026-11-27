import { z } from "zod";
import { UserError } from "../../utils/errors";

const rect = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const positionSchema = z.object({
  pageIndex: z.number().int().nonnegative(),
  rects: z.array(rect).min(1),
  nextPageRects: z.array(rect).optional(),
});

export interface AnnotationSource {
  attachmentKey: string;
  libraryID: number;
  itemTitle: string;
  text: string;
  pageLabel: string;
  pageIndex: number;
  position: z.infer<typeof positionSchema>;
  color: string;
  sortIndex: string;
  annotationKey?: string;
  comment: string;
}

export function captureAnnotationSource(
  attachment: Zotero.Item,
  annotation: _ZoteroTypes.Annotations.AnnotationJson,
): AnnotationSource | undefined {
  if (!attachment.isPDFAttachment() || !annotation.text?.trim()) return;
  const parsed = positionSchema.safeParse(annotation.position);
  if (!parsed.success) return;
  const position = parsed.data;
  return {
    attachmentKey: attachment.key,
    libraryID: attachment.libraryID,
    itemTitle: (attachment.parentItem || attachment).getDisplayTitle(),
    text: annotation.text,
    pageLabel: annotation.pageLabel || String(position.pageIndex + 1),
    pageIndex: position.pageIndex,
    position,
    color: /^#[\da-f]{6}$/i.test(annotation.color)
      ? annotation.color
      : Zotero.Annotations.DEFAULT_COLOR,
    sortIndex:
      annotation.sortIndex ||
      `${String(position.pageIndex).padStart(5, "0")}|000000|00000`,
    comment: "",
  };
}

export function captureStoredAnnotation(
  annotation: Zotero.Item,
): AnnotationSource | undefined {
  const attachment = annotation.parentItem;
  if (!attachment || !isTextAnnotation(annotation)) return;
  let position: unknown;
  try {
    position = JSON.parse(annotation.annotationPosition);
  } catch {
    return;
  }
  const source = captureAnnotationSource(attachment, {
    text: annotation.annotationText,
    pageLabel: annotation.annotationPageLabel,
    color: annotation.annotationColor,
    sortIndex: annotation.annotationSortIndex,
    position,
  } as _ZoteroTypes.Annotations.AnnotationJson);
  if (source) {
    source.annotationKey = annotation.key;
    source.comment = annotation.annotationComment || "";
  }
  return source;
}

function isTextAnnotation(annotation: Zotero.Item) {
  return (
    annotation.isAnnotation() &&
    (annotation.annotationType === "highlight" ||
      annotation.annotationType === "underline")
  );
}

function available(attachment: Zotero.Item) {
  return (
    attachment.isPDFAttachment() &&
    !attachment.deleted &&
    !attachment.parentItem?.deleted
  );
}

export function canEditAnnotation(annotation: Zotero.Item): boolean {
  const attachment = annotation.parentItem;
  return Boolean(
    attachment &&
    available(attachment) &&
    attachment.isEditable() &&
    isTextAnnotation(annotation) &&
    !annotation.deleted &&
    !annotation.annotationIsExternal &&
    annotation.isEditable(),
  );
}

async function resolveTarget(source: AnnotationSource) {
  const attachment = await Zotero.Items.getByLibraryAndKeyAsync(
    source.libraryID,
    source.attachmentKey,
  );
  if (!attachment || !available(attachment))
    throw new UserError("marginalia-target-unavailable");
  const annotation = source.annotationKey
    ? await Zotero.Items.getByLibraryAndKeyAsync(
        source.libraryID,
        source.annotationKey,
      )
    : undefined;
  if (
    source.annotationKey &&
    (!annotation ||
      annotation.deleted ||
      annotation.parentID !== attachment.id ||
      !isTextAnnotation(annotation))
  )
    throw new UserError("marginalia-target-unavailable");
  return { attachment, annotation: annotation || undefined };
}

export async function readAnnotationTarget(source: AnnotationSource) {
  const { attachment, annotation } = await resolveTarget(source);
  return {
    comment: annotation?.annotationComment || "",
    editable: annotation
      ? canEditAnnotation(annotation)
      : attachment.isEditable(),
  };
}

export async function saveAnnotationComment(
  source: AnnotationSource,
  comment: string,
  previousComment?: string,
): Promise<Zotero.Item> {
  let changed: Zotero.Item | undefined;
  try {
    return await Zotero.DB.executeTransaction(async () => {
      const { attachment, annotation } = await resolveTarget(source);
      if (annotation) {
        if (!canEditAnnotation(annotation))
          throw new UserError("marginalia-target-read-only");
        const before = annotation.annotationComment || "";
        if (previousComment !== undefined && previousComment !== before)
          throw new UserError("marginalia-comment-changed");
        if (before === comment) return annotation;
        changed = annotation;
        annotation.annotationComment = comment;
        await annotation.save({ skipSelect: true });
        return annotation;
      }
      if (!attachment.isEditable())
        throw new UserError("marginalia-target-read-only");
      const highlight = new Zotero.Item("annotation");
      highlight.libraryID = attachment.libraryID;
      highlight.parentID = attachment.id;
      highlight.annotationType = "highlight";
      highlight.annotationText = source.text;
      highlight.annotationComment = comment;
      highlight.annotationColor = source.color;
      highlight.annotationPageLabel = source.pageLabel;
      highlight.annotationSortIndex = source.sortIndex;
      highlight.annotationPosition = JSON.stringify(source.position);
      await highlight.save({ skipSelect: true });
      return highlight;
    });
  } catch (error) {
    if (changed) await changed.reload(["annotationDeferred"], true);
    throw error;
  }
}
