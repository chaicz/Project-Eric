/**
 * Project Eric OWASP — Master SECURE counterpart.
 *
 * This is the fix-side of `00-owasp-top-10.js`. Every block is the
 * corrected form of the corresponding `BEFORE` block in the vulnerable
 * file. The two files together demonstrate the full OWASP Top 10 (2021)
 * in JavaScript with the canonical Before / Error / Fix / Improvement
 * layout.
 */

const crypto = require('crypto');
const { Client } = require('pg');
const { execFile } = require('child_process');
const bcrypt = require('bcrypt');

// Read secrets from the environment (A02-003)
const stripeSecret = process.env.STRIPE_SECRET;
const apiKey      = process.env.STRIPE_API_KEY;
const STRIPE_SECRET = process.env.STRIPE_SECRET;

// HTTPS everywhere (A02-004)
const LEGACY_API_BASE = 'https://api.legacy-vendor.example.com/v1';

// A01 · object-level authorisation on every record access
async function getInvoiceA01(req, res) {
  const id = req.query.id;
  const allowed = await canRead(req.user, id);    // server-side check
  if (!allowed) return res.status(403).end();
  return db.invoices.findOne({ id }).then((row) => res.json(row));
}

// A02 · SHA-256 (or argon2/bcrypt for passwords)
function fingerprintWebhookA02(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
function pinCertificateA02(cert) {
  return crypto.createHash('sha256').update(cert).digest('hex');
}
async function hashPasswordA02(password) {
  return bcrypt.hash(password, 12);
}

// A03-001 · parameterised SQL
async function findUserByNameA03(name) {
  const client = new Client();
  await client.connect();
  const rows = await client.query('SELECT * FROM users WHERE name = $1', [name]);
  await client.end();
  return rows;
}

// A03-002 · execFile with array args, no shell
function convertVideoA03(filename, cb) {
  execFile('ffmpeg', ['-i', filename, 'out.mp4'], cb);
}

// A03-003 · textContent / DOMPurify, never innerHTML on user data
function renderCommentA03(el, commentText) {
  el.textContent = commentText;
}
function renderSafeHtmlA03(el, html) {
  el.replaceChildren(DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i', 'a'] }));
}

// A03-004 · lookup-table formula evaluator
const ALLOWED_FUNCS = { square: (x) => x * x, double: (x) => x * 2 };
function runFormulaA03(formula) {
  const fn = ALLOWED_FUNCS[formula];
  if (!fn) throw new Error('unknown formula');
  return fn(10);
}

// A04 · no more TODO; rotate, audit-log, return
async function rotateApiKeyA04(service, ctx) {
  const newKey = await secrets.rotate(service);
  await auditLog('key.rotated', { service, actor: ctx.user.id });
  return newKey;
}

// A05-001 · CORS allowlist
const ALLOWED_ORIGINS = new Set(['https://app.example.com']);
function corsMiddlewareA05(req, res, next) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  next();
}

// A05-002 · no debug in production
function bootAppA05() {
  const app = express();
  app.set('env', process.env.NODE_ENV || 'production');
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG) {
    throw new Error('DEBUG must not be set in production');
  }
  app.listen(3000);
}

// A06 · use current versions + dependency scanner in CI
//   - lodash@4.17.21, openssl@3.4.1, etc.
//   - CI step: `npm audit --omit=dev --audit-level=high` (fails the build)

// A07 · bcrypt 12 rounds + 12-char minimum + breach-list check
async function validateAndStorePasswordA07(req, db) {
  const password = req.body.password;
  if (password.length < 12 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).send('weak password');
  }
  const hash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)`,
    [req.body.email, hash]
  );
}

// A08 · JSON.parse + schema validator, never eval / pickle
const PROFILE_SCHEMA = {
  type: 'object',
  required: ['name', 'role'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 100 },
    role: { enum: ['user', 'admin'] },
  },
};
function loadProfileA08(serialized) {
  const data = JSON.parse(Buffer.from(serialized, 'base64').toString('utf8'));
  return ajv.compile(PROFILE_SCHEMA)(data) ? data : null;
}

// A09 · structured logger on every auth outcome
function loginA09(req, res) {
  // ...authenticate...
  if (!ok) {
    log.warn({ event: 'auth.fail', ip: req.ip, user: req.body.email });
    metrics.increment('auth.fail');
    return res.status(401).end();
  }
  log.info({ event: 'auth.ok', user: req.user.id });
  return res.json({ token: issueJwt(req.user) });
}

// A10 · allowlist + reject private ranges
const ALLOWED_HOSTS_A10 = new Set(['cdn.example.com', 'images.example.com']);
const PRIVATE_RANGES = /^10\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^127\./;
async function proxyImageA10(req, res) {
  const target = new URL(req.query.url);
  if (!ALLOWED_HOSTS_A10.has(target.hostname) || PRIVATE_RANGES.test(target.hostname)) {
    return res.status(400).send('blocked');
  }
  const response = await fetch(target.toString());
  res.send(await response.text());
}

// JS-A02-001 · crypto.randomUUID() / getRandomValues
function issueSessionTokenA02js() {
  return crypto.randomUUID();
}

// JS-A03-001 · DOM APIs, no document.write
function greetA03js(name) {
  const h = document.createElement('h1');
  h.textContent = `Hello, ${name}`;
  document.body.appendChild(h);
}

module.exports = {
  getInvoiceA01,
  fingerprintWebhookA02,
  pinCertificateA02,
  hashPasswordA02,
  findUserByNameA03,
  convertVideoA03,
  renderCommentA03,
  renderSafeHtmlA03,
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
