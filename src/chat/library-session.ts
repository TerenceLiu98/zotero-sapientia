import { z } from "zod";
import type { ChatMessage } from "./transcript";
import { logWarn } from "../utils/log";

export interface LibrarySession {
  messages: ChatMessage[];
  profileId: string;
  sessionId: string | null;
}

export const DEFAULT_LIBRARY_THREAD_ID = "default";

const FILE_NAME = "sapientia-library-session.json";
const HISTORY_FILE_NAME = "sapientia-library-history.json";
const THREAD_DIRECTORY = "sapientia-library-threads";
const MAX_RECAP_TURNS = 12;
const MAX_RECAP_BYTES = 48 * 1024;

const threadId = z.union([z.literal(DEFAULT_LIBRARY_THREAD_ID), z.uuid()]);
const threadSummary = z.object({
  id: threadId,
  title: z.string(),
  updatedAt: z.number(),
});
const history = z.object({
  activeThreadId: threadId,
  threads: threadSummary.array(),
});

export type LibraryThreadSummary = z.infer<typeof threadSummary>;

export function createLibraryThreadId(): string {
  return Services.uuid.generateUUID().toString().slice(1, -1);
}

function threadDirectory() {
  return PathUtils.join(PathUtils.profileDir, THREAD_DIRECTORY);
}

function sessionPath(id: string) {
  return threadId.parse(id) === DEFAULT_LIBRARY_THREAD_ID
    ? PathUtils.join(PathUtils.profileDir, FILE_NAME)
    : PathUtils.join(threadDirectory(), `${id}.json`);
}

function historyPath() {
  return PathUtils.join(PathUtils.profileDir, HISTORY_FILE_NAME);
}

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

export async function loadLibrarySession(
  id = DEFAULT_LIBRARY_THREAD_ID,
): Promise<LibrarySession | null> {
  const path = sessionPath(id);
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

let pendingHistoryWrite = Promise.resolve();

function updateHistory(update: () => Promise<void>): Promise<void> {
  const result = pendingHistoryWrite.then(update);
  pendingHistoryWrite = result.catch(() => {});
  return result;
}

async function readHistory(): Promise<z.infer<typeof history>> {
  try {
    if (await IOUtils.exists(historyPath()))
      return history.parse(await IOUtils.readJSON(historyPath()));
  } catch (error) {
    logWarn("Could not read the Library Agent history", error);
  }
  return { activeThreadId: DEFAULT_LIBRARY_THREAD_ID, threads: [] };
}

function summarizeThread(
  id: string,
  messages: readonly ChatMessage[],
  fallbackTime: number,
): LibraryThreadSummary | undefined {
  const first = messages.find((entry) => entry.role === "user");
  const title = first?.text.trim().replace(/\s+/g, " ");
  if (!title) return;
  const latestTurn = messages.findLast(
    (entry) => entry.role === "assistant" && entry.startedAt !== undefined,
  );
  return {
    id,
    title: Array.from(title).slice(0, 100).join(""),
    updatedAt:
      (latestTurn?.role === "assistant" && latestTurn.startedAt) ||
      fallbackTime,
  };
}

export async function loadLibraryHistory(): Promise<z.infer<typeof history>> {
  await pendingHistoryWrite;
  const stored = await readHistory();
  const directory = threadDirectory();
  const paths = (await IOUtils.exists(directory))
    ? await IOUtils.getChildren(directory)
    : [];
  const ids = paths.flatMap((path) => {
    const name = PathUtils.filename(path);
    const id = name.slice(0, -5);
    return name.endsWith(".json") && z.uuid().safeParse(id).success ? [id] : [];
  });
  if (await IOUtils.exists(sessionPath(DEFAULT_LIBRARY_THREAD_ID)))
    ids.push(DEFAULT_LIBRARY_THREAD_ID);
  const indexed = new Map(stored.threads.map((entry) => [entry.id, entry]));
  // A snapshot can reach disk before its summary if Zotero stops during a save.
  const threads = await Promise.all(
    ids.map(async (id) => {
      const known = indexed.get(id);
      if (known) return known;
      const saved = await loadLibrarySession(id);
      if (!saved) return;
      const { lastModified } = await IOUtils.stat(sessionPath(id));
      return summarizeThread(id, saved.messages, lastModified ?? 0);
    }),
  );
  return {
    activeThreadId: stored.activeThreadId,
    threads: threads
      .filter((entry) => entry !== undefined)
      .sort(
        (left, right) =>
          right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
      ),
  };
}

export function setActiveLibraryThread(id: string): Promise<void> {
  const activeThreadId = threadId.parse(id);
  return updateHistory(async () => {
    const stored = await readHistory();
    if (stored.activeThreadId !== activeThreadId)
      await writeJSON(historyPath(), { ...stored, activeThreadId });
  });
}

export async function saveLibrarySession(
  { messages, profileId, sessionId }: LibrarySession,
  id = DEFAULT_LIBRARY_THREAD_ID,
): Promise<void> {
  const path = sessionPath(id);
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
  return updateHistory(async () => {
    const stored = await readHistory();
    const before = stored.threads.find((entry) => entry.id === id);
    const after = summarizeThread(
      id,
      messages,
      before?.updatedAt ?? Date.now(),
    );
    if (id !== DEFAULT_LIBRARY_THREAD_ID)
      await IOUtils.makeDirectory(threadDirectory(), { ignoreExisting: true });
    await writeJSON(path, snapshot);
    if (
      before?.title === after?.title &&
      before?.updatedAt === after?.updatedAt
    )
      return;
    const threads = stored.threads.filter((entry) => entry.id !== id);
    if (after) threads.push(after);
    await writeJSON(historyPath(), { ...stored, threads });
  });
}

async function writeJSON(path: string, snapshot: object): Promise<void> {
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
