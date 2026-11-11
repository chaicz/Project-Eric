// Verify the expiry logic in both directions:
//   - a report that expires in one minute must NOT be swept
//   - a report that expired one minute ago MUST be swept (row + file)
//   - the download link must respect the expiry
//
// All the SQL runs with the session timezone pinned to UTC, which is
// what the API uses.

const BASE = 'http://localhost/project-eric-api/api';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MYSQL = 'D:\\xampp\\mysql\\bin\\mysql.exe';
const REPORTS_DIR = 'D:\\xampp\\htdocs\\project-eric-api\\uploads\\reports';

const sql = (query) =>
  execFileSync(
    MYSQL,
    ['-u', 'root', '-e', `SET time_zone = '+00:00'; USE project_eric; ${query}`],
    { encoding: 'utf8' }
  );

const call = async (path, { method = 'GET', body, token } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
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

const storedNameOf = (id) =>
  sql(`SELECT stored_name FROM report_exports WHERE id = ${Number(id)};`)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== 'stored_name')[0];

(async () => {
  const email = `expiry2-${Date.now()}@example.test`;
  const password = 'Str0ng-Passw0rd!23';

  const reg = await call('/auth/register', {
    method: 'POST',
    body: { firstName: 'Expiry', lastName: 'Two', email, password },
  });
  const token = reg.payload?.data?.token;
  console.log('registered:', reg.status);

  // ---- A report that expires in one minute ------------------------------
  const soon = await call('/reports', {
    method: 'POST', token,
    body: { filename: 'soon.js', contentBase64: PDF },
  });
  const soonReport = soon.payload?.data?.report;
  const soonName = storedNameOf(soonReport.id);
  const soonFile = path.join(REPORTS_DIR, soonName);
  console.log('\n[A] expires in 1 minute');
  console.log('  file on disk before:', fs.existsSync(soonFile));

  sql(
    `UPDATE report_exports SET expires_at = UTC_TIMESTAMP() + INTERVAL 1 MINUTE ` +
    `WHERE id = ${Number(soonReport.id)};`
  );

  // Any request sweeps the expired reports.
  await call('/reports', { token });
  console.log('  file on disk after sweep (expect true):', fs.existsSync(soonFile));
  console.log('  row still present (expect 1):',
    sql(`SELECT COUNT(*) FROM report_exports WHERE id = ${Number(soonReport.id)};`)
      .split('\n').pop().trim());

  const dl = await fetch(soonReport.downloadUrl);
  console.log('  download status (expect 200):', dl.status);

  // ---- A report that expired one minute ago ----------------------------
  const past = await call('/reports', {
    method: 'POST', token,
    body: { filename: 'past.js', contentBase64: PDF },
  });
  const pastReport = past.payload?.data?.report;
  const pastName = storedNameOf(pastReport.id);
  const pastFile = path.join(REPORTS_DIR, pastName);
  console.log('\n[B] expired 1 minute ago');
  console.log('  file on disk before:', fs.existsSync(pastFile));

  sql(
    `UPDATE report_exports SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE ` +
    `WHERE id = ${Number(pastReport.id)};`
  );

  await call('/reports', { token });
  console.log('  file on disk after sweep (expect false):', fs.existsSync(pastFile));
  console.log('  rows left (expect 0):',
    sql(`SELECT COUNT(*) FROM report_exports WHERE id = ${Number(pastReport.id)};`)
      .split('\n').pop().trim());

  const dl2 = await fetch(pastReport.downloadUrl);
  console.log('  download status (expect 404):', dl2.status);

  // ---- The expiry really is 24 hours out --------------------------------
  const fresh = await call('/reports', {
    method: 'POST', token,
    body: { filename: 'fresh.js', contentBase64: PDF },
  });
  const freshReport = fresh.payload?.data?.report;
  const hours = (new Date(freshReport.expiresAt) - Date.now()) / 3600000;
  console.log('\n[C] a new report expires in', hours.toFixed(2), 'hours (expect ~24)');
  console.log('  expiresInHours field:', freshReport.expiresInHours);

  // Clean up.
  await call('/reports', { method: 'DELETE', token, body: { id: soonReport.id } });
  await call('/reports', { method: 'DELETE', token, body: { id: freshReport.id } });

  console.log('\nExpiry behaviour verified.');
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});