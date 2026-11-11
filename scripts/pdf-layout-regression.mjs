// Regenerates a PDF report with the same content as the captured
// report (a PHP file with an A02 and an A03 finding), so the layout
// can be checked after a change.

import fs from 'fs';
import path from 'path';
import { buildScanReportPdf } from '../src/services/pdfReport.js';
import { buildSuggestion } from '../src/utils/owaspSuggestions.js';

const code = `<?php
// Orders endpoint
session_start();
require_once 'config.php';

$order_id = $_GET['order_id'];

if (!isset($_GET['debug'])) {
    header('Content-Type: text/html');
}

$conn = mysqli_connect($host, $user, $pass, $db);

$query = "SELECT * FROM orders WHERE id = '" . $order_id . "'";
$result = mysqli_query($conn, $query);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    echo "<h1>Order " . $_GET['order_id'] . "</h1>";
    while ($row = mysqli_fetch_assoc($result)) {
        echo "<p>Total: $" . $row['total'] . "</p>";
    }
}

// Weak hashing for the order confirmation token (A02: Cryptographic Failures)
$token = md5($order_id . $db_pass);
echo "<p>Confirmation token: " . $token . "</p>";

// Debug output leaks internal state (A01: Broken Access Control / info leak)
if (isset($_GET['debug'])) {
    phpinfo();
}
`;

const findings = [
  {
    id: 'A02',
    name: 'Cryptographic Failures',
    status: 'fail',
    count: 2,
    severity: 'critical',
    cwe: 'CWE-798',
    description: 'Found: 1 use of a weak hash (md5/sha1), 1 hardcoded credential.',
    remediation: 'Use bcrypt/argon2 for passwords, sha-256+ for general hashing, HTTPS-only URLs, crypto.randomBytes for tokens, and load secrets from a managed store (env, KMS, vault).',
    evidence: [
      { line: 29, snippet: '$token = md5($order_id . $db_pass);' },
      { line: 30, snippet: 'echo "<p>Confirmation token: " . $token . "</p>";' },
    ],
    suggestion: buildSuggestion('A02', 'php'),
  },
  {
    id: 'A03',
    name: 'Injection',
    status: 'fail',
    count: 1,
    severity: 'critical',
    cwe: 'CWE-89',
    description: 'Found: 1 SQL injection risk.',
    remediation: 'Use parameterised queries, never concatenate user input into SQL. Avoid eval / new Function. Sanitise HTML or use safe DOM APIs (textContent) instead of innerHTML.',
    evidence: [
      { line: 16, snippet: '$query = "SELECT * FROM orders WHERE id = \'" . $order_id . "\'";' },
    ],
    suggestion: buildSuggestion('A03', 'php'),
  },
];

const passing = [
  ['A01', 'Broken Access Control', 'CWE-639', 'No insecure direct-object-reference patterns detected in the supplied code.'],
  ['A04', 'Insecure Design', 'CWE-307', 'No obvious insecure-design patterns detected.'],
  ['A05', 'Security Misconfiguration', 'CWE-16', 'No CORS-*, default-credential or debug-flag patterns detected.'],
  ['A06', 'Vulnerable Components', 'CWE-1104', 'No outdated / known-vulnerable dependencies flagged in the supplied snippet.'],
  ['A07', 'Authentication Failures', 'CWE-521', 'No obvious authentication red flags detected.'],
  ['A08', 'Data Integrity Failures', 'CWE-345', 'No unsafe deserialization or unsigned-JWT patterns detected.'],
  ['A09', 'Logging Failures', 'CWE-778', 'Sensitive routes appear to be covered by a real logger.'],
  ['A10', 'SSRF', 'CWE-918', 'No dynamic outbound HTTP from user input detected.'],
];

findings.push(
  ...passing.map(([id, name, cwe, description]) => ({
    id,
    name,
    status: 'pass',
    count: 0,
    severity: 'info',
    cwe,
    description,
    remediation: '',
    evidence: [],
    suggestion: { summary: '', changes: [], checklist: [], refs: [] },
  }))
);

const out = buildScanReportPdf({
  fileName: 'test-upload-orders.php',
  languageLabel: 'PHP',
  mode: 'code',
  code,
  results: {
    score: 88,
    summary: 'Low Risk',
    totalIssues: 3,
    findings,
  },
  ttlHours: 24,
});

const target = path.resolve('logs/pdf-layout-check.pdf');
fs.mkdirSync(path.dirname(target), { recursive: true });
const buf = Buffer.from(await out.blob.arrayBuffer());
fs.writeFileSync(target, buf);

console.log('pages:', out.pageCount);
console.log('bytes:', out.sizeBytes);
console.log('written:', target);
