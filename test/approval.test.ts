import { assert } from "chai";
import { CHAT_PANE_ID, CHAT_TOGGLE_ID } from "../src/modules/sidebar/section";
import { tagDeletionAllowed } from "../src/writes/request";
import {
  mainWindow,
  makeAgent,
  plugin,
  PREFS_PANE_ID,
  reset,
  until,
  use,
} from "./helpers";

type Call = [string, Record<string, unknown>];
const proposal = (
  operation: string,
  change: object,
  target: object = {},
): Call => ["propose_zotero_write", { operation, change, ...target }];
const batch = (...changes: Call[]): Call => [
  "propose_zotero_write",
  { operations: changes.map(([, change]) => change) },
];

async function paper(title: string) {
  const item = new Zotero.Item("journalArticle");
  item.setField("title", title);
  await item.saveTx();
  return item;
}

describe("write approval in the Zotero sidebar", function () {
  this.timeout(60000);

  it("previews, confirms, cancels and undoes the exact reviewed changes", async () => {
    await reset();
    const agent = await makeAgent("write approval");
    use(agent.profile(["--capabilities", '{"mcpCapabilities":{"http":true}}']));
    const title = "A review target with a long title ".repeat(8).trim();
    const a = await paper(title);
    const b = await paper("An unrelated paper B");
    const note = new Zotero.Item("note");
    note.libraryID = a.libraryID;
    note.parentID = a.id;
    note.setNote("<p>Original fixture note</p>");
    await note.saveTx();
    const original = note.getNote();
    a.addTag("Imported tag", 1);
    await a.saveTx();

    const win = mainWindow();
    const doc = win.document;
    const pane = doc.getElementById(CHAT_PANE_ID) as XULElement;
    const toggle = doc.getElementById(CHAT_TOGGLE_ID)!;
    const chat = plugin().chat;
    const showSidebar = () => {
      if (pane.hidden) toggle.dispatchEvent(new win.Event("command"));
    };
    const select = async (item: Zotero.Item) => {
      win.Zotero_Tabs.select("zotero-pane");
      await win.ZoteroPane.selectItem(item.id);
      await until(
        () =>
          pane.querySelector(".sap-context-title")?.textContent ===
          item.getDisplayTitle(),
      );
    };
    showSidebar();
    await select(a);
    const grip = pane.querySelector<HTMLElement>("[role=separator]")!;
    const initialWidth = Number(grip.getAttribute("aria-valuenow"));
    const resize = (target: number) => {
      const width = Number(grip.getAttribute("aria-valuenow"));
      for (let offset = Math.abs(width - target); offset > 0; offset -= 20)
        grip.dispatchEvent(
          new win.KeyboardEvent("keydown", {
            key: width < target ? "ArrowLeft" : "ArrowRight",
          }),
        );
    };
    const review = () => pane.querySelector<HTMLElement>(".sap-write-review")!;
    const action = (label: string) =>
      [...review().querySelectorAll<HTMLButtonElement>("button")].find(
        (button) =>
          button.textContent === label && !button.hidden && !button.disabled,
      );
    const click = (label: string) => {
      const button = action(label);
      assert.exists(button, `visible ${label} button`);
      button!.click();
    };
    const start = (...calls: Call[]) => {
      const input = pane.querySelector<HTMLTextAreaElement>(".sap-chat-input")!;
      input.value = `zotero-tools:${JSON.stringify(calls)}`;
      input.dispatchEvent(new win.Event("input"));
      const send = pane.querySelector<HTMLButtonElement>(".sap-composer-send")!;
      assert.isFalse(send.disabled);
      send.click();
    };
    let consumed = 0;
    async function results(count = 1) {
      await until(
        async () =>
          chat.getState().execution === "idle" &&
          (await agent.received()).filter(
            ({ event }) => event === "zotero-tool",
          ).length >=
            consumed + count,
      );
      const entries = (await agent.received()).filter(
        ({ event }) => event === "zotero-tool",
      );
      assert.lengthOf(entries, consumed + count);
      const next = entries.slice(consumed).map(({ result }) => result);
      consumed = entries.length;
      return next;
    }
    const value = (result: {
      isError?: boolean;
      content: { text: string }[];
    }) => {
      assert.isNotTrue(result.isError, result.content[0].text);
      return JSON.parse(result.content[0].text);
    };
    const pending = () => until(() => !review().hidden && action("Confirm"));
    const history = () => chat.writes.history();
    const historyCount = async () => (await history()).length;
    const undo = async (id: string) => {
      const entries = await history();
      const index = entries.findIndex((entry) => entry.id === id);
      assert.isAtLeast(index, 0);
      const row = pane.querySelectorAll(".sap-write-history-row")[
        index
      ] as HTMLElement;
      row
        .querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!
        .click();
      await until(
        async () => (await history()).find((entry) => entry.id === id)?.undone,
      );
      await until(
        () => row.textContent?.includes("Undone") || !row.isConnected,
      );
    };
    const undoAll = () =>
      pane.querySelector<HTMLButtonElement>(
        'button[aria-label="Write history"]',
      )!;
    let prefs: Window | undefined;
    const saveB = b.save;
    try {
      assert.isTrue(await chat.connect());
      const initialHistory = await historyCount();
      resize(300);
      const large =
        "<p>" + "A complete proposed note ".repeat(60).trim() + "</p>";
      start(
        ["read_paper_metadata", {}],
        proposal("create_note", { html: large }),
      );
      await pending();
      assert.include(review().textContent, title);
      assert.include(review().textContent, large);
      assert.isAtMost(review().scrollWidth, review().clientWidth);
      for (const label of ["Confirm", "Cancel"]) {
        const rect = action(label)!.getBoundingClientRect();
        const card = review().getBoundingClientRect();
        assert.isAbove(rect.width, 0);
        assert.isAtMost(rect.right, card.right);
        assert.isAtMost(rect.bottom, card.bottom);
      }
      assert.deepEqual(
        a.getNotes(),
        [note.id],
        "waiting for approval leaves the library untouched",
      );
      click("Cancel");
      const [read, cancelled] = await results(2);
      assert.equal(value(read).itemKey, a.key);
      assert.equal(value(cancelled).status, "cancelled");
      assert.deepEqual(a.getNotes(), [note.id]);
      assert.equal(await historyCount(), initialHistory);

      const edited = "<p>Revised in the fixture</p>";
      start(
        proposal("edit_note", { html: edited, noteKey: note.key }),
        proposal("add_tags", { tags: ["Reviewed tag"] }, { itemKey: a.key }),
      );
      await pending();
      assert.include(review().textContent, note.key);
      assert.include(review().textContent, edited);
      await select(b);
      click("Confirm");
      await pending();
      assert.include(review().textContent, "Reviewed tag");
      click("Confirm");
      const [editResponse, tagResponse] = (await results(2)).map(value);
      const editRecord = editResponse.outcomes[0];
      const tagRecord = tagResponse.outcomes[0];
      assert.equal(editRecord.status, "applied");
      assert.equal(tagRecord.status, "applied");
      assert.include(note.getNote(), edited);
      assert.deepInclude(a.getTags(), { tag: "Reviewed tag" });
      assert.isEmpty(
        b.getTags(),
        "switching the current selection cannot retarget the reviewed write",
      );
      assert.isEmpty(b.getNotes());

      const historyButton = undoAll();
      historyButton.click();
      await until(
        () =>
          pane.querySelectorAll(".sap-write-history-row").length ===
          initialHistory + 2,
      );
      await undo(editRecord.historyID);
      await undo(tagRecord.historyID);
      assert.equal(note.getNote(), original);
      assert.deepEqual(a.getTags(), [{ tag: "Imported tag", type: 1 }]);
      historyButton.click();

      await select(a);
      assert.isFalse(tagDeletionAllowed());
      const removeTag = proposal("delete_tags", { tags: ["Imported tag"] });
      start(removeTag);
      const [denied] = await results();
      assert.isTrue(denied.isError);
      assert.include(denied.content[0].text, "disabled");
      assert.deepEqual(a.getTags(), [{ tag: "Imported tag", type: 1 }]);

      prefs = Zotero.Utilities.Internal.openPreferences(PREFS_PANE_ID)!;
      await until(() =>
        prefs!.document.querySelector("#sapientia-allow-tag-deletion"),
      );
      const checkbox = prefs.document.querySelector<HTMLInputElement>(
        "#sapientia-allow-tag-deletion",
      )!;
      assert.isFalse(checkbox.checked);
      checkbox.click();
      assert.isTrue(tagDeletionAllowed());
      start(removeTag);
      await pending();
      click("Cancel");
      assert.equal(value((await results())[0]).status, "cancelled");
      assert.deepEqual(a.getTags(), [{ tag: "Imported tag", type: 1 }]);
      start(removeTag);
      await pending();
      click("Confirm");
      const removed = value((await results())[0]).outcomes[0];
      assert.equal(removed.status, "applied");
      assert.isEmpty(a.getTags());
      historyButton.click();
      await until(
        () =>
          pane.querySelectorAll(".sap-write-history-row").length ===
          initialHistory + 3,
      );
      await undo(removed.historyID);
      assert.deepEqual(a.getTags(), [{ tag: "Imported tag", type: 1 }]);
      historyButton.click();

      start(
        batch(
          proposal(
            "add_tags",
            { tags: ["First batch tag"] },
            { itemKey: a.key },
          ),
          proposal(
            "add_tags",
            { tags: ["Must remain unprocessed"] },
            { itemKey: b.key },
          ),
        ),
      );
      await pending();
      assert.include(review().textContent, b.getDisplayTitle());
      let atBoundary = false;
      const unsubscribe = chat.writes.subscribe((review) => {
        if (
          review?.phase !== "running" ||
          review.stopping ||
          review.outcomes.length !== 1
        )
          return;
        atBoundary = true;
        click("Cancel");
      });
      try {
        click("Confirm");
        const stopped = value((await results())[0]);
        assert.isTrue(atBoundary);
        assert.equal(stopped.status, "cancelled");
        assert.deepEqual(
          stopped.outcomes.map((entry: { status: string }) => entry.status),
          ["applied", "cancelled"],
        );
        assert.include(review().textContent, "Not processed");
        assert.deepInclude(a.getTags(), { tag: "First batch tag" });
        assert.isEmpty(b.getTags());
        historyButton.click();
        await until(
          () =>
            pane.querySelectorAll(".sap-write-history-row").length ===
            initialHistory + 4,
        );
        await undo(stopped.outcomes[0].historyID);
        historyButton.click();
      } finally {
        unsubscribe();
      }

      b.save = async function () {
        await saveB.call(this);
        throw new Error("Fixture failed to save paper B");
      };
      start(
        batch(
          proposal(
            "add_tags",
            { tags: ["Committed despite failure"] },
            { itemID: a.id },
          ),
          proposal("add_tags", { tags: ["Failed tag"] }, { itemID: b.id }),
        ),
      );
      await pending();
      click("Confirm");
      const result = value((await results())[0]);
      assert.deepEqual(
        result.outcomes.map((entry: { status: string }) => entry.status),
        ["applied", "failed"],
      );
      assert.include(review().textContent, "Fixture failed to save paper B");
      assert.notProperty(result.outcomes[1], "historyID");
      assert.isEmpty(b.getTags());
      assert.deepInclude(a.getTags(), { tag: "Committed despite failure" });
      historyButton.click();
      await until(
        () =>
          pane.querySelectorAll(".sap-write-history-row").length ===
          initialHistory + 5,
      );
      await undo(result.outcomes[0].historyID);
      assert.deepEqual(a.getTags(), [{ tag: "Imported tag", type: 1 }]);
      historyButton.click();

      b.save = saveB;
      start(
        proposal("create_note", {
          html: "<p>A confirmed child note</p><script>window.fixtureChanged = true</script>",
        }),
      );
      await pending();
      assert.include(review().textContent, "<p>A confirmed child note</p>");
      assert.notInclude(review().textContent, "fixtureChanged");
      click("Confirm");
      const created = value((await results())[0]).outcomes[0];
      assert.equal(created.status, "applied");
      const childID = a.getNotes().find((id) => id !== note.id)!;
      const child = Zotero.Items.get(childID);
      if (!child) throw new Error("The confirmed child note was not saved.");
      assert.include(child.getNote(), "<p>A confirmed child note</p>");
      historyButton.click();
      await until(
        () =>
          pane.querySelectorAll(".sap-write-history-row").length ===
          initialHistory + 6,
      );
      await undo(created.historyID);
      assert.deepEqual(a.getNotes(), [note.id]);
      historyButton.click();
    } finally {
      b.save = saveB;
      const checkbox = prefs?.document.querySelector<HTMLInputElement>(
        "#sapientia-allow-tag-deletion",
      );
      if (checkbox?.checked) checkbox.click();
      prefs?.close();
      resize(initialWidth);
      await chat.disconnect();
    }
  });
});
