import type * as acp from "@agentclientprotocol/sdk";
import {
  Power,
  RotateCcw,
  Settings,
  SquarePen,
  X,
  type IconNode,
} from "lucide";
import { config } from "../../../package.json";
import type {
  ChatController,
  ChatMessage,
  ChatState,
} from "../../chat/controller";
import { formatError } from "../../utils/errors";
import { getString, type MessageId } from "../../utils/locale";
import { h, iconButton } from "../ui/dom";
import { createAnswer } from "./answer";
import { createComposer } from "./composer";
import { createThinkingState } from "./thinking";

export interface ChatView {
  element: HTMLElement;
  destroy(): void;
}

const END_NOTES: Partial<Record<acp.StopReason, MessageId>> = {
  cancelled: "turn-cancelled",
  max_tokens: "turn-ended-max_tokens",
  max_turn_requests: "turn-ended-max_turn_requests",
  refusal: "turn-ended-refusal",
};
const BOTTOM_SLACK_PX = 24;

type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;

export function createChatView(
  doc: Document,
  chat: ChatController,
  onClose?: () => void,
): ChatView {
  const agentName = h(doc, "span", { class: "sap-chat-agent" });
  const statusLabel = h(doc, "span");
  const status = h(
    doc,
    "span",
    { class: "sap-chat-status", role: "status" },
    h(doc, "span", { class: "sap-chat-dot" }),
    statusLabel,
  );
  const noticeText = h(doc, "div");
  const restore = h(
    doc,
    "button",
    {
      class: "sap-chat-button",
      type: "button",
      click: () => void chat.restore(),
    },
    getString("action-restore"),
  );
  const notice = h(
    doc,
    "div",
    { class: "sap-chat-notice", role: "alert" },
    noticeText,
    h(doc, "div", { class: "sap-chat-notice-actions" }, restore),
  );
  const transcript = h(doc, "div", { class: "sap-chat-transcript" });

  function button(label: MessageId, glyph: IconNode, action: () => void) {
    return iconButton(doc, getString(label), glyph, action);
  }
  const openSettings = () => {
    Zotero.Utilities.Internal.openPreferences(`${config.addonRef}-prefs`);
  };
  const composer = createComposer(doc, {
    send: (text) => chat.send(text),
    stop: () => chat.stop(),
    selectAgent: (id) => chat.selectAgent(id),
    selectModel: (id) => chat.selectModel(id),
  });
  const connect = button("action-connect", Power, () => void chat.connect());
  const reconnect = button(
    "action-reconnect",
    RotateCcw,
    () => void chat.connect(),
  );
  const disconnect = button(
    "action-disconnect",
    Power,
    () => void chat.disconnect(),
  );
  const newConversation = button(
    "action-new-conversation",
    SquarePen,
    () => void chat.newConversation(),
  );
  const root = h(
    doc,
    "div",
    { class: "sap-chat" },
    h(
      doc,
      "div",
      { class: "sap-chat-header" },
      h(
        doc,
        "div",
        { class: "sap-chat-actions" },
        onClose ? button("action-close-pane", X, onClose) : null,
        newConversation,
        connect,
        reconnect,
        disconnect,
      ),
      h(doc, "div", { class: "sap-chat-identity" }, agentName, status),
      button("action-agent-settings", Settings, openSettings),
    ),
    notice,
    transcript,
    composer.element,
  );

  type Mounted =
    | { role: "user"; node: HTMLElement }
    | {
        role: "assistant";
        node: HTMLElement;
        render(
          message: AssistantMessage,
          state: ChatState,
          last: boolean,
        ): void;
        destroy(): void;
      };
  const mounted = new Map<string, Mounted>();

  function mountMessage(message: ChatMessage): Mounted {
    if (message.role === "user") {
      return {
        role: "user",
        node: h(doc, "div", { class: "sap-msg sap-msg-user" }),
      };
    }
    const thinking = createThinkingState(doc);
    const answer = createAnswer(doc, {
      id: message.id,
      onRegenerate: () => {
        void chat.regenerate(message.id);
      },
      onStop: () => {
        void chat.stop();
      },
    });
    const note = h(doc, "div", { class: "sap-msg-note" });
    const node = h(
      doc,
      "article",
      { class: "sap-msg sap-msg-assistant" },
      thinking.element,
      answer.element,
      note,
    );
    let lastMessage: AssistantMessage | undefined;
    let answerText = "";
    return {
      role: "assistant",
      node,
      render(current, state, last) {
        if (lastMessage !== current) {
          lastMessage = current;
          thinking.render(current);
          answerText = current.blocks
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join("\n\n");
          const label = current.stopReason && END_NOTES[current.stopReason];
          note.hidden = !label;
          note.textContent = label ? getString(label) : "";
        }
        answer.element.hidden = !answerText;
        answer.render({
          text: answerText,
          streaming: !current.stopReason,
          stopping: state.execution === "cancelling",
          regenerate:
            last &&
            state.connection === "connected" &&
            state.execution === "idle" &&
            Boolean(current.stopReason),
        });
      },
      destroy() {
        thinking.destroy();
        answer.destroy();
      },
    };
  }

  function renderTranscript(state: ChatState) {
    const atEnd =
      transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight <
      BOTTOM_SLACK_PX;
    const kept = new Set<string>();
    state.messages.forEach((message, index) => {
      kept.add(message.id);
      let item = mounted.get(message.id);
      if (!item) {
        item = mountMessage(message);
        mounted.set(message.id, item);
        transcript.append(item.node);
      }
      if (item.role === "assistant" && message.role === "assistant") {
        item.render(message, state, index === state.messages.length - 1);
      } else if (
        message.role === "user" &&
        item.node.textContent !== message.text
      ) {
        item.node.textContent = message.text;
      }
    });
    for (const [id, item] of mounted) {
      if (kept.has(id)) continue;
      if (item.role === "assistant") item.destroy();
      item.node.remove();
      mounted.delete(id);
    }
    if (atEnd) transcript.scrollTop = transcript.scrollHeight;
  }

  function render(state: ChatState) {
    root.dataset.connection = state.connection;
    agentName.textContent = state.agentName ?? getString("chat-title");
    const statusId =
      state.connection === "connected" && state.execution !== "idle"
        ? state.execution === "executing"
          ? "status-executing"
          : "status-cancelling"
        : (`status-${state.connection}` as const);
    statusLabel.textContent = getString(statusId);
    connect.hidden = state.connection !== "disconnected";
    reconnect.hidden = state.connection !== "error";
    disconnect.hidden =
      state.connection !== "connected" && state.connection !== "connecting";
    newConversation.hidden = state.connection !== "connected";
    newConversation.disabled = state.execution !== "idle";
    const showRestore = state.canRestore && state.connection !== "connecting";
    notice.hidden = !state.error && !showRestore;
    noticeText.hidden = !state.error;
    noticeText.textContent = state.error ? formatError(state.error) : "";
    restore.hidden = !showRestore;
    renderTranscript(state);
    composer.render(state);
  }

  const unsubscribe = chat.subscribe(render);
  render(chat.getState());

  return {
    element: root,
    destroy() {
      unsubscribe();
      composer.destroy();
      for (const item of mounted.values())
        if (item.role === "assistant") item.destroy();
      mounted.clear();
    },
  };
}
