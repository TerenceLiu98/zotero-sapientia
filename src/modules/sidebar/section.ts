import { config } from "../../../package.json";
import type { ChatController } from "../../chat/controller";
import { CHAT_STYLES } from "./styles";
import { createChatView, type ChatView } from "./view";

/** The id the chat section is registered under. */
export const CHAT_PANE_ID = "chat";

/** Each item pane that shows the section gets its own view of the conversation. */
const views = new WeakMap<object, ChatView>();

/**
 * Registers the conversation as an item pane section, in the library and in
 * every reader tab, with an entry in the pane's side navigation.
 *
 * @returns the registered pane id, or false if registration was refused.
 */
export function registerChatSection(chat: ChatController): string | false {
  const icon = (size: number) =>
    `chrome://${config.addonRef}/content/icons/icon${size}.svg`;
  return Zotero.ItemPaneManager.registerSection({
    paneID: CHAT_PANE_ID,
    pluginID: config.addonID,
    header: { l10nID: `${config.addonRef}-section-header`, icon: icon(16) },
    sidenav: { l10nID: `${config.addonRef}-section-sidenav`, icon: icon(20) },
    onInit: ({ body }) => {
      // Zotero gives every custom section a style element of its own.
      const style = body
        .closest("item-pane-custom-section")
        ?.querySelector(".custom-style");
      if (style) {
        style.textContent = CHAT_STYLES;
      }
      const view = createChatView(body.ownerDocument!, chat);
      views.set(body, view);
      body.append(view.element);
    },
    onDestroy: ({ body }) => {
      views.get(body)?.destroy();
      views.delete(body);
    },
    // The conversation does not depend on the item on show.
    onItemChange: ({ setEnabled }) => setEnabled(true),
    onRender: () => {},
  });
}
