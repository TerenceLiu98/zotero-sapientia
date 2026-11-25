import type * as acp from "@agentclientprotocol/sdk";
import type { PaperContext, SelectedText } from "../context/paper";

export interface AnswerSelection {
  answerId: string;
  text: string;
}

export type ChatSelection = SelectedText | AnswerSelection;

export interface TurnContext {
  readonly paper?: PaperContext;
  readonly selections: readonly ChatSelection[];
}

/** One entry of an assistant message, in the order the agent produced it. */
export type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | {
      type: "tool";
      toolCallId: string;
      title: string;
      status: acp.ToolCallStatus;
    };

export type ChatMessage =
  | { id: string; role: "user"; text: string; context?: TurnContext }
  | {
      id: string;
      role: "assistant";
      blocks: AssistantBlock[];
      context?: TurnContext;
      startedAt?: number;
      thinkingEndedAt?: number;
      /** How the turn ended, once it has. */
      stopReason: acp.StopReason | null;
    };

type TextBlock = Extract<AssistantBlock, { type: "text" | "thought" }>;

/** A tool call as an update states it. What it leaves out is kept from the call. */
type ToolChange = {
  toolCallId: string;
  title?: string | null;
  status?: acp.ToolCallStatus | null;
};

/** Folds one live session update into the assistant's current message. */
export function foldUpdate(
  messages: ChatMessage[],
  update: acp.SessionUpdate,
): ChatMessage[] {
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
      return appendAssistant(messages, block);
    }
    case "tool_call":
    case "tool_call_update":
      return appendAssistant(messages, {
        toolCallId: update.toolCallId,
        title: update.title,
        status: update.status,
      });
    default:
      // Modes, plans, usage and the like do not change the transcript.
      return messages;
  }
}

function appendAssistant(
  messages: ChatMessage[],
  block: TextBlock | ToolChange,
): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant") return messages;
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      blocks: appendBlock(last.blocks, block),
      thinkingEndedAt:
        last.thinkingEndedAt ??
        (last.startedAt &&
        "type" in block &&
        block.type === "text" &&
        block.text.trim()
          ? Date.now()
          : undefined),
    },
  ];
}

/**
 * Adds an entry to an assistant message. Consecutive chunks of one kind read
 * as one run of text, and a tool call's update changes its own entry.
 */
function appendBlock(
  blocks: AssistantBlock[],
  block: TextBlock | ToolChange,
): AssistantBlock[] {
  if ("toolCallId" in block) {
    // An update can arrive without its call having been announced.
    const index = blocks.findIndex(
      (candidate) =>
        candidate.type === "tool" && candidate.toolCallId === block.toolCallId,
    );
    const known = index === -1 ? undefined : (blocks[index] as ToolChange);
    const merged: AssistantBlock = {
      type: "tool",
      toolCallId: block.toolCallId,
      title: block.title ?? known?.title ?? "",
      status: block.status ?? known?.status ?? "pending",
    };
    return known
      ? [...blocks.slice(0, index), merged, ...blocks.slice(index + 1)]
      : [...blocks, merged];
  }
  const last = blocks[blocks.length - 1];
  if (last?.type === block.type) {
    return [...blocks.slice(0, -1), { ...last, text: last.text + block.text }];
  }
  return [...blocks, block];
}
