/**
 * Project Eric OWASP — Master sample (intentionally vulnerable).
 *
 * This file demonstrates every OWASP Top 10 (2021) category in one place.
 * Each block follows a four-part layout you can lift into code review notes:
 *
 *   // BEFORE   — the vulnerable code as it might appear in a real codebase.
 *   // ERROR    — the scanner's finding, in its native code / message / CWE form.
 *   // FIX      — the corrected code (also lives in examples/secure/... ).
 *   // IMPROVE  — why the fix is better (defensive notes + remediation links).
 *
 * SAFE COUNTERPART: ./secure/javascript-secure-top10.js
 * RULE PACK         : ./data/owasp-pack.json
 */

const http = require('http');
const { exec, execFile } = require('child_process');
const crypto = require('crypto');
const { Client } = require('pg');
const pickle = require('pickle');                 // fictional, for demo shape only
const jwt = require('jsonwebtoken');

// ===========================================================================
// A01 · Broken Access Control
// ===========================================================================
//
//   The route takes a user-supplied `id` and returns the matching record
//   without checking that the caller is allowed to read it. This is the
//   textbook IDOR (Insecure Direct Object Reference).

function getInvoiceA01(req, res) {
  // BEFORE
  const id = req.query.id;
  return db.invoices.findOne({ id }).then((row) => res.json(row));
  // ERROR   → rule A01-001 (missing authorisation on object access)
  //            "GET /invoices?id=<n> exposes any invoice to any caller"
  //            cwe: CWE-639, owasp: A01:2021
  // FIX
  // const id = req.query.id;
  // const allowed = await canRead(req.user, id);
  // if (!allowed) return res.status(403).end();
  // return db.invoices.findOne({ id }).then((row) => res.json(row));
  // IMPROVE → enforce object-level authorisation server-side; never trust
  //           client-supplied identifiers. Add per-tenant scoping in the
  //           data layer so the bug cannot be reintroduced.
}

// ===========================================================================
// A02 · Cryptographic Failures
// ===========================================================================
//
//   MD5 is broken for password hashing, and SHA-1 is broken for any
//   integrity purpose that matters (SHAttered, 2017). Storing credentials
//   in cleartext on the source side is its own category failure.

function hashPasswordLegacyA02(password) {
  // BEFORE
  return crypto.createHash('md5').update(password).digest('hex');
  // ERROR   → rule A02-001
  //            "weak hash algorithm (MD5)" — CRITICAL
  //            cwe: CWE-327
  // FIX
  // return bcrypt.hashSync(password, 12);
  // IMPROVE → argon2id or bcrypt with cost ≥ 12; never roll your own scheme.
}

function pinCertificateA02(cert) {
  // BEFORE
  return crypto.createHash('sha1').update(cert).digest('hex');
  // ERROR   → rule A02-002
  //            "weak hash algorithm (SHA-1)" — HIGH
  // FIX
  // return crypto.createHash('sha256').update(cert).digest('hex');
  // IMPROVE → SHA-256 minimum. For HMAC, use createHmac with a server-side
  //           secret. For fingerprints, prefer SHA-256 or BLAKE2.
}

const stripeSecret = 'REPLACE_ME_AT_RUNTIME_USE_PROCESS_ENV_DDDDD';
// BEFORE  → hard-coded credential sitting in source.
// ERROR   → rule A02-003
//            "Hard-coded credential detected" — CRITICAL
//            cwe: CWE-798
// FIX
// const stripeSecret = process.env.STRIPE_SECRET;
// IMPROVE → load secrets from a secret manager (AWS SM, Vault, Doppler).
//           Rotate the leaked secret immediately and audit the repo history.

const LEGACY_API_BASE = 'http://api.legacy-vendor.example.com/v1';
// BEFORE  → plain HTTP for a third-party API.
// ERROR   → rule A02-004
//            "Insecure HTTP URL" — MEDIUM
// FIX
// const LEGACY_API_BASE = 'https://api.legacy-vendor.example.com/v1';
// IMPROVE → HTTP allows on-path tampering; the browser blocks mixed content
//           and TLS gives you both confidentiality and server authentication.

// ===========================================================================
// A03 · Injection
// ===========================================================================
//
//   The single most exploited category on the web. Three classic flavours:
//
//     A03-001 SQL injection     — string concatenation in the query
//     A03-002 command injection  — exec() with user input
//     A03-003 XSS                — innerHTML / dangerouslySetInnerHTML
//     A03-004 code injection     — eval() on user-controlled data

async function findUserByNameA03(name) {
  // BEFORE
  const client = new Client();
  await client.connect();
  const rows = await client.query("SELECT * FROM users WHERE name = '" + name + "'");
  await client.end();
  return rows;
  // ERROR   → rule A03-001
  //            "SQL string concatenation" — CRITICAL
  //            cwe: CWE-89
  // FIX
  // const client = new Client();
  // await client.connect();
  // const rows = await client.query('SELECT * FROM users WHERE name = $1', [name]);
  // await client.end();
  // IMPROVE → use parameterised queries or an ORM. Add a database user
  //           with the minimum required privileges (no DROP, no GRANT).
}

function convertVideoA03(filename, cb) {
  // BEFORE
  exec('ffmpeg -i ' + filename + ' out.mp4', cb);
  // ERROR   → rule A03-002
  //            "child_process.exec built via concatenation" — CRITICAL
  //            cwe: CWE-78
  // FIX
  // execFile('ffmpeg', ['-i', filename, 'out.mp4'], cb);
  // IMPROVE → execFile never spawns a shell, so `; cat /etc/passwd` and
  //           friends are inert. Avoid shell:true on subprocess in Python.
}

function renderCommentA03(el, commentText) {
  // BEFORE
  el.innerHTML = commentText;
  // ERROR   → rule A03-003
  //            "innerHTML assigned to dynamic content" — HIGH
  //            cwe: CWE-79
  // FIX
  // el.textContent = commentText;
  // IMPROVE → if HTML is required, sanitise with DOMPurify and set
  //           explicit allowlists (no <script>, no on* handlers).
}

function runFormulaA03(formula) {
  // BEFORE
  return eval(formula);
  // ERROR   → rule A03-004
  //            "eval() on user-controlled data" — CRITICAL
  //            cwe: CWE-95
  // FIX
  // const ALLOWED = { square: (x) => x * x, double: (x) => x * 2 };
  // const fn = ALLOWED[formula];
  // if (!fn) throw new Error('unknown formula');
  // return fn(10);
  // IMPROVE → use a parser, an AST interpreter (vm2 in Node, Jint in Java),
  //           or a small DSL. eval() should never see a network input.
}

// ===========================================================================
// A04 · Insecure Design
// ===========================================================================
//
//   A control is missing by design — can't be patched by better
//   implementation, has to be redesigned. Example: a "rotate this key"
//   function that doesn't actually rotate anything.

function rotateApiKeyA04(service) {
  // BEFORE
  // TODO: actually rotate the key here before we ship.
  console.log('rotating', service);
  // ERROR   → rule A04-001
  //            "TODO marker on a security-sensitive function" — INFO
  //            cwe: CWE-1188 (Insecure Default Implementations)
  // FIX
  // const newKey = await secrets.rotate(service);
  // await auditLog('key.rotated', { service, actor: ctx.user.id });
  // return newKey;
  // IMPROVE → for security-critical flows, prefer compile-time assertions
  //           (`if (process.env.NODE_ENV === 'production') throw …`) and
  //           run them under a CI gate so the empty body can't ship.
}

// ===========================================================================
// A05 · Security Misconfiguration
// ===========================================================================
//
//   CORS wildcard, debug mode left on, default creds, exposed admin paths.

function corsMiddlewareA05(req, res, next) {
  // BEFORE
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
  // ERROR   → rule A05-001
  //            "permissive CORS wildcard" — HIGH
  //            cwe: CWE-942
  // FIX
  // const ALLOWED = new Set(['https://app.example.com']);
  // const origin = req.headers.origin;
  // if (ALLOWED.has(origin)) {
  //   res.setHeader('Access-Control-Allow-Origin', origin);
  //   res.setHeader('Vary', 'Origin');
  // }
  // next();
  // IMPROVE → never pair `Allow-Origin: *` with `Allow-Credentials: true`;
  //           browsers reject it, but servers may also mis-respond.
}

function bootAppA05() {
  // BEFORE
  const app = express();
  app.listen(3000, () => console.log('up'));
  // app.run(debug=True);  // (left commented in tutorials all the time)
  // ERROR   → rule A05-002
  //            "Flask / Express debug mode left enabled" — HIGH
  //            cwe: CWE-489
  // FIX
  // app.set('env', 'production');
  // app.listen(3000);
  // IMPROVE → bind debug to NODE_ENV !== 'production' at boot, and add a
  //           startup assertion: `if (DEBUG && PROD) process.exit(1)`.
}

// ===========================================================================
// A06 · Vulnerable and Outdated Components
// ===========================================================================
//
//   A rule for "this import is a known-bad version" lives in the dependency
//   scanner (npm audit, pip-audit, cargo audit, …). The language scanner
//   itself cannot detect it from source — we keep a small reminder block
//   here so code reviewers know the corridor between these findings and
//   `data/owasp-pack.json`.
//
//   This is intentionally NOT a regex match — the rule of thumb:
//     • pin versions, not ranges (`lodash@4.17.21`, not `^4.17.0`)
//     • run `npm audit --omit=dev` in CI
//     • subscribe to the GitHub Security Advisories feed for your stack
//
//   See: https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/

// const _ = require('lodash@4.17.20');   // ← a CVE lives here
// const OLD_OPENSSL = require('openssl@1.0.1');   // ← Heartbleed
// IMPROVE → upgrade to a current version, run `npm audit`, and add a CI
//           job that fails the build on `severity === 'high'` advisories.

// ===========================================================================
// A07 · Identification and Authentication Failures
// ===========================================================================
//
//   Weak password policy + plaintext storage are the two we cover with
//   rules. They are easy to ship and devastating in production.

function validateAndStorePasswordA07(req, db) {
  // BEFORE
  const password = req.body.password;
  if (password.length < 5) {
    return res.status(400).send('too short');
  }
  db.query(
    `INSERT INTO users (email, password) VALUES ($1, $2)`,
    [req.body.email, password]   // cleartext on its way to the DB
  );
  // ERROR   → rule A07-001 (weak length), rule A07-002 (plaintext storage)
  //            "password length policy < 6" — HIGH
  //            "plaintext password reaches storage" — CRITICAL
  //            cwe: CWE-521, CWE-256
  // FIX
  // if (password.length < 12 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
  //   return res.status(400).send('weak password');
  // }
  // const hash = await bcrypt.hash(password, 12);
  // db.query(
  //   `INSERT INTO users (email, password_hash) VALUES ($1, $2)`,
  //   [req.body.email, hash]
  // );
  // IMPROVE → minimum 12 characters + breach-list check (HIBP API or
  //           local k-anonymity); bcrypt cost ≥ 12; rate-limit the route
  //           per IP and per account; enforce MFA for sensitive actions.
}

// ===========================================================================
// A08 · Software and Data Integrity Failures
// ===========================================================================
//
//   Deserialising untrusted input is the canonical A08 finding. Node.js
//   doesn't ship a pickle analogue, but `node-serialize` (and historically
//   `serialize-javascript` in vulnerable versions) had the same shape.

function loadProfileA08(serialized) {
  // BEFORE
  return pickle.loads(serialized);
  // ERROR   → rule A08-001
  //            "unsafe deserialisation" — CRITICAL
  //            cwe: CWE-502
  // FIX
  // const text = Buffer.from(serialized, 'base64').toString('utf8');
  // const data = JSON.parse(text);   // parse, don't evaluate
  // if (!ALLOWED_KEYS.has(data.role)) throw new Error('bad role');
  // return data;
  // IMPROVE → use a schema validator (Zod, Joi, ajv) at the boundary and
  //           reject unknown keys. Never deserialise via eval, pickle,
  //           yaml.load, unserialize(), or ObjectInputStream.
}

// ===========================================================================
// A09 · Security Logging and Monitoring Failures
// ===========================================================================
//
//   The scanner can't see the absence of a log line, so A09 lives mostly
//   in a code-review checklist. Two reminders for reviewers:
//
//     • Auth failures must be logged with a stable event id.
//     • Sensitive fields (password, token, ssn, card) must NEVER be logged.
//
//   A future iteration of the pack can flag `console.log(password, …)` and
//   `console.log(req.body)` with a rule of the form:
//     pattern: /console\.log\s*\(\s*[^)]*(password|token|secret|ssn)/i

function loginA09(req, res) {
  // BEFORE
  // (no log line on auth failure, no log on rate-limit trigger)
  // ERROR   → rule A09-001 (proposed) — missing audit log on auth failure
  // FIX
  // if (!ok) {
  //   log.warn({ event: 'auth.fail', ip: req.ip, user: req.body.email });
  //   metrics.increment('auth.fail');
  //   return res.status(401).end();
  // }
  // IMPROVE → bind a structured logger (pino, winston) at the app
  //           boundary; emit every security-relevant event with a stable
  //           schema; never log the credential itself.
}

// ===========================================================================
// A10 · Server-Side Request Forgery
// ===========================================================================
//
//   The server fetches a URL derived from user input. Without an allowlist
//   the caller can pivot to internal services (AWS metadata, Redis, etc.).

async function proxyImageA10(req, res) {
  // BEFORE
  const target = req.query.url;
  const response = await fetch(target);
  res.send(await response.text());
  // ERROR   → rule A10-001
  //            "fetch on a user-supplied URL" — CRITICAL
  //            cwe: CWE-918
  // FIX
  // const target = new URL(req.query.url);
  // const ALLOWED_HOSTS = new Set(['cdn.example.com', 'images.example.com']);
  // if (!ALLOWED_HOSTS.has(target.hostname)) {
  //   return res.status(400).send('blocked host');
  // }
  // if (/^10\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^127\./.test(target.hostname)) {
  //   return res.status(400).send('internal range blocked');
  // }
  // const response = await fetch(target.toString());
  // res.send(await response.text());
  // IMPROVE → resolve DNS yourself, then reject private RFC-1918 ranges;
  //           cap response size and MIME type; never proxy a URL that the
  //           attacker fully controls.
}

// ===========================================================================
// Math.random for security (per-language rule JS-A02-001)
// ===========================================================================

function issueSessionTokenA02js() {
  // BEFORE
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return token;
  // ERROR   → rule JS-A02-001
  //            "Math.random() used for security" — HIGH
  // FIX
  // return crypto.randomUUID();
  // IMPROVE → use crypto.getRandomValues / randomUUID / secrets.tokenUrlSafe.
  //           Math.random() is a PRNG, not a CSPRNG.
}

// ===========================================================================
// document.write with concatenation (JS-A03-001)
// ===========================================================================

function greetA03js(name) {
  // BEFORE
  document.write('<h1>Hello, ' + name + '</h1>');
  // ERROR   → rule JS-A03-001
  //            "document.write with concatenation" — HIGH
  //            cwe: CWE-79
  // FIX
  // const h = document.createElement('h1');
  // h.textContent = `Hello, ${name}`;
  // document.body.appendChild(h);
  // IMPROVE → use textContent for plain text, or DOMPurify for HTML.
  //           document.write rewrites the document and breaks CSP `unsafe-inline`.
}

module.exports = {
  getInvoiceA01,
  hashPasswordLegacyA02,
  pinCertificateA02,
  findUserByNameA03,
  convertVideoA03,
  renderCommentA03,
  runFormulaA03,
  rotateApiKeyA04,
  corsMiddlewareA05,
  bootAppA05,
  validateAndStorePasswordA07,
  loadProfileA08,
  loginA09,
  proxyImageA10,
  issueSessionTokenA02js,
  greetA03js,
};
