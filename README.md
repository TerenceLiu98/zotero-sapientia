# zotero-sapientia

Zotero 10 plugin for chatting with your own Agent Client Protocol (ACP) agent in a sidebar alongside the library and reader tabs.

## Build and install

Run `npm ci` and `npm run build` with Node.js 22 or newer. Install the `.xpi` from `.scaffold/build` through Zotero's **Tools → Plugins** menu.

Open the sidebar from the **Zotero ACP Agent** toolbar button. The composer lists the Claude Code, Codex, and OpenCode installations it finds on this machine. Claude Code and Codex use an ACP adapter, which may be downloaded by `npx` on first use when no adapter is installed. OpenCode uses its built-in ACP command.

For another ACP agent, open **Settings → Zotero ACP Agent** and save an agent profile with its executable, arguments, working directory, and any required environment variables. Use an absolute executable path if needed.

## Paper access

Open **Settings → Zotero ACP Agent** to control which parts of the current paper the agent can read. Metadata, PDF text, the current PDF selection, annotations, child notes, and tags are enabled by default. The plugin binds each request to the paper selected when the prompt was sent. The agent can request a physical PDF page, an inclusive range, or the full attachment. A scanned page without a text layer requires OCR in the agent's toolset.

The plugin registers its loopback Model Context Protocol (MCP) endpoint when the agent advertises HTTP MCP over ACP. The local Codex configuration used for verification had no Zotero MCP tools, so the endpoint covers those reads directly with Zotero's bundled document worker.

## Approve and undo writes

When an agent proposes a child note or tag change, the sidebar shows each target, operation, and payload. Confirm runs the reviewed changes in order. Cancel stops pending operations and lets any operation already in progress finish. The sidebar reports each outcome and keeps successful changes available under **Write history**. Undo restores the original note or tag state when the affected content still matches the recorded result. Tag deletion requires an additional opt-in under **Settings → Zotero ACP Agent**.

The approval card follows the public interaction design of the [affectUI Approval Card](https://www.affectui.com/components/approval-card) and uses native Zotero DOM and styles.

## Development

- Set `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` to the Zotero executable and run `npm test` for integration tests in an isolated Zotero profile and library.
- Set `SAPIENTIA_TEST_CODEX_ACP` to the absolute path of an authenticated Codex ACP adapter to also run the live paper test. It sends synthetic fixture data to the configured provider and checks a single-page answer, a selected passage, a range summary, and a sidebar citation jump.
- Run `npm run test:typecheck` for the test and source types and `npm run lint:check` for formatting and lint.
- For interactive development with `npm start`, see `.env.example` for Zotero profile and data directory settings.

Native Gecko subprocess transport was validated on Zotero 10.0.9 for macOS with Codex ACP and the fixture agent. Zotero launches and owns the agent process directly.

On Zotero 10.0.9 for macOS with Codex CLI 0.172.0 and Codex ACP 2.12.0, the live test answered a question from physical page 1, explained the selected text, and summarized pages 2–3 of a synthetic three-page PDF. Clicking the last citation opened physical page 3 of that attachment.
