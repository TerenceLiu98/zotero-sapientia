import { assert } from "chai";
import { CHAT_PANE_ID } from "../src/modules/sidebar/section";
import {
  mainWindow,
  makeAgent,
  makePaper,
  plugin,
  reset,
  until,
  use,
} from "./helpers";

const passage = "The marked evidence";
const position = { pageIndex: 0, rects: [[40, 715, 165, 734]] };
const cancelSelector = '.sap-annotation-draft button[type="button"]';
const saveSelector = '.sap-annotation-draft button[type="submit"]';

async function open(attachment: Zotero.Item) {
  const win = mainWindow();
  await Zotero.Reader.open(attachment.id);
  const active = () => Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);
  await until(() => active()?.itemID === attachment.id);
  return active()!;
}

function askFrom(
  reader: _ZoteroTypes.ReaderInstance,
  type: "renderTextSelectionPopup" | "renderSidebarAnnotationHeader",
  annotation: object,
) {
  const buttons: HTMLButtonElement[] = [];
  (
    Zotero.Reader as unknown as { _dispatchEvent(event: object): void }
  )._dispatchEvent({
    type,
    reader,
    doc: mainWindow().document,
    params: { annotation },
    append: (button: HTMLButtonElement) => buttons.push(button),
  });
  const ask = buttons.find(({ textContent }) => textContent === "Ask Agent");
  assert.exists(ask);
  ask!.click();
}

function pane() {
  return mainWindow().document.getElementById(CHAT_PANE_ID)!;
}

function draft() {
  return mainWindow().document.querySelector<HTMLTextAreaElement>(
    ".sap-annotation-draft textarea",
  );
}

async function submit(prompt: string, answer: string) {
  const input = pane().querySelector<HTMLTextAreaElement>(".sap-chat-input")!;
  const send = pane().querySelector<HTMLButtonElement>(".sap-composer-send")!;
  input.value = prompt;
  input.dispatchEvent(new (mainWindow().Event)("input"));
  await until(() => !send.disabled);
  send.click();
  await until(
    () =>
      plugin().chat.getState().messages.at(-1)?.role === "assistant" &&
      plugin().chat.getState().execution === "idle" &&
      pane()
        .querySelector(".sap-chat-transcript")
        ?.textContent?.includes(answer),
  );
}

function click(selector: string) {
  mainWindow().document.querySelector<HTMLButtonElement>(selector)!.click();
}

describe("saving Reader conversations to Zotero annotations", function () {
  this.timeout(60000);

  it("asks from a native underline and appends a reply only after Save", async () => {
    await reset();
    const fixture = await makeAgent("annotation answer");
    use(fixture.profile());
    const paper = await makePaper(
      fixture.dir,
      "Existing underline",
      "annotation-underline",
      { pages: [passage] },
    );
    const mark = new Zotero.Item("annotation");
    mark.libraryID = paper.libraryID;
    mark.parentID = paper.id;
    mark.annotationType = "underline";
    mark.annotationColor = "#2ea8e5";
    mark.annotationText = passage;
    mark.annotationComment = "Earlier comment\n第二行";
    mark.annotationPageLabel = "1";
    mark.annotationSortIndex = "00000|000000|00000";
    mark.annotationPosition = JSON.stringify(position);
    await mark.saveTx();
    try {
      const reader = await open(paper);
      const ask = () =>
        askFrom(reader, "renderSidebarAnnotationHeader", { id: mark.key });
      ask();
      assert.include(
        pane().querySelector(".sap-context-quote")?.textContent,
        passage,
      );
      assert.notInclude(
        pane().querySelector(".sap-context-quote")?.textContent,
        "Earlier comment",
      );
      const input =
        pane().querySelector<HTMLTextAreaElement>(".sap-chat-input")!;
      assert.match(input.value, /^Earlier comment\n第二行\n\n/);
      input.value = "What does this mean?";
      ask();
      ask();
      assert.equal(
        input.value,
        "Earlier comment\n第二行\n\nWhat does this mean?",
      );
      assert.equal(input.selectionStart, input.value.length);
      await submit("echo:**First answer**", "First answer");
      const sent = (await fixture.received()).find(
        ({ method }) => method === "session/prompt",
      )!;
      const excerpts = sent.params.prompt.find(({ text }: { text?: string }) =>
        text?.includes("Excerpts the user added"),
      );
      assert.exists(excerpts);
      assert.deepInclude(
        JSON.parse(excerpts.text.slice(excerpts.text.indexOf("\n") + 1))[0],
        {
          text: passage,
          title: "Existing underline",
          page: 1,
          pageLabel: "1",
        },
      );
      click('[aria-label="Add answer to annotation"]');
      await until(() => draft()?.readOnly === false);
      assert.equal(draft()?.value, "Earlier comment\n第二行\n\nFirst answer");
      click(cancelSelector);
      await until(() => !draft());
      assert.equal(mark.annotationComment, "Earlier comment\n第二行");
      click('[aria-label="Add answer to annotation"]');
      await until(() => draft()?.readOnly === false);
      draft()!.value += "\nReviewed.";
      click(saveSelector);
      await until(() => !draft());
      assert.equal(
        mark.annotationComment,
        "Earlier comment\n第二行\n\nFirst answer\nReviewed.",
      );
      assert.equal(mark.annotationType, "underline");
      assert.equal(mark.annotationColor, "#2ea8e5");
      assert.equal(mark.annotationText, passage);
      assert.deepEqual(JSON.parse(mark.annotationPosition), position);

      mark.deleted = true;
      await mark.saveTx();
      click(".sap-save-conversation");
      await until(() =>
        mainWindow().document.querySelector(
          ".sap-annotation-draft [role=alert]:not([hidden])",
        ),
      );
      assert.include(draft()?.value, "User:\necho:**First answer**");
      assert.isTrue(
        mainWindow().document.querySelector<HTMLButtonElement>(saveSelector)!
          .disabled,
      );
      assert.include(
        pane().querySelector(".sap-chat-transcript")?.textContent,
        "First answer",
      );
      click(cancelSelector);
    } finally {
      await reset();
    }
  });

  it("previews a whole visible conversation and saves to the original PDF after switching tabs", async () => {
    await reset();
    const fixture = await makeAgent("annotation transcript");
    use(fixture.profile());
    const first = await makePaper(
      fixture.dir,
      "Original PDF",
      "annotation-original",
      { pages: [passage] },
    );
    const other = await makePaper(fixture.dir, "Other PDF", "annotation-other");
    try {
      askFrom(await open(first), "renderTextSelectionPopup", {
        text: passage,
        pageLabel: "1",
        position,
        color: "#ffd400",
      });
      await submit("echo:First answer", "First answer");
      await submit("echo:Second answer", "Second answer");
      await open(other);
      click(".sap-save-conversation");
      await until(() => draft()?.readOnly === false);
      const preview = draft()!.value;
      assert.equal(
        preview,
        "User:\necho:First answer\n\nAgent:\nFirst answer\n\nUser:\necho:Second answer\n\nAgent:\nSecond answer",
      );
      assert.include(
        mainWindow().document.querySelector(".sap-annotation-draft")
          ?.textContent,
        "Original PDF",
      );
      assert.equal(
        mainWindow().document.querySelector(".sap-annotation-draft blockquote")
          ?.textContent,
        passage,
      );
      assert.lengthOf(first.getAnnotations(), 0);
      click(saveSelector);
      await until(() => !draft());
      const saved = first.getAnnotations()[0];
      assert.exists(saved);
      assert.equal(saved.annotationType, "highlight");
      assert.equal(saved.annotationText, passage);
      assert.equal(saved.annotationComment, preview);
      assert.deepEqual(JSON.parse(saved.annotationPosition), position);
      assert.lengthOf(other.getAnnotations(), 0);
    } finally {
      await reset();
    }
  });
});
