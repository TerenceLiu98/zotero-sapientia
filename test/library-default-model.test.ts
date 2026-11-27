import { assert } from "chai";
import {
  getDefaultProfileId,
  getLibraryDefaultModel,
  saveProfiles,
  setDefaultProfileId,
  setLibraryDefaultModel,
} from "../src/agents/store";
import { ChatController } from "../src/chat/controller";
import { createLibraryModelSettings } from "../src/modules/settings/library-model";
import { mainWindow, makeAgent, reset, until } from "./helpers";

describe("the Library Agent default model", function () {
  this.timeout(60000);

  it("saves an exact model in settings and preloads it on session creation and restoration", async () => {
    const win = mainWindow();
    const fixture = await makeAgent("library model");
    const paper = fixture.profile(["--models"], { id: "paper" });
    const library = fixture.profile(["--models"], { id: "library" });
    saveProfiles([paper, library]);
    setDefaultProfileId(paper.id);
    setLibraryDefaultModel(null);
    const settings = createLibraryModelSettings(win.document);
    const chat = new ChatController(undefined, true);
    try {
      settings.render([paper, library]);
      const agent = settings.element.querySelector<HTMLSelectElement>(
        "#sapientia-library-default-agent",
      )!;
      const models = settings.element.querySelector<HTMLSelectElement>(
        "#sapientia-library-default-model",
      )!;
      const edit = settings.element.querySelector<HTMLButtonElement>(
        '[data-library-action="edit"]',
      )!;
      const save = settings.element.querySelector<HTMLButtonElement>(
        '[data-library-action="save"]',
      )!;
      const editor = settings.element.querySelector<HTMLElement>(
        "#sapientia-library-model-editor",
      )!;
      assert.isTrue(editor.hidden);
      assert.equal(edit.getAttribute("aria-expanded"), "false");
      edit.click();
      assert.isFalse(editor.hidden);
      assert.equal(edit.getAttribute("aria-expanded"), "true");
      agent.value = library.id;
      agent.dispatchEvent(new win.Event("change"));
      await until(() => !models.disabled);
      assert.deepEqual(
        Array.from(
          models.options,
          (option) => (option as HTMLOptionElement).value,
        ),
        ["", "fast", "careful"],
      );
      models.value = "careful";
      models.dispatchEvent(new win.Event("change"));
      assert.isNull(getLibraryDefaultModel());
      save.click();
      assert.isTrue(editor.hidden);
      assert.include(
        settings.element.querySelector(".sap-prefs-row-command")!.textContent,
        library.name,
      );
      assert.include(
        settings.element.querySelector(".sap-prefs-row-command")!.textContent,
        models.selectedOptions[0].textContent,
      );
      assert.deepEqual(getLibraryDefaultModel(), {
        profileId: library.id,
        modelId: "careful",
      });
      assert.equal(getDefaultProfileId(), paper.id);
      await chat.warm();
      assert.equal(chat.getState().connection, "connected");
      assert.equal(chat.selectedProfileId, library.id);
      assert.equal(chat.getState().models?.currentId, "careful");
      assert.isTrue(await chat.send("echo:library"));
      const requests = await fixture.received();
      const selected = requests.findIndex(
        ({ method }) => method === "session/set_config_option",
      );
      assert.isAtLeast(selected, 0);
      assert.isBelow(
        selected,
        requests.findIndex(({ method }) => method === "session/prompt"),
      );
      await chat.selectModel("fast");
      assert.equal(chat.getState().models?.currentId, "fast");
      await chat.disconnect();
      await chat.warm();
      assert.equal(chat.getState().models?.currentId, "careful");
      assert.isTrue(
        (await fixture.received()).some(
          ({ method }) => method === "session/load",
        ),
      );
    } finally {
      settings.dispose();
      await chat.shutdown();
      setLibraryDefaultModel(null);
      await reset();
    }
  });
});
