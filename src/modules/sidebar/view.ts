import type * as acp from "@agentclientprotocol/sdk";
import {
  FolderPlus,
  MessageSquareText,
  Power,
  RotateCcw,
  ScanSearch,
  Search,
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
import { h, iconButton, lucideIcon } from "../ui/dom";
import { createAnswer } from "./answer";
import { createAnswerSelection } from "./answer-selection";
import { createComposer } from "./composer";
import { createContextView, selectionSource } from "./context";
import { createThinkingState } from "./thinking";
import { createWriteReview } from "./write-review";

export interface ChatView {
  element: HTMLElement;
  setVisible(visible: boolean): void;
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
  context = createContextView(doc, undefined, chat.library),
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
  const writeReview = createWriteReview(doc, chat.writes);
  const permissionTitle = h(doc, "strong");
  const permissionDetails = h(doc, "pre", {
    class: "sap-agent-permission-details",
  });
  const permissionRequest = h(
    doc,
    "section",
    {
      class: "sap-agent-permission",
      "aria-label": getString("agent-permission-request"),
      hidden: true,
    },
    permissionTitle,
    permissionDetails,
    h(
      doc,
      "div",
      { class: "sap-agent-permission-actions" },
      h(
        doc,
        "button",
        {
          class: "sap-chat-button",
          type: "button",
          click: () => chat.getState().agentPermission?.decide(false),
        },
        getString("write-deny"),
      ),
      h(
        doc,
        "button",
        {
          class: "sap-chat-button sap-agent-permission-allow",
          type: "button",
          click: () => chat.getState().agentPermission?.decide(true),
        },
        getString("agent-permission-allow-once"),
      ),
    ),
  );

  function button(label: MessageId, glyph: IconNode, action: () => void) {
    return iconButton(doc, getString(label), glyph, action);
  }
  const openSettings = () => {
    Zotero.Utilities.Internal.openPreferences(`${config.addonRef}-prefs`);
  };
  const composer = createComposer(
    doc,
    {
      send(text) {
        const snapshot = context.snapshot();
        return chat.send(text, snapshot, () =>
          context.consume(snapshot.selections),
        );
      },
      stop: () => chat.stop(),
      selectAgent: (id) => chat.selectAgent(id),
      selectModel: (id) => chat.selectModel(id),
      selectReasoning: (id) => chat.selectReasoning(id),
      cancelWrites: () => chat.writes.cancelActive(),
      ...(chat.library && {
        selectedProfileId: () => chat.selectedProfileId,
        libraryPermissions: {
          get: () => chat.getState().libraryWrites!,
          set: (patch) => chat.setLibraryWrites(patch),
        },
      }),
    },
    context.attachments,
  );
  const answerSelection = createAnswerSelection(transcript, (selection) => {
    context.attach(selection);
    composer.input.focus();
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
  const newConversation = button("action-new-conversation", SquarePen, () => {
    context.clear();
    void chat.newConversation();
  });
  function libraryShortcut(
    label: MessageId,
    prompt: MessageId,
    glyph: IconNode,
  ) {
    return h(
      doc,
      "button",
      {
        type: "button",
        click: () => {
          if (!composer.input.value.trim()) {
            composer.input.value = getString(prompt);
            composer.input.dispatchEvent(new doc.defaultView!.Event("input"));
          }
          composer.input.focus();
        },
      },
      lucideIcon(doc, glyph, 15),
      getString(label),
    );
  }
  const libraryHeading = chat.library
    ? h(
        doc,
        "h1",
        { class: "sap-library-heading" },
        getString("library-home-title"),
      )
    : null;
  const libraryShortcuts = chat.library
    ? h(
        doc,
        "div",
        { class: "sap-library-shortcuts" },
        libraryShortcut(
          "library-find-papers",
          "library-find-papers-prompt",
          Search,
        ),
        libraryShortcut(
          "library-organize",
          "library-organize-prompt",
          FolderPlus,
        ),
        libraryShortcut(
          "library-check-metadata",
          "library-check-metadata-prompt",
          ScanSearch,
        ),
      )
    : null;
  const root = h(
    doc,
    "div",
    { class: chat.library ? "sap-chat sap-library-chat" : "sap-chat" },
    h(
      doc,
      "div",
      { class: "sap-chat-header" },
      h(
        doc,
        "div",
        { class: "sap-chat-actions" },
        onClose ? button("action-close-pane", X, onClose) : null,
        chat.library ? null : newConversation,
        connect,
        reconnect,
        disconnect,
      ),
      h(doc, "div", { class: "sap-chat-identity" }, agentName, status),
      writeReview.historyButton,
      button("action-agent-settings", Settings, openSettings),
    ),
    notice,
    writeReview.historyPanel,
    transcript,
    context.element,
    permissionRequest,
    writeReview.element,
    chat.library
      ? h(
          doc,
          "div",
          { class: "sap-library-compose" },
          libraryHeading,
          composer.element,
          libraryShortcuts,
        )
      : composer.element,
    answerSelection.element,
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
      const selections =
        message.context?.selections.map((selection, index) =>
          h(
            doc,
            "details",
            { class: "sap-sent-selection" },
            h(
              doc,
              "summary",
              {},
              lucideIcon(doc, MessageSquareText, 13),
              getString("context-selection-number", { number: index + 1 }),
            ),
            h(doc, "div", { class: "sap-sent-selection-text" }, selection.text),
            h(
              doc,
              "div",
              { class: "sap-sent-selection-source" },
              selectionSource(selection),
            ),
          ),
        ) ?? [];
      return {
        role: "user",
        node: h(
          doc,
          "div",
          { class: "sap-msg sap-msg-user" },
          ...selections,
          h(doc, "div", { class: "sap-user-text" }, message.text),
        ),
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
    const source = h(doc, "div", { class: "sap-turn-source", hidden: true });
    const node = h(
      doc,
      "article",
      { class: "sap-msg sap-msg-assistant", "data-answer-id": message.id },
      source,
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
          const items = current.context?.tagItems;
          const title =
            current.context?.paper?.title ??
            (items?.length
              ? getString("context-selected-items", { count: items.length })
              : undefined);
          source.hidden = !title;
          source.textContent = title ?? "";
          source.title = items?.map((item) => item.title).join("\n") ?? "";
          thinking.render(current);
          answerText = current.blocks
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join("");
          const label = current.stopReason && END_NOTES[current.stopReason];
          note.hidden = !label;
          note.textContent = label ? getString(label) : "";
        }
        answer.element.hidden = !answerText;
        answer.render({
          text: answerText,
          paperTitle: current.context?.paper?.title,
          pdfRead: current.pdfRead,
          pdfUrl:
            (current.context?.paper?.attachments?.length ?? 1) === 1
              ? current.context?.paper?.attachment?.uri
              : undefined,
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
    if (chat.library) {
      const empty = state.messages.length === 0;
      root.dataset.empty = String(empty);
      transcript.hidden = empty;
      libraryHeading!.hidden = !empty;
      libraryShortcuts!.hidden = !empty;
    }
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
    newConversation.disabled = state.changingModel;
    const showRestore = state.canRestore && state.connection !== "connecting";
    notice.hidden = !state.error && !showRestore;
    noticeText.hidden = !state.error;
    noticeText.textContent = state.error ? formatError(state.error) : "";
    restore.hidden = !showRestore;
    const permission = state.agentPermission;
    permissionRequest.hidden = !permission;
    permissionTitle.textContent =
      permission?.title || getString("agent-permission-request");
    permissionDetails.textContent = permission?.details ?? "";
    permissionDetails.hidden = !permission?.details;
    renderTranscript(state);
    composer.render(state);
  }

  const unsubscribe = chat.subscribe(render);
  render(chat.getState());

  return {
    element: root,
    setVisible(visible) {
      context.setVisible(visible);
      if (!visible) {
        composer.closeMenus();
        answerSelection.hide();
      }
    },
    destroy() {
      unsubscribe();
      composer.destroy();
      answerSelection.destroy();
      writeReview.destroy();
      context.destroy();
      for (const item of mounted.values())
        if (item.role === "assistant") item.destroy();
      mounted.clear();
    },
  };
}
