import { assert } from "chai";
import { rewriteMarginaliaDraft } from "../../src/modules/marginalia/agent";
import type { AnnotationSource } from "../../src/modules/marginalia/annotation";
import { makeAgent, plugin, reset, use } from "../helpers";

describe("Marginalia draft actions", function () {
  this.timeout(60_000);

  it("rewrites with the paper chat model in an independent session", async () => {
    await reset();
    const fixture = await makeAgent("Marginalia rewrite");
    use(fixture.profile(["--models"]));
    const { chat } = plugin();
    const source: AnnotationSource = {
      attachmentKey: "ABCDEFGH",
      libraryID: Zotero.Libraries.userLibraryID,
      itemTitle: "A paper with annotations",
      text: "The measured effect varies between regions.",
      pageLabel: "4",
      pageIndex: 3,
      position: { pageIndex: 3, rects: [[10, 20, 30, 40]] },
      color: "#ffd400",
      sortIndex: "00003|000000|00000",
      comment: "The saved comment",
    };
    const draft = "The unsaved annotation draft";
    const abort = new AbortController();

    try {
      assert.isTrue(await chat.connect());
      await chat.selectModel("careful");
      for (const [action, instruction] of [
        ["concise", "Make the draft more concise"],
        ["polish", "Polish the draft"],
        ["expand", "Expand the draft"],
      ] as const) {
        const result = await rewriteMarginaliaDraft(
          chat.selectedAgentModel,
          source,
          draft,
          action,
          abort.signal,
        );
        assert.match(result, /^You said: /);
        assert.include(result, instruction);
      }

      const requests = await fixture.received();
      const sessions = requests.filter(
        ({ method }) => method === "session/new",
      );
      assert.lengthOf(sessions, 4);
      assert.deepEqual(
        sessions.map(({ params }) => params.mcpServers),
        [[], [], [], []],
      );
      const updates = requests.filter(
        ({ method }) => method === "session/set_config_option",
      );
      assert.deepEqual(
        updates.map(({ params }) => params.value),
        ["careful", "careful", "careful", "careful"],
      );
      const prompts = requests.filter(
        ({ method }) => method === "session/prompt",
      );
      assert.lengthOf(prompts, 3);
      assert.lengthOf(
        new Set(prompts.map(({ params }) => params.sessionId)),
        3,
      );
      for (const { params } of prompts) {
        assert.lengthOf(params.prompt, 2);
        assert.deepEqual(JSON.parse(params.prompt[1].text), {
          paper: source.itemTitle,
          page: source.pageLabel,
          highlightedPassage: source.text,
          draft,
        });
      }
      assert.isEmpty(chat.getState().messages);
    } finally {
      abort.abort();
      await reset();
    }
  });
});
