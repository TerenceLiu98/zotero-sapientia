/**
 * Bootstrap entry, following zotero-plugin-template, which is itself based on
 * Zotero's official "Make It Red" example.
 * https://github.com/zotero/make-it-red
 */

var chromeHandle;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "__addonRef__", rootURI + "content/"],
  ]);

  // The plugin script is evaluated with `ctx` on its scope chain, so whatever
  // the script puts on `_globalThis` is a global for the whole plugin.
  const ctx = { rootURI };
  ctx._globalThis = ctx;

  Services.scriptloader.loadSubScript(
    `${rootURI}content/scripts/__addonRef__.js`,
    ctx,
  );
  await Zotero.__addonInstance__.hooks.onStartup();
}

async function onMainWindowLoad({ window }, reason) {
  await Zotero.__addonInstance__?.hooks.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }, reason) {
  await Zotero.__addonInstance__?.hooks.onMainWindowUnload(window);
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
  // Unlike the template, this runs when Zotero quits too: the plugin owns
  // agent processes, which must not outlive it.
  if (Zotero.__addonInstance__) {
    await Zotero.__addonInstance__.hooks.onShutdown({
      appShutdown: reason === APP_SHUTDOWN,
    });
  }

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

async function uninstall(data, reason) {}
