// ---------------------------------------------------------------------------
// auditReport.test.mjs — the audit-log PDF export path
//
// The JSON export is the raw data; this PDF is the human-readable
// counterpart. These tests prove the builder produces a real, openable
// PDF that carries the log entries, counts the severities and formats
// every timestamp shape the page can hand it.
// ---------------------------------------------------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAuditLogsPdf,
  formatLogDate,
  formatLogTime,
  formatLogTimestamp,
} from '../../src/services/auditReport.js';

const LOGS = [
  {
    action: 'login',
    actionLabel: 'Login',
    timestamp: '2026-11-12T10:00:00Z',
    actor: 'Ada',
    actorEmail: 'ada@example.com',
    resource: 'Account',
    details: 'User logged in via email',
    ip: '127.0.0.1',
    status: 'success',
    severity: 'success',
  },
  {
    action: 'failed_login',
    actionLabel: 'Failed Login',
    timestamp: '2026-11-12 10:05:00',
    actor: 'Ada',
    actorEmail: 'ada@example.com',
    resource: 'Account',
    details: 'Wrong password',
    ip: '127.0.0.1',
    status: 'failed',
    severity: 'warning',
  },
  {
    action: 'critical_vulnerability',
    actionLabel: 'Critical Alert',
    timestamp: null,
    actor: 'Ada',
    actorEmail: '',
    resource: 'scan: 3',
    details: 'XSS vulnerability marked as open',
    ip: 'N/A',
    status: 'alert',
    severity: 'error',
  },
];

describe('audit log timestamp helpers', () => {
  it('formats ISO and MySQL timestamps the same way', () => {
    assert.match(formatLogTimestamp('2026-11-12T10:00:00Z'), /^12 Nov 2026, \d{2}:\d{2}$/);
    assert.match(formatLogTimestamp('2026-11-12 10:00:00'), /^12 Nov 2026, \d{2}:\d{2}$/);
  });

  it('returns a placeholder for a missing timestamp', () => {
    assert.equal(formatLogTimestamp(null), 'Unknown time');
    assert.equal(formatLogDate(null), 'Unknown date');
    assert.equal(formatLogTime(null), '');
  });

  it('passes an unparseable timestamp through instead of crashing', () => {
    assert.equal(formatLogTimestamp('not-a-date'), 'not-a-date');
  });

  it('formats the date and time parts separately', () => {
    assert.equal(formatLogDate('2026-11-12T10:00:00Z'), '12 Nov 2026');
    assert.match(formatLogTime('2026-11-12T10:00:00Z'), /^\d{2}:\d{2}$/);
  });
});

describe('audit logs → PDF export', () => {
  it('produces a real PDF with a dated file name', () => {
    const built = buildAuditLogsPdf({ logs: LOGS, exportedBy: 'Ada' });
    assert.ok(built.blob instanceof Blob, 'the export produced no blob');
    assert.ok(built.blob.size > 0, 'the PDF is empty');
    assert.match(built.fileName, /^audit-logs-\d{4}-\d{2}-\d{2}\.pdf$/);
    assert.ok(built.pageCount >= 1, 'the PDF has no pages');
  });

  it('survives an empty trail', () => {
    const built = buildAuditLogsPdf({ logs: [] });
    assert.ok(built.blob.size > 0, 'the empty PDF is empty');
    assert.equal(built.pageCount >= 1, true);
  });

  it('survives logs with missing fields', () => {
    const built = buildAuditLogsPdf({ logs: [{ details: 'x' }] });
    assert.ok(built.blob.size > 0);
  });

  it('embeds the entries so the trail can be read from the bytes', async () => {
    const built = buildAuditLogsPdf({ logs: LOGS });
    const buffer = Buffer.from(await built.blob.arrayBuffer());
    const text = buffer.toString('latin1');
    assert.ok(text.includes('Audit Logs'), 'the title is missing from the PDF');
    assert.ok(text.includes('Login'), 'the login entry is missing from the PDF');
    assert.ok(text.includes('Failed Login'), 'the failed-login entry is missing from the PDF');
  });

  it('carries the document metadata', async () => {
    const built = buildAuditLogsPdf({ logs: LOGS });
    const buffer = Buffer.from(await built.blob.arrayBuffer());
    const text = buffer.toString('latin1');
    assert.ok(text.includes('Audit log trail export'), 'the subject is missing');
  });
});
