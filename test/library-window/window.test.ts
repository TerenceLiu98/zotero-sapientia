import { assert } from "chai";
import { loadProfiles, saveProfiles } from "../../src/agents/store";
import { ChatController } from "../../src/chat/controller";
import {
  createLibraryThreadId,
  libraryRecap,
  loadLibrarySession,
  saveLibrarySession,
  setActiveLibraryThread,
} from "../../src/chat/library-session";
import type { ChatMessage } from "../../src/chat/transcript";
import { LIBRARY_BUTTON_ID } from "../../src/modules/library-window";
import { mainWindow, makeAgent, plugin, reset, until, use } from "../helpers";

const sessionFile = () =>
  PathUtils.join(PathUtils.profileDir, "sapientia-library-session.json");
const restartFile = () =>
  PathUtils.join(PathUtils.profileDir, "sapientia-restart-test.json");
const restartPhase = Services.env.get("SAPIENTIA_TEST_LIBRARY_PHASE");
const libraryWindow = () =>
  Array.from(Services.wm.getEnumerator("")).find(
    (window) =>
      window.document.documentElement?.id === "sapientia-library-agent",
  ) as Window | undefined;

async function waitFor(
  description: string,
  condition: () => unknown | Promise<unknown>,
): Promise<void> {
  try {
    await until(condition);
  } catch (cause) {
    throw new Error(`Waiting for ${description}: ${String(cause)}`, { cause });
  }
}

async function openLibraryWindow() {
  const host = mainWindow();
  const button = host.document.getElementById(LIBRARY_BUTTON_ID)!;
  assert.exists(button);
  const icon = button.querySelector(".toolbarbutton-icon")!;
  assert.exists(icon);
  const { width, height } = icon.getBoundingClientRect();
  assert.closeTo(width, 16, 1);
  assert.closeTo(height, 16, 1);
  assert.isAtMost(button.getBoundingClientRect().width, 40);
  button.dispatchEvent(new host.Event("command"));
  await waitFor("the Library Agent composer", () =>
    libraryWindow()?.document.querySelector(".sap-chat-composer"),
  ).catch((cause) => {
    const errors = Services.console
      .getMessageArray()
      .map(({ message }) => message)
      .filter((message) => /sapientia|library.window/i.test(message))
      .slice(-10);
    throw new Error([String(cause), ...errors].join("\n"), { cause });
  });
  const window = libraryWindow()!;
  assert.isAbove(
    window.document.querySelector(".sap-chat-input")!.getBoundingClientRect()
      .height,
    0,
  );
  return window;
}

async function send(window: Window, prompt: string) {
  const input =
    window.document.querySelector<HTMLTextAreaElement>(".sap-chat-input")!;
  input.value = prompt;
  input.dispatchEvent(new window.Event("input"));
  const submit =
    window.document.querySelector<HTMLButtonElement>(".sap-composer-send")!;
  await waitFor(
    "the composer to accept the prompt",
    () => submit.dataset.mode === "send" && !submit.disabled,
  );
  submit.click();
}

const calls = (...requests: unknown[]) =>
  `zotero-tools:${JSON.stringify(requests)}`;
const pendingWrite = 'section.sap-write-review[data-phase="pending"]';

interface RestartCheckpoint {
  pid: number;
  log: string;
  sessionId: string;
  collectionKey: string;
  firstKey: string;
  secondKey: string;
  historyThreadId: string;
}

if (restartPhase === "after") {
  it("continues the Library Agent conversation in a new Zotero process", async function () {
    this.timeout(60000);
    const checkpoint = (await IOUtils.readJSON(
      restartFile(),
    )) as RestartCheckpoint;
    assert.notEqual(Services.appinfo.processID, checkpoint.pid);
    const saved = await loadLibrarySession();
    assert.equal(saved?.sessionId, checkpoint.sessionId);
    assert.equal(saved?.profileId, "fixture");
    assert.equal(
      loadProfiles().find(({ id }) => id === saved?.profileId)?.name,
      "Fixture Agent",
    );
    assert.equal(saved?.messages.at(-1)?.role, "assistant");
    const interrupted = saved?.messages.at(-1);
    assert.equal(
      interrupted?.role === "assistant" && interrupted.stopReason,
      "cancelled",
    );
    const libraryID = Zotero.Libraries.userLibraryID;
    const collection = Zotero.Collections.getByLibraryAndKey(
      libraryID,
      checkpoint.collectionKey,
    );
    if (!collection) throw new Error("The collection did not survive restart.");
    assert.sameMembers(
      collection.getChildItems().map(({ key }) => key),
      [checkpoint.firstKey, checkpoint.secondKey],
    );
    const item = Zotero.Items.getByLibraryAndKey(
      libraryID,
      checkpoint.firstKey,
    );
    if (!item) throw new Error("The paper did not survive restart.");
    assert.equal(item.getField("title"), "Library acceptance preprint A");
    assert.isFalse(item.hasTag("unapproved after restart"));
    const log = async () =>
      (await IOUtils.readUTF8(checkpoint.log))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    const priorCount = (await log()).length;
    const win = await openLibraryWindow();
    try {
      await waitFor(
        "both saved chats after restart",
        () =>
          win.document.querySelector(
            '[data-thread-id="default"][aria-current="true"]',
          ) &&
          win.document
            .querySelector(`[data-thread-id="${checkpoint.historyThreadId}"]`)
            ?.textContent?.includes("Earlier library conversation"),
      );
      assert.include(
        win.document.querySelector(".sap-chat-transcript")?.textContent,
        "Library session continued",
      );
      assert.equal(
        win.document
          .querySelector('[data-permission="approval"]')
          ?.getAttribute("aria-checked"),
        "true",
      );
      assert.notExists(win.document.querySelector(pendingWrite));
      await send(
        win,
        calls(["search_library", { title: "Library acceptance preprint" }]),
      );
      await waitFor("a tool result after a real restart", async () =>
        (await log())
          .slice(priorCount)
          .some(({ event }) => event === "zotero-tool"),
      );
      const entries = (await log()).slice(priorCount);
      assert.isTrue(
        entries.some(
          ({ method, params }) =>
            method === "session/load" &&
            params.sessionId === checkpoint.sessionId,
        ),
      );
      assert.isFalse(entries.some(({ method }) => method === "session/new"));
      assert.lengthOf(
        entries.filter(({ method }) => method === "session/prompt"),
        1,
      );
      const result = entries.find(
        ({ event }) => event === "zotero-tool",
      ).result;
      assert.isNotTrue(result.isError, result.content[0].text);
      assert.sameMembers(
        JSON.parse(result.content[0].text).items.map(
          ({ itemKey }: { itemKey: string }) => itemKey,
        ),
        [checkpoint.firstKey, checkpoint.secondKey],
      );
      assert.isFalse(item.hasTag("unapproved after restart"));
    } finally {
      win.close();
    }
  });
}

if (restartPhase !== "after")
  describe("Library Agent window", function () {
    this.timeout(60000);

    it("finds papers, approves collection and evidence-backed writes, undoes a change, and keeps its own session", async () => {
      await reset();
      await IOUtils.remove(sessionFile(), { ignoreAbsent: true });
      const fixture = await makeAgent("library window");
      const profile = fixture.profile([
        "--capabilities",
        '{"loadSession":true,"mcpCapabilities":{"http":true}}',
      ]);
      use(profile);

      const first = new Zotero.Item("journalArticle");
      first.setField("title", "Library acceptance preprint A");
      await first.saveTx();
      const second = new Zotero.Item("journalArticle");
      second.setField("title", "Library acceptance preprint B");
      await second.saveTx();

      const host = mainWindow();
      const win = await openLibraryWindow();
      let restartReady = false;
      let stage = "focus the existing window";
      const logs = async () =>
        (await fixture.received()).filter(
          ({ event }) => event === "zotero-tool",
        );
      const resolved = async (count: number) => {
        await waitFor(
          `tool result ${count}`,
          async () => (await logs()).length === count,
        );
        const { result } = (await logs())[count - 1];
        assert.isNotTrue(result.isError, result.content[0].text);
        return JSON.parse(result.content[0].text);
      };
      const approve = async (inspect?: (card: HTMLElement) => void) => {
        const card =
          win.document.querySelector<HTMLElement>(".sap-write-review")!;
        await waitFor(
          "a pending write review",
          () => card.dataset.phase === "pending",
        );
        inspect?.(card);
        card.querySelector<HTMLButtonElement>(".sap-write-approve")!.click();
      };

      try {
        assert.strictEqual(await openLibraryWindow(), win);
        stage = "search the library";
        await send(
          win,
          calls(["search_library", { title: "Library acceptance preprint" }]),
        );
        const found = await resolved(1);
        assert.sameMembers(
          found.items.map(({ itemKey }: { itemKey: string }) => itemKey),
          [first.key, second.key],
        );

        stage = "create a collection";
        await send(
          win,
          calls([
            "propose_zotero_write",
            {
              operations: [
                {
                  operation: "create_collection",
                  change: { name: "Library acceptance" },
                },
              ],
            },
          ]),
        );
        await approve();
        const created = await resolved(2);
        const collectionKey = created.outcomes[0].target.collectionKey;
        assert.isString(collectionKey);

        stage = "approve collection membership and metadata";
        await send(
          win,
          calls([
            "propose_zotero_write",
            {
              operations: [
                {
                  operation: "add_to_collection",
                  itemKey: first.key,
                  change: { collectionKey },
                },
                {
                  operation: "add_to_collection",
                  itemKey: second.key,
                  change: { collectionKey },
                },
                {
                  operation: "update_metadata",
                  itemKey: first.key,
                  change: {
                    fields: { title: "Verified library acceptance article" },
                    evidence: [
                      {
                        url: "https://example.com/fixture",
                        summary: "Publisher fixture confirms the final title",
                      },
                    ],
                  },
                },
              ],
            },
          ]),
        );
        await approve((card) => {
          assert.include(card.textContent, "Library acceptance preprint A");
          assert.include(
            card.textContent,
            "Verified library acceptance article",
          );
          assert.include(
            card.textContent,
            "Publisher fixture confirms the final title",
          );
        });
        const applied = await resolved(3);
        assert.deepEqual(
          applied.outcomes.map(({ status }: { status: string }) => status),
          ["applied", "applied", "applied"],
        );
        const collection = Zotero.Collections.getByLibraryAndKey(
          first.libraryID,
          collectionKey,
        );
        assert.isOk(collection);
        if (!collection) throw new Error("The collection was not created.");
        assert.sameMembers(
          collection.getChildItems().map(({ id }) => id),
          [first.id, second.id],
        );
        assert.equal(
          first.getField("title"),
          "Verified library acceptance article",
        );

        stage = "undo the metadata correction";
        win.document
          .querySelector<HTMLButtonElement>(
            'button[aria-label="Write history"]',
          )!
          .click();
        const undo = () =>
          Array.from<HTMLElement>(
            win.document.querySelectorAll<HTMLElement>(
              ".sap-write-history-row",
            ),
          )
            .find((entry) =>
              entry.textContent?.includes("Update bibliographic metadata"),
            )
            ?.querySelector<HTMLButtonElement>("button");
        await waitFor("the metadata entry in write history", undo);
        undo()!.click();
        await waitFor(
          "the original title after undo",
          () => first.getField("title") === "Library acceptance preprint A",
        );

        stage = "switch the paper sidebar's agent";
        const sidebar = await makeAgent("independent sidebar");
        saveProfiles([
          profile,
          sidebar.profile([], { id: "other", name: "Paper sidebar" }),
        ]);
        await host.ZoteroPane.selectItem(second.id);
        await plugin().chat.selectAgent("other");
        assert.include(
          win.document.querySelector(".sap-chat-agent")?.textContent,
          profile.name,
        );
        await waitFor("a saved session ID", async () =>
          Boolean((await loadLibrarySession())?.sessionId),
        );
        const saved = (await loadLibrarySession())!;
        assert.equal(saved.profileId, profile.id);
        assert.isAtLeast(saved.messages.length, 6);
        stage = "close and reopen the Library Agent";
        win.close();
        await waitFor(
          "the Library Agent window to close",
          () => !libraryWindow(),
        );

        const reopened = await openLibraryWindow();
        assert.isFalse(reopened === win);
        assert.include(
          reopened.document.querySelector(".sap-chat-transcript")?.textContent,
          "Finished Zotero tool calls.",
        );
        await send(reopened, "echo:Library session continued");
        await waitFor("the reply after reopening", () =>
          reopened.document
            .querySelector(".sap-msg-assistant:last-child")
            ?.textContent?.includes("Library session continued"),
        );
        await waitFor("the ACP session load after reopening", async () =>
          (await fixture.received()).some(
            ({ method, params }) =>
              method === "session/load" && params.sessionId === saved.sessionId,
          ),
        );
        if (restartPhase === "before") {
          stage = "leave a write pending during shutdown";
          const historyThreadId = createLibraryThreadId();
          await saveLibrarySession(
            {
              profileId: profile.id,
              sessionId: null,
              messages: [
                { id: "1", role: "user", text: "Earlier library conversation" },
                {
                  id: "2",
                  role: "assistant",
                  blocks: [{ type: "text", text: "Earlier answer" }],
                  stopReason: "end_turn",
                },
              ],
            },
            historyThreadId,
          );
          await send(
            reopened,
            calls([
              "propose_zotero_write",
              {
                operations: [
                  {
                    operation: "add_tags",
                    itemKey: first.key,
                    change: { tags: ["unapproved after restart"] },
                  },
                ],
              },
            ]),
          );
          await waitFor("an unapproved write before shutdown", () =>
            reopened.document.querySelector(pendingWrite),
          );
          const direct = reopened.document.querySelector<HTMLButtonElement>(
            '[data-permission="direct"]',
          )!;
          direct.click();
          assert.equal(direct.getAttribute("aria-checked"), "true");
          assert.exists(reopened.document.querySelector(pendingWrite));
          await IOUtils.writeJSON(
            restartFile(),
            {
              pid: Services.appinfo.processID,
              log: fixture.log,
              sessionId: saved.sessionId!,
              collectionKey,
              firstKey: first.key,
              secondKey: second.key,
              historyThreadId,
            } satisfies RestartCheckpoint,
            { flush: true },
          );
          restartReady = true;
          fixture.keepUntilZoteroShutdown();
        }
      } catch (cause) {
        throw new Error(
          `Could not ${stage}: ${String(cause)}\n${(cause as Error)?.stack ?? ""}`,
          { cause },
        );
      } finally {
        if (!restartReady) {
          libraryWindow()?.close();
          await reset();
        }
      }
    });

    if (restartPhase === "before") return;

    it("opens past conversations from the sidebar and remembers the selected chat", async () => {
      await reset();
      const fixture = await makeAgent("library thread history");
      const profile = fixture.profile([
        "--capabilities",
        '{"loadSession":true,"mcpCapabilities":{"http":true}}',
      ]);
      use(profile);
      const firstId = createLibraryThreadId();
      await saveLibrarySession(
        {
          profileId: profile.id,
          sessionId: null,
          messages: [
            { id: "1", role: "user", text: "First library conversation" },
            {
              id: "2",
              role: "assistant",
              blocks: [{ type: "text", text: "The first saved answer" }],
              stopReason: "end_turn",
            },
          ],
        },
        firstId,
      );
      await setActiveLibraryThread(firstId);
      const win = await openLibraryWindow();
      const document = win.document;
      const row = (id: string) =>
        document.querySelector<HTMLButtonElement>(`[data-thread-id="${id}"]`);
      const transcript = () => document.querySelector(".sap-chat-transcript")!;
      const selectedId = () =>
        document.querySelector<HTMLButtonElement>(
          "[data-thread-id][aria-current='true']",
        )?.dataset.threadId;
      try {
        assert.include(transcript().textContent, "The first saved answer");
        document
          .querySelector<HTMLButtonElement>(".sap-library-new-chat")!
          .click();
        await waitFor("the new chat landing view", () =>
          document.querySelector(
            '.sap-library-chat[data-empty="true"] .sap-chat-input',
          ),
        );
        const draft =
          document.querySelector<HTMLTextAreaElement>(".sap-chat-input")!;
        const surface = document
          .querySelector(".sap-library-surface")!
          .getBoundingClientRect();
        const composerElement = document.querySelector(".sap-chat-composer")!;
        const composer = composerElement.getBoundingClientRect();
        const card = win.getComputedStyle(composerElement)!;
        assert.closeTo(
          composer.left + composer.width / 2,
          surface.left + surface.width / 2,
          2,
        );
        assert.equal(card.borderTopWidth, "1px");
        assert.equal(card.borderTopLeftRadius, "20px");
        assert.notEqual(card.borderTopColor, "rgba(0, 0, 0, 0)");
        assert.notEqual(card.backgroundColor, "rgba(0, 0, 0, 0)");
        document
          .querySelector<HTMLButtonElement>(".sap-library-shortcuts button")!
          .click();
        assert.include(draft.value, "Find papers");
        assert.isUndefined(selectedId());
        const history = document.getElementById("sap-library-history")!;
        const toggle = document.querySelector<HTMLButtonElement>(
          ".sap-library-history-toggle",
        )!;
        const surfaceWidth = () =>
          document
            .querySelector(".sap-library-surface")!
            .getBoundingClientRect().width;
        const expandedWidth = surfaceWidth();
        toggle.click();
        assert.equal(toggle.getAttribute("aria-expanded"), "false");
        assert.equal(history.getBoundingClientRect().height, 0);
        assert.isAbove(surfaceWidth(), expandedWidth);
        assert.include(draft.value, "Find papers");
        toggle.click();
        assert.equal(toggle.getAttribute("aria-expanded"), "true");
        assert.closeTo(surfaceWidth(), expandedWidth, 1);
        assert.include(draft.value, "Find papers");
        await send(win, "echo:The second conversation");
        await waitFor(
          "the new chat's history row and reply",
          () =>
            Boolean(selectedId()) &&
            transcript()
              .querySelector(".sap-msg-assistant")
              ?.textContent?.includes("The second conversation"),
        );
        const secondId = selectedId()!;
        assert.notEqual(secondId, firstId);
        row(firstId)!.click();
        await waitFor("the first chat's saved transcript", () =>
          transcript()?.textContent?.includes("The first saved answer"),
        );
        assert.notInclude(transcript().textContent, "The second conversation");
        row(secondId)!.click();
        await waitFor("the second chat's saved transcript", () =>
          transcript()?.textContent?.includes("The second conversation"),
        );
        assert.notInclude(transcript().textContent, "The first saved answer");
        win.close();
        await waitFor(
          "the Library Agent window to close",
          () => !libraryWindow(),
        );
        const reopened = await openLibraryWindow();
        assert.include(
          reopened.document.querySelector(".sap-chat-transcript")?.textContent,
          "The second conversation",
        );
        await waitFor("the selected entry in reopened history", () =>
          reopened.document.querySelector(
            `[data-thread-id="${secondId}"][aria-current="true"]`,
          ),
        );
      } finally {
        libraryWindow()?.close();
        await reset();
      }
    });

    for (const expired of [true, false]) {
      const scenario = expired ? "an expired" : "an unsupported";
      it(`continues locally saved history after ${scenario} ACP session`, async () => {
        await reset();
        const fixture = await makeAgent(scenario);
        const profile = fixture.profile([
          "--capabilities",
          JSON.stringify({
            loadSession: expired,
            mcpCapabilities: { http: true },
          }),
        ]);
        use(profile);
        await saveLibrarySession({
          profileId: profile.id,
          sessionId: "old-library-session",
          messages: [
            { id: "1", role: "user", text: "Previous library question" },
            {
              id: "2",
              role: "assistant",
              blocks: [{ type: "text", text: "Previous library answer" }],
              stopReason: "end_turn",
            },
            { id: "3", role: "user", text: "Unfinished library write" },
            { id: "4", role: "assistant", blocks: [], stopReason: null },
          ],
        });
        const chat = new ChatController(undefined, true);
        try {
          await chat.loadLibrary();
          assert.lengthOf(chat.getState().messages, 4);
          const interrupted = chat.getState().messages[3];
          assert.equal(
            interrupted.role === "assistant" && interrupted.stopReason,
            "cancelled",
          );
          assert.isTrue(await chat.send("echo:next question"));
          assert.isTrue(await chat.send("echo:second question"));
          const entries = await fixture.received();
          assert.lengthOf(
            entries.filter(({ method }) => method === "session/load"),
            expired ? 1 : 0,
          );
          assert.lengthOf(
            entries.filter(({ method }) => method === "session/new"),
            1,
          );
          const prompts = entries
            .filter(({ method }) => method === "session/prompt")
            .map(({ params }) =>
              params.prompt
                .map(({ text }: { text: string }) => text)
                .join("\n"),
            );
          assert.lengthOf(prompts, 2);
          assert.include(prompts[0], "Previous library question");
          assert.include(prompts[0], "Previous library answer");
          assert.notInclude(prompts[0], "Unfinished library write");
          assert.notInclude(prompts[1], "Previous library question");
          assert.lengthOf(chat.getState().messages, 8);
        } finally {
          await chat.shutdown();
          await reset();
        }
      });
    }

    it("bounds the restart recap to 12 turns and 48 KiB of UTF-8", () => {
      const turns = Array.from({ length: 14 }, (_, i): ChatMessage[] => [
        { id: `u${i}`, role: "user", text: `question-${i}` },
        {
          id: `a${i}`,
          role: "assistant",
          blocks: [{ type: "text", text: `answer-${i}` }],
          stopReason: "end_turn",
        },
      ]);
      const recap = libraryRecap(turns.flat());
      assert.lengthOf(JSON.parse(recap.slice(recap.indexOf("\n") + 1)), 12);
      assert.notInclude(recap, '"question-1"');
      assert.include(recap, '"question-13"');
      const large = libraryRecap([
        { id: "u", role: "user", text: "\u6587".repeat(30000) },
        {
          id: "a",
          role: "assistant",
          blocks: [{ type: "text", text: "\u6230".repeat(30000) }],
          stopReason: "end_turn",
        },
      ]);
      assert.isAtMost(
        new (mainWindow().TextEncoder)().encode(large).length,
        48 * 1024,
      );
    });
  });
