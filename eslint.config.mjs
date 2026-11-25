// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

export default zotero({
  overrides: {
    files: ["test/**/*.test.ts"],
    rules: {
      "mocha/no-mocha-arrows": "off",
      "mocha/max-top-level-suites": "off",
    },
  },
});
