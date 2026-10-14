# Changelog

All notable changes to **Project Eric — OWASP Security Scanner** are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] — Initial release

### Added
- OWASP Top 10 (2021) scanner covering 13 languages.
- 15 global rules + per-language rule packs.
- Live security score on the VS Code status bar.
- Activity-bar tree view with findings grouped by OWASP category.
- Full-page dashboard webview with score ring, category coverage, improvement list, and per-file breakdown.
- Editor squigglies + Quick Fix actions (where a `replacement` snippet is provided).
- Hover documentation for every finding with OWASP / CWE links.
- Auto-scan on save (and optional on-type).
- Workspace-wide scan with progress notification.
- Configuration settings (`projectEric.*`) for severity threshold, enabled categories, languages, exclude patterns, etc.
- Browser build (`out/extension.web.js`) so the extension works in `vscode.dev` and GitHub Codespaces.