import { assert } from "chai";
import {
  createLibraryThreadId,
  loadLibrarySession,
  saveLibrarySession,
} from "../../src/chat/library-session";
import { foldUpdate, type ChatMessage } from "../../src/chat/transcript";
import { redactor } from "../../src/utils/log";

describe("Library Agent run data", () => {
  it("keeps turn updates ordered, redacts previews, and restores the run from disk", async () => {
    const threadId = createLibraryThreadId();
    const startedAt = Date.now();
    const before: ChatMessage[] = [
      {
        role: "assistant",
        id: "1",
        blocks: [],
        stopReason: null,
        startedAt,
      },
    ];
    const release = redactor.retainSecrets(["private-fixture-secret"]);
    let messages = before;
    const update = (value: Parameters<typeof foldUpdate>[1]) => {
      messages = foldUpdate(messages, value, true);
    };
    try {
      update({
        sessionUpdate: "plan",
        entries: [
          { content: "Search", priority: "high", status: "in_progress" },
        ],
      });
      update({
        sessionUpdate: "tool_call",
        toolCallId: "search",
        name: "search_library",
        title: "Search",
        kind: "search",
        status: "in_progress",
        rawInput: { apiKey: "payload-secret", query: "private-fixture-secret" },
      });
      update({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Ready" },
      });
      update({
        sessionUpdate: "tool_call_update",
        toolCallId: "search",
        status: "completed",
        content: [
          {
            type: "content",
            content: { type: "text", text: "x".repeat(5000) },
          },
          {
            type: "content",
            content: {
              type: "resource_link",
              name: "Summary",
              uri: "urn:fixture:summary",
            },
          },
        ],
      });
      update({
        sessionUpdate: "plan",
        entries: [{ content: "Search", priority: "high", status: "completed" }],
      });
      update({
        sessionUpdate: "usage_update",
        used: 16384,
        size: 32768,
        cost: { amount: 3, currency: "credits" },
      });
      const message = messages[0];
      assert.equal(message.role, "assistant");
      if (message.role !== "assistant") throw new Error("No assistant run");
      const run = {
        ...message,
        endedAt: Date.now(),
        stopReason: "end_turn" as const,
      };
      await saveLibrarySession(
        { messages: [run], profileId: "fixture", sessionId: null },
        threadId,
      );
      const restored = (await loadLibrarySession(threadId))?.messages[0];
      assert.equal(restored?.role, "assistant");
      if (restored?.role !== "assistant") throw new Error("No restored run");
      assert.equal(restored.endedAt, run.endedAt);
      assert.deepEqual(restored.plan, [
        { content: "Search", priority: "high", status: "completed" },
      ]);
      assert.deepEqual(restored.usage, {
        used: 16384,
        size: 32768,
        cost: { amount: 3, currency: "credits" },
      });
      const [tool, answer] = restored.blocks;
      assert.equal(answer.type, "text");
      assert.equal(tool.type, "tool");
      if (tool.type !== "tool") throw new Error("No tool call");
      assert.equal(tool.name, "search_library");
      assert.equal(tool.kind, "search");
      assert.equal(tool.status, "completed");
      assert.isAtLeast(tool.endedAt!, tool.startedAt!);
      assert.deepEqual(tool.artifacts, [{ name: "Summary" }]);
      assert.notInclude(tool.input, "payload-secret");
      assert.notInclude(tool.input, "private-fixture-secret");
      assert.equal(tool.output?.length, 4001);
    } finally {
      release();
      await saveLibrarySession(
        { messages: [], profileId: "fixture", sessionId: null },
        threadId,
      );
      await IOUtils.remove(
        PathUtils.join(
          PathUtils.profileDir,
          "sapientia-library-threads",
          `${threadId}.json`,
        ),
        { ignoreAbsent: true },
      );
    }
  });
});
