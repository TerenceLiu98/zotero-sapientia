import type * as acp from "@agentclientprotocol/sdk";
import type {
  AssistantBlock,
  ChatController,
  ChatMessage,
  ChatState,
} from "../../chat/controller";
import { formatError } from "../../utils/errors";
import { getString, type MessageId } from "../../utils/locale";
import { h, icon, ICON } from "../ui/dom";

/** The chat section's user interface for one conversation. */
export interface ChatView {
  element: HTMLElement;
  destroy(): void;
}

const TOOL_ICON: Record<acp.ToolCallStatus, string> = {
  pending:
    "M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM2.3 8a5.7 5.7 0 1 1 11.4 0A5.7 5.7 0 0 1 2.3 8z",
  in_progress:
    "M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM2.3 8a5.7 5.7 0 1 1 11.4 0A5.7 5.7 0 0 1 2.3 8z",
  completed: ICON.check,
  failed: ICON.close,
};

/** How a turn can end other than by finishing its answer or being stopped. */
const UNUSUAL_END: Partial<Record<acp.StopReason, MessageId>> = {
  max_tokens: "turn-ended-max_tokens",
  max_turn_requests: "turn-ended-max_turn_requests",
  refusal: "turn-ended-refusal",
};

/** A message is considered scrolled to the end within this many pixels. */
const BOTTOM_SLACK_PX = 24;

export function createChatView(doc: Document, chat: ChatController): ChatView {
  const window = doc.defaultView!;
  const agentName = h(doc, "span", { class: "sap-chat-agent" });
  const statusLabel = h(doc, "span");
  const status = h(
    doc,
    "span",
    { class: "sap-chat-status" },
    h(doc, "span", { class: "sap-chat-dot" }),
    statusLabel,
  );
  const noticeText = h(doc, "div");
  const restore = actionButton("action-restore", () => void chat.restore());
  const notice = h(
    doc,
    "div",
    { class: "sap-chat-notice", role: "alert" },
    noticeText,
    h(doc, "div", { class: "sap-chat-notice-actions" }, restore),
  );
  const transcript = h(doc, "div", { class: "sap-chat-transcript" });
  const input = h(doc, "textarea", {
    class: "sap-chat-input",
    rows: 1,
    placeholder: getString("composer-placeholder"),
  });
  const send = actionButton("action-send", () => {
    if (chat.getState().execution === "idle") {
      void submit();
    } else {
      void chat.stop();
    }
  });
  const connect = actionButton("action-connect", () => void chat.connect());
  const reconnect = actionButton("action-reconnect", () => void chat.connect());
  const disconnect = actionButton(
    "action-disconnect",
    () => void chat.disconnect(),
  );
  const newConversation = actionButton(
    "action-new-conversation",
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
      agentName,
      status,
      connect,
      reconnect,
      disconnect,
      newConversation,
    ),
    notice,
    transcript,
    h(doc, "div", { class: "sap-chat-composer" }, input, send),
  );

  /** Message nodes by message id, so that an unchanged message keeps its node. */
  const mounted = new Map<
    string,
    { message: ChatMessage; node: HTMLElement }
  >();

  function actionButton(
    textId: MessageId,
    onClick: () => void,
  ): HTMLButtonElement {
    return h(
      doc,
      "button",
      { class: "sap-chat-button", type: "button", click: onClick },
      getString(textId),
    );
  }

  function resizeInput(): void {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }

  async function submit(): Promise<void> {
    const text = input.value;
    if (!text.trim() || chat.getState().execution !== "idle") {
      return;
    }
    // Clear the field at once; the answer may take minutes to arrive.
    input.value = "";
    resizeInput();
    const sent = await chat.send(text);
    if (!sent && !input.value) {
      input.value = text;
      resizeInput();
    }
    renderSend();
  }

  /** The send button is the stop button while a turn is running. */
  function renderSend(): void {
    const { connection, execution } = chat.getState();
    const running = execution !== "idle";
    send.textContent = getString(running ? "action-stop" : "action-send");
    if (running) {
      send.removeAttribute("data-variant");
    } else {
      send.dataset.variant = "primary";
    }
    send.disabled = running
      ? execution === "cancelling"
      : !input.value.trim() || connection === "connecting";
  }

  function renderBlock(block: AssistantBlock): HTMLElement {
    if (block.type === "tool") {
      return h(
        doc,
        "div",
        { class: "sap-block-tool", "data-status": block.status },
        h(
          doc,
          "span",
          { class: "sap-block-tool-icon" },
          icon(doc, TOOL_ICON[block.status], 14),
        ),
        block.title,
      );
    }
    return h(doc, "div", { class: `sap-block-${block.type}` }, block.text);
  }

  function renderMessage(message: ChatMessage): HTMLElement {
    if (message.role === "user") {
      return h(doc, "div", { class: "sap-msg sap-msg-user" }, message.text);
    }
    const note = endNote(message.stopReason);
    return h(
      doc,
      "div",
      { class: "sap-msg sap-msg-assistant" },
      ...message.blocks.map(renderBlock),
      ...(note
        ? [h(doc, "div", { class: "sap-msg-note" }, getString(note))]
        : []),
    );
  }

  /** Names the line that says how a turn ended, when that needs saying. */
  function endNote(stopReason: acp.StopReason | null): MessageId | undefined {
    if (stopReason === "cancelled") {
      return "turn-cancelled";
    }
    return stopReason ? UNUSUAL_END[stopReason] : undefined;
  }

  function renderTranscript(state: ChatState): void {
    const atEnd =
      transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight <
      BOTTOM_SLACK_PX;
    const kept = new Set<string>();
    for (const message of state.messages) {
      kept.add(message.id);
      const existing = mounted.get(message.id);
      if (existing?.message === message) {
        continue;
      }
      const node = renderMessage(message);
      if (existing) {
        existing.node.replaceWith(node);
      } else {
        transcript.append(node);
      }
      mounted.set(message.id, { message, node });
    }
    for (const [id, entry] of mounted) {
      if (!kept.has(id)) {
        entry.node.remove();
        mounted.delete(id);
      }
    }
    if (atEnd) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }

  function renderNotice({ error, connection, canRestore }: ChatState): void {
    const showRestore = canRestore && connection !== "connecting";
    notice.hidden = !error && !showRestore;
    noticeText.hidden = !error;
    noticeText.textContent = error ? formatError(error) : "";
    restore.hidden = !showRestore;
  }

  function render(state: ChatState): void {
    root.dataset.connection = state.connection;
    agentName.textContent = state.agentName ?? "";
    statusLabel.textContent = statusText(state);
    connect.hidden = state.connection !== "disconnected";
    reconnect.hidden = state.connection !== "error";
    disconnect.hidden =
      state.connection !== "connected" && state.connection !== "connecting";
    newConversation.hidden = state.connection !== "connected";
    newConversation.disabled = state.execution !== "idle";
    renderNotice(state);
    renderTranscript(state);
    renderSend();
  }

  function statusText(state: ChatState): string {
    if (state.connection === "connected" && state.execution !== "idle") {
      return getString(
        state.execution === "executing"
          ? "status-executing"
          : "status-cancelling",
      );
    }
    return getString(`status-${state.connection}`);
  }

  input.addEventListener("input", () => {
    resizeInput();
    renderSend();
  });
  input.addEventListener("keydown", (event) => {
    const key = event as KeyboardEvent;
    if (key.key === "Enter" && !key.shiftKey && !key.isComposing) {
      event.preventDefault();
      void submit();
    }
  });

  const unsubscribe = chat.subscribe(render);
  render(chat.getState());

  return {
    element: root,
    destroy: unsubscribe,
  };
}
