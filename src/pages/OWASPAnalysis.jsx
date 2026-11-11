import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader,
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
  Code,
  Activity,
  Eye,
  Bot,
  Wand2,
  Send,
  Sparkles,
  Loader2,
  KeyRound,
  Copy,
  Check,
  ArrowRight,
  X,
  Monitor,
  Code2,
  Server,
  ExternalLink,
  Maximize2,
  Power,
  PowerOff,
  ChevronDown,
  ChevronUp,
  Terminal,
  Save,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import PageTip from '../components/PageTip';
import { CODE_SERVER_EMBED_PATH } from '../services/codeServer';
import {
  callAI,
  hasAIKey,
  getAIConfig,
  generateFix,
  explainIssue,
  extractCodeBlock,
} from '../services/aiService';
import {
  loadManifest,
  loadOwaspPack,
  loadLanguage,
  listLanguages,
  analyse as analyseWithPack,
} from '../utils/owaspPackLoader';

// ---------------------------------------------------------------------------
// OWASP detector pipeline
// ---------------------------------------------------------------------------
//
// Each detector scans the supplied source code and returns an OWASP-shaped
// finding:
//   {
//     id: 'A0x',                  // category id
//     name: '…',                  // category title
//     status: 'pass' | 'warning' | 'fail',
//     count: <number>,            // # of issues found
//     severity: 'critical' | 'high' | 'medium' | 'low' | 'info',
//     description: '…',           // one-line summary
//     cwe: 'CWE-…',               // mapped CWE id
//     remediation: '…',           // what to do to fix
//     evidence: [{ line, snippet }],  // matches in the code
//   }
//
// Detectors run in sequence. A short per-detector delay produces the
// progress bar you see during a scan. The pipeline is intentionally
// dependency-free so it runs entirely in the browser.
// ---------------------------------------------------------------------------

const CATEGORY_ICONS = {
  'Broken Access Control': Lock,
  'Cryptographic Failures': Lock,
  'Injection': FileCode,
  'Insecure Design': Layout,
  'Security Misconfiguration': Settings,
  'Vulnerable Components': Package,
  'Authentication Failures': UserX,
  'Data Integrity Failures': Database,
  'Logging Failures': FileText,
  'SSRF': Globe,
};

const STATUS_CONFIG = {
  pass:    { bg: 'bg-emerald-500', text: 'text-emerald-700', bgLight: 'bg-emerald-50', border: 'border-emerald-200', label: 'Pass' },
  warning: { bg: 'bg-amber-500',   text: 'text-amber-700',   bgLight: 'bg-amber-50',   border: 'border-amber-200',   label: 'Warning' },
  fail:    { bg: 'bg-red-500',     text: 'text-red-700',     bgLight: 'bg-red-50',     border: 'border-red-200',     label: 'Fail' },
};

// ============================================================
// code-server (https://github.com/coder/code-server) integration
//
// Project Eric's existing PowerShell scripts download code-server v4.141
// from coder/code-server and start it on 127.0.0.1:8080 with --auth none.
// The OWASP scanner ships as a bundled extension pack — by dropping it
// into code-server's workspace folder you get the same live security
// dashboard, diagnostics and one-click fixes you'd get in desktop VS Code,
// but right inside the browser. This replaces the previous textarea-based
// "paste code here" flow for users who want to edit and scan in a real
// editor. The textarea stays as a fallback / quick-test input.
// ============================================================

const CODE_SERVER_URL = 'http://127.0.0.1:8080';
const CODE_SERVER_HEALTHZ = `${CODE_SERVER_URL}/healthz`;
const CODE_SERVER_DOCS_URL = 'https://github.com/coder/code-server';
const OWASP_VSIX_NAME = 'project-eric-owasp-0.1.0.vsix';

// Map language id → file extension for the "push to workspace" action.
const LANGUAGE_EXT = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  java: 'java',
  go: 'go',
  php: 'php',
  csharp: 'cs',
  other: 'txt',
};


const DEFAULT_CODE = `// Sample vulnerable endpoint — paste your own code to scan
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

// ---------------------------------------------------------------------------
// Small helpers used by the detectors
// ---------------------------------------------------------------------------

const LINE_INDEX = (code) => code.split('\n');

const findMatches = (code, re) => {
  // Returns [{ line: 1-based line number, snippet }] for every match.
  const lines = LINE_INDEX(code);
  const out = [];
  // A regex without the "g" flag restarts at index 0 on every exec(),
  // so the loop below would keep returning the same match and never
  // finish — the scan hung the whole page. Match against a global copy
  // so a caller that forgot the flag still gets every match on the line.
  const global = re.global
    ? re
    : new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Reset lastIndex for safety (we pass /g flags).
    global.lastIndex = 0;
    let m;
    while ((m = global.exec(line)) !== null) {
      out.push({ line: i + 1, snippet: line.trim().slice(0, 160) });
      if (m.index === global.lastIndex) global.lastIndex++; // avoid infinite loops on zero-width matches
    }
  }
  return out;
};

const countMatches = (code, re) => findMatches(code, re).length;

const hasAny = (code, patterns) => patterns.some((re) => re.test(code));

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

// ---------------------------------------------------------------------------
// Per-category detectors
// ---------------------------------------------------------------------------
//
// Each detector returns an OWASP-shaped finding. They never throw — if a
// pattern blows up we degrade to a `pass` with a "could not analyse"
// description so the rest of the pipeline keeps running.
// ---------------------------------------------------------------------------

const detectA01_BrokenAccessControl = (code) => {
  try {
    // Heuristics: routes that take a user-supplied id from the URL and read
    // straight from the database / store without an authZ check in scope.
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
    let suspicious = 0;
    for (const re of routePatterns) {
      evidence = evidence.concat(findMatches(code, re));
    }
    for (const re of idReads) {
      evidence = evidence.concat(findMatches(code, re));
    }
    const hasRoute = evidence.length > 0;
    const hasAuthz = authzHints.some((re) => re.test(code));
    if (hasRoute && !hasAuthz) suspicious = Math.min(evidence.length, 6);

    const status = suspicious >= 2 ? 'fail' : suspicious === 1 ? 'warning' : 'pass';
    const severity = status === 'fail' ? 'high' : status === 'warning' ? 'medium' : 'info';
    return {
      id: 'A01',
      name: 'Broken Access Control',
      status,
      count: suspicious,
      severity,
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
    // Weight: secrets and weak hashes weigh more than Math.random and plain http URLs.
    const score = weakMatches.length * 3 + secretMatches.length * 4 + httpMatches.length + randMatches.length;

    let status = 'pass';
    let severity = 'info';
    if (score >= 4) { status = 'fail'; severity = 'critical'; }
    else if (score >= 1) { status = 'warning'; severity = 'medium'; }

    const desc = (() => {
      const parts = [];
      if (weakMatches.length) parts.push(`${weakMatches.length} use of a weak hash (md5/sha1)`);
      if (secretMatches.length) parts.push(`${secretMatches.length} hardcoded credential${secretMatches.length === 1 ? '' : 's'}`);
      if (httpMatches.length) parts.push(`${httpMatches.length} plain http:// URL${httpMatches.length === 1 ? '' : 's'}`);
      if (randMatches.length) parts.push(`${randMatches.length} Math.random call${randMatches.length === 1 ? '' : 's'} (non-cryptographic)`);
      return parts.length ? `Found: ${parts.join(', ')}.` : 'No weak crypto, hardcoded secrets or plain http:// URLs detected.';
    })();

    return {
      id: 'A02',
      name: 'Cryptographic Failures',
      status,
      count: total,
      severity,
      description: desc,
      cwe: 'CWE-798',
      remediation: 'Use bcrypt/argon2 for passwords, sha-256+ for general hashing, HTTPS-only URLs, crypto.randomBytes for tokens, and load secrets from a managed store (env, KMS, vault).',
      evidence: [...weakMatches, ...secretMatches, ...httpMatches, ...randMatches].slice(0, 8),
    };
  } catch {
    return { id: 'A02', name: 'Cryptographic Failures', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-798', remediation: 'Verify secrets, hashing algorithms and transport security manually.', evidence: [] };
  }
};

const detectA03_Injection = (code) => {
  try {
    const sqlConcat = /(['"`])\s*\+\s*[a-zA-Z_][\w.]*\s*\+\s*\1|["']SELECT\b[^"']*["']\s*\+/gi;
    const sqlExec = /\b(?:db\.query|conn\.query|knex\.raw|sequelize\.query|pool\.query|\.execute)\s*\(\s*[^,)]*\+/g;
    const sqlTpl = /`(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/gi;
    const evalExec = /\beval\s*\(/g;
    const newFunction = /\bnew\s+Function\s*\(/g;
    const childProcess = /\bchild_process\b|\bexecSync\s*\(|\bspawn\s*\(/g;
    const osCommand = /\b(?:os\.system|subprocess\.|popen)\b/g;
    const innerHTML = /\.innerHTML\s*=/g;
    const documentWrite = /\bdocument\.write\s*\(/g;

    const sqlMatches = [...findMatches(code, sqlConcat), ...findMatches(code, sqlExec), ...findMatches(code, sqlTpl)];
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
    if (sqlMatches.length) parts.push(`${sqlMatches.length} SQL concatenation${sqlMatches.length === 1 ? '' : 's'}`);
    if (jsMatches.length) parts.push(`${jsMatches.length} dynamic code execution${jsMatches.length === 1 ? '' : 's'} (eval/new Function)`);
    if (cmdMatches.length) parts.push(`${cmdMatches.length} OS command sink${cmdMatches.length === 1 ? '' : 's'}`);
    if (domMatches.length) parts.push(`${domMatches.length} DOM XSS sink${domMatches.length === 1 ? '' : 's'}`);

    return {
      id: 'A03',
      name: 'Injection',
      status,
      count: total,
      severity,
      description: parts.length ? `Found: ${parts.join(', ')}.` : 'No SQL, command or DOM injection sinks detected.',
      cwe: 'CWE-89',
      remediation: 'Use parameterised queries, never concatenate user input into SQL. Avoid eval / new Function. Sanitise HTML or use safe DOM APIs (textContent) instead of innerHTML.',
      evidence: [...sqlMatches, ...jsMatches, ...cmdMatches, ...domMatches].slice(0, 8),
    };
  } catch {
    return { id: 'A03', name: 'Injection', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-89', remediation: 'Audit SQL, eval and DOM sinks manually.', evidence: [] };
  }
};

const detectA04_InsecureDesign = (code) => {
  try {
    // Heuristics: auth/rate-limit hints, generous comments about "TODO".
    const rateLimitHints = /\b(rate[_-]?limit|throttle|express[_-]?rate[_-]?limit|slow[_-]?down)\b/i;
    const authFlow = /\b(login|signin|sign[-_]?in|authenticate|verifyToken|jwt|bcrypt)\b/i;
    const todoless = /\b(TODO|FIXME|XXX|HACK)\b[^\n]{0,80}?(?:auth|password|security|crypto|secret|sanitize|escape)/gi;

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
      id: 'A04',
      name: 'Insecure Design',
      status,
      count: suspicious,
      severity,
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
      id: 'A05',
      name: 'Security Misconfiguration',
      status,
      count,
      severity,
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
    // Lightweight dependency scanner: look at requirements / package.json blocks.
    const pkgVersion = /['"`]([a-z0-9_./@\-]+)['"`]\s*:\s*['"`](?:\^|~|>=?)?\s*([0-9]+(?:\.[0-9]+){0,2})['"`]/gi;
    const matches = [];
    const seen = new Set();
    let m;
    while ((m = pkgVersion.exec(code)) !== null) {
      const dep = m[1];
      const ver = m[2];
      // Only count real-looking package names (avoid catching local config keys).
      if (!/^[a-z0-9@/_\-.]+$/i.test(dep)) continue;
      if (dep.startsWith('.') || dep.startsWith('/')) continue;
      const key = `${dep}@${ver}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Tiny known-vulnerable list for offline demos. Real apps should hit
      // an SBOM service like npm-audit / Snyk / OSV — but this catches the
      // most common demos (very old lodash, request, etc.).
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
      id: 'A06',
      name: 'Vulnerable Components',
      status,
      count,
      severity,
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
      id: 'A07',
      name: 'Authentication Failures',
      status,
      count: suspicious,
      severity,
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
      id: 'A08',
      name: 'Data Integrity Failures',
      status,
      count,
      severity,
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
    // Lots of console.* with no real logger = a sign of weak logging.
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
      id: 'A09',
      name: 'Logging Failures',
      status,
      count: suspicious,
      severity,
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
    // SSRF: outbound HTTP / fetch / request from user input without an allowlist.
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
      id: 'A10',
      name: 'SSRF',
      status,
      count,
      severity,
      description: desc,
      cwe: 'CWE-918',
      remediation: 'Validate and allowlist outbound URLs, resolve DNS yourself to block private/loopback addresses, and disable HTTP redirections on the HTTP client.',
      evidence: suspicious.slice(0, 8),
    };
  } catch {
    return { id: 'A10', name: 'SSRF', status: 'pass', count: 0, severity: 'info', description: 'Detector skipped.', cwe: 'CWE-918', remediation: 'Audit outbound URL flows manually.', evidence: [] };
  }
};

// Run every detector in sequence.
const runAllDetectors = async (code, onProgress) => {
  const detectors = [
    detectA01_BrokenAccessControl,
    detectA02_CryptographicFailures,
    detectA03_Injection,
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
    out.push(r);
    if (onProgress) onProgress({ done: i + 1, total: detectors.length, latest: r });
    // Tiny delay so the progress bar feels like a real scan instead of a snap.
    await new Promise((res) => setTimeout(res, 90));
  }
  return out;
};

// Static metadata (icon, name) keyed by category id for the UI.
const OWASP_META = [
  { id: 'A01', name: 'Broken Access Control',          defaultSeverity: 'high' },
  { id: 'A02', name: 'Cryptographic Failures',         defaultSeverity: 'critical' },
  { id: 'A03', name: 'Injection',                      defaultSeverity: 'critical' },
  { id: 'A04', name: 'Insecure Design',                defaultSeverity: 'medium' },
  { id: 'A05', name: 'Security Misconfiguration',      defaultSeverity: 'medium' },
  { id: 'A06', name: 'Vulnerable Components',          defaultSeverity: 'medium' },
  { id: 'A07', name: 'Authentication Failures',        defaultSeverity: 'high' },
  { id: 'A08', name: 'Data Integrity Failures',        defaultSeverity: 'medium' },
  { id: 'A09', name: 'Logging Failures',               defaultSeverity: 'medium' },
  { id: 'A10', name: 'SSRF',                           defaultSeverity: 'high' },
];

const SEVERITY_BG = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-blue-100 text-blue-700',
  info:     'bg-slate-100 text-slate-600',
};

const OWASPAnalysis = () => {
  const { showToast } = useToast();

  // --- Inputs ------------------------------------------------------------
  const [code, setCode] = useState(DEFAULT_CODE);
  const [language, setLanguage] = useState('javascript');

  // --- Scan state --------------------------------------------------------
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [owaspFilter, setOwaspFilter] = useState('all'); // all | pass | warning | fail

  // --- AI advisor state --------------------------------------------------
  const [aiTab, setAiTab] = useState('chat'); // chat | fix
  const [aiMessages, setAiMessages] = useState([
    {
      role: 'assistant',
      content: '🛡 I am your AI security advisor. After a scan I can:\n• Explain any finding in plain English\n• Auto-generate a fixed version of the snippet\n• Answer follow-up questions about the OWASP categories\n\nAdd a key in **AI API Keys → AI Provider** to enable me.',
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const abortRef = useRef(null);
  const chatRef = useRef(null);
  const [generatingFix, setGeneratingFix] = useState(false);
  const [fixReply, setFixReply] = useState(null);
  const [fixCode, setFixCode] = useState('');
  const [copiedFix, setCopiedFix] = useState(false);

  // Auto-scroll AI chat
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [aiMessages, aiBusy]);

  // --- code-server integration -----------------------------------------
  //
  // Periodically probe http://127.0.0.1:8080/healthz. The endpoint is
  // exposed by code-server v4 with --auth none; it returns "alive" with a
  // 200. We translate network errors / non-2xx responses into "stopped".
  //
  // The first probe fires immediately on mount, then every 8s while the
  // page is open. The interval is cheap (< 1 KB response) so we don't
  // bother pausing it on tab visibility.
  //
  // State machine:
  //   unknown  → initial value, before the first probe completes
  //   checking → probe in flight
  //   running  → last probe succeeded → green pill
  //   stopped  → last probe failed → gray pill + "start" instructions
  const [codeServerStatus, setCodeServerStatus] = useState('unknown');
  const [codeServerUrl, setCodeServerUrl] = useState(CODE_SERVER_URL);
  const [codeServerExpanded, setCodeServerExpanded] = useState(false);
  const [codeServerIframeLoading, setCodeServerIframeLoading] = useState(false);
  const [codeServerIframeReady, setCodeServerIframeReady] = useState(false);
  const [pushingCode, setPushingCode] = useState(false);
  const codeServerPollRef = useRef(null);

  // The iframe is pointed at the dev server's same-origin proxy rather
  // than at code-server's own port. A cross-origin frame would render
  // fine, but the page could not reach into it — which rules out
  // relaying a guest's mouse and keyboard input into the workbench.
  // See CODE_SERVER_EMBED_PATH in services/codeServer.js.
  const codeServerEmbedUrl = `${CODE_SERVER_EMBED_PATH}/`;

  const probeCodeServer = useCallback(async () => {
    setCodeServerStatus('checking');
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(CODE_SERVER_HEALTHZ, {
        method: 'GET',
        signal: controller.signal,
        // no-cors because we don't need the body — we just want to know
        // whether the port answers.
        mode: 'no-cors',
      });
      clearTimeout(t);
      if (res && (res.ok || res.type === 'opaque')) {
        setCodeServerStatus('running');
        setCodeServerUrl(CODE_SERVER_URL);
      } else {
        setCodeServerStatus('stopped');
      }
    } catch {
      setCodeServerStatus('stopped');
    }
  }, []);

  useEffect(() => {
    void probeCodeServer();
    codeServerPollRef.current = setInterval(() => {
      void probeCodeServer();
    }, 8000);
    return () => {
      if (codeServerPollRef.current) clearInterval(codeServerPollRef.current);
    };
  }, [probeCodeServer]);

  // Open the full code-server UI in a popup window. This is the primary
  // path — code-server uses several browser APIs (IndexedDB, File System
  // Access, service workers) and is most reliable in a top-level window.
  const openCodeServerPopup = useCallback(() => {
    const w = 1280;
    const h = 800;
    const left = Math.max(0, (window.screen.width - w) / 2);
    const top = Math.max(0, (window.screen.height - h) / 2);
    const win = window.open(
      codeServerUrl,
      'project-eric-codeserver',
      `width=${w},height=${h},left=${left},top=${top},noopener=no,noreferrer=yes`,
    );
    if (!win) {
      showToast('Pop-up blocked — embed the iframe below instead.', 'warning');
      setCodeServerExpanded(true);
      return;
    }
    try { win.focus(); } catch { /* noop */ }
    showToast('code-server opened in a new window.', 'success');
  }, [codeServerUrl, showToast]);

  // Embed code-server as an iframe on the page. code-server's built CSP
  // allows being framed (it serves frame-ancestors * by default), so this
  // works reliably without any extra config.
  const toggleIframe = useCallback(() => {
    setCodeServerExpanded((v) => {
      const next = !v;
      if (next) {
        setCodeServerIframeLoading(true);
        setCodeServerIframeReady(false);
      }
      return next;
    });
  }, []);

  // "Push" the current scanned snippet into code-server's workspace.
  //
  // code-server serves a local folder (default C:\Users\Public\project-eric-ide),
  // so we download the snippet as a file the user can drag-drop, or copy it
  // to the clipboard so they can paste it into a freshly-created file inside
  // code-server. We also save it under a stable filename so they can locate it
  // (Downloads/project-eric-scan-<timestamp>.<ext>) and provide a note on
  // moving it into the workspace folder for permanent access.
  const pushCodeToCodeServer = useCallback(async () => {
    if (!code.trim()) return showToast('Nothing to push — paste code first.', 'warning');
    setPushingCode(true);
    try {
      const ext = LANGUAGE_EXT[language] || 'txt';
      const filename = `project-eric-scan-${Date.now()}.${ext}`;
      const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });

      // Copy the code to clipboard so the user can paste it directly
      // into a file inside code-server (faster than dragging).
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        /* clipboard might be blocked — keep going, the download still works */
      }

      // Also offer a download so they can drag-drop into code-server.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      showToast(
        `Code copied to clipboard + downloaded as ${filename}. Paste into code-server or drop the file onto the Explorer panel.`,
        'success',
      );
    } catch (e) {
      showToast(`Failed to push code: ${e?.message || String(e)}`, 'error');
    } finally {
      setPushingCode(false);
    }
  }, [code, language, showToast]);

  const startCodeServerHint = useCallback(() => {
    showToast(
      'Run `npm run ide:start` in the project root, then click ↻ on the status pill.',
      'info',
      8000,
    );
  }, [showToast]);


  // --- Extension pack loader ------------------------------------------
  //
  // Pre-fetch the OWASP pack + manifest on mount so the page can show the
  // user what extension pack version is loaded and which OWASP categories
  // the chosen language supports. The pack itself is a static set of regex
  // patterns + remediation strings — it never runs the user's code.
  const [packInfo, setPackInfo] = useState(null);   // { manifest, owaspPack, language }
  const [usePack, setUsePack] = useState(true);     // toggle pack vs built-in detectors
  const [availableLanguages, setAvailableLanguages] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [manifest, owaspPack, langs] = await Promise.all([
        loadManifest(),
        loadOwaspPack(),
        listLanguages(),
      ]);
      if (cancelled) return;
      setPackInfo({
        manifest,
        owaspPack,
        packName: manifest?.name || 'project-eric-extension-pack',
        packVersion: manifest?.version || '1.1.0',
        owaspVersion: manifest?.owasp?.version || '1.0.0',
      });
      setAvailableLanguages(langs || []);
    })();
    return () => { cancelled = true; };
  }, []);

  // Refetch the active language file when the user switches languages, so
  // the OWASP scanner can use language-specific regexes + remediation hints.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lang = await loadLanguage(language);
      if (cancelled) return;
      setPackInfo((prev) => ({ ...(prev || {}), language: lang }));
    })();
    return () => { cancelled = true; };
  }, [language]);

  // --- Local scanner (real OWASP detector pipeline) -------------------
  //
  // Each of the 10 OWASP categories has its own detector that scans the
  // supplied source code and returns a pass/warning/fail finding. Detectors
  // run sequentially with a tiny per-step delay so the progress bar feels
  // like a real scan instead of an instant snap. The async signature also
  // lets us cancel mid-scan via `scanAbortRef.current = true`.
  //
  // When the user toggles "Use downloaded extension pack" on AND the pack
  // is loaded, we route the scan through `analyseWithPack()` which uses
  // the OWASP pack + per-language rules (regex + remediation strings)
  // shipped under /extensions/. The pack performs static analysis only —
  // it never executes, transpiles or interprets the supplied code.
  const scanAbortRef = useRef(false);
  const runScan = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setProgress(0);
    setResults(null);
    scanAbortRef.current = false;

    const start = performance.now();
    try {
      // Choose the scan engine: extension pack if loaded & toggled on,
      // otherwise fall back to the built-in detectors defined above.
      const canUsePack = usePack && packInfo?.owaspPack;
      const scanner = canUsePack
        ? (cb) => analyseWithPack(code, language, cb)
        : (cb) => runAllDetectors(code, cb);

      const findings = await scanner(({ done, total, latest }) => {
        if (scanAbortRef.current) return;
        setProgress(Math.round((done / total) * 100));
        // Stream the partial results so the list fills in as detectors finish.
        setResults((prev) => {
          const acc = prev?.findings ? [...prev.findings] : [];
          acc.push(latest);
          const tIssues = acc.reduce((a, f) => a + (f.count || 0), 0);
          const score = Math.max(0, Math.min(100, 100 - tIssues * 4));
          const summary = score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk';
          return {
            score,
            summary,
            scanTime: ((performance.now() - start) / 1000).toFixed(1) + 's',
            findings: acc,
            totalIssues: tIssues,
            running: true,
            engine: canUsePack ? 'pack' : 'builtin',
            packVersion: packInfo?.packVersion,
            language,
          };
        });
      });

      if (scanAbortRef.current) {
        setIsRunning(false);
        showToast('Scan cancelled', 'info');
        return;
      }

      // Final aggregation.
      const tIssues = findings.reduce((a, f) => a + (f.count || 0), 0);
      const score = Math.max(0, Math.min(100, 100 - tIssues * 4));
      const summary = score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk';
      setProgress(100);
      setResults({
        score,
        summary,
        scanTime: ((performance.now() - start) / 1000).toFixed(1) + 's',
        findings,
        totalIssues: tIssues,
        running: false,
        engine: canUsePack ? 'pack' : 'builtin',
        packVersion: packInfo?.packVersion,
        language,
      });
      showToast(`OWASP scan complete · score ${score}/100`, 'success');
    } catch (e) {
      showToast(`Scan failed: ${e?.message || String(e)}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const cancelScan = () => {
    scanAbortRef.current = true;
    setIsRunning(false);
  };

  const handleExport = () => {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `owasp-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('OWASP report exported', 'success');
  };

  // --- AI helpers --------------------------------------------------------
  const sendAi = async () => {
    const content = aiInput.trim();
    if (!content) return;
    if (!hasAIKey()) {
      showToast('Add an AI key in AI API Keys → AI Provider first', 'error');
      return;
    }
    const next = [...aiMessages, { role: 'user', content }];
    setAiMessages(next);
    setAiInput('');
    setAiBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reply = await callAI(
        next.filter((m) => m.role !== 'system'),
        {
          signal: controller.signal,
          systemPrompt: 'You are a senior application-security engineer helping the user understand OWASP Top 10 findings on the supplied code snippet. Be concise and specific.',
          temperature: 0.2,
          maxTokens: 1200,
        },
      );
      setAiMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setAiMessages([...next, { role: 'assistant', content: `⚠ ${e.message}` }]);
    } finally {
      setAiBusy(false);
      abortRef.current = null;
    }
  };

  const explainFinding = async (finding) => {
    if (!hasAIKey()) return showToast('Add an AI key in AI API Keys → AI Provider first', 'error');
    setAiTab('chat');
    setAiBusy(true);
    try {
      const reply = await explainIssue({ code, finding });
      setAiMessages((m) => [
        ...m,
        { role: 'user', content: `Explain ${finding.id} ${finding.name}` },
        { role: 'assistant', content: reply },
      ]);
    } catch (e) {
      setAiMessages((m) => [...m, { role: 'assistant', content: `⚠ ${e.message}` }]);
    } finally {
      setAiBusy(false);
    }
  };

  const generateAutoFix = async () => {
    if (!code.trim()) return showToast('Paste some code first', 'error');
    if (!hasAIKey()) return showToast('Add an AI key in AI API Keys → AI Provider first', 'error');
    setGeneratingFix(true);
    setFixReply(null);
    setFixCode('');
    try {
      const reply = await generateFix({
        code,
        language,
        findings: (results?.findings || []).filter((f) => f.status !== 'pass'),
      });
      setFixReply(reply);
      setFixCode(extractCodeBlock(reply));
    } catch (e) {
      setFixReply(`⚠ ${e.message}`);
    } finally {
      setGeneratingFix(false);
    }
  };

  const applyFixToInput = () => {
    if (!fixCode) return;
    setCode(fixCode);
    showToast('Fixed code applied to editor', 'success');
  };

  // --- Derived counts ----------------------------------------------------
  const passCount  = results ? results.findings.filter((f) => f.status === 'pass').length : 0;
  const warnCount  = results ? results.findings.filter((f) => f.status === 'warning').length : 0;
  const failCount  = results ? results.findings.filter((f) => f.status === 'fail').length : 0;
  const totalCount = results ? results.findings.length : 0;

  return (
    <div className="relative min-h-[calc(100vh-56px)] p-6 lg:p-8">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 opacity-[0.04]"
             style={{
               backgroundImage: 'linear-gradient(#0f172a 1px, transparent 1px), linear-gradient(90deg, #0f172a 1px, transparent 1px)',
               backgroundSize: '52px 52px',
             }} />
        <div className="absolute w-[700px] h-[700px] rounded-full opacity-[0.12] animate-orb-1 blur-3xl"
             style={{ background: 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, transparent 70%)', top: '-260px', left: '-180px' }} />
        <div className="absolute w-[480px] h-[480px] rounded-full opacity-[0.10] animate-orb-2 blur-3xl"
             style={{ background: 'radial-gradient(circle, rgba(16, 185, 129, 0.5) 0%, transparent 70%)', bottom: '-160px', right: '-100px' }} />
        <div className="absolute w-[380px] h-[380px] rounded-full opacity-[0.08] animate-orb-3 blur-3xl"
             style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.5) 0%, transparent 70%)', top: '40%', right: '30%' }} />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto">
        <PageTip
          pageId="owasp"
          variant="info"
          title="Run the OWASP Top 10 scan"
          body="Paste a code snippet on the left, pick the language, and click Run OWASP Scan. Expand any row for details, or use the AI advisor on the right to explain a finding or auto-generate a fixed version."
        />

        {/* Header */}
        <div className="glass-strong rounded-2xl p-5 lg:p-6 mb-6 animate-page-enter">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-blue-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">OWASP Top 10 Analysis</h1>
                <p className="text-sm text-slate-500 mt-0.5">Scan code against the 2026 OWASP categories — clear, actionable results.</p>
                {packInfo?.owaspPack && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span
                      title={`Loaded ${packInfo.packName} v${packInfo.packVersion} · OWASP pack v${packInfo.owaspVersion} · static-only`}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      <Package className="w-3 h-3" /> Extension pack v{packInfo.packVersion}
                    </span>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-emerald-600"
                        checked={usePack}
                        onChange={(e) => setUsePack(e.target.checked)}
                      />
                      Use downloaded pack rules
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={isRunning ? cancelScan : runScan}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                  isRunning
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700'
                }`}
              >
                {isRunning ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Scanning… {progress}%
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Run OWASP Scan
                  </>
                )}
              </button>
              {isRunning && (
                <button
                  onClick={cancelScan}
                  className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" /> Stop
                </button>
              )}
              {results && !isRunning && (
                <>
                  <button
                    onClick={() => { setResults(null); setProgress(0); }}
                    className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" /> Reset
                  </button>
                  <button
                    onClick={handleExport}
                    className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    <Download className="w-4 h-4" /> Export
                  </button>
                </>
              )}

              {/* code-server status pill. Compact: shows running/stopped,
                  click to refresh, click the icon when stopped for setup
                  instructions. We deliberately surface this in the header
                  because the OWASP extension inside code-server is the
                  primary "feature before" replacement. */}
              <button
                onClick={() => {
                  if (codeServerStatus === 'stopped' || codeServerStatus === 'unknown') {
                    startCodeServerHint();
                  }
                  void probeCodeServer();
                }}
                title={
                  codeServerStatus === 'running'
                    ? `code-server is live at ${codeServerUrl}`
                    : 'code-server not detected — click for setup steps'
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors ${
                  codeServerStatus === 'running'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : codeServerStatus === 'checking'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                {codeServerStatus === 'running' && 'code-server running'}
                {codeServerStatus === 'stopped' && 'code-server stopped'}
                {codeServerStatus === 'checking' && 'checking…'}
                {codeServerStatus === 'unknown' && 'code-server ?'}
                <RefreshCw
                  className={`w-3 h-3 ${codeServerStatus === 'checking' ? 'animate-spin' : 'opacity-60'}`}
                />
              </button>
            </div>
          </div>

          {isRunning && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Analyzing {results?.findings?.length || 0} / 10 OWASP detectors
                  {results?.findings?.length > 0 && (
                    <>
                      {' · '}running <strong className="text-slate-700">{results.findings[results.findings.length - 1]?.name || '…'}</strong>
                    </>
                  )}
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{progress}%</span>
              </div>
              <div className="h-2 bg-slate-200/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {/* Inline mini-row of detector pass/warn/fail badges as they come in */}
              {results?.findings?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {results.findings.map((f) => (
                    <span
                      key={f.id}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                        f.status === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                        f.status === 'warning' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}
                    >
                      {f.id}
                      {f.status === 'pass' ? '✓' : f.status === 'warning' ? '!' : '✗'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* code-server launcher                                          */}
        {/*                                                               */}
        {/* Replaces the previous textarea-only flow as the recommended  */}
        {/* way to edit + scan code under the OWASP Top 10 (2026) rules. */}
        {/* The bundled project-eric-owasp extension ships the scanner    */}
        {/* into code-server automatically (see scripts/setup-ide.ps1),  */}
        {/* so the same squigglies, status-bar score, dashboard and        */}
        {/* one-click fixes you'd get in desktop VS Code run inside this  */}
        {/* embedded workbench.                                           */}
        {/* ============================================================ */}
        <div className="glass-strong rounded-2xl p-5 lg:p-6 mb-6 animate-page-enter">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 flex items-center justify-center flex-shrink-0 shadow-lg shadow-slate-500/20">
                <Code2 className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Open in code-server
                  </h2>
                  <a
                    href={CODE_SERVER_DOCS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    coder/code-server · MIT
                  </a>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      codeServerStatus === 'running'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : codeServerStatus === 'checking'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        codeServerStatus === 'running'
                          ? 'bg-emerald-500 animate-pulse'
                          : codeServerStatus === 'checking'
                          ? 'bg-amber-500'
                          : 'bg-slate-400'
                      }`}
                    />
                    {codeServerStatus === 'running' && 'live'}
                    {codeServerStatus === 'stopped' && 'stopped'}
                    {codeServerStatus === 'checking' && 'checking…'}
                    {codeServerStatus === 'unknown' && 'unknown'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                  code-server runs VS Code in your browser with the bundled{' '}
                  <strong className="font-semibold text-slate-700 dark:text-slate-200">
                    project-eric-owasp
                  </strong>{' '}
                  extension pre-installed — so squigglies, the status-bar score,
                  and the security dashboard all light up as you type. Use this
                  instead of the textarea below when you want real syntax
                  highlighting, multi-file edits, and the live workbench.
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={openCodeServerPopup}
                disabled={codeServerStatus !== 'running'}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white shadow-md shadow-blue-500/30 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in new window
              </button>
              <button
                onClick={toggleIframe}
                disabled={codeServerStatus !== 'running'}
                data-testid="owasp-embed-workbench"
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  codeServerExpanded
                    ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-600'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/40'
                }`}
              >
                {codeServerExpanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" /> Hide workbench
                  </>
                ) : (
                  <>
                    <Monitor className="w-3.5 h-3.5" /> Embed workbench
                  </>
                )}
              </button>
              <button
                onClick={pushCodeToCodeServer}
                disabled={pushingCode || !code.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Copy + download the current snippet for code-server"
              >
                {pushingCode ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pushing…
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" /> Push code
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  void probeCodeServer();
                }}
                disabled={codeServerStatus === 'checking'}
                title="Re-probe code-server health"
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 disabled:opacity-50 transition-colors"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${codeServerStatus === 'checking' ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* Setup card when code-server isn't running. */}
          {codeServerStatus !== 'running' && (
            <div className="mt-4 p-3.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Start code-server (one-time setup + run)
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
                    The launcher above unlocks once code-server is live. The OWASP
                    extension is bundled — no manual install needed.
                  </p>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <code className="block px-3 py-2 rounded-lg bg-slate-950 text-emerald-300 font-mono text-[11px] border border-slate-800">
                      npm run ide:setup
                    </code>
                    <code className="block px-3 py-2 rounded-lg bg-slate-950 text-emerald-300 font-mono text-[11px] border border-slate-800">
                      npm run ide:start
                    </code>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1.5">
                    <Package className="w-3 h-3" />
                    Bundle + install the OWASP .vsix:
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                      npm run owasp:package
                    </code>
                    <span>then</span>
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                      npm run owasp:cs-install
                    </code>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Embedded iframe. */}
          {codeServerExpanded && codeServerStatus === 'running' && (
            <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-300">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono">{codeServerEmbedUrl}</span>
                <span className="flex-1" />
                {codeServerIframeLoading && (
                  <span className="inline-flex items-center gap-1.5 text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading workbench…
                  </span>
                )}
                {codeServerIframeReady && (
                  <span className="inline-flex items-center gap-1.5 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Ready
                  </span>
                )}
                <button
                  onClick={openCodeServerPopup}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  <Maximize2 className="w-3 h-3" /> Pop out
                </button>
              </div>
              <div className="relative" style={{ height: 'min(70vh, 720px)' }}>
                {!codeServerIframeReady && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950 text-slate-400">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-400 mb-3" />
                    <p className="text-sm font-medium">Starting code-server workbench…</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      VS Code in your browser · project-eric-owasp extension bundled
                    </p>
                  </div>
                )}
                <iframe
                  key={codeServerEmbedUrl}
                  src={codeServerEmbedUrl}
                  title="Project Eric code-server workbench"
                  data-testid="owasp-workbench-frame"
                  onLoad={() => {
                    setCodeServerIframeLoading(false);
                    setCodeServerIframeReady(true);
                  }}
                  onError={() => {
                    setCodeServerIframeLoading(false);
                  }}
                  allow="clipboard-read; clipboard-write; cross-origin-isolated; fullscreen"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
                  className="w-full h-full block bg-slate-950 border-0"
                />
              </div>
            </div>
          )}

          {/* Tail note: what you get vs. don't get inside code-server. */}
          <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2">
            <Eye className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <p className="leading-relaxed">
              The OWASP extension inside code-server adds{' '}
              <strong className="text-slate-700 dark:text-slate-200">live squigglies</strong>, a{' '}
              <strong className="text-slate-700 dark:text-slate-200">status-bar score</strong>, the{' '}
              <strong className="text-slate-700 dark:text-slate-200">Activity Bar → Project Eric Security</strong> panel, and the{' '}
              <strong className="text-slate-700 dark:text-slate-200">Ctrl+Shift+D dashboard</strong>{' '}
              on top of VS Code. The textarea below still works for quick one-off
              scans — they're the same scanner.
            </p>
          </div>
        </div>

        {/* 2-column: input + AI advisor */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* LEFT: input + summary + findings */}
          <div className="lg:col-span-2 space-y-6">
            {/* Input + summary side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Input */}
              <div className="glass-strong rounded-2xl p-5 animate-page-enter">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Code to scan</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-600 dark:text-slate-200 outline-none"
                    >
                      <option value="javascript">JavaScript</option>
                      <option value="typescript">TypeScript</option>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                      <option value="go">Go</option>
                      <option value="php">PHP</option>
                      <option value="csharp">C#</option>
                      <option value="other">Other</option>
                    </select>
                    <button
                      onClick={() => setCode(DEFAULT_CODE)}
                      className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                    >
                      Reset example
                    </button>
                  </div>
                </div>
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck={false}
                  className="w-full h-[260px] p-4 bg-slate-950/95 text-slate-100 font-mono text-xs rounded-xl border border-slate-800 focus:border-emerald-500/60 outline-none resize-none transition-colors"
                />
                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                  Paste a snippet from your project — a route handler, an auth flow, a config block.
                </p>
              </div>

              {/* Summary */}
              <div className="glass-strong rounded-2xl p-5 animate-page-enter">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Scan summary</span>
                </div>
                {results ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-5">
                      <div className="relative">
                        <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
                          <circle cx="60" cy="60" r="50" stroke="#e2e8f0" strokeWidth="10" fill="none" />
                          <circle
                            cx="60" cy="60" r="50"
                            stroke={results.score >= 80 ? '#10b981' : results.score >= 65 ? '#f59e0b' : '#ef4444'}
                            strokeWidth="10" fill="none"
                            strokeDasharray={2 * Math.PI * 50}
                            strokeDashoffset={2 * Math.PI * 50 * (1 - results.score / 100)}
                            strokeLinecap="round"
                            className="transition-all duration-1000"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <div className={`text-3xl font-bold ${
                              results.score >= 80 ? 'text-emerald-600' :
                              results.score >= 65 ? 'text-amber-600' : 'text-red-600'
                            }`}>{results.score}</div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">/ 100</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                          results.summary === 'Low Risk' ? 'bg-emerald-100 text-emerald-700' :
                          results.summary === 'Medium Risk' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          <Shield className="w-3.5 h-3.5" />
                          {results.summary}
                        </div>
                        <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                          Found <strong>{results.totalIssues}</strong> issue{results.totalIssues === 1 ? '' : 's'} across <strong>{totalCount}</strong> OWASP categories in <strong>{results.scanTime}</strong>.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200/70">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-emerald-600">{passCount}</div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Pass</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-amber-600">{warnCount}</div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Warning</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">{failCount}</div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Fail</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-[260px] flex flex-col items-center justify-center text-center text-slate-400">
                    <Shield className="w-16 h-16 mb-3 opacity-40" />
                    <p className="text-sm font-medium text-slate-500">No scan results yet</p>
                    <p className="text-xs mt-1">Paste code on the left and click <strong>Run OWASP Scan</strong>.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Findings list */}
            <div className="glass-strong rounded-2xl p-5 lg:p-6 animate-page-enter">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <FileCode className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">OWASP Top 10 findings</span>
                {results && (
                  <span className="ml-2 text-[11px] text-slate-400 font-mono">
                    {results.findings.length} categories · {results.totalIssues} total issues · {results.scanTime}
                  </span>
                )}
                <div className="flex-1" />
                {/* Filter chips — match the Sandbox language-sweep visuals */}
                {results && results.findings.length > 0 && (() => {
                  const pc = results.findings.filter((f) => f.status === 'pass').length;
                  const wc = results.findings.filter((f) => f.status === 'warning').length;
                  const fc = results.findings.filter((f) => f.status === 'fail').length;
                  const filters = [
                    { id: 'all', label: `All (${results.findings.length})` },
                    { id: 'pass', label: `Pass (${pc})` },
                    { id: 'warning', label: `Warn (${wc})` },
                    { id: 'fail', label: `Fail (${fc})` },
                  ];
                  return (
                    <div className="flex flex-wrap gap-1.5">
                      {filters.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setOwaspFilter(f.id)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                            owaspFilter === f.id
                              ? 'bg-slate-900 dark:bg-blue-600 text-white border-slate-900 dark:border-blue-600'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-3">
                {(() => {
                  const list = results
                    ? results.findings
                    : OWASP_META.map((m) => ({
                        id: m.id,
                        name: m.name,
                        status: 'pass',
                        count: 0,
                        severity: m.defaultSeverity,
                        description: 'Click "Run OWASP Scan" to analyse the supplied code against this category.',
                        cwe: '—',
                        remediation: 'Detector will run after the scan starts.',
                        evidence: [],
                      }));
                  const filtered = owaspFilter === 'all'
                    ? list
                    : list.filter((f) => f.status === owaspFilter);
                  if (filtered.length === 0) {
                    return (
                      <div className="text-center text-slate-400 text-sm py-8">
                        No findings match this filter.
                      </div>
                    );
                  }
                  return filtered.map((finding, i) => {
                    const config = STATUS_CONFIG[finding.status];
                    const Icon = CATEGORY_ICONS[finding.name] || Shield;
                    const isOpen = expanded === finding.id;
                    const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];
                    return (
                      <div
                        key={finding.id}
                        className={`glass-card overflow-hidden transition-all duration-300 ${isOpen ? 'ring-2 ring-blue-200' : ''}`}
                        style={{ animationDelay: `${i * 50}ms` }}
                      >
                        <button
                          onClick={() => setExpanded(isOpen ? null : finding.id)}
                          className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/40 transition-colors"
                        >
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            finding.status === 'pass' ? 'bg-emerald-100 text-emerald-600' :
                            finding.status === 'warning' ? 'bg-amber-100 text-amber-600' :
                            'bg-red-100 text-red-600'
                          }`}>
                            {finding.status === 'pass' ? <CheckCircle className="w-5 h-5" /> :
                             finding.status === 'warning' ? <AlertCircle className="w-5 h-5" /> :
                             <XCircle className="w-5 h-5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-mono text-xs text-slate-400">{finding.id}</span>
                              <span className="font-semibold text-slate-900 dark:text-slate-100">{finding.name}</span>
                              <span className="font-mono text-xs text-slate-400">{finding.cwe}</span>
                              {evidence.length > 0 && (
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  {evidence.length} match{evidence.length === 1 ? '' : 'es'}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 truncate">{finding.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`minimal-badge ${
                              finding.status === 'pass' ? 'badge-success' :
                              finding.status === 'warning' ? 'badge-warning' :
                              'badge-error'
                            }`}>
                              {finding.status === 'pass' ? '✓ Pass' :
                               `${finding.count} issue${finding.count === 1 ? '' : 's'}`}
                            </span>
                            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                              finding.status === 'pass' ? 'bg-emerald-500 text-white' :
                              finding.status === 'warning' ? 'bg-amber-500 text-white' :
                              'bg-red-500 text-white'
                            }`}>
                              {config.label}
                            </span>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="border-t border-slate-200/70 bg-white/40 backdrop-blur p-5 animate-slide-up">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="md:col-span-2">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Description</h4>
                                <p className="text-sm text-slate-700 leading-relaxed">{finding.description}</p>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Severity</h4>
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${SEVERITY_BG[finding.severity] || SEVERITY_BG.info}`}>
                                  {finding.severity.toUpperCase()}
                                </span>
                              </div>
                            </div>

                            {/* Evidence: real matches the detector found in the snippet */}
                            {evidence.length > 0 && (
                              <div className="mt-4">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Evidence ({evidence.length})</h4>
                                <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                                  <div className="max-h-48 overflow-auto divide-y divide-slate-800">
                                    {evidence.map((ev, idx) => (
                                      <div key={idx} className="flex items-start gap-3 px-3 py-2 text-[11px] font-mono">
                                        <span className="text-slate-500 select-none whitespace-nowrap">
                                          {ev.line ? `L${ev.line}` : '—'}
                                        </span>
                                        <span className="text-slate-200 break-all whitespace-pre-wrap">{ev.snippet}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="mt-4">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Remediation</h4>
                              <div className="bg-white/70 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-700/70 rounded-xl p-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                {finding.remediation}
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                onClick={() => explainFinding(finding)}
                                disabled={!results || finding.status === 'pass'}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Bot className="w-3.5 h-3.5" /> Ask AI to explain
                              </button>
                              <button
                                onClick={() => { setAiTab('fix'); }}
                                disabled={!results}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Wand2 className="w-3.5 h-3.5" /> Auto-fix the code
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* RIGHT: AI advisor (chat + auto-fix) */}
          <div className="lg:col-span-1">
            <div className="glass-strong rounded-2xl flex flex-col overflow-hidden h-[760px] sticky top-4">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI Security Advisor</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {hasAIKey() ? `${getAIConfig().provider} · ${getAIConfig().model}` : 'Not configured'}
                  </div>
                </div>
                {!hasAIKey() && (
                  <a
                    href="/api-keys"
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-100 text-amber-800 inline-flex items-center gap-1 hover:bg-amber-200"
                  >
                    <KeyRound className="w-3 h-3" /> Add key
                  </a>
                )}
              </div>

              <div className="flex gap-1 px-2 py-2 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40">
                {[
                  { id: 'chat', label: 'Chat', icon: Bot },
                  { id: 'fix',  label: 'Auto-fix', icon: Wand2 },
                ].map((t) => {
                  const Icon = t.icon;
                  const active = aiTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setAiTab(t.id)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        active ? 'bg-slate-900 dark:bg-blue-600 text-white' : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" /> {t.label}
                    </button>
                  );
                })}
              </div>

              {aiTab === 'chat' && (
                <>
                  <div ref={chatRef} className="flex-1 overflow-auto p-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
                    {aiMessages.map((m, i) => (
                      <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
                        {m.role === 'assistant' && (
                          <div className="w-7 h-7 flex-shrink-0 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white">
                            <Bot className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div
                          className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-slate-900 dark:bg-blue-600 text-white rounded-br-sm'
                              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-sm'
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {aiBusy && (
                      <div className="flex gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white">
                          <Bot className="w-3.5 h-3.5" />
                        </div>
                        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-500 dark:text-slate-400 inline-flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
                          <button onClick={() => abortRef.current?.abort()} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 ml-1">Stop</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <form
                    onSubmit={(e) => { e.preventDefault(); sendAi(); }}
                    className="p-2.5 border-t border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 backdrop-blur"
                  >
                    <div className="flex items-end gap-2">
                      <textarea
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendAi();
                          }
                        }}
                        rows={1}
                        placeholder={hasAIKey() ? 'Ask about a finding or request a deeper analysis…' : 'Add an AI key in AI API Keys → AI Provider'}
                        className="flex-1 resize-none px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none max-h-32"
                      />
                      <button
                        type="submit"
                        disabled={aiBusy || !aiInput.trim()}
                        className="p-2.5 rounded-xl bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50"
                        title="Send"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                </>
              )}

              {aiTab === 'fix' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40">
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Click <strong>Generate fix</strong> to send your snippet and the failing findings to the
                      AI. The model returns a corrected version that you can copy or apply back to the editor.
                    </p>
                    <button
                      onClick={generateAutoFix}
                      disabled={generatingFix || !hasAIKey()}
                      className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50"
                    >
                      {generatingFix ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      Generate fix
                    </button>
                  </div>

                  <div className="flex-1 overflow-auto bg-slate-950 text-slate-100 font-mono text-xs">
                    {!fixReply && !generatingFix && (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                        <Sparkles className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm">No fix generated yet.</p>
                      </div>
                    )}
                    {generatingFix && (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin mb-2" />
                        Asking the model…
                      </div>
                    )}
                    {fixReply && (
                      <div className="p-4 space-y-3">
                        <div className="text-slate-300 text-[12px] leading-relaxed whitespace-pre-wrap">{fixReply.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '').trim()}</div>
                        {fixCode && (
                          <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 overflow-auto whitespace-pre">
                            {fixCode}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>

                  {fixCode && (
                    <div className="p-3 border-t border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur flex gap-2">
                      <button
                        onClick={applyFixToInput}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600"
                      >
                        <Check className="w-4 h-4" /> Apply to editor
                      </button>
                      <button
                        onClick={() => { navigator.clipboard.writeText(fixCode); setCopiedFix(true); setTimeout(() => setCopiedFix(false), 1500); }}
                        className="px-3 py-2 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 inline-flex items-center gap-1.5"
                      >
                        {copiedFix ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        Copy
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold text-slate-900 dark:text-slate-100">OWASP 2026</span>
            </div>
            <p className="text-sm text-slate-600">All ten categories from the latest OWASP Top 10 list, scored against your snippet.</p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4 text-blue-500" />
              <span className="font-semibold text-slate-900 dark:text-slate-100">Actionable remediation</span>
            </div>
            <p className="text-sm text-slate-600">Every finding links to a concrete fix. Ask the AI advisor to dive deeper or auto-generate a corrected version.</p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Download className="w-4 h-4 text-violet-500" />
              <span className="font-semibold text-slate-900 dark:text-slate-100">Exportable reports</span>
            </div>
            <p className="text-sm text-slate-600">One-click JSON export for sharing with your team or CI pipeline.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OWASPAnalysis;
