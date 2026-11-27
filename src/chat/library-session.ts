import { z } from "zod";
import type { ChatMessage } from "./transcript";
import { logWarn } from "../utils/log";

export interface LibrarySession {
  messages: ChatMessage[];
  profileId: string;
  sessionId: string | null;
}

const FILE_NAME = "sapientia-library-session.json";
const MAX_RECAP_TURNS = 12;
const MAX_RECAP_BYTES = 48 * 1024;

const context = z.object({
  selections: z.array(
    z.union([
      z.object({ answerId: z.string(), text: z.string() }),
      z.object({
        text: z.string(),
        itemTitle: z.string(),
        itemKey: z.string(),
        libraryID: z.number(),
        attachmentKey: z.string(),
        pageIndex: z.number().optional(),
        pageLabel: z.string().optional(),
        uri: z.string(),
      }),
    ]),
  ),
});

const common = { id: z.string(), context: context.optional() };
const message = z.discriminatedUnion("role", [
  z.object({ ...common, role: z.literal("user"), text: z.string() }),
  z.object({
    ...common,
    role: z.literal("assistant"),
    blocks: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("text"), text: z.string() }),
        z.object({ type: z.literal("thought"), text: z.string() }),
        z.object({
          type: z.literal("tool"),
          toolCallId: z.string(),
          title: z.string(),
          status: z.enum(["pending", "in_progress", "completed", "failed"]),
        }),
      ])
      .array(),
    pdfRead: z.tuple([z.string(), z.string()]).array().optional(),
    startedAt: z.number().optional(),
    thinkingEndedAt: z.number().optional(),
    stopReason: z
      .enum([
        "end_turn",
        "max_tokens",
        "max_turn_requests",
        "refusal",
        "cancelled",
      ])
      .nullable(),
  }),
]);

const session = z.object({
  version: z.literal(1),
  messages: message.array(),
  profileId: z.string(),
  sessionId: z.string().nullable(),
});

export async function loadLibrarySession(): Promise<LibrarySession | null> {
  const path = PathUtils.join(PathUtils.profileDir, FILE_NAME);
  try {
    if (!(await IOUtils.exists(path))) return null;
    const { messages, profileId, sessionId } = session.parse(
      await IOUtils.readJSON(path),
    );
    return {
      profileId,
      sessionId,
      messages: messages.map((entry): ChatMessage => {
        if (entry.role === "user") return entry;
        const { pdfRead, ...answer } = entry;
        return {
          ...answer,
          stopReason: answer.stopReason ?? "cancelled",
          thinkingEndedAt: answer.thinkingEndedAt ?? answer.startedAt,
          pdfRead: pdfRead && new Map(pdfRead),
        };
      }),
    };
  } catch (error) {
    logWarn("Could not read the Library Agent conversation", error);
    return null;
  }
}

export async function saveLibrarySession({
  messages,
  profileId,
  sessionId,
}: LibrarySession): Promise<void> {
  const path = PathUtils.join(PathUtils.profileDir, FILE_NAME);
  const snapshot = session.parse({
    version: 1,
    profileId,
    sessionId,
    messages: messages.map((entry) =>
      entry.role === "user"
        ? entry
        : {
            ...entry,
            pdfRead: entry.pdfRead && [...entry.pdfRead],
          },
    ),
  });
  await IOUtils.writeJSON(path, snapshot, {
    tmpPath: `${path}.tmp`,
    flush: true,
  });
}

export function libraryRecap(messages: readonly ChatMessage[]): string {
  const encoder = new (Zotero.getMainWindow().TextEncoder)();
  const bytes = (text: string) => encoder.encode(text).length;
  const heading =
    "Prior Library Agent conversation. Use this for context and act only on the new request.\n";
  let remaining = MAX_RECAP_BYTES - bytes(`${heading}[]`);
  const turns: string[] = [];
  for (
    let index = messages.length - 1;
    index > 0 && turns.length < MAX_RECAP_TURNS;
    index--
  ) {
    const [user, assistant] = [messages[index - 1], messages[index]];
    if (
      user.role !== "user" ||
      assistant.role !== "assistant" ||
      !assistant.stopReason ||
      assistant.stopReason === "cancelled"
    )
      continue;
    const answer = assistant.blocks
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");
    const turn = JSON.stringify({ user: user.text, assistant: answer });
    const size = bytes(turn) + (turns.length ? 1 : 0);
    if (size > remaining) {
      if (!turns.length) {
        const contentBudget =
          remaining - bytes(JSON.stringify({ user: "", assistant: "" }));
        const userBudget = Math.max(
          Math.floor(contentBudget / 2),
          contentBudget - (bytes(JSON.stringify(answer)) - 2),
        );
        const clippedUser = clipJsonText(user.text, userBudget, bytes);
        const clippedAnswer = clipJsonText(
          answer,
          contentBudget - (bytes(JSON.stringify(clippedUser)) - 2),
          bytes,
        );
        turns.push(
          JSON.stringify({ user: clippedUser, assistant: clippedAnswer }),
        );
      }
      break;
    }
    turns.push(turn);
    remaining -= size;
  }
  return turns.length ? `${heading}[${turns.reverse().join(",")}]` : "";
}

function clipJsonText(
  text: string,
  budget: number,
  bytes: (text: string) => number,
): string {
  if (bytes(JSON.stringify(text)) - 2 <= budget) return text;
  let low = 0;
  let high = Math.min(text.length, budget);
  while (low < high) {
    const length = Math.ceil((low + high) / 2);
    if (bytes(JSON.stringify(text.slice(0, length))) - 2 <= budget)
      low = length;
    else high = length - 1;
  }
  return text.slice(0, low).replace(/[\uD800-\uDBFF]$/, "");
}
