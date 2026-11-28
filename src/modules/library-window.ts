import { PanelLeftClose, PanelLeftOpen, SquarePen, Trash2 } from "lucide";
import { config } from "../../package.json";
import { ChatController, type ChatState } from "../chat/controller";
import {
  createLibraryThreadId,
  deleteLibraryThread,
  loadLibraryHistory,
  setActiveLibraryThread,
  type LibraryThreadSummary,
} from "../chat/library-session";
import { getString } from "../utils/locale";
import { logError } from "../utils/log";
import { createLibraryRun } from "./library-run";
import { LIBRARY_RUN_STYLES } from "./library-run-styles";
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
    const win = doc.defaultView!;
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
    let mode: "chat" | "run" = "chat";
    let inspectedMessage: string | undefined;
    let runTrigger: HTMLButtonElement | undefined;
    let progressPreference: boolean | undefined;
    let pendingApproval = false;
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
    const deleteTitle = getString("library-delete-chat");
    const deleteHeading = h(doc, "h2", { id: "sap-library-delete-title" });
    const deleteNotice = h(doc, "p", { role: "alert", hidden: true });
    let deleteTarget: string | undefined;
    const deleteDialog = h(
      doc,
      "dialog",
      {
        class: "sap-library-delete-dialog",
        "aria-labelledby": deleteHeading.id,
      },
      deleteHeading,
      deleteNotice,
      h(
        doc,
        "div",
        { class: "sap-library-delete-actions" },
        h(
          doc,
          "button",
          {
            type: "button",
            class: "sap-chat-button",
            autofocus: true,
            click: () => deleteDialog.close(),
          },
          getString("prefs-agent-cancel"),
        ),
        h(
          doc,
          "button",
          {
            type: "button",
            class: "sap-chat-button sap-library-delete-confirm",
            click: () => {
              if (deleteTarget) removeChat(deleteTarget);
            },
          },
          deleteTitle,
        ),
      ),
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
    const runView = createLibraryRun(doc, {
      closeProgress: () => {
        focusProgressToggle();
        progressPreference = false;
        renderWorkspace();
      },
      openRun,
      closeRun() {
        mode = "chat";
        inspectedMessage = undefined;
        renderWorkspace();
        if (runTrigger?.isConnected) runTrigger.focus();
        else currentChat?.view.element.querySelector("textarea")?.focus();
        runTrigger = undefined;
      },
      stop: () => void currentChat?.chat.stop(),
      toggleProgress,
    });
    runView.progress.id = "sap-library-inspector";
    runView.progress.classList.add("sap-library-inspector");
    runView.progress.setAttribute("inert", "");
    runView.progress.setAttribute("aria-hidden", "true");
    const inspectorSlot = h(
      doc,
      "div",
      { class: "sap-library-inspector-slot" },
      runView.progress,
    );
    surface.append(runView.run);
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
        h(doc, "div", { class: "sap-library-nav-actions" }, toggle, newChat),
        history,
      ),
      surface,
      inspectorSlot,
    );
    const narrow = win.matchMedia("(max-width: 900px)");
    narrow?.addEventListener("change", renderWorkspace);

    function openRun(messageId?: string, trigger?: HTMLButtonElement) {
      mode = "run";
      inspectedMessage = messageId;
      runTrigger = trigger;
      if (narrow?.matches && !pendingApproval) progressPreference = false;
      renderWorkspace();
      runView.run.querySelector<HTMLButtonElement>("button")?.focus();
    }

    function toggleProgress() {
      progressPreference = shell.dataset.progress !== "true";
      renderWorkspace();
    }

    function focusProgressToggle() {
      const button =
        mode === "run"
          ? runView.run.querySelector<HTMLButtonElement>(
              ".sap-library-run-toggle",
            )
          : currentChat?.view.element.querySelector<HTMLButtonElement>(
              ".sap-library-progress-toggle",
            );
      button?.focus();
    }

    function renderWorkspace() {
      const state = currentChat?.chat.getState();
      const hasRun = Boolean(
        state?.messages.some(({ role }) => role === "assistant"),
      );
      const showProgress = hasRun && (progressPreference ?? !narrow?.matches);
      shell.dataset.progress = String(showProgress);
      shell.dataset.presentation = mode;
      runView.run.hidden = mode !== "run";
      if (!showProgress && runView.progress.contains(doc.activeElement))
        focusProgressToggle();
      runView.progress.toggleAttribute("inert", !showProgress);
      runView.progress.setAttribute("aria-hidden", String(!showProgress));
      if (currentChat) {
        currentChat.view.element.hidden = mode !== "chat";
        const button =
          currentChat.view.element.querySelector<HTMLButtonElement>(
            ".sap-library-progress-toggle",
          );
        if (button) {
          button.hidden = !hasRun;
          button.setAttribute("aria-controls", runView.progress.id);
          button.setAttribute("aria-expanded", String(showProgress));
          button.dataset.needsInput = String(pendingApproval);
        }
      }
      if (!state) return;
      runView.setPresentation(mode);
      runView.setProgressOpen(showProgress);
      runView.render(state, undefined, inspectedMessage);
    }
    function renderHistoryVisibility() {
      shell.dataset.historyCollapsed = String(historyCollapsed);
      if (historyCollapsed && history.contains(doc.activeElement))
        toggle.focus();
      history.toggleAttribute("inert", historyCollapsed);
      history.setAttribute("aria-hidden", String(historyCollapsed));
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
      h(doc, "style", {}, CHAT_STYLES + LIBRARY_STYLES + LIBRARY_RUN_STYLES),
      shell,
    );
    shell.append(deleteDialog);

    function renderThreads(entries: LibraryThreadSummary[]) {
      heading.hidden = entries.length === 0;
      threads.replaceChildren(
        ...entries.map((entry) =>
          h(
            doc,
            "div",
            { class: "sap-library-thread" },
            h(
              doc,
              "button",
              {
                type: "button",
                title: entry.title,
                "data-thread-id": entry.id,
                "aria-current": entry.id === selected ? "true" : null,
                click: () => select(entry.id),
              },
              h(doc, "span", {}, entry.title),
            ),
            iconButton(
              doc,
              getString("library-delete-chat-title", { title: entry.title }),
              Trash2,
              () => {
                deleteTarget = entry.id;
                deleteHeading.textContent = getString(
                  "library-delete-chat-title",
                  { title: entry.title },
                );
                deleteNotice.hidden = true;
                deleteDialog.showModal();
              },
              "sap-library-delete-thread",
            ),
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

    async function openChat(id: string) {
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
      mode = "chat";
      inspectedMessage = undefined;
      runTrigger = undefined;
      pendingApproval = false;
      const view = createChatView(doc, chat, undefined, undefined, {
        requests: runView.requests,
        toggleProgress,
        openRun,
      });
      let execution = chat.getState().execution;
      let awaitingWrite = false;
      function updateApproval() {
        const awaiting =
          awaitingWrite || Boolean(chat.getState().agentPermission);
        if (awaiting && !pendingApproval) progressPreference = true;
        if (awaiting !== pendingApproval) {
          pendingApproval = awaiting;
          renderWorkspace();
        }
      }
      const unsubscribeWrite = chat.writes.subscribe((review) => {
        awaitingWrite = review?.phase === "pending";
        updateApproval();
      });
      const unsubscribeChat = chat.subscribe((state) => {
        updateApproval();
        renderWorkspace();
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
      currentChat = {
        chat,
        view,
        unsubscribe() {
          unsubscribeWrite();
          unsubscribeChat();
        },
      };
      surface.append(view.element);
      renderWorkspace();
      view.setVisible(true);
      view.element.querySelector("textarea")?.focus();
      void chat.warm();
      await refreshThreads();
    }

    function select(id: string) {
      changing = changing
        .then(() => openChat(id))
        .catch((error) =>
          logError("Could not open a Library Agent chat", error),
        );
    }

    function removeChat(id: string) {
      const confirm = deleteDialog.querySelector<HTMLButtonElement>(
        ".sap-library-delete-confirm",
      )!;
      confirm.disabled = true;
      changing = changing
        .then(async () => {
          if (disposed) return;
          const wasSelected = selected === id;
          if (wasSelected) {
            await closeChat();
            selected = undefined;
          }
          try {
            const next = await deleteLibraryThread(id);
            deleteDialog.close();
            if (wasSelected) await openChat(next);
            else {
              await refreshThreads();
              if (selected)
                threads
                  .querySelector<HTMLButtonElement>('[aria-current="true"]')
                  ?.focus();
            }
          } catch (error) {
            logError("Could not delete a Library Agent chat", error);
            deleteNotice.textContent = getString("library-delete-chat-error");
            deleteNotice.hidden = false;
            if (wasSelected) await openChat(id);
          }
        })
        .catch((error) =>
          logError("Could not restore a Library Agent chat", error),
        )
        .finally(() => {
          confirm.disabled = false;
        });
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
      narrow?.removeEventListener("change", renderWorkspace);
      runView.destroy();
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
      "chrome,centerscreen,resizable,width=1240,height=800",
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
