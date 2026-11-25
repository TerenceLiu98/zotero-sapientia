/**
 * Runs the tests inside Zotero through zotero-plugin-scaffold.
 *
 * The scaffold launches its own Zotero instance, on its own profile and data
 * directory, and stops that instance when the run ends. Its default way of
 * stopping, on macOS and Linux, kills every process whose name contains
 * "zotero", which would also take down a Zotero the user has open. This
 * script replaces that command with a no-op: the instance the scaffold started
 * is still stopped by its own process handle.
 *
 * `SAPIENTIA_TEST_ENTRY=test/scratch` runs the tests of one directory only.
 */
import { spawnSync } from "node:child_process";
import console from "node:console";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

/** A hung test must not keep a Zotero window on screen for good. */
const RUN_TIMEOUT_MS = 15 * 60 * 1000;

const root = fileURLToPath(new URL("../", import.meta.url));
const scaffold = fileURLToPath(
  new URL(
    "../node_modules/zotero-plugin-scaffold/bin/zotero-plugin.mjs",
    import.meta.url,
  ),
);

const result = spawnSync(process.execPath, [scaffold, "test"], {
  cwd: root,
  stdio: "inherit",
  timeout: RUN_TIMEOUT_MS,
  env: {
    ...process.env,
    ZOTERO_PLUGIN_KILL_COMMAND: "true",
    // What the tests need to start the fixture agent with this Node.
    SAPIENTIA_TEST_NODE: process.env.SAPIENTIA_TEST_NODE ?? process.execPath,
    SAPIENTIA_TEST_FIXTURE_AGENT: fileURLToPath(
      new URL("../test/fixtures/fixture-agent.mjs", import.meta.url),
    ),
  },
});

if (result.error) {
  console.error(
    `The test run did not finish within ${RUN_TIMEOUT_MS / 60000} minutes and was stopped.`,
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
