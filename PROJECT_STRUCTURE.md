# Project Eric — Project Structure & Function Summary

> **Project Eric** is a browser-based, security-first IDE. The dashboard app is built with React 18 + Vite, and it wraps two satellite toolchains: a **PHP/MySQL REST API** (auth, teams, audit logs) and two **VS Code / code-server extensions** (an in-editor OWASP scanner and a Yjs-based real-time collaboration layer). The core security value proposition — static analysis against the OWASP Top 10 — runs **entirely in the browser** against static rule packs, so no user source code leaves the machine by default.

This document describes the layout as it exists today and how the pieces connect at runtime.

---

## 1. Top-level layout

```
.
├── src/                        # React 18 + Vite frontend (the dashboard app)
│   ├── components/             # Shared UI: layout, auth, toast, page chrome
│   ├── pages/                  # One file per route (27 route pages)
│   ├── context/AppContext.jsx  # Global client state (user, theme, last scan)
│   ├── services/               # API client, code runner, AI provider client
│   ├── utils/                  # OWASP pack loader, suggestions, mock data
│   ├── App.jsx                 # Router + route guards
│   ├── main.jsx                # React bootstrap
│   └── index.css               # Tailwind layers + custom keyframes
│
├── public/
│   ├── extensions/             # Static analysis rule packs (fetched at runtime)
│   │   ├── manifest.json       # Language registry + pack metadata
│   │   ├── owasp-pack.json     # OWASP Top 10 (2026) ruleset: A01–A10
│   │   └── *.lang.json         # 13 per-language packs with syntax + OWASP rules
│   └── …                       # Logos, team photos, onboarding/background images
│
├── xampp-backend/project-eric-api/   # PHP 8 REST API (runs under Apache/XAMPP)
│   ├── api/auth/               # login, register, logout, oauth, validate, reset
│   ├── api/features|team/      # Public content endpoints
│   ├── api/landing.php, info.php
│   ├── config/config.php       # DB credentials, JWT secret, CORS
│   └── includes/               # Database.php, JWTAuth.php, ResponseHelper.php
│
├── database/setup.sql          # `project_eric` schema — 15 tables + seed data
│
├── extensions/                  # VS Code / code-server extensions
│   ├── project-eric-owasp/     # In-editor OWASP scanner (TS → vsix)
│   └── eric-collab/            # Real-time collaborative editing (Yjs) (TS → vsix)
│
├── scripts/                     # PowerShell launchers + Vite dev middleware
│   ├── run-project.ps1         # Starts Vite + code-server + Yjs relay
│   ├── setup-ide.ps1 / start-ide.ps1
│   ├── deploy-xampp-api.cjs    # Copies the PHP API into C:\xampp\htdocs
│   ├── new-user-test.cjs       # End-to-end test: sign up, walk the system,
│   │                           #   assert the new account sees no data
│   └── dev-server-plugin.js    # Vite middleware exposing /api/run-project*
│                                # and /api/code-server*
│
├── Project_Docs/                # SDLC artefacts (spec, personas, use cases, Gantt)
├── artifacts/                   # Packaged .vsix files
├── SPEC.md                      # Visual & interaction design specification
├── README.md / PROJECT_DESCRIPTION.md
└── package.json                 # Scripts + dependencies
```

---

## 2. The frontend runtime

### 2.1 Bootstrapping and routing

`index.html` → `src/main.jsx` → `src/App.jsx`. `App.jsx` nests providers in this order:

```
ErrorBoundary → AppProvider → ToastProvider → BrowserRouter → Routes
```

Three route-guard wrappers decide what a visitor sees:

| Guard | Rule |
|---|---|
| `PublicRoute` | Wraps the page in `PageTransition` only. Used for landing, legal pages, and `/viewer`. |
| `AuthRoute` | Redirects logged-in users to `/onboarding` or `/dashboard`. Used for login, signup, forgot-password. |
| `ProtectedRoute` | Requires a user; if onboarding is incomplete it forces `/onboarding`; if complete it bounces `/onboarding` back to `/dashboard`. Wraps the authenticated `Layout` shell. |

Routes fall into four bands: public marketing (`/landing`), auth (`/login`, `/signup`, `/forgot-password`), onboarding (`/onboarding`), and the authenticated app — `/dashboard`, `/analysis`, `/threats`, `/reports`, `/team`, `/about-team`, `/api-keys`, `/audit-logs`, `/notifications`, `/sandbox`, `/owasp-analysis`, `/owasp`, `/ide`. Everything unmatched redirects to `/landing`.

`Layout.jsx` provides the authenticated shell: a collapsible sidebar grouped into **Main / Tools / System** sections, a sticky header with breadcrumbs, search palette (⌘K), help, theme toggle, notifications dropdown, and profile dropdown. The `<Outlet>` is keyed on `location.pathname` so each nested route remounts and replays its entrance animation.

### 2.2 Global state (`src/context/AppContext.jsx`)

A single React Context owns everything persistent, all mirrored into `localStorage`:

| Key | Meaning |
|---|---|
| `project-eric_user` | The signed-in user object (`id`, `name`, `email`, `role`, `onboardingComplete`, …) |
| `project-eric_onboarding` | Wizard answers (role, experience, languages, security focus) |
| `project-eric_theme` | `light` / `dark` — toggles the `dark` class on `<html>` |
| `project-eric_accent` | Accent hex, applied as the `--accent-color` CSS variable |
| `project-eric_last_scan` | The most recent OWASP scan result (findings, score, timestamp) |

**The last-scan key is the spine of the product flow.** The OWASP Scanner writes to it; Analysis, Threats, Reports, and the Dashboard read from it. Without a scan in context, Analysis and Threats deliberately show *empty* states rather than pre-seeded mock findings, so every counter reflects real user activity.

Auth is currently **mocked**: `login(email, password, provider)` fabricates a user object and derives a display name from the email (with separate formatting rules for Google and GitHub). The real `authAPI` client exists in `src/services/api.js` and is wired to the PHP backend, but the Context does not call it yet.

### 2.3 The scanning engine — three parallel implementations

This is the most important structural fact: OWASP detection exists in three places, each suited to a different host.

**(a) `src/pages/OWASPScanner.jsx` — the in-app scanner.**
Self-contained detectors (`detectA01_BrokenAccessControl` … `detectA10_SSRF`) written as plain regex/heuristic functions. Every detector returns an identical shape:

```js
{ id, name, status: 'pass'|'warning'|'fail', count, severity,
  description, cwe, remediation, evidence: [{ line, snippet }] }
```

The page supports two modes: **code mode** (11 language presets, each with its own intentionally-vulnerable sample) and **SQL mode** (6 dialects: MySQL, Postgres, T-SQL, SQLite, Oracle, generic — where A03 additionally hunts UNION injection, boolean tautologies, and stacked queries). `runScan()` streams each detector result through a progress callback, then computes a score as `100 − (totalIssues × 4)`, bucketed into Low / Medium / High Risk, and publishes the payload to `AppContext`.

**(b) `src/utils/owaspPackLoader.js` — the data-driven scanner.**
Loads `manifest.json`, `owasp-pack.json`, and `<lang>.lang.json` from `/extensions/`, with an in-memory + in-flight promise cache. `analyse(code, languageId, onProgress)` merges each category's `_all` patterns with the language-specific patterns *and* any overrides embedded in the language file, runs them per line, accumulates a weighted score, and derives status: `score ≥ 4 → fail`, `score ≥ 1 → warning`, else `pass`. Evidence is capped at 8 entries. This module never executes, transpiles, or interprets the user's code — it is regex analysis only, and it never throws (a failed pack load degrades to an empty list).

**(c) `extensions/project-eric-owasp/src/scanner/scanner.ts` — the VS Code extension engine.**
A pure, I/O-free TypeScript port of the same model. It builds a line index for O(log n) offset→line lookups, computes line/column offsets, wraps matches in a 4-line excerpt, and deduplicates by `(ruleId, column, matchText)`. The extension surfaces results in four places: squiggly **diagnostics** on the editor, a **status-bar score**, an **activity-bar tree view** of all findings, and a full **dashboard webview**. It ships in `dist/` as `project-eric-scanner.js` / `.cjs.js` / `.min.js` and packages to `artifacts/project-eric-owasp-0.1.0.vsix`.

**(d) The rule pack itself** (`public/extensions/owasp-pack.json`, id `owasp-top-10-2026`, v1.1.0).
Declarative: ten categories (A01–A10) each with `defaultSeverity`, `cwe`, a remediation string, and a `patterns` map of per-language regex rules carrying a `weight` and a human `label`. Because coverage lives in JSON rather than code, extending the ruleset does not require touching the engines.

### 2.4 Remediation guidance (`src/utils/owaspSuggestions.js`)

`buildSuggestion(categoryId, language, mode)` returns a structured remediation pack per finding: a one-line **summary**, language-tuned **before/after** code pairs (JavaScript, TypeScript, Python, Java, C#, Go, PHP, Ruby, Rust, C/C++ — with a separate SQL variant for A03), an ordered list of **changes**, a manual **checklist**, and authoritative **references** (OWASP cheat sheets, MITRE CWE, OWASP Top 10 pages). The Scanner renders these inline beneath each finding.

### 2.5 The sandbox IDE (`src/pages/Sandbox.jsx` + `src/services/codeRunner.js`)

A browser-only code workspace. The project model is a tree of `{ id, name, type: 'folder'|'file', language, content, children }` persisted to `localStorage` under `project-eric_sandbox_project_v1`, seeded with a small HTML/CSS/JS demo app.

`codeRunner.js` provides:
- **`LANGUAGES`** — a registry of 20 languages, each tagged `canRun: true | 'partial' | false`.
- **`RUNNERS`** — per-language execution pipelines. HTML/CSS/JS/Markdown render into a preview iframe; JSON validates and pretty-prints; SQL and YAML run lightweight structural checks; everything else falls through to `source`, which shows a syntax-highlighted source preview and says plainly that the browser cannot run it.
- **`SANDBOX_BRIDGE_ONLY`** — a script injected into every sandboxed iframe that monkey-patches `console.*` and the `error` / `unhandledrejection` handlers to `postMessage` logs back to the parent page.
- **`runSingleLanguageTest` / `runAllLanguageTests`** — a sweep that runs every language with a deterministic sample and reports pass/warning/fail in the same shape as an OWASP finding, with a 4-second execution timeout.

Only HTML, CSS, JavaScript, JSON, and Markdown genuinely execute; TypeScript, Python, Java, C++, C, C#, Go, Rust, PHP, and Ruby are preview-only. The UI states this explicitly rather than pretending to run them.

### 2.6 AI integration (`src/services/aiService.js`)

A single client over six providers — OpenAI, Anthropic, Google Gemini, OpenRouter, Grok, Cursor. Each provider has its own endpoint and model list; the model list is dated to the "current" generation and includes a migration table (`DEPRECATED_MODEL_IDS`) that rewrites stale model IDs saved in `localStorage` up to the provider's current default.

- `detectProvider(apiKey)` infers the provider from the key prefix (`cursor-`, `sk-ant-`, `sk-or-`, `xk-`, `AIza`, `sk-`), checked in that order.
- `callAI(messages, opts)` normalises the message list per provider — OpenAI-compatible providers get a `system` message inline, Anthropic gets a separate `system` field, Gemini gets `contents` with `user`/`model` roles.
- Three task wrappers: **`generateFix`** (returns a corrected full file in a single fenced block), **`explainIssue`** (Why it matters / How to fix / Fixed snippet in Markdown), and **`suggestBuildImprovements`** (quick wins / refactors / hardening for the Sandbox).

Config lives in `localStorage` under `project-eric_ai_config` and is managed from the `/api-keys` page, with a `testAIConnection` ping.

### 2.7 API client (`src/services/api.js`)

A thin `fetch` wrapper around `VITE_API_URL` (default `http://localhost/project-eric-api/api`). `apiCall` attaches a `Bearer` token from `localStorage.token` when present and throws on non-2xx. Exposes `authAPI` (login, register, validate, oauth, forgot/reset password) and `publicAPI` (landing, features, team).

### 2.8 Supporting components

`Toast.jsx` provides a global toast queue; `ErrorBoundary.jsx` catches render errors; `PageTransition.jsx` and `PageTip.jsx` drive the entrance animation and the contextual hint banners; `EmptyState.jsx` renders the empty states used by Analysis and Threats; `BackgroundSlideshow.jsx` and `WelcomeTour.jsx` handle the landing imagery and the first-run tour; `auth/` contains the split-panel login/signup components (`BrandPanel`, `AuthInput`, `FormShell`, `FadeIn`); `layout/` contains `Layout.jsx` and `ThemeToggle.jsx`.

### 2.9 Mock data (`src/utils/securityData.js`)

Static fixtures for OWASP category metadata and a set of realistic vulnerabilities (CWE mappings, CVSS scores, remediation text) used by pages that need illustrative content. The scanner path deliberately bypasses these in favour of real findings.

---

## 3. The backend (`xampp-backend/project-eric-api/`)

A plain PHP 8 REST API intended to live at `C:\xampp\htdocs\project-eric-api\`.

> **Apache serves a copy, not the workspace.** After editing anything under
> `xampp-backend/project-eric-api/`, run `node scripts/deploy-xampp-api.cjs`
> to mirror the tree into the XAMPP install — otherwise the change is not
> live.

- **`config/config.php`** — DB constants (`project_eric`, `root`, empty password — XAMPP defaults), `JWT_SECRET`, a 7-day token expiry, permissive CORS with an OPTIONS preflight short-circuit, and `SITE_URL` pointing at the Vite dev server.
- **`includes/Database.php`** — PDO singleton with prepared-statement helpers.
- **`includes/JWTAuth.php`** — HS256 token generation and verification.
- **`includes/ResponseHelper.php`** — `sendError` / JSON response helpers and input sanitisation.
- **`api/auth/`** — `login.php` (prepared-statement user lookup, `password_verify` against `password_hash`, `is_active` check, `last_login` update, JWT issuance), plus `register.php`, `logout.php`, `oauth.php`, `validate.php`, `forgot-password.php`, `reset-password.php`.
- **`api/features/index.php`, `api/team/index.php`, `api/landing.php`, `api/info.php`** — public content.

**`database/setup.sql`** creates the `project_eric` database and fifteen tables: `users`, `teams`, `team_members`, `projects`, `scan_results`, `vulnerabilities`, `threats`, `scans`, `api_keys`, `audit_logs`, `notifications`, `integrations`, `features`, `team_info`, `user_workspaces`.

Import it through **phpMyAdmin → Import**, or from a terminal:

```
C:\xampp\mysql\bin\mysql.exe -u root < database\setup.sql
```

The script drops and recreates the database, so it always produces the same starting state. Ownership is strict: every project, finding and scan belongs to exactly one account, and the API filters on `user_id = ?` alone. A newly registered account therefore starts on an **empty** workspace — zero projects, zero findings, zero scans — and only ever sees the rows it created itself.

The seed data itself (three sample projects, eight findings, five scans) belongs to the demo account `demo@project-eric.com` / `demo123`, so the dashboard can be demonstrated with realistic figures without any other account inheriting them. The other seeded logins are `developer@gmail.com`, `developer@github.com` and `user@example.com`, all with the password `demo123`.

---

## 4. The VS Code / code-server extensions

### 4.1 `extensions/project-eric-owasp/`

The in-editor scanner. `extension.ts` activates the extension: loads the packs, registers the status bar, tree provider, dashboard webview, standalone scanner webview, and diagnostic manager, then scans on demand or on save. `diagnostics/diagnosticManager.ts` publishes squiggly underlines and hover explanations and can offer a **quick-fix**; `scoring/scoreCalculator.ts` produces the per-file and workspace scores plus ranked "improvements"; `providers/` contains the tree view, status bar, and both webviews; `util/pathSafe.ts` handles POSIX-safe path manipulation for cross-platform file URIs. The `data/owasp-pack.json` and `examples/` folder ship vulnerable *and* secure sample files for each of 13 languages for manual verification.

### 4.2 `extensions/eric-collab/`

Real-time collaborative editing over Yjs.

- **`collabClient.ts`** — connects to a Yjs `WebsocketProvider`, manages the shared document and awareness.
- **`tunnelManager.ts`** — opens a **localtunnel** so guests can reach the host's local code-server through a public subdomain, and re-registers the same subdomain after a code-server refresh so existing invite links keep working.
- **`roomManager.ts`** — generates 8-character dash-separated room codes (e.g. `KQ7P-3XRN`) and builds/parses invite URLs.
- **`userPresence.ts`** — persists a local display identity in the extension's global state.
- **`sidebarView.ts` / `statusBar.ts`** — the UI surfaces for session state and participant/permission management.
- **`scripts/yjs-server.js`** — a self-hosted Yjs signalling relay (port 1234, `DATA_DIR` for persistence) for deployments that cannot reach a public signalling server.

### 4.3 `extensions/p2p-live-share/`

Real-time collaborative editing over Yjs, using the upstream P2P Live Share extension as the base.

- **`src/sync/ws/protocol.ts`** — the signalling wire protocol: uplink/downlink message shapes, the `[uint32 metadata length][metadata JSON][payload bytes]` packing for binary payloads, and the `__update_peers__` action.
- **`src/sync/ws/server.ts`** — an in-process signalling server used when the host runs locally.
- **`src/sync/ws/guest.ts` / `host.ts`** — the client halves. The guest connects to `ws://<relay>/<roomId>/<peerId>`; the host runs the server in-process.
- **`src/configs.ts`** — the `p2p-live-share.relayUrl` and `p2p-live-share.publicRelayUrl` settings. `relayUrl` is the relay the host connects to; `publicRelayUrl` is the address advertised to guests, which is what lets the host reach the relay over loopback while guests come in through a public tunnel.
- **`scripts/p2p-relay-server.mjs`** (at the repo root, not in the extension) — a standalone relay that speaks the same protocol, so a session can be joined by a stock P2P Live Share client. See section 5.

---

## 5. The local development stack

`scripts/run-project.ps1` launches four detached background processes and writes logs to `./logs/`:

| Service | Port | Purpose |
|---|---|---|
| Vite dev server | 5173 | The React dashboard |
| code-server | 8080 | The real VS Code workbench (where the scanner extension runs) |
| Yjs relay | 1234 | Self-hosted collaboration signalling for Eric Collab (optional) |
| P2P Live Share relay | 1235 | Self-hosted signalling for the P2P Live Share extension (optional) |

The two relays serve different extensions and speak different wire protocols, so they run side by side on separate ports. The Yjs relay (`extensions/eric-collab/scripts/yjs-server.js`) backs Eric Collab; the P2P Live Share relay (`scripts/p2p-relay-server.mjs`) backs the `p2p-live-share` extension.

`scripts/p2p-relay-server.mjs` implements the P2P Live Share signalling protocol exactly, so a session hosted by this project's build of that extension can be joined by a stock P2P Live Share client. A client connects to `ws://<relay>/<roomId>/<peerId>` and sends uplink frames of the form `{ action, data, targetPeers?, metadata? }`; the relay forwards them to the other room members as `{ action, data?, peerId, metadata? }`. Binary payloads travel packed as `[uint32 metadata length][metadata JSON][payload bytes]`, and the relay pushes `{ action: '__update_peers__', data: [peerId, …] }` whenever a room's membership changes. Run `npm run relay:test` to exercise the whole protocol against a live relay.

`scripts/dev-server-plugin.js` is a Vite middleware that exposes `POST /api/run-project`, `GET /api/run-project-status`, `GET /api/run-project-logs`, and a dedicated code-server trio: `GET /api/code-server/status`, `POST /api/code-server` (`{ mode: 'start' | 'stop' }`), and `GET /api/code-server/logs`. It exists because a browser cannot spawn processes — the React app asks the dev server, and the dev server shells out to the PowerShell launcher. The plugin attaches only in `apply: 'serve'`, so production builds are unaffected. `vite.config.js` additionally ignores `extensions/`, `dist/`, `xampp-backend/`, and `database/` in the watcher (this prevents Vite from picking up the extension `tsconfig.json` and breaking HMR) and excludes `yjs` / `y-websocket` / `localtunnel` from dependency pre-bundling. It also proxies both collaboration relays through the dev server so a single Cloudflare quick tunnel carries everything: `/collab-ws/*` forwards to the Yjs relay and `/p2p-ws/*` forwards to the P2P Live Share relay.

The middleware also owns the **per-account workbench**: `POST /api/code-server/launch` (`{ workspaceName: 'user-7' }`) creates that account's folder and starts a code-server instance for it, and `GET /api/code-server/user-status?workspaceName=user-7` reports whether it is answering. Both routes are registered *before* the generic `/api/code-server` handler, because Vite matches middleware on the path prefix and the generic route would otherwise swallow them.

`src/services/codeServer.js` is the client's half of that contract: it probes the workbench's `/healthz`, asks the dev server to start or stop it, waits for it to answer, and builds the URL that opens it on the Project Eric workspace. The **Code Server** entry in the sidebar (`src/components/layout/Layout.jsx`) uses it — clicking it opens the real coder/code-server workbench, starting the server first if nothing is listening on port 8080.

### Account ↔ code-server linkage

A Project Eric account can be linked to its own code-server workbench. The mapping lives in MySQL so the dashboard, the API and the launcher all agree on it:

| Layer | What it owns |
|---|---|
| `user_workspaces` table (MySQL) | `user_id` → folder name, absolute path, code-server URL |
| `GET /api/workspace` (PHP) | Resolves the signed-in account's workspace, creating the row on first call |
| `POST /api/code-server/launch` (Vite middleware) | Creates the folder on disk and starts that account's code-server instance |
| `src/services/codeServer.js` | `getUserWorkspace()`, `launchUserWorkbench()`, `getUserWorkbenchStatus()` |
| `src/pages/IDEWorkspace.jsx` | The "Your workbench" card — shows the account and its folder |

Each account gets its own folder, its own editor state and its own port:

```
folder    C:\Users\Public\project-eric-ide\users\user-<id>
state     C:\Users\Public\project-eric-ide\users\user-<id>\.code-server-data
port      8090 + (id % 200)
```

The extension folder stays shared, so the bundled `project-eric-owasp` and `eric-collab` extensions are present in every workbench. The port formula is duplicated in three places and must stay in step: `portForUser()` in `scripts/dev-server-plugin.js`, `Get-EricPort()` in `scripts/start-ide.ps1`, and `CODE_SERVER_USER_PORT_BASE` in `config/config.php`.

`scripts/start-ide.ps1 -UserId <id>` starts and stops a single account's instance; stopping one account never touches another account's instance or the shared one.

`src/pages/IDEWorkspace.jsx` is the front-end for this stack: it probes each service every 6 seconds, shows running/stopped state, offers start/stop controls, and hands the user a single button into the code-server workbench. It also hosts the "Import a codebase to scan" action, which clones the upstream `coder/code-server` source into the workspace for the OWASP extension to analyse. The `IDE` entry in the sidebar also links out to `https://vscode.dev/`.

---

## 6. The end-to-end user flow

1. **Land** on `/landing` → browse the marketing page → sign up or log in.
2. **Authenticate** (mocked in `AppContext`; the PHP API is ready but not yet wired in).
3. **Onboard** through the 5-step wizard (role → experience → languages → security focus → dashboard setup). Answers persist, and the guard bounces the user back to `/onboarding` until it completes.
4. **Land on the Dashboard** — score cards, recent projects, security feed. These reflect the last real scan, not mock data.
5. **Scan** at `/owasp`: paste code or SQL, pick a language/dialect, run the detectors. A progress bar advances category by category; each finding expands to show evidence lines, the CWE id, the remediation text, and the language-tuned before/after code from `owaspSuggestions.js`.
6. **Follow through**: the scan result is written to `AppContext` and `localStorage`, and immediately appears in **Analysis** (filterable vulnerability list, JSON export, mark-as-fixed), **Threats** (the findings rendered as threat-feed entries with a score banner), and **Reports** (an auto-appended report entry you can preview and download as JSON).
7. **Fix with AI** — `generateFix` / `explainIssue` send the code and findings to whichever model is configured and return a corrected file or a written explanation.
8. **Code in the Sandbox** — browse/edit a file tree, run browser-executable languages in a sandboxed iframe with live console capture, and run the "test all languages" sweep to see what this environment can and cannot execute.
9. **Collaborate** — `extensions/eric-collab` opens a room, exposes a localtunnel URL, and syncs the open file over Yjs; guests who hit a tunnel 502 can fall back to the public `/viewer` page, which connects straight to the signalling server and keeps editing the same shared document.

---

## 7. Design system notes

From `SPEC.md` and `index.css`: a "cybersecurity command center" aesthetic — glass-morphism panels over animated gradient orbs and a faint grid, `#0066FF` primary blue with `#00D4FF` cyan accents, JetBrains Mono for headings, Inter for body, Fira Code for code. An 8px spatial base, 1400px max content width, 16px panel radius. Motion is fade-and-slide at 300ms ease-out, with staggered panel reveals and a hover lift of roughly 4px. Every surface supports both light and dark themes via the `dark` class, and the accent colour is a runtime CSS variable rather than a hard-coded value.

---

## 8. Summary of how it functions

Project Eric is a **three-tier system** that converges on one idea — find security problems in code while the developer is still writing it:

- The **web dashboard** (React/Vite) is the control plane. It owns identity, onboarding, theme, and the scan-result pipeline, and it works standalone against static mock data.
- The **rule packs** in `public/extensions/` are the actual intelligence. They are data, not code, so the same JSON drives the in-app scanner, the pack-loader analyser, and the VS Code extension.
- The **satellites** — the PHP API for persistence and multi-user concerns, the code-server extension for real editing, and the Yjs layer for collaboration — extend the same ruleset into the environments where serious work happens, without forcing the dashboard to become a full IDE.

Everything degrades gracefully. No backend means mock auth and empty-but-honest analysis pages. No pack loaded means an empty finding list rather than a crash. A language the browser cannot execute means an explicit source preview, not a silent failure. A dead tunnel means the guest viewer keeps the document alive. The design consistently prefers showing the user exactly what is and is not working over hiding the limitation.
