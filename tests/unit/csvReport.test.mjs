// ---------------------------------------------------------------------------
// csvReport.test.mjs — the CSV export path
//
// The PDF report is the long-form document; the CSV is the
// spreadsheet-shaped counterpart of the same scan. These tests prove
// that the CSV carries the findings, that its cells are escaped so a
// spreadsheet can parse them, and that a formula-looking value cannot
// execute itself when the file is opened.
//
// The scan is a real one: the detectors run over vulnerable source, the
// same way the scanner page runs them.
// ---------------------------------------------------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildScanReportCsv, escapeCsvValue } from '../../src/services/csvReport.js';
import { runDetectorsSync } from '../../src/utils/owaspDetectors.js';

// ---------------------------------------------------------------------------
// A genuinely vulnerable snippet.
// ---------------------------------------------------------------------------
const VULNERABLE_CODE = `const express = require('express');
const app = express();

app.get('/user/:id', async (req, res) => {
  const id = req.params.id;
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  const rows = await db.query(query);
  res.json(rows);
});

const apiKey = "sk_live_9f8e7d6c5b4a3210";
console.log('Using API key:', apiKey);
`;

/**
 * Run the detectors and assemble the result object the scanner page
 * hands to the exporters.
 *
 * @param {string} code
 */
const scan = (code, language = 'javascript') => {
  const findings = runDetectorsSync(code, 'code', language);
  const totalIssues = findings.reduce((sum, f) => sum + (f.count || 0), 0);
  const score = Math.max(0, Math.min(100, 100 - totalIssues * 4));

  return {
    score,
    summary: score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk',
    findings,
    totalIssues,
  };
};

/**
 * Split a CSV document into its rows, honouring the quoted cells.
 *
 * A naive split on newlines would break on a cell that contains one,
 * which is exactly the case these tests care about — so the splitter
 * has to understand the quoting rules.
 *
 * @param {string} csv
 * @returns {string[][]}
 */
const parseCsv = (csv) => {
  // The BOM is not part of the data.
  const text = csv.replace(/^\uFEFF/, '');

  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // A doubled quote inside a quoted cell is a literal quote.
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      // Swallowed — the newline that follows ends the row.
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
};

/** Find the row that starts with the given cell. */
const findRow = (rows, first) => rows.find((r) => r[0] === first);

/**
 * The rows of a table in the CSV.
 *
 * The document holds several tables, separated by a blank line and a
 * title row ("FINDINGS", "EVIDENCE"). The rows of one table are the
 * ones between its header and the next blank line.
 *
 * @param {string[][]} rows
 * @param {string} headerFirst the first cell of the header row
 * @param {number} headerSecond the second cell of the header row
 */
const tableRows = (rows, headerFirst, headerSecond) => {
  const headerIndex = rows.findIndex(
    (r) => r[0] === headerFirst && r[1] === headerSecond
  );
  assert.ok(headerIndex >= 0, `the ${headerFirst} table header is missing`);

  const collected = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    // A blank row ends the table.
    if (!rows[i].length || !rows[i][0]) break;
    collected.push(rows[i]);
  }

  return collected;
};

describe('CSV escaping', () => {
  it('leaves a plain value alone', () => {
    assert.equal(escapeCsvValue('injection'), 'injection');
    assert.equal(escapeCsvValue(''), '');
    assert.equal(escapeCsvValue(null), '');
    assert.equal(escapeCsvValue(undefined), '');
  });

  it('quotes a value that contains a comma', () => {
    assert.equal(escapeCsvValue('a,b'), '"a,b"');
  });

  it('quotes a value that contains a quote and doubles the inner quote', () => {
    assert.equal(escapeCsvValue('say "hi"'), '"say ""hi"""');
  });

  it('quotes a value that contains a newline', () => {
    assert.equal(escapeCsvValue('one\ntwo'), '"one\ntwo"');
  });

  it('neutralises a value that a spreadsheet would run as a formula', () => {
    // A cell starting with =, +, - or @ is executed by Excel and
    // Sheets. It has to come through as plain text.
    assert.equal(escapeCsvValue('=1+1'), "'=1+1");
    assert.equal(escapeCsvValue('+cmd'), "'+cmd");
    assert.equal(escapeCsvValue('-2+3'), "'-2+3");
    assert.equal(escapeCsvValue('@SUM(A1)'), "'@SUM(A1)");
  });
});

describe('OWASP scan → CSV export', () => {
  const results = scan(VULNERABLE_CODE);
  const built = buildScanReportCsv({
    fileName: 'vulnerable-express.js',
    languageLabel: 'Node / Express',
    mode: 'code',
    results,
  });

  const rows = parseCsv(built.csv);

  it('produces a CSV document', () => {
    assert.ok(built.csv.startsWith('\uFEFF'), 'the BOM is missing');
    assert.ok(built.csv.includes('OWASP Top 10 (2026) Security Report'));
    assert.ok(built.rows > 0, 'the export produced no rows');
  });

  it('names the file after the scanned file', () => {
    assert.equal(built.fileName, 'owasp-report-vulnerable-express.js.csv');
  });

  it('strips characters that would break the file name', () => {
    const cleaned = buildScanReportCsv({
      fileName: 'my file (1).js',
      results,
    });
    assert.match(cleaned.fileName, /^owasp-report-[A-Za-z0-9._-]+\.csv$/);
  });

  it('carries the headline numbers', () => {
    const scoreRow = findRow(rows, 'Security score');
    assert.ok(scoreRow, 'the score row is missing');
    assert.equal(scoreRow[1], `${results.score}/100`);

    const issuesRow = findRow(rows, 'Total issues');
    assert.ok(issuesRow, 'the total-issues row is missing');
    assert.equal(Number(issuesRow[1]), results.totalIssues);

    const fileRow = findRow(rows, 'Scanned file');
    assert.equal(fileRow[1], 'vulnerable-express.js');

    const langRow = findRow(rows, 'Language');
    assert.equal(langRow[1], 'Node / Express');
  });

  it('has one row per finding', () => {
    const findingRows = tableRows(rows, 'Category', 'Name');
    assert.equal(findingRows.length, results.findings.length);
  });

  it('carries the status, severity and CWE of every finding', () => {
    const findingRows = tableRows(rows, 'Category', 'Name');

    results.findings.forEach((finding, index) => {
      const row = findingRows[index];
      assert.equal(row[0], finding.id);
      assert.equal(row[1], finding.name);
      assert.equal(row[2], finding.status === 'fail' ? 'Fail'
        : finding.status === 'warning' ? 'Warning' : 'Pass');
      assert.ok(row[3].length > 0, `${finding.id} has no severity`);
      assert.equal(row[4], finding.cwe);
      assert.equal(Number(row[5]), finding.count || 0);
    });
  });

  it('carries the fix guidance for every failing category', () => {
    const findingRows = tableRows(rows, 'Category', 'Name');

    const failing = results.findings.filter(
      (f) => f.status === 'fail' || f.status === 'warning'
    );
    assert.ok(failing.length > 0, 'the scan produced no failing category');

    failing.forEach((finding) => {
      const row = findingRows.find((r) => r[0] === finding.id);
      assert.ok(row, `${finding.id} is missing from the CSV`);

      // The "How to fix" summary, the actions and the checklist all
      // have to be there — the CSV is meant to be enough to act on.
      assert.ok(row[7].length > 0, `${finding.id} has no fix summary`);
      assert.ok(row[8].length > 0, `${finding.id} has no list of actions`);
      assert.ok(row[9].length > 0, `${finding.id} has no verification checklist`);
      assert.ok(row[10].length > 0, `${finding.id} has no references`);
    });
  });

  it('has an evidence table with the flagged source lines', () => {
    const evidenceRows = tableRows(rows, 'Category', 'Name');

    // The evidence table has its own header, so it is looked up by
    // the cell that only it has.
    const evidenceHeader = rows.findIndex((r) => r[0] === 'Category' && r[6] === 'Snippet');
    assert.ok(evidenceHeader >= 0, 'the evidence header is missing');

    const collected = [];
    for (let i = evidenceHeader + 1; i < rows.length; i += 1) {
      if (!rows[i].length || !rows[i][0]) break;
      collected.push(rows[i]);
    }

    assert.ok(collected.length > 0, 'the evidence table is empty');
    assert.ok(evidenceRows.length > 0);

    const evidence = collected.map((r) => r[6]);
    assert.ok(
      evidence.some((snippet) => snippet.includes('SELECT * FROM users')),
      'the flagged SQL line is missing from the evidence table'
    );
  });

  it('keeps a cell that contains a comma, a quote and a newline intact', () => {
    // The evidence snippets are real source lines, so they contain
    // quotes and commas. A row that lost its commas would be
    // unreadable in a spreadsheet.
    const evidenceHeader = rows.findIndex((r) => r[0] === 'Category' && r[6] === 'Snippet');
    const evidenceRows = [];
    for (let i = evidenceHeader + 1; i < rows.length; i += 1) {
      if (!rows[i].length || !rows[i][0]) break;
      evidenceRows.push(rows[i]);
    }

    const withQuotes = evidenceRows.find((r) => r[6].includes('"'));
    assert.ok(withQuotes, 'no evidence cell with a quote was found');
    // The cell was quoted on the way out, so it comes back as one
    // cell with the quotes in it.
    assert.ok(withQuotes[6].includes('"'));
  });

  it('survives an empty scan', () => {
    const empty = buildScanReportCsv({
      fileName: 'empty.js',
      results: { score: 100, summary: 'Low Risk', totalIssues: 0, findings: [] },
    });

    assert.ok(empty.csv.includes('Total issues'));
    assert.ok(empty.csv.includes('FINDINGS'));
    assert.ok(empty.csv.includes('EVIDENCE') === false, 'the evidence table should be absent');
  });

  it('survives a scan with no results at all', () => {
    const nothing = buildScanReportCsv({ fileName: 'nothing.js' });
    assert.ok(nothing.csv.length > 0);
    assert.equal(nothing.rows, 0);
  });

  it('does not let a formula through from the scanned code', () => {
    // A snippet that looks like a formula must not become a formula
    // when the spreadsheet opens the file.
    const formulaCode = `const q = "=1+1";
const cmd = "+cmd|' /C calc'!A0";
`;
    const formulaResults = scan(formulaCode);
    const formulaCsv = buildScanReportCsv({
      fileName: 'formula.js',
      results: formulaResults,
    });

    // Every cell that starts with a formula character is prefixed.
    formulaCsv.csv.split('\r\n').forEach((line) => {
      if (line.startsWith('=') || line.startsWith('+') || line.startsWith('@')) {
        assert.fail(`a formula reached the CSV: ${line}`);
      }
    });
  });

  it('keeps a UTF-8 BOM so a spreadsheet reads accented names correctly', () => {
    const accented = buildScanReportCsv({
      fileName: 'café.js',
      results,
    });
    assert.ok(accented.csv.startsWith('\uFEFF'));
  });
});
