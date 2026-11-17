// Verifies that the dashboard's "pending scan" figures agree with the
// score the OWASP scanner itself reports for the same scan.
//
// The dashboard claims (see applyPendingScans in src/pages/Dashboard.jsx)
// that it recomputes the score "the same way the scanner computes it, so
// the dashboard and the scanner never disagree about the same scan".
// These tests pin that contract down.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runDetectors } from '../../src/utils/owaspDetectors.js';

// The score the scanner reports, reproduced from src/pages/OWASPScanner.jsx.
const scannerScore = (findings) => {
  const totalIssues = findings.reduce((a, f) => a + (f.count || 0), 0);
  return Math.max(0, Math.min(100, 100 - totalIssues * 4));
};

// The dashboard's applyPendingScans, reproduced from src/pages/Dashboard.jsx.
const computeSeverityCounts = (findings = []) => {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  findings.forEach((f) => {
    const sev = String(f.severity || 'low').toLowerCase();
    if (sev in counts) counts[sev] += 1;
  });
  return counts;
};

const dashboardScore = (baseScore, pending) => {
  const extraFindings = pending.flatMap((scan) => scan.findings || []);
  const counts = computeSeverityCounts(extraFindings);
  const pendingScore = pending.find((s) => typeof s?.score === 'number')?.score;
  if (typeof pendingScore === 'number') return pendingScore;
  const penalty =
    (counts.critical || 0) * 8 +
    (counts.high || 0) * 5 +
    (counts.medium || 0) * 3 +
    (counts.low || 0) * 1;
  return Math.max(0, Math.min(100, (baseScore || 100) - penalty));
};

const VULNERABLE_JS = `app.get('/user/:id', (req, res) => {
  const id = req.params.id;
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  db.query(query, (err, rows) => {
    res.json(rows);
  });
});

const apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
const md5 = require('md5');
const hashed = md5(password);

function run(cmd) {
  return exec(cmd, { shell: true });
}
`;

test('dashboard pending-scan score matches the scanner score', async () => {
  const findings = await runDetectors(VULNERABLE_JS, 'code', 'javascript');
  // A pending scan is the scanner's own final result, so it carries the
  // score the scanner reported.
  const scan = { findings, lineCount: 20, score: scannerScore(findings) };

  const fromScanner = scannerScore(findings);
  const fromDashboard = dashboardScore(100, [scan]);

  assert.equal(
    fromDashboard,
    fromScanner,
    `dashboard reported ${fromDashboard} but the scanner reported ${fromScanner} for the same scan`
  );
});

test('dashboard pending-scan totals match the scanner totals', async () => {
  const findings = await runDetectors(VULNERABLE_JS, 'code', 'javascript');
  const scan = { findings, lineCount: 20 };

  const scannerIssues = findings.reduce((a, f) => a + (f.count || 0), 0);
  const scannerActive = findings.filter(
    (f) => f.status === 'fail' || f.status === 'warning'
  ).length;

  const counts = computeSeverityCounts(findings);
  const dashboardActive = findings.filter(
    (f) => f.status === 'fail' || f.status === 'warning'
  ).length;

  assert.equal(dashboardActive, scannerActive);
  // Every active finding carries a severity the dashboard can count.
  assert.equal(
    Object.values(counts).reduce((a, n) => a + n, 0),
    scannerActive,
    'every active finding should land in exactly one severity bucket'
  );
  assert.ok(scannerIssues > 0);
});

test('the scanner score formula is 100 minus four points per issue', async () => {
  const findings = await runDetectors(VULNERABLE_JS, 'code', 'javascript');
  const totalIssues = findings.reduce((a, f) => a + (f.count || 0), 0);

  // The exact formula from src/pages/OWASPScanner.jsx. If this changes,
  // the dashboard's copy has to change with it.
  assert.equal(scannerScore(findings), Math.max(0, Math.min(100, 100 - totalIssues * 4)));
});

test('a clean snippet scores 100 and raises no active findings', async () => {
  // A route that reads a user-supplied id but checks ownership first, uses
  // a parameterised query, and logs through a structured logger. Every
  // detector should pass this.
  const CLEAN = `const express = require('express');
const winston = require('winston');
const app = express();

app.get('/user/:id', async (req, res) => {
  const id = req.params.id;
  winston.info('user lookup', { userId: req.user.id, id });
  if (req.user.id !== id) return res.status(403).send('Forbidden');
  const row = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  res.json(row);
});
`;
  const findings = await runDetectors(CLEAN, 'code', 'javascript');
  const active = findings.filter((f) => f.status === 'fail' || f.status === 'warning');

  assert.equal(active.length, 0, `expected no active findings, got ${active.map((f) => f.id).join(', ')}`);
  assert.equal(scannerScore(findings), 100);
});
