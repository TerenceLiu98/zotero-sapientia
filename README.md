# Sapientia

Zotero 10 plugin for chatting with your own Agent Client Protocol (ACP) agent in the paper sidebar or in a dedicated Library Agent window.

## Build and install

Run `npm ci` and `npm run build` with Node.js 22 or newer. Install the `.xpi` from `.scaffold/build` through Zotero's **Tools → Plugins** menu.

Open the sidebar from the **Sapientia** icon in Zotero's item navigation on the right. The composer lists local installations of Claude Code, Codex, OpenCode, and Antigravity. Claude Code and Codex use an ACP adapter, which may be downloaded by `npx` on first use when no adapter is installed. OpenCode and Antigravity use their built-in ACP servers.

For Antigravity, sign in to the CLI once with `agy acp --login`. Sapientia starts `agy acp --process-per-session` so it can pass Zotero's HTTP MCP tools to the session. See the [Antigravity ACP documentation](https://antigravity.google/docs/ide/extensions/acp/).

For another ACP agent, open **Settings → Sapientia** and save an agent profile with its executable, arguments, working directory, and any required environment variables. Use an absolute executable path if needed.

## Paper access

The agent can read the current paper's metadata, PDF text, current PDF selection, annotations, child notes, and tags. The plugin binds each request to the paper selected when the prompt was sent. The agent can request a physical PDF page, an inclusive range, or the full attachment. A scanned page without a text layer requires OCR in the agent's toolset.

The plugin registers its loopback Model Context Protocol (MCP) endpoint when the agent advertises HTTP MCP over ACP. The local Codex configuration used for verification had no Zotero MCP tools, so the endpoint covers those reads directly with Zotero's bundled document worker.

## Library Agent

Open **Library Agent** from the Zotero toolbar. Its conversation and selected Agent are independent of the paper sidebar. With HTTP MCP support, the Agent can search your personal library by title, author, DOI, year, tag, or collection, then read the papers it finds.

The Agent can create collections, update their membership, propose tags, and correct metadata with source evidence. **Request approval** previews each batch of up to 50 operations. **Direct writes** applies validated batches for the current Zotero run. Both modes record changes in **Write history** for undo. Tag deletion has its own permission.

Zotero stores the conversation in its local profile. When the Agent cannot reopen the previous ACP session, the next prompt includes a recap of up to 12 turns and 48 KiB. To continue an interrupted job, send a new request.

## Approve and undo writes

When reading an attached PDF, the agent can propose updates to the parent Zotero item's type, bibliographic fields, and creators. The approval card shows the old and new values, including fields cleared when switching types. Approved updates are available in **Write history**.

Pass `itemType` to `read_paper_metadata` to look up the fields and creator roles supported by a target type. To propose the conversion, use `propose_zotero_write` with `operation: "update_metadata"` and `change: { "itemType": "journalArticle" }`. The same `change` can include fields and creators for the target type.

In **Request approval** mode, the sidebar shows each proposed target, operation, and payload. Confirm runs the reviewed changes in order. Cancel stops pending operations and lets any operation already in progress finish. The sidebar reports each outcome and keeps successful changes available under **Write history**. Undo restores the original note or tag state when the affected content still matches the recorded result. Choose **Read only** to disable agent write proposals. Tag deletion requires a separate opt-in in the same permissions menu.

The approval card follows the public interaction design of the [affectUI Approval Card](https://www.affectui.com/components/approval-card) and uses native Zotero DOM and styles.

## Development

- Set `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` to the Zotero executable and run `npm test` for integration tests in an isolated Zotero profile and library.
- Run `npm run test:library-restart` with the same executable setting to check Library Agent continuity across two Zotero processes using the same isolated profile and library.
- Set `SAPIENTIA_TEST_CODEX_ACP` to the absolute path of an authenticated Codex ACP adapter to also run the live paper test. It sends synthetic fixture data to the configured provider and checks a single-page answer, a selected passage, a range summary, and a sidebar citation jump.
- Run `npm run test:typecheck` for the test and source types and `npm run lint:check` for formatting and lint.
- For interactive development with `npm start`, see `.env.example` for Zotero profile and data directory settings.

Native Gecko subprocess transport was validated on Zotero 10.0.9 for macOS with Codex ACP and the fixture agent. Zotero launches and owns the agent process directly.

On Zotero 10.0.9 for macOS with Codex CLI 0.172.0 and Codex ACP 2.12.0, the live test answered a question from physical page 1, explained the selected text, and summarized pages 2–3 of a synthetic three-page PDF. Clicking the last citation opened physical page 3 of that attachment.

Library Agent acceptance passed on Zotero 10.0.9 for macOS with the repository's ACP fixture agent 1.0.0. In the isolated profile, the Agent found two papers, added both to a collection, and proposed a metadata correction with source evidence. The correction was approved and undone. A second Zotero process restored the same ACP session, searched the same library, and opened in approval mode with the interrupted write cancelled.

## Releases

GitHub Actions runs lint, type checking, the isolated Zotero fixture suite, and the production build for every PR and update to `master`. The run's `sapientia` artifact contains the XPI and its checksum.

1. Update `version` and `releaseTag` in `package.json` and synchronize the package lock. Keep `zoteroVersion` only when the XPI needs a distinct version string. Merge the version change into `master` and wait for CI.
2. Create and push the exact `releaseTag` on the tested `master` commit. The tag run builds, tests, and publishes the XPI and its SHA-256 checksum. An npm prerelease version publishes as a GitHub prerelease and updates the beta feed. A stable version updates the stable feed.
3. Download `sapientia.xpi` and `sapientia.xpi.sha256` from the release, check the files with `shasum -a 256 -c sapientia.xpi.sha256`, and install the XPI through Zotero's **Tools > Plugins** menu.

To switch from a beta to `v0.1`, install the stable XPI manually. Zotero sorts `v0.1` below the beta versions.

## Acknowledgments

- Thanks to [zotero-mcp](https://github.com/54yyyu/zotero-mcp) for examples of Zotero tools, PDF page reads, and citation navigation.
- Thanks to [llm-for-zotero](https://github.com/yilewang/llm-for-zotero) for examples of reader interactions, write approvals, and undo.
- Thanks to [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template) for the Zotero plugin bootstrap example.
- Thanks to [cc-llm4zotero-adapter](https://github.com/jianghao-zhang/cc-llm4zotero-adapter) for an example of connecting an external agent to Zotero through a local bridge.
