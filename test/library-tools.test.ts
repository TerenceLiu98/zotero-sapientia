import { assert } from "chai";
import { pdfURI, type SelectedText } from "../src/context/paper";
import { startPaperTools } from "../src/context/tool-server";
import { makePaper } from "./helpers";

describe("Library Agent MCP scope", function () {
  this.timeout(60000);

  it("paginates personal matches and rejects unavailable and foreign targets", async function () {
    const group = new Zotero.Group({
      groupID: 300014,
      name: "Library MCP fixture",
      description: "Verifies the personal library boundary.",
      version: 1,
    });
    group.editable = true;
    group.filesEditable = true;
    await group.saveTx();

    const personal = Zotero.Libraries.userLibraryID;
    const collection = new Zotero.Collection({
      name: "Library MCP personal",
      libraryID: personal,
    });
    await collection.saveTx();
    const foreignCollection = new Zotero.Collection({
      name: "Library MCP group",
      libraryID: group.libraryID,
    });
    await foreignCollection.saveTx();

    async function createPaper(
      suffix: string,
      libraryID = personal,
      deleted = false,
    ) {
      const item = new Zotero.Item("journalArticle");
      item.libraryID = libraryID;
      item.setField("title", `Library MCP Fixture ${suffix}`);
      item.setField("date", "2024-07-18");
      item.setField("DOI", `10.7000/${suffix}`);
      item.setCreators([
        { creatorType: "author", firstName: "Penelope", lastName: "Fixture" },
      ]);
      item.addTag("library-mcp-unique");
      item.deleted = deleted;
      await item.saveTx();
      return item;
    }

    const first = await createPaper("alpha");
    const foreign = await createPaper("foreign", group.libraryID);
    const trashed = await createPaper("trashed", personal, true);
    const second = await createPaper("beta");
    first.addToCollection(collection.id);
    await first.saveTx();
    const note = new Zotero.Item("note");
    note.libraryID = personal;
    note.parentID = first.id;
    note.setNote("<p>Library MCP note</p>");
    await note.saveTx();

    const directory = await IOUtils.createUniqueDirectory(
      PathUtils.profileDir,
      "sapientia test library MCP PDFs",
    );
    const pdf = await makePaper(
      directory,
      "Library MCP first",
      "library-first",
      {
        parent: first,
        pages: ["Library MCP first page"],
      },
    );
    const otherPdf = await makePaper(
      directory,
      "Library MCP second",
      "library-second",
      { parent: second, pages: ["Library MCP second page"] },
    );
    const annotation = new Zotero.Item("annotation");
    annotation.libraryID = personal;
    annotation.parentID = pdf.id;
    annotation.annotationType = "highlight";
    annotation.annotationText = "Library MCP highlight";
    annotation.annotationColor = "#ffd400";
    annotation.annotationPageLabel = "1";
    annotation.annotationSortIndex = "00000|000000|00000";
    annotation.annotationPosition = JSON.stringify({
      pageIndex: 0,
      rects: [[40, 715, 140, 732]],
    });
    await annotation.saveTx();

    const uri = `${pdfURI(pdf)}?page=1`;
    const originalSelection: SelectedText = {
      text: "Library MCP selected text",
      itemTitle: "Library MCP Fixture alpha",
      itemKey: first.key,
      libraryID: personal,
      attachmentKey: pdf.key,
      pageIndex: 0,
      pageLabel: "1",
      uri,
    };
    let selection = originalSelection;
    const abort = new AbortController();
    const active = (turnId: string) =>
      turnId === "library-fixture"
        ? { signal: abort.signal, readSelection: () => selection }
        : undefined;
    const { server, close } = startPaperTools(
      active,
      async () => ({
        status: "completed",
        outcomes: [],
      }),
      { library: true, writeAllowed: () => true },
    );
    assert.equal(server.type, "http");
    let rpcID = 0;
    const request = async (method: string, params?: object) => {
      const xhr = await Zotero.HTTP.request("POST", server.url, {
        body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcID, method, params }),
        headers: {
          "Content-Type": "application/json",
          ...Object.fromEntries(
            server.headers.map(({ name, value }) => [name, value]),
          ),
        },
        responseType: "json",
      });
      return xhr.response.result;
    };
    const call = (name: string, args: object = {}) =>
      request("tools/call", {
        name,
        arguments: { turnId: "library-fixture", ...args },
      });
    const content = (result: {
      isError?: boolean;
      content: { text: string }[];
    }) => {
      assert.isNotTrue(result.isError, result.content[0].text);
      return JSON.parse(result.content[0].text);
    };
    try {
      const { tools } = await request("tools/list");
      assert.includeMembers(
        tools.map(({ name }: { name: string }) => name),
        [
          "search_library",
          "list_library_collections",
          "read_paper_metadata",
          "propose_zotero_write",
        ],
      );
      const query = {
        title: "Library MCP Fixture",
        author: "Penelope Fixture",
        year: "2024",
        tag: "library-mcp-unique",
        limit: 1,
      };
      const page1 = content(await call("search_library", query));
      assert.deepEqual(
        page1.items.map(({ itemID }: { itemID: number }) => itemID),
        [first.id],
      );
      assert.equal(page1.nextCursor, first.id);
      const page2 = content(
        await call("search_library", { ...query, cursor: page1.nextCursor }),
      );
      assert.deepEqual(
        page2.items.map(({ itemID }: { itemID: number }) => itemID),
        [second.id],
      );
      assert.isNull(page2.nextCursor);

      assert.equal(
        content(
          await call("search_library", { doi: "https://doi.org/10.7000/beta" }),
        ).items[0].itemID,
        second.id,
      );
      assert.equal(
        content(await call("search_library", { collectionKey: collection.key }))
          .items[0].itemID,
        first.id,
      );
      assert.isTrue(
        (await call("search_library", { collectionID: foreignCollection.id }))
          .isError,
      );
      assert.deepEqual(
        content(
          await call("list_library_collections", { name: "Library MCP" }),
        ).collections.map(
          ({ collectionID }: { collectionID: number }) => collectionID,
        ),
        [collection.id],
      );

      assert.equal(
        content(await call("read_paper_metadata", { itemKey: first.key }))
          .itemID,
        first.id,
      );
      assert.include(
        content(await call("read_paper_notes", { itemID: first.id })).notes[0]
          .html,
        "Library MCP note",
      );
      assert.deepInclude(
        content(await call("read_paper_tags", { itemID: first.id })).tags,
        { tag: "library-mcp-unique" },
      );
      const pdfResult = content(
        await call("read_current_paper", {
          itemID: first.id,
          attachmentKey: pdf.key,
          page: 1,
        }),
      );
      assert.equal(pdfResult.attachmentID, pdf.id);
      assert.deepEqual(pdfResult.pages, [
        { page: 1, uri, text: "Library MCP first page" },
      ]);
      const annotationResult = content(
        await call("read_paper_annotations", {
          itemKey: first.key,
          attachmentID: pdf.id,
        }),
      );
      assert.deepInclude(annotationResult.annotations, {
        itemKey: annotation.key,
        type: "highlight",
        text: "Library MCP highlight",
        page: 1,
        pageLabel: "1",
        uri,
      });
      const readSelection = (itemID: number) =>
        call("read_paper_selection", { itemID });
      assert.deepEqual(content(await readSelection(first.id)).selection, {
        text: originalSelection.text,
        page: 1,
        pageLabel: "1",
        uri,
      });
      assert.isNull(content(await readSelection(second.id)).selection);
      selection = { ...originalSelection, libraryID: group.libraryID };
      assert.isNull(content(await readSelection(first.id)).selection);
      for (const name of [
        "read_current_paper",
        "read_paper_annotations",
        "read_paper_selection",
      ]) {
        assert.isTrue(
          (
            await call(name, {
              itemID: first.id,
              attachmentID: otherPdf.id,
              attachmentKey: otherPdf.key,
            })
          ).isError,
          name,
        );
      }
      for (const args of [
        {},
        { itemID: foreign.id },
        { itemKey: foreign.key, libraryID: group.libraryID },
        { itemID: trashed.id },
        { itemID: first.id, itemKey: second.key },
      ]) {
        assert.isTrue(
          (await call("read_paper_metadata", args)).isError,
          JSON.stringify(args),
        );
      }

      const change = { operation: "add_tags", change: { tags: ["mcp-test"] } };
      assert.isTrue(
        (
          await call("propose_zotero_write", {
            operations: [{ ...change, itemID: foreign.id }],
          })
        ).isError,
      );
      assert.equal(
        content(
          await call("propose_zotero_write", {
            operations: [{ ...change, itemID: first.id }],
          }),
        ).status,
        "completed",
      );
      abort.abort();
      assert.isTrue((await call("search_library", query)).isError);
    } finally {
      await close();
    }
  });
});
