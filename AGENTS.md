# Repository Guidelines

1. 不保留向后兼容：过时东西直接删，别写迁移脚本和回退方案。
2. 极简主义：选满足当前需求的最简实现，绝不搞“预防性抽象”; UI 上只保留必须的问题, 不要在界面上进行功能描述。
3. 小步快跑：先跑通最小端到端版本，别为了臆想的未来去拆当前能跑的架构。
4. 模块化：组件保持独立，关注点分离清楚。
5. 别造轮子：优先用成熟的、有人维护的第三方库。
6. 先查再写：动手前先翻翻项目里已有的依赖，别想当然瞎引包。
7. 架构要有远见：绝不接受“先凑合，以后再说”的临时屎山。
8. 抄作业：先看成熟产品怎么解决，用验证过的模式，别从零发明。
9. 多用 subagent 和 worktree 并行完成可以并行完成的任务

## Project Structure

Start with `README.md` for setup and `docs/PRD.md` for product requirements. Sapientia connects Zotero to a user-selected agent through the Agent Client Protocol (ACP). The source is in `src/`, the Zotero bootstrap and resources are in `addon/`, and integration tests and fixtures are in `test/`. Keep session handling, Zotero tools, write approvals, and the UI in their respective modules.

## Development and Verification

Use Node.js 22 and `npm ci`. Run `npm start` for local development or `npm run build` to package the plugin. Run `npm run lint:check`, `npm run test:typecheck`, and `npm test` to verify changes. `npm test` uses an isolated Zotero profile and library. Set `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` to a Zotero 10 executable when needed.

Use the GitHub Actions build and release procedure in `README.md` for distributable packages.

Preview changed Markdown in your editor. Check that headings nest correctly, table rows render under the intended columns, and links open their targets. Run `git diff --check` for whitespace errors in unstaged changes to tracked files. After staging new or edited documents, run `git diff --cached --check` to check what the commit will include.

## Documentation Style

When editing the PRD, follow its Chinese prose and numbered heading hierarchy. Reuse its terminology for Zotero items, PDF text, and annotations. Spell out Agent Client Protocol on first mention and use ACP thereafter. Describe proposed features as planned behavior so readers can distinguish requirements from implemented capabilities.

## Commits and Pull Requests

Use a descriptive commit subject such as `Clarify PDF annotation scope`. In a pull request, identify the affected requirement, explain why it changed, link the related issue, and record the checks that passed.
