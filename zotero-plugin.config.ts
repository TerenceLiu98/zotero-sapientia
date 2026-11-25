import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";

export default defineConfig({
  source: ["src", "addon"],
  dist: ".scaffold/build",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/release/${
    pkg.version.includes("-") ? "update-beta.json" : "update.json"
  }`,
  xpiDownloadLink:
    "https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",

  build: {
    assets: ["addon/**/*.*"],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: pkg.homepage,
      buildVersion: pkg.version,
      buildTime: "{{buildTime}}",
    },
    prefs: {
      prefix: pkg.config.prefsPrefix,
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox115",
        outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
      },
      {
        entryPoints: ["node_modules/katex/dist/katex.min.css"],
        bundle: true,
        loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
        assetNames: "fonts/[name]",
        outfile: ".scaffold/build/addon/content/styles/katex.css",
      },
    ],
  },

  // A test run opens no debugger toolbox: it would cover the user's screen.
  server: {
    devtools: false,
  },

  // Every test run must end on its own, including when it is started by a
  // script or an agent, so a watch loop never keeps a Zotero instance alive.
  test: {
    // `SAPIENTIA_TEST_ENTRY=test/scratch npm test` runs one directory only.
    entries: process.env.SAPIENTIA_TEST_ENTRY ?? "test",
    watch: false,
    mocha: {
      timeout: 30000,
    },
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}?.data.initialized`,
  },
});
