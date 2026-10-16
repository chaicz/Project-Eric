// ---------------------------------------------------------------------------
// owaspSuggestions.js
//
// Per-category "Improvement" packs for the OWASPScanner. Every detector
// already returns a one-line `remediation` string; this module adds a
// richer, language-tuned "How to fix" section so users have a concrete
// before/after reference they can copy straight into their editor.
//
// Each suggestion has:
//   • summary      one-line, action-oriented take-away
//   • before/after vulnerable and hardened code snippets tuned to the
//                  user's selected language (or dialect, in SQL mode)
//   • changes      ordered, atomic edits to make
//   • checklist    manual validation steps after the fix
//   • refs         authoritative links (OWASP cheat sheet, CWE, MDN)
// ---------------------------------------------------------------------------

const LANG_LABELS = {
  javascript: 'Node / Express',
  typescript: 'TypeScript / Express',
  python:     'Flask / Django',
  java:       'Java / Spring',
  csharp:     'ASP.NET / C#',
  go:         'Go · net/http',
  php:        'PHP / Laravel',
  ruby:       'Ruby on Rails',
  rust:       'Rust · actix-web',
  cpp:        'C / C++',
  other:      'Generic',
};

const normalizeLang = (l) => (LANG_LABELS[l] ? l : 'javascript');

const pickSample = (variants, lang) => variants[lang] || variants.javascript;

// ---------------------------------------------------------------------------
// A01 — Broken Access Control (CWE-639)
// ---------------------------------------------------------------------------
const A01 = {
  javascript: {
    before:
`app.get('/user/:id', (req, res) => {
  const id = req.params.id;
  const row = db.query(
    \`SELECT * FROM users WHERE id = \${id}\`
  );
  res.json(row);
});`,
    after:
`// authz middleware — loads verified caller from session / JWT
function authz(req, res, next) {
  req.user = req.session?.user;
  if (!req.user) return res.status(401).end();
  next();
}

// Policy: caller must own the resource, or be an admin
app.get('/user/:id', authz, (req, res) => {
  const isOwner = String(req.user.id) === String(req.params.id);
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).end();

  const row = db.query(
    'SELECT * FROM users WHERE id = $1', [req.params.id]
  );
  res.json(row);
});`,
  },
  python: {
    before:
`@app.route('/user/<id>')
def get_user(id):
    return db.execute(
      "SELECT * FROM users WHERE id = '" + id + "'"
    )`,
    after:
`def login_required(view):
    @functools.wraps(view)
    def wrapped(*a, **kw):
        if 'user' not in session: abort(401)
        return view(*a, **kw)
    return wrapped

@app.route('/user/<id>')
@login_required
def get_user(id):
    if session['user']['id'] != id \\
       and not session['user']['is_admin']:
        abort(403)
    return db.execute(
      'SELECT * FROM users WHERE id = %s', (id,)
    )`,
  },
  java: {
    before:
`@GetMapping("/user/{id}")
public User getUser(@PathVariable String id) {
  return jdbc.queryForObject(
    "SELECT * FROM users WHERE id = '" + id + "'"
  );
}`,
    after:
`@PreAuthorize("@ownership.canRead(#id, principal)")
@GetMapping("/user/{id}")
public User getUser(@PathVariable String id) {
  return jdbc.queryForObject(
    "SELECT * FROM users WHERE id = ?", id
  );
}`,
  },
  php: {
    before:
`Route::get('/user/{id}', function ($id) {
  return DB::select(
    "SELECT * FROM users WHERE id = '" . $id . "'"
  );
});`,
    after:
`Route::get('/user/{id}', function ($id) {
  $user = Auth::user();
  abort_if($user === null, 401);
  abort_unless(
    $user->id === $id || $user->is_admin, 403
  );
  return DB::select(
    'SELECT * FROM users WHERE id = ?', [$id]
  );
});`,
  },
};

const SUGGESTION_A01 = {
  summary:
    'Add an authorization check before the data layer — verify the caller owns the resource or has the right role.',
  changes: [
    'Introduce an authz middleware/decorator that loads the verified session or JWT user.',
    'Compare the caller id to the requested id; allow admin override behind a real role check.',
    'Use 401 for anonymous, 403 for forbidden, 404 for not-found to avoid id-enumeration leaks.',
    'Combine with parameterised queries (covered in A03).',
  ],
  checklist: [
    'Hit the route unauthenticated — must return 401.',
    'Hit the route as a different user — must return 403.',
    'Hit the route as the owner — must succeed.',
    'Consider UUIDs / ULIDs instead of sequential ids to prevent enumeration.',
  ],
  refs: [
    { title: 'OWASP · A01 Broken Access Control', url: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/' },
    { title: 'CWE-639 · Authorization Bypass Through User-Controlled Key', url: 'https://cwe.mitre.org/data/definitions/639.html' },
    { title: 'OWASP Cheat Sheet · Authorization', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html' },
  ],
};

// ---------------------------------------------------------------------------
// A02 — Cryptographic Failures (CWE-798)
// ---------------------------------------------------------------------------
const A02 = {
  javascript: {
    before:
`// MD5 for password hashing
const md5 = require('md5');
const hashed = md5(password);

const apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";

const token = Math.random().toString(36).slice(2);`,
    after:
`// bcrypt — slow + per-password salt
const bcrypt = require('bcrypt');
const hashed  = await bcrypt.hash(password, 12);

// verify instead of ===
const ok = await bcrypt.compare(input, user.passwordHash);

// secrets from the environment / vault
const apiKey = process.env.API_KEY;

// cryptographically secure tokens
const token = require('crypto')
  .randomBytes(32).toString('hex');`,
  },
  python: {
    before:
`import hashlib
hashed = hashlib.md5(password.encode()).hexdigest()

API_KEY = "sk_live_REPLACE_WITH_YOUR_OWN_KEY"
token   = ''.join(random.choices(string.ascii_letters, k=16))`,
    after:
`from argon2 import PasswordHasher
ph = PasswordHasher()
hashed = ph.hash(password)
ph.verify(hashed, password)   # constant-time compare

import os
API_KEY = os.environ['API_KEY']

import secrets
token = secrets.token_urlsafe(32)`,
  },
  java: {
    before:
`MessageDigest md = MessageDigest.getInstance("MD5");
byte[] hash = md.digest(password.getBytes());

String apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";`,
    after:
`BCryptPasswordEncoder enc = new BCryptPasswordEncoder(12);
String hash = enc.encode(password);
enc.matches(password, hash);     // constant-time

String apiKey = System.getenv("API_KEY");`,
  },
  php: {
    before:
`$hashed = md5($_POST['password']);
$apiKey  = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
$token   = mt_rand();`,
    after:
`$hashed = password_hash($_POST['password'], PASSWORD_ARGON2ID);
$ok      = password_verify($_POST['password'], $user['password_hash']);

$apiKey  = getenv('API_KEY');   // injected by the platform
$token   = bin2hex(random_bytes(32));`,
  },
};

const SUGGESTION_A02 = {
  summary:
    'Stop using md5/sha1 for passwords. Move secrets out of source. Use a CSPRNG for tokens.',
  changes: [
    'Replace md5/sha1 password storage with bcrypt (cost ≥ 12), argon2id, or scrypt.',
    'Verify hashes with a constant-time compare (bcrypt.compare, password_verify, BCrypt.matches).',
    'Load secrets from env vars, a vault (AWS Secrets Manager, HashiCorp Vault), or KMS — never commit them.',
    'Use crypto.randomBytes / secrets.token_urlsafe / SecureRandom for tokens, never Math.random / mt_rand.',
    'Force HTTPS for every transport — never ship http:// URLs in code or templates.',
  ],
  checklist: [
    'Grep the repo for `md5(`, `sha1(`, `Math.random`, `random.choice` and confirm each remaining use is non-security.',
    'Confirm no real keys/tokens appear in version control (gitleaks, trufflehog in CI).',
    'Force HTTPS at the load balancer and inside the app (HSTS, secure cookies).',
    'Add a secrets-rotation runbook so leaked credentials get rotated fast.',
  ],
  refs: [
    { title: 'OWASP · A02 Cryptographic Failures', url: 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/' },
    { title: 'CWE-798 · Use of Hard-coded Credentials', url: 'https://cwe.mitre.org/data/definitions/798.html' },
    { title: 'OWASP Cheat Sheet · Password Storage', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html' },
  ],
};

// ---------------------------------------------------------------------------
// A03 — Injection (CWE-89)
// ---------------------------------------------------------------------------
const A03_CODE = {
  javascript: {
    before:
`app.get('/user/:id', (req, res) => {
  const id = req.params.id;
  const row = db.query(
    "SELECT * FROM users WHERE id = '" + id + "'"
  );
  res.json(row);
});

app.get('/search', (req, res) => {
  document.body.innerHTML = 'You searched: ' + req.query.q;
});`,
    after:
`app.get('/user/:id', (req, res) => {
  const row = db.query(
    'SELECT * FROM users WHERE id = $1', [req.params.id]
  );
  res.json(row);
});

// never write user input into the DOM
app.get('/search', (req, res) => {
  const el = document.createElement('span');
  el.textContent = req.query.q;   // safe — textContent escapes
  document.body.appendChild(el);
});`,
  },
  python: {
    before:
`cur.execute(
  "SELECT * FROM users WHERE id = '" + id + "'"
)

return render_template_string(
  "Hello " + request.args.get('name')
)`,
    after:
`cur.execute(
  'SELECT * FROM users WHERE id = %s', (id,)
)

return render_template_string(
  "Hello {{ name }}",
  name=request.args.get('name')   # auto-escaped by Jinja
)`,
  },
  java: {
    before:
`String sql = "SELECT * FROM users WHERE id = '" + id + "'";
jdbcTemplate.queryForObject(sql, User.class);`,
    after:
`String sql = "SELECT * FROM users WHERE id = ?";
jdbcTemplate.queryForObject(
  sql, new Object[]{ id }, User.class
);`,
  },
  php: {
    before:
`DB::select("SELECT * FROM users WHERE id = '" . $id . "'");
echo "Hello " . $_GET['name'];`,
    after:
`DB::select('SELECT * FROM users WHERE id = ?', [$id]);
echo "Hello " . e($_GET['name']);   // htmlspecialchars wrapper`,
  },
};

const A03_SQL = {
  // Generic SQL (works for MySQL/Postgres/SQLite/T-SQL)
  before:
`-- 1) classic concat
SELECT * FROM users WHERE id = ' + userId + ';

-- 2) dynamic ORDER BY
SELECT id, name FROM products ORDER BY ' + sortColumn + ';`,
  after:
`-- 1) parameterised query
PREPARE s FROM 'SELECT * FROM users WHERE id = ?';
EXECUTE s USING @userId;
DEALLOCATE PREPARE s;

-- 2) identifier allowlist for ORDER BY
SET @col = CASE ? WHEN 'name' THEN 'name'
                  WHEN 'created_at' THEN 'created_at'
                  ELSE 'name' END;
PREPARE q FROM CONCAT(
  'SELECT id, name FROM products ORDER BY ', @col
);
EXECUTE q;`,
};

const SUGGESTION_A03 = (mode) => ({
  summary:
    mode === 'sql'
      ? 'Replace string-concatenated SQL with parameterised queries; allowlist every dynamic identifier.'
      : 'Replace string-concatenated SQL with parameterised queries; ban eval / innerHTML.',
  changes: mode === 'sql'
    ? [
        'Use prepared statements with placeholders (? / $1 / @id) for every value.',
        'Allowlist dynamic identifiers (column names, table names) — never concatenate user input.',
        'Reject stacked queries (DROP, TRUNCATE, DELETE …) at the driver level.',
        'Run queries with least-privilege DB users (no DDL, no cross-schema access).',
      ]
    : [
        "Use parameterised queries (? / $1 / @id) — never write `'…' + var`.",
        'Allowlist dynamic column / table names instead of concatenating them.',
        'Replace `eval` and `new Function` with explicit dispatch tables.',
        'Replace `.innerHTML =` with `.textContent =` or a sanitiser (DOMPurify).',
        'Run DB queries with least-privilege accounts.',
      ],
  checklist: mode === 'sql'
    ? [
        'Every `EXECUTE` accepts parameters, not concatenated strings.',
        'Dynamic ORDER BY / table names flow through a fixed allowlist.',
        'No tautologies (`OR 1=1`) or UNION-based probes succeed on test inputs.',
        'DB account can SELECT only the tables it needs.',
      ]
    : [
        "Search the codebase for `'…' + var` and `eval(` — each one gets a parameterised rewrite or removal.",
        'DOM mutations go through textContent or a vetted sanitiser.',
        'Database user has least privilege; no DROP/DELETE grants to the runtime role.',
        'Add a SQLi linter rule to CI (Semgrep, CodeQL).',
      ],
  refs: [
    { title: 'OWASP · A03 Injection', url: 'https://owasp.org/Top10/A03_2021-Injection/' },
    { title: 'CWE-89 · SQL Injection', url: 'https://cwe.mitre.org/data/definitions/89.html' },
    { title: 'OWASP Cheat Sheet · SQL Injection Prevention', url: 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html' },
  ],
});

// ---------------------------------------------------------------------------
// A04 — Insecure Design (CWE-307)
// ---------------------------------------------------------------------------
const SUGGESTION_A04 = {
  summary:
    'Design for abuse. Rate-limit and lock sensitive endpoints before you ship.',
  changes: [
    'Apply per-IP and per-account rate limits on auth, signup, password-reset, and any paid endpoint.',
    'Plan abuse cases during design (credential stuffing, bulk export, scraping) and write them in the threat model.',
    'Resolve every security-related TODO / FIXME before shipping.',
    'Add a `Retry-After` 429 response and a CAPTCHA escalation path.',
  ],
  checklist: [
    'Auth endpoints rate-limit at ≤ 5 attempts / minute / IP.',
    'Account-level rate-limit kicks in after N failures (lockout / backoff).',
    'Threat model document lists every sensitive endpoint and its abuse case.',
    'TODO/FIXME about security has no remaining instances in the diff.',
  ],
  refs: [
    { title: 'OWASP · A04 Insecure Design', url: 'https://owasp.org/Top10/A04_2021-Insecure_Design/' },
    { title: 'CWE-307 · Improper Restriction of Excessive Authentication Attempts', url: 'https://cwe.mitre.org/data/definitions/307.html' },
    { title: 'OWASP Cheat Sheet · Denial of Service', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html' },
  ],
};

// ---------------------------------------------------------------------------
// A05 — Security Misconfiguration (CWE-16)
// ---------------------------------------------------------------------------
const SUGGESTION_A05 = {
  summary:
    'Default to deny. Lock CORS, set security headers, kill debug flags, rotate default credentials.',
  changes: [
    'Replace CORS `origin: "*"` with an explicit allowlist of trusted origins.',
    'Add `helmet()` (or equivalent) and ship HSTS, X-Content-Type-Options, Referrer-Policy, CSP.',
    'Disable debug logging in production; ensure stack traces never leak to clients.',
    'Replace default / hardcoded credentials (admin/admin, root/toor) before deploy.',
    'Remove unused routes, sample endpoints, and `.env.example` from production images.',
  ],
  checklist: [
    'CORS preflight from an unknown origin is rejected.',
    'Security headers present — verify with `securityheaders.com`.',
    'Production logs contain no stack traces or secrets.',
    'No default credentials survive the deploy pipeline.',
  ],
  refs: [
    { title: 'OWASP · A05 Security Misconfiguration', url: 'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/' },
    { title: 'CWE-16 · Configuration', url: 'https://cwe.mitre.org/data/definitions/16.html' },
    { title: 'OWASP Cheat Sheet · HTTP Headers', url: 'https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html' },
  ],
};

// ---------------------------------------------------------------------------
// A06 — Vulnerable & Outdated Components (CWE-1104)
// ---------------------------------------------------------------------------
const SUGGESTION_A06 = {
  summary:
    'Track every dependency version. Automate CVE checks on every build.',
  changes: [
    'Run `npm audit` / `yarn audit` / `pip-audit` / `govulncheck` in CI on every PR.',
    'Adopt a real SBOM tool (Snyk, Dependabot, OSV-Scanner) and fail builds on critical advisories.',
    'Pin and lock dependency versions; prefer tools that support lockfiles (npm, pip-tools, go mod).',
    'Subscribe to vendor security advisories for transitive deps too.',
  ],
  checklist: [
    'Build pipeline fails when an audit emits High or Critical.',
    'Lockfile is committed; transitive version drift is impossible.',
    'Renewed dependencies are smoke-tested before merge.',
    'An owner is assigned for every Critical / High advisory that surfaces.',
  ],
  refs: [
    { title: 'OWASP · A06 Vulnerable and Outdated Components', url: 'https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/' },
    { title: 'CWE-1104 · Use of Unmaintained Third Party Components', url: 'https://cwe.mitre.org/data/definitions/1104.html' },
    { title: 'OWASP Cheat Sheet · Vulnerable Dependency Management', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html' },
  ],
};

// ---------------------------------------------------------------------------
// A07 — Authentication Failures (CWE-521)
// ---------------------------------------------------------------------------
const A07 = {
  javascript: {
    before:
`app.post('/login', (req, res) => {
  const user = findUser(req.body.username);
  if (user && user.password === md5(req.body.password)) {
    req.session.userId = user.id;
    res.json({ ok: true });
  }
});`,
    after:
`app.post('/login', async (req, res) => {
  const user = await findUser(req.body.username);
  if (!user) return res.status(401).end();      // constant-time-ish

  const ok = await bcrypt.compare(
    req.body.password || '', user.passwordHash
  );
  if (!ok) return res.status(401).end();

  // MFA challenge before issuing session
  await issueOtp(user);
  res.json({ mfa: 'required' });
});`,
  },
  python: {
    before:
`if user and user.password == md5(req.form['pw']):
    session['uid'] = user.id`,
    after:
`from argon2 import PasswordHasher, exceptions
ph = PasswordHasher()
try:
    ph.verify(user.password_hash, req.form['pw'])
except exceptions.VerifyMismatchError:
    abort(401)
session['uid'] = user.id
# MFA gate here`,
  },
  java: {
    before:
`if (user != null && user.password.equals(md5(pwd))) {
    session.setAttribute("uid", user.id);
}`,
    after:
`BCryptPasswordEncoder enc = new BCryptPasswordEncoder(12);
if (user != null && enc.matches(pwd, user.passwordHash)) {
    session.setAttribute("uid", user.id);
    // MFA gate
}`,
  },
  php: {
    before:
`if ($user && $user->password === md5($_POST['pw'])) {
    $_SESSION['uid'] = $user->id;
}`,
    after:
`if ($user && password_verify($_POST['pw'], $user->password_hash)) {
    $_SESSION['uid'] = $user->id;
    // MFA gate
}`,
  },
};

const SUGGESTION_A07 = {
  summary:
    'Hash with bcrypt/argon2 in constant time. Enforce MFA. Stop using MD5/SHA1 for passwords.',
  changes: [
    'Use bcrypt(cost ≥ 12) / argon2id / scrypt — never md5/sha1/sha256 for passwords.',
    'Always compare hashes with the library’s constant-time helper (bcrypt.compare, password_verify, BCrypt.matches).',
    'Enforce MFA on every login (TOTP, WebAuthn, or SMS fallback) — and re-prompt for sensitive actions.',
    'Add password-policy rules (length > complexity, breach-list check).',
    'Rotate any signing key that may have been exposed; treat them as compromised after a leak.',
  ],
  checklist: [
    'Login flow rejects an unknown user in the same time it would reject a wrong password (constant-time-ish).',
    'A test login without MFA is rejected.',
    'Session cookies are Secure, HttpOnly, SameSite=Lax.',
    'Rate limits kick in after N failed attempts per account and per IP.',
  ],
  refs: [
    { title: 'OWASP · A07 Identification and Authentication Failures', url: 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/' },
    { title: 'CWE-521 · Weak Password Requirements', url: 'https://cwe.mitre.org/data/definitions/521.html' },
    { title: 'OWASP Cheat Sheet · Authentication', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html' },
  ],
};

// ---------------------------------------------------------------------------
// A08 — Software & Data Integrity Failures (CWE-345)
// ---------------------------------------------------------------------------
const SUGGESTION_A08 = {
  summary:
    'Verify everything you trust: deserialised data, signed tokens, CI artefacts, auto-updates.',
  changes: [
    'Replace `yaml.load`, `unserialize`, `pickle.loads`, and `JSON.parse(req.body)` of unknown input with safe parsers.',
    'Verify JWTs with the issuer’s public key (`jwt.verify`, `jose.jwtVerify`).',
    'Sign CI artefacts (SLSA provenance) and verify on deploy.',
    'Lock auto-update channels (e.g. Squirrel, Sparkle) and require signed updates only.',
  ],
  checklist: [
    'A malicious pickle / YAML payload loaded into the app is rejected.',
    'Unsigned JWTs are rejected (alg none / missing kid).',
    'Auto-update channel rejects payloads without a valid signature.',
    'CI artefacts carry a verifiable provenance document.',
  ],
  refs: [
    { title: 'OWASP · A08 Software and Data Integrity Failures', url: 'https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/' },
    { title: 'CWE-345 · Insufficient Verification of Data Authenticity', url: 'https://cwe.mitre.org/data/definitions/345.html' },
    { title: 'OWASP Cheat Sheet · Deserialization', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html' },
  ],
};

// ---------------------------------------------------------------------------
// A09 — Security Logging & Monitoring Failures (CWE-778)
// ---------------------------------------------------------------------------
const A09 = {
  javascript: {
    before:
`app.post('/login', (req, res) => {
  const u = find(req.body.username, req.body.password);
  console.log('login attempt', req.body.username);
  if (u) req.session.uid = u.id;
  res.json({ ok: !!u });
});`,
    after:
`const log = pino({ redact: ['req.headers.authorization'] });

app.post('/login', (req, res) => {
  const u = find(req.body.username, req.body.password);
  log.info({
    event: 'auth.login',
    user: u?.id, ip: req.ip, ua: req.headers['user-agent'],
    ok: !!u,
  }, 'login attempt');
  if (u) req.session.uid = u.id;
  res.json({ ok: !!u });
});`,
  },
  python: {
    before:
`print('login:', req.form['user'])`,
    after:
`log.info('auth.login', extra={
  'user': user_id, 'ip': request.remote_addr,
  'ok': ok
})`,
  },
  java: {
    before:
`System.out.println("login: " + req.getParameter("u"));`,
    after:
`log.info("auth.login user={} ip={} ok={}",
  user.id, req.getRemoteAddr(), ok);`,
  },
  php: {
    before:
`error_log("login: " . $_POST['user']);`,
    after:
`Log::info('auth.login', [
    'user' => $user->id, 'ip' => $request->ip(), 'ok' => true
]);`,
  },
};

const SUGGESTION_A09 = {
  summary:
    'Adopt a structured logger and emit auth/authz/data-modification events with user id, IP, and outcome.',
  changes: [
    'Replace `console.*` / `print` / `echo` on sensitive routes with a structured logger (pino, winston, loguru, slf4j, Log::info).',
    'Log every auth event, every authorization failure, every data-modification event with user id, IP, user agent, outcome.',
    'Forward logs to a SIEM / aggregator and set alerts on threshold breaches.',
    'Stop logging secrets, tokens, or full request bodies — redact at the logger level.',
  ],
  checklist: [
    'Login, logout, password reset, MFA challenge: each event is logged.',
    'Permission-denied events are logged with reason and requester.',
    'Log streams reach a SIEM; alert rules exist for repeated failures.',
    'Sensitive headers / bodies are redacted before they reach disk.',
  ],
  refs: [
    { title: 'OWASP · A09 Security Logging and Monitoring Failures', url: 'https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/' },
    { title: 'CWE-778 · Insufficient Logging', url: 'https://cwe.mitre.org/data/definitions/778.html' },
    { title: 'OWASP Cheat Sheet · Application Logging', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Application_Logging_Vocabulary_Cheat_Sheet.html' },
  ],
};

// ---------------------------------------------------------------------------
// A10 — Server-Side Request Forgery (CWE-918)
// ---------------------------------------------------------------------------
const A10 = {
  javascript: {
    before:
`app.get('/fetch', async (req, res) => {
  const r = await fetch(req.query.url);
  res.send(await r.text());
});`,
    after:
`const ALLOW = new Set([
  'api.example.com', 'cdn.example.com'
]);

app.get('/fetch', async (req, res) => {
  const u = new URL(req.query.url);
  if (!ALLOW.has(u.hostname))
    return res.status(400).end();

  // Resolve DNS ourselves; block private/loopback
  const ip = await dnsLookup(u.hostname);
  if (isPrivate(ip)) return res.status(400).end();

  const r = await fetch(u, { redirect: 'manual' });
  res.send(await r.text());
});`,
  },
  python: {
    before:
`r = requests.get(request.args.get('url')).text`,
    after:
`from urllib.parse import urlparse
import ipaddress, socket

ALLOW = {'api.example.com', 'cdn.example.com'}

def safe(url):
    u = urlparse(url)
    if u.hostname not in ALLOW: raise ValueError('blocked')
    ip = ipaddress.ip_address(socket.gethostbyname(u.hostname))
    if ip.is_private: raise ValueError('private')
    return requests.get(url, allow_redirects=False)`,
  },
  java: {
    before:
`String url = req.getParameter("u");
return new Scanner(new URL(url).openStream())
  .useDelimiter("\\\\A").next();`,
    after:
`if (!Set.of("api.example.com").contains(u.getHost()))
  throw new IllegalArgumentException();
if (InetAddress.getByName(u.getHost())
    .isSiteLocalAddress())
  throw new IllegalArgumentException();
return new Scanner(u.openConnection()
  .setInstanceFollowRedirects(false)
  .getInputStream()).useDelimiter("\\\\A").next();`,
  },
  php: {
    before:
`$r = file_get_contents($_GET['url']);`,
    after:
`if (!in_array(parse_url($url, PHP_URL_HOST), ['api.example.com'], true))
  abort(400);
// disable follow + add curl DNS resolve pinning
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);`,
  },
};

const SUGGESTION_A10 = {
  summary:
    'Allowlist outbound URLs, resolve DNS yourself, block private/loopback ranges, and disable redirects.',
  changes: [
    'Allowlist the exact hostnames the server is allowed to call.',
    'Resolve DNS yourself and reject any IP in private / loopback / link-local ranges.',
    'Disable HTTP redirects on the client (fetch(..., redirect: "manual"), requests.get(..., allow_redirects=False)).',
    'Run outbound traffic through a forward proxy / egress firewall that enforces the same allowlist at the network layer.',
  ],
  checklist: [
    'A request to `http://169.254.169.254/…` (cloud metadata) is rejected.',
    'A redirect from an allowlisted host to a private host is rejected.',
    'Hostname allowlist is reviewed and version-controlled.',
    'Egress firewall denies any destination outside the allowlist.',
  ],
  refs: [
    { title: 'OWASP · A10 Server-Side Request Forgery', url: 'https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/' },
    { title: 'CWE-918 · Server-Side Request Forgery', url: 'https://cwe.mitre.org/data/definitions/918.html' },
    { title: 'OWASP Cheat Sheet · SSRF Prevention', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html' },
  ],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const buildSuggestion = (id, language = 'javascript', mode = 'code') => {
  const lang = normalizeLang(language);
  const langLabel = LANG_LABELS[lang];

  switch (id) {
    case 'A01': {
      const sample = pickSample(A01, lang);
      return {
        ...SUGGESTION_A01,
        before: sample.before,
        after: sample.after,
        beforeLabel: `Before — ${langLabel}`,
        afterLabel: `After — ${langLabel}`,
      };
    }
    case 'A02': {
      const sample = pickSample(A02, lang);
      return {
        ...SUGGESTION_A02,
        before: sample.before,
        after: sample.after,
        beforeLabel: `Before — ${langLabel}`,
        afterLabel: `After — ${langLabel}`,
      };
    }
    case 'A03': {
      const sample = mode === 'sql'
        ? A03_SQL
        : pickSample(A03_CODE, lang);
      const base = SUGGESTION_A03(mode);
      return {
        ...base,
        before: sample.before,
        after: sample.after,
        beforeLabel: mode === 'sql' ? 'Before — Generic SQL' : `Before — ${langLabel}`,
        afterLabel:  mode === 'sql' ? 'After — Generic SQL'  : `After — ${langLabel}`,
      };
    }
    case 'A04':
      return {
        ...SUGGESTION_A04,
        before: '',
        after: '',
        beforeLabel: 'Before (representative)',
        afterLabel: 'After (representative)',
      };
    case 'A05':
      return {
        ...SUGGESTION_A05,
        before: '',
        after: '',
        beforeLabel: 'Before (representative)',
        afterLabel: 'After (representative)',
      };
    case 'A06':
      return {
        ...SUGGESTION_A06,
        before: '',
        after: '',
        beforeLabel: 'Before (representative)',
        afterLabel: 'After (representative)',
      };
    case 'A07': {
      const sample = pickSample(A07, lang);
      return {
        ...SUGGESTION_A07,
        before: sample.before,
        after: sample.after,
        beforeLabel: `Before — ${langLabel}`,
        afterLabel: `After — ${langLabel}`,
      };
    }
    case 'A08':
      return {
        ...SUGGESTION_A08,
        before: '',
        after: '',
        beforeLabel: 'Before (representative)',
        afterLabel: 'After (representative)',
      };
    case 'A09': {
      const sample = pickSample(A09, lang);
      return {
        ...SUGGESTION_A09,
        before: sample.before,
        after: sample.after,
        beforeLabel: `Before — ${langLabel}`,
        afterLabel: `After — ${langLabel}`,
      };
    }
    case 'A10': {
      const sample = pickSample(A10, lang);
      return {
        ...SUGGESTION_A10,
        before: sample.before,
        after: sample.after,
        beforeLabel: `Before — ${langLabel}`,
        afterLabel: `After — ${langLabel}`,
      };
    }
    default: {
      return {
        summary: 'Apply the remediation hint above and consult the linked references.',
        before: '',
        after: '',
        beforeLabel: 'Before',
        afterLabel: 'After',
        changes: ['Confirm the issue, write a regression test, then apply the fix.'],
        checklist: ['Re-run the scanner and confirm the status moves to Pass.'],
        refs: [
          { title: 'OWASP Top 10', url: 'https://owasp.org/Top10/' },
        ],
      };
    }
  }
};

export default buildSuggestion;
