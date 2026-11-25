import { assert } from "chai";
import {
  saveProfiles,
  setDefaultProfileId,
  getDefaultProfileId,
  loadProfiles,
} from "../src/agents/store";
import { CHAT_PANE_ID, CHAT_TOGGLE_ID } from "../src/modules/sidebar/section";
import { createChatView } from "../src/modules/sidebar/view";
import { getString } from "../src/utils/locale";
import {
  ADDON_ID,
  count,
  type FixtureAgent,
  isAlive,
  makeAgent,
  mainWindow,
  plugin,
  PREFS_PANE_ID,
  reset,
  scratch,
  SECRET,
  until,
  use,
} from "./helpers";

function press(
  window: Window,
  target: Element,
  key: string,
  extra: KeyboardEventInit = {},
): void {
  target.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...extra,
    }),
  );
}

function typeInto(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("the plugin in Zotero", function () {
  this.timeout(60000);

  const toggles = () =>
    mainWindow().document.querySelectorAll(`#${CHAT_TOGGLE_ID}`);
  const panes = () =>
    Zotero.PreferencePanes.pluginPanes.filter(
      (pane) => pane.pluginID === ADDON_ID,
    );

  beforeEach(reset);

  it("comes up and registers its interface exactly once", () => {
    assert.isTrue(plugin().data.initialized);
    plugin().hooks.onMainWindowLoad(mainWindow());
    assert.lengthOf(toggles(), 1);
    assert.lengthOf(panes(), 1);
    assert.equal(panes()[0].id, PREFS_PANE_ID);
  });

  it("releases its registrations and ends its agent when disabled, and takes them back when enabled", async function () {
    const agent = await makeAgent("disabled");
    use(agent.profile());
    const chat = plugin().chat;
    void chat.send("slow:200:50");
    await until(() => chat.getState().execution === "executing");
    const pid = (await agent.processes())[0].pid;

    const { AddonManager } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs",
    );
    const addon = await AddonManager.getAddonByID(ADDON_ID);
    assert.isOk(addon, "the plugin is installed");
    await addon.disable();

    await until(() => Zotero.Sapientia === undefined);
    assert.isEmpty(toggles(), "the sidebar toggle is gone");
    assert.isEmpty(panes(), "the settings pane is gone");
    await until(async () => !(await isAlive(pid)), { timeout: 8000 });
    assert.isNull(
      mainWindow().document.getElementById(CHAT_PANE_ID),
      "the sidebar is gone from the window",
    );

    await addon.enable();

    await until(() => Boolean(Zotero.Sapientia?.data.initialized));
    assert.lengthOf(toggles(), 1);
    assert.lengthOf(panes(), 1);
    assert.isTrue(await plugin().chat.connect(), "the plugin works again");
  });
});

describe("the sidebar", function () {
  this.timeout(60000);

  let agent: FixtureAgent;
  let disposeView: (() => void) | undefined;

  beforeEach(async () => {
    await reset();
    agent = await makeAgent("sidebar");
  });

  afterEach(() => {
    disposeView?.();
    disposeView = undefined;
  });

  /** Builds the sidebar in the main window, as the item pane section does. */
  function mount() {
    const container = scratch();
    disposeView = () => container.remove();
    const chat = plugin().chat;
    const view = createChatView(mainWindow().document, chat);
    container.append(view.element);
    disposeView = () => {
      view.destroy();
      container.remove();
    };
    const root = view.element;
    return {
      chat,
      view,
      status: () => root.querySelector(".sap-chat-status")!.textContent!.trim(),
      sendStop: () =>
        root.querySelector<HTMLButtonElement>(".sap-composer-send")!,
      input: () => root.querySelector<HTMLTextAreaElement>("textarea")!,
      notice: () => root.querySelector<HTMLElement>(".sap-chat-notice")!,
      thinking: () => root.querySelector<HTMLDetailsElement>(".sap-thinking")!,
      answer: () =>
        root.querySelector(".sap-answer-text")?.textContent?.trim() ?? "",
      questions: () => [...root.querySelectorAll(".sap-msg-user")],
    };
  }

  it("shows the conversation and what the agent is doing", async function () {
    const ui = mount();

    assert.equal(ui.status(), "Not connected");
    assert.equal(ui.sendStop().getAttribute("aria-label"), "Send");

    use(agent.profile());
    const sending = ui.chat.send("think-slow:hello");
    await until(() =>
      ui.thinking()?.textContent?.includes("Reading the paper"),
    );

    assert.equal(ui.status(), "Working…");
    assert.equal(ui.sendStop().getAttribute("aria-label"), "Stop");
    const thinking = ui.thinking();
    assert.isTrue(thinking.open);
    await until(() =>
      thinking.querySelector(".sap-thinking-time")?.textContent?.includes("1"),
    );
    await until(() => ui.answer() === "hello");
    assert.equal(ui.thinking(), thinking);
    assert.equal(ui.status(), "Working…");
    await sending;

    assert.equal(ui.status(), "Connected");
    assert.equal(ui.answer(), "hello");
    assert.include(ui.thinking().textContent!, "Finished thinking");
    assert.include(ui.thinking().textContent!, "Thinking about it.");
    assert.isFalse(ui.thinking().open);
    assert.lengthOf(ui.questions(), 1);
    assert.equal(ui.questions()[0].textContent, "think-slow:hello");
  });

  it("sends what was typed on Enter, and adds a line on Shift+Enter", async function () {
    const ui = mount();
    const window = mainWindow();

    use(agent.profile());
    assert.isTrue(ui.sendStop().disabled, "there is nothing to send yet");

    typeInto(ui.input(), "first line");
    press(window, ui.input(), "Enter", { shiftKey: true });
    await ui.chat.connect();
    assert.deepEqual(
      ui.chat.getState().messages,
      [],
      "Shift+Enter did not send",
    );

    typeInto(ui.input(), "echo:sent with Enter");
    assert.isFalse(ui.sendStop().disabled);
    press(window, ui.input(), "Enter");

    await until(
      () =>
        ui.chat.getState().messages.length === 2 &&
        ui.chat.getState().execution === "idle",
    );
    assert.equal(ui.input().value, "", "the field is cleared at once");
    const first = ui.chat.getState().messages[0];
    assert.equal(first.role === "user" && first.text, "echo:sent with Enter");
  });

  it("stops the turn from its stop button", async function () {
    const ui = mount();

    use(agent.profile());
    const sending = ui.chat.send("slow:300:20");
    await until(() => ui.chat.getState().execution === "executing");

    ui.sendStop().click();
    assert.equal(ui.status(), "Stopping…");
    assert.isTrue(ui.sendStop().disabled, "Stop cannot be pressed twice");
    await sending;

    assert.equal(ui.status(), "Connected");
    assert.equal(ui.sendStop().getAttribute("aria-label"), "Send");
  });

  it("shows a failure without its credential, keeps the transcript, and offers to reconnect", async function () {
    const ui = mount();

    use(agent.profile());
    await ui.chat.send("crash");

    assert.isFalse(ui.notice().hidden);
    assert.include(ui.notice().textContent!, "exited with code 3");
    assert.include(ui.notice().textContent!, "••••••");
    assert.notInclude(ui.notice().textContent!, SECRET);
    assert.equal(ui.status(), "Connection failed");
    const reconnect = ui.view.element.querySelector<HTMLButtonElement>(
      ".sap-chat-actions button:not([hidden])",
    );
    assert.equal(reconnect?.getAttribute("aria-label"), "Reconnect");
    assert.equal(
      ui.questions()[0].textContent,
      "crash",
      "the transcript stays readable",
    );
  });

  it("stops updating once it is destroyed", async function () {
    const ui = mount();

    use(agent.profile());
    await ui.chat.connect();
    ui.view.destroy();
    await ui.chat.send("echo:unseen");

    assert.isEmpty(ui.view.element.querySelectorAll(".sap-msg"));
  });

  it("renders Markdown, PDF citations, and a copy action on a finished answer", async function () {
    const ui = mount();
    use(agent.profile());
    await ui.chat.send(
      "echo:**Result** [p. 3](zotero://open-pdf/library/items/ABCD1234?page=3) <img src=x> [blocked](zotero://debug/)",
    );

    const view = ui.view.element;
    assert.equal(
      view.querySelector(".sap-answer-text strong")?.textContent,
      "Result",
    );
    assert.equal(
      view.querySelector(".sap-citation")?.getAttribute("href"),
      "zotero://open-pdf/library/items/ABCD1234?page=3",
    );
    assert.lengthOf(view.querySelectorAll(".sap-answer-text a"), 1);
    assert.isNull(view.querySelector(".sap-answer-text img"));
    assert.isNotNull(view.querySelector('button[aria-label="Copy answer"]'));
  });

  it("keeps one question when regenerating the last answer", async function () {
    const ui = mount();
    use(agent.profile());
    await ui.chat.send("echo:try again");
    const previous = ui.view.element.querySelector(".sap-msg-assistant");
    ui.view.element
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Regenerate answer"]',
      )!
      .click();
    await until(
      () =>
        ui.view.element.querySelector(".sap-msg-assistant") !== previous &&
        ui.chat.getState().execution === "idle",
    );
    assert.lengthOf(ui.questions(), 1);
    assert.equal(ui.answer(), "try again");
  });
});

describe("the settings pane", function () {
  this.timeout(60000);

  let window: Window;

  const doc = () => window.document;
  const rows = () => [
    ...doc().querySelectorAll("#sapientia-prefs .sap-prefs-row"),
  ];

  /** The pane's buttons are found by what they do, because their labels are localized. */
  const action = (name: string) => {
    const button = doc().querySelector<HTMLButtonElement>(
      `#sapientia-prefs [data-action="${name}"]`,
    );
    assert.isOk(button, `the pane has a "${name}" button`);
    return button!;
  };
  const field = (name: string) => {
    const input = doc().querySelector<HTMLInputElement>(`#sapientia-${name}`);
    assert.isOk(input, `the pane has a "${name}" field`);
    return input!;
  };

  beforeEach(async () => {
    await reset();
    window = Zotero.Utilities.Internal.openPreferences(PREFS_PANE_ID)!;
    await until(() => doc().querySelector("#sapientia-prefs .sap-prefs"));
  });

  it("lists the saved agents and shows which one is the default", async () => {
    const agent = await makeAgent("settings list");
    saveProfiles([
      agent.profile(["--token", SECRET], { id: "first", name: "First Agent" }),
      agent.profile([], { id: "second", name: "Second Agent" }),
    ]);
    setDefaultProfileId("second");

    await until(() => rows().length === 2);

    assert.deepEqual(
      rows().map(
        (row) => row.querySelector(".sap-prefs-row-name")!.textContent,
      ),
      ["First Agent", "Second Agent"],
    );
    // Arguments are not listed, because they may carry credentials.
    assert.notInclude(
      doc().querySelector("#sapientia-prefs")!.textContent!,
      SECRET,
    );
    assert.equal(
      doc().querySelector<HTMLInputElement>("#sapientia-default-agent")!.value,
      "Second Agent",
    );
  });

  it("adds an agent and keeps its arguments and variable values masked", async () => {
    action("add").click();

    assert.isAbove(field("command").getBoundingClientRect().width, 0);
    assert.isAbove(action("save").getBoundingClientRect().width, 0);
    typeInto(field("name"), "Fixture Agent");
    typeInto(field("command"), "node");
    assert.equal(field("args").type, "password");
    typeInto(field("args"), `serve "two words" --token ${SECRET}`);
    typeInto(field("cwd"), "/tmp");
    action("add-variable").click();
    const [name, value] = [
      ...doc().querySelectorAll<HTMLInputElement>(
        "#sapientia-prefs .sap-prefs-env-row input",
      ),
    ];
    assert.equal(
      value.type,
      "password",
      "a variable's value is not shown on screen",
    );
    typeInto(name, "API_TOKEN");
    typeInto(value, SECRET);
    action("save").click();

    const [saved] = loadProfiles();
    assert.equal(saved.name, "Fixture Agent");
    assert.equal(saved.command, "node");
    assert.deepEqual(saved.args, ["serve", "two words", "--token", SECRET]);
    assert.deepEqual(saved.env, { API_TOKEN: SECRET });
    assert.equal(saved.cwd, "/tmp");
    assert.equal(
      getDefaultProfileId(),
      saved.id,
      "the first agent becomes the default",
    );
    await until(() => rows().length === 1);

    action("edit").click();
    assert.equal(field("args").type, "password");
    assert.include(field("args").value, SECRET);
  });

  it("says what is wrong with the form and saves nothing", async () => {
    action("add").click();

    typeInto(field("command"), "node");
    action("save").click();
    assert.equal(
      doc().querySelector("#sapientia-prefs .sap-prefs-error")!.textContent,
      "Enter a name.",
    );
    assert.equal(field("name").getAttribute("aria-invalid"), "true");

    typeInto(field("name"), "Agent");
    typeInto(field("args"), 'serve "left open');
    action("save").click();
    assert.include(
      doc().querySelector("#sapientia-prefs .sap-prefs-error")!.textContent!,
      "Close every quote",
    );

    assert.deepEqual(loadProfiles(), []);
  });

  it("selects the default agent with the keyboard", async () => {
    const agent = await makeAgent("settings keyboard");
    saveProfiles([
      agent.profile([], { id: "first", name: "First Agent" }),
      agent.profile([], { id: "second", name: "Second Agent" }),
    ]);
    setDefaultProfileId("first");
    await until(() => rows().length === 2);

    const input = doc().querySelector<HTMLInputElement>(
      "#sapientia-default-agent",
    )!;
    input.dispatchEvent(new Event("focus"));
    assert.equal(input.getAttribute("aria-expanded"), "true", "the list opens");
    const choices = doc().querySelectorAll("#sapientia-prefs [role=option]");
    assert.deepEqual(
      [
        choices[0]?.getAttribute("data-value"),
        choices[1]?.getAttribute("data-value"),
      ],
      ["first", "second"],
    );

    press(window, input, "ArrowDown");
    press(window, input, "Enter");

    assert.equal(
      getDefaultProfileId(),
      "second",
      "Enter picks the row the arrow moved to",
    );
    assert.equal(input.value, "Second Agent");
    assert.equal(
      input.getAttribute("aria-expanded"),
      "false",
      "the list closes after picking",
    );
    input.click();
    assert.equal(
      doc()
        .querySelector("#sapientia-prefs [role=option][aria-selected=true]")!
        .getAttribute("data-value"),
      "second",
    );

    typeInto(input, "first");
    assert.lengthOf(
      doc().querySelectorAll("#sapientia-prefs [role=option]"),
      1,
    );
    press(window, input, "Enter");
    assert.equal(getDefaultProfileId(), "first");
  });

  it("removes an agent", async () => {
    const agent = await makeAgent("settings remove");
    saveProfiles([agent.profile([], { name: "Doomed Agent" })]);
    setDefaultProfileId("fixture");
    await until(() => rows().length === 1);

    doc()
      .querySelector<HTMLButtonElement>(
        "#sapientia-prefs [data-action=remove]",
      )!
      .click();

    assert.deepEqual(loadProfiles(), []);
    assert.equal(getDefaultProfileId(), "");
  });
});

describe("the docked chat panel", function () {
  this.timeout(60000);

  it("renders formulas and CJK emphasis across stream events at both sidebar widths", async function () {
    await reset();
    const window = mainWindow();
    const doc = window.document;
    const pane = doc.getElementById(CHAT_PANE_ID) as XULElement;
    const toggle = doc.getElementById(CHAT_TOGGLE_ID)!;
    const togglePane = () => toggle.dispatchEvent(new window.Event("command"));
    const agent = await makeAgent("math answers");
    use(agent.profile());
    togglePane();
    const grip = pane.querySelector<HTMLElement>("[role=separator]")!;
    const initialWidth = Number(grip.getAttribute("aria-valuenow"));
    function resizeTo(target: number) {
      const width = Number(grip.getAttribute("aria-valuenow"));
      for (let offset = Math.abs(width - target); offset > 0; offset -= 20)
        press(window, grip, width < target ? "ArrowLeft" : "ArrowRight");
      assert.equal(grip.getAttribute("aria-valuenow"), String(target));
    }
    const internal = Zotero.Utilities.Internal;
    const originalCopy = internal.copyTextToClipboard;
    try {
      resizeTo(400);
      const chat = plugin().chat;
      const turn = chat.send("math-stream");
      await until(() =>
        pane.querySelector(".sap-answer-text")?.textContent?.includes("Aggre"),
      );
      assert.equal(chat.getState().execution, "executing");
      assert.isTrue(await turn);
      const answer = pane.querySelector<HTMLElement>(".sap-answer-text")!;
      assert.equal(
        answer.querySelector("strong")?.textContent,
        "Aggregator（汇总型）",
      );
      assert.lengthOf(answer.querySelectorAll(".katex"), 4);
      assert.lengthOf(answer.querySelectorAll(".katex-block"), 2);
      assert.include(
        answer.querySelector(".katex-block annotation")!.textContent!,
        "f(x)=\\frac",
      );
      assert.equal(
        answer.querySelector("pre code")?.textContent?.trim(),
        "$code$",
      );
      assert.include(
        answer.textContent!,
        "Price: $5 and $10. Invalid: $\\unknownCommand$.",
      );
      assert.isTrue(answer.textContent!.trimEnd().endsWith("$$"));
      assert.equal(
        answer.querySelector(".sap-citation")?.getAttribute("href"),
        "zotero://open-pdf/library/items/ABCD1234?page=3",
      );

      for (const width of [400, 300]) {
        resizeTo(width);
        const blocks = answer.querySelectorAll<HTMLElement>(".katex-block");
        const longFormula = blocks[1];
        assert.equal(window.getComputedStyle(longFormula)!.overflowX, "auto");
        assert.isAbove(longFormula.scrollWidth, longFormula.clientWidth);
        assert.isAtMost(answer.scrollWidth, answer.clientWidth);
      }
      await doc.fonts.ready;
      assert.isTrue(doc.fonts.check('16px "KaTeX_Main"'));
      const math = answer.querySelector(".katex")!;
      assert.include(window.getComputedStyle(math)!.fontFamily, "KaTeX_Main");
      assert.equal(window.getComputedStyle(answer)!.userSelect, "text");
      const prose = math.parentElement!.firstChild!;
      const range = doc.createRange();
      range.selectNodeContents(prose);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      assert.equal(selection.toString().trim(), "Normal distribution");
      selection.removeAllRanges();
      let copied = "";
      internal.copyTextToClipboard = (text) => (copied = text);
      pane
        .querySelector<HTMLButtonElement>('button[aria-label="Copy answer"]')!
        .click();
      assert.include(copied, String.raw`$X\sim\mathcal N(\mu,\sigma^2)$`);
      assert.equal(copied.split("f(x)=").length, 2);
      assert.include(copied, "$$\nf(x)=");

      assert.isTrue(await chat.send("math-complete"));
      const answers = pane.querySelectorAll<HTMLElement>(".sap-answer-text");
      assert.equal(answers[1].textContent, answer.textContent);
    } finally {
      internal.copyTextToClipboard = originalCopy;
      resizeTo(initialWidth);
      if (!pane.hidden) togglePane();
      await reset();
    }
  });

  it("opens from the tab toolbar and preserves the conversation when reopened", async function () {
    await reset();
    const window = mainWindow();
    const doc = window.document;
    const pane = doc.getElementById(CHAT_PANE_ID) as XULElement;
    const toggle = doc.getElementById(CHAT_TOGGLE_ID)!;
    const togglePane = () => toggle.dispatchEvent(new window.Event("command"));
    assert.equal(
      pane.parentElement,
      doc.getElementById("tabs-deck")!.parentElement,
    );
    assert.equal(
      toggle.parentElement,
      doc.getElementById("zotero-tabs-toolbar"),
    );
    assert.isTrue(pane.hidden, "the sidebar starts closed");
    const agent = await makeAgent("docked chat");
    use(agent.profile(["--models"]));
    togglePane();
    assert.isFalse(pane.hidden);
    assert.equal(toggle.getAttribute("aria-pressed"), "true");

    const composer = pane.querySelector("textarea")!;
    assert.equal(doc.activeElement, composer);
    const focused = window.getComputedStyle(composer)!;
    assert.equal(focused.outlineStyle, "none");
    assert.equal(focused.boxShadow, "none");
    assert.isNull(
      pane.querySelector('.sap-chat-composer [aria-label="Agent settings"]'),
    );
    const grip = pane.querySelector<HTMLElement>("[role=separator]")!;
    assert.equal(grip.getAttribute("aria-valuenow"), "400");
    press(window, grip, "ArrowLeft");
    assert.equal(grip.getAttribute("aria-valuenow"), "420");

    const picker = pane.querySelector<HTMLButtonElement>(
      ".sap-composer-picker-trigger",
    )!;
    await until(() => picker.textContent?.includes("Fixture Fast"));
    const label = picker.querySelector<HTMLElement>(
      ".sap-composer-picker-label",
    )!;
    const send = pane.querySelector<HTMLElement>(".sap-composer-send")!;
    assert.equal(
      label.clientHeight,
      20,
      "a short model name stays on one line",
    );
    assert.isNotNull(picker.querySelector(".sap-composer-picker-icon svg"));
    assert.equal(send.getBoundingClientRect().height, 34);
    assert.equal(count(await agent.received(), "session/prompt"), 0);
    picker.click();
    const list = pane.querySelector<HTMLElement>(".sap-composer-picker-list")!;
    assert.isTrue(list.matches(":popover-open"));
    assert.isAtMost(
      list.getBoundingClientRect().bottom,
      picker.getBoundingClientRect().top,
    );
    list.querySelector<HTMLElement>('[data-model-id="careful"]')!.click();
    await until(() => picker.textContent?.includes("Fixture Careful"));
    for (let step = 0; step < 6; step++) {
      press(window, grip, "ArrowRight");
    }
    assert.equal(grip.getAttribute("aria-valuenow"), "300");
    assert.equal(
      label.textContent,
      "Fixture Careful Research Model with Extended Reasoning",
    );
    assert.isAbove(label.clientHeight, 20, "the selected model wraps");
    assert.isAtMost(
      label.scrollWidth,
      label.clientWidth,
      "the full label fits",
    );
    assert.isAtMost(
      picker.getBoundingClientRect().right,
      send.getBoundingClientRect().left,
    );
    assert.equal(count(await agent.received(), "session/new"), 1);
    await plugin().chat.send("echo:The key result is self-attention.");
    const requests = await agent.received();
    assert.deepEqual(
      requests.map((request) => request.method),
      [
        "initialize",
        "session/new",
        "session/set_config_option",
        "session/prompt",
      ],
    );
    typeInto(composer, "Follow-up draft");
    const closeLabel = getString("action-close-pane");
    const closeButton = pane.querySelector<HTMLButtonElement>(
      `button[aria-label="${window.CSS.escape(closeLabel)}"]`,
    )!;
    closeButton.click();
    assert.isTrue(pane.hidden);
    assert.equal(toggle.getAttribute("aria-pressed"), "false");
    togglePane();
    assert.equal(pane.querySelector("textarea")!.value, "Follow-up draft");
    assert.include(
      pane.querySelector(".sap-msg-assistant")!.textContent!,
      "self-attention",
    );
    const second = await makeAgent("second docked agent");
    saveProfiles([
      agent.profile(["--models"]),
      second.profile(["--models"], { id: "second", name: "Second Agent" }),
    ]);
    picker.click();
    list.querySelector<HTMLElement>('[data-agent-id="second"]')!.click();
    await until(() => picker.textContent?.includes("Fixture Fast"));
    assert.equal(plugin().chat.getState().agentName, "Second Agent");
    assert.equal(count(await second.received(), "session/new"), 1);
    assert.equal(count(await second.received(), "session/prompt"), 0);
    assert.equal(pane.querySelector("textarea")!.value, "Follow-up draft");
    togglePane();
    await reset();
  });
});
