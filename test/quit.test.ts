import { assert } from "chai";
import { CHAT_TOGGLE_ID } from "../src/modules/sidebar/section";
import {
  isAlive,
  mainWindow,
  makeAgent,
  plugin,
  type FixtureAgent,
  reset,
  until,
  use,
} from "./helpers";

// Runs last: after Zotero has quit, the plugin cannot come back within the
// same process, because its registrations are only removed by a real restart.
describe("Zotero quitting", function () {
  this.timeout(60000);

  let agent: FixtureAgent;

  beforeEach(async () => {
    await reset();
    agent = await makeAgent("quit");
  });

  it("ends the agent process while a turn is running", async () => {
    use(agent.profile());
    const chat = plugin().chat;
    void chat.send("slow:200:100");
    await until(() => chat.getState().execution === "executing");
    const pid = (await agent.processes())[0].pid;

    await plugin().hooks.onShutdown({ appShutdown: true });

    assert.isUndefined(Zotero.Sapientia, "the plugin is gone");
    await until(async () => !(await isAlive(pid)), { timeout: 8000 });
    assert.lengthOf(
      mainWindow().document.querySelectorAll(`#${CHAT_TOGGLE_ID}`),
      1,
      "a quitting Zotero leaves the registrations to the restart",
    );
  });
});
