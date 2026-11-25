# Repository Guidelines

## Project Structure

The root `README.md` identifies the project. Start with `docs/PRD.md` for the draft requirements of Zotero ACP Agent. The proposed desktop plugin supplies Zotero context to a user-selected agent through the Agent Client Protocol (ACP). The agent analyzes that context and generates content. The plugin applies changes, such as creating notes or adding tags, through the Zotero API.

## Development and Verification

The repository currently contains documentation only. It has no plugin source, assets, local run command, build scripts, automated test suite, or coverage target.

Preview changed Markdown in your editor. Check that headings nest correctly, table rows render under the intended columns, and links open their targets. Run `git diff --check` for whitespace errors in unstaged changes to tracked files. After staging new or edited documents, run `git diff --cached --check` to check what the commit will include.

## Documentation Style

When editing the PRD, follow its Chinese prose and numbered heading hierarchy. Reuse its terminology for Zotero items, PDF text, and annotations. Spell out Agent Client Protocol on first mention and use ACP thereafter. Describe proposed features as planned behavior so readers can distinguish requirements from implemented capabilities.

## Commits and Pull Requests

The history contains only `first commit`, so there is no established commit message convention. Use a descriptive subject such as `Clarify PDF annotation scope`. In a pull request, identify the affected requirement, explain why it changed, and link the related issue when one exists.
