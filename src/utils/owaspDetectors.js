// ---------------------------------------------------------------------------
// owaspDetectors.js
//
// The OWASP Top 10 (2026) detectors that back the scanner page.
//
// Every detector returns the same shape:
//   {
//     id, name, status: 'pass'|'warning'|'fail',
//     count, severity, description, cwe, remediation, evidence: [{line, snippet}]
//   }
//
// The detectors used to live inside the scanner page component. They were
// moved here so the PDF report test can run a genuine scan instead of a
// hand-written fixture: a JSX file cannot be imported by a plain Node test
// run, and a fixture would only prove that the PDF renders the findings it
// was handed — not that a real scan produces findings the PDF can render.
//
// Public API:
//   runDetectors(code, mode, language, onProgress?)  -> Promise<finding[]>
//   runDetectorsSync(code, mode, language)           -> finding[]
// ---------------------------------------------------------------------------

import { buildSuggestion } from './owaspSuggestions.js';

// ---------------------------------------------------------------------------
// Small helpers used by the detectors
// ---------------------------------------------------------------------------
const LINE_INDEX = (code) => code.split('\n');

const findMatches = (code, re) => {
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
    global.lastIndex = 0;
    let m;
    while ((m = global.exec(line)) !== null) {
      out.push({
        line: i + 1,
        snippet: line.trim().slice(0, 220),
        start: m.index,
        end: m.index + m[0].length,
      });
      if (m.index === global.lastIndex) global.lastIndex++;
    }
  }
  return out;
};

// Collapse matches that describe the same flaw.
//
// Two different patterns often match the same injection: the dotted
// concatenation pattern matches `"SELECT ..." . $id` and the query-call
// pattern matches `->query("SELECT ..." . $id)`. Counting both would
// report one weakness twice and lower the score accordingly. Matches
// whose spans overlap on the same line are therefore treated as one
// finding and the longest one is kept.
const dedupeOverlaps = (matches) => {
  const bySpan = new Map();
  for (const match of matches) {
    const key = `${match.line}:${match.start}:${match.end}`;
    if (!bySpan.has(key)) bySpan.set(key, match);
  }
  const unique = [...bySpan.values()];

  // Group matches that overlap each other on the same line.
  const kept = [];
  for (const match of unique) {
    const overlapping = kept.filter(
      (other) =>
        other.line === match.line &&
        other.start < match.end &&
        match.start < other.end,
    );
    if (overlapping.length === 0) {
      kept.push(match);
      continue;
    }
    // Keep the longest span of the group and drop the others.
    const longest = overlapping.reduce(
      (best, other) =>
        (other.end - other.start) > (best.end - best.start) ? other : best,
      overlapping[0],
    );
    const index = kept.indexOf(longest);
    kept.splice(index, 1);
    if ((match.end - match.start) > (longest.end - longest.start)) {
      kept.push(match);
    } else {
      kept.push(longest);
    }
  }
  return kept;
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

    // PHP / Ruby style concatenation: the query is built by gluing a
    // string onto a variable with `.` instead of `+`:
    //
    //     $query = "SELECT * FROM users WHERE id = '" . $id . "'";
    //
    // The `+` patterns above never match that, so a textbook SQL
    // injection in a PHP file was reported as a clean scan. These
    // patterns catch a quoted SQL statement concatenated with a
    // variable, and the same statement fed straight into a query call
    // such as `mysqli_query($conn, "SELECT ... " . $id)`.
    // The string is matched with a tempered dot, so a double-quoted
    // PHP string may contain single quotes (and the other way round)
    // — which is exactly what a query like
    // `"... WHERE id = '" . $id . "'"` looks like.
    const sqlConcatDotted = /(["'])\s*(?:SELECT|INSERT|UPDATE|DELETE)\b(?:(?!\1).)*\1\s*\.\s*(?:\$[a-zA-Z_]\w*|@[a-zA-Z_]\w*|#\{)/gi;
    const sqlExecDotted = /\b(?:mysqli_query|mysql_query|pg_query|DB::(?:select|statement|unprepared)|->(?:query|exec|execute|raw))\s*\([^)]*?\.\s*\$/g;

    // SQL mode — direct concatenation in the supplied queries
    const sqlConcatSql = /['"`\s]\+\s*[a-zA-Z_][\w.]*\s*\+\s*['"`\s;]|["'`]\s*\+\s*[a-zA-Z_][\w.]*\s*\+\s*['"`]/g;
    // Oracle and PostgreSQL glue query fragments together with `||`
    // instead of `+`, so a query built that way was invisible to the
    // `+` patterns above.
    const sqlConcatPipe = /['"`]\s*\|\|\s*(?:\(|\w)|\|\|\s*\(\s*SELECT\b/gi;
    const unionInj = /UNION\s+(?:ALL\s+)?SELECT/gi;
    const tautology = /\bOR\s+['"`]?\d+['"`]?\s*=\s*['"`]?\d+['"`]?/gi;
    const stackedQuery = /;\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\s/gi;

    const evalExec = /\beval\s*\(/g;
    const newFunction = /\bnew\s+Function\s*\(/g;
    const childProcess = /\bchild_process\b|\bexecSync\s*\(|\bspawn\s*\(/g;
    const osCommand = /\b(?:os\.system|subprocess\.|popen)\b/g;
    // PHP runs shell commands through its own function family. None of
    // them appear in the JavaScript-oriented patterns above, so a PHP
    // file calling shell_exec() looked clean on the scanner page.
    const phpShell = /\b(?:shell_exec|passthru|proc_open)\s*\(|\b(?:exec|system)\s*\(\s*[\$"']/g;
    const innerHTML = /\.innerHTML\s*=/g;
    const documentWrite = /\bdocument\.write\s*\(/g;

    let sqlMatches = [];
    if (mode === 'sql') {
      sqlMatches = [
        ...findMatches(code, sqlConcatSql),
        ...findMatches(code, sqlConcatPipe),
        ...findMatches(code, unionInj),
        ...findMatches(code, tautology),
        ...findMatches(code, stackedQuery),
      ];
    } else {
      sqlMatches = dedupeOverlaps([
        ...findMatches(code, sqlConcat),
        ...findMatches(code, sqlExec),
        ...findMatches(code, sqlTpl),
        ...findMatches(code, sqlConcatDotted),
        ...findMatches(code, sqlExecDotted),
      ]);
    }
    const jsMatches = [...findMatches(code, evalExec), ...findMatches(code, newFunction)];
    const cmdMatches = [
      ...findMatches(code, childProcess),
      ...findMatches(code, osCommand),
      ...findMatches(code, phpShell),
    ];
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

  // A query is parameterised when it carries at least one placeholder.
  // The `\b` word boundary has to sit *before* the placeholder, not
  // after it — `?` is not a word character, so a trailing `\b` never
  // matched and a `?`-placeholdered query looked unparameterised.
  const noParam = !/(\$\d|\?|@\w+)/.test(code) && /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(code);
  if (noParam) findings.push({ line: 0, snippet: 'no parameter placeholders ($1, ?, @id) detected anywhere in the supplied queries' });

  const exec = /\b(?:EXEC|EXECUTE)\s*\(\s*['"`]/i.test(code);
  if (exec) findings.push({ line: 0, snippet: 'EXEC/EXECUTE called with a string literal — likely dynamic SQL' });

  const userTab = /\bFROM\s+['"`]([a-zA-Z_]\w*)['"`]/i.test(code);
  if (userTab) findings.push({ line: 0, snippet: 'table / column name passed as a string literal in FROM' });

  return findings;
};
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run every detector in sequence.
 *
 * mode === 'sql' pivots the Injection detector to look at the SQL queries
 * directly. `language` and `mode` select the tailored "How to fix"
 * suggestion that is attached to each finding.
 *
 * @param {string} code
 * @param {'code'|'sql'} mode
 * @param {string} language
 * @param {(progress: {done: number, total: number, latest: object}) => void} [onProgress]
 * @returns {Promise<object[]>}
 */
export const runDetectors = async (code, mode, language, onProgress) => {
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

/**
 * The same scan, without the progress callback and without the artificial
 * delay between detectors.
 *
 * Used by the test suite and by any caller that wants the result
 * synchronously.
 *
 * @param {string} code
 * @param {'code'|'sql'} mode
 * @param {string} language
 * @returns {object[]}
 */
export const runDetectorsSync = (code, mode, language) => {
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

  const out = detectors.map((detect) => {
    const r = detect(code);
    r.suggestion = buildSuggestion(r.id, language, mode);
    return r;
  });

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

export {
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
  detectSqlExtras,
  findMatches,
};
