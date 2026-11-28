import { assert } from "chai";
import { saveProfiles } from "../src/agents/store";
import { ChatController } from "../src/chat/controller";
import { createPaperContext } from "../src/context/paper";
import { CHAT_PANE_ID, CHAT_TOGGLE_ID } from "../src/modules/sidebar/section";
import {
  mainWindow,
  makeAgent,
  makePaper,
  plugin,
  reset,
  until,
  use,
} from "./helpers";

type Reader = _ZoteroTypes.ReaderInstance;

function setSelection(reader: Reader, text: string | null, page = 1) {
  const state = reader._internalReader._state as unknown as {
    primaryViewSelectionPopup: {
      annotation: {
        text: string;
        pageLabel: string;
        position: { pageIndex: number };
      };
    } | null;
  };
  state.primaryViewSelectionPopup =
    text === null
      ? null
      : {
          annotation: {
            text,
            pageLabel: String(page),
            position: { pageIndex: page - 1 },
          },
        };
}

function attachSelection(reader: Reader, text: string, doc: Document) {
  const buttons: HTMLButtonElement[] = [];
  // Dispatch the native popup event with a synthetic selection. Gecko's PDF
  // selection itself requires a trusted pointer gesture.
  const dispatch = Zotero.Reader as unknown as {
    _dispatchEvent(event: object): void;
  };
  dispatch._dispatchEvent({
    type: "renderTextSelectionPopup",
    reader,
    doc,
    params: {
      annotation: { text, pageLabel: "1", position: { pageIndex: 0 } },
    },
    append: (button: HTMLButtonElement) => buttons.push(button),
  });
  assert.lengthOf(buttons, 1);
  assert.equal(buttons[0].textContent, "Ask Agent");
  buttons[0].click();
}

function submit(pane: XULElement, question: string) {
  const input = pane.querySelector<HTMLTextAreaElement>(".sap-chat-input")!;
  const send = pane.querySelector<HTMLButtonElement>(".sap-composer-send")!;
  input.value = question;
  const win = mainWindow();
  input.dispatchEvent(new win.Event("input"));
  assert.isFalse(send.disabled);
  send.click();
}

describe("paper context in the Zotero reader", function () {
  this.timeout(60000);

  it("reads pages and selections through an installed Codex ACP adapter", async function () {
    const adapter = Services.env.get("SAPIENTIA_TEST_CODEX_ACP");
    if (!adapter) return this.skip();
    this.timeout(180000);
    await reset();
    const fixture = await makeAgent("Codex ACP");
    use(
      fixture.profile([], {
        command: adapter,
        args: [],
        name: "Codex ACP",
        env: {},
      }),
    );
    const attachment = await makePaper(
      fixture.dir,
      "ACP fixture",
      "codex-acp",
      {
        pages: [
          "The instrument aperture measured 37 millimeters.",
          "The trial enrolled 83 participants.",
          "The median follow-up was 19 days.",
        ],
      },
    );
    const win = mainWindow();
    const pane = win.document.getElementById(CHAT_PANE_ID) as XULElement;
    const toggle = win.document.getElementById(CHAT_TOGGLE_ID)!;
    const chat = plugin().chat;
    await Zotero.Reader.open(attachment.id);
    const reader = Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID)!;
    await until(() => !!reader._internalReader?._state);
    const url = `zotero://open-pdf/library/items/${attachment.key}`;

    async function ask(question: string): Promise<Element> {
      const count = chat.getState().messages.length;
      submit(pane, question);
      await until(
        () =>
          chat.getState().messages.length === count + 2 &&
          chat.getState().execution === "idle",
        { timeout: 50000 },
      );
      const state = chat.getState();
      assert.isNull(state.error, state.error?.message);
      const turn = pane
        .querySelectorAll<Element>(".sap-answer")
        .item(count / 2);
      assert.exists(turn);
      return turn;
    }
    try {
      if (pane.hidden) toggle.dispatchEvent(new win.Event("command"));
      assert.isTrue(
        await chat.connect(),
        chat.getState().error?.params.message as string,
      );
      const answer = await ask(
        "Use the Zotero PDF tool to read only physical page 1. What instrument aperture did it measure? Cite the exact returned Zotero page URI as a Markdown link.",
      );
      assert.match(answer.textContent!, /37\s*(?:millimeters|mm)/i);
      assert.exists(
        answer.querySelector(`a.sap-citation[href="${url}?page=1"]`),
      );

      setSelection(
        reader,
        "The calibration sample was equilibrated for 47 minutes.",
      );
      const explanation = await ask(
        "Use the Zotero selection tool to read my current selection. Explain in plain words what it says, including the duration.",
      );
      assert.match(explanation.textContent!, /47\s*(?:minutes|min)/i);
      setSelection(reader, null);

      const summary = await ask(
        "Use the Zotero PDF tool with startPage 2 and endPage 3. Summarize enrollment and follow-up with one exact Zotero page URI citation per fact.",
      );
      assert.include(summary.textContent, "83");
      assert.include(summary.textContent, "19");
      const second = summary.querySelector<HTMLAnchorElement>(
        `a.sap-citation[href="${url}?page=2"]`,
      );
      const third = summary.querySelector<HTMLAnchorElement>(
        `a.sap-citation[href="${url}?page=3"]`,
      );
      assert.exists(second);
      assert.exists(third);
      third!.click();
      summary.querySelector<HTMLAnchorElement>(".sap-source-open")!.click();
      await until(
        () => reader._internalReader._state.primaryViewStats.pageIndex === 2,
      );
    } finally {
      await chat.disconnect();
    }
  });

  it("enforces MCP read scope and cancels a pending write in the Zotero library", async () => {
    await reset();
    const agent = await makeAgent("scoped tools");
    use(agent.profile(["--capabilities", '{"mcpCapabilities":{"http":true}}']));
    const pdf = await makePaper(agent.dir, "Scoped paper", "scoped", {
      pages: ["", "first marker", "middle marker", "last marker", ""],
    });
    const item = pdf.parentItem!;
    const scan = await makePaper(agent.dir, "Scoped paper", "scan", {
      parent: item,
      pages: [null],
    });
    const excluded = await makePaper(agent.dir, "Excluded paper", "excluded", {
      complete: false,
    });
    const note = new Zotero.Item("note");
    note.libraryID = item.libraryID;
    note.parentID = item.id;
    note.setNote("<p>Fixture note</p>");
    await note.saveTx();
    item.setTags(["fixture tag"]);
    await item.saveTx();
    for (const page of [2, 4]) {
      const annotation = new Zotero.Item("annotation");
      annotation.libraryID = pdf.libraryID;
      annotation.parentID = pdf.id;
      annotation.annotationType = "highlight";
      annotation.annotationText = `Highlight ${page}`;
      annotation.annotationColor = "#ffd400";
      annotation.annotationPageLabel = String(page);
      annotation.annotationSortIndex = `0000${page}|000000|00000`;
      annotation.annotationPosition = JSON.stringify({
        pageIndex: page - 1,
        rects: [[40, 715, 140, 732]],
      });
      await annotation.saveTx();
    }

    const win = mainWindow();
    const tracker = createPaperContext(
      win,
      () => {},
      () => {},
      "Ask Agent",
    );
    let proposal: import("../src/writes/request").WriteProposal | undefined;
    const chat = new ChatController(async (pending, signal) => {
      proposal = pending;
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener("abort", () => resolve(), { once: true });
      });
    });
    type Call = [string, Record<string, unknown>?];
    const names = [
      "read_paper_metadata",
      "read_current_paper",
      "read_paper_selection",
      "read_paper_annotations",
      "read_paper_notes",
      "read_paper_tags",
    ];
    let resultCount = 0;
    const results = async () => {
      const entries = (await agent.received()).filter(
        ({ event }) => event === "zotero-tool",
      );
      const next = entries.slice(resultCount).map(({ result }) => result);
      resultCount = entries.length;
      return next;
    };
    const send = (calls: Call[]) =>
      chat.send(`zotero-tools:${JSON.stringify(calls)}`, {
        paper: tracker.read(),
        selections: [],
        readSelection: tracker.readSelection,
      });
    const run = async (calls: Call[]) => {
      assert.isTrue(await send(calls));
      const response = await results();
      assert.lengthOf(response, calls.length);
      return response;
    };
    const value = (result: {
      isError?: boolean;
      content: { text: string }[];
    }) => {
      assert.isNotTrue(result.isError, result.content[0].text);
      return JSON.parse(result.content[0].text);
    };
    const denied = (result: {
      isError?: boolean;
      content: { text: string }[];
    }) => {
      assert.isTrue(result.isError);
      assert.notMatch(
        result.content[0].text,
        /marker|Fixture note|Excluded paper|Highlight|fixture tag/,
      );
    };
    async function open(attachment: Zotero.Item) {
      await Zotero.Reader.open(attachment.id);
      await until(
        () =>
          tracker.read()?.attachment?.itemID === attachment.id &&
          !!Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID)
            ?._internalReader?._state,
      );
    }

    try {
      await open(pdf);
      const reader = Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID)!;
      setSelection(reader, "first marker", 2);
      const targets: Call[] = names.map((name) => [
        name,
        name === names[1] ? { page: 2 } : {},
      ]);
      const [metadata, page, selection, annotations, notes, tags] = (
        await run(targets)
      ).map(value);
      assert.deepInclude(metadata, {
        itemID: item.id,
        itemKey: item.key,
        title: "Scoped paper",
        authors: ["Ada Bell"],
        abstract: "Abstract of scoped",
        doi: "10.1000/scoped",
        year: "2024",
      });
      assert.sameMembers(
        metadata.attachments.map((entry: { itemKey: string }) => entry.itemKey),
        [pdf.key, scan.key],
      );
      assert.equal(page.attachmentKey, pdf.key);
      assert.deepEqual(
        page.pages.map(({ page, text }: { page: number; text: string }) => [
          page,
          text,
        ]),
        [[2, "first marker"]],
      );
      assert.deepEqual(selection.selection, {
        text: "first marker",
        page: 2,
        pageLabel: "2",
        uri: `zotero://open-pdf/library/items/${pdf.key}?page=2`,
      });
      assert.deepEqual(
        annotations.annotations.map((entry: { page: number; text: string }) => [
          entry.page,
          entry.text,
        ]),
        [
          [2, "Highlight 2"],
          [4, "Highlight 4"],
        ],
      );
      assert.include(notes.notes[0].html, "Fixture note");
      assert.deepEqual(tags.tags, item.getTags());

      setSelection(reader, null);
      const [cleared, range, full, invalid, scanned] = await run([
        [names[2]],
        [names[1], { startPage: 3, endPage: 5 }],
        [names[1]],
        [names[1], { startPage: 3, endPage: 6 }],
        [names[1], { attachmentKey: scan.key, page: 1 }],
      ]);
      assert.isNull(value(cleared).selection);
      assert.deepEqual(
        value(range).pages.map((entry: { text: string }) => entry.text),
        ["middle marker", "last marker", ""],
      );
      assert.deepEqual(
        value(full).pages.map((entry: { text: string }) => entry.text),
        ["", "first marker", "middle marker", "last marker", ""],
      );
      denied(invalid);
      assert.include(invalid.content[0].text, "1 to 5");
      denied(scanned);
      assert.include(scanned.content[0].text, "no extractable text");

      (
        await run(
          names.map((name) => [name, { itemID: excluded.parentID }] as Call),
        )
      ).forEach(denied);
      (
        await run(
          [names[1], names[2], names[3]].map(
            (name) => [name, { attachmentKey: excluded.key }] as Call,
          ),
        )
      ).forEach(denied);
      const prompts = (await agent.received()).filter(
        ({ method }) => method === "session/prompt",
      );
      assert.include(
        JSON.stringify(prompts.at(-1)!.params.prompt),
        "Scoped paper",
      );

      const [directWrite] = await run([
        [
          "create_note",
          {
            itemID: item.id,
            html: "<p>Unapproved change</p>",
          },
        ],
      ]);
      denied(directWrite);
      assert.deepEqual(item.getNotes(), [note.id]);
      const write = send([
        [
          "propose_zotero_write",
          {
            operation: "create_note",
            itemKey: item.key,
            change: { html: "<p>Cancelled change</p>" },
          },
        ],
      ]);
      await until(() => !!proposal);
      assert.deepInclude(proposal!.operations[0], {
        operation: "create_note",
        change: { html: "<p>Cancelled change</p>" },
      });
      assert.equal(proposal!.operations[0].target.itemKey, item.key);
      assert.deepEqual(item.getNotes(), [note.id]);
      await chat.stop();
      assert.isTrue(await write);
      assert.equal(value((await results())[0]).status, "cancelled");
      assert.deepEqual(item.getNotes(), [note.id]);

      await open(excluded);
      const incomplete = value((await run([[names[0]]]))[0]);
      assert.deepInclude(incomplete, {
        itemKey: excluded.parentItem!.key,
        authors: [],
        abstract: null,
        doi: null,
        year: null,
      });
    } finally {
      tracker.dispose();
      await chat.disconnect();
    }
  });

  it("sends explicit selections and keeps a page citation bound to the original PDF", async function () {
    await reset();
    const agent = await makeAgent("reader context");
    use(
      agent.profile([
        "--capabilities",
        '{"loadSession":true,"mcpCapabilities":{"http":true}}',
      ]),
    );
    const aTitle = `Paper A ${"A long title ".repeat(8).trim()}`;
    const a = await makePaper(agent.dir, aTitle, "alpha");
    const alternate = await makePaper(agent.dir, aTitle, "alternate", {
      parent: a.parentItem,
    });
    const b = await makePaper(agent.dir, "Paper B", "beta");
    const win = mainWindow();
    const doc = win.document;
    const pane = doc.getElementById(CHAT_PANE_ID) as XULElement;
    const toggle = doc.getElementById(CHAT_TOGGLE_ID)!;
    const togglePane = () => toggle.dispatchEvent(new win.Event("command"));
    if (!pane.hidden) togglePane();
    const chat = plugin().chat;
    const reader = () => Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);
    const grip = pane.querySelector<HTMLElement>(".sap-chat-resize")!;
    const width = () => Number(grip.getAttribute("aria-valuenow"));
    const initialWidth = width();
    function resizeTo(target: number) {
      const key = width() < target ? "ArrowLeft" : "ArrowRight";
      for (let steps = Math.abs(target - width()) / 20; steps > 0; steps--)
        grip.dispatchEvent(new win.KeyboardEvent("keydown", { key }));
      assert.equal(width(), target);
    }
    let stage = "open paper A";
    async function open(attachment: Zotero.Item) {
      await Zotero.Reader.open(attachment.id);
      await until(
        () =>
          reader()?.itemID === attachment.id &&
          reader()?._internalReader?._state?.primaryViewStats?.pagesCount === 2,
      );
      return reader()!;
    }
    try {
      const readerA = await open(a);
      assert.equal(
        toggle.parentElement,
        doc.getElementById("zotero-context-pane-sidenav"),
      );
      stage = "add the first selection and connect";
      attachSelection(readerA, "alpha page one", doc);
      assert.isFalse(pane.hidden);
      await until(
        () => pane.querySelector(".sap-context-title")?.textContent === aTitle,
      );
      await until(() => chat.getState().connection === "connected");
      const paperRow = pane.querySelector(".sap-chat-context")!;
      assert.equal(paperRow.textContent, aTitle);
      assert.isNull(paperRow.querySelector("button"));
      assert.include(
        pane.querySelector(".sap-context-quote")!.textContent!,
        "alpha page one",
      );
      resizeTo(400);
      stage = "lay out and remove selected text cards";
      attachSelection(readerA, "Another passage ".repeat(20).trim(), doc);
      attachSelection(readerA, "A third passage", doc);
      const cards = pane.querySelectorAll<HTMLElement>(
        ".sap-composer-card .sap-context-quote",
      );
      assert.lengthOf(cards, 3);
      assert.equal(
        cards[0].querySelector(".sap-context-quote-label")?.textContent,
        "Selected text 1",
      );
      assert.equal(
        cards[2].querySelector(".sap-context-quote-label")?.textContent,
        "Selected text 3",
      );
      assert.equal(
        cards[0].getBoundingClientRect().top,
        cards[2].getBoundingClientRect().top,
      );
      assert.isBelow(
        cards[0].getBoundingClientRect().right,
        cards[2].getBoundingClientRect().left,
      );
      assert.isAtMost(
        cards[1].querySelector(".sap-context-quote-text").clientHeight,
        72,
      );
      cards[2].querySelector("button").click();
      pane
        .querySelectorAll<HTMLButtonElement>(".sap-context-remove")[1]
        .click();
      assert.lengthOf(pane.querySelectorAll(".sap-context-quote"), 1);
      const title = pane.querySelector<HTMLElement>(".sap-context-title")!;
      const normalTitleHeight = title.clientHeight;
      resizeTo(300);
      assert.isAtLeast(title.clientHeight, normalTitleHeight);
      assert.isAtMost(title.scrollWidth, title.clientWidth);
      submit(pane, "cite");
      stage = "wait for the first streamed chunk";
      await until(
        () =>
          pane.querySelector(".sap-answer-text strong")?.textContent ===
          "Result",
      );
      assert.equal(chat.getState().execution, "executing");
      assert.isNull(
        pane.querySelector(".sap-composer-card .sap-context-quote"),
      );
      const sentQuote = pane.querySelector<HTMLDetailsElement>(
        ".sap-msg-user .sap-sent-selection",
      )!;
      assert.isFalse(sentQuote.open);
      sentQuote.querySelector<HTMLElement>("summary")!.click();
      assert.isTrue(sentQuote.open);
      assert.equal(
        sentQuote.querySelector(".sap-sent-selection-text")?.textContent,
        "alpha page one",
      );
      assert.include(
        sentQuote.querySelector(".sap-sent-selection-source")!.textContent!,
        aTitle,
      );
      stage = "switch to paper B and add its selection";
      const readerB = await open(b);
      attachSelection(readerB, "beta page one", doc);
      assert.equal(
        pane.querySelector(".sap-composer-card .sap-context-quote-text")
          ?.textContent,
        "beta page one",
      );
      await until(
        () =>
          pane.querySelector(".sap-context-title")?.textContent === "Paper B",
      );
      await IOUtils.writeUTF8(PathUtils.join(agent.dir, "paper-switched"), "B");
      await until(() => chat.getState().execution === "idle");
      assert.equal(
        pane.querySelector(".sap-composer-card .sap-context-quote-text")
          ?.textContent,
        "beta page one",
      );
      assert.isTrue(sentQuote.open);
      stage = "resolve and open the citation";
      const read = (await agent.received()).find(
        ({ event }) => event === "pdf-text",
      );
      assert.exists(
        read,
        "the ACP agent called the MCP reader after switching PDFs",
      );
      assert.isNotTrue(read!.result.isError, read!.result.content[0].text);
      const pdf = JSON.parse(read!.result.content[0].text);
      assert.equal(pdf.attachmentKey, a.key);
      assert.equal(pdf.totalPages, 2);
      assert.equal(pdf.extractedPages, 2);
      assert.include(pdf.text, "alpha page one");
      assert.include(pdf.text, "alpha page two");
      assert.notInclude(pdf.text, "beta page");
      const links = pane.querySelectorAll<HTMLAnchorElement>(".sap-citation");
      assert.lengthOf(links, 2);
      const [link, secondLink] = links;
      assert.include(
        pane.querySelector(".sap-answer-text")!.textContent!,
        "Unspecified PDF Unspecified page",
      );
      const transcript = pane.querySelector<HTMLElement>(
        ".sap-chat-transcript",
      )!;
      assert.isAtMost(transcript.scrollWidth, transcript.clientWidth);
      assert.equal(
        link.getAttribute("href"),
        `zotero://open-pdf/library/items/${a.key}?page=2`,
      );
      assert.equal(pane.querySelector(".sap-turn-source")?.textContent, aTitle);
      assert.equal(
        pane.querySelector(".sap-answer-text pre code")?.textContent?.trim(),
        "Source citation",
      );
      link.click();
      const preview = pane.querySelector<HTMLElement>(
        ".sap-answer-source-preview",
      )!;
      assert.include(preview.textContent, "alpha page two");
      assert.include(
        pane.querySelector(".sap-answer-source-summary")?.textContent,
        "2 pages read",
      );
      assert.isNotNull(link.closest(".sap-answer-source-match"));
      preview.querySelector<HTMLAnchorElement>(".sap-source-open")!.click();
      await until(
        () =>
          reader()?.itemID === a.id &&
          reader()?._internalReader?._state?.primaryViewStats?.pageIndex === 1,
      );
      secondLink.click();
      assert.equal(
        preview.querySelector(".sap-source-open")?.getAttribute("href"),
        `zotero://open-pdf/library/items/${alternate.key}?page=2`,
      );
      assert.isNull(preview.querySelector("blockquote"));
      preview.querySelector<HTMLAnchorElement>(".sap-source-open")!.click();
      await until(
        () =>
          reader()?.itemID === alternate.id &&
          reader()?._internalReader?._state?.primaryViewStats?.pageIndex === 1,
      );
      await open(b);
      stage = "send the follow-up on paper B";
      submit(pane, "recall");
      await until(
        () =>
          chat.getState().messages.length === 4 &&
          chat.getState().execution === "idle",
      );
      const received = await agent.received();
      const stale = received.find(({ event }) => event === "stale-pdf-text");
      assert.isTrue(
        stale?.result.isError,
        "a new turn cannot reuse the old turn's PDF access",
      );
      const prompts = received.filter(
        (request) => request.method === "session/prompt",
      );
      assert.lengthOf(prompts, 2);
      assert.equal(prompts[0].params.sessionId, prompts[1].params.sessionId);
      assert.include(
        transcript.textContent!,
        "Earlier result: Source citation",
      );
      const first = JSON.stringify(prompts[0].params.prompt);
      const second = JSON.stringify(prompts[1].params.prompt);
      assert.include(first, aTitle);
      assert.include(first, "alpha page one");
      assert.include(first, `${a.key}?page=1`);
      assert.notInclude(first, "beta page one");
      assert.notInclude(
        first,
        "alpha page two",
        "full text is absent from the prompt",
      );
      assert.include(second, "Paper B");
      assert.include(second, "beta page one");
      assert.include(second, `${b.key}?page=1`);
      assert.notInclude(second, "alpha page one");
      assert.notInclude(
        second,
        "beta page two",
        "full text is absent from the follow-up",
      );
      stage = "use Ask to include an entire previous answer";
      const answer = pane.querySelector<HTMLElement>(
        ".sap-msg-assistant:last-child .sap-answer-text",
      )!;
      answer.scrollIntoView({ block: "center" });
      const range = doc.createRange();
      range.selectNodeContents(answer);
      win.getSelection()!.removeAllRanges();
      win.getSelection()!.addRange(range);
      doc.dispatchEvent(new win.Event("selectionchange"));
      const ask = pane.querySelector<HTMLButtonElement>(".sap-answer-ask")!;
      const selected = win.getSelection()!;
      const bounds = transcript.getBoundingClientRect();
      const highlightBounds = range.getBoundingClientRect();
      assert.isTrue(
        ask.matches(":popover-open"),
        `selection ${selected.rangeCount}/${selected.toString()}, highlight ${highlightBounds?.top}..${highlightBounds?.bottom}, transcript ${bounds.top}..${bounds.bottom}`,
      );
      assert.equal(ask.textContent, "Ask Agent");
      ask.click();
      assert.isFalse(ask.matches(":popover-open"));
      assert.equal(doc.activeElement, pane.querySelector("textarea"));
      assert.equal(
        pane.querySelector(".sap-context-quote-text")?.textContent,
        "Earlier result: Source citation",
      );
      submit(pane, "echo:about the quoted reply");
      await until(
        () =>
          chat.getState().messages.length === 6 &&
          chat.getState().execution === "idle",
      );
      const third = (await agent.received())
        .filter(({ method }) => method === "session/prompt")
        .at(-1)!;
      const sent = JSON.stringify(third.params.prompt);
      assert.include(sent, "previous_agent_answer");
      assert.include(sent, "Earlier result: Source citation");
      const history = pane.querySelectorAll(
        ".sap-msg-user .sap-sent-selection-text",
      );
      assert.equal(history[2].textContent, "Earlier result: Source citation");

      stage = "approve metadata changes from an open PDF";
      const parent = b.parentItem!;
      const revisedCreators = [
        { creatorType: "author", firstName: "Grace", lastName: "Hopper" },
        { creatorType: "author", name: "Research Group" },
        { creatorType: "author", firstName: "Prince", lastName: "" },
      ];
      const revisedFields = {
        title: "Paper B (published)",
        DOI: "10.1000/published",
        date: "2025-03-14",
        publicationTitle: "Fixture Journal",
      };
      submit(
        pane,
        `zotero-tools:${JSON.stringify([
          [
            "propose_zotero_write",
            {
              operation: "update_metadata",
              change: { fields: revisedFields, creators: revisedCreators },
            },
          ],
          ["read_paper_metadata", {}],
        ])}`,
      );
      const review = pane.querySelector<HTMLElement>(".sap-write-review")!;
      await until(
        () =>
          !review.hidden &&
          review.querySelector(".sap-write-metadata-diff ins"),
      );
      assert.equal(
        review.querySelector("h3")?.textContent,
        "Update bibliographic metadata",
      );
      assert.include(
        review.querySelector(".sap-write-metadata-diff del")?.textContent,
        "Paper B",
      );
      assert.include(
        review.querySelector(".sap-write-metadata-diff ins")?.textContent,
        revisedFields.title,
      );
      assert.equal(parent.getField("title"), "Paper B");
      await open(a);
      review.querySelector<HTMLButtonElement>(".sap-write-approve")!.click();
      await until(() => chat.getState().execution === "idle");
      const [updated, after] = (await agent.received())
        .filter(({ event }) => event === "zotero-tool")
        .map(({ result }) => {
          assert.isNotTrue(result.isError, result.content[0].text);
          return JSON.parse(result.content[0].text);
        });
      assert.equal(updated.outcomes[0].status, "applied");
      assert.equal(after.itemKey, parent.key);
      assert.equal(after.title, revisedFields.title);
      assert.deepInclude(after.fields, {
        title: revisedFields.title,
        DOI: revisedFields.DOI,
        publicationTitle: revisedFields.publicationTitle,
      });
      assert.include(after.editableFields, "DOI");
      assert.deepEqual(after.creators, revisedCreators);
      assert.equal(parent.getField("year"), "2025");
      assert.equal(a.parentItem!.getField("title"), aTitle);
      assert.equal(b.parentID, parent.id);

      stage = "convert preprint metadata with approval";
      parent.setType(Zotero.ItemTypes.getID("preprint") as number);
      parent.setField("repository", "Fixture preprint server");
      parent.setField("archiveID", "Fixture preprint ID");
      await parent.saveTx();
      await open(b);
      const proposal = {
        operation: "update_metadata",
        change: {
          itemType: "journalArticle",
          fields: { publicationTitle: "Fixture Journal", volume: "8" },
        },
      };
      submit(
        pane,
        `zotero-tools:${JSON.stringify([
          ["tools/list", {}],
          ["read_paper_metadata", { itemType: "journalArticle" }],
          ["propose_zotero_write", proposal],
          ["read_paper_metadata", {}],
        ])}`,
      );
      await until(() => !review.hidden && review.dataset.phase === "pending");
      assert.include(review.textContent, "Item type");
      assert.include(review.textContent, "Fixture preprint server");
      assert.include(review.textContent, "Fixture Journal");
      assert.equal(Zotero.ItemTypes.getName(parent.itemTypeID), "preprint");
      review.querySelector<HTMLButtonElement>(".sap-write-approve")!.click();
      await until(() => chat.getState().execution === "idle");
      const [catalog, before, conversion, convertedMetadata] = (
        await agent.received()
      )
        .filter(({ event }) => event === "zotero-tool")
        .slice(-4)
        .map(({ name, result }) => {
          if (name === "tools/list") return result;
          assert.isNotTrue(result.isError, result.content[0].text);
          return JSON.parse(result.content[0].text);
        });
      const tool = catalog.tools.find(
        ({ name }: { name: string }) => name === "propose_zotero_write",
      );
      assert.equal(
        tool.inputSchema.properties.change.properties.itemType.type,
        "string",
      );
      assert.equal(before.itemType, "preprint");
      assert.equal(before.editableItemType, "journalArticle");
      assert.includeMembers(before.editableFields, [
        "publicationTitle",
        "volume",
      ]);
      assert.include(before.creatorTypes, "author");
      assert.equal(before.fields.repository, "Fixture preprint server");
      assert.equal(conversion.outcomes[0].status, "applied");
      assert.equal(convertedMetadata.itemType, "journalArticle");
      assert.include(convertedMetadata.editableItemTypes, "preprint");
      assert.deepInclude(convertedMetadata.fields, {
        publicationTitle: "Fixture Journal",
        volume: "8",
      });
      assert.equal(b.parentID, parent.id);
    } catch (error) {
      const stats = reader()?._internalReader?._state?.primaryViewStats;
      throw new Error(
        `${stage}: ${String(error)} (reader ${reader()?.itemID}, page ${stats?.pageIndex}, pages ${stats?.pagesCount}, connection ${chat.getState().connection})`,
        { cause: error },
      );
    } finally {
      if (!pane.hidden) resizeTo(initialWidth);
      for (const item of [a, b]) {
        const tab = win.Zotero_Tabs.getTabIDByItemID(item.id);
        if (tab) win.Zotero_Tabs.close(tab);
      }
      if (!pane.hidden) togglePane();
      await reset();
    }
  });

  it("clears a streaming transcript and sends only the next turn to a remote-backed agent", async function () {
    await reset();
    const local = await makeAgent("local context");
    const remote = await makeAgent("remote context");
    const { Subprocess } = ChromeUtils.importESModule(
      "resource://gre/modules/Subprocess.sys.mjs",
    );
    const server = await Subprocess.call({
      command: remote.profile().command,
      arguments: [
        "-e",
        `require('node:http').createServer(async (request, response) => {
          let body = '';
          for await (const chunk of request) body += chunk;
          response.end(body.includes('Paper with remote context') ? 'Reply from remote backend' : 'Missing paper');
        }).listen(0, '127.0.0.1', function () {
          console.log(this.address().port);
        });`,
      ],
    });
    const win = mainWindow();
    const pane = win.document.getElementById(CHAT_PANE_ID) as XULElement;
    const toggle = () =>
      win.document
        .getElementById(CHAT_TOGGLE_ID)!
        .dispatchEvent(new win.Event("command"));
    let paper: Zotero.Item | undefined;
    try {
      const port = Number((await server.stdout.readString()).trim());
      assert.isAbove(port, 0);
      use(local.profile([], { name: "Local Agent" }));
      saveProfiles([
        local.profile([], { name: "Local Agent" }),
        remote.profile(["--remote-url", `http://127.0.0.1:${port}`], {
          id: "remote",
          name: "Remote Agent",
        }),
      ]);
      paper = await makePaper(local.dir, "Paper with remote context", "remote");
      await Zotero.Reader.open(paper.id);
      if (pane.hidden) toggle();
      const chat = plugin().chat;
      const identity = () => pane.querySelector(".sap-chat-agent")!.textContent;
      await until(() => chat.getState().connection === "connected");
      assert.equal(identity(), "Local Agent");
      submit(pane, "slow:200:50");
      const transcript = pane.querySelector<HTMLElement>(
        ".sap-chat-transcript",
      )!;
      await until(() => transcript.textContent?.includes("chunk 1"));
      pane
        .querySelector<HTMLButtonElement>('[aria-label="New conversation"]')!
        .click();
      assert.isEmpty(transcript.textContent);
      await until(() => chat.getState().connection === "connected");
      pane
        .querySelector<HTMLButtonElement>(".sap-composer-picker-trigger")!
        .click();
      pane
        .querySelector<HTMLButtonElement>('[data-agent-id="remote"]')!
        .click();
      await until(
        () =>
          chat.getState().connection === "connected" &&
          identity() === "Remote Agent",
      );
      assert.isEmpty(transcript.textContent);
      submit(pane, "remote");
      await until(() =>
        transcript.textContent?.includes("Reply from remote backend"),
      );
      assert.notInclude(transcript.textContent!, "late chunk");
      assert.notInclude(transcript.textContent!, "chunk 1");
      assert.lengthOf(
        (await local.received()).filter(
          (request) => request.method === "session/prompt",
        ),
        1,
      );
      assert.lengthOf(
        (await remote.received()).filter(
          (request) => request.method === "session/prompt",
        ),
        1,
      );
    } finally {
      if (paper) {
        const tab = win.Zotero_Tabs.getTabIDByItemID(paper.id);
        if (tab) win.Zotero_Tabs.close(tab);
      }
      if (!pane.hidden) toggle();
      await reset();
      await server.kill(0);
    }
  });
});
