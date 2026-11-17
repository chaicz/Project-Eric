# OWASP Hard Mode — Implementation Guide

**Location:** `D:\webpage design\src\utils\owaspHardMode\`
**Tests:** `D:\webpage design\tests\owasp-hard-mode\`
**Reports:** `D:\webpage design\reports\owasp-hard-mode\`

---

## What hard mode is

Hard mode is a **strict analysis profile** for the Project Eric OWASP scanner.
It runs the same ten OWASP Top 10 (2026) categories as the standard profile,
but applies four extra behaviours that the standard profile deliberately
leaves out.

| Behaviour | Standard | Hard mode |
|---|---|---|
| Fail threshold | score ≥ 4 | score ≥ 3 |
| Warn threshold | score ≥ 1 | score ≥ 1 |
| Severity floor | none | per category (A02/A03 → `critical`, A01/A07/A10 → `high`, …) |
| Rule set | shipped pack only | shipped pack **+ 26 defence-in-depth rules** |
| Missing-control check | not performed | a category with no finding still reports `warning` when its mitigation is absent |
| Rule weights | as shipped | × 1.35 |
| Evidence kept | 8 per category | 20 per category, with longer snippets |

The design goal: hard mode catches the code that *looks* right at a glance
but is missing a control — the stuff a human reviewer finds on the second
pass, and that a teaching-oriented scanner should not shout about on day one.

---

## Files

| File | Purpose |
|---|---|
| `src/utils/owaspHardMode/profile.js` | The profile catalogue (`standard`, `hard`), severity ladder, floor logic. |
| `src/utils/owaspHardMode/hardRules.js` | The 26-rule `hard` tier. Every rule carries a CWE, a remediation and a description. |
| `src/utils/owaspHardMode/hardPack.js` | `buildHardPack()` — merges the hard tier into a **copy** of the shipped pack. |
| `src/utils/owaspHardMode/hardAnalyser.js` | The analyser: profile thresholds, severity floors, weight scaling, mitigation gate. |
| `src/utils/owaspHardMode/index.js` | Public API: `runProfileScan()`, `runHardScan()`, `loadHardPack()`. |
| `src/components/security/HardModeToggle.jsx` | The segmented control in the scanner command bar. |
| `tests/owasp-hard-mode/fixtures.js` | 18 fixture pairs (vulnerable + hardened) across PHP, Python and JavaScript. |
| `tests/owasp-hard-mode/run-hard-mode-tests.mjs` | The 68-check harness. |
| `tests/owasp-hard-mode/browser-check.cjs` | The end-to-end browser check. |
| `tests/unit/owaspHardMode.test.mjs` | 50 unit tests, part of the main suite. |

---

## Using it

### From the UI

Open **/owasp** → the command bar has a **Standard | Hard Mode** switch next
to the Code/SQL picker → paste code → **Run OWASP Scan**. The toast confirms
`· hard mode` when the strict profile ran.

### From code

```js
import { runProfileScan, runHardScan } from '../utils/owaspHardMode';

// Strict profile
const result = await runHardScan(code, 'php');
console.log(result.score, result.summary, result.findings);

// Pick the profile at runtime
const r = await runProfileScan(code, 'javascript', {
  profile: process.env.STRICT ? 'hard' : 'standard',
  onProgress: ({ done, total, latest }) => setProgress(done / total),
});
```

`runProfileScan` returns:

```js
{
  findings: [...],   // the same shape the rest of the app already uses
  score,             // 0–100
  summary,           // 'Low Risk' | 'Medium Risk' | 'High Risk'
  critical, high, medium, low,
  total,
  profile,           // the resolved profile
  pack,              // the built pack
}
```

Each finding adds four fields the standard profile does not have:

```js
{
  mitigationMissing,   // true when the expected control is absent
  mitigationPresent,   // true when the control was found
  expectedMitigations, // the markers the category looks for
  hardRuleCount,       // how many hard-tier rules cover this category
}
```

---

## The hard tier

26 rules, distributed across all ten categories:

| Category | Rules | What they add |
|---|---|---|
| **A01** Broken Access Control | 2 | Lookup by request-supplied id with no ownership check; path built from user input |
| **A02** Cryptographic Failures | 4 | Non-constant-time secret comparison; password hashed with a fast digest; credential literal in source; TLS verification disabled |
| **A03** Injection | 4 | SQL built by concatenation/interpolation; command run through a shell; dynamic code evaluation; LDAP/XPath injection |
| **A04** Insecure Design | 3 | Auth route with no rate limit; security control disabled by configuration; unguarded workflow transition |
| **A05** Security Misconfiguration | 3 | CORS wildcard or reflected origin; exception detail returned to the client; directory enumeration enabled |
| **A06** Vulnerable Components | 1 | Dependency pinned to a version with known advisories |
| **A07** Authentication Failures | 3 | Auth bypass path; session cookie without HttpOnly/Secure; reset token without an expiry check |
| **A08** Data Integrity Failures | 2 | Untrusted data deserialised; update fetched over an unverified channel |
| **A09** Logging Failures | 2 | Secret written to a log; privileged change with no audit trail |
| **A10** SSRF | 2 | Outbound request to a user-supplied URL; redirect target taken from the request |

### The `notIf` guard

Some rules fire only when a mitigating control is **absent**. Expressing that
with a negative lookahead is unreliable — the control usually appears *after*
the match. So a pattern can carry `notIf`:

```js
{
  regex: 'set_cookie\\s*\\(\\s*["\'][^"\']*session[^"\']*["\'][^\\)]{0,140}?\\)',
  label: 'Python cookie set without HttpOnly/Secure',
  notIf: '(?:httponly|http_only|secure|samesite)',
}
```

When `notIf` also matches the file, the pattern is skipped. This is what
keeps the false-positive rate at zero on the hardened fixtures.

---

## The mitigation gate

Hard mode expects each category to show its control in the source:

| Category | Expected markers (any one is enough) |
|---|---|
| A01 | `authorize`, `abort_unless`, `@PreAuthorize`, `Gate::`, `->can(`, `current_user`, `req.user` … |
| A02 | `bcrypt`, `argon2`, `password_hash`, `password_verify`, `crypto.randomBytes`, `secrets.token_hex` … |
| A03 | `prepare(`, `bindParam`, `parameterized`, `sqlx`, `?` … |
| A04 | `rateLimit`, `throttle`, `csrf`, `zod`, `joi`, `yup` … |
| A05 | `cors`, `helmet`, `csp`, `Content-Security-Policy`, `NODE_ENV` … |
| A06 | *(none — a dependency file has no control to show)* |
| A07 | `bcrypt`, `password_verify`, `totp`, `mfa`, `2fa`, `timestep` … |
| A08 | `verify_signature`, `sha256`, `hmac`, `safe_load`, `schema` … |
| A09 | `logger`, `winston`, `pino`, `morgan`, `slf4j`, `audit` … |
| A10 | `allowlist`, `allowed_hosts`, `validateUrl`, `deny_list`, `ipaddress` … |

A category with no finding but no control is reported as `warning` with
`mitigationMissing: true` rather than a clean `pass`.

---

## Running the tests

```bash
npm run test:hard-mode          # the 68-check harness
npm run test:hard-mode:verbose  # same, with the evidence lines printed
npm run test                    # the main suite (includes 50 hard-mode unit tests)
npm run test:all                # everything, 14 suites
node tests/owasp-hard-mode/browser-check.cjs   # the browser end-to-end check
```

The browser check needs the dev server and the mock API:

```bash
node scripts/start-vite-detached.mjs
node scripts/mock-api.mjs       # listens on 127.0.0.1:5299
```

---

## Safety properties

- **Nothing executes.** The analyser is regex-only — it never runs,
  transpiles or interprets the scanned source.
- **The shipped pack is never mutated.** `buildHardPack()` returns a copy;
  a unit test asserts the base pack is byte-identical afterwards.
- **Hard mode is never quieter than standard mode.** A unit test scans
  every fixture under both profiles and asserts the hard score is never
  higher.
- **No false positives on the hardened fixtures.** Every one of the 18
  fixture pairs asserts the hardened sample does not `fail` its category.
- **The scan result shape is unchanged.** Downstream pages (Analysis,
  Threats, Reports, PDF/CSV export) keep working without modification.

---

## Adding a rule

1. Add an entry to `HARD_RULES` in `src/utils/owaspHardMode/hardRules.js`.
2. Give it a unique `id` (`HARD-Axx-nnn`), a `category`, a `severity`, a
   `cwe`, a `remediation` and at least one pattern.
3. Add a `notIf` guard if the rule should only fire when a control is
   absent.
4. Add a fixture pair to `tests/owasp-hard-mode/fixtures.js`.
5. Run `npm run test:hard-mode`. The harness checks that the vulnerable
   sample fails, the hardened sample stays clean, and that hard mode is
   still stricter than standard.

Every rule is validated automatically: the unit suite compiles every
pattern and every `notIf` as a JavaScript `RegExp`, so a typo fails the
build rather than silently disabling a detector.
