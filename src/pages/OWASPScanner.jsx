import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  Download,
  RefreshCw,
  FileCode,
  Lock,
  Database,
  Globe,
  UserX,
  FileText,
  Layout,
  Settings,
  Package,
  Code2,
  Sparkles,
  Search,
  Play,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Hash,
  Terminal,
  Eye,
  EyeOff,
  Activity,
  Cpu,
  Clock,
  ArrowRight,
  BookOpen,
  Layers,
  Wand2,
  Send,
  FileBarChart,
  Lightbulb,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';
import { buildSuggestion } from '../utils/owaspSuggestions';
import PageTip from '../components/PageTip';
import EmptyState from '../components/EmptyState';
import { highlight, highlightLanguage } from '../utils/syntaxHighlight';

// ---------------------------------------------------------------------------
// OWASPScanner — Project Eric
// ---------------------------------------------------------------------------
//
// A focused, dedicated OWASP Top 10 (2026) scanner page. Supports two
// scanning modes:
//
//   • Code mode  — paste a snippet in any of 11 languages (JS / TS /
//                  Python / Java / Go / PHP / C# / Rust / Ruby / C++ /
//                  generic) and run all 10 category detectors against it.
//
//   • SQL mode   — paste one or more queries (MySQL / PostgreSQL /
//                  SQLite / T-SQL / generic) and get a deep dive on
//                  injection risks, missing parameterisation, unsafe
//                  dynamic SQL, and the related OWASP categories.
//
// Detectors run in the browser. The scanner is dependency-free (no
// network calls, no AI required) so it works offline. The detector
// implementations are intentionally simple regex/heuristic checks
// tuned for the most common vulnerability patterns, exactly as in
// extensions/project-eric-owasp/src/scanner/scanner.ts.
// ---------------------------------------------------------------------------

const CATEGORY_META = [
  { id: 'A01', name: 'Broken Access Control',        Icon: ShieldAlert, cwe: 'CWE-639', gradient: 'from-rose-500 to-orange-500',    accent: 'rose'    },
  { id: 'A02', name: 'Cryptographic Failures',       Icon: Lock,        cwe: 'CWE-798', gradient: 'from-amber-500 to-yellow-500',  accent: 'amber'   },
  { id: 'A03', name: 'Injection',                    Icon: Database,    cwe: 'CWE-89',  gradient: 'from-red-500 to-pink-500',     accent: 'red'     },
  { id: 'A04', name: 'Insecure Design',              Icon: Layout,      cwe: 'CWE-307', gradient: 'from-violet-500 to-purple-500',accent: 'violet'  },
  { id: 'A05', name: 'Security Misconfiguration',    Icon: Settings,    cwe: 'CWE-16',  gradient: 'from-slate-500 to-slate-700',  accent: 'slate'   },
  { id: 'A06', name: 'Vulnerable Components',        Icon: Package,     cwe: 'CWE-1104',gradient: 'from-orange-500 to-amber-500', accent: 'orange'  },
  { id: 'A07', name: 'Authentication Failures',      Icon: UserX,       cwe: 'CWE-521', gradient: 'from-pink-500 to-rose-500',    accent: 'pink'    },
  { id: 'A08', name: 'Data Integrity Failures',      Icon: FileCode,    cwe: 'CWE-345', gradient: 'from-cyan-500 to-blue-500',     accent: 'cyan'    },
  { id: 'A09', name: 'Logging Failures',             Icon: FileText,    cwe: 'CWE-778', gradient: 'from-indigo-500 to-blue-500',  accent: 'indigo'  },
  { id: 'A10', name: 'SSRF',                         Icon: Globe,       cwe: 'CWE-918', gradient: 'from-emerald-500 to-teal-500', accent: 'emerald' },
];

// Severity → colour map used by every detector.
const STATUS_META = {
  pass:    { label: 'Pass',    text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200',  ring: 'ring-emerald-200',  dot: 'bg-emerald-500',  icon: CheckCircle2 },
  warning: { label: 'Warning', text: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',    ring: 'ring-amber-200',    dot: 'bg-amber-500',    icon: AlertTriangle },
  fail:    { label: 'Fail',    text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-200',      ring: 'ring-red-200',      dot: 'bg-red-500',      icon: XCircle },
};

const SEVERITY_META = {
  critical: { label: 'Critical', pill: 'bg-red-500 text-white' },
  high:     { label: 'High',     pill: 'bg-orange-500 text-white' },
  medium:   { label: 'Medium',   pill: 'bg-amber-500 text-white' },
  low:      { label: 'Low',      pill: 'bg-blue-500 text-white' },
  info:     { label: 'Info',     pill: 'bg-slate-200 text-slate-700' },
};

// ---------------------------------------------------------------------------
// Code-language presets. The user's selection determines which detectors
// get a tiny language-specific tuning (e.g. `db.execute(` vs `pool.query(`)
// but every detector still runs regardless.
// ---------------------------------------------------------------------------
const CODE_LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', ext: 'js',  hint: 'Node / Express / React / Vue' },
  { id: 'typescript', label: 'TypeScript', ext: 'ts',  hint: 'TS apps · React · Angular' },
  { id: 'python',     label: 'Python',     ext: 'py',  hint: 'Django · Flask · FastAPI' },
  { id: 'java',       label: 'Java',       ext: 'java',hint: 'Spring · JEE · Quarkus' },
  { id: 'csharp',     label: 'C#',         ext: 'cs',  hint: '.NET · ASP.NET · Blazor' },
  { id: 'go',         label: 'Go',         ext: 'go',  hint: 'net/http · Gin · Echo' },
  { id: 'php',        label: 'PHP',        ext: 'php', hint: 'Laravel · Symfony · raw' },
  { id: 'ruby',       label: 'Ruby',       ext: 'rb',  hint: 'Rails · Sinatra' },
  { id: 'rust',       label: 'Rust',       ext: 'rs',  hint: 'actix-web · axum' },
  { id: 'cpp',        label: 'C / C++',    ext: 'cpp', hint: 'system / embedded' },
  { id: 'other',      label: 'Other',      ext: 'txt', hint: 'mixed / unknown' },
];

const SQL_DIALECTS = [
  { id: 'mysql',      label: 'MySQL / MariaDB', hint: 'Most web stacks' },
  { id: 'postgres',   label: 'PostgreSQL',      hint: 'Includes $$ blocks' },
  { id: 'tsql',       label: 'T-SQL (SQL Server)', hint: 'Microsoft stack' },
  { id: 'sqlite',     label: 'SQLite',          hint: 'Embedded / mobile' },
  { id: 'oracle',     label: 'Oracle PL/SQL',   hint: 'BEGIN … END blocks' },
  { id: 'generic',    label: 'Generic SQL',     hint: 'ANSI / portable' },
];

// ---------------------------------------------------------------------------
// Sample payloads
// ---------------------------------------------------------------------------
const SAMPLE_CODE = `// Sample vulnerable endpoint — paste your own code to scan
app.get('/user/:id', (req, res) => {
  const id = req.params.id;
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  db.query(query, (err, rows) => {
    res.json(rows);
  });
});

// Hardcoded secret (bad!)
const apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
console.log('Using API key:', apiKey);

const md5 = require('md5');
const hashed = md5(password);

app.get('/fetch', (req, res) => {
  fetch(req.query.url).then(r => r.text()).then(t => res.send(t));
});

// MD5 used for password hashing
app.post('/login', (req, res) => {
  const user = findUser(req.body.username);
  if (user && user.password === md5(req.body.password)) {
    req.session.userId = user.id;
    res.json({ ok: true });
  }
});`;

const SAMPLE_SQL = `-- Sample queries — paste your own to scan
-- 1) Classic SQL injection via string concatenation
SELECT * FROM users WHERE id = ' + userId + ';

-- 2) Dynamic ORDER BY (still injectable)
SELECT id, name, email FROM customers ORDER BY ' + sortColumn + ' LIMIT 10;

-- 3) DELETE with concat (worst kind — destructive)
DELETE FROM orders WHERE created_at > ' + startDate + ' AND status = ' + status;

-- 4) INSERT with user input (mass-assignment)
INSERT INTO comments (author, body, post_id) VALUES (' + author + ', ' + body + ', ' + postId + ');

-- 5) Safe parameterised query — should NOT trigger findings
SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL;

-- 6) UNION-based injection pattern
SELECT name FROM products WHERE category = '' UNION SELECT password FROM users--';`;

// ---------------------------------------------------------------------------
// Per-language vulnerable samples
// ---------------------------------------------------------------------------
// Each sample intentionally demonstrates several OWASP findings: SQLi,
// hard-coded secrets, weak hashing, SSRF, command injection, etc. The
// "Load sample" button and the language tab both feed from this map so
// switching to Python loads a Python sample, switching to PHP loads a
// PHP sample, and so on.
// ---------------------------------------------------------------------------
const LANG_SAMPLES = {
  javascript: `// Node / Express — paste your own to scan
app.get('/user/:id', (req, res) => {
  const id = req.params.id;
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  db.query(query, (err, rows) => res.json(rows));
});

// Hard-coded secret
const apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
console.log("Using API key:", apiKey);

// MD5 for password hashing
const hashed = require('md5')(password);

// SSRF
app.get('/fetch', (req, res) => {
  fetch(req.query.url).then(r => r.text()).then(t => res.send(t));
});

// Command injection
app.get('/ping', (req, res) => {
  require('child_process').exec("ping -c 1 " + req.query.host);
});`,

  typescript: `// TypeScript / Express — paste your own to scan
import { Request, Response } from 'express';

app.get('/user/:id', (req: Request, res: Response) => {
  const id: string = req.params.id;
  const query: string = \`SELECT * FROM users WHERE id = '\${id}'\`;
  db.query(query, (err: any, rows: any) => res.json(rows));
});

const apiKey: string = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
console.log("Using API key:", apiKey);

const hashed: string = require('md5')(password);

app.get('/fetch', (req: Request, res: Response) => {
  fetch(req.query.url).then((r: any) => r.text()).then((t: any) => res.send(t));
});`,

  python: `# Flask / Django — paste your own to scan
from flask import request, render_template_string
import os, pickle

@app.route('/user/<id>')
def get_user(id):
    # SQL injection
    cur.execute("SELECT * FROM users WHERE id = '" + id + "'")
    return cur.fetchone()

# Hard-coded secret
API_KEY = "sk_live_REPLACE_WITH_YOUR_OWN_KEY"
print("Using API key:", API_KEY)

# Command injection
@app.route('/ping')
def ping():
    os.system("ping -c 1 " + request.args.get('host'))

# Insecure deserialisation
@app.route('/load')
def load():
    return pickle.loads(request.data)

# XSS via render_template_string
@app.route('/greet')
def greet():
    return render_template_string("Hello " + request.args.get('name'))`,

  java: `// Spring Boot — paste your own to scan
@RestController
public class UserController {

    @GetMapping("/user/{id}")
    public User getUser(@PathVariable String id) throws Exception {
        // SQL injection
        String sql = "SELECT * FROM users WHERE id = '" + id + "'";
        return jdbcTemplate.queryForObject(sql, new Object[]{}, User.class);
    }

    // Hard-coded credentials
    private static final String DB_PASSWORD = "admin123";
    private static final String API_KEY = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";

    // Command injection
    @GetMapping("/ping")
    public String ping(@RequestParam String host) throws Exception {
        Runtime.getRuntime().exec("ping -c 1 " + host);
        return "ok";
    }

    // MD5 for password hashing
    MessageDigest md = MessageDigest.getInstance("MD5");
    byte[] hash = md.digest(password.getBytes());
}`,

  csharp: `// ASP.NET — paste your own to scan
using System.Data.SqlClient;
using System.Security.Cryptography;

[ApiController]
public class UserController : ControllerBase {

    [HttpGet("user/{id}")]
    public IActionResult GetUser(string id) {
        // SQL injection
        var sql = "SELECT * FROM Users WHERE Id = '" + id + "'";
        using var conn = new SqlConnection(connStr);
        conn.Open();
        return Ok(new SqlCommand(sql, conn).ExecuteReader());
    }

    // Hard-coded secrets
    private const string ApiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
    private const string DbPassword = "P@ssw0rd123";

    // MD5 for password hashing
    public string HashPassword(string password) {
        using var md5 = MD5.Create();
        return BitConverter.ToString(md5.ComputeHash(Encoding.UTF8.GetBytes(password)));
    }

    // Command injection
    [HttpGet("ping")]
    public IActionResult Ping(string host) {
        System.Diagnostics.Process.Start("ping", host);
        return Ok();
    }
}`,

  go: `// net/http — paste your own to scan
package main

import (
    "database/sql"
    "net/http"
    "os/exec"
)

func getUser(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    // SQL injection
    db.Query("SELECT * FROM users WHERE id = '" + id + "'")
}

var apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY" // hard-coded secret

// Command injection
func ping(w http.ResponseWriter, r *http.Request) {
    host := r.URL.Query().Get("host")
    out, _ := exec.Command("sh", "-c", "ping -c 1 "+host).Output()
    w.Write(out)
}

// Weak random for token generation
func newToken() string {
    return strconv.Itoa(rand.Int()) // NOT cryptographically secure
}`,

  php: `<?php
// Laravel / plain PHP — paste your own to scan

// SQL injection
public function show($id) {
    return DB::select("SELECT * FROM users WHERE id = '" . $id . "'");
}

// Hard-coded secret
$apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
echo "Using API key: " . $apiKey;

// MD5 for password hashing
$hashed = md5($_POST['password']);

// XSS
public function greet(Request $req) {
    echo "Hello " . $req->input('name');
}

// Command injection
public function ping(Request $req) {
    system("ping -c 1 " . $req->input('host'));
}

// Insecure deserialisation
public function load(Request $req) {
    return unserialize($req->getContent());
}`,

  ruby: `# Rails — paste your own to scan
class UsersController < ApplicationController

  def show
    # SQL injection
    User.where("id = '" + params[:id] + "'")
  end

  # Hard-coded secret
  API_KEY = "sk_live_REPLACE_WITH_YOUR_OWN_KEY"
  puts "Using API key: #{API_KEY}"

  # Command injection
  def ping
    host = params[:host]
    system("ping -c 1 #{host}")
  end

  # MD5 for password hashing
  def hash_password(pw)
    Digest::MD5.hexdigest(pw)
  end

  # Unsafe deserialisation
  def load
    Marshal.load(params[:data])
  end
end`,

  rust: `// actix-web / sqlx — paste your own to scan
use actix_web::{web, HttpResponse};

async fn get_user(path: web::Path<String>) -> HttpResponse {
    let id = path.into_inner();
    // SQL injection (raw concatenation)
    let q = format!("SELECT * FROM users WHERE id = '{}'", id);
    let row = sqlx::query(&q).fetch_one(&pool).await.unwrap();
    HttpResponse::Ok().json(row)
}

// Hard-coded secret
const API_KEY: &str = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";

// Command injection
async fn ping(host: web::Query<String>) -> HttpResponse {
    std::process::Command::new("sh")
        .arg("-c").arg(format!("ping -c 1 {}", host.0))
        .output().unwrap();
    HttpResponse::Ok().finish()
}

// MD5 (weak hashing) for passwords
fn hash_password(pw: &str) -> String {
    format!("{:x}", md5::compute(pw))
}`,

  cpp: `// Plain C / C++ — paste your own to scan
#include <cstdio>
#include <cstring>
#include <cstdlib>

void get_user(const char* id) {
    // SQL injection (sprintf into a buffer — also buffer overflow risk)
    char query[256];
    sprintf(query, "SELECT * FROM users WHERE id = '%s'", id);
    db_exec(query);
}

// Hard-coded secret
const char* API_KEY = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";

// Command injection
void ping(const char* host) {
    char cmd[256];
    sprintf(cmd, "ping -c 1 %s", host);
    system(cmd);
}

// Buffer overflow: gets() and strcpy
void copy_name(char* dst, const char* src) {
    gets(dst);              // CWE-242
    strcpy(dst, src);       // CWE-120
}`,

  other: `// Plain text / unknown language — paste your own to scan
// This sample shows a few generic vulnerable patterns.

// SQL injection
"SELECT * FROM users WHERE id = '" + id + "'";

// Hard-coded secret
api_key = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";

// Weak hashing
hash = md5(password);

// Command injection
exec("ping -c 1 " + host);

// SSRF
fetch(user_url).read()`,
};

// Helper: pick the right sample for the current mode/language/dialect.
const getSampleCode = (mode, language, dialect) => {
  if (mode === 'sql') return SAMPLE_SQL;
  if (language === 'other') return LANG_SAMPLES.other;
  return LANG_SAMPLES[language] || LANG_SAMPLES.javascript;
};

// ---------------------------------------------------------------------------
// Small helpers used by the detectors
// ---------------------------------------------------------------------------
const LINE_INDEX = (code) => code.split('\n');

const findMatches = (code, re) => {
  const lines = LINE_INDEX(code);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
      out.push({ line: i + 1, snippet: line.trim().slice(0, 220) });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out;
};

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

// ---------------------------------------------------------------------------
// OWASP Top 10 (2026) detectors
//
// Every detector returns the same shape:
//   {
//     id, name, status: 'pass'|'warning'|'fail',
//     count, severity, description, cwe, remediation, evidence: [{line, snippet}]
//   }
// ---------------------------------------------------------------------------

const detectA01_BrokenAccessControl = (code) => {
  try {
    const routePatterns = [
      /\bapp\.(get|post|put|delete|patch)\s*\(\s*['"`][^'"`]*\b:id\b[^'"`]*['"`]/g,
      /\brouter\.(get|post|put|delete|patch)\s*\(\s*['"`][^'"`]*\b:id\b[^'"`]*['"`]/g,
    ];
    const idReads = [
      /req\.params\.id/g,
      /req\.params\.[a-zA-Z_]+\b/g,
      /params\[['"]id['"]\]/g,
    ];
    const authzHints = [
      /\bauthorize\s*\(/i,
      /\bcheckPermission\s*\(/i,
      /\b(req\.user|ctx\.user|currentUser)\b/,
      /\bif\s*\([^)]*(?:isAdmin|isOwner|canEdit|currentUser|userId)/i,
    ];

    let evidence = [];
    for (const re of routePatterns) evidence = evidence.concat(findMatches(code, re));
    for (const re of idReads) evidence = evidence.concat(findMatches(code, re));
    const hasRoute = evidence.length > 0;
    const hasAuthz = authzHints.some((re) => re.test(code));
    const suspicious = hasRoute && !hasAuthz ? Math.min(evidence.length, 6) : 0;

    const status = suspicious >= 2 ? 'fail' : suspicious === 1 ? 'warning' : 'pass';
    const severity = status === 'fail' ? 'high' : status === 'warning' ? 'medium' : 'info';
    return {
      id: 'A01', name: 'Broken Access Control', status, count: suspicious, severity,
      description: status === 'pass'
        ? 'No insecure direct-object-reference patterns detected in the supplied code.'
        : `${suspicious} route${suspicious === 1 ? '' : 's'} read a user-supplied identifier without an obvious authorization check.`,
      cwe: 'CWE-639',
      remediation: 'Verify the requesting user owns / is permitted to access the requested resource on every route that takes a user id. Add per-route authorization middleware.',
      evidence: evidence.slice(0, 8),
    };
  } catch {
    return { id: 'A01', name: 'Broken Access Control', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped (could not analyse).', cwe: 'CWE-639', remediation: 'Manually verify authorization on routes that take a user-supplied id.', evidence: [] };
  }
};

const detectA02_CryptographicFailures = (code) => {
  try {
    const weakAlgo = /\b(?:md5|sha1)\s*\(/gi;
    const hardcodedSecret = /(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*['"]([^'"]{8,})['"]/gi;
    const httpUrl = /\bhttp:\/\/[^\s'"`]+/g;
    const insecureRandom = /\bMath\.random\s*\(/g;

    const weakMatches = findMatches(code, weakAlgo);
    const secretMatches = findMatches(code, hardcodedSecret);
    const httpMatches = findMatches(code, httpUrl);
    const randMatches = findMatches(code, insecureRandom);

    const total = weakMatches.length + secretMatches.length + httpMatches.length + randMatches.length;
    const score = weakMatches.length * 3 + secretMatches.length * 4 + httpMatches.length + randMatches.length;

    let status = 'pass';
    let severity = 'info';
    if (score >= 4) { status = 'fail'; severity = 'critical'; }
    else if (score >= 1) { status = 'warning'; severity = 'medium'; }

    const parts = [];
    if (weakMatches.length) parts.push(`${weakMatches.length} use of a weak hash (md5/sha1)`);
    if (secretMatches.length) parts.push(`${secretMatches.length} hardcoded credential${secretMatches.length === 1 ? '' : 's'}`);
    if (httpMatches.length) parts.push(`${httpMatches.length} plain http:// URL${httpMatches.length === 1 ? '' : 's'}`);
    if (randMatches.length) parts.push(`${randMatches.length} Math.random call${randMatches.length === 1 ? '' : 's'} (non-cryptographic)`);

    return {
      id: 'A02', name: 'Cryptographic Failures', status, count: total, severity,
      description: parts.length ? `Found: ${parts.join(', ')}.` : 'No weak crypto, hardcoded secrets or plain http:// URLs detected.',
      cwe: 'CWE-798',
      remediation: 'Use bcrypt/argon2 for passwords, sha-256+ for general hashing, HTTPS-only URLs, crypto.randomBytes for tokens, and load secrets from a managed store (env, KMS, vault).',
      evidence: [...weakMatches, ...secretMatches, ...httpMatches, ...randMatches].slice(0, 8),
    };
  } catch {
    return { id: 'A02', name: 'Cryptographic Failures', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-798', remediation: 'Verify secrets, hashing algorithms and transport security manually.', evidence: [] };
  }
};

// The Injection detector doubles as the SQL-mode backbone: in SQL mode we
// re-target the same regexes at query concatenation patterns.
const detectA03_Injection = (code, mode = 'code') => {
  try {
    // SQL concat in code mode (string-built queries)
    const sqlConcat = /(['"`])\s*\+\s*[a-zA-Z_][\w.]*\s*\+\s*\1|["']SELECT\b[^"']*["']\s*\+/gi;
    const sqlExec = /\b(?:db\.query|conn\.query|knex\.raw|sequelize\.query|pool\.query|\.execute|\.exec)\s*\(\s*[^,)]*\+/g;
    const sqlTpl = /`(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/gi;

    // SQL mode — direct concatenation in the supplied queries
    const sqlConcatSql = /['"`\s]\+\s*[a-zA-Z_][\w.]*\s*\+\s*['"`\s;]|["'`]\s*\+\s*[a-zA-Z_][\w.]*\s*\+\s*['"`]/g;
    const unionInj = /UNION\s+(?:ALL\s+)?SELECT/gi;
    const tautology = /\bOR\s+['"`]?\d+['"`]?\s*=\s*['"`]?\d+['"`]?/gi;
    const stackedQuery = /;\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\s/gi;

    const evalExec = /\beval\s*\(/g;
    const newFunction = /\bnew\s+Function\s*\(/g;
    const childProcess = /\bchild_process\b|\bexecSync\s*\(|\bspawn\s*\(/g;
    const osCommand = /\b(?:os\.system|subprocess\.|popen)\b/g;
    const innerHTML = /\.innerHTML\s*=/g;
    const documentWrite = /\bdocument\.write\s*\(/g;

    let sqlMatches = [];
    if (mode === 'sql') {
      sqlMatches = [
        ...findMatches(code, sqlConcatSql),
        ...findMatches(code, unionInj),
        ...findMatches(code, tautology),
        ...findMatches(code, stackedQuery),
      ];
    } else {
      sqlMatches = [
        ...findMatches(code, sqlConcat),
        ...findMatches(code, sqlExec),
        ...findMatches(code, sqlTpl),
      ];
    }
    const jsMatches = [...findMatches(code, evalExec), ...findMatches(code, newFunction)];
    const cmdMatches = [...findMatches(code, childProcess), ...findMatches(code, osCommand)];
    const domMatches = [...findMatches(code, innerHTML), ...findMatches(code, documentWrite)];

    const total = sqlMatches.length + jsMatches.length + cmdMatches.length + domMatches.length;
    // SQL & eval weigh more than DOM sinks.
    const score = sqlMatches.length * 4 + jsMatches.length * 3 + cmdMatches.length * 3 + domMatches.length;
    let status = 'pass', severity = 'info';
    if (score >= 4) { status = 'fail'; severity = 'critical'; }
    else if (score >= 1) { status = 'warning'; severity = 'high'; }

    const parts = [];
    if (sqlMatches.length) parts.push(`${sqlMatches.length} SQL injection risk${sqlMatches.length === 1 ? '' : 's'}`);
    if (jsMatches.length) parts.push(`${jsMatches.length} dynamic code execution${jsMatches.length === 1 ? '' : 's'} (eval/new Function)`);
    if (cmdMatches.length) parts.push(`${cmdMatches.length} OS command sink${cmdMatches.length === 1 ? '' : 's'}`);
    if (domMatches.length) parts.push(`${domMatches.length} DOM XSS sink${domMatches.length === 1 ? '' : 's'}`);

    const baseRem = mode === 'sql'
      ? 'Use parameterised queries / prepared statements with placeholders ($1, ?, @id). Never concatenate user input into SQL. Validate identifiers with an allowlist when dynamic ORDER BY / column names are required.'
      : 'Use parameterised queries, never concatenate user input into SQL. Avoid eval / new Function. Sanitise HTML or use safe DOM APIs (textContent) instead of innerHTML.';

    return {
      id: 'A03', name: 'Injection', status, count: total, severity,
      description: parts.length ? `Found: ${parts.join(', ')}.` : 'No SQL, command or DOM injection sinks detected.',
      cwe: 'CWE-89',
      remediation: baseRem,
      evidence: [...sqlMatches, ...jsMatches, ...cmdMatches, ...domMatches].slice(0, 8),
    };
  } catch {
    return { id: 'A03', name: 'Injection', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-89', remediation: 'Audit SQL, eval and DOM sinks manually.', evidence: [] };
  }
};

const detectA04_InsecureDesign = (code) => {
  try {
    const rateLimitHints = /\b(rate[_-]?limit|throttle|express[_-]?rate[_-]?limit|slow[_-]?down)\b/i;
    const authFlow = /\b(login|signin|sign[-_]?in|authenticate|verifyToken|jwt|bcrypt)\b/i;
    const todoless = /\b(TODO|FIXME|XXX|HACK)\b.*?(?:auth|password|security|crypto)/i;

    const hasRateLimit = rateLimitHints.test(code);
    const hasAuth = authFlow.test(code);
    const todoMatches = findMatches(code, todoless);

    let suspicious = 0;
    let desc = '';
    if (!hasRateLimit && hasAuth) { suspicious += 1; desc = 'Authentication code present but no rate-limit hint detected.'; }
    if (todoMatches.length) { suspicious += todoMatches.length; desc = (desc ? desc + ' ' : '') + `${todoMatches.length} TODO/FIXME comment(s) about security in the code.`; }
    if (!suspicious) desc = 'No obvious insecure-design patterns detected.';

    const status = suspicious >= 2 ? 'fail' : suspicious >= 1 ? 'warning' : 'pass';
    const severity = status === 'fail' ? 'high' : status === 'warning' ? 'medium' : 'info';
    return {
      id: 'A04', name: 'Insecure Design', status, count: suspicious, severity,
      description: truncate(desc, 220),
      cwe: 'CWE-307',
      remediation: 'Apply per-IP and per-account rate limits on auth endpoints, plan abuse cases up-front, and resolve security-related TODO/FIXME comments before shipping.',
      evidence: todoMatches.slice(0, 8),
    };
  } catch {
    return { id: 'A04', name: 'Insecure Design', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-307', remediation: 'Audit rate-limits and abuse cases manually.', evidence: [] };
  }
};

const detectA05_SecurityMisconfiguration = (code) => {
  try {
    const corsStar = /cors\s*\(\s*\{\s*origin\s*:\s*['"`]\*['"`]/g;
    const corsAll = /Access-Control-Allow-Origin['":\s]+['"`]\*['"`]/g;
    const debugFlag = /\b(console\.log|console\.debug|debug\s*=\s*true|DEBUG\s*=\s*True|NODE_ENV\s*[!=]=\s*['"`]development['"`])\b/g;
    const stackTrace = /\.(stack|stacktrace)\s*[,)]/g;
    const defaultCreds = /\b(?:admin|root|user)\s*[:=]\s*['"`](?:admin|root|toor|password|12345?|changeme)['"`]/gi;
    const disableSecurity = /\bhelmet\s*\(\s*\)|disable\s*\(\s*['"`](?:x-frame|xss|csp)['"`]/gi;

    const matches = [
      ...findMatches(code, corsStar),
      ...findMatches(code, corsAll),
      ...findMatches(code, debugFlag),
      ...findMatches(code, stackTrace),
      ...findMatches(code, defaultCreds),
      ...findMatches(code, disableSecurity),
    ];

    const count = matches.length;
    const status = count >= 2 ? 'fail' : count === 1 ? 'warning' : 'pass';
    const severity = status === 'fail' ? 'high' : status === 'warning' ? 'medium' : 'info';
    const desc = count
      ? `${count} misconfiguration signal${count === 1 ? '' : 's'} detected (CORS *, debug flags, default creds, …).`
      : 'No CORS-*, default-credential or debug-flag patterns detected.';
    return {
      id: 'A05', name: 'Security Misconfiguration', status, count, severity,
      description: desc,
      cwe: 'CWE-16',
      remediation: 'Lock down CORS to explicit origins, disable debug in production, ship default-deny settings and helmet-style security headers.',
      evidence: matches.slice(0, 8),
    };
  } catch {
    return { id: 'A05', name: 'Security Misconfiguration', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-16', remediation: 'Audit CORS, debug flags and default credentials manually.', evidence: [] };
  }
};

const detectA06_VulnerableComponents = (code) => {
  try {
    const pkgVersion = /['"`]([a-z0-9_./@\-]+)['"`]\s*:\s*['"`](?:\^|~|>=?)?\s*([0-9]+(?:\.[0-9]+){0,2})['"`]/gi;
    const matches = [];
    const seen = new Set();
    let m;
    while ((m = pkgVersion.exec(code)) !== null) {
      const dep = m[1];
      const ver = m[2];
      if (!/^[a-z0-9@/_\-.]+$/i.test(dep)) continue;
      if (dep.startsWith('.') || dep.startsWith('/')) continue;
      const key = `${dep}@${ver}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const flagged = [
        /^lodash@0\.|^lodash@1\.|^lodash@2\.|^lodash@3\.|^lodash@4\.0(\.|$)|^lodash@4\.1[0-6]\./i,
        /^request@/i,
        /^minimist@0\.|^minimist@1\.0(\.|$)/i,
        /^node-fetch@1\./i,
        /^axios@0\.([0-9]|1[0-7])\./i,
        /^jquery@([0-2]\.|3\.0\.|3\.1\.|3\.2\.|3\.3\.|3\.4\.0)/i,
        /^handlebars@1\.|^handlebars@2\.|^handlebars@3\.|^handlebars@4\.0\.|^handlebars@4\.1\.0/i,
      ];
      const isOld = flagged.some((re) => re.test(`${dep}@${ver}`));
      if (isOld) matches.push({ line: 0, snippet: `${dep}@${ver}` });
    }

    const count = matches.length;
    const status = count >= 1 ? 'warning' : 'pass';
    const severity = count >= 2 ? 'high' : count === 1 ? 'medium' : 'info';
    const desc = count
      ? `${count} dependency version(s) flagged against a small built-in advisory list.`
      : 'No outdated / known-vulnerable dependencies flagged in the supplied snippet.';
    return {
      id: 'A06', name: 'Vulnerable Components', status, count, severity,
      description: desc,
      cwe: 'CWE-1104',
      remediation: 'Run `npm audit` / `yarn audit` or a real SBOM tool (Snyk, OSV) on every build. Pin and upgrade flagged dependencies.',
      evidence: matches.slice(0, 8),
    };
  } catch {
    return { id: 'A06', name: 'Vulnerable Components', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-1104', remediation: 'Audit dependencies manually.', evidence: [] };
  }
};

const detectA07_AuthenticationFailures = (code) => {
  try {
    const weakPasswordCompare = /(?:password|passwd|pwd)\s*===?\s*(?:req\.body|user\.|input)/gi;
    const plainCompare = /(?:password|passwd|pwd)\s*===?\s*['"`]/g;
    const noHash = /\b(?:md5|sha1|sha256)\s*\(\s*(?:req\.body|password|user\.)/gi;
    const jwtNone = /jwt\.sign\s*\([^,]+,\s*[^,]+,\s*\{\s*algorithm\s*:\s*['"`none['"`]/gi;
    const missingMfa = /\bMFA\b|\b2FA\b|\bTOTP\b|\bmfa\b|\b2fa\b|\btotp\b/i;

    const weakMatches = [...findMatches(code, weakPasswordCompare), ...findMatches(code, plainCompare), ...findMatches(code, noHash), ...findMatches(code, jwtNone)];
    const hasMfa = missingMfa.test(code);

    let suspicious = weakMatches.length;
    const findings = [...weakMatches];
    if (!hasMfa && /\b(login|signin|sign[-_]?in)\b/i.test(code)) {
      suspicious += 1;
      findings.push({ line: 0, snippet: '(no MFA / 2FA hint found)' });
    }

    const status = suspicious >= 2 ? 'fail' : suspicious >= 1 ? 'warning' : 'pass';
    const severity = status === 'fail' ? 'high' : status === 'warning' ? 'medium' : 'info';
    const desc = suspicious
      ? `${suspicious} authentication red flag(s): ${weakMatches.length ? 'weak password compare / plain hash' : ''}${!hasMfa && /\b(login|signin)\b/i.test(code) ? (weakMatches.length ? '; ' : '') + 'no MFA hint' : ''}.`
      : 'No obvious authentication red flags detected.';

    return {
      id: 'A07', name: 'Authentication Failures', status, count: suspicious, severity,
      description: truncate(desc, 220),
      cwe: 'CWE-521',
      remediation: 'Use bcrypt/argon2 for password hashing, constant-time comparison, enforce MFA, and rotate any leaked signing keys.',
      evidence: findings.slice(0, 8),
    };
  } catch {
    return { id: 'A07', name: 'Authentication Failures', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-521', remediation: 'Audit password storage and MFA manually.', evidence: [] };
  }
};

const detectA08_DataIntegrityFailures = (code) => {
  try {
    const unsafeDeserialize = /\b(?:deserialize|unserialize|yaml\.load|json\.parse\s*\(\s*(?:req|ctx|request|input|body|data))/gi;
    const noVerify = /\bverify\s*:\s*false\b|\bskipVerify\s*[:=]\s*true/gi;
    const unsignedJwt = /jwt\.decode\s*\(/g;
    const autoEval = /\beval\s*\(.*?(?:req|body|input|data)/gi;

    const matches = [
      ...findMatches(code, unsafeDeserialize),
      ...findMatches(code, noVerify),
      ...findMatches(code, unsignedJwt),
      ...findMatches(code, autoEval),
    ];

    const count = matches.length;
    const status = count >= 1 ? 'warning' : 'pass';
    const severity = count >= 2 ? 'high' : count === 1 ? 'medium' : 'info';
    const desc = count
      ? `${count} data-integrity concern(s) detected (unsafe deserialization, unsigned JWT, verify:false).`
      : 'No unsafe deserialization or unsigned-JWT patterns detected.';
    return {
      id: 'A08', name: 'Data Integrity Failures', status, count, severity,
      description: desc,
      cwe: 'CWE-345',
      remediation: 'Use safe deserializers, verify JWT signatures, sign CI artefacts and lock down auto-update channels.',
      evidence: matches.slice(0, 8),
    };
  } catch {
    return { id: 'A08', name: 'Data Integrity Failures', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-345', remediation: 'Audit deserialisation and signing manually.', evidence: [] };
  }
};

const detectA09_LoggingFailures = (code) => {
  try {
    const loginRoutes = /\b(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`](?:\/login|\/signin|\/auth|\/password|\/reset|\/logout)[^'"`]*['"`]/gi;
    const adminRoutes = /\b(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`](?:\/admin|\/manage|\/users?\/)[^'"`]*['"`]/gi;
    const loggerPresent = /\b(winston|pino|bunyan|morgan|logger\.|log\.info|log\.warn|log\.error)\b/i;
    const consoleOnly = /console\.(log|info|warn|error)/g;

    const sensitiveRoutes = [...findMatches(code, loginRoutes), ...findMatches(code, adminRoutes)];
    const hasLogger = loggerPresent.test(code);
    const consoleMatches = findMatches(code, consoleOnly);

    let suspicious = 0;
    const findings = [];
    if (sensitiveRoutes.length && !hasLogger) {
      suspicious += 1;
      findings.push({ line: 0, snippet: `${sensitiveRoutes.length} sensitive route(s) but no winston/pino/morgan import found` });
    }
    if (consoleMatches.length >= 4 && !hasLogger) {
      suspicious += 1;
      findings.push({ line: 0, snippet: `${consoleMatches.length} console.* calls without a structured logger` });
    }

    const status = suspicious >= 1 ? 'warning' : 'pass';
    const severity = suspicious >= 2 ? 'high' : suspicious === 1 ? 'medium' : 'info';
    const desc = suspicious
      ? `${suspicious} logging gap(s) detected on sensitive routes or console-only output.`
      : 'Sensitive routes appear to be covered by a real logger.';

    return {
      id: 'A09', name: 'Logging Failures', status, count: suspicious, severity,
      description: desc,
      cwe: 'CWE-778',
      remediation: 'Add structured logging on auth, authorization and data-modification events with user id, IP and timestamp.',
      evidence: findings.slice(0, 8),
    };
  } catch {
    return { id: 'A09', name: 'Logging Failures', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-778', remediation: 'Audit audit-log coverage manually.', evidence: [] };
  }
};

const detectA10_SSRF = (code) => {
  try {
    const fetchUser = /\b(?:fetch|axios|got|request|urllib|http\.request|https\.request)\s*\(\s*(?:req\.|ctx\.|input|body|data)/gi;
    const httpFromVar = /\b(?:fetch|axios|got|request)\s*\(\s*[a-zA-Z_][\w.]*\s*\)/g;
    const validateMissing = !/\b(isValidUrl|allowlist|allowed_hosts|allowList|validateUrl|isUrlSafe)\s*\(/i.test(code);

    const matches = [...findMatches(code, fetchUser), ...findMatches(code, httpFromVar)];
    const suspicious = matches.filter((m) => !/['"`]https?:\/\/(?:api|localhost|127\.0\.0\.1)/.test(m.snippet));
    const count = suspicious.length;
    let status = 'pass', severity = 'info';
    if (count >= 1 && validateMissing) { status = 'warning'; severity = 'medium'; }
    if (count >= 3 && validateMissing) { status = 'fail'; severity = 'high'; }

    const desc = count
      ? `${count} outbound HTTP request(s) use a dynamic URL without an obvious allowlist check.`
      : 'No dynamic outbound HTTP from user input detected.';
    return {
      id: 'A10', name: 'SSRF', status, count, severity,
      description: desc,
      cwe: 'CWE-918',
      remediation: 'Validate and allowlist outbound URLs, resolve DNS yourself to block private/loopback addresses, and disable HTTP redirections on the HTTP client.',
      evidence: suspicious.slice(0, 8),
    };
  } catch {
    return { id: 'A10', name: 'SSRF', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-918', remediation: 'Audit outbound URL flows manually.', evidence: [] };
  }
};

// SQL-mode specific extras — emit them as additional "soft" findings
// that appear under the Injection card with extra remediation hints.
const detectSqlExtras = (code) => {
  const findings = [];
  const concat = findMatches(code, /['"`\s]\+\s*[a-zA-Z_][\w.]*\s*\+\s*['"`\s;]|["'`]\s*\+\s*[a-zA-Z_][\w.]*\s*\+\s*['"`]/g);
  if (concat.length) findings.push({ line: 0, snippet: `${concat.length} dynamic concatenation${concat.length === 1 ? '' : 's'} in queries` });

  const noParam = !/(\$\d|\?|@\w+)\b/.test(code) && /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(code);
  if (noParam) findings.push({ line: 0, snippet: 'no parameter placeholders ($1, ?, @id) detected anywhere in the supplied queries' });

  const exec = /\b(?:EXEC|EXECUTE)\s*\(\s*['"`]/i.test(code);
  if (exec) findings.push({ line: 0, snippet: 'EXEC/EXECUTE called with a string literal — likely dynamic SQL' });

  const userTab = /\bFROM\s+['"`]([a-zA-Z_]\w*)['"`]/i.test(code);
  if (userTab) findings.push({ line: 0, snippet: 'table / column name passed as a string literal in FROM' });

  return findings;
};

// Run every detector in sequence. mode === 'sql' pivots the Injection
// detector to look at the SQL queries directly.
//
// `language` and `mode` are used to attach a tailored "Improvement"
// suggestion (before/after code + change list + checklist + references)
// to each finding so the user has a concrete reference for fixing the
// vulnerable code.
const runDetectors = async (code, mode, language, onProgress) => {
  const detectors = [
    detectA01_BrokenAccessControl,
    detectA02_CryptographicFailures,
    (c) => detectA03_Injection(c, mode),
    detectA04_InsecureDesign,
    detectA05_SecurityMisconfiguration,
    detectA06_VulnerableComponents,
    detectA07_AuthenticationFailures,
    detectA08_DataIntegrityFailures,
    detectA09_LoggingFailures,
    detectA10_SSRF,
  ];
  const out = [];
  for (let i = 0; i < detectors.length; i++) {
    const r = detectors[i](code);
    // Always attach a suggestion pack — even when the detector passes,
    // so the UI can show a "what good looks like" reference.
    r.suggestion = buildSuggestion(r.id, language, mode);
    out.push(r);
    if (onProgress) onProgress({ done: i + 1, total: detectors.length, latest: r });
    await new Promise((res) => setTimeout(res, 90));
  }
  if (mode === 'sql') {
    const injection = out.find((r) => r.id === 'A03');
    const extra = detectSqlExtras(code);
    if (extra.length) {
      injection.evidence = [...injection.evidence, ...extra].slice(0, 8);
      injection.count += extra.length;
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Background (animated, security-themed)
// ---------------------------------------------------------------------------
const ScannerBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    {/* Faint grid */}
    <div
      className="absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage: 'linear-gradient(#0f172a 1px, transparent 1px), linear-gradient(90deg, #0f172a 1px, transparent 1px)',
        backgroundSize: '52px 52px',
      }}
    />
    {/* Color orbs */}
    <div
      className="absolute w-[700px] h-[700px] rounded-full opacity-[0.12] animate-orb-1 blur-3xl"
      style={{ background: 'radial-gradient(circle, rgba(16, 185, 129, 0.55) 0%, transparent 70%)', top: '-260px', left: '-160px' }}
    />
    <div
      className="absolute w-[500px] h-[500px] rounded-full opacity-[0.10] animate-orb-2 blur-3xl"
      style={{ background: 'radial-gradient(circle, rgba(59, 130, 246, 0.55) 0%, transparent 70%)', bottom: '-200px', right: '-120px' }}
    />
    <div
      className="absolute w-[420px] h-[420px] rounded-full opacity-[0.08] animate-orb-3 blur-3xl"
      style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.5) 0%, transparent 70%)', top: '45%', right: '30%' }}
    />
    {/* Floating shield silhouettes */}
    {[...Array(6)].map((_, i) => (
      <div
        key={i}
        className="absolute opacity-[0.08] animate-particle"
        style={{
          left: `${8 + i * 14}%`,
          top: `${10 + (i % 4) * 22}%`,
          animationDelay: `${i * 0.6}s`,
        }}
      >
        <Shield className="w-7 h-7 text-emerald-500" />
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Animated counter (used by the score gauge)
// ---------------------------------------------------------------------------
const useAnimatedNumber = (target, duration = 1200) => {
  const [value, setValue] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    const start = previous.current;
    const end = target;
    if (start === end) return;
    const startTime = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(start + (end - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else previous.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
};

// ---------------------------------------------------------------------------
// Security Score Ring (animated SVG)
// ---------------------------------------------------------------------------
const ScoreRing = ({ score = 0 }) => {
  const radius = 64;
  const stroke = 9;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference);
    }, 80);
    return () => clearTimeout(t);
  }, [score, circumference]);

  const animated = useAnimatedNumber(score);

  const tier =
    score >= 85 ? { label: 'Low Risk',     from: 'from-emerald-500', to: 'to-teal-500',   text: 'text-emerald-600' } :
    score >= 65 ? { label: 'Medium Risk',  from: 'from-amber-500',   to: 'to-orange-500', text: 'text-amber-600' } :
                  { label: 'High Risk',    from: 'from-rose-500',    to: 'to-red-600',    text: 'text-rose-600' };

  return (
    <div className="relative w-[180px] h-[180px] flex items-center justify-center">
      <svg height={radius * 2} width={radius * 2} className="absolute -rotate-90">
        <defs>
          <linearGradient id="owaspScoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        <circle stroke="rgba(226,232,240,0.7)" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} />
        <circle
          stroke="url(#owaspScoreGradient)"
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          style={{ strokeDashoffset: offset, transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)' }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className={`text-4xl font-bold tabular-nums bg-gradient-to-br ${tier.from} ${tier.to} bg-clip-text text-transparent`}>
          {animated}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">Security Score</span>
        <span className={`text-[11px] font-semibold ${tier.text} mt-0.5`}>{tier.label}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Improvement / "How to fix" block
//
// Sits inside the expanded CategoryCard. Renders a summary, a side-by-side
// before/after code diff (the "after" snippet is copyable so the user can
// paste it into their editor as a starting reference), an ordered "apply
// these changes" list, a manual-validation checklist, and authoritative
// reference links (OWASP / CWE / cheat sheets). All text is supplied by
// buildSuggestion() so it stays in sync with the detectors.
// ---------------------------------------------------------------------------
const CodeChip = ({ value, label, tone = 'slate', onCopy }) => {
  const [copied, setCopied] = useState(false);
  const tones = {
    danger:  { wrap: 'border-red-300/70 dark:border-red-500/40',    head: 'bg-red-100/80 dark:bg-red-500/20 text-red-700 dark:text-red-200',    body: 'bg-red-950/40 text-red-100 border-red-900/60' },
    success: { wrap: 'border-emerald-300/70 dark:border-emerald-500/40', head: 'bg-emerald-100/80 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-200', body: 'bg-emerald-950/40 text-emerald-100 border-emerald-900/60' },
    slate:   { wrap: 'border-slate-300/70 dark:border-slate-700/60',  head: 'bg-slate-200/80 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200', body: 'bg-slate-950 text-slate-100 border-slate-800' },
  };
  const t = tones[tone] || tones.slate;
  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopy && onCopy(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Fallback: select-and-copy via a hidden textarea
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        onCopy && onCopy(true);
        setTimeout(() => setCopied(false), 1400);
      } catch {
        onCopy && onCopy(false);
      }
    }
  };
  return (
    <div className={`rounded-xl border ${t.wrap} overflow-hidden`}>
      <div className={`flex items-center justify-between px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${t.head}`}>
        <span className="truncate">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!value}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50 transition-colors text-[10px] font-bold disabled:opacity-50"
          title="Copy this snippet to your clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className={`m-0 px-3 py-2.5 text-[11px] leading-relaxed font-mono whitespace-pre overflow-auto max-h-48 border-t ${t.body}`}>
        {value || <span className="text-slate-500 italic">No snippet available for this category — follow the change list below.</span>}
      </pre>
    </div>
  );
};

const ImprovementBlock = ({ suggestion, onToast }) => {
  if (!suggestion) return null;
  const handleCopyToast = (ok) => {
    if (ok && onToast) onToast('Suggestion copied — paste it into your editor as a reference.', 'success');
    if (!ok && onToast) onToast('Copy failed — your browser may have blocked clipboard access.', 'warning');
  };
  return (
    <div className="pt-2">
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
        <Lightbulb className="w-3 h-3" /> How to improve
      </p>

      {/* summary */}
      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-3 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-500/10 dark:to-yellow-500/10 border border-amber-200/70 dark:border-amber-500/30 p-2.5 rounded-xl">
        {suggestion.summary}
      </p>

      {/* before / after */}
      {(suggestion.before || suggestion.after) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
          <CodeChip value={suggestion.before} label={suggestion.beforeLabel || 'Before'} tone="danger" onCopy={handleCopyToast} />
          <CodeChip value={suggestion.after}  label={suggestion.afterLabel  || 'After — copy this as a reference'} tone="success" onCopy={handleCopyToast} />
        </div>
      )}

      {/* changes */}
      {Array.isArray(suggestion.changes) && suggestion.changes.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
            <Wand2 className="w-3 h-3" /> Apply these changes
          </p>
          <ol className="list-decimal list-inside space-y-1 text-xs text-slate-700 dark:text-slate-300 pl-1 marker:text-blue-500 marker:font-bold">
            {suggestion.changes.map((c, i) => (
              <li key={i} className="leading-relaxed">{c}</li>
            ))}
          </ol>
        </div>
      )}

      {/* checklist */}
      {Array.isArray(suggestion.checklist) && suggestion.checklist.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> Validate after the fix
          </p>
          <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
            {suggestion.checklist.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 leading-relaxed">
                <input
                  type="checkbox"
                  aria-label={`Validation step: ${c}`}
                  className="mt-0.5 w-3.5 h-3.5 accent-emerald-500 flex-shrink-0"
                />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* references */}
      {Array.isArray(suggestion.refs) && suggestion.refs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestion.refs.map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-200/70 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
            >
              <BookOpen className="w-3 h-3" /> {r.title} <ArrowRight className="w-3 h-3" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// OWASP Category card
// ---------------------------------------------------------------------------
const CategoryCard = ({ finding, expanded, onToggle, mode, onToast }) => {
  const meta = CATEGORY_META.find((c) => c.id === finding.id);
  const Icon = meta?.Icon || Shield;
  const status = STATUS_META[finding.status];
  const StatusIcon = status.icon;
  const sev = SEVERITY_META[finding.severity];

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-white/80 dark:bg-slate-900/70 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${status.border} ${status.bg}`}
    >
      {/* Soft accent corner */}
      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${meta?.gradient || 'from-slate-400 to-slate-600'} opacity-15 blur-2xl`} />

      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 flex items-start gap-3"
        aria-expanded={expanded}
      >
        <div className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${meta?.gradient || 'from-slate-400 to-slate-600'} flex items-center justify-center shadow-md flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
          <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
            <StatusIcon className={`w-3 h-3 ${status.text}`} />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-[10px] font-bold text-slate-400">{finding.id}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${status.dot} text-white`}>
              <StatusIcon className="w-3 h-3" />
              {status.label}
            </span>
            {finding.status !== 'pass' && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${sev.pill}`}>
                {sev.label}
              </span>
            )}
            {finding.count > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/70 dark:bg-slate-800/80 text-[10px] font-mono font-semibold text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700/60">
                <Hash className="w-3 h-3" /> {finding.count}
              </span>
            )}
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{meta?.name || finding.name}</h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed line-clamp-2">{finding.description}</p>
        </div>
        <div className="flex-shrink-0 self-center text-slate-400 group-hover:text-slate-700 transition-colors">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200/70 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40 animate-slide-up">
          <div className="pt-4 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" /> Description
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{finding.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">CWE</p>
                <code className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200">
                  {finding.cwe}
                </code>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">Count</p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{finding.count} issue{finding.count === 1 ? '' : 's'}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
                <Wand2 className="w-3 h-3" /> Remediation
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60 p-2.5 rounded-xl leading-relaxed">
                {finding.remediation}
              </p>
            </div>

            {finding.evidence && finding.evidence.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <Terminal className="w-3 h-3" /> Evidence ({finding.evidence.length})
                </p>
                <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
                  {finding.evidence.map((ev, i) => (
                    <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 text-emerald-300 font-mono text-[11px] border border-slate-800">
                      {ev.line > 0 && (
                        <span className="text-slate-500 select-none flex-shrink-0">{ev.line}</span>
                      )}
                      <span className="break-all whitespace-pre-wrap">{ev.snippet}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How to improve — concrete before/after reference, change
                list, validation checklist, and authoritative references
                supplied by buildSuggestion(id, language, mode). */}
            <ImprovementBlock
              suggestion={finding.suggestion}
              onToast={onToast}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Mode picker (Code / SQL)
// ---------------------------------------------------------------------------
const ModePicker = ({ mode, onChange }) => (
  <div className="inline-flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
    {[
      { id: 'code', label: 'Code', Icon: Code2, hint: 'Any language' },
      { id: 'sql',  label: 'SQL',  Icon: Database, hint: 'Query audit' },
    ].map((opt) => {
      const active = mode === opt.id;
      return (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
            active
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <opt.Icon className="w-4 h-4" />
          <span>{opt.label}</span>
          <span className={`hidden sm:inline text-[10px] font-medium ${active ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400'}`}>
            {opt.hint}
          </span>
        </button>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Stat pill (used in the hero)
// ---------------------------------------------------------------------------
const StatPill = ({ icon: Icon, label, value, accent = 'blue' }) => {
  // The hero card is always a deep navy gradient, regardless of the page's
  // light/dark theme. So the pill surfaces here must use light text + a
  // visible solid-ish tint that survives the gradient. We bake in the icon
  // and label colors per accent so the contrast never depends on `dark:`.
  const accents = {
    blue:    { wrap: 'bg-blue-500/25 ring-blue-300/60',    icon: 'text-blue-100',   text: 'text-white' },
    emerald: { wrap: 'bg-emerald-500/25 ring-emerald-300/60', icon: 'text-emerald-100', text: 'text-white' },
    amber:   { wrap: 'bg-amber-500/25 ring-amber-300/60',  icon: 'text-amber-100',  text: 'text-white' },
    red:     { wrap: 'bg-red-500/25 ring-red-300/60',      icon: 'text-red-100',    text: 'text-white' },
    slate:   { wrap: 'bg-white/15 ring-white/40',          icon: 'text-white',      text: 'text-white' },
  };
  const a = accents[accent] || accents.blue;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${a.wrap} ring-1 backdrop-blur-md shadow-md`}>
      <Icon className={`w-4 h-4 shrink-0 ${a.icon}`} />
      <div className="flex flex-col leading-tight">
        <span className={`text-[10px] uppercase tracking-wider font-extrabold ${a.text} opacity-90`}>{label}</span>
        <span className={`text-sm font-extrabold tabular-nums ${a.text}`}>{value}</span>
      </div>
    </div>
  );
};

// ===========================================================================
// Page
// ===========================================================================
const OWASPScanner = () => {
  const { showToast } = useToast();
  const { setLastScanResult, lastScanResult } = useApp();
  const editorBgRef = useRef(null);   // highlighted layer behind the textarea

  // Inputs ------------------------------------------------------------
  const [mode, setMode] = useState('code');
  const [code, setCode] = useState(() => getSampleCode('code', 'javascript', 'generic'));
  const [language, setLanguage] = useState('javascript');
  const [dialect, setDialect] = useState('generic');

  // Scan state --------------------------------------------------------
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);   // { score, summary, scanTime, findings, totalIssues, mode, language }
  const [expanded, setExpanded] = useState(null); // A0x id
  const [filter, setFilter] = useState('all');     // all | pass | warning | fail
  const [recentScans, setRecentScans] = useState([]);

  // Persistence ------------------------------------------------------
  useEffect(() => {
    try {
      const saved = localStorage.getItem('owasp_scanner_history');
      if (saved) setRecentScans(JSON.parse(saved).slice(0, 6));
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!results) return;
    const entry = {
      id: `${Date.now()}`,
      mode,
      language: mode === 'sql' ? dialect : language,
      score: results.score,
      summary: results.summary,
      issues: results.totalIssues,
      when: new Date().toISOString(),
    };
    setRecentScans((prev) => {
      const next = [entry, ...prev].slice(0, 6);
      try { localStorage.setItem('owasp_scanner_history', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results?.score]);

  // Reset sample when mode flips -------------------------------------
  useEffect(() => {
    if (!results) {
      setCode(getSampleCode(mode, language, dialect));
    }
  }, [mode, language, dialect, results]);

  // Derived ----------------------------------------------------------
  const filteredFindings = useMemo(() => {
    if (!results) return [];
    if (filter === 'all') return results.findings;
    return results.findings.filter((f) => f.status === filter);
  }, [results, filter]);

  const summary = useMemo(() => {
    if (!results) return { pass: 0, warn: 0, fail: 0 };
    return {
      pass:  results.findings.filter((f) => f.status === 'pass').length,
      warn:  results.findings.filter((f) => f.status === 'warning').length,
      fail:  results.findings.filter((f) => f.status === 'fail').length,
    };
  }, [results]);

  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const charCount = useMemo(() => code.length, [code]);

  // Memoised highlighted HTML for the editor's background layer.
  const highlightedHTML = useMemo(
    () => highlight(code, highlightLanguage(language, mode, dialect)),
    [code, language, mode, dialect]
  );

  // Keep the highlighted layer in sync with the textarea scroll position.
  const syncEditorScroll = useCallback((e) => {
    const bg = editorBgRef.current;
    if (!bg) return;
    bg.scrollTop = e.target.scrollTop;
    bg.scrollLeft = e.target.scrollLeft;
  }, []);

  // Scan -------------------------------------------------------------
  const scanAbortRef = useRef(false);

  const runScan = useCallback(async () => {
    if (!code.trim()) {
      showToast('Paste some code or SQL first.', 'warning');
      return;
    }
    if (isRunning) return;
    setIsRunning(true);
    setProgress(0);
    setResults(null);
    scanAbortRef.current = false;

    const start = performance.now();
    try {
      const findings = await runDetectors(code, mode, mode === 'sql' ? dialect : language, ({ done, total, latest }) => {
        if (scanAbortRef.current) return;
        setProgress(Math.round((done / total) * 100));
        setResults((prev) => {
          const acc = prev?.findings ? [...prev.findings] : [];
          acc.push(latest);
          const totalIssues = acc.reduce((a, f) => a + (f.count || 0), 0);
          const score = Math.max(0, Math.min(100, 100 - totalIssues * 4));
          const summary = score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk';
          return {
            score,
            summary,
            scanTime: ((performance.now() - start) / 1000).toFixed(1) + 's',
            findings: acc,
            totalIssues,
            running: true,
            mode,
            language: mode === 'sql' ? dialect : language,
          };
        });
      });

      if (scanAbortRef.current) {
        setIsRunning(false);
        return;
      }

      const totalIssues = findings.reduce((a, f) => a + (f.count || 0), 0);
      const score = Math.max(0, Math.min(100, 100 - totalIssues * 4));
      const summary = score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk';
      setProgress(100);
      const finalResult = {
        score,
        summary,
        scanTime: ((performance.now() - start) / 1000).toFixed(1) + 's',
        findings,
        totalIssues,
        running: false,
        mode,
        language: mode === 'sql' ? dialect : language,
        // Saved inputs so the destination pages can show what was scanned
        // and let the user re-run the scan from there.
        snippetPreview: code.split('\n').slice(0, 6).join('\n'),
        lineCount: code.split('\n').length,
        scannedAt: new Date().toISOString(),
      };
      setResults(finalResult);
      // Share with the rest of the app so the Analysis / Threats /
      // Reports pages can show this result without a re-scan.
      setLastScanResult(finalResult);
      showToast(`OWASP scan complete · score ${score}/100`, 'success');
    } catch (e) {
      showToast(`Scan failed: ${e?.message || String(e)}`, 'error');
    } finally {
      setIsRunning(false);
    }
  }, [code, mode, language, dialect, isRunning, showToast]);

  const cancelScan = () => {
    scanAbortRef.current = true;
    setIsRunning(false);
  };

  const handleReset = () => {
    setResults(null);
    setProgress(0);
    setExpanded(null);
    setCode(getSampleCode(mode, language, dialect));
    showToast('Scanner reset', 'info');
  };

  const handleExport = () => {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `owasp-${mode}-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('OWASP report exported', 'success');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showToast('Snippet copied to clipboard', 'success');
    } catch {
      showToast('Copy failed — your browser may have blocked clipboard access.', 'warning');
    }
  };

  const handleClear = () => {
    setCode('');
    setResults(null);
  };

  // Render ------------------------------------------------------------
  return (
    <div className="relative min-h-[calc(100vh-56px)] p-6 lg:p-8">
      <ScannerBackground />

      <div className="relative z-10 max-w-[1600px] mx-auto">
        {/* Page tip */}
        <PageTip
          pageId="owasp-scanner"
          variant="info"
          title="Scan code or SQL for OWASP Top 10 risks"
          body="Pick a mode — Code or SQL — paste a snippet, choose the language or dialect, then run the scan. Each of the 10 OWASP 2026 categories is checked; expand a card for evidence, CWE, and remediation steps."
        />

        {/* ============================================================ */}
        {/* HERO                                                          */}
        {/* ============================================================ */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 dark:from-slate-950 dark:via-blue-950 dark:to-indigo-950 p-6 lg:p-8 shadow-2xl mb-6 animate-page-enter">
          <div className="absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-emerald-500/30 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-12 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl" />

          <div className="relative grid lg:grid-cols-[1fr_auto] gap-8 items-center">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-medium text-blue-100 mb-4">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>OWASP Top 10 · 2026</span>
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2 tracking-tight">
                OWASP Security Scanner
              </h1>
              <p className="text-slate-300 text-sm lg:text-base max-w-2xl mb-5">
                Paste any <strong className="text-emerald-300">code snippet</strong> or{' '}
                <strong className="text-blue-300">SQL query</strong>. We statically analyse it against all 10
                OWASP categories — no execution, no network calls, fully in your browser — and surface
                remediation steps with CWE references.
              </p>

              <div className="flex flex-wrap items-center gap-3 mb-5">
                <ModePicker mode={mode} onChange={setMode} />
                <button
                  onClick={runScan}
                  disabled={isRunning}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isRunning
                      ? 'bg-amber-500 text-white'
                      : 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white hover:shadow-emerald-500/30'
                  }`}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Scanning… {progress}%
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Run OWASP Scan
                    </>
                  )}
                </button>
                {isRunning ? (
                  <button
                    onClick={cancelScan}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                )}
                {results && !isRunning && (
                  <button
                    onClick={handleExport}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export JSON
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatPill icon={FileCode} label="Lines" value={lineCount.toLocaleString()} accent="blue" />
                <StatPill icon={Layers} label="Chars" value={charCount.toLocaleString()} accent="slate" />
                {results && (
                  <>
                    <StatPill
                      icon={Activity}
                      label="Score"
                      value={`${results.score}/100`}
                      accent={results.score >= 85 ? 'emerald' : results.score >= 65 ? 'amber' : 'red'}
                    />
                    <StatPill icon={AlertTriangle} label="Issues" value={results.totalIssues} accent={results.totalIssues === 0 ? 'emerald' : results.totalIssues < 5 ? 'amber' : 'red'} />
                    <StatPill icon={Clock} label="Took" value={results.scanTime} accent="slate" />
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-center lg:justify-end">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/30 to-blue-500/30 blur-2xl rounded-full" />
                <div className="relative bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-3xl p-5 shadow-2xl border border-white/40 dark:border-slate-700/60">
                  <ScoreRing score={results?.score ?? 0} />
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1.5">
                      <div className="text-base font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{summary.pass}</div>
                      <div className="text-[9px] uppercase tracking-wider font-bold text-emerald-600/80">Pass</div>
                    </div>
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 px-2 py-1.5">
                      <div className="text-base font-bold text-amber-700 dark:text-amber-300 tabular-nums">{summary.warn}</div>
                      <div className="text-[9px] uppercase tracking-wider font-bold text-amber-600/80">Warn</div>
                    </div>
                    <div className="rounded-xl bg-red-50 dark:bg-red-500/10 px-2 py-1.5">
                      <div className="text-base font-bold text-red-700 dark:text-red-300 tabular-nums">{summary.fail}</div>
                      <div className="text-[9px] uppercase tracking-wider font-bold text-red-600/80">Fail</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* MAIN GRID — editor (left) + results (right)                   */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6">

          {/* Editor ----------------------------------------------------- */}
          <div className="space-y-4">
            {/* Language / dialect picker */}
            <div className="glass-strong rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-slate-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {mode === 'code' ? 'Language' : 'SQL Dialect'}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    disabled={!code}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                  <button
                    onClick={handleClear}
                    disabled={!code}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {mode === 'code' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CODE_LANGUAGES.map((l) => {
                    const active = language === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setLanguage(l.id)}
                        className={`text-left p-2.5 rounded-xl border transition-all ${
                          active
                            ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/15 ring-2 ring-blue-200 dark:ring-blue-500/30'
                            : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${active ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                            {l.label}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">.{l.ext}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{l.hint}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {SQL_DIALECTS.map((d) => {
                    const active = dialect === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDialect(d.id)}
                        className={`text-left p-2.5 rounded-xl border transition-all ${
                          active
                            ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/15 ring-2 ring-blue-200 dark:ring-blue-500/30'
                            : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <span className={`text-xs font-bold ${active ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>
                          {d.label}
                        </span>
                        <p className="text-[10px] text-slate-500 mt-0.5">{d.hint}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Code input */}
            <div className="glass-strong rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200/70 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </span>
                  <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 ml-2">
                    {mode === 'sql'
                      ? `${dialect === 'generic' ? 'query' : dialect}.sql`
                      : `${language === 'other' ? 'snippet' : language}.${CODE_LANGUAGES.find((l) => l.id === language)?.ext || 'txt'}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  <span>{lineCount} lines</span>
                  <span>·</span>
                  <span>{charCount.toLocaleString()} chars</span>
                </div>
              </div>
              <div className="relative bg-slate-950">
                {/* Highlighted background layer */}
                <pre
                  ref={editorBgRef}
                  aria-hidden="true"
                  className="absolute inset-0 p-4 m-0 text-[12.5px] leading-relaxed font-mono text-slate-100 whitespace-pre-wrap break-words overflow-auto pointer-events-none rounded-none"
                  style={{ tabSize: 2 }}
                  dangerouslySetInnerHTML={{ __html: highlightedHTML + ' ' }}
                />
                {/* Foreground transparent textarea for input + caret */}
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onScroll={syncEditorScroll}
                  spellCheck={false}
                  placeholder={mode === 'sql'
                    ? 'Paste your SQL here (one or more queries)…'
                    : 'Paste your code here…'}
                  className="relative block w-full min-h-[420px] max-h-[640px] resize-y p-4 text-[12.5px] leading-relaxed font-mono bg-transparent text-transparent caret-emerald-200 placeholder:text-slate-500 focus:outline-none selection:bg-blue-500/40"
                  style={{ tabSize: 2, WebkitTextFillColor: 'transparent' }}
                />
              </div>
              <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200/70 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/40 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3 h-3" />
                  Static analysis — your code never leaves the browser.
                </span>
                <span className="font-mono">
                  {mode === 'sql' ? 'SQL mode' : `${CODE_LANGUAGES.find((l) => l.id === language)?.label} mode`}
                </span>
              </div>
            </div>

            {/* Recent scans (small) */}
            {recentScans.length > 0 && (
              <div className="glass-strong rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Recent Scans</h3>
                </div>
                <div className="space-y-1.5">
                  {recentScans.map((s) => {
                    const color =
                      s.score >= 85 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200' :
                      s.score >= 65 ? 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 border-amber-200' :
                                      'text-rose-600 bg-rose-50 dark:bg-rose-500/10 border-rose-200';
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg font-bold text-xs border tabular-nums ${color}`}>
                          {s.score}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            {s.mode === 'sql' ? 'SQL' : 'Code'} · {s.language}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {s.issues} issue{s.issues === 1 ? '' : 's'} · {s.summary}
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {new Date(s.when).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Results --------------------------------------------------- */}
          <div className="space-y-4">
            <div className="glass-strong rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">OWASP Top 10 (2026) Results</h3>
                  {results && (
                    <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      results.score >= 85 ? 'bg-emerald-100 text-emerald-700' :
                      results.score >= 65 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {results.summary}
                    </span>
                  )}
                </div>
                {results && (
                  <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
                    {[
                      { id: 'all',     label: `All (${results.findings.length})` },
                      { id: 'fail',    label: `Fail (${summary.fail})` },
                      { id: 'warning', label: `Warn (${summary.warn})` },
                      { id: 'pass',    label: `Pass (${summary.pass})` },
                    ].map((opt) => {
                      const active = filter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setFilter(opt.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                            active
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* "Send to" hand-off bar — appears as soon as a scan
                  finishes. Each button is a <Link> so it routes through
                  React Router without a hard reload, and the destination
                  page reads the same scan from the AppContext that this
                  component just wrote. */}
              {results && !results.running && (
                <div className="mb-4 -mt-1 p-2.5 rounded-xl border border-blue-200/70 dark:border-blue-500/30 bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-violet-50/60 dark:from-blue-500/10 dark:via-indigo-500/10 dark:to-violet-500/10 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider pr-1">
                    <Send className="w-3.5 h-3.5" />
                    Send to
                  </span>
                  <Link
                    to="/analysis"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-all shadow-sm hover:shadow"
                    title="Open these findings in the Analysis page"
                  >
                    <FileBarChart className="w-3.5 h-3.5 text-blue-600" />
                    Analysis
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                  </Link>
                  <Link
                    to="/threats"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-all shadow-sm hover:shadow"
                    title="Open these findings in the Threats page"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    Threats
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                  </Link>
                  <Link
                    to="/reports"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-all shadow-sm hover:shadow"
                    title="Generate a report from this scan"
                  >
                    <FileText className="w-3.5 h-3.5 text-violet-600" />
                    Reports
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                  </Link>
                  {lastScanResult?.scannedAt && (
                    <span className="ml-auto text-[10px] text-slate-500 dark:text-slate-400">
                      Shared to all pages
                    </span>
                  )}
                </div>
              )}

              {/* Progress bar (during scan) */}
              {isRunning && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                      Analyzing {results?.findings?.length || 0} / 10 OWASP detectors
                      {results?.findings?.length > 0 && (
                        <>
                          {' · '}<strong className="text-slate-700 dark:text-slate-200 normal-case">
                            {results.findings[results.findings.length - 1]?.name || '…'}
                          </strong>
                        </>
                      )}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{progress}%</span>
                  </div>
                  <div className="h-2 bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-violet-500 rounded-full transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Findings */}
              {!results && !isRunning && (
                <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/60 bg-slate-50/40 dark:bg-slate-800/30">
                  <EmptyState
                    icon={Search}
                    iconColor="from-emerald-500 to-blue-500"
                    iconBg="bg-emerald-50"
                    title="Ready to scan"
                    description={`Paste ${mode === 'sql' ? 'your SQL queries' : 'a code snippet'} on the left and press Run OWASP Scan. All 10 OWASP 2026 categories will be checked in sequence, and findings will appear here with evidence, CWE references, and remediation steps.`}
                    primaryCta={{ label: 'Run a quick scan', onClick: runScan }}
                    secondaryCta={{ label: 'Load sample', onClick: () => setCode(getSampleCode(mode, language, dialect)) }}
                  />
                </div>
              )}

              {results && (
                <div className="space-y-3">
                  {filteredFindings.length === 0 ? (
                    <div className="text-center text-sm text-slate-500 py-8">
                      No findings match the current filter.
                    </div>
                  ) : (
                    filteredFindings.map((f) => (
                      <CategoryCard
                        key={f.id}
                        finding={f}
                        expanded={expanded === f.id}
                        onToggle={() => setExpanded(expanded === f.id ? null : f.id)}
                        mode={mode}
                        onToast={showToast}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Inline mini-row of detector pass/warn/fail badges (after
                the scan has populated some results during streaming) */}
            {results?.running && results.findings?.length > 0 && (
              <div className="glass-strong rounded-2xl p-3 flex flex-wrap gap-1.5">
                {results.findings.map((f) => (
                  <span
                    key={f.id}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold ${
                      f.status === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                      f.status === 'warning' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}
                  >
                    {f.id}
                    {f.status === 'pass' ? <CheckCircle2 className="w-3 h-3" /> : f.status === 'warning' ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* FOOTER INFO STRIP                                            */}
        {/* ============================================================ */}
        <div className="mt-8 glass-strong rounded-2xl p-5 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">10 OWASP Categories</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Every detector follows the OWASP Top 10 (2026). Each finding maps to a CWE identifier and ships with a concrete remediation step.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">In-browser, no network</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  All analysis runs locally in your browser. Your code never leaves the device, never gets sent to a server, and never executes.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md flex-shrink-0">
                <ArrowRight className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Want deeper scans?</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Open the bundled <strong className="text-slate-700 dark:text-slate-200">code-server workbench</strong> for live squigglies, or jump to the full <strong className="text-slate-700 dark:text-slate-200">OWASP Analysis</strong> page for the AI advisor.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href="/owasp-analysis"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700"
                  >
                    Full analysis <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OWASPScanner;