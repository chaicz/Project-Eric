# Changelog

All notable changes to **Project Eric — OWASP Security Scanner** are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.2.0] — Standalone function form

### Added
- **Standalone scanner bundle** — `dist/project-eric-scanner.{js,min.js,cjs.js}`. Self-contained JavaScript with the OWASP pack inlined. Exposes `window.ProjectEric.scan(code, language)`, `window.ProjectEric.scanMcp(code)`, and `window.ProjectEric.score(result)`. No `vscode` dependency, no separate server.
- **`Project Eric: Open Standalone Scanner (function)`** command — opens a side panel that loads the bundle and lets you either pull from the active editor or paste code. Press `Ctrl+Enter` to scan.
- **`Project Eric: Scan Key Code (MCP rules)`** command — alias of the existing MCP scanner under the new `scanKeyCodeAsMcp` name. Bound to `Ctrl+Shift+M`.
- Fresh activation events (`onStartupFinished`, `onCommand:projectEric.security.scanKeyCode`, `onCommand:projectEric.security.scanKeyCodeAsMcp`, `onCommand:projectEric.security.openStandaloneScanner`) so the commands appear in the palette immediately.
- Short titles (`"Scan Key Code"`, `"Scan as MCP"`, `"Open Standalone Scanner"`) so the palette shows them with cleaner labels.
- Smoke test for the standalone bundle (`scripts/smoke-standalone.js`) wired into `npm test`.

### Changed
- Pulled the MCP-scanner body into a shared `runScanKeyCodeAsMcp()` helper so the two command ids (`scanMcpServer` and `scanKeyCodeAsMcp`) stay in lock-step.
- `.vscodeignore` now keeps `dist/` so the standalone bundle ships in the `.vsix`.

## [0.1.0] — Initial release

### Added
- OWASP Top 10 (2021) scanner covering 13 languages.
- **In-code-server scanner function** `scanKeyCode(document)` — the canonical way to run the scanner. Reads the active file (your "key code") and returns a `ScanResult`. The previous "MCP Security Scanner" server-style flow is gone; the scanner is now a single first-class function inside code-server. Bind it to `Ctrl+Shift+K` (default), invoke it from the command palette, or call it from your own commands.
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