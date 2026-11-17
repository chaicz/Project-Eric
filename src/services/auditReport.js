// ---------------------------------------------------------------------------
// auditReport.js
//
// Builds a PDF export of the audit-log trail.
//
// The JSON export is the raw data; this PDF is the human-readable
// counterpart: one section per log entry with the event, the actor, the
// timestamp, the IP and the details, so the trail can be filed or shared
// without a spreadsheet.
//
// Text encoding: jsPDF's built-in fonts are WinAnsi encoded, so every
// string is passed through `toWinAnsi` from pdfReport.js first. That
// keeps accents and punctuation intact and replaces anything WinAnsi
// cannot draw with a readable placeholder.
// ---------------------------------------------------------------------------

import { jsPDF } from 'jspdf';
import { toWinAnsi } from './pdfReport.js';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

const COLOR = {
  ink: [15, 23, 42],
  body: [51, 65, 85],
  muted: [113, 128, 150],
  faint: [148, 163, 184],
  rule: [226, 232, 240],
  panel: [248, 250, 252],
  panelEdge: [226, 232, 240],
  brand: [4, 120, 87],
  fail: [220, 38, 38],
  failSoft: [254, 226, 226],
  warn: [217, 119, 6],
  warnSoft: [254, 243, 199],
  pass: [22, 163, 74],
  passSoft: [220, 252, 231],
  info: [37, 99, 235],
  infoSoft: [219, 234, 254],
};

const SEVERITY_DOT = {
  error: COLOR.fail,
  warning: COLOR.warn,
  success: COLOR.pass,
  info: COLOR.info,
};

const cleanText = (value) =>
  toWinAnsi(value).replace(/[\0-\b\v\f\x0E-\x1F\x7F]/g, '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatTimestamp = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Render an ISO / MySQL / Date timestamp the same way everywhere. */
export const formatLogTimestamp = (value) => {
  if (!value) return 'Unknown time';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return formatTimestamp(date);
};

/** The calendar date of a log timestamp, without depending on locale. */
export const formatLogDate = (value) => {
  if (!value) return 'Unknown date';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

/** The clock time of a log timestamp, as HH:MM. */
export const formatLogTime = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

class Layout {
  constructor(doc) {
    this.doc = doc;
    this.y = MARGIN;
  }

  fits(height) {
    return this.y + height <= PAGE_H - MARGIN - 18;
  }

  reserve(height) {
    if (!this.fits(height)) this.newPage();
  }

  newPage() {
    this.doc.addPage();
    this.y = MARGIN;
  }

  down(points) {
    this.y += points;
  }
}

const drawWrapped = (layout, text, opts = {}) => {
  const { size = 10, color = COLOR.body, indent = 0, gapAfter = 0, bold = false } = opts;
  const content = cleanText(text);
  if (!content) {
    layout.down(gapAfter);
    return;
  }
  const doc = layout.doc;
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
  const lines = doc.splitTextToSize(content, CONTENT_W - indent - 4);
  const rowHeight = size * 1.32;
  let index = 0;
  while (index < lines.length) {
    let fitCount = 0;
    let probe = layout.y;
    while (index + fitCount < lines.length) {
      if (probe + rowHeight > PAGE_H - MARGIN - 18) break;
      probe += rowHeight;
      fitCount += 1;
    }
    if (fitCount === 0) {
      layout.newPage();
      fitCount = Math.min(
        lines.length - index,
        Math.floor((PAGE_H - MARGIN * 2 - 18) / rowHeight)
      ) || 1;
    }
    for (let i = 0; i < fitCount; i += 1) {
      doc.text(lines[index + i], MARGIN + indent, layout.y + size);
      layout.down(rowHeight);
    }
    index += fitCount;
    if (index < lines.length) layout.newPage();
  }
  layout.down(gapAfter);
};

/**
 * Build the audit-log PDF.
 *
 * @param {object} params
 * @param {Array<object>} params.logs  normalised log entries (the same
 *   objects the Audit Logs page renders: timestamp, action, actor,
 *   actorEmail, resource, details, ip, status, severity)
 * @param {string} [params.exportedBy]  name shown as the exporter
 * @returns {{ doc, blob: Blob, fileName: string, pageCount: number, sizeBytes: number }}
 */
export const buildAuditLogsPdf = (params = {}) => {
  const { logs = [], exportedBy = '' } = params;
  const list = Array.isArray(logs) ? logs : [];

  const counts = {
    total: list.length,
    critical: list.filter((l) => l.severity === 'error').length,
    warnings: list.filter((l) => l.severity === 'warning').length,
    successful: list.filter((l) => l.severity === 'success').length,
  };

  const now = new Date();
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const stamp = formatTimestamp(now);

  doc.setProperties({
    title: `Audit Logs Export - ${stamp}`,
    subject: 'Audit log trail export',
    author: 'Project Eric',
    creator: 'Project Eric',
  });

  const layout = new Layout(doc);

  // ---- Header band -------------------------------------------------------
  const bandHeight = 132;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE_W, bandHeight, 'F');
  doc.setFillColor(4, 120, 87);
  doc.rect(0, bandHeight - 5, PAGE_W, 5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text('Audit Logs', MARGIN, 58);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(209, 250, 229);
  doc.text(cleanText(`Activity trail  �  ${list.length} event${list.length === 1 ? '' : 's'}`), MARGIN, 80);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  doc.text(cleanText(`Exported ${stamp}${exportedBy ? ` by ${exportedBy}` : ''}`), MARGIN, 104);

  layout.y = bandHeight + 24;

  // ---- Summary counts ----------------------------------------------------
  const boxes = [
    { label: 'Total events', value: counts.total, color: COLOR.ink, soft: COLOR.panel },
    { label: 'Critical', value: counts.critical, color: COLOR.fail, soft: COLOR.failSoft },
    { label: 'Warnings', value: counts.warnings, color: COLOR.warn, soft: COLOR.warnSoft },
    { label: 'Successful', value: counts.successful, color: COLOR.pass, soft: COLOR.passSoft },
  ];
  const boxW = CONTENT_W / 4;
  boxes.forEach((box, index) => {
    const x = MARGIN + index * boxW;
    doc.setFillColor(box.soft[0], box.soft[1], box.soft[2]);
    doc.roundedRect(x + (index === 0 ? 0 : 5), layout.y, boxW - (index === 0 ? 5 : 10), 56, 8, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(box.color[0], box.color[1], box.color[2]);
    doc.text(String(box.value), x + 16, layout.y + 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(COLOR.muted[0], COLOR.muted[1], COLOR.muted[2]);
    doc.text(box.label, x + 16, layout.y + 47);
  });
  layout.down(72);

  if (!list.length) {
    drawWrapped(layout, 'No activity has been recorded yet. System events will appear here as soon as activity is detected.', {
      size: 10,
      gapAfter: 8,
    });
  }

  // ---- Log entries -------------------------------------------------------
  list.forEach((log, index) => {
    const dot = SEVERITY_DOT[log.severity] || COLOR.info;
    const label = cleanText(log.actionLabel || log.action || 'Activity');
    const when = formatLogTimestamp(log.timestamp);
    const header = `${index + 1}. ${label}  �  ${when}`;

    // Keep the header with at least the first line of details.
    layout.reserve(52);

    doc.setFillColor(dot[0], dot[1], dot[2]);
    doc.circle(MARGIN + 4, layout.y + 4, 3, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(COLOR.ink[0], COLOR.ink[1], COLOR.ink[2]);
    const headerLines = doc.splitTextToSize(cleanText(header), CONTENT_W - 20);
    doc.text(headerLines[0], MARGIN + 16, layout.y + 8);
    layout.down(16);
    headerLines.slice(1).forEach((line) => {
      layout.reserve(14);
      doc.text(line, MARGIN + 16, layout.y + 8);
      layout.down(14);
    });

    const metaLine = cleanText(
      [log.actor || 'You', log.ip && log.ip !== 'N/A' ? `IP ${log.ip}` : '', log.resource || '']
        .filter(Boolean)
        .join('  �  ')
    );
    if (metaLine) {
      layout.reserve(14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(COLOR.muted[0], COLOR.muted[1], COLOR.muted[2]);
      const metaLines = doc.splitTextToSize(metaLine, CONTENT_W - 20);
      metaLines.slice(0, 2).forEach((line) => {
        doc.text(line, MARGIN + 16, layout.y + 8);
        layout.down(13);
      });
    }

    if (log.details) {
      drawWrapped(layout, log.details, { size: 9.5, indent: 16, gapAfter: 4 });
    } else {
      layout.down(4);
    }

    // Separator between entries.
    if (index < list.length - 1) {
      layout.reserve(12);
      doc.setDrawColor(COLOR.rule[0], COLOR.rule[1], COLOR.rule[2]);
      doc.setLineWidth(0.6);
      doc.line(MARGIN + 16, layout.y, PAGE_W - MARGIN, layout.y);
      layout.down(12);
    }
  });

  // ---- Footers -----------------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(COLOR.faint[0], COLOR.faint[1], COLOR.faint[2]);
    doc.text(`Audit Logs export  �  ${stamp}`, MARGIN, PAGE_H - 24);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 24, { align: 'right' });
  }

  const blob = doc.output('blob');
  const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return {
    doc,
    blob,
    fileName: `audit-logs-${datePart}.pdf`,
    pageCount: pages,
    sizeBytes: blob.size,
  };
};

/**
 * Build the audit-log PDF and hand it to the browser as a download.
 *
 * @param {object} params the same parameters as `buildAuditLogsPdf`
 */
export const downloadAuditLogsPdf = (params) => {
  const built = buildAuditLogsPdf(params);
  const url = URL.createObjectURL(built.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = built.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return built;
};

export default buildAuditLogsPdf;
