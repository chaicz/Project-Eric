// ---------------------------------------------------------------------------
// OWASP Hard Mode — test fixtures
//
// Every fixture is a pair: a `vulnerable` file that must trip at least
// one hard rule, and a `safe` counterpart that must stay clean.
//
// The safe files are written defensively on purpose — they contain the
// mitigation markers the hard profile requires (prepared statements,
// password hashing, rate limiting, structured logging and so on), because
// the hard profile treats a missing control as a finding.
// ---------------------------------------------------------------------------

/**
 * The fixture set. Each entry:
 *   id         unique key
 *   language   language pack id
 *   category   the OWASP category the fixture targets
 *   label      what the fixture demonstrates
 *   mustDetect patterns that must appear in the vulnerable file
 *   vulnerable the source that trips the rule
 *   safe       the hardened source that must stay clean
 */
export const FIXTURES = [
  {
    id: 'a01-idor',
    language: 'php',
    category: 'A01',
    label: 'Object fetched by a user-supplied id with no ownership check',
    mustDetect: ['HARD-A01-001'],
    vulnerable: `<?php
// Vulnerable: any authenticated user can read any invoice by changing the id.
$id = $_GET['id'];
$stmt = $pdo->query("SELECT * FROM invoices WHERE id = " . $id);
$invoice = $stmt->fetch();
echo json_encode($invoice);
`,
    safe: `<?php
// Hardened: the query is scoped to the owner and the role is checked.
$id = (int) $_GET['id'];
$currentUser = $_SESSION['user_id'];
if (!current_user_can('invoice.read')) {
    http_response_code(403);
    exit;
}
$stmt = $pdo->prepare("SELECT * FROM invoices WHERE id = ? AND owner_id = ?");
$stmt->execute([$id, $currentUser]);
$invoice = $stmt->fetch();
if (!$invoice) {
    http_response_code(404);
    exit;
}
echo json_encode($invoice);
`,
  },

  {
    id: 'a02-password-hash',
    language: 'python',
    category: 'A02',
    label: 'Password stored with a fast digest instead of a password KDF',
    mustDetect: ['HARD-A02-002'],
    vulnerable: `import hashlib

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def check_password(password, stored):
    return hash_password(password) == stored
`,
    safe: `import bcrypt

def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def check_password(password, stored):
    return bcrypt.checkpw(password.encode(), stored.encode())
`,
  },

  {
    id: 'a02-secret-literal',
    language: 'javascript',
    category: 'A02',
    label: 'Credential assigned a literal value in source',
    mustDetect: ['HARD-A02-003'],
    vulnerable: `const API_SECRET = "s3cr3t-4cc3ss-k3y-9f2a";
const SESSION_TOKEN = "tok_live_7h4k2p9xz";

function authenticate(req) {
  return req.header("authorization") === "Bearer " + SESSION_TOKEN;
}
`,
    safe: `import crypto from "node:crypto";

const API_SECRET = process.env.API_SECRET;
const SESSION_TOKEN = process.env.SESSION_TOKEN;

function authenticate(req) {
  const expected = Buffer.from(SESSION_TOKEN);
  const actual = Buffer.from(req.header("authorization") || "");
  return crypto.timingSafeEqual(expected, actual);
}
`,
  },

  {
    id: 'a02-tls-verification',
    language: 'python',
    category: 'A02',
    label: 'TLS certificate verification disabled on an outbound request',
    mustDetect: ['HARD-A02-004'],
    vulnerable: `import requests

def fetch_profile(user_id):
    response = requests.get(
        f"https://api.internal.example/users/{user_id}",
        verify=False,
    )
    return response.json()
`,
    safe: `import requests

def fetch_profile(user_id):
    response = requests.get(
        f"https://api.internal.example/users/{user_id}",
        timeout=10,
    )
    response.raise_for_status()
    return response.json()
`,
  },

  {
    id: 'a03-sql-concat',
    language: 'javascript',
    category: 'A03',
    label: 'SQL statement built by template-literal interpolation',
    mustDetect: ['HARD-A03-001'],
    vulnerable: `app.get('/api/users', async (req, res) => {
  const email = req.query.email;
  const rows = await db.query(
    \`SELECT * FROM users WHERE email = '\${email}'\`
  );
  res.json(rows);
});
`,
    safe: `app.get('/api/users', async (req, res) => {
  const email = req.query.email;
  const rows = await db.query(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );
  res.json(rows);
});
`,
  },

  {
    id: 'a03-command-shell',
    language: 'python',
    category: 'A03',
    label: 'Command executed through a shell with user input',
    mustDetect: ['HARD-A03-002'],
    vulnerable: `import os
import subprocess

def convert(filename):
    target = os.popen("convert " + filename).read()
    return target
`,
    safe: `import subprocess

def convert(filename):
    result = subprocess.run(
        ["convert", filename],
        capture_output=True,
        check=True,
    )
    return result.stdout.decode()
`,
  },

  {
    id: 'a03-eval',
    language: 'php',
    category: 'A03',
    label: 'User input evaluated as code',
    mustDetect: ['HARD-A03-003'],
    vulnerable: `<?php
$expression = $_GET['expr'];
$result = eval($expression);
echo $result;
`,
    safe: `<?php
$allowed = ['sum', 'count', 'avg'];
$operation = $_GET['op'] ?? '';
if (!in_array($operation, $allowed, true)) {
    http_response_code(400);
    exit;
}
$values = array_map('floatval', $_GET['values'] ?? []);
$result = match ($operation) {
    'sum' => array_sum($values),
    'count' => count($values),
    'avg' => $values ? array_sum($values) / count($values) : 0,
    default => 0,
};
echo json_encode(['result' => $result]);
`,
  },

  {
    id: 'a04-no-rate-limit',
    language: 'javascript',
    category: 'A04',
    label: 'Login handler with no rate limiting',
    mustDetect: ['HARD-A04-001'],
    vulnerable: `app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.users.findByEmail(email);
  if (!user || !checkPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ token: issueToken(user) });
});
`,
    safe: `app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  await rateLimit({ key: req.ip, limit: 5, windowMs: 60000 });
  const user = await db.users.findByEmail(email);
  if (!user || !checkPassword(password, user.passwordHash)) {
    logger.warn('failed login', { email, ip: req.ip });
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ token: issueToken(user) });
});
`,
  },

  {
    id: 'a04-csrf-disabled',
    language: 'python',
    category: 'A04',
    label: 'CSRF protection disabled',
    mustDetect: ['HARD-A04-002'],
    vulnerable: `from flask import Flask, request

app = Flask(__name__)
app.config["CSRF_ENABLED"] = False

@app.route("/transfer", methods=["POST"])
def transfer():
    amount = request.form["amount"]
    return {"ok": True, "amount": amount}
`,
    safe: `from flask import Flask, request, session
from flask_wtf.csrf import CSRFProtect

app = Flask(__name__)
csrf = CSRFProtect(app)

@app.route("/transfer", methods=["POST"])
def transfer():
    amount = request.form["amount"]
    return {"ok": True, "amount": amount}
`,
  },

  {
    id: 'a05-cors-wildcard',
    language: 'javascript',
    category: 'A05',
    label: 'CORS allows every origin',
    mustDetect: ['HARD-A05-001'],
    vulnerable: `const allowedOrigins = ['*'];

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});
`,
    safe: `const allowedOrigins = ['https://app.example.com'];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Headers', 'Content-Type');
  }
  next();
});
`,
  },

  {
    id: 'a05-stack-trace',
    language: 'javascript',
    category: 'A05',
    label: 'Exception detail returned to the client',
    mustDetect: ['HARD-A05-002'],
    vulnerable: `app.get('/api/report', async (req, res) => {
  try {
    return res.json(await buildReport(req.query.id));
  } catch (error) {
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
});
`,
    safe: `app.get('/api/report', async (req, res) => {
  try {
    return res.json(await buildReport(req.query.id));
  } catch (error) {
    const correlationId = logger.error('report build failed', { error, id: req.query.id });
    return res.status(500).json({ error: 'Report unavailable', correlationId });
  }
});
`,
  },

  {
    id: 'a07-auth-bypass',
    language: 'javascript',
    category: 'A07',
    label: 'Protected route continues without a valid session',
    mustDetect: ['HARD-A07-001'],
    vulnerable: `app.get('/api/account', async (req, res) => {
  const session = req.cookies.session;
  if (!session) {
    next();
  }
  const account = await db.accounts.findById(req.query.id);
  res.json(account);
});
`,
    safe: `app.get('/api/account', requireAuth, async (req, res) => {
  const account = await db.accounts.findById(req.user.id);
  if (!account) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(account);
});
`,
  },

  {
    id: 'a07-cookie-flags',
    language: 'python',
    category: 'A07',
    label: 'Session cookie without HttpOnly or Secure',
    mustDetect: ['HARD-A07-002'],
    vulnerable: `from flask import Flask, make_response

app = Flask(__name__)

def login():
    response = make_response({"ok": True})
    response.set_cookie("session", "abc123")
    return response
`,
    safe: `from flask import Flask, make_response

app = Flask(__name__)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SECURE=True)

def login():
    response = make_response({"ok": True})
    response.set_cookie("session", "abc123", httponly=True, secure=True, samesite="Lax")
    return response
`,
  },

  {
    id: 'a08-pickle',
    language: 'python',
    category: 'A08',
    label: 'Untrusted data deserialised with pickle',
    mustDetect: ['HARD-A08-001'],
    vulnerable: `import pickle

def load_session(blob):
    return pickle.loads(blob)
`,
    safe: `import json
from pydantic import BaseModel

class Session(BaseModel):
    user_id: int
    role: str

def load_session(blob):
    return Session.model_validate(json.loads(blob))
`,
  },

  {
    id: 'a08-unverified-download',
    language: 'python',
    category: 'A08',
    label: 'Downloaded script piped straight into a shell',
    mustDetect: ['HARD-A08-002'],
    vulnerable: `import subprocess

def install_agent():
    subprocess.run("curl https://example.com/install.sh | sh", shell=True)
`,
    safe: `import hashlib
import subprocess

def install_agent():
    digest = hashlib.sha256(open("install.sh", "rb").read()).hexdigest()
    subprocess.run(["./install.sh"], check=True, env={"SHA256": digest})
`,
  },

  {
    id: 'a09-secret-logged',
    language: 'python',
    category: 'A09',
    label: 'Password written to the log',
    mustDetect: ['HARD-A09-001'],
    vulnerable: `import logging

def authenticate(email, password):
    if not check_password(password):
        logging.info("failed login for %s with password %s", email, password)
        return False
    return True
`,
    safe: `import logging

logger = logging.getLogger("auth")

def authenticate(email, password):
    if not check_password(password):
        logger.warning("failed login", extra={"email": email})
        return False
    return True
`,
  },

  {
    id: 'a10-ssrf',
    language: 'python',
    category: 'A10',
    label: 'Outbound request to a user-supplied URL',
    mustDetect: ['HARD-A10-001'],
    vulnerable: `import requests

def fetch_webhook(url):
    return requests.get(url, timeout=5).text
`,
    safe: `import requests
from urllib.parse import urlparse

ALLOWED_HOSTS = {"hooks.example.com"}

def fetch_webhook(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError("host not allowed")
    return requests.get(url, timeout=5).text
`,
  },

  {
    id: 'a10-open-redirect',
    language: 'javascript',
    category: 'A10',
    label: 'Redirect target taken from the request',
    mustDetect: ['HARD-A10-002'],
    vulnerable: `app.get('/logout', (req, res) => {
  res.redirect(req.query.next || '/login');
});
`,
    safe: `app.get('/logout', (req, res) => {
  res.redirect('/login');
});
`,
  },
];

/**
 * Flatten the fixture set into the individual files the harness writes
 * to disk.
 *
 * @returns {Array<{path: string, language: string, content: string, kind: string, fixture: object}>}
 */
export const flattenFixtures = () => {
  const files = [];
  for (const fixture of FIXTURES) {
    const ext = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      php: 'php',
      java: 'java',
      csharp: 'cs',
      go: 'go',
      rust: 'rs',
      ruby: 'rb',
      sql: 'sql',
      html: 'html',
      css: 'css',
      cpp: 'cpp',
    }[fixture.language] || 'txt';

    files.push({
      path: `vulnerable/${fixture.id}.${ext}`,
      language: fixture.language,
      content: fixture.vulnerable,
      kind: 'vulnerable',
      fixture,
    });
    files.push({
      path: `safe/${fixture.id}.${ext}`,
      language: fixture.language,
      content: fixture.safe,
      kind: 'safe',
      fixture,
    });
  }
  return files;
};
