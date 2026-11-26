import { assert } from "chai";
import { paperMetadata } from "../src/context/paper";
import { CHAT_PANE_ID, CHAT_TOGGLE_ID } from "../src/modules/sidebar/section";
import { mainWindow, makeAgent, plugin, reset, until, use } from "./helpers";

describe("Antigravity tool permissions", function () {
  this.timeout(60000);

  it("runs a Zotero tool only after permission and cancels outstanding requests on Stop", async () => {
    await reset();
    const agent = await makeAgent("antigravity permissions");
    use(
      agent.profile(["--capabilities", '{"mcpCapabilities":{"http":true}}'], {
        id: "detected-antigravity",
        name: "Antigravity fixture",
      }),
    );
    const item = new Zotero.Item("journalArticle");
    item.setField("title", "Synthetic Antigravity fixture");
    item.addTag("antigravity-probe");
    await item.saveTx();

    const chat = plugin().chat;
    const win = mainWindow();
    const pane = win.document.getElementById(CHAT_PANE_ID) as XULElement;
    const toggle = () =>
      win.document
        .getElementById(CHAT_TOGGLE_ID)!
        .dispatchEvent(new win.Event("command"));
    const wasHidden = pane.hidden;
    if (wasHidden) toggle();
    const permission = pane.querySelector<HTMLElement>(
      ".sap-agent-permission",
    )!;
    const ask = () =>
      chat.send('permission-tools:[["read_paper_tags",{}]]', {
        paper: paperMetadata(item),
        selections: [],
      });
    const toolCalls = async () =>
      (await agent.received()).filter(({ event }) => event === "zotero-tool");
    try {
      const approved = ask();
      await until(() => !permission.hidden);
      assert.include(permission.textContent, "read_paper_tags");
      assert.isEmpty(await toolCalls());
      permission
        .querySelector<HTMLButtonElement>(".sap-agent-permission-allow")!
        .click();
      assert.isTrue(await approved);
      const [result] = await toolCalls();
      assert.include(result.result.content[0].text, "antigravity-probe");
      assert.isTrue(permission.hidden);

      const cancelled = ask();
      await until(() => !permission.hidden);
      await chat.stop();
      assert.isTrue(await cancelled);
      assert.isTrue(permission.hidden);
      assert.lengthOf(await toolCalls(), 1);
    } finally {
      if (wasHidden && !pane.hidden) toggle();
      await reset();
    }
  });
});
