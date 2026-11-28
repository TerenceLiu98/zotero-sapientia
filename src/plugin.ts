import { config } from "../package.json";
import { secretValues } from "./agents/secrets";
import { loadProfiles } from "./agents/store";
import { ChatController } from "./chat/controller";
import { renderSettingsPane } from "./modules/settings/pane";
import { createLibraryWindow } from "./modules/library-window";
import { rewriteMarginaliaDraft } from "./modules/marginalia/agent";
import {
  canEditAnnotation,
  captureAnnotationSource,
  captureStoredAnnotation,
  saveAnnotationComment,
} from "./modules/marginalia/annotation";
import { openAnnotationDraft } from "./modules/marginalia/editor";
import { mountMarginaliaReader } from "./modules/marginalia/reader";
import { mountSelectionShortcut } from "./modules/marginalia/shortcut";
import { mountChatSidebar } from "./modules/sidebar/section";
import { UserError } from "./utils/errors";
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
    onMainWindowLoad(window: Window): void;
    onMainWindowUnload(window: Window): void;
    onPrefsEvent(type: "load", data: { window: Window }): void;
  };
}

export function createPlugin(): Plugin {
  const chat = new ChatController();
  const library = createLibraryWindow();
  let starting: Promise<void> | null = null;
  let stopping = false;
  const sidebars = new Map<
    Window,
    {
      dispose(): void;
      askFromAnnotation(
        source: NonNullable<ReturnType<typeof captureStoredAnnotation>>,
      ): void;
    }
  >();
  let prefsPaneID: string | null = null;
  let disposeSettingsPane: (() => void) | null = null;
  let secretsObserver: symbol | null = null;
  let marginaliaObserver: symbol | undefined;
  let disposeMarginalia: (() => void) | undefined;
  let disposeSelectionShortcut: (() => void) | undefined;

  /** Makes the log and the interface mask every credential the agents are given. */
  function refreshSecrets(): void {
    redactor.setSecrets(loadProfiles().flatMap(secretValues));
  }

  function onMainWindowLoad(window: Window): void {
    if (stopping || sidebars.has(window)) return;
    const sidebar = mountChatSidebar(window, chat);
    const toolbar = library.mount(window);
    if (sidebar || toolbar) {
      sidebars.set(window, {
        dispose() {
          sidebar?.dispose();
          toolbar?.();
        },
        askFromAnnotation(source) {
          sidebar?.askFromAnnotation(source);
        },
      });
    }
  }

  /** Takes back what `start` has registered so far. */
  function release(): void {
    if (secretsObserver !== null) {
      Zotero.Prefs.unregisterObserver(secretsObserver);
      secretsObserver = null;
    }
    for (const sidebar of sidebars.values()) sidebar.dispose();
    sidebars.clear();
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
      image: `chrome://${config.addonRef}/content/icons/sapientia.svg`,
    });
    if (stopping) {
      // Shut down while starting: nothing else is registered.
      return;
    }
    const pref = `${config.prefsPrefix}.marginalia`;
    const marginalia = mountMarginaliaReader({
      enabled: () => Zotero.Prefs.get(pref, true) === true,
      ask(reader, annotation, draft?: string) {
        const source = captureStoredAnnotation(annotation);
        const window =
          Zotero.getMainWindows().find(
            (candidate) => candidate.Zotero_Tabs?._getTab(reader.tabID)?.tab,
          ) ?? Zotero.getMainWindow();
        if (source && window)
          sidebars.get(window)?.askFromAnnotation({
            ...source,
            comment: draft ?? source.comment,
          });
      },
      editable: canEditAnnotation,
      async rewrite(annotation, draft, action, signal) {
        const source = captureStoredAnnotation(annotation);
        if (!source) throw new UserError("marginalia-target-unavailable");
        return rewriteMarginaliaDraft(
          chat.selectedAgentModel,
          source,
          draft,
          action,
          signal,
        );
      },
      async saveComment(annotation, comment, previousComment?: string) {
        const source = captureStoredAnnotation(annotation);
        if (!source)
          throw new Error("The original Zotero annotation is unavailable.");
        await saveAnnotationComment(source, comment, previousComment);
      },
    });
    marginaliaObserver = Zotero.Prefs.registerObserver(
      pref,
      marginalia.refresh,
      true,
    );
    disposeMarginalia = marginalia.dispose;
    disposeSelectionShortcut = mountSelectionShortcut({
      capture: (reader, annotation) =>
        captureAnnotationSource(reader._item, annotation),
      edit: (source, answer, anchor) => {
        void openAnnotationDraft(source, answer, anchor).catch((error) =>
          logError("Could not open annotation draft", error),
        );
      },
    });
    for (const window of Zotero.getMainWindows()) {
      onMainWindowLoad(window);
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
        if (marginaliaObserver !== undefined)
          Zotero.Prefs.unregisterObserver(marginaliaObserver);
        disposeMarginalia?.();
        disposeSelectionShortcut?.();
        // When Zotero itself is quitting there is no interface left to remove.
        if (!appShutdown) {
          release();
        }
        await Promise.all([chat.shutdown(), library.shutdown()]);
        Zotero.Sapientia = undefined;
      },

      onMainWindowLoad,
      onMainWindowUnload(window) {
        sidebars.get(window)?.dispose();
        sidebars.delete(window);
      },

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
