// AiFixPanel.jsx
// ---------------------------------------------------------------------------
// The Gemini-powered "AI Fix Advisor" panel.
//
// Two modes:
//
//   fix  — a single OWASP finding. Shows what to change and the fixed
//          code for the snippet that triggered it.
//   plan — the whole scan. Shows a prioritised remediation plan.
//
// When no Gemini key is configured the panel shows an inline key field
// instead of the button. The key is stored locally (see
// services/geminiAdvisor.js) and never leaves the browser except in the
// request to Google's API.
//
// Design notes
// ------------
//   • The before/after code is shown side by side with copy buttons, so
//     the developer can drop the fixed snippet straight into their file.
//   • Errors are surfaced verbatim. A 403 from Google ("API key not
//     valid") is much more useful than a generic "something went wrong".
//   • The panel is self-contained: it owns its key, its loading state and
//     its result, so the scanner page does not need to thread state
//     through every card.

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Loader2,
  KeyRound,
  Copy,
  Check,
  Download,
  AlertCircle,
  ListChecks,
  Wand2,
  ExternalLink,
  AlertTriangle,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react';
import {
  askGeminiForFix,
  askGeminiForPlan,
  saveGeminiKey,
  hasGeminiKey,
  resetGeminiModel,
} from '../services/geminiAdvisor';
import {
  buildFixedFileName,
  downloadTextFile,
  languageExtension,
  sourceMimeType,
} from '../utils/sourceDownload';

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const CodeBlock = ({ value, label, tone = 'slate', onCopy }) => {
  const [copied, setCopied] = useState(false);

  const tones = {
    danger: {
      head: 'bg-red-100/80 dark:bg-red-500/20 text-red-700 dark:text-red-200',
      body: 'bg-red-950/40 text-red-100 border-red-900/60',
    },
    success: {
      head: 'bg-emerald-100/80 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-200',
      body: 'bg-emerald-950/40 text-emerald-100 border-emerald-900/60',
    },
    slate: {
      head: 'bg-slate-200/80 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200',
      body: 'bg-slate-950 text-slate-100 border-slate-800',
    },
  };
  const t = tones[tone] || tones.slate;

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        /* clipboard unavailable — the user can select the text manually */
      }
    }
    setCopied(true);
    onCopy?.(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className={`rounded-xl border overflow-hidden ${tone === 'danger'
      ? 'border-red-300/70 dark:border-red-500/40'
      : tone === 'success'
        ? 'border-emerald-300/70 dark:border-emerald-500/40'
        : 'border-slate-300/70 dark:border-slate-700/60'}`}>
      <div className={`flex items-center justify-between px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${t.head}`}>
        <span className="truncate">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!value}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50 transition-colors text-[10px] font-bold disabled:opacity-50"
          title="Copy this snippet to your clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className={`m-0 px-3 py-2.5 text-[11px] leading-relaxed font-mono whitespace-pre overflow-auto max-h-56 border-t ${t.body}`}>
        {value || <span className="text-slate-500 italic">Not provided for this finding.</span>}
      </pre>
    </div>
  );
};

const SectionLabel = ({ icon: Icon, children }) => (
  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
    <Icon className="w-3 h-3" /> {children}
  </p>
);

// ---------------------------------------------------------------------------
// Inline API key form
// ---------------------------------------------------------------------------

const KeyForm = ({ onSaved, compact }) => (
  <div className="rounded-xl border border-amber-200/70 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-3">
    <div className="flex items-center gap-2 mb-1.5">
      <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
      <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
        Connect Gemini to get AI fix suggestions
      </p>
    </div>
    <p className="text-[11px] text-amber-800/90 dark:text-amber-200/80 leading-relaxed mb-2.5">
      Paste a Gemini API key. It is stored only in this browser and sent straight to
      Google&apos;s API.
    </p>
    <GeminiKeyInput onSaved={onSaved} compact={compact} />
    <Link
      to="/api-keys"
      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline"
    >
      Manage all AI keys <ExternalLink className="w-3 h-3" />
    </Link>
  </div>
);

const GeminiKeyInput = ({ onSaved, compact }) => {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  const handleSave = () => {
    const key = value.trim();
    if (key.length < 20) {
      setError('That does not look like a Gemini key (they start with "AIza").');
      return;
    }
    saveGeminiKey(key);
    resetGeminiModel();
    setError('');
    setValue('');
    onSaved?.();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(); } }}
            placeholder="AIza…"
            autoComplete="off"
            spellCheck={false}
            className={`w-full px-3 ${compact ? 'py-2' : 'py-2.5'} pr-9 rounded-lg border border-amber-200 dark:border-amber-500/40 bg-white dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            title={show ? 'Hide the key' : 'Show the key'}
          >
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        <button
          type="button"
          onClick={handleSave}
          className={`${compact ? 'px-3' : 'px-4'} shrink-0 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-700 to-orange-700 hover:from-amber-800 hover:to-orange-800 text-white shadow-sm transition-all`}
        >
          Save
        </button>
      </div>
      {error && (
        <p className="flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

/**
 * @param {object} props
 * @param {'fix'|'plan'} props.mode
 * @param {string} props.code         The scanned snippet.
 * @param {object} [props.finding]     Required for mode="fix".
 * @param {Array<object>} [props.findings] Required for mode="plan".
 * @param {string} [props.language]
 * @param {string} [props.scannerMode]  Scanner mode: 'code' | 'sql'.
 * @param {string} [props.dialect]
 * @param {string} [props.fileName]     Original uploaded source file name.
 * @param {Function} [props.onApplyFix] Receives the corrected source code.
 * @param {Function} [props.onToast]
 */
const AiFixPanel = ({
  mode = 'fix',
  code,
  finding,
  findings = [],
  language,
  dialect,
  scannerMode = 'code',
  fileName,
  onApplyFix,
  onToast,
  compact = false,
}) => {
  const [hasKey, setHasKey] = useState(() => hasGeminiKey());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    setHasKey(hasGeminiKey());
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      if (mode === 'fix') {
        const fix = await askGeminiForFix({
          code,
          finding,
          language,
          mode: scannerMode,
          dialect,
        });
        setResult(fix);
        onToast?.('Gemini suggested a fix.', 'success');
      } else {
        const plan = await askGeminiForPlan({
          code,
          findings,
          language,
          mode: scannerMode,
          dialect,
        });
        setResult(plan);
        onToast?.('Gemini built a fix plan.', 'success');
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [mode, code, finding, findings, language, scannerMode, dialect, onToast]);

  const downloadFixedSource = useCallback(() => {
    const fixedCode = String(result?.after || '').trim();
    if (!fixedCode) {
      onToast?.('The fix did not include a complete corrected file.', 'warning');
      return;
    }

    try {
      const downloadName = buildFixedFileName(
        fileName,
        `scanned-source.${languageExtension(language, scannerMode)}`,
      );
      downloadTextFile({
        content: fixedCode,
        fileName: downloadName,
        mimeType: sourceMimeType(language, scannerMode),
      });
      onToast?.(`${downloadName} downloaded`, 'success');
    } catch (error) {
      onToast?.(`Could not download the fixed file: ${error?.message || String(error)}`, 'error');
    }
  }, [result?.after, fileName, language, scannerMode, onToast]);

  // ---- No key yet -----------------------------------------------------
  if (!hasKey) {
    return (
      <KeyForm
        compact={compact}
        onSaved={() => {
          setHasKey(true);
          // Straight into the answer — the user just told us they want it.
          setTimeout(run, 60);
        }}
      />
    );
  }

  // ---- Plan mode ------------------------------------------------------
  if (mode === 'plan') {
    return (
      <div className="space-y-3">
        {!result && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Gemini is thinking…' : 'Get AI fix plan with Gemini'}
            </button>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Prioritised by what an attacker would exploit first.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-red-700 dark:text-red-300">Gemini could not help</p>
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 break-words leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-500/10 dark:to-fuchsia-500/10 border border-violet-200/70 dark:border-violet-500/30 p-2.5 rounded-xl">
              {result.summary}
            </p>

            {(result.priorities || []).map((p, i) => (
              <div
                key={`${p.id}-${i}`}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/50 p-3 space-y-2"
              >
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-mono font-bold">
                    {p.id || `#${i + 1}`}
                  </span>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {p.title || 'Untitled issue'}
                  </span>
                  {p.severity && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                      {p.severity}
                    </span>
                  )}
                  {p.effort && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                      {p.effort}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{p.action}</p>
                {p.codeExample && (
                  <CodeBlock value={p.codeExample} label="Fixed example" tone="success" />
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Regenerate plan
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- Fix mode -------------------------------------------------------
  return (
    <div className="space-y-3">
      {!result && (
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Gemini is thinking…' : 'Ask Gemini for a fix'}
        </button>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-red-700 dark:text-red-300">Gemini could not help</p>
            <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 break-words leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-500/10 dark:to-fuchsia-500/10 border border-violet-200/70 dark:border-violet-500/30 p-2.5 rounded-xl">
            {result.summary}
          </p>

          {result.why && (
            <div>
              <SectionLabel icon={Info}>Why it matters</SectionLabel>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{result.why}</p>
            </div>
          )}

          {(result.before || result.after) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <CodeBlock value={result.before} label="Before — vulnerable" tone="danger" />
              <CodeBlock value={result.after} label="After — fixed" tone="success" />
            </div>
          )}

          {result.after && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadFixedSource}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                title="Download the corrected source file"
              >
                <Download className="w-3.5 h-3.5" /> Download fixed file
              </button>
              {onApplyFix && (
                <button
                  type="button"
                  onClick={() => onApplyFix(result.after)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  title="Apply the corrected code to the scanner editor"
                >
                  <Check className="w-3.5 h-3.5" /> Apply to editor
                </button>
              )}
            </div>
          )}

          {result.steps?.length > 0 && (
            <div>
              <SectionLabel icon={Wand2}>Apply these changes</SectionLabel>
              <ol className="list-decimal list-inside space-y-1 text-xs text-slate-700 dark:text-slate-300 pl-1 marker:text-violet-500 marker:font-bold">
                {result.steps.map((s, i) => (
                  <li key={i} className="leading-relaxed">{s}</li>
                ))}
              </ol>
            </div>
          )}

          {result.checklist?.length > 0 && (
            <div>
              <SectionLabel icon={ListChecks}>Validate after the fix</SectionLabel>
              <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                {result.checklist.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 leading-relaxed">
                    <input
                      type="checkbox"
                      aria-label={`Validation step: ${c}`}
                      className="mt-0.5 w-3.5 h-3.5 accent-emerald-500 flex-shrink-0"
                    />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Try again
          </button>
        </div>
      )}
    </div>
  );
};

export default AiFixPanel;
