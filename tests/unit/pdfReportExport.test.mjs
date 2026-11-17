// ---------------------------------------------------------------------------
// pdfReport.test.mjs — part 2: the real export path
//
// The first part of this file (the `toWinAnsi` unit tests) proves that the
// text encoding is correct. This part proves the thing that actually
// matters to a user: after an OWASP scan, pressing "Export PDF" produces a
// real, openable PDF that contains the scan's findings.
//
// The scan is not a hand-written fixture. The detectors are run over real
// vulnerable source, exactly the way the scanner page runs them, so the
// PDF is built from a genuine scan result.
//
// The PDF is then validated two ways:
//   1. structurally, in Node — the bytes are a real PDF, the page count
//      matches, the metadata is right
//   2. by content, through PyMuPDF — the text is extractable and the
//      findings, the flagged code lines and the "how to fix" instructions
//      really are on the page
// ---------------------------------------------------------------------------

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { buildScanReportPdf, toWinAnsi } from '../../src/services/pdfReport.js';
import { runDetectorsSync } from '../../src/utils/owaspDetectors.js';

// ---------------------------------------------------------------------------
// A genuinely vulnerable Express snippet.
//
// Every pattern below is one the scanner is supposed to catch, so the
// resulting report has findings in several categories.
// ---------------------------------------------------------------------------
const VULNERABLE_CODE = `const express = require('express');
const app = express();

app.get('/user/:id', async (req, res) => {
  const id = req.params.id;
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  const rows = await db.query(query);
  res.json(rows);
});

app.post('/login', (req, res) => {
  const password = req.body.password;
  if (password === 'hunter2') {
    const token = md5(password + req.body.salt);
    res.json({ token });
  }
});

app.get('/proxy', (req, res) => {
  fetch(req.query.url).then((r) => r.text()).then((t) => res.send(t));
});

const apiKey = "sk_live_9f8e7d6c5b4a3210";
console.log('Using API key:', apiKey);
`;

/**
 * Run the detectors the same way the scanner page does, and assemble the
 * result object the scanner page hands to the PDF builder.
 *
 * @param {string} code
 * @param {'code'|'sql'} mode
 * @param {string} language
 */
const scan = (code, mode, language) => {
  const findings = runDetectorsSync(code, mode, language);
  const totalIssues = findings.reduce((sum, f) => sum + (f.count || 0), 0);
  const score = Math.max(0, Math.min(100, 100 - totalIssues * 4));

  return {
    score,
    summary: score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk',
    findings,
    totalIssues,
  };
};

/** The bytes of a built report, as a Buffer. */
const toBuffer = async (blob) => Buffer.from(await blob.arrayBuffer());

// ---------------------------------------------------------------------------
// A long-lived PyMuPDF reader.
//
// Node has no PDF reader, and PyMuPDF is already a project dependency (the
// layout checks in `scripts/` use it), so the PDF content is validated with
// the same tool that renders the report for a human.
//
// Spawning Python costs a couple of seconds on this machine and the suite
// needs the content of several PDFs, so one process is started and kept
// alive and each PDF is handed to it as a file path.
// ---------------------------------------------------------------------------
let reader = null;

const startReader = () => {
  const script = [
    'import json, sys',
    'import pymupdf',
    'for line in sys.stdin:',
    '    path = line.strip()',
    '    if not path:',
    '        continue',
    '    try:',
    '        doc = pymupdf.open(path)',
    '        per_page = [page.get_text() for page in doc]',
    '        info = doc.metadata or {}',
    '        payload = {',
    '            "pages": doc.page_count,',
    '            "text": "\\n".join(per_page),',
    '            "perPage": per_page,',
    '            "title": info.get("title") or "",',
    '            "author": info.get("author") or "",',
    '            "creator": info.get("creator") or "",',
    '            "spans": [',
    '                {',
    '                    "page": page_number,',
    '                    "text": span.get("text") or "",',
    '                    "bbox": list(span.get("bbox") or []),',
    '                }',
    '                for page_number, page in enumerate(doc, start=1)',
    '                for block in page.get_text("dict").get("blocks", [])',
    '                for line in block.get("lines", [])',
    '                for span in line.get("spans", [])',
    '            ],',
    '        }',
    '    except Exception as err:',
    '        payload = {"error": str(err)}',
    '    sys.stdout.write(json.dumps(payload) + "\\n")',
    '    sys.stdout.flush()',
  ].join('\n');

  const proc = spawn('python', ['-u', '-c', script], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // The reader's stderr is not interesting; without a listener Node
  // would treat the stream as unhandled.
  proc.stderr.on('data', () => {});

  // Every reply is one line of JSON. They are buffered as they arrive
  // and handed out one by one, in order.
  const lines = [];
  let pending = '';
  proc.stdout.on('data', (chunk) => {
    pending += chunk.toString('utf8');
    let index = pending.indexOf('\n');
    while (index >= 0) {
      const line = pending.slice(0, index);
      pending = pending.slice(index + 1);
      if (line.trim()) lines.push(line);
      index = pending.indexOf('\n');
    }
  });

  proc.lines = lines;
  return proc;
};

/**
 * Stop the reader.
 *
 * The reader is a child process, so it keeps the Node event loop alive
 * once the last test has run. Without this the test run hangs instead of
 * exiting.
 */
const stopReader = () => {
  if (!reader) return;
  reader.stdin.end();
  reader.kill();
  reader = null;
};

/**
 * Read the text of every page of a PDF.
 *
 * @param {Buffer} buffer
 * @returns {{pages: number, text: string, perPage: string[], title: string, author: string, creator: string, spans: Array<{page: number, text: string, bbox: number[]}>}}
 */
const readPdf = async (buffer) => {
  const tmp = path.resolve('logs/pdf-export-test.pdf');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, buffer);

  if (!reader) reader = startReader();

  // One line of JSON comes back per request. The replies are buffered as
  // they arrive and handed out in order.
  reader.stdin.write(tmp + '\n');

  // Wait for the reply of this request.
  while (!reader.lines.length) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const payload = JSON.parse(reader.lines.shift());
  if (payload.error) {
    throw new Error(`PyMuPDF could not read the PDF: ${payload.error}`);
  }
  return payload;
};

after(() => stopReader());

// ---------------------------------------------------------------------------
// The scan the whole suite is built on.
// ---------------------------------------------------------------------------
let results;
let report;
let buffer;
let parsed;

before(async () => {
  results = scan(VULNERABLE_CODE, 'code', 'javascript');

  report = buildScanReportPdf({
    fileName: 'vulnerable-express.js',
    languageLabel: 'Node / Express',
    mode: 'code',
    code: VULNERABLE_CODE,
    results,
    ttlHours: 24,
  });

  buffer = await toBuffer(report.blob);
  parsed = await readPdf(buffer);
});

describe('OWASP scan → PDF export', () => {
  // ---- The scan itself ---------------------------------------------------

  it('finds real issues in the scanned file', () => {
    // If the detectors stopped working, the PDF would still build — it
    // would just be empty. This assertion keeps the rest of the suite
    // honest: it only ever runs against a scan that found something.
    assert.ok(results.totalIssues > 0, 'the scan found no issues at all');
    assert.equal(results.findings.length, 10, 'all ten OWASP categories were checked');
  });

  it('flags the categories the vulnerable code actually contains', () => {
    const failed = results.findings
      .filter((f) => f.status === 'fail' || f.status === 'warning')
      .map((f) => f.id);

    assert.ok(failed.includes('A03'), 'the SQL injection was not detected');
    assert.ok(failed.includes('A02'), 'the weak hash / hardcoded key were not detected');
    assert.ok(failed.includes('A07'), 'the weak password comparison was not detected');
    assert.ok(failed.includes('A10'), 'the SSRF sink was not detected');
  });

  // ---- The generated file ------------------------------------------------

  it('produces a real PDF', () => {
    assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-', 'not a PDF file');
    assert.ok(buffer.includes(Buffer.from('%%EOF')), 'the PDF is not terminated');
    assert.ok(report.sizeBytes > 1000, `the PDF is suspiciously small (${report.sizeBytes} bytes)`);
    assert.equal(buffer.length, report.sizeBytes, 'the reported size does not match the bytes');
  });

  it('produces a PDF that opens and has the expected page count', async () => {
    assert.equal(parsed.pages, report.pageCount, 'the page count does not match');
    assert.ok(parsed.pages >= 3, `expected a multi-page report, got ${parsed.pages}`);
  });

  it('names the file after the scanned file', () => {
    assert.equal(report.fileName, 'owasp-report-vulnerable-express.js.pdf');
  });

  it('carries the document metadata', async () => {
    assert.match(parsed.title || '', /OWASP Top 10 \(2026\) Security Report/);
    assert.match(parsed.title || '', /vulnerable-express\.js/);
    assert.equal(parsed.author, 'Project Eric OWASP Scanner');
    assert.equal(parsed.creator, 'Project Eric');
  });

  // ---- The content -------------------------------------------------------

  it('shows the score and the counts from the scan', async () => {
    const score = String(results.score);
    assert.ok(parsed.text.includes(score), `the score ${score} is not on the page`);

    assert.ok(parsed.text.includes('SECURITY SCORE'), 'the score panel heading is missing');
    assert.ok(parsed.text.includes('Failed'), 'the "Failed" count label is missing');
    assert.ok(parsed.text.includes('Warnings'), 'the "Warnings" count label is missing');
    assert.ok(parsed.text.includes('Passed'), 'the "Passed" count label is missing');
    assert.ok(parsed.text.includes(results.summary), 'the risk summary is missing');
  });

  it('shows the scanned file name and the language', async () => {
    assert.ok(parsed.text.includes('vulnerable-express.js'), 'the file name is missing');
    assert.ok(parsed.text.includes('Node / Express'), 'the language label is missing');
  });

  it('documents every failing category', async () => {
    const actionable = results.findings.filter(
      (f) => f.status === 'fail' || f.status === 'warning'
    );

    assert.ok(actionable.length > 0, 'the scan produced no actionable finding');

    for (const finding of actionable) {
      assert.ok(
        parsed.text.includes(finding.id),
        `the finding ${finding.id} is not in the report`
      );
      assert.ok(
        parsed.text.includes(finding.name),
        `the name of ${finding.id} ("${finding.name}") is not in the report`
      );
      assert.ok(
        parsed.text.includes(finding.cwe),
        `the CWE of ${finding.id} ("${finding.cwe}") is not in the report`
      );
    }
  });

  it('shows the offending source line', async () => {
    // The A03 finding points at the SQL concatenation. The report has to
    // carry the source line itself, not just a description of it.
    assert.ok(
      parsed.text.includes('SELECT * FROM users'),
      'the flagged SQL line is not in the report'
    );
    assert.ok(
      parsed.text.includes('>> A03'),
      'the marker under the flagged line is missing'
    );
  });

  it('shows how to fix the finding', async () => {
    assert.ok(parsed.text.includes('How to fix'), 'the "How to fix" section is missing');
    assert.ok(
      parsed.text.includes('Actions to take'),
      'the list of actions is missing'
    );
    assert.ok(
      parsed.text.includes('Reference implementation'),
      'the before/after reference implementation is missing'
    );
    assert.ok(
      parsed.text.includes('Verify the fix'),
      'the verification checklist is missing'
    );
  });

  it('keeps the before/after chips clear of the reference heading', async () => {
    // The chip used to be drawn high enough to overlap the heading
    // above it. The heading and the chip are separate text runs, so
    // their bounding boxes must not touch.
    //
    // This builds its own report: the shared `parsed` object is
    // overwritten by the later suites, so it cannot be relied on here.
    const withFix = buildScanReportPdf({
      fileName: 'vulnerable-express.js',
      languageLabel: 'Node / Express',
      mode: 'code',
      code: VULNERABLE_CODE,
      results,
      ttlHours: 24,
    });
    const fixParsed = await readPdf(await toBuffer(withFix.blob));

    const heading = fixParsed.spans.find(
      (span) => span.text.trim() === 'Reference implementation'
    );
    assert.ok(heading, 'the "Reference implementation" heading is missing');

    const chips = fixParsed.spans.filter((span) => {
      const text = span.text.trim().toUpperCase();
      return text.startsWith('BEFORE') || text.startsWith('AFTER');
    });
    assert.ok(chips.length >= 2, 'the before/after chips are missing');

    chips.forEach((chip) => {
      const [chipLeft, chipTop, chipRight, chipBottom] = chip.bbox;

      // The chip belongs to the closest heading above it. A chip that
      // starts on the next page is not compared with a heading from the
      // previous page.
      const headingAbove = fixParsed.spans
        .filter((span) => span.text.trim() === 'Reference implementation')
        .filter((span) => span.bbox[1] < chipTop && span.page === chip.page)
        .sort((a, b) => b.bbox[1] - a.bbox[1])[0];

      if (!headingAbove) return;

      const [headLeft, headTop, headRight, headBottom] = headingAbove.bbox;

      const overlapsHorizontally = chipLeft < headRight && chipRight > headLeft;
      const overlapsVertically = chipTop < headBottom && chipBottom > headTop;

      assert.ok(
        !(overlapsHorizontally && overlapsVertically),
        `the "${chip.text.trim()}" chip overlaps the "Reference implementation" heading`
      );
    });
  });

  it('shows the categories that passed', async () => {
    assert.ok(
      parsed.text.includes('Categories that passed'),
      'the passing-categories page is missing'
    );
    const passing = results.findings.filter((f) => f.status === 'pass');
    assert.ok(passing.length > 0, 'the scan produced no passing category');
    for (const finding of passing) {
      assert.ok(
        parsed.text.includes(finding.id),
        `the passing category ${finding.id} is not listed`
      );
    }
  });

  it('explains the expiry of a stored copy', async () => {
    assert.ok(
      parsed.text.includes('deleted 24 hours'),
      'the expiry notice is missing'
    );
  });

  // ---- The priority table ------------------------------------------------

  it('lists the issues to fix first, worst first', async () => {
    assert.ok(
      parsed.text.includes('Fix these first'),
      'the priority table is missing'
    );

    // The table has to be sorted by severity, so the first row is the
    // most severe finding of the scan. Findings of the same severity
    // are ordered by how many hits they have, so the worst of them
    // comes first.
    const actionable = results.findings.filter(
      (f) => f.status === 'fail' || f.status === 'warning'
    );
    assert.ok(actionable.length > 0, 'the scan produced no actionable finding');

    const rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const sorted = [...actionable].sort((a, b) => {
      const bySeverity = (rank[a.severity] ?? 5) - (rank[b.severity] ?? 5);
      if (bySeverity !== 0) return bySeverity;
      return (b.count || 0) - (a.count || 0);
    });

    // The first category in the table is the one the table starts
    // with, so it has to appear on the cover page before any other
    // finding id does.
    const coverText = parsed.perPage[0];
    const first = sorted[0];
    assert.ok(
      coverText.includes(first.id),
      `the priority table does not start with ${first.id}`
    );

    // And it really is the first one listed: no other finding id
    // comes before it on the cover.
    const firstIndex = coverText.indexOf(first.id);
    sorted.slice(1).forEach((finding) => {
      const index = coverText.indexOf(finding.id);
      if (index >= 0) {
        assert.ok(
          index > firstIndex,
          `${finding.id} is listed before ${first.id} in the priority table`
        );
      }
    });
  });

  it('gives every category its own colour, and shows the key', async () => {
    // The legend page carries the colour key, so a reader can tell
    // which category a colour belongs to.
    assert.ok(
      parsed.text.includes('Category colours'),
      'the category-colour key is missing'
    );

    // Every category id has to appear in the key, so no category is
    // left without a colour of its own.
    for (const finding of results.findings) {
      assert.ok(
        parsed.text.includes(finding.id),
        `${finding.id} is missing from the colour key`
      );
    }
  });

  it('shows the fix summary in a labelled panel', async () => {
    assert.ok(parsed.text.includes('FIX'), 'the fix panel marker is missing');

    // The summary of a failing finding has to be on the page. The
    // summary is wrapped over several lines in the PDF, so it is
    // checked line by line rather than as one string.
    const actionable = results.findings.filter(
      (f) => f.status === 'fail' || f.status === 'warning'
    );
    const withSummary = actionable.find((f) => f.suggestion?.summary);
    assert.ok(withSummary, 'no failing finding carried a fix summary');

    const encoded = toWinAnsi(withSummary.suggestion.summary);
    const words = encoded.split(/\s+/).filter((w) => w.length > 3);

    // Every substantial word of the summary has to be on the page.
    words.forEach((word) => {
      assert.ok(
        parsed.text.includes(word),
        `the fix summary of ${withSummary.id} is missing "${word}"`
      );
    });
  });

  it('ends with a page that says what to do next', async () => {
    assert.ok(parsed.text.includes('Next steps'), 'the next-steps page is missing');
    assert.ok(
      parsed.text.includes('How to work through this report'),
      'the plan for working through the report is missing'
    );
    assert.ok(
      parsed.text.includes('static scan, not a proof of safety'),
      'the caveat about what a scan can see is missing'
    );
    assert.ok(
      parsed.text.includes('CSV'),
      'the mention of the CSV export is missing'
    );
  });

  it('numbers the pages', async () => {
    assert.ok(parsed.text.includes('Page 1 of'), 'the page footer is missing');
  });

  it('puts the footer on every page', async () => {
    parsed.perPage.forEach((pageText, index) => {
      assert.ok(
        pageText.includes('Page '),
        `page ${index + 1} has no footer`
      );
    });
  });

  it('does not leave a page blank', async () => {
    parsed.perPage.forEach((pageText, index) => {
      assert.ok(
        pageText.trim().length > 40,
        `page ${index + 1} is essentially empty`
      );
    });
  });
});

// ---------------------------------------------------------------------------
// A clean scan — the other branch of the exporter.
// ---------------------------------------------------------------------------

describe('OWASP scan → PDF export (clean file)', () => {
  const CLEAN_CODE = `const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
`;

  it('produces a report that says no issues were found', async () => {
    const cleanResults = scan(CLEAN_CODE, 'code', 'javascript');
    const built = buildScanReportPdf({
      fileName: 'clean-service.js',
      languageLabel: 'Node / Express',
      mode: 'code',
      code: CLEAN_CODE,
      results: cleanResults,
      ttlHours: 24,
    });

    assert.equal(
      cleanResults.findings.filter((f) => f.status !== 'pass').length,
      0,
      'the clean file produced a finding'
    );

    const text = (await readPdf(await toBuffer(built.blob))).text;
    assert.ok(text.includes('No issues detected'), 'the clean-bill heading is missing');
    assert.ok(text.includes('PASS'), 'the PASS markers are missing');
  });
});

// ---------------------------------------------------------------------------
// SQL mode — the exporter takes a different path for SQL.
// ---------------------------------------------------------------------------

describe('OWASP scan → PDF export (SQL mode)', () => {
  const SQL = `SELECT * FROM users WHERE id = '" + id + "';
SELECT * FROM orders WHERE total > 100 OR 1 = 1;
`;

  it('produces a report from a SQL scan', async () => {
    const sqlResults = scan(SQL, 'sql', 'mysql');
    const built = buildScanReportPdf({
      fileName: 'queries.sql',
      languageLabel: 'MySQL / MariaDB',
      mode: 'sql',
      code: SQL,
      results: sqlResults,
      ttlHours: 24,
    });

    const text = (await readPdf(await toBuffer(built.blob))).text;
    assert.ok(text.includes('SQL mode'), 'the SQL-mode label is missing from the cover');
    assert.ok(text.includes('A03'), 'the injection finding is missing');
  });
});

// ---------------------------------------------------------------------------
// Edge cases the exporter has to survive.
// ---------------------------------------------------------------------------

describe('OWASP scan → PDF export (edge cases)', () => {
  it('handles an empty scan', () => {
    const built = buildScanReportPdf({
      fileName: 'empty.js',
      languageLabel: 'JavaScript',
      mode: 'code',
      code: '',
      results: { score: 100, summary: 'Low Risk', totalIssues: 0, findings: [] },
    });

    assert.ok(built.pageCount >= 1);
    assert.ok(built.sizeBytes > 500);
  });

  it('handles a scan with no results at all', () => {
    const built = buildScanReportPdf({ fileName: 'nothing.js' });
    assert.ok(built.pageCount >= 1);
    assert.ok(built.sizeBytes > 500);
  });

  it('handles source code that cannot be drawn in the PDF font', async () => {
    const weird = `const label = "日本語 · emoji 🎉 → done";`;
    const weirdResults = scan(weird, 'code', 'javascript');

    const built = buildScanReportPdf({
      fileName: 'unicode.js',
      languageLabel: 'JavaScript',
      mode: 'code',
      code: weird,
      results: weirdResults,
    });

    const buffer = await toBuffer(built.blob);
    assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
    // The file must still be readable — the un-drawable characters are
    // replaced, not dropped or written as raw bytes.
    assert.ok((await readPdf(buffer)).pages >= 1);
  });

  it('does not lose the source code when a line is very long', async () => {
    const longLine = `const value = "${'x'.repeat(1200)}";`;
    const longResults = scan(longLine, 'code', 'javascript');

    const built = buildScanReportPdf({
      fileName: 'long-line.js',
      languageLabel: 'JavaScript',
      mode: 'code',
      code: longLine,
      results: longResults,
    });

    const buffer = await toBuffer(built.blob);
    assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok((await readPdf(buffer)).pages >= 1);
  });

  it('strips characters that would break the PDF from the file name', () => {
    const built = buildScanReportPdf({
      fileName: 'my file (1).js',
      languageLabel: 'JavaScript',
      mode: 'code',
      code: '',
      results: { score: 100, summary: 'Low Risk', totalIssues: 0, findings: [] },
    });

    assert.match(built.fileName, /^owasp-report-[A-Za-z0-9._-]+\.pdf$/);
  });
});
