import { assert } from "chai";
import { config } from "../../package.json";
import {
  pdfViewBounds,
  projectPdfMark,
  readerPdfViews,
} from "../../src/modules/marginalia/geometry";
import { mainWindow, makePaper, until } from "../helpers";

async function waitFor(label: string, condition: () => unknown): Promise<void> {
  try {
    await until(condition, { timeout: 8000 });
  } catch (cause) {
    throw new Error(`Timed out waiting for ${label}`, { cause });
  }
}

describe("Reader marginals", function () {
  this.timeout(60000);

  it("anchors comments during Reader changes and syncs native edits both ways", async () => {
    const wasStoring = Zotero.Debug.storing;
    Zotero.Debug.setStore(true);
    const pref = `${config.prefsPrefix}.marginalia`;
    const initial = Zotero.Prefs.get(pref, true);
    assert.isFalse(initial);
    const directory = await IOUtils.createUniqueDirectory(
      PathUtils.profileDir,
      "marginals",
    );
    const pdf = await makePaper(directory, "Marginal notes", "margin-notes");
    const position = {
      pageIndex: 0,
      rects: [[40, 715, 138, 732]],
    };
    const native = async (
      type: "highlight" | "underline",
      offset: number,
      comment?: string,
    ) => {
      const item = new Zotero.Item("annotation");
      item.libraryID = pdf.libraryID;
      item.parentID = pdf.id;
      item.annotationType = type;
      item.annotationText = "margin-notes";
      if (comment !== undefined) item.annotationComment = comment;
      if (type === "highlight" && offset === 0 && comment)
        item.addTag("Background");
      item.annotationColor = "#ffd400";
      item.annotationPageLabel = "1";
      item.annotationSortIndex = `00000|${String(offset).padStart(6, "0")}|00000`;
      item.annotationPosition = JSON.stringify({
        pageIndex: 0,
        rects: [[40, 715 - offset, 138, 732 - offset]],
      });
      await item.saveTx();
      return item;
    };
    const withoutComment = await native("highlight", 0);
    const highlight = await native(
      "highlight",
      0,
      "Native highlight comment 0",
    );
    const underline = await native(
      "underline",
      4,
      "Native underline comment 4",
    );
    await native("highlight", 8, "Native highlight comment 8");
    const host = mainWindow();
    await Zotero.Reader.open(pdf.id);
    const reader = Zotero.Reader.getByTabID(host.Zotero_Tabs.selectedID)!;
    try {
      const doc = () => reader._iframeWindow?.document;
      const toggle = () =>
        doc()?.querySelector<HTMLButtonElement>(".sap-marginalia-toggle");
      const card = () =>
        doc()?.querySelector<HTMLElement>(
          `.sap-marginalia-card[data-annotation-key="${highlight.key}"]:not([hidden])`,
        );
      const comment = () => card()?.querySelector(".sap-marginalia-comment");
      const markers = () =>
        Array.from<HTMLButtonElement>(
          doc()?.querySelectorAll<HTMLButtonElement>(
            ".sap-marginalia-marker:not([hidden])",
          ) ?? [],
        );
      await waitFor("the native PDF Reader toolbar", () =>
        doc()?.querySelector(".toolbar"),
      );
      assert.isNotFalse(toggle()?.hidden);
      Zotero.Prefs.set(pref, true, true);
      await waitFor(
        "the enabled Reader toggle",
        () => toggle()?.getAttribute("aria-pressed") === "true",
      );
      await waitFor(
        "the PDF.js page view",
        () =>
          readerPdfViews(reader)[0]?._iframeWindow?.PDFViewerApplication
            ?.pdfViewer?.pagesCount,
      );
      const view = readerPdfViews(reader)[0];
      const app = view._iframeWindow!.PDFViewerApplication;
      const viewer = app.pdfViewer!;
      await view.initializedPromise;
      view.zoomPageWidth();
      await waitFor("a wide viewport annotation card", card);
      assert.notExists(
        doc()?.querySelector(`[data-annotation-key="${withoutComment.key}"]`),
      );
      assert.isBelow(
        viewer.container.getBoundingClientRect().width,
        view._iframe.getBoundingClientRect().width - 160,
        "page-width mode leaves room for annotations",
      );
      assert.equal(
        view._iframeWindow!.getComputedStyle(viewer.container)?.scrollbarWidth,
        "none",
      );
      await waitFor("a colored connector", () =>
        doc()?.querySelector(".sap-marginalia-connectors path[d]"),
      );
      const wide = projectPdfMark(view, position)!;
      assert.exists(wide, "the wide viewport projection");
      const start = card()!.getBoundingClientRect();
      assert.isTrue(
        start.left >= wide.pageRight || start.right <= wide.pageLeft,
      );
      assert.include(card()!.textContent, "Page 1");
      assert.include(card()!.textContent, "margin-notes");
      assert.include(card()!.textContent, "Native highlight comment 0");
      assert.equal(
        card()!.querySelector(".sap-marginalia-tags")?.textContent,
        "Background",
      );
      const button = (label: string) =>
        card()!.querySelector<HTMLButtonElement>(
          `button[aria-label="${label}"]`,
        )!;
      button("Expand comment").click();
      assert.equal(card()!.dataset.expanded, "true");
      button("Close comment").click();
      assert.equal(card()!.dataset.expanded, "false");
      assert.exists(
        doc()?.querySelector(
          `[data-annotation-key="${underline.key}"]:not([hidden])`,
        ),
        "the nearby underline's card or marker",
      );
      const overlay = doc()!.querySelector(".sap-marginalia-layer")!;
      const unrelated = doc()!.createElement("span");
      doc()!.body!.append(unrelated);
      unrelated.remove();
      await Zotero.Promise.delay(100);
      assert.isTrue(
        doc()!.querySelector(".sap-marginalia-layer") === overlay,
        "unrelated Reader updates leave the existing overlay mounted",
      );
      Zotero.Prefs.set(pref, false, true);
      assert.notExists(doc()?.querySelector(".sap-marginalia-layer"));
      Zotero.Prefs.set(pref, true, true);
      await waitFor("the comment after enabling Marginalia again", card);
      assert.lengthOf(doc()!.querySelectorAll(".sap-marginalia-layer"), 1);

      highlight.annotationComment = "Changed through Zotero";
      await highlight.saveTx();
      await waitFor(
        "the native edit appearing beside the page",
        () => comment()?.textContent === "Changed through Zotero",
      );
      button("Comment actions").click();
      const editMenu = card()!.querySelector(".sap-marginalia-options")!;
      assert.isFalse(editMenu.hasAttribute("hidden"));
      assert.equal(editMenu.textContent, "EditAsk");
      editMenu.querySelector<HTMLButtonElement>("button")!.click();
      const editor = card()!.querySelector<HTMLTextAreaElement>("textarea")!;
      assert.equal(editor.value, "Changed through Zotero");
      button("AI actions").click();
      const aiMenu = card()!.querySelector<HTMLElement>(
        ".sap-marginalia-ai-menu",
      )!;
      assert.isFalse(aiMenu.hasAttribute("hidden"));
      assert.deepEqual(
        Array.from<HTMLButtonElement, string | undefined>(
          aiMenu.querySelectorAll<HTMLButtonElement>("button"),
          (action) => action.textContent?.trim(),
        ),
        ["Ask AI", "Make concise", "Polish", "Expand"],
      );
      button("AI actions").click();
      button("Cancel").click();
      assert.isTrue(
        editor.closest(".sap-marginalia-editor")!.hasAttribute("hidden"),
      );
      assert.equal(highlight.annotationComment, "Changed through Zotero");
      button("Comment actions").click();
      editMenu.querySelector<HTMLButtonElement>("button")!.click();
      editor.value = "Saved from the margin\n第二行";
      button("Save").click();
      await waitFor(
        "the new comment text after Save",
        () => comment()?.textContent === "Saved from the margin\n第二行",
      );
      assert.equal(
        highlight.annotationComment,
        "Saved from the margin\n第二行",
      );
      assert.equal(highlight.annotationType, "highlight");
      assert.equal(highlight.annotationText, "margin-notes");
      assert.equal(highlight.annotationColor, "#ffd400");
      assert.deepEqual(JSON.parse(highlight.annotationPosition), position);
      assert.include(
        JSON.stringify(reader._internalReader._state.annotations),
        "Saved from the margin",
      );

      const unresized = view._iframe.getBoundingClientRect().width;
      view._iframe.style.setProperty("width", "480px", "important");
      await waitFor(
        "the PDF viewport narrowing",
        () => view._iframe.getBoundingClientRect().width < unresized,
      );
      await waitFor(
        "the PDF viewport reclaiming its margins",
        () => viewer.container.clientWidth > 440,
      );
      view.zoomPageWidth();
      await Zotero.Promise.delay(100);
      viewer.container.scrollTop = 0;
      viewer.update();
      const highlightMarker = () =>
        markers().find(
          ({ dataset }) => dataset.annotationKey === highlight.key,
        );
      await waitFor(
        "multiple marker buttons at page-width zoom",
        () => markers().length >= 2 && highlightMarker(),
      );
      const matching = highlightMarker()!;
      matching.click();
      await waitFor("the expanded marker card", card);
      assert.equal(matching.getAttribute("aria-expanded"), "true");
      const geometry = () => projectPdfMark(view, position);
      const unrotated = geometry()!;
      app.rotatePages(90);
      await waitFor(
        "the rotated annotation projection",
        () => (geometry()?.left ?? 0) !== unrotated.left,
      );
      const rotated = geometry()!;
      assert.notEqual(rotated.top, unrotated.top);
      viewer.currentPageNumber = 2;
      await waitFor(
        "the first-page notes scrolling out of view",
        () => !card() && !markers().length,
      );
      viewer.currentPageNumber = 1;
      await waitFor(
        "the notes returning on page one",
        () => !!card() || markers().length > 0,
      );

      await waitFor("the overlay narrowing with the viewer", () => {
        const overlay = doc()?.querySelector(".sap-marginalia-layer");
        return overlay && overlay.getBoundingClientRect().width < unresized;
      });
      toggle()!.click();
      assert.equal(toggle()!.getAttribute("aria-pressed"), "false");
      assert.notExists(doc()?.querySelector(".sap-marginalia-layer"));
      toggle()!.click();
      await waitFor(
        "the visible overlay after re-enabling the toolbar toggle",
        () =>
          toggle()?.getAttribute("aria-pressed") === "true" &&
          doc()?.querySelector(".sap-marginalia-layer"),
      );
    } catch (cause) {
      const errors = Services.console
        .getMessageArray()
        .map(({ message }) => message)
        .filter((message) =>
          /marginalia|Sapientia|permission denied/.test(message),
        )
        .slice(-12);
      const debug = String(await Zotero.Debug.get())
        .split("\n")
        .filter((line) =>
          /marginalia|observer handler|TypeError:|SecurityError:/.test(line),
        )
        .slice(-14);
      const buttons = Array.from<Element>(
        reader._iframeWindow?.document.querySelectorAll(
          ".sap-marginalia-toggle",
        ) ?? [],
      ).map(({ outerHTML }) => String(outerHTML).slice(0, 180));
      const view = readerPdfViews(reader)[0];
      const doc = reader._iframeWindow?.document;
      const geometry = view && {
        bounds: pdfViewBounds(view),
        mark: projectPdfMark(view, position),
      };
      const layout = {
        geometry,
        frameConnected: view?._iframe.isConnected,
        frameBody: !!view?._iframeWindow?.document.body,
        layers: doc?.querySelectorAll(".sap-marginalia-layer").length,
        cards: doc?.querySelectorAll(".sap-marginalia-card:not([hidden])")
          .length,
        markers: doc?.querySelectorAll(".sap-marginalia-marker:not([hidden])")
          .length,
      };
      throw new Error(
        [
          String(cause),
          JSON.stringify(layout),
          ...buttons,
          ...errors,
          ...debug,
        ].join("\n"),
        { cause },
      );
    } finally {
      Zotero.Prefs.set(pref, initial as boolean, true);
      host.Zotero_Tabs.close(reader.tabID);
      Zotero.Debug.setStore(wasStoring);
    }
  });
});
