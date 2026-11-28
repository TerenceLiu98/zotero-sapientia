import type * as acp from "@agentclientprotocol/sdk";
import type { PaperContext, SelectedText, TagItem } from "../context/paper";
import { redactor } from "../utils/log";

export interface AnswerSelection {
  answerId: string;
  text: string;
}

export type ChatSelection = SelectedText | AnswerSelection;

export interface TurnContext {
  readonly paper?: PaperContext;
  readonly tagItems?: readonly TagItem[];
  readonly selections: readonly ChatSelection[];
  readonly readSelection?: () => SelectedText | undefined;
}

export interface AssistantTool {
  type: "tool";
  toolCallId: string;
  title: string;
  status: acp.ToolCallStatus;
  name?: string;
  kind?: acp.ToolKind;
  startedAt?: number;
  endedAt?: number;
  input?: string;
  output?: string;
  artifacts?: { name: string }[];
}

/** One entry of an assistant message, in the order the agent produced it. */
export type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | AssistantTool;

export interface AssistantMessage {
  id: string;
  role: "assistant";
  blocks: AssistantBlock[];
  context?: TurnContext;
  pdfRead?: ReadonlyMap<string, string>;
  startedAt?: number;
  thinkingEndedAt?: number;
  endedAt?: number;
  /** How the turn ended, once it has. */
  stopReason: acp.StopReason | null;
  plan?: Pick<acp.PlanEntry, "content" | "priority" | "status">[];
  usage?: {
    used: number;
    size: number;
    cost?: Pick<acp.Cost, "amount" | "currency">;
  };
}

export type ChatMessage =
  | { id: string; role: "user"; text: string; context?: TurnContext }
  | AssistantMessage;

type TextBlock = Extract<AssistantBlock, { type: "text" | "thought" }>;
const PREVIEW_LIMIT = 4000;
const TOOL_SECRET_KEY =
  /^(?:(?:proxy[_-]?)?authorization|(?:set[_-]?)?cookie|credentials?|(?:x[_-]?)?api[_-]?key|(?:access|refresh|auth)[_-]?token|password|passwd|secret|token)$/i;

/** Folds one live session update into the assistant's current message. */
export function foldUpdate(
  messages: ChatMessage[],
  update: acp.SessionUpdate,
  library = false,
): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant") return messages;
  const now = Date.now();
  let patch: Partial<AssistantMessage>;
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
    case "agent_thought_chunk": {
      if (update.content.type !== "text") {
        return messages;
      }
      const block: TextBlock = {
        type:
          update.sessionUpdate === "agent_message_chunk" ? "text" : "thought",
        text: update.content.text,
      };
      patch = {
        blocks: appendText(last.blocks, block),
        thinkingEndedAt:
          last.thinkingEndedAt ??
          (last.startedAt && block.type === "text" && block.text.trim()
            ? now
            : undefined),
      };
      break;
    }
    case "tool_call":
    case "tool_call_update":
      patch = { blocks: appendTool(last.blocks, update, library, now) };
      break;
    case "plan":
      if (!library) return messages;
      patch = {
        plan: update.entries.map(({ content, priority, status }) => ({
          content: preview(content),
          priority,
          status,
        })),
      };
      break;
    case "usage_update":
      if (!library) return messages;
      patch = {
        usage: {
          used: update.used,
          size: update.size,
          cost: update.cost
            ? { amount: update.cost.amount, currency: update.cost.currency }
            : last.usage?.cost,
        },
      };
      break;
    default:
      return messages;
  }
  return [...messages.slice(0, -1), { ...last, ...patch }];
}

function appendTool(
  blocks: AssistantBlock[],
  update: acp.ToolCallUpdate,
  library: boolean,
  now: number,
): AssistantBlock[] {
  // An update can arrive without its call having been announced.
  const index = blocks.findIndex(
    (block) => block.type === "tool" && block.toolCallId === update.toolCallId,
  );
  const known = blocks[index] as AssistantTool | undefined;
  const merged: AssistantTool = {
    type: "tool",
    toolCallId: update.toolCallId,
    title: update.title ?? known?.title ?? "",
    status: update.status ?? known?.status ?? "pending",
  };
  if (library) {
    const terminal =
      merged.status === "completed" || merged.status === "failed";
    const content = update.content?.flatMap(({ type, ...entry }) =>
      type === "content" && "content" in entry ? [entry.content] : [],
    );
    const output = content
      ?.flatMap((entry) => (entry.type === "text" ? [entry.text] : []))
      .join("\n");
    Object.assign(merged, {
      title: preview(merged.title),
      name: update.name ? preview(update.name) : known?.name,
      kind: update.kind ?? known?.kind,
      startedAt: known?.startedAt ?? (!terminal ? now : undefined),
      endedAt: terminal ? (known?.endedAt ?? now) : undefined,
      input: rawPreview(update.rawInput) ?? known?.input,
      output:
        (output ? preview(output) : rawPreview(update.rawOutput)) ??
        known?.output,
      artifacts:
        content?.flatMap((entry) =>
          entry.type === "resource_link"
            ? [{ name: preview(entry.title || entry.name) }]
            : [],
        ) ?? known?.artifacts,
    });
  }
  return known
    ? [...blocks.slice(0, index), merged, ...blocks.slice(index + 1)]
    : [...blocks, merged];
}

function appendText(
  blocks: AssistantBlock[],
  block: TextBlock,
): AssistantBlock[] {
  const last = blocks[blocks.length - 1];
  if (last?.type === block.type) {
    return [...blocks.slice(0, -1), { ...last, text: last.text + block.text }];
  }
  return [...blocks, block];
}

function preview(text: string): string {
  const safe = redactor.redact(text);
  return safe.length <= PREVIEW_LIMIT
    ? safe
    : `${safe.slice(0, PREVIEW_LIMIT)}…`;
}

function rawPreview(value: unknown): string | undefined {
  if (value == null) return;
  if (typeof value === "string") return preview(value);
  const json = JSON.stringify(
    value,
    (key, child: unknown) => (TOOL_SECRET_KEY.test(key) ? "••••••" : child),
    2,
  );
  if (json !== undefined) return preview(json);
}
