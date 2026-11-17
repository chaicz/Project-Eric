# OWASP Testing & Hard Mode — Deliverables

**Created:** 14 November 2026
**Project:** Project Eric — Security-First Web IDE (`D:\webpage design`)

---

## Where everything is

```
D:\webpage design\reports\owasp-hard-mode\
├── TEST_REPORT.md                  <- full test run results + what was built
├── docs\
│   └── HARD_MODE_GUIDE.md          <- how the hard mode works, how to use it
├── logs\
│   ├── owasp-hard-mode-test.json   <- the 68-check harness (machine-readable)
│   ├── owasp-10-language-test.json <- the 10-language OWASP fixture run
│   ├── language-pack-test.json     <- the 14-language pack run
│   └── functional-tests.json       <- the 29 browser functional checks
└── source\                         <- a copy of the implementation
    ├── profile.js
    ├── hardRules.js
    ├── hardPack.js
    ├── hardAnalyser.js
    ├── index.js
    ├── HardModeToggle.jsx
    └── tests\
        ├── fixtures.js
        ├── run-hard-mode-tests.mjs
        ├── browser-check.cjs
        ├── diagnose.mjs
        ├── fp-hunt.mjs
        └── owaspHardMode.test.mjs
```

The **live** implementation lives in the source tree, not in this folder —
this folder is the report bundle:

| Live location | What it is |
|---|---|
| `src\utils\owaspHardMode\` | The hard mode engine (5 modules) |
| `src\components\security\HardModeToggle.jsx` | The scanner toggle |
| `src\pages\OWASPScanner.jsx` | Where the toggle and the profile-aware scan are wired in |
| `tests\owasp-hard-mode\` | The harness, fixtures and browser check |
| `tests\unit\owaspHardMode.test.mjs` | The 50 unit tests |

---

## Results at a glance

| Check | Result |
|---|---|
| Unit tests | 635 / 635 |
| Master suite | 14 / 14 suites |
| Functional (browser) | 29 / 29 |
| OWASP hard mode | 68 / 68 |
| Hard-mode unit tests | 50 / 50 |
| Hard-mode browser check | 10 / 10 |
| Route coverage | 22 / 22 |
| Production build | succeeded |

Six suites need the XAMPP PHP backend, which is not installed here. They are
listed in section 5 of `TEST_REPORT.md`.

---

## Run the hard mode tests

```bash
# The 68-check harness
npm run test:hard-mode

# With the evidence lines printed
npm run test:hard-mode:verbose

# Everything, 14 suites
npm run test:all
```

The browser check needs the dev server and the mock API:

```bash
node scripts/start-vite-detached.mjs
node scripts/mock-api.mjs
node tests/owasp-hard-mode/browser-check.cjs
```

---

## Maintenance tools

Two scripts in `tests\owasp-hard-mode\` help when a rule misbehaves:

| Script | Purpose |
|---|---|
| `diagnose.mjs` | Lists every hard-mode pattern that fails to compile, and which rules match each fixture. |
| `fp-hunt.mjs` | Shows which rule fires on each *hardened* fixture — the false-positive hunt. |

Run them after editing `hardRules.js`:

```bash
node tests/owasp-hard-mode/diagnose.mjs
node tests/owasp-hard-mode/fp-hunt.mjs
```
