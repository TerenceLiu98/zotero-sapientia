import {
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  SquarePen,
} from "lucide";
import { config } from "../../package.json";
import { ChatController, type ChatState } from "../chat/controller";
import {
  createLibraryThreadId,
  loadLibraryHistory,
  setActiveLibraryThread,
  type LibraryThreadSummary,
} from "../chat/library-session";
import { getString } from "../utils/locale";
import { logError } from "../utils/log";
import { LIBRARY_STYLES } from "./library-styles";
import { CHAT_STYLES } from "./sidebar/styles";
import { createChatView, type ChatView } from "./sidebar/view";
import { h, iconButton, lucideIcon, setIconButton } from "./ui/dom";

export const LIBRARY_BUTTON_ID = "sapientia-library-agent-button";

export function createLibraryWindow() {
  let permissions: ChatState["libraryWrites"];
  let historyCollapsed = false;
  let current: Window | null = null;
  let closing = Promise.resolve();
  let dispose: (() => Promise<void>) | undefined;
  let stopping = false;

  function mountWorkspace(doc: Document, root: Element) {
    let selected: string | undefined;
    let currentChat:
      | {
          chat: ChatController;
          view: ChatView;
          unsubscribe: () => void;
        }
      | undefined;
    let disposed = false;
    let changing = Promise.resolve();
    const chatsLabel = getString("library-chats");
    const heading = h(doc, "h2", {}, chatsLabel);
    const threads = h(doc, "div", { class: "sap-library-threads" });
    const history = h(
      doc,
      "div",
      { id: "sap-library-history" },
      heading,
      threads,
    );
    const newChatLabel = getString("library-new-chat");
    const newChat = h(
      doc,
      "button",
      {
        type: "button",
        class: "sap-library-new-chat",
        "aria-label": newChatLabel,
        title: newChatLabel,
        click: () => {
          if (currentChat?.chat.getState().messages.length === 0) {
            currentChat.view.element.querySelector("textarea")?.focus();
            return;
          }
          select(createLibraryThreadId());
        },
      },
      lucideIcon(doc, SquarePen, 15),
      h(doc, "span", {}, newChatLabel),
    );
    const surface = h(doc, "main", { class: "sap-library-surface" });
    const toggle = iconButton(
      doc,
      getString("library-hide-history"),
      PanelLeftClose,
      () => {
        historyCollapsed = !historyCollapsed;
        renderHistoryVisibility();
      },
      "sap-library-history-toggle",
    );
    toggle.setAttribute("aria-controls", history.id);
    const shell = h(
      doc,
      "div",
      { class: "sap-library-shell" },
      h(
        doc,
        "nav",
        { class: "sap-library-nav", "aria-label": chatsLabel },
        h(doc, "div", { class: "sap-library-nav-actions" }, newChat, toggle),
        history,
      ),
      surface,
    );
    function renderHistoryVisibility() {
      shell.dataset.historyCollapsed = String(historyCollapsed);
      history.hidden = historyCollapsed;
      toggle.setAttribute("aria-expanded", String(!historyCollapsed));
      setIconButton(
        toggle,
        getString(
          historyCollapsed ? "library-show-history" : "library-hide-history",
        ),
        historyCollapsed ? PanelLeftOpen : PanelLeftClose,
      );
    }
    renderHistoryVisibility();
    root.append(
      h(doc, "link", {
        rel: "stylesheet",
        href: `chrome://${config.addonRef}/content/styles/katex.css`,
      }),
      h(doc, "style", {}, CHAT_STYLES + LIBRARY_STYLES),
      shell,
    );

    function renderThreads(entries: LibraryThreadSummary[]) {
      heading.hidden = entries.length === 0;
      threads.replaceChildren(
        ...entries.map(({ id, title }) =>
          h(
            doc,
            "button",
            {
              type: "button",
              title,
              "data-thread-id": id,
              "aria-current": id === selected ? "true" : null,
              click: () => select(id),
            },
            lucideIcon(doc, MessageSquare, 15),
            h(doc, "span", {}, title),
          ),
        ),
      );
      newChat.setAttribute(
        "aria-current",
        String(!entries.some(({ id }) => id === selected)),
      );
    }

    async function refreshThreads() {
      const history = await loadLibraryHistory();
      if (!disposed) renderThreads(history.threads);
    }

    async function closeChat() {
      const previous = currentChat;
      currentChat = undefined;
      if (!previous) return;
      permissions = previous.chat.getState().libraryWrites;
      previous.unsubscribe();
      previous.view.destroy();
      previous.view.element.remove();
      await previous.chat.shutdown();
    }

    function select(id: string) {
      changing = changing
        .then(async () => {
          if (disposed || selected === id) return;
          await closeChat();
          if (disposed) return;
          const chat = new ChatController(undefined, true, id);
          if (permissions) chat.setLibraryWrites(permissions);
          await chat.loadLibrary();
          if (disposed) return;
          await setActiveLibraryThread(id);
          if (disposed) return;
          selected = id;
          const view = createChatView(doc, chat);
          let execution = chat.getState().execution;
          const unsubscribe = chat.subscribe((state) => {
            if (execution === state.execution) return;
            execution = state.execution;
            // The controller queues its save after notifying the view.
            void Promise.resolve()
              .then(() => chat.flushLibrary())
              .then(refreshThreads)
              .catch((error) =>
                logError("Could not refresh Library Agent history", error),
              );
          });
          currentChat = { chat, view, unsubscribe };
          surface.append(view.element);
          view.setVisible(true);
          view.element.querySelector("textarea")?.focus();
          void chat.warm();
          await refreshThreads();
        })
        .catch((error) =>
          logError("Could not open a Library Agent chat", error),
        );
    }

    void loadLibraryHistory()
      .then(({ activeThreadId }) => {
        if (!disposed) select(activeThreadId);
      })
      .catch((error) =>
        logError("Could not load Library Agent history", error),
      );

    return async () => {
      disposed = true;
      await changing;
      await closeChat();
    };
  }

  function open(parent: Window) {
    if (stopping) return;
    if (current && !current.closed) {
      current.focus();
      return;
    }

    const window = parent.openDialog(
      `chrome://${config.addonRef}/content/library-agent.xhtml`,
      "sapientia-library-agent",
      "chrome,centerscreen,resizable,width=780,height=720",
    ) as Window;
    current = window;
    function mountView() {
      const doc = window.document;
      const root = doc.getElementById("sapientia-library-root");
      if (!root) return;
      window.removeEventListener("load", mountView);
      // The initial about:blank unloads before the library document is ready.
      window.addEventListener(
        "unload",
        () => {
          if (current !== window) return;
          current = null;
          const closeWorkspace = dispose;
          dispose = undefined;
          if (closeWorkspace) closing = closeWorkspace();
        },
        { once: true },
      );
      void closing
        .then(() => {
          if (current !== window || window.closed || stopping) return;
          doc.documentElement?.setAttribute(
            "title",
            getString("library-agent"),
          );
          dispose = mountWorkspace(doc, root);
        })
        .catch((error) => logError("Could not open the Library Agent", error));
    }
    window.addEventListener("load", mountView);
    if (window.document.readyState !== "loading") mountView();
  }

  return {
    mount(window: Window) {
      const doc = window.document;
      const toolbar = doc.getElementById("zotero-tabs-toolbar");
      if (!toolbar) return;
      const button = doc.createXULElement("toolbarbutton");
      const label = getString("library-agent");
      button.id = LIBRARY_BUTTON_ID;
      button.className = "zotero-tb-button";
      button.setAttribute(
        "image",
        `chrome://${config.addonRef}/content/icons/sapientia.svg`,
      );
      button.setAttribute("aria-label", label);
      button.setAttribute("tooltiptext", label);
      button.addEventListener("command", () => open(window));
      const style = h(
        doc,
        "style",
        {},
        `#${LIBRARY_BUTTON_ID} > .toolbarbutton-icon {
          width: 16px;
          height: 16px;
        }`,
      );
      doc.documentElement!.append(style);
      toolbar.append(button);
      return () => {
        button.remove();
        style.remove();
      };
    },
    async shutdown() {
      stopping = true;
      const closeWorkspace = dispose;
      dispose = undefined;
      current?.close();
      await closing;
      await closeWorkspace?.();
    },
  };
}
