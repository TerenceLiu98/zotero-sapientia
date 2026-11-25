/** Global Zotero API. */
/// <reference types="zotero-types/entries/sandbox" />

/**
 * The scope object the plugin script is evaluated in (see `addon/bootstrap.js`).
 * Properties put on it are globals for the whole plugin.
 */
declare const _globalThis: Record<string, any>;

declare const rootURI: string;

declare const __env__: "production" | "development" | "test";

declare namespace Zotero {
  /**
   * The plugin's entry point on `Zotero`, as used by `addon/bootstrap.js` and
   * by the scaffold's test runner.
   */
  let Sapientia: import("../src/plugin").Plugin | undefined;
}
