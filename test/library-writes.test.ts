import { assert } from "chai";
import { createWriteReview } from "../src/modules/sidebar/write-review";
import { WriteApprovals } from "../src/writes/approval";
import { libraryWriteSchema, prepareWrite } from "../src/writes/request";
import { mainWindow } from "./helpers";

const source = {
  url: "https://example.org/paper",
  summary: "The publisher lists the corrected title.",
};

async function paper(title: string) {
  const item = new Zotero.Item("journalArticle");
  item.setField("title", title);
  await item.saveTx();
  return item;
}

function prepare(...operations: unknown[]) {
  return prepareWrite(
    libraryWriteSchema.parse({ turnId: "fixture-turn", operations }),
    undefined,
    undefined,
    { library: true },
  );
}

describe("Library Agent writes", function () {
  it("writes and undoes collection creation and explicit item membership", async () => {
    const item = await paper("Library membership target");
    const writes = new WriteApprovals({
      writeAllowed: () => true,
      direct: () => true,
    });
    const execute = async (...operations: unknown[]) => {
      const result = await writes.request(
        await prepare(...operations),
        new AbortController().signal,
      );
      assert.equal(result?.status, "completed");
      return result!.outcomes;
    };

    const name = `Library collection ${Zotero.Utilities.randomString(8)}`;
    const create = { operation: "create_collection", change: { name } };
    const [created, duplicate] = await execute(create, create);
    assert.equal(created.status, "applied");
    assert.equal(duplicate.status, "unchanged");
    assert.isUndefined(duplicate.historyID);
    assert.deepEqual(duplicate.target, created.target);
    assert.isTrue("collectionKey" in created.target);
    const collectionKey =
      "collectionKey" in created.target ? created.target.collectionKey! : "";
    const collection = await Zotero.Collections.getByLibraryAndKeyAsync(
      item.libraryID,
      collectionKey,
    );
    if (!collection) throw new Error("The collection was not saved.");
    assert.equal(collection.name, name);

    const add = {
      operation: "add_to_collection",
      itemID: item.id,
      change: { collectionKey },
    };
    const [added, unchanged] = await execute(add, add);
    assert.equal(added.status, "applied");
    assert.equal(unchanged.status, "unchanged");
    assert.isTrue(item.inCollection(collection.id));
    let conflict: unknown;
    try {
      await writes.undo(created.historyID!);
    } catch (error) {
      conflict = error;
    }
    assert.instanceOf(conflict, Error);
    assert.include((conflict as Error).message, "gained contents");

    const [removed] = await execute({
      ...add,
      operation: "remove_from_collection",
    });
    assert.equal(removed.status, "applied");
    assert.isFalse(item.inCollection(collection.id));
    await writes.undo(removed.historyID!);
    assert.isTrue(item.inCollection(collection.id));
    await writes.undo(added.historyID!);
    assert.isFalse(item.inCollection(collection.id));
    await writes.undo(created.historyID!);
    assert.isFalse(
      await Zotero.Collections.getByLibraryAndKeyAsync(
        item.libraryID,
        collectionKey,
      ),
    );
    assert.isFalse(item.deleted);
  });

  it("shows metadata evidence and reports unresolved records without mutating them", async () => {
    const item = await paper("Original title");
    const correction = {
      operation: "update_metadata",
      itemKey: item.key,
      change: { fields: { title: "Corrected title" }, evidence: [source] },
    };
    const unresolved = {
      operation: "report_metadata_unresolved",
      itemKey: item.key,
      change: { reason: "Title differs between sources.", evidence: [source] },
    };
    assert.isFalse(
      libraryWriteSchema.safeParse({
        turnId: "fixture-turn",
        operations: [
          { ...correction, change: { fields: correction.change.fields } },
        ],
      }).success,
    );
    assert.isFalse(
      libraryWriteSchema.safeParse({
        turnId: "fixture-turn",
        operations: [
          {
            ...correction,
            change: {
              ...correction.change,
              evidence: [{ ...source, url: "file:///tmp/source.html" }],
            },
          },
        ],
      }).success,
    );

    const writes = new WriteApprovals({ writeAllowed: () => true });
    const card = createWriteReview(mainWindow().document, writes);
    const initialHistory = (await writes.history()).length;
    const request = async (...operations: unknown[]) =>
      writes.request(
        await prepare(...operations),
        new AbortController().signal,
      );
    const phases: (string | undefined)[] = [];
    let id = 0;
    const unsubscribe = writes.subscribe((review) => {
      phases.push(review?.phase);
      id = review?.id ?? 0;
    });

    try {
      const report = await request(unresolved);
      assert.notInclude(phases, "pending");
      assert.equal(report?.outcomes[0].status, "unresolved");
      assert.equal(report?.outcomes[0].reason, unresolved.change.reason);
      assert.include(card.element.textContent, unresolved.change.reason);
      assert.equal((await writes.history()).length, initialHistory);

      const proposal = await prepare(correction, unresolved);
      const denied = writes.request(proposal, new AbortController().signal);
      assert.equal(card.element.dataset.phase, "pending");
      assert.include(
        card.element.querySelector("del")?.textContent,
        "Original title",
      );
      assert.include(
        card.element.querySelector("ins")?.textContent,
        "Corrected title",
      );
      assert.include(card.element.textContent, source.summary);
      assert.equal(
        card.element.querySelector("a")?.getAttribute("href"),
        source.url,
      );
      writes.cancel(id);
      assert.deepEqual(
        (await denied)?.outcomes.map(({ status }) => status),
        ["cancelled", "unresolved"],
      );
      assert.equal(item.getField("title"), "Original title");
      assert.equal((await writes.history()).length, initialHistory);

      const approved = writes.request(proposal, new AbortController().signal);
      await writes.confirm(id);
      const result = await approved;
      assert.deepEqual(
        result?.outcomes.map(({ status }) => status),
        ["applied", "unresolved"],
      );
      assert.equal(item.getField("title"), "Corrected title");
      assert.equal((await writes.history()).length, initialHistory + 1);
      await writes.undo(result!.outcomes[0].historyID!);
      assert.equal(item.getField("title"), "Original title");
    } finally {
      unsubscribe();
      card.destroy();
    }
  });

  it("continues a partly conflicting batch and uses the same history for direct writes", async () => {
    const item = await paper("Existing metadata");
    let direct = false;
    const writes = new WriteApprovals({
      writeAllowed: () => true,
      direct: () => direct,
    });
    let id = 0;
    const phases: (string | undefined)[] = [];
    const unsubscribe = writes.subscribe((review) => {
      phases.push(review?.phase);
      id = review?.id ?? 0;
    });
    const addTag = {
      operation: "add_tags",
      itemID: item.id,
      change: { tags: ["Library batch tag"] },
    };
    try {
      const proposal = await prepare(
        {
          operation: "update_metadata",
          itemID: item.id,
          change: {
            fields: { title: "Proposed metadata" },
            evidence: [source],
          },
        },
        addTag,
      );
      const pending = writes.request(proposal, new AbortController().signal);
      assert.include(phases, "pending");
      item.setField("title", "Manually corrected metadata");
      await item.saveTx();
      await writes.confirm(id);
      const approved = await pending;
      assert.deepEqual(
        approved?.outcomes.map(({ status }) => status),
        ["failed", "applied"],
      );
      assert.equal(item.getField("title"), "Manually corrected metadata");
      assert.include(
        item.getTags().map(({ tag }) => tag),
        "Library batch tag",
      );
      await writes.undo(approved!.outcomes[1].historyID!);
      assert.isEmpty(item.getTags());

      direct = true;
      phases.length = 0;
      const immediate = await writes.request(
        await prepare(addTag),
        new AbortController().signal,
      );
      assert.notInclude(phases, "pending");
      assert.equal(immediate?.outcomes[0].status, "applied");
      await writes.undo(immediate!.outcomes[0].historyID!);
      assert.isEmpty(item.getTags());
    } finally {
      unsubscribe();
    }
  });
});
