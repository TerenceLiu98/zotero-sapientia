import { assert } from "chai";
import { CHAT_PANE_ID, CHAT_TOGGLE_ID } from "../src/modules/sidebar/section";
import { setWriteAllowed } from "../src/writes/request";
import { mainWindow, makeAgent, plugin, reset, until, use } from "./helpers";

describe("writing through an installed Codex ACP adapter", function () {
  this.timeout(360000);

  it("drafts and revises child notes and proposes tags for two selected papers", async function () {
    const adapter = Services.env.get("SAPIENTIA_TEST_CODEX_ACP");
    if (!adapter) return this.skip();
    await reset();
    const fixture = await makeAgent("Codex ACP writes");
    use(
      fixture.profile([], {
        command: adapter,
        args: [],
        name: "Codex ACP",
        env: {},
      }),
    );
    setWriteAllowed(true);

    const a = new Zotero.Item("journalArticle");
    a.setField("title", "Synthetic Lens Study");
    a.setField("abstractNote", "An optics study measures lens calibration.");
    a.addTag("Shared");
    await a.saveTx();
    const b = new Zotero.Item("journalArticle");
    b.setField("title", "Synthetic Routing Study");
    b.setField("abstractNote", "A networks study compares routing protocols.");
    b.addTag("Unrelated tag");
    await b.saveTx();

    async function child(parent: Zotero.Item, html: string) {
      const note = new Zotero.Item("note");
      note.libraryID = parent.libraryID;
      note.parentID = parent.id;
      note.setNote(html);
      await note.saveTx();
      return note;
    }
    const note = await child(
      a,
      "<h2>Calibration log</h2><p>The lab marker was <strong>ultramarine-quartz-47</strong>. The calibration was repeated three times.</p>",
    );
    const unrelated = await child(
      b,
      "<p>The lab marker was crimson-garnet-91.</p>",
    );
    const before = note.getNote();
    const unrelatedBefore = unrelated.getNote();

    const win = mainWindow();
    const doc = win.document;
    const pane = doc.getElementById(CHAT_PANE_ID) as XULElement;
    const toggle = doc.getElementById(CHAT_TOGGLE_ID)!;
    const chat = plugin().chat;
    const review = pane.querySelector<HTMLElement>(".sap-write-review")!;
    const input = pane.querySelector<HTMLTextAreaElement>(".sap-chat-input")!;
    const send = pane.querySelector<HTMLButtonElement>(".sap-composer-send")!;
    const preview = () => review.querySelector<HTMLElement>(".sap-write-note")!;

    async function propose(question: string) {
      const count = chat.getState().messages.length;
      input.value = question;
      input.dispatchEvent(new win.Event("input"));
      assert.isFalse(send.disabled);
      send.click();
      await until(
        () =>
          review.dataset.phase === "pending" ||
          (chat.getState().messages.length > count &&
            chat.getState().execution === "idle"),
        { timeout: 65000 },
      );
      const answer = chat.getState().messages.at(-1);
      assert.equal(
        review.dataset.phase,
        "pending",
        JSON.stringify({
          error: chat.getState().error,
          answer: answer?.role === "assistant" ? answer.blocks : undefined,
        }),
      );
    }

    async function decide(approved: boolean) {
      const button = review.querySelector<HTMLButtonElement>(
        approved ? ".sap-write-approve" : '[aria-keyshortcuts="Escape"]',
      );
      assert.exists(button);
      button!.click();
      await until(() => chat.getState().execution === "idle", {
        timeout: 40000,
      });
      assert.isNull(chat.getState().error);
    }

    try {
      win.Zotero_Tabs.select("zotero-pane");
      if (pane.hidden) toggle.dispatchEvent(new win.Event("command"));
      await win.ZoteroPane.selectItems([a.id]);
      await until(
        () =>
          pane.querySelector(".sap-context-title")?.textContent ===
          "Synthetic Lens Study",
      );
      assert.isTrue(await chat.connect());

      const draft =
        "Read the current paper's Zotero notes and propose creating a new child reading note. Use the HTML headings ‘Instrument Setup’ and ‘Repeatability’ in that order with a short paragraph each based on the notes. Include the exact lab marker from the existing note. Submit one creation proposal for approval.";
      const assertDraft = () => {
        assert.equal(
          preview().querySelector("h2")?.textContent,
          "Instrument Setup",
        );
        assert.equal(
          preview().querySelectorAll("h2")[1]?.textContent,
          "Repeatability",
        );
        assert.include(preview().textContent, "ultramarine-quartz-47");
        assert.notInclude(preview().textContent, "crimson-garnet-91");
      };
      await propose(`${draft} Make both headings h2 elements.`);
      assertDraft();
      await decide(false);
      assert.deepEqual(a.getNotes(), [note.id]);

      await propose(
        `Submit a fresh creation proposal for my approval now. ${draft} Make both headings h2 elements.`,
      );
      assertDraft();
      await decide(true);
      assert.lengthOf(a.getNotes(), 2);
      const created = Zotero.Items.get(
        a.getNotes().find((id) => id !== note.id)!,
      );
      if (!created) throw new Error("The approved note was not saved.");
      assert.include(created.getNote(), "Instrument Setup");
      assert.include(created.getNote(), "Repeatability");
      assert.equal(note.getNote(), before);

      const edit =
        "Read the current paper's notes and propose replacing the existing child note titled Calibration log. Start with an h2 heading ‘Replication’, then summarize the repeat count, retain the exact existing lab marker in bold, and add the sentence ‘Record the next measurement.’ Propose replacing that original note in place and wait for approval.";
      const assertEdit = () => {
        assert.include(review.textContent, note.key);
        assert.equal(preview().querySelector("h2")?.textContent, "Replication");
        assert.include(preview().textContent, "ultramarine-quartz-47");
        assert.include(preview().textContent, "Record the next measurement.");
        assert.match(preview().textContent!, /three|\b3\b/i);
      };
      await propose(edit);
      assertEdit();
      await decide(false);
      assert.equal(note.getNote(), before);
      await propose(
        `Submit a fresh edit proposal for my approval now. ${edit}`,
      );
      assertEdit();
      await decide(true);
      assert.include(note.getNote(), "Replication");
      assert.equal(note.parentID, a.id);
      assert.equal(unrelated.getNote(), unrelatedBefore);
      const revision = (await chat.writes.history()).find(
        ({ target, operation }) =>
          target.itemID === a.id && operation === "edit_note",
      );
      assert.exists(revision);
      await chat.writes.undo(revision!.id);
      assert.equal(note.getNote(), before);

      await win.ZoteroPane.selectItems([a.id, b.id]);
      await until(
        () =>
          pane.querySelector(".sap-context-title")?.textContent ===
          "2 selected items",
      );
      await propose(
        "Read the existing tags for both selected Zotero items. For each paper, propose adding the tag Shared if it is missing and one topical tag based on the abstract, using the vocabulary Optics and Networks. Submit one combined tag batch for approval.",
      );
      const proposed = Array.from<HTMLElement>(
        review.querySelectorAll(".sap-write-row"),
      );
      assert.lengthOf(proposed, 2);
      const rowA = proposed.find((row) => row.textContent?.includes(a.key))!;
      const rowB = proposed.find((row) => row.textContent?.includes(b.key))!;
      assert.exists(rowA);
      assert.exists(rowB);
      const tags = (row: HTMLElement) =>
        Array.from<HTMLElement, string | null>(
          row.querySelectorAll(".sap-write-tags li"),
          (tag) => tag.textContent,
        );
      assert.deepEqual(tags(rowA), ["Optics"]);
      assert.sameMembers(tags(rowB), ["Shared", "Networks"]);
      await decide(true);
      assert.sameMembers(
        a.getTags().map(({ tag }) => tag),
        ["Shared", "Optics"],
      );
      assert.sameMembers(
        b.getTags().map(({ tag }) => tag),
        ["Unrelated tag", "Shared", "Networks"],
      );
    } finally {
      await chat.disconnect();
    }
  });
});
