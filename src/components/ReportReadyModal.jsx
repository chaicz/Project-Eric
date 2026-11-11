import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, FileText, Download, ShieldCheck, Clock, Link2, Copy, Check,
  Trash2, Loader2, AlertTriangle, ExternalLink, Info, Table2,
} from 'lucide-react';
import { reportAPI, blobToBase64 } from '../services/api';

/**
 * ReportReadyModal — the popup that appears once a PDF security report
 * has been generated.
 *
 * The popup exists for three reasons:
 *
 *  1. It tells the user what is in the report (score, findings, page
 *     count, size), so there is no surprise about what they just made.
 *
 *  2. It offers the two download formats side by side: the PDF (the
 *     full document, with the code and the fix instructions) and the
 *     CSV (the same findings in a spreadsheet shape).
 *
 *  3. It explains the data-protection rule *before* anything is sent
 *     anywhere: the report contains their source code, and a copy that
 *     is stored on the server is deleted again 24 hours later. The user
 *     chooses between keeping the file only on their own device and
 *     storing a shareable copy that expires.
 *
 * @param {object}   props
 * @param {Blob}     props.blob       the generated PDF
 * @param {string}   props.fileName   the file name to save it under
 * @param {object}   props.meta       { fileName, languageLabel, score, summary, totalIssues, pageCount, sizeBytes }
 * @param {Function} props.onDownloadCsv  called when the user asks for the CSV
 * @param {Function} props.onClose    called when the popup is dismissed
 * @param {Function} props.onToast    called with (message, type) for notifications
 */
const ReportReadyModal = ({
  blob,
  fileName,
  meta = {},
  onDownloadCsv,
  onClose,
  onToast,
}) => {
  const [uploading, setUploading] = useState(false);
  const [stored, setStored] = useState(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  const {
    fileName: sourceName = 'scanned file',
    languageLabel = '',
    score,
    summary,
    totalIssues = 0,
    pageCount = 0,
    sizeBytes = 0,
  } = meta;

  // ---- Escape closes the popup ------------------------------------------
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // ---- Move focus into the dialog ---------------------------------------
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // ---- Countdown to the deletion moment ---------------------------------
  useEffect(() => {
    if (!stored?.expiresAt) {
      setCountdown(null);
      return undefined;
    }

    const tick = () => {
      const remaining = new Date(stored.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setCountdown('expired');
        return;
      }

      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      setCountdown(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [stored?.expiresAt]);

  // ---- Save the PDF straight to the device ------------------------------
  // Nothing is uploaded in this path: the file only ever exists on the
  // user's own machine.
  const handleDownload = useCallback(() => {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'owasp-security-report.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // The object URL is released on the next tick so the download has
    // started before it is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    onToast?.('Report downloaded to your device. Nothing was uploaded.', 'success');
  }, [blob, fileName, onToast]);

  // ---- Store a copy on the server for a 24-hour link --------------------
  const handleUpload = useCallback(async () => {
    if (!blob || uploading) return;

    setUploading(true);
    try {
      const contentBase64 = await blobToBase64(blob);

      const response = await reportAPI.createReport({
        filename: sourceName,
        title: 'OWASP Top 10 (2026) Security Report',
        language: languageLabel,
        score,
        totalIssues,
        contentBase64,
      });

      const report = response?.report || response;
      setStored({
        id: report.id,
        token: report.token,
        downloadUrl: report.downloadUrl || reportAPI.downloadUrl(report.token),
        expiresAt: report.expiresAt,
        expiresInHours: report.expiresInHours,
      });

      onToast?.('Report stored. The link stops working in 24 hours.', 'success');
    } catch (error) {
      onToast?.(error.message || 'The report could not be stored.', 'error');
    } finally {
      setUploading(false);
    }
  }, [blob, uploading, sourceName, languageLabel, score, totalIssues, onToast]);

  // ---- Copy the link ----------------------------------------------------
  const handleCopy = useCallback(async () => {
    if (!stored?.downloadUrl) return;
    try {
      await navigator.clipboard.writeText(stored.downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast?.('Could not copy the link. Select it and copy manually.', 'warning');
    }
  }, [stored?.downloadUrl, onToast]);

  // ---- Delete the stored copy straight away -----------------------------
  const handleDelete = useCallback(async () => {
    if (!stored?.id) return;
    try {
      await reportAPI.deleteReport(stored.id);
      setStored(null);
      onToast?.('The stored report was deleted.', 'success');
    } catch (error) {
      onToast?.(error.message || 'The report could not be deleted.', 'error');
    }
  }, [stored?.id, onToast]);

  const sizeLabel = sizeBytes > 1024
    ? `${(sizeBytes / 1024).toFixed(0)} KB`
    : `${sizeBytes} B`;

  const scoreTone = score >= 85
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
    : score >= 65
      ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10'
      : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-ready-title"
        className="w-full max-w-lg max-h-[90vh] overflow-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- Header ---------------------------------------------- */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3
                id="report-ready-title"
                className="font-semibold text-slate-900 dark:text-slate-100"
              >
                Security report ready
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {fileName}
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ---- Body ------------------------------------------------- */}
        <div className="p-5 space-y-4">
          {/* What is in the report */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {score !== undefined && (
              <div className={`rounded-xl p-3 text-center ${scoreTone}`}>
                <div className="text-2xl font-bold tabular-nums leading-none">{score}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wide mt-1 opacity-80">
                  Score
                </div>
              </div>
            )}
            <div className="rounded-xl p-3 text-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              <div className="text-2xl font-bold tabular-nums leading-none">{totalIssues}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide mt-1 opacity-80">
                Issues
              </div>
            </div>
            <div className="rounded-xl p-3 text-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              <div className="text-2xl font-bold tabular-nums leading-none">{pageCount}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide mt-1 opacity-80">
                Pages
              </div>
            </div>
            <div className="rounded-xl p-3 text-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              <div className="text-2xl font-bold tabular-nums leading-none">{sizeLabel}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide mt-1 opacity-80">
                Size
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {sourceName}
            </span>
            {languageLabel && <span>· {languageLabel}</span>}
            {summary && <span>· {summary}</span>}
          </div>

          {/* The data-protection notice */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-[12px] leading-relaxed text-amber-900 dark:text-amber-200">
                <p className="font-semibold">This report contains your source code.</p>
                <p className="mt-1 text-amber-800/90 dark:text-amber-300/90">
                  A copy stored on the server is deleted automatically 24 hours after it is
                  generated, and the download link stops working at that moment. Download the
                  file to keep it — a downloaded copy is never deleted.
                </p>
              </div>
            </div>
          </div>

          {/* The stored copy */}
          {stored ? (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <Link2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="text-[12px] leading-relaxed text-emerald-900 dark:text-emerald-200 min-w-0 flex-1">
                  <p className="font-semibold">Shareable link created</p>
                  <p className="mt-0.5 text-emerald-800/90 dark:text-emerald-300/90">
                    The link is unguessable, so it can be shared as it is.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={stored.downloadUrl || ''}
                  onFocus={(e) => e.target.select()}
                  aria-label="Report download link"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  <Clock className="w-3.5 h-3.5" />
                  {countdown === 'expired'
                    ? 'Expired — the link no longer works'
                    : `Deleted in ${countdown || '—'}`}
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={stored.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open
                  </a>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    Delete now
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
                Download the file to keep it on your device, or store a copy on the server to
                get a link that expires after 24 hours. The CSV download gives you the same
                findings in a spreadsheet — one row per category and one per hit — for
                sorting, filtering and ticketing.
              </p>
            </div>
          )}
        </div>

        {/* ---- Footer ---------------------------------------------- */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg text-[12px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Close
          </button>

          {!stored && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[12px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Link2 className="w-3.5 h-3.5" />}
              {uploading ? 'Storing…' : 'Store for 24 hours'}
            </button>
          )}

          {onDownloadCsv && (
            <button
              type="button"
              onClick={onDownloadCsv}
              title="Download the findings as a spreadsheet — one row per category and one per hit"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-[12px] font-semibold transition-colors"
            >
              <Table2 className="w-3.5 h-3.5" />
              Download CSV
            </button>
          )}

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportReadyModal;
