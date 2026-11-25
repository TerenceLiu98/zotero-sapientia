import { assert } from "chai";
import {
  saveProfiles,
  setDefaultProfileId,
  getDefaultProfileId,
  loadProfiles,
} from "../src/agents/store";
import { createChatView } from "../src/modules/sidebar/view";
import {
  ADDON_ID,
  chatPaneID,
  chatSections,
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

  const sections = chatSections;
  const panes = () =>
    Zotero.PreferencePanes.pluginPanes.filter(
      (pane) => pane.pluginID === ADDON_ID,
    );

  beforeEach(reset);

  it("comes up and registers its interface exactly once", () => {
    assert.isTrue(plugin().data.initialized);
    assert.lengthOf(sections(), 1);
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
    assert.isEmpty(sections(), "the chat section is gone");
    assert.isEmpty(panes(), "the settings pane is gone");
    await until(async () => !(await isAlive(pid)), { timeout: 8000 });
    assert.isNull(
      mainWindow().document.querySelector("item-pane-custom-section .sap-chat"),
      "the sidebar is gone from the window",
    );

    await addon.enable();

    await until(() => Boolean(Zotero.Sapientia?.data.initialized));
    assert.lengthOf(sections(), 1);
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
        root.querySelector<HTMLButtonElement>(".sap-chat-composer button")!,
      input: () => root.querySelector<HTMLTextAreaElement>("textarea")!,
      notice: () => root.querySelector<HTMLElement>(".sap-chat-notice")!,
      answer: () => root.querySelector(".sap-msg-assistant")?.textContent ?? "",
      questions: () => [...root.querySelectorAll(".sap-msg-user")],
    };
  }

  it("shows the conversation and what the agent is doing", async function () {
    const ui = mount();

    assert.equal(ui.status(), "Not connected");
    assert.equal(ui.sendStop().textContent, "Send");

    use(agent.profile());
    const sending = ui.chat.send("think:hello");
    await until(() => ui.answer().includes("Reading the paper"));

    assert.equal(ui.status(), "Working…");
    assert.equal(ui.sendStop().textContent, "Stop");
    await sending;

    assert.equal(ui.status(), "Connected");
    assert.equal(ui.answer(), "Thinking about it.Reading the paperhello");
    assert.lengthOf(ui.questions(), 1);
    assert.equal(ui.questions()[0].textContent, "think:hello");
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
    assert.equal(ui.sendStop().textContent, "Send");
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
      ".sap-chat-header button:not([hidden])",
    );
    assert.equal(reconnect?.textContent, "Reconnect");
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
    assert.lengthOf(
      doc().querySelectorAll("#sapientia-prefs [role=option]"),
      2,
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

describe("the chat section in the item pane", function () {
  this.timeout(60000);

  it("has an entry in the side navigation and shows the conversation beside the paper", async function () {
    const window = mainWindow();
    const doc = window.document;
    const paneID = chatPaneID();
    const paneSelector = window.CSS.escape(paneID);

    const item = new Zotero.Item("journalArticle");
    item.setField("title", "Attention Is All You Need");
    const itemID = await item.saveTx();
    await window.ZoteroPane.collectionsView.selectLibrary(
      Zotero.Libraries.userLibraryID,
    );
    await window.ZoteroPane.selectItem(itemID);

    await until(() =>
      doc.querySelector(
        `item-pane-custom-section[data-pane="${paneSelector}"] .sap-chat`,
      ),
    );
    assert.isOk(
      doc.querySelector(
        `#zotero-view-item-sidenav .btn[data-pane="${paneSelector}"]`,
      ),
      "the side navigation lists the section",
    );

    // Choosing the entry pins the section, which gives it the pane's full height.
    const sidenav = doc.querySelector(
      "#zotero-view-item-sidenav",
    ) as unknown as { pinnedPane: string };
    sidenav.pinnedPane = paneID;

    const agent = await makeAgent("item pane");
    use(agent.profile());
    const chat = plugin().chat;
    await chat.send("think:Transformers rely on self-attention alone.");
    await chat.send("echo:What is the key result?");

    const section = doc.querySelector(
      `item-pane-custom-section[data-pane="${paneSelector}"]`,
    )!;
    assert.include(section.textContent!, "Reading the paper");
    await reset();
  });
});
