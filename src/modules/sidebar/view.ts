import type * as acp from "@agentclientprotocol/sdk";
import {
  ArrowUp,
  Check,
  Copy,
  Power,
  RotateCcw,
  Settings,
  Square,
  SquarePen,
  X,
  type IconNode,
} from "lucide";
import type {
  AssistantBlock,
  ChatController,
  ChatMessage,
  ChatState,
} from "../../chat/controller";
import { config } from "../../../package.json";
import { formatError } from "../../utils/errors";
import { getString, type MessageId } from "../../utils/locale";
import { h, icon, ICON } from "../ui/dom";
import { renderAnswerText } from "./answer";

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

export function createChatView(
  doc: Document,
  chat: ChatController,
  onClose?: () => void,
): ChatView {
  const window = doc.defaultView!;
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
    "aria-label": getString("composer-placeholder"),
  });
  const send = iconButton("action-send", ArrowUp, () => {
    if (chat.getState().execution === "idle") {
      void submit();
    } else {
      void chat.stop();
    }
  });
  send.classList.add("sap-composer-send");
  const connect = iconButton(
    "action-connect",
    Power,
    () => void chat.connect(),
  );
  const reconnect = iconButton(
    "action-reconnect",
    RotateCcw,
    () => void chat.connect(),
  );
  const disconnect = iconButton(
    "action-disconnect",
    Power,
    () => void chat.disconnect(),
  );
  const newConversation = iconButton(
    "action-new-conversation",
    SquarePen,
    () => void chat.newConversation(),
  );
  const composer = h(
    doc,
    "div",
    { class: "sap-chat-composer" },
    input,
    h(doc, "div", { class: "sap-composer-toolbar" }, send),
  );
  composer.addEventListener("click", (event) => {
    if (event.target === composer) input.focus();
  });
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
        onClose ? iconButton("action-close-pane", X, onClose) : null,
        newConversation,
        connect,
        reconnect,
        disconnect,
      ),
      h(doc, "div", { class: "sap-chat-identity" }, agentName, status),
      iconButton("action-agent-settings", Settings, () => {
        Zotero.Utilities.Internal.openPreferences(`${config.addonRef}-prefs`);
      }),
    ),
    notice,
    transcript,
    composer,
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

  function iconButton(
    label: MessageId,
    glyph: IconNode,
    action: () => void,
  ): HTMLButtonElement {
    const button = h(doc, "button", {
      class: "sap-chat-button sap-icon-button",
      type: "button",
      click: action,
    });
    setButtonIcon(button, label, glyph);
    return button;
  }

  function setButtonIcon(
    button: HTMLButtonElement,
    label: MessageId,
    glyph: IconNode,
  ): void {
    const text = getString(label);
    if (button.getAttribute("aria-label") === text) return;
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    }))
      svg.setAttribute(name, value);
    for (const [tag, attributes] of glyph) {
      const part = doc.createElementNS(svg.namespaceURI, tag);
      for (const [name, value] of Object.entries(attributes))
        part.setAttribute(name, String(value));
      svg.append(part);
    }
    button.title = text;
    button.setAttribute("aria-label", text);
    button.replaceChildren(svg);
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
    setButtonIcon(
      send,
      running ? "action-stop" : "action-send",
      running ? Square : ArrowUp,
    );
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
    return block.type === "text"
      ? renderAnswerText(doc, block.text)
      : h(doc, "div", { class: "sap-block-thought" }, block.text);
  }

  function renderMessage(message: ChatMessage): HTMLElement {
    if (message.role === "user") {
      return h(doc, "div", { class: "sap-msg sap-msg-user" }, message.text);
    }
    const note = endNote(message.stopReason);
    const answer = message.blocks
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n\n");
    const copy =
      message.stopReason && answer
        ? iconButton("action-copy-answer", Copy, () => {
            Zotero.Utilities.Internal.copyTextToClipboard(answer);
            setButtonIcon(copy!, "status-answer-copied", Check);
            window.setTimeout(
              () => setButtonIcon(copy!, "action-copy-answer", Copy),
              1200,
            );
          })
        : null;
    return h(
      doc,
      "article",
      {
        class: "sap-msg sap-msg-assistant",
        "aria-busy": String(!message.stopReason),
      },
      ...message.blocks.map(renderBlock),
      ...(note
        ? [h(doc, "div", { class: "sap-msg-note" }, getString(note))]
        : []),
      copy ? h(doc, "div", { class: "sap-answer-actions" }, copy) : null,
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
    agentName.textContent = state.agentName ?? getString("chat-title");
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
