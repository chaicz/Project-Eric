/**
 * Project Eric OWASP — JavaScript sample (intentionally vulnerable)
 *
 * Open this file inside VS Code with the "Project Eric OWASP" extension
 * enabled. Every block below is tagged so you can see which scanner rule
 * fires on which line.
 *
 * Categories covered: A02 (Crypto), A03 (Injection), A04 (Insecure Design),
 *                     A05 (Misconfig), A07 (Auth), A08 (Integrity),
 *                     A10 (SSRF)
 *
 * SAFE COUNTERPART: ./secure/javascript-secure.js
 */

const crypto = require('crypto');
const express = require('express');
const { Client } = require('pg');
const axios = require('axios');

// ---------------------------------------------------------------------------
// A03-002 — child_process.exec with concat (command injection)
// ---------------------------------------------------------------------------
const { exec, execSync } = require('child_process');

function convertVideo(filename, cb) {
  // ❌ A03-002: ; cat /etc/passwd escapes through the shell.
  exec('ffmpeg -i ' + filename + ' out.mp4', cb);
}

function rmUserDir(dir) {
  // ❌ A03-002: same pattern through the synchronous variant.
  execSync('rm -rf ' + dir);
}

// ---------------------------------------------------------------------------
// A07-001 + A07-002 — weak password validation + plaintext storage
// ---------------------------------------------------------------------------
function validateAndStorePassword(req, db) {
  const password = req.body.password;

  // ❌ A07-001: only checks 5-character minimum — below OWASP guidance (≥ 8).
  if (password.length < 5) {
    return res.status(400).send('too short');
  }

  // ❌ A07-002: the literal cleartext password stays in source.
  //   The regex needs `password = "literal-string"` form.
  let password = "plaintext-password-1234567";
  const stored = password;

  // ❌ A07-002: the cleartext password reaches the DB.
  db.query(
    `INSERT INTO users (email, password) VALUES ($1, $2)`,
    [req.body.email, password]
  );
}

// ---------------------------------------------------------------------------
// A02-003 — hard-coded credential
// ---------------------------------------------------------------------------
// ❌ A02-003: an API token sitting in source. Anyone with repo access sees it.
//    The values below are obviously-fake placeholders — the OWASP rule
//    still fires on the variable name and the quoted literal form. Real
//    credentials must never be committed; use process.env + a secret
//    manager (Vault, AWS SM, Doppler) in production.
const apiKey      = "REPLACE_ME_AT_RUNTIME_USE_PROCESS_ENV_AAA";
const stripeToken = "REPLACE_ME_AT_RUNTIME_USE_PROCESS_ENV_BBB";
const STRIPE_SECRET = 'REPLACE_ME_AT_RUNTIME_USE_PROCESS_ENV_CCC';

// ---------------------------------------------------------------------------
// A02-004 — insecure HTTP URL
// ---------------------------------------------------------------------------
// ❌ A02-004: plain HTTP for a third-party API. Use https:// instead.
const LEGACY_API_BASE = "http://api.legacy-vendor.example.com/v1";
const WEBHOOK_TARGET = "http://hooks.acme.test/notify";

// ---------------------------------------------------------------------------
// JS-A02-001 — Math.random used for security (session / token)
// ---------------------------------------------------------------------------
function issueSessionToken() {
  // ❌ JS-A02-001: Math.random is non-cryptographic. Tokens derived from it
  //               are predictable.
  const token = Math.random().toString(36).slice(2);
  return token + Math.random().toString(36).slice(2);
}

// ---------------------------------------------------------------------------
// A03-004 — eval() on user-controlled data
// ---------------------------------------------------------------------------
function runFormula(formula) {
  // ❌ A03-004: the caller's input is parsed as code.
  return eval(formula);                    // eslint-disable-line no-eval
}

// ---------------------------------------------------------------------------
// A03-003 — innerHTML assigned to dynamic content
// ---------------------------------------------------------------------------
function renderComment(el, commentText) {
  // ❌ A03-003: any HTML/JS in `commentText` lands directly in the DOM.
  el.innerHTML = commentText;
  // ❌ A03-003: React-style equivalent that bypasses JSX escaping.
  return { __html: commentText };          // dangerouslySetInnerHTML
}

// ---------------------------------------------------------------------------
// JS-A03-001 — document.write with concatenation
// ---------------------------------------------------------------------------
function greet(name) {
  // ❌ JS-A03-001: an attacker controlling `name` can inject <script>...</script>.
  document.write('<h1>Hello, ' + name + '</h1>');
}

// ---------------------------------------------------------------------------
// A10-001 — SSRF via fetch on a user-supplied URL
// ---------------------------------------------------------------------------
async function proxyImage(req, res) {
  const target = req.query.url;
  // ❌ A10-001: attacker can pass http://169.254.169.254/... (AWS metadata),
  //              http://127.0.0.1:6379/... (Redis), file:///etc/passwd, etc.
  const response = await fetch(target);
  res.send(await response.text());
}

// ---------------------------------------------------------------------------
// A05-002 — Flask-style debug left enabled
// ---------------------------------------------------------------------------
// ❌ A05-002: not specifically JS, but the rule also matches
//              app.run(debug=True). A common copy-paste from tutorials.
const app = express();
app.listen(3000, () => console.log('up'));
// app.run(debug=True);   // ← left commented in to show the pattern

// ---------------------------------------------------------------------------
// A04-001 — TODO marker on a security-sensitive function
// ---------------------------------------------------------------------------
function rotateApiKey(service) {
  // TODO: actually rotate the key here before we ship.
  console.log('rotating', service);
}

// ---------------------------------------------------------------------------
// A05-001 — permissive CORS wildcard
// ---------------------------------------------------------------------------
// allow_origins=['*']  — CORS middleware config form the scanner will pick up.
function corsMiddleware(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
}

// ---------------------------------------------------------------------------
// A03-001 — SQL string concatenation
// ---------------------------------------------------------------------------
async function findUserByName(name) {
  const client = new Client();
  await client.connect();
  // ❌ A03-001: classic SQL injection — UNION SELECT password FROM users --
  const rows = await client.query("SELECT * FROM users WHERE name = '" + name + "'");
  await client.end();
  return rows;
}

// ---------------------------------------------------------------------------
// A02-001 — MD5 used for password hashing
// ---------------------------------------------------------------------------
function hashPasswordLegacy(password) {
  // ❌ A02-001: MD5 has known collisions. Never use it for passwords or
  //              integrity purposes that matter.
  return crypto.createHash('md5').update(password).digest('hex');
}

// ---------------------------------------------------------------------------
// A02-002 — SHA-1 used for certificate pinning
// ---------------------------------------------------------------------------
function pinCertificate(cert) {
  // ❌ A02-002: SHA-1 collisions are practical (SHAttered, 2017).
  const fingerprint = crypto.createHash('sha1').update(cert).digest('hex');
  return fingerprint;
}

module.exports = {
  validateAndStorePassword,
  issueSessionToken,
  runFormula,
  renderComment,
  greet,
  proxyImage,
  corsMiddleware,
  findUserByName,
  hashPasswordLegacy,
  pinCertificate,
  rotateApiKey,
};
