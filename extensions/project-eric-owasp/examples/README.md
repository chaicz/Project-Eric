# Project Eric — OWASP Scanner Example Corpus

A curated set of code samples designed to exercise every rule in the
Project Eric OWASP Top 10 (2021) scanner. Open any file inside VS Code
with the extension enabled and the findings appear live in the status bar,
Problems panel, and tree view.

## Layout

```
examples/
├── 00-owasp-top-10.js         ← Master sample — all 10 categories in one file
│                                  (Before / Error / Fix / Improve for each)
├── 01-javascript.js     ← JavaScript / Node.js   (JS + global rules)
├── 02-typescript.ts     ← TypeScript / React     (TS + global rules)
├── 03-python.py         ← Python / Flask         (PY + global rules)
├── 04-sql.sql           ← SQL                    (SQL identifier rule)
├── 05-java.java         ← Java / JDBC / Servlets (JAVA + global)
├── 06-php.php           ← PHP                    (PHP + global)
├── 07-go.go             ← Go                     (GO + global)
├── 08-rust.rs           ← Rust                   (RUST + global)
├── 09-ruby.rb           ← Ruby / Sinatra         (RB + global)
├── 10-cpp.cpp           ← C++                    (CPP + global)
├── 11-csharp.cs         ← C# / ASP.NET MVC       (CS + global)
├── 12-html.html         ← HTML                   (HTML CSP + global)
└── 13-css.css           ← CSS                    (global only)
└── secure/              ← Fixed counterparts (one file per language)
    ├── javascript-secure-top10.js   ← secure side of 00-owasp-top-10.js
    ├── javascript-secure.js
    ├── typescript-secure.ts
    ├── python-secure.py
    ├── sql-secure.sql
    ├── java-secure.java
    ├── php-secure.php
    ├── go-secure.go
    ├── rust-secure.rs
    ├── ruby-secure.rb
    ├── cpp-secure.cpp
    ├── csharp-secure.cs
    ├── html-secure.html
    └── css-secure.css
```

`00-owasp-top-10.js` is the single-file walkthrough of every category. If
you only have time to read one file in this folder, read that one. The
language-specific files (01–13) are designed to be pasted straight into
the extension's scanner for end-to-end testing.

Every numbered file is **deliberately vulnerable**. Every `secure/*-secure.*`
file shows what the corrected version looks like.

## Rule → File cross-reference

| Rule ID | What it catches | Demonstrated in |
| --- | --- | --- |
| `A02-001` | MD5 in source | every JS/PHP/Go/Rust/C++/C#/Java/Python file + `00-owasp-top-10.js` |
| `A02-002` | SHA-1 in source | every JS/PHP/Go/Rust/C++/C#/Java/Python file + `00-owasp-top-10.js` |
| `A02-003` | Hard-coded credential | every file (look for `STRIPE_…`, `DB_PASSWORD`, …) |
| `A02-004` | Plain `http://` URL | every file except CSS |
| `A03-001` | SQL string concat | `01`, `04`, `05`, `06`, `09`, `11` + `00-owasp-top-10.js` |
| `A03-002` | Shell concat (`exec`, `subprocess`, `os.system` …) | `01`, `02`, `03`, `05`, `07`, `08`, `09`, `10` + `00-owasp-top-10.js` |
| `A03-003` | `innerHTML`, `document.write`, `dangerouslySetInnerHTML` | `01`, `02`, `11` + `00-owasp-top-10.js` |
| `A03-004` | `eval(...)` on dynamic input | `01`, `02` + `00-owasp-top-10.js` |
| `A04-001` | `TODO` / `FIXME` / `XXX` markers | every file |
| `A05-001` | CORS `*` | `01` (via `allow_origins=['*']` config form) + `00-owasp-top-10.js` |
| `A05-002` | `DEBUG=True` / Flask debug / `app.run(debug=True)` | `01`, `03` + `00-owasp-top-10.js` |
| `A07-001` | Password length `< 6` | every file (via `password.length < 5` sentinel) |
| `A07-002` | Plaintext password storage | `01`, `02`, `03`, `04`, `05`, `06`, `09`, `11` |
| `A08-001` | `pickle.loads` / `yaml.load` / `unserialize` | `03`, `06` + `00-owasp-top-10.js` |
| `A10-001` | SSRF (request on user URL) | `01`, `02`, `03`, `05`, `07`, `08`, `09`, `11` + `00-owasp-top-10.js` |
| `JS-A02-001` | `Math.random()` for security | `01` + `00-owasp-top-10.js` |
| `JS-A03-001` | `document.write` with concat | `01` + `00-owasp-top-10.js` |
| `TS-A03-001` | `as any` in user-data path | `02` |
| `PY-A03-001` | `subprocess.…(shell=True)` | `03` |
| `JAVA-A02-001` | `MessageDigest.getInstance("MD5"/"SHA-1")` | `05` |
| `PHP-A03-001` | `echo $_GET[$x]` etc. | `06` |
| `GO-A02-001` | `math/rand` for crypto | `07` |
| `RUST-A03-001` | `.unwrap()` on user input | `08` |
| `RB-A03-001` | `ERB.new(params…)` | `09` |
| `CPP-A03-001` | `strcpy` / `strcat` / `gets` | `10` |
| `CS-A02-001` | `MD5CryptoServiceProvider` | `11` |
| `SQL-A03-001` | Dynamic identifier interpolation | `04` |
| `HTML-A05-001` | Missing `<meta CSP>` | `12` |

> `PY-A02-001` (`assert` for security check) is intentionally not used in
> the corpus — the pack's regex isn't multiline-flagged, so the rule is
> effectively DOA on real code. It's still in the pack; it just needs a
> follow-up fix in `data/owasp-pack.json`.

## OWASP category → file map

If you want to see a single file demonstrating a specific category, the
cheat sheet is:

| Category | Where to look |
| --- | --- |
| **A01 · Broken Access Control** | `00-owasp-top-10.js` → `getInvoiceA01` |
| **A02 · Cryptographic Failures** | `00-owasp-top-10.js` → `hashPasswordLegacyA02`, `pinCertificateA02`; per-language MD5/SHA-1 hits in every JS/TS/PHP/Go/Rust/C++/C#/Java/Python file |
| **A03 · Injection** | `00-owasp-top-10.js` (one block per sub-rule: SQL/Command/XSS/eval); `04-sql.sql` for SQL-only |
| **A04 · Insecure Design** | `00-owasp-top-10.js` → `rotateApiKeyA04` |
| **A05 · Security Misconfiguration** | `00-owasp-top-10.js` → `corsMiddlewareA05`, `bootAppA05`; `12-html.html` for missing CSP |
| **A06 · Vulnerable Components** | `00-owasp-top-10.js` → A06 reminder block (rules live in the dependency scanner, not the regex pack) |
| **A07 · Auth Failures** | `00-owasp-top-10.js` → `validateAndStorePasswordA07`; per-language `password = "..."` sentinels in every file |
| **A08 · Data Integrity Failures** | `00-owasp-top-10.js` → `loadProfileA08`; `03-python.py` for `pickle.loads`/`yaml.load`; `06-php.php` for `unserialize` |
| **A09 · Logging Failures** | `00-owasp-top-10.js` → `loginA09` (commented code review checklist) |
| **A10 · SSRF** | `00-owasp-top-10.js` → `proxyImageA10`; per-language SSRF hits in `01`, `02`, `03`, `05`, `07`, `08`, `09`, `11` |

## How to scan

From the project root (`extensions/project-eric-owasp/`):

```powershell
# Original 7-case smoke test (untouched, still passes 7/7):
node scripts/test-scanner.js

# Corpus verification — every rule fires on at least one sample,
# every secure counterpart is clean (or carries a documented residual):
node scripts/verify-examples.js
```

To run inside the extension: `Ctrl+Shift+P → Project Eric OWASP: Scan Workspace`.

## Before / After / Error / Fix — what every example demonstrates

Every numbered file is laid out in four side-by-side sections so a code-review
reader can see the full vulnerability story without leaving the file:

| Section           | What you see                                                        |
|-------------------|---------------------------------------------------------------------|
| **Before**        | The vulnerable code as it might appear in a real codebase.          |
| **Error**         | The scanner's finding, in its native `code / message / range` form. |
| **Fix**           | The corrected line/block (taken straight from `secure/*-secure.*`). |
| **Improvement**   | Why the fix is better (CWE, OWASP category, defensive notes).       |

Example — `01-javascript.js`, the `convertVideo` block (rule `A03-002`):

```js
// BEFORE — vulnerable
function convertVideo(filename, cb) {
  exec('ffmpeg -i ' + filename + ' out.mp4', cb);
}

// ERROR — what the scanner reports
//   rule  : A03-002 · command injection · CRITICAL
//   file  : 01-javascript.js:18:3
//   msg   : "child_process.exec built via concatenation"
//   cwe   : CWE-78

// FIX — taken from secure/javascript-secure.js
function convertVideo(filename, cb) {
  execFile('ffmpeg', ['-i', filename, 'out.mp4'], cb);
}

// IMPROVEMENT — why it works
//   execFile bypasses the shell, so ; cat /etc/passwd never reaches a parser.
//   The array form also avoids quoting issues on every platform.
```

The same `Before / Error / Fix / Improvement` quartet is repeated for every
triggered rule across the 13 language files. The `secure/*-secure.*`
counterparts are the canonical *Fix* form.

---

## Expected results

Running `scripts/verify-examples.js` against the current corpus yields:

```
✓ 01-javascript.js             ( 30 findings)
✓ 02-typescript.ts             ( 19 findings)
✓ 03-python.py                 ( 21 findings)
✓ 04-sql.sql                   ( 20 findings)
✓ 05-java.java                 ( 24 findings)
✓ 06-php.php                   ( 14 findings)
✓ 07-go.go                     ( 22 findings)
✓ 08-rust.rs                   ( 18 findings)
✓ 09-ruby.rb                   ( 17 findings)
✓ 10-cpp.cpp                   ( 15 findings)
✓ 11-csharp.cs                 ( 21 findings)
✓ 12-html.html                 (  4 findings)
✓ 13-css.css                   (  6 findings)
✓ secure/javascript-secure.js  (1 allowed residual)
✓ secure/typescript-secure.ts  (0 findings)
✓ secure/python-secure.py      (0 findings)
✓ secure/sql-secure.sql        (5 allowed residuals)
✓ secure/java-secure.java      (0 findings)
✓ secure/php-secure.php        (1 allowed residual)
✓ secure/go-secure.go          (1 allowed residual)
✓ secure/rust-secure.rs        (0 findings)
✓ secure/ruby-secure.rb        (0 findings)
✓ secure/cpp-secure.cpp        (0 findings)
✓ secure/csharp-secure.cs      (0 findings)
✓ secure/html-secure.html      (1 allowed residual)
✓ secure/css-secure.css        (0 findings)

26 passed · 0 failed
```

## About the residuals

A handful of false positives remain in the secure counterparts. They are
listed in `scripts/verify-examples.js` under `residualAllowlist` and are
all the kind of thing a regex scanner can't disambiguate without parsing
context — for example, `axios.get(url)` with an allowlist check three
lines above still matches the SSRF pattern, or `PDOStatement::fetch()`
matches the literal `fetch(`. None of them are actual vulnerabilities in
the secure files; the comments at the top of each `*-secure.*` file
explain what was changed and why.

## Using as a teaching set

Each numbered file has section banners tagged with the OWASP rule ID:

```js
// ---------------------------------------------------------------------------
// A03-001 — SQL string concatenation
// ---------------------------------------------------------------------------
function findUser(name) { ... }
```

That makes them easy to walk through in code review: open the file, find
the comment, see the code, read the fix in `secure/`. The same layout
works as a CI smoke test — drop the corpus into your repo and run
`node scripts/verify-examples.js` to detect if any rule ever stops firing.
