import { assert } from "chai";
import { setLibraryDefaultModel } from "../../src/agents/store";
import { ChatController } from "../../src/chat/controller";
import { createLibraryThreadId } from "../../src/chat/library-session";
import { captureAnnotationSource } from "../../src/modules/marginalia/annotation";
import {
  DEFAULT_SELECTION_PROMPT,
  getSelectionPrompt,
  getSelectionShortcut,
  resolveSelectionPrompt,
  setSelectionPrompt,
  setSelectionShortcut,
} from "../../src/modules/marginalia/shortcut-prefs";
import { createSelectionShortcutRows } from "../../src/modules/marginalia/shortcut-settings";
import {
  mainWindow,
  makeAgent,
  makePaper,
  reset,
  until,
  use,
} from "../helpers";

type Reader = _ZoteroTypes.ReaderInstance<"pdf">;

describe("the PDF selection shortcut", function () {
  this.timeout(60_000);

  afterEach(() => {
    setSelectionShortcut("");
    setSelectionPrompt(DEFAULT_SELECTION_PROMPT);
    setLibraryDefaultModel(null);
  });

  it("records and clears an unassigned shortcut and accepts a replacement prompt", () => {
    const window = mainWindow();
    const settings = window.document.createDocumentFragment();
    settings.append(...createSelectionShortcutRows(window.document));
    const trigger = settings.querySelector<HTMLButtonElement>(
      "#sapientia-selection-shortcut",
    )!;
    const clear = settings.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear shortcut"]',
    )!;
    const prompt = settings.querySelector<HTMLTextAreaElement>(
      "#sapientia-selection-prompt",
    )!;
    assert.equal(trigger.textContent, "Unassigned");
    assert.isTrue(clear.disabled);
    assert.equal(prompt.value, DEFAULT_SELECTION_PROMPT);
    trigger.click();
    trigger.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "U",
        altKey: true,
        shiftKey: true,
      }),
    );
    assert.equal(getSelectionShortcut(), "Alt+Shift+U");
    assert.equal(trigger.textContent, "Alt+Shift+U");
    prompt.value = "Extract all numerical claims, preserving their units.";
    prompt.dispatchEvent(new window.Event("input"));
    assert.equal(getSelectionPrompt(), prompt.value);
    assert.equal(resolveSelectionPrompt("zh-CN"), prompt.value);
    clear.click();
    assert.equal(getSelectionShortcut(), "");
    assert.equal(trigger.textContent, "Unassigned");
  });

  it("runs only a two-block prompt in a fresh session and leaves annotations untouched until editing", async () => {
    await reset();
    const fixture = await makeAgent("PDF selection shortcut");
    const profile = fixture.profile([
      "--models",
      "--capabilities",
      '{"loadSession":true,"mcpCapabilities":{"http":true}}',
    ]);
    use(profile);
    setLibraryDefaultModel({ profileId: profile.id, modelId: "careful" });
    const chat = new ChatController(undefined, true, createLibraryThreadId());
    const attachment = await makePaper(
      fixture.dir,
      "Selection shortcut fixture",
      "selection-shortcut",
    );
    const host = mainWindow();
    const text = "Quoted PDF passage, with punctuation.  第二句话。";
    const close = () =>
      doc
        .querySelector<HTMLButtonElement>(".sap-selection-result header button")
        ?.click();
    await Zotero.Reader.open(attachment.id);
    const reader = Zotero.Reader.getByTabID(
      host.Zotero_Tabs.selectedID,
    ) as Reader;
    await until(
      () =>
        !!reader._internalReader?._primaryView?._iframeWindow?.document.body,
    );
    const doc = reader._iframeWindow!.document;
    const pdfWindow = reader._internalReader._primaryView._iframeWindow!;
    const annotation = {
      type: "highlight",
      text,
      comment: "",
      color: "#ffd400",
      pageLabel: "1",
      sortIndex: "00000|000000|00000",
      position: { pageIndex: 0, rects: [[70, 690, 200, 711]] },
    };
    const state = reader._internalReader._state as unknown as {
      primaryViewSelectionPopup: {
        annotation: typeof annotation;
        rect: number[];
      } | null;
    };
    function selectPassage() {
      state.primaryViewSelectionPopup = {
        annotation,
        rect: [270, 300, 480, 318],
      };
    }
    selectPassage();
    assert.exists(
      captureAnnotationSource(
        reader._item,
        annotation as _ZoteroTypes.Annotations.AnnotationJson,
      ),
      "fixture coordinates resolve to a native annotation source",
    );
    (
      Zotero.Reader as unknown as { _dispatchEvent(event: object): void }
    )._dispatchEvent({
      type: "renderTextSelectionPopup",
      reader,
      doc,
      params: { annotation },
      append: () => {},
    });
    const priorSession = () => chat.getState().messages.length;
    const { event } = ChromeUtils.importESModule(
      "chrome://remote/content/shared/webdriver/Event.sys.mjs",
    );
    const shortcut = () =>
      event.sendSingleKey({ key: "F8", code: "F8", location: 0 }, pdfWindow);
    const result = () => doc.querySelector(".sap-selection-result-content");
    const results = () =>
      doc.querySelector<HTMLElement>(".sap-selection-result-actions");
    const draft = () =>
      doc.querySelector<HTMLFormElement>("form.sap-annotation-draft");
    const prompts = async () =>
      (await fixture.received()).filter(
        ({ method }) => method === "session/prompt",
      );
    try {
      await chat.warm();
      assert.isTrue(
        await chat.send("echo:existing Library Agent conversation"),
      );
      assert.equal(priorSession(), 2);
      const [original] = await prompts();
      shortcut();
      assert.notExists(result());

      setSelectionShortcut("F8");
      const input = pdfWindow.document.createElement("textarea");
      pdfWindow.document.body!.append(input);
      try {
        input.focus();
        shortcut();
        assert.notExists(result());
      } finally {
        input.remove();
      }
      selectPassage();
      pdfWindow.focus();
      selectPassage();
      shortcut();
      await until(() => results()?.hidden === false);
      const [, translation] = await prompts();
      assert.notEqual(translation.params.sessionId, original.params.sessionId);
      assert.deepEqual(translation.params.prompt, [
        { type: "text", text: resolveSelectionPrompt(Zotero.locale) },
        { type: "text", text },
      ]);
      assert.include(
        result()!.textContent,
        resolveSelectionPrompt(Zotero.locale),
      );
      const clipboard = Zotero.Utilities.Internal;
      const originalCopy = clipboard.copyTextToClipboard;
      let copied: string | undefined;
      try {
        clipboard.copyTextToClipboard = (value) => {
          copied = value;
        };
        results()!.querySelector<HTMLButtonElement>("button")!.click();
        assert.equal(copied, result()!.textContent);
      } finally {
        clipboard.copyTextToClipboard = originalCopy;
      }
      close();

      const custom = "Extract numerical claims from the passage.";
      setSelectionPrompt(custom);
      selectPassage();
      shortcut();
      await until(() => results()?.hidden === false);
      const [, , customRequest] = await prompts();
      assert.notEqual(
        customRequest.params.sessionId,
        translation.params.sessionId,
      );
      assert.deepEqual(customRequest.params.prompt, [
        { type: "text", text: custom },
        { type: "text", text },
      ]);
      const requests = await fixture.received();
      const starts = requests.filter(({ method }) => method === "session/new");
      assert.lengthOf(starts, 3);
      assert.isNotEmpty(starts[0].params.mcpServers);
      assert.deepEqual(
        starts.slice(1).map(({ params }) => params.mcpServers),
        [[], []],
      );
      for (const selection of [translation, customRequest]) {
        const configured = requests.findIndex(
          ({ method, params }) =>
            method === "session/set_config_option" &&
            params.sessionId === selection.params.sessionId &&
            params.value === "careful",
        );
        assert.isAtLeast(configured, 0);
        assert.isBelow(
          configured,
          requests.findIndex(
            ({ method, params }) =>
              method === "session/prompt" &&
              params.sessionId === selection.params.sessionId,
          ),
        );
      }
      assert.equal(priorSession(), 2);
      assert.isEmpty(attachment.getAnnotations());
      const add = results()!.querySelectorAll<HTMLButtonElement>("button")[1];
      add.click();
      await until(() =>
        draft()?.querySelector("textarea")?.value.includes(custom),
      );
      assert.isEmpty(attachment.getAnnotations());
      const editor = draft()!;
      editor.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
      await until(() => !draft());
      close();

      setSelectionPrompt("slow:200:20");
      selectPassage();
      shortcut();
      await until(async () => (await prompts()).length === 4);
      close();
      assert.notExists(result());
      assert.isEmpty(attachment.getAnnotations());

      setSelectionPrompt("fail:shortcut fixture failure");
      selectPassage();
      shortcut();
      await until(
        () => result()?.textContent === "The selection request failed.",
      );
      assert.isTrue(results()!.hidden);
      assert.isEmpty(attachment.getAnnotations());
      close();

      setSelectionPrompt(custom);
      selectPassage();
      shortcut();
      await until(() => results()?.hidden === false);
      results()!.querySelectorAll<HTMLButtonElement>("button")[1].click();
      await until(
        () =>
          draft()?.querySelector<HTMLButtonElement>('button[type="submit"]')
            ?.disabled === false,
      );
      const editable = draft()!.querySelector("textarea")!;
      editable.value = "已校对的批注\nSecond line";
      editable.dispatchEvent(new pdfWindow.Event("input"));
      draft()!
        .querySelector<HTMLButtonElement>('button[type="submit"]')!
        .click();
      await until(() =>
        attachment
          .getAnnotations()
          .some(
            (item) => item.annotationComment === "已校对的批注\nSecond line",
          ),
      );
      assert.equal(attachment.getAnnotations()[0].annotationText, text);
    } finally {
      close();
      state.primaryViewSelectionPopup = null;
      host.Zotero_Tabs.close(reader.tabID);
      await chat.shutdown();
      await reset();
    }
  });
});
