# Sapientia

Zotero 10 plugin for chatting with your own Agent Client Protocol (ACP) agent in a sidebar alongside the library and reader tabs.

## Build and install

Run `npm ci` and `npm run build` with Node.js 22 or newer. Install the `.xpi` from `.scaffold/build` through Zotero's **Tools → Plugins** menu.

Open the sidebar from the **Sapientia** toolbar button. The composer lists the Claude Code, Codex, and OpenCode installations it finds on this machine. Claude Code and Codex use an ACP adapter, which may be downloaded by `npx` on first use when no adapter is installed. OpenCode uses its built-in ACP command.

For another ACP agent, open **Settings → Sapientia** and save an agent profile with its executable, arguments, working directory, and any required environment variables. Use an absolute executable path if needed.

## Development

- Set `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` to the Zotero executable and run `npm test` for integration tests in an isolated Zotero profile and library.
- Run `npm run test:typecheck` for the test and source types and `npm run lint:check` for formatting and lint.
- For interactive development with `npm start`, see `.env.example` for Zotero profile and data directory settings.

Native Gecko subprocess transport was validated on Zotero 10.0.9 for macOS with Codex ACP and the fixture agent. Zotero launches and owns the agent process directly.
