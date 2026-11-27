import { config } from "../../package.json";
import { ChatController } from "../chat/controller";
import { getString } from "../utils/locale";
import { logError } from "../utils/log";
import { CHAT_STYLES } from "./sidebar/styles";
import { createChatView } from "./sidebar/view";
import { h } from "./ui/dom";

export const LIBRARY_BUTTON_ID = "sapientia-library-agent-button";

export function createLibraryWindow() {
  const chat = new ChatController(undefined, true);
  let current: Window | null = null;
  let closing = Promise.resolve();
  let stopping = false;

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
    let dispose: (() => void) | undefined;
    function mountView() {
      const doc = window.document;
      const root = doc.getElementById("sapientia-library-root");
      if (!root) return;
      window.removeEventListener("load", mountView);
      // The initial about:blank unloads before the library document is ready.
      window.addEventListener(
        "unload",
        () => {
          dispose?.();
          if (current !== window) return;
          current = null;
          if (!stopping) closing = chat.disconnect();
        },
        { once: true },
      );
      void closing
        .then(async () => {
          await chat.loadLibrary();
          if (current !== window || window.closed || stopping) return;
          doc.documentElement?.setAttribute(
            "title",
            getString("library-agent"),
          );
          const view = createChatView(doc, chat);
          root.append(
            h(doc, "link", {
              rel: "stylesheet",
              href: `chrome://${config.addonRef}/content/styles/katex.css`,
            }),
            h(doc, "style", {}, CHAT_STYLES),
            view.element,
          );
          dispose = () => view.destroy();
          view.setVisible(true);
          view.element.querySelector("textarea")?.focus();
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
      button.setAttribute("label", label);
      button.setAttribute(
        "image",
        `chrome://${config.addonRef}/content/icons/sapientia.svg`,
      );
      button.setAttribute("aria-label", label);
      button.setAttribute("tooltiptext", label);
      button.addEventListener("command", () => open(window));
      toolbar.append(button);
      return () => button.remove();
    },
    async shutdown() {
      stopping = true;
      current?.close();
      await closing;
      await chat.shutdown();
    },
  };
}
