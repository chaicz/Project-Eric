// End-to-end test for the report-exports API.
//
// Registers a throwaway account, stores a PDF report, downloads it,
// checks the expiry rules and cleans up afterwards.

const BASE = 'http://localhost/project-eric-api/api';

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

  return { status: res.status, payload, text, headers: res.headers };
};

const log = (label, value) => console.log(`${label}: ${value}`);

// A minimal but genuinely valid PDF.
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
  'trailer<</Root 1 0 R>>\n%%EOF\n'
).toString('base64');

(async () => {
  const email = `report-test-${Date.now()}@example.test`;
  const password = 'Str0ng-Passw0rd!23';

  console.log('=== 1. Register a throwaway account ===');
  const reg = await call('/auth/register', {
    method: 'POST',
    body: {
      firstName: 'Report',
      lastName: 'Test',
      email,
      password,
    },
  });
  log('status', reg.status);
  if (reg.status !== 200 && reg.status !== 201) {
    console.log('body:', reg.text);
    process.exit(1);
  }
  const token = reg.payload?.data?.token;
  log('token received', Boolean(token));

  console.log('\n=== 2. Reject a non-PDF upload ===');
  const notPdf = await call('/reports', {
    method: 'POST',
    token,
    body: { filename: 'x.js', contentBase64: Buffer.from('hello world').toString('base64') },
  });
  log('status (expect 400)', notPdf.status);
  log('message', notPdf.payload?.error);

  console.log('\n=== 3. Reject an upload with no content ===');
  const empty = await call('/reports', {
    method: 'POST',
    token,
    body: { filename: 'x.js' },
  });
  log('status (expect 400)', empty.status);

  console.log('\n=== 4. Store a real PDF ===');
  const created = await call('/reports', {
    method: 'POST',
    token,
    body: {
      filename: 'routes_user.js',
      title: 'OWASP Top 10 (2026) Security Report',
      language: 'JavaScript',
      score: 48,
      totalIssues: 7,
      contentBase64: PDF,
    },
  });
  log('status (expect 201)', created.status);
  const report = created.payload?.data?.report || created.payload?.data;
  log('report id', report?.id);
  log('token length', report?.token?.length);
  log('expiresAt', report?.expiresAt);
  log('expiresInHours', report?.expiresInHours);
  log('downloadUrl', report?.downloadUrl);

  console.log('\n=== 5. List the account reports ===');
  const list = await call('/reports', { token });
  log('status', list.status);
  log('total', list.payload?.data?.total);
  log('ttlHours', list.payload?.data?.ttlHours);

  console.log('\n=== 6. Download the report with the token (no JWT) ===');
  const res = await fetch(report.downloadUrl);
  const bytes = Buffer.from(await res.arrayBuffer());
  log('status', res.status);
  log('content-type', res.headers.get('content-type'));
  log('bytes', bytes.length);
  log('is a PDF', bytes.slice(0, 5).toString() === '%PDF-');

  console.log('\n=== 7. Direct access to the stored file is denied ===');
  const direct = await fetch('http://localhost/project-eric-api/uploads/reports/anything.pdf');
  log('status (expect 403/404)', direct.status);

  console.log('\n=== 8. An unknown token is rejected ===');
  const bogus = await fetch(`${BASE}/reports/download?token=${'a'.repeat(64)}`);
  log('status (expect 404)', bogus.status);

  console.log('\n=== 9. A malformed token is rejected ===');
  const malformed = await fetch(`${BASE}/reports/download?token=short`);
  log('status (expect 400)', malformed.status);

  console.log('\n=== 10. Delete the report ===');
  const del = await call('/reports', { method: 'DELETE', token, body: { id: report.id } });
  log('status (expect 200)', del.status);

  console.log('\n=== 11. The link is dead after deletion ===');
  const afterDelete = await fetch(report.downloadUrl);
  log('status (expect 404)', afterDelete.status);

  console.log('\n=== 12. Listing again is empty ===');
  const list2 = await call('/reports', { token });
  log('total (expect 0)', list2.payload?.data?.total);

  console.log('\nAll report API checks finished.');
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});