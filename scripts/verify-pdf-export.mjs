// Renders the PDF that the export test produced, so the report can be
// looked at rather than only read.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { buildScanReportPdf } from '../src/services/pdfReport.js';
import { runDetectorsSync } from '../src/utils/owaspDetectors.js';

const CODE = `const express = require('express');
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

const findings = runDetectorsSync(CODE, 'code', 'javascript');
const totalIssues = findings.reduce((sum, f) => sum + (f.count || 0), 0);
const score = Math.max(0, Math.min(100, 100 - totalIssues * 4));

const results = {
  score,
  summary: score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk',
  findings,
  totalIssues,
};

const built = buildScanReportPdf({
  fileName: 'vulnerable-express.js',
  languageLabel: 'Node / Express',
  mode: 'code',
  code: CODE,
  results,
  ttlHours: 24,
});

const out = path.resolve('reports/pdf-export-verification.pdf');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(await built.blob.arrayBuffer()));

console.log('score:', results.score, '| issues:', results.totalIssues);
console.log('pages:', built.pageCount, '| bytes:', built.sizeBytes);
console.log('written:', out);

// The Python side writes the page images next to the PDF. The page
// number is filled in by Python itself, so the file name is built there.
const script = [
  'import pymupdf',
  'doc = pymupdf.open(r"""' + out.replace(/\\/g, '\\\\') + '""")',
  'for i, page in enumerate(doc):',
  '    pix = page.get_pixmap(dpi=110)',
  '    target = "reports/pdf-export-page-%02d.png" % (i + 1)',
  '    pix.save(target)',
  '    print("rendered", target)',
].join('\n');

const py = spawnSync('python', ['-c', script], {
  encoding: 'utf8',
  cwd: path.resolve('.'),
});
process.stdout.write(py.stdout || '');
process.stderr.write(py.stderr || '');
