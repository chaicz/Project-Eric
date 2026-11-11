// Trigger the reports cleanup sweep and confirm that stored PDFs with
// no matching database row are removed.
//
// Usage: node scripts/test-report-orphan-sweep.cjs

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = 'http://localhost/project-eric-api/api';
const MYSQL = 'D:\\xampp\\mysql\\bin\\mysql.exe';
const REPORTS_DIR = 'D:\\xampp\\htdocs\\project-eric-api\\uploads\\reports';

const sql = (query) =>
  execFileSync(
    MYSQL,
    ['-u', 'root', '-e', `SET time_zone = '+00:00'; USE project_eric; ${query}`],
    { encoding: 'utf8' }
  );

const count = (query) => {
  const lines = sql(query).split('\n').map((l) => l.trim()).filter(Boolean);
  return Number(lines[lines.length - 1]);
};

const call = async (path_, { method = 'GET', body, token } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path_}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  return { status: res.status, payload, text };
};

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
).toString('base64');

const pdfsOnDisk = () =>
  fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith('.pdf'));

(async () => {
  const email = `orphan-${Date.now()}@example.test`;
  const password = 'Str0ng-Passw0rd!23';

  const reg = await call('/auth/register', {
    method: 'POST',
    body: { firstName: 'Orphan', lastName: 'Test', email, password },
  });
  const token = reg.payload?.data?.token;
  console.log('registered:', reg.status);

  const created = await call('/reports', {
    method: 'POST', token,
    body: { filename: 'orphan.js', contentBase64: PDF },
  });
  const report = created.payload?.data?.report;

  const name = sql(`SELECT stored_name FROM report_exports WHERE id = ${Number(report.id)};`)
    .split('\n').map((l) => l.trim()).filter((l) => l && l !== 'stored_name')[0];
  const file = path.join(REPORTS_DIR, name);
  console.log('file on disk before:', fs.existsSync(file));

  // Remove the row only — the situation after an account deletion.
  sql(`DELETE FROM report_exports WHERE id = ${Number(report.id)};`);
  console.log('row deleted, file left behind');
  console.log('file on disk now (expect true):', fs.existsSync(file));

  // Any request to the endpoint runs the sweep.
  await call('/reports', { token });
  console.log('file on disk after sweep (expect false):', fs.existsSync(file));

  console.log('\n--- the whole folder ---');
  console.log('PDFs still on disk:', pdfsOnDisk().length, pdfsOnDisk());
  console.log('report rows in the database:', count('SELECT COUNT(*) FROM report_exports;'));

  // Clean up the throwaway account.
  sql(`DELETE FROM users WHERE email = '${email}';`);
  console.log('test account removed');
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});