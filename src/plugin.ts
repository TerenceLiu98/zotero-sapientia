import { config } from "../package.json";
import { secretValues } from "./agents/secrets";
import { loadProfiles } from "./agents/store";
import { ChatController } from "./chat/controller";
import { renderSettingsPane } from "./modules/settings/pane";
import { registerChatSection } from "./modules/sidebar/section";
import { installGlobals } from "./utils/globals";
import { getString, initLocale } from "./utils/locale";
import { logError, redactor } from "./utils/log";

/** The id of the settings pane and of its root element. */
const PREFS_PANE_ID = `${config.addonRef}-prefs`;

/** The plugin's entry point on `Zotero`, as used by `addon/bootstrap.js`. */
export interface Plugin {
  data: {
    /** Set once the plugin is up; the scaffold's test runner waits for it. */
    initialized: boolean;
  };
  /** The conversation the sidebar shows. */
  chat: ChatController;
  hooks: {
    onStartup(): Promise<void>;
    /** @param appShutdown true when Zotero itself is quitting */
    onShutdown(options: { appShutdown: boolean }): Promise<void>;
    onMainWindowLoad(window: Window): Promise<void>;
    onMainWindowUnload(): void;
    onPrefsEvent(type: "load", data: { window: Window }): void;
  };
}

export function createPlugin(): Plugin {
  const chat = new ChatController();
  let starting: Promise<void> | null = null;
  let stopping = false;
  let chatPaneID: string | false = false;
  let prefsPaneID: string | null = null;
  let disposeSettingsPane: (() => void) | null = null;
  let secretsObserver: symbol | null = null;

  /** Makes the log and the interface mask every credential the agents are given. */
  function refreshSecrets(): void {
    redactor.setSecrets(loadProfiles().flatMap(secretValues));
  }

  async function onMainWindowLoad(window: Window): Promise<void> {
    await window.MozXULElement.insertFTLIfNeeded(
      `${config.addonRef}-mainWindow.ftl`,
    );
  }

  /** Takes back what `start` has registered so far. */
  function release(): void {
    if (secretsObserver !== null) {
      Zotero.Prefs.unregisterObserver(secretsObserver);
      secretsObserver = null;
    }
    if (chatPaneID !== false) {
      Zotero.ItemPaneManager.unregisterSection(chatPaneID);
      chatPaneID = false;
    }
    if (prefsPaneID !== null) {
      Zotero.PreferencePanes.unregister(prefsPaneID);
      prefsPaneID = null;
    }
    disposeSettingsPane?.();
    disposeSettingsPane = null;
  }

  async function start(): Promise<void> {
    await Promise.all([
      Zotero.initializationPromise,
      Zotero.unlockPromise,
      Zotero.uiReadyPromise,
    ]);

    installGlobals();
    initLocale();
    refreshSecrets();
    // Whoever changes the saved agents, the credentials to mask follow.
    secretsObserver = Zotero.Prefs.registerObserver(
      `${config.prefsPrefix}.profiles`,
      refreshSecrets,
      true,
    );

    prefsPaneID = await Zotero.PreferencePanes.register({
      id: PREFS_PANE_ID,
      pluginID: config.addonID,
      src: `${rootURI}content/preferences.xhtml`,
      label: getString("prefs-title"),
      image: `chrome://${config.addonRef}/content/icons/favicon.png`,
    });
    if (stopping) {
      // Shut down while starting: nothing else is registered.
      return;
    }
    chatPaneID = registerChatSection(chat);
    if (chatPaneID === false) {
      logError("The chat section was not registered");
    }
    for (const window of Zotero.getMainWindows()) {
      await onMainWindowLoad(window);
    }

    plugin.data.initialized = true;
  }

  const plugin: Plugin = {
    data: { initialized: false },
    chat,
    hooks: {
      // Zotero calls startup more than once for a plugin that is installed
      // while it is enabled, so the second call joins the first.
      onStartup(): Promise<void> {
        starting ??= start();
        return starting;
      },

      async onShutdown({ appShutdown }) {
        stopping = true;
        await starting;
        // When Zotero itself is quitting there is no interface left to remove.
        if (!appShutdown) {
          release();
        }
        await chat.shutdown();
        Zotero.Sapientia = undefined;
      },

      onMainWindowLoad,
      onMainWindowUnload() {},

      onPrefsEvent(type, data) {
        if (type !== "load") {
          return;
        }
        disposeSettingsPane?.();
        const doc = data.window.document;
        const container = doc.getElementById(PREFS_PANE_ID);
        if (!container) {
          logError("The settings pane has no root element");
          return;
        }
        disposeSettingsPane = renderSettingsPane(doc, container);
      },
    },
  };

  return plugin;
}
