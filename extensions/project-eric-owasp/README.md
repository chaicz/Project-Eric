# Project Eric — OWASP Security Scanner

A VS Code extension that scans your code against the **OWASP Top 10 (2021)** and surfaces:

- A **live security score** (0–100, plus an A+ → F grade) on the status bar.
- **Squiggly underlines** in the editor with one-click fixes.
- A **tree view** in the activity bar listing every finding, grouped by OWASP category.
- A **full-page dashboard** with score, per-category coverage, improvement list, and per-file grades.
- **Hover documentation** for every finding, with links to the OWASP / CWE pages.
- **Auto-scan on save** (and optional on-type), with workspace-wide rescans.

It runs on **desktop VS Code**, **vscode.dev** (no install), and **GitHub Codespaces**.

The scanner is a **function inside code-server** — `scanKeyCode(document)` — that reads the
file you have open (your "key code") and returns a `ScanResult`. The previous
"MCP Security Scanner" server-style flow is gone; everything happens inside
the editor.

---

## Install

### From Open VSX / vscode.dev (when published)

1. Open `https://vscode.dev/`.
2. Hit `Ctrl+Shift+X` / `Cmd+Shift+X` to open Extensions.
3. Search for **Project Eric — OWASP Security Scanner** and click *Install*.

### From a `.vsix` (local)

1. Run `npm install && npm run package` in this directory.
2. In VS Code, run *Extensions: Install from VSIX* and pick the generated `.vsix` file.

---

## Use

| Shortcut              | Command                                | What it does                                         |
|-----------------------|----------------------------------------|------------------------------------------------------|
| `Ctrl+Shift+K`        | `Project Eric: Scan Key Code`          | **Recommended.** Runs `scanKeyCode()` on the file in the editor — the canonical in-code-server function. |
| `Ctrl+Shift+S`        | `Project Eric: Scan Current File`      | Same as Scan Key Code (legacy alias).                |
| `Ctrl+Shift+D`        | `Project Eric: Open Security Dashboard` | Open the webview dashboard.                          |
| —                     | `Project Eric: Scan Workspace`        | Scan every supported file in the workspace.          |
| —                     | `Project Eric: Toggle Auto-scan`       | Flip the `projectEric.autoScan` setting.             |
| —                     | `Project Eric: Apply Suggested Fix`    | Run from the *Quick Fix* menu on a squiggly.         |
| —                     | `Project Eric: Mark False Positive`    | Hide a finding from future scans.                    |

Right-click any source file → **Project Eric: Scan Current File**.

---

## What gets scanned

The bundled pack covers:

- **All OWASP 2021 categories** — A01 Broken Access Control through A10 SSRF.
- **13 languages** — JavaScript, TypeScript, Python, Java, PHP, Go, Rust, Ruby, SQL, C++, C#, HTML, CSS.
- **15 global rules** plus per-language overrides (MD5/SHA-1, hardcoded credentials, SQL/command injection, XSS, eval, debug mode, weak password rules, plaintext passwords, unsafe deserialisation, SSRF, etc.).

Each rule carries:

- `severity` — `critical`, `high`, `medium`, `low`, `info`.
- `category` — OWASP A01–A10.
- `cwe[]` — linked CWE ids.
- `fix` — title, hint, optional `replacement` snippet, and `docUrl`.
- `references[]` — shown in the hover tooltip.

---

## How the score works

```
score = clamp(100 - Σ deductions, 0, 100)
deduction per finding:
  critical  → 20
  high      → 10
  medium    → 5
  low       → 2
  info      → 1
```

Two extra penalties:

- **Cross-category** — if a file has findings in ≥ 3 OWASP categories, deductions are multiplied by 1.25; ≥ 5 categories → ×1.5. Security debt that spans categories is structurally harder to fix.
- **Workspace average** — files are weighted by `log(lineCount + 10)` so tiny config files can't drown out a real source file's score.

Grade thresholds:

| Grade | Range   | Colour |
|-------|---------|--------|
| A+    | ≥ 95    | green  |
| A     | 85–94   | green  |
| B     | 70–84   | lime   |
| C     | 55–69   | yellow |
| D     | 40–54   | orange |
| E     | 25–39   | red    |
| F     | 0–24    | dark red |

---

## As a function (no server)

The scanner is also exported as a **single, dependency-free JavaScript file** that you can
load from any code-server webview, drop into a user-script, or `require()` from Node:

```
dist/project-eric-scanner.js        ← IIFE bundle, full size, with source map
dist/project-eric-scanner.min.js    ← IIFE bundle, minified (49 KB) — use this in code-server
dist/project-eric-scanner.cjs.js    ← CommonJS bundle for Node consumers
```

### From the command palette

```
> Project Eric: Open Standalone Scanner (function)
```

Opens a side webview panel that loads the bundle and exposes `window.ProjectEric`.
Click **Pull from active editor** to scan whatever you have open.

### From the DevTools console

Once the panel is open (or after dropping the bundle via a user-script), open DevTools
(`F12` → Console) and run:

```js
ProjectEric.scan(code, 'javascript');          // run a scan
ProjectEric.scanMcp(code);                     // force MCP rules
ProjectEric.score(scanResult);                 // 0–100 + A–F
ProjectEric.languages();                       // list supported languages
ProjectEric.scan(findings.map(f => f.matchText).join('\n'), 'sql');  // chain it
```

### From your own code-server webview / user-script

```html
<script src="../extensions/project-eric-owasp/dist/project-eric-scanner.min.js"></script>
<script>
  const result = ProjectEric.scan(myCodeString, 'typescript');
  console.log(result.findings);
</script>
```

### From Node

```js
const eric = require('./dist/project-eric-scanner.cjs.js');
const result = eric.scan(src, 'javascript');
console.log(result.findings.length, 'findings');
```

This replaces the old "MCP Security Scanner" standalone React page. There is **no
separate server** — the same OWASP pack and rule engine run inside code-server itself
every time `scan()` is called.

---

## Settings

| Setting                         | Type      | Default | Notes                                        |
|---------------------------------|-----------|---------|----------------------------------------------|
| `projectEric.autoScan`          | boolean   | `true`  | Scan the active file on save.                |
| `projectEric.scanOnType`        | boolean   | `false` | Scan as you type. Off by default for perf.   |
| `projectEric.minSeverity`       | string    | `low`   | Hide findings below this severity.           |
| `projectEric.enabledCategories` | string[]  | all     | Whitelist OWASP categories to enable.         |
| `projectEric.languages`         | string[]  | all 13  | Whitelist of languages to scan.              |
| `projectEric.excludePatterns`   | string[]  | —       | Glob patterns to skip on workspace scans.    |
| `projectEric.apiUrl`             | string    | empty   | Optional Project Eric backend for AI extras. |
| `projectEric.sharingEnabled`    | boolean   | `false` | Anonymously share findings to improve rules. |

---

## Project layout

```
extensions/project-eric-owasp/
├── package.json              ← extension manifest (commands, views, settings, keybindings)
├── tsconfig.json
├── .vscodeignore
├── README.md                 ← you are here
├── CHANGELOG.md
├── data/
│   ├── owasp-pack.json       ← OWASP categories + global rules + language packs
│   └── owasp-severity.language-configuration.json
├── media/
│   ├── icon.svg              ← activity-bar icon
│   └── standalone-scanner.css ← styles for the standalone scanner webview
├── scripts/
│   ├── build-browser.js      ← bundle src/ → out/extension.web.js (for vscode.dev)
│   ├── build-standalone.js   ← bundle src/standalone → dist/project-eric-scanner.{js,min.js,cjs.js}
│   ├── test-scanner.js       ← smoke test for scanCode()
│   ├── smoke-standalone.js   ← smoke test for the standalone bundle
│   └── verify-examples.js
├── src/
│   ├── extension.ts          ← activate/deactivate, command registration
│   ├── standalone/
│   │   └── projectEricStandalone.ts  ← entry point for window.ProjectEric
│   ├── types.ts              ← shared types
│   ├── util/
│   │   └── pathSafe.ts       ← tiny browser-safe path helpers (for vscode.dev)
│   ├── scanner/
│   │   ├── packLoader.ts     ← loads OWASP pack + language packs from data/
│   │   └── scanner.ts        ← regex rule engine + dedup + sort
│   ├── scoring/
│   │   └── scoreCalculator.ts← 0-100 score + grade bands + improvements list
│   ├── providers/
│   │   ├── statusBar.ts      ← live score in the bottom-left status bar
│   │   ├── securityTreeProvider.ts ← activity-bar tree view
│   │   ├── dashboardWebview.ts     ← full-page dashboard
│   │   └── standaloneScannerWebview.ts ← side panel running ProjectEric.scan()
│   └── diagnostics/
│       └── diagnosticManager.ts    ← squigglies + Quick Fix + hover provider
└── dist/
    ├── project-eric-scanner.js     ← IIFE bundle, full size (drop-in <script>)
    ├── project-eric-scanner.min.js ← IIFE bundle, minified (use this)
    └── project-eric-scanner.cjs.js ← CommonJS bundle for Node
```

---

## Development

```bash
# 1. install deps
npm install

# 2. type-check + bundle for desktop + browser
npm run compile

# 3. build the standalone bundle (used by DevTools console & user-scripts)
npm run build:standalone

# 4. do everything in one shot
npm run build:all

# 5. run the smoke tests (scanner + standalone bundle)
npm run test

# 6. watch mode
npm run watch

# 7. package as .vsix (requires `vsce`)
npm run package
```

The output `out/extension.js` is the desktop build; `out/extension.web.js` is the
browser build that vscode.dev uses (loaded via the `browser` field in
`package.json`). `dist/project-eric-scanner.min.js` is the bundled scanner that the
standalone webview and any user-script consume.

---

## License

MIT — see `LICENSE`.