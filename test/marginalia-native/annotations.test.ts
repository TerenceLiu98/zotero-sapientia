import { assert } from "chai";
import { config } from "../../package.json";
import {
  canEditAnnotation,
  captureAnnotationSource,
  captureStoredAnnotation,
  readAnnotationTarget,
  saveAnnotationComment,
} from "../../src/modules/marginalia/annotation";
import { UserError } from "../../src/utils/errors";
import { readerPdfViews } from "../../src/modules/marginalia/geometry";
import { mainWindow, makePaper, until } from "../helpers";

const samples = [
  {
    text: "The manually edited highlight",
    type: "highlight",
    comment:
      "Manual comment\n\u4eba\u5de5\u7f16\u8f91\uff0c\u4fdd\u7559\u6362\u884c",
  },
  {
    text: "The underline with an agent response",
    type: "underline",
    comment:
      "Agent: Underline response\n\u6279\u6ce8\u56de\u590d\u4fdd\u7559\u5728\u539f\u4f4d\u7f6e",
  },
  {
    text: "The shortcut selection passage",
    type: "highlight",
    comment: "Shortcut response\n\u9009\u533a\u7ffb\u8bd1",
  },
  {
    text: "The multi-turn conversation passage",
    type: "highlight",
    comment:
      "User: First question\n\nAgent: First answer\n\nUser: Second question\n\nAgent: \u7b2c\u4e8c\u8f6e\u56de\u590d",
  },
] as const;

async function rejectWithKey(fn: () => Promise<unknown>, key: string) {
  let actual: unknown;
  try {
    await fn();
  } catch (error) {
    actual = error;
  }
  assert.instanceOf(actual, UserError);
  assert.equal((actual as UserError).key, key);
}

const phase = Services.env.get("SAPIENTIA_TEST_MARGINALIA_PHASE");
const editedPDF = Services.env.get("SAPIENTIA_MARGINALIA_EDITED_PDF");
const checkpoint = () =>
  PathUtils.join(PathUtils.profileDir, "marginalia-restart.json");
const marginaliaPref = `${config.prefsPrefix}.marginalia`;

async function assertVisibleComment(
  attachment: Zotero.Item,
  annotation: Zotero.Item,
) {
  const enabled = Zotero.Prefs.get(marginaliaPref, true) === true;
  Zotero.Prefs.set(marginaliaPref, true, true);
  const host = mainWindow();
  await Zotero.Reader.open(attachment.id);
  const reader = Zotero.Reader.getByTabID(host.Zotero_Tabs.selectedID)!;
  try {
    await until(
      () =>
        readerPdfViews(reader)[0]?._iframeWindow?.PDFViewerApplication
          ?.pdfViewer?.pagesCount,
    );
    const view = readerPdfViews(reader)[0];
    await view.initializedPromise;
    for (let step = 0; step < 8; step++) view.zoomOut();
    const comment = () =>
      reader._iframeWindow?.document?.querySelector(
        `.sap-marginalia-card[data-annotation-key="${annotation.key}"]:not([hidden]) .sap-marginalia-comment`,
      );
    await until(() => comment()?.textContent === annotation.annotationComment);
  } finally {
    host.Zotero_Tabs.close(reader.tabID);
    Zotero.Prefs.set(marginaliaPref, enabled, true);
  }
}

describe("portable native annotations", function () {
  this.timeout(60000);

  if (phase === "after") {
    it("shows a saved native comment after restarting Zotero", async () => {
      const saved = (await IOUtils.readJSON(checkpoint())) as {
        pid: number;
        libraryID: number;
        attachmentKey: string;
      };
      assert.notEqual(Services.appinfo.processID, saved.pid);
      const attachment = await Zotero.Items.getByLibraryAndKeyAsync(
        saved.libraryID,
        saved.attachmentKey,
      );
      if (!attachment)
        throw new Error("The original attachment did not survive restart.");
      const first = attachment
        .getAnnotations()
        .find((annotation) => annotation.annotationPageLabel === "1");
      if (!first)
        throw new Error("The original annotation did not survive restart.");
      assert.equal(first.annotationComment, samples[0].comment);
      await assertVisibleComment(attachment, first);
    });
    return;
  }

  it("edits only the comment and exports native marks without rewriting the source PDF", async () => {
    const directory = await IOUtils.createUniqueDirectory(
      PathUtils.profileDir,
      "marginalia-export",
    );
    const attachment = await makePaper(directory, "Marginalia acceptance", "", {
      pages: samples.map(({ text }) => text),
    });
    const file = await attachment.getFilePathAsync();
    assert.isString(file);
    if (!file) throw new Error("The source PDF is missing.");
    const before = await IOUtils.read(file);

    for (const [pageIndex, sample] of samples.entries()) {
      const source = captureAnnotationSource(attachment, {
        text: sample.text,
        color: "#ffd400",
        pageLabel: String(pageIndex + 1),
        sortIndex: `${String(pageIndex).padStart(5, "0")}|000000|00072`,
        position: { pageIndex, rects: [[40, 717, 310, 732]] },
      } as _ZoteroTypes.Annotations.AnnotationJson)!;
      const annotation = await saveAnnotationComment(
        source,
        "Original comment",
      );
      annotation.annotationType = sample.type;
      await annotation.saveTx();
      const original = captureStoredAnnotation(annotation)!;
      const identity = [
        annotation.annotationType,
        annotation.annotationText,
        annotation.annotationColor,
        annotation.annotationPosition,
        annotation.annotationSortIndex,
      ];
      await saveAnnotationComment(original, sample.comment, original.comment);
      assert.deepEqual(
        [
          annotation.annotationType,
          annotation.annotationText,
          annotation.annotationColor,
          annotation.annotationPosition,
          annotation.annotationSortIndex,
        ],
        identity,
      );
      assert.equal(
        (await readAnnotationTarget(original)).comment,
        sample.comment,
      );
      await rejectWithKey(
        () => saveAnnotationComment(original, "Stale edit", original.comment),
        "marginalia-comment-changed",
      );
    }

    const output = PathUtils.join(directory, "marginalia-annotated.pdf");
    assert.equal(await Zotero.PDFWorker.export(attachment.id, output, true), 4);
    assert.deepEqual(await IOUtils.read(file), before);
    const imported = await Zotero.Attachments.importFromFile({ file: output });
    await Zotero.PDFWorker.import(imported.id, true);
    const external = imported
      .getAnnotations()
      .sort((a, b) =>
        a.annotationSortIndex.localeCompare(b.annotationSortIndex),
      );
    assert.lengthOf(external, samples.length);
    for (const [index, annotation] of external.entries()) {
      assert.isTrue(annotation.annotationIsExternal);
      assert.isFalse(canEditAnnotation(annotation));
      assert.equal(annotation.annotationComment, samples[index].comment);
      assert.equal(annotation.annotationType, samples[index].type);
      assert.include(annotation.annotationText, samples[index].text);
      const source = captureStoredAnnotation(annotation)!;
      assert.equal(source.pageIndex, index);
      assert.isFalse((await readAnnotationTarget(source)).editable);
      await rejectWithKey(
        () => saveAnnotationComment(source, "Blocked"),
        "marginalia-target-read-only",
      );
    }
    const target = Services.env.get("SAPIENTIA_MARGINALIA_ACCEPTANCE_DIR");
    if (target)
      await IOUtils.copy(
        output,
        PathUtils.join(target, "marginalia-annotated.pdf"),
      );
    if (phase === "before") {
      await IOUtils.writeJSON(
        checkpoint(),
        {
          pid: Services.appinfo.processID,
          libraryID: attachment.libraryID,
          attachmentKey: attachment.key,
        },
        { flush: true },
      );
    }
  });

  if (editedPDF)
    it("transfers the edited comments from a separate PDF copy into Zotero", async () => {
      const imported = await Zotero.Attachments.importFromFile({
        file: editedPDF,
      });
      await Zotero.PDFWorker.import(imported.id, true, undefined, true);
      const annotations = imported.getAnnotations();
      assert.lengthOf(annotations, samples.length);
      const edited = annotations.find((item) =>
        item.annotationComment.startsWith("Edited in an external reader"),
      );
      assert.exists(edited);
      assert.isFalse(edited!.annotationIsExternal);
      assert.isTrue(canEditAnnotation(edited!));
      const source = captureStoredAnnotation(edited!)!;
      assert.equal(source.pageIndex, 0);
      assert.include(source.text, samples[0].text);
      assert.equal(
        source.comment,
        "Edited in an external reader\n\u4ece\u5916\u90e8\u9605\u8bfb\u5668\u5bfc\u56de",
      );
      await assertVisibleComment(imported, edited!);
    });
});
