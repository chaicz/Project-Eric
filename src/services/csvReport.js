// ---------------------------------------------------------------------------
// csvReport.js
//
// Builds a CSV summary of an OWASP scan.
//
// The PDF report is the long-form document: it shows the flagged code,
// the explanation and the fix. The CSV is the spreadsheet-shaped
// counterpart: one row per finding, so the results can be sorted,
// filtered, pasted into a ticket, or counted in a dashboard.
//
// Two shapes are produced:
//
//   • Findings  — one row per category, with the status, the severity,
//                 the CWE, the hit count and the fix guidance.
//   • Evidence  — one row per individual hit, with the source line.
//
// Both are returned as a single CSV string, with the evidence table
// appended after the findings table. A spreadsheet shows one table per
// file, so the two tables are separated by a blank line and a title row
// that says which table follows.
//
// Escaping
// --------
// A CSV cell breaks the moment it contains a comma, a quote or a
// newline — which a source-code snippet always does. Every value is
// therefore wrapped in quotes, and an inner quote is doubled, per
// RFC 4180. A cell that starts with `=`, `+`, `-` or `@` is prefixed
// with a single quote so a spreadsheet treats it as text rather than as
// a formula (CSV injection).
// ---------------------------------------------------------------------------

/**
 * Escape one value for a CSV cell.
 *
 * @param {*} value
 * @returns {string}
 */
export const escapeCsvValue = (value) => {
  if (value === null || value === undefined) return '';

  let text = String(value);
  // A leading =, +, - or @ would be executed as a formula by Excel and
  // Sheets. Prefixing a quote turns it back into plain text.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  // RFC 4180: wrap in quotes, and double any quote inside.
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

/**
 * Build one CSV row from a list of cells.
 *
 * @param {Array<*>} cells
 * @returns {string}
 */
export const toCsvRow = (cells) => cells.map(escapeCsvValue).join(',');

const STATUS_LABEL = {
  fail: 'Fail',
  warning: 'Warning',
  pass: 'Pass',
};

const SEVERITY_LABEL = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

/**
 * A short, spreadsheet-safe name for the scanned file.
 *
 * @param {string} fileName
 * @returns {string}
 */
const safeBaseName = (fileName) => {
  const safe = String(fileName || 'scanned-snippet')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || 'scanned-snippet';
};

/**
 * Build the CSV export of a scan.
 *
 * @param {object} params
 * @param {string} params.fileName      the name of the scanned file
 * @param {string} params.languageLabel the language shown on the cover
 * @param {'code'|'sql'} params.mode    the scanner mode
 * @param {object} params.results       the scan result
 * @returns {{
 *   csv: string,
 *   fileName: string,
 *   rows: number
 * }}
 */
export const buildScanReportCsv = (params = {}) => {
  const {
    fileName = 'scanned-snippet',
    languageLabel = 'Unknown',
    mode = 'code',
    results = {},
  } = params;

  const findings = Array.isArray(results.findings) ? results.findings : [];
  const score = typeof results.score === 'number' ? results.score : 0;
  const summary = results.summary
    || (score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk');
  const totalIssues = typeof results.totalIssues === 'number'
    ? results.totalIssues
    : findings.reduce((sum, f) => sum + (f.count || 0), 0);

  const lines = [];

  // ---- Summary block -----------------------------------------------------
  // The first block is a key/value table, so the sheet opens with the
  // headline numbers instead of a wall of rows.
  lines.push(toCsvRow(['OWASP Top 10 (2026) Security Report']));
  lines.push(toCsvRow(['Scanned file', fileName]));
  lines.push(toCsvRow(['Language', languageLabel]));
  lines.push(toCsvRow(['Mode', mode === 'sql' ? 'SQL' : 'Source code']));
  lines.push(toCsvRow(['Security score', `${score}/100`]));
  lines.push(toCsvRow(['Risk summary', summary]));
  lines.push(toCsvRow(['Total issues', totalIssues]));
  lines.push(toCsvRow([
    'Categories failed',
    findings.filter((f) => f.status === 'fail').length,
  ]));
  lines.push(toCsvRow([
    'Categories with warnings',
    findings.filter((f) => f.status === 'warning').length,
  ]));
  lines.push(toCsvRow([
    'Categories passed',
    findings.filter((f) => f.status === 'pass').length,
  ]));
  lines.push(toCsvRow(['Generated', new Date().toISOString()]));

  // ---- Findings table ----------------------------------------------------
  lines.push('');
  lines.push(toCsvRow(['FINDINGS']));
  lines.push(toCsvRow([
    'Category',
    'Name',
    'Status',
    'Severity',
    'CWE',
    'Hits',
    'Description',
    'How to fix',
    'Actions to take',
    'Verify the fix',
    'References',
  ]));

  findings.forEach((finding) => {
    const suggestion = finding.suggestion || {};

    lines.push(toCsvRow([
      finding.id || '',
      finding.name || '',
      STATUS_LABEL[finding.status] || finding.status || '',
      SEVERITY_LABEL[finding.severity] || finding.severity || '',
      finding.cwe || '',
      typeof finding.count === 'number' ? finding.count : 0,
      finding.description || '',
      suggestion.summary || finding.remediation || '',
      Array.isArray(suggestion.changes) ? suggestion.changes.join(' | ') : '',
      Array.isArray(suggestion.checklist) ? suggestion.checklist.join(' | ') : '',
      Array.isArray(suggestion.refs)
        ? suggestion.refs.map((r) => `${r.title || ''} ${r.url || ''}`.trim()).join(' | ')
        : '',
    ]));
  });

  // ---- Evidence table ----------------------------------------------------
  const evidenceRows = [];
  findings.forEach((finding) => {
    const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];
    evidence.forEach((hit) => {
      evidenceRows.push(toCsvRow([
        finding.id || '',
        finding.name || '',
        STATUS_LABEL[finding.status] || finding.status || '',
        SEVERITY_LABEL[finding.severity] || finding.severity || '',
        finding.cwe || '',
        typeof hit?.line === 'number' && hit.line > 0 ? hit.line : '',
        hit?.snippet || '',
      ]));
    });
  });

  if (evidenceRows.length) {
    lines.push('');
    lines.push(toCsvRow(['EVIDENCE']));
    lines.push(toCsvRow([
      'Category',
      'Name',
      'Status',
      'Severity',
      'CWE',
      'Line',
      'Snippet',
    ]));
    lines.push(...evidenceRows);
  }

  // A BOM makes Excel open the file as UTF-8, so a file name with an
  // accent or a non-Latin script survives the round trip.
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`;

  return {
    csv,
    fileName: `owasp-report-${safeBaseName(fileName)}.csv`,
    rows: findings.length + evidenceRows.length,
  };
};

/**
 * Build the CSV export and hand it to the browser as a download.
 *
 * @param {object} params  the same parameters as `buildScanReportCsv`
 */
export const downloadScanReportCsv = (params) => {
  const built = buildScanReportCsv(params);
  const blob = new Blob([built.csv], { type: 'text/csv;charset=utf-8' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = built.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The object URL is released on the next tick so the download has
  // started before it is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return built;
};

export default buildScanReportCsv;
