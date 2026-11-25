import { createPlugin } from "./plugin";

// A plugin that is enabled again is loaded into a fresh scope, so an instance
// found here belongs to a startup that has not finished shutting down.
if (!Zotero.Sapientia) {
  Zotero.Sapientia = createPlugin();
  void Zotero.Sapientia.hooks.onStartup();
}
