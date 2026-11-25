import { assert } from "chai";
import { saveProfiles } from "../src/agents/store";
import { CHAT_PANE_ID, CHAT_TOGGLE_ID } from "../src/modules/sidebar/section";
import { mainWindow, makeAgent, plugin, reset, until, use } from "./helpers";

/** Write a two-page text PDF with distinct text on each physical page. */
async function makePaper(directory: string, title: string, marker: string) {
  const stream = (text: string) => {
    const content = `BT /F1 14 Tf 40 720 Td (${text}) Tj ET\n`;
    return `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  };
  const page = (streamID: number) =>
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents ${streamID} 0 R >>`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    page(6),
    page(7),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    stream(`${marker} page one`),
    stream(`${marker} page two`),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 8\n0000000000 65535 f \n${offsets.join("")}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  const path = PathUtils.join(directory, `${marker}.pdf`);
  await IOUtils.writeUTF8(path, pdf);
  const item = new Zotero.Item("journalArticle");
  item.setField("title", title);
  item.setField("date", "2024");
  item.setField("DOI", `10.1000/${marker}`);
  item.setCreators([
    { creatorType: "author", firstName: "Ada", lastName: "Bell" },
  ]);
  await item.saveTx();
  return Zotero.Attachments.importFromFile({
    file: path,
    parentItemID: item.id,
  });
}

type Reader = _ZoteroTypes.ReaderInstance;

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
      const link = pane.querySelector<HTMLAnchorElement>(".sap-citation")!;
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
      await until(
        () =>
          reader()?.itemID === a.id &&
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
