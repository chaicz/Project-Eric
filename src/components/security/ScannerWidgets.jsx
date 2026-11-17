import React, { useMemo, useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Database,
  Layout,
  Settings,
  Package,
  UserX,
  FileCode,
  FileText,
  Globe,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Hash,
  ChevronDown,
  ChevronUp,
  Terminal,
  BookOpen,
  Wand2,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  Lightbulb,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Scanner widgets — the pieces that make the scanner feel like a workbench
// rather than a form.
//
// Everything here is presentational. The page owns the scan state and the
// data; these components only render it.
// ---------------------------------------------------------------------------

export const CATEGORY_ICONS = {
  A01: ShieldAlert,
  A02: Lock,
  A03: Database,
  A04: Layout,
  A05: Settings,
  A06: Package,
  A07: UserX,
  A08: FileCode,
  A09: FileText,
  A10: Globe,
};

export const CATEGORY_GRADIENTS = {
  A01: 'from-rose-500 to-orange-500',
  A02: 'from-amber-500 to-yellow-500',
  A03: 'from-red-500 to-pink-500',
  A04: 'from-violet-500 to-purple-500',
  A05: 'from-slate-500 to-slate-700',
  A06: 'from-orange-500 to-amber-500',
  A07: 'from-pink-500 to-rose-500',
  A08: 'from-cyan-500 to-blue-500',
  A09: 'from-indigo-500 to-blue-500',
  A10: 'from-emerald-500 to-teal-500',
};

export const STATUS_STYLE = {
  pass: {
    label: 'Pass',
    text: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-400/30',
    Icon: CheckCircle2,
  },
  warning: {
    label: 'Warning',
    text: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-200 dark:border-amber-500/30',
    dot: 'bg-amber-500',
    ring: 'ring-amber-400/30',
    Icon: AlertTriangle,
  },
  fail: {
    label: 'Fail',
    text: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-500/10',
    border: 'border-red-200 dark:border-red-500/30',
    dot: 'bg-red-500',
    ring: 'ring-red-400/30',
    Icon: XCircle,
  },
};

export const SEVERITY_STYLE = {
  critical: { label: 'Critical', pill: 'bg-red-500 text-white', dot: 'bg-red-500' },
  high: { label: 'High', pill: 'bg-orange-500 text-white', dot: 'bg-orange-500' },
  medium: { label: 'Medium', pill: 'bg-amber-500 text-white', dot: 'bg-amber-500' },
  low: { label: 'Low', pill: 'bg-blue-500 text-white', dot: 'bg-blue-500' },
  info: { label: 'Info', pill: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200', dot: 'bg-slate-400' },
};

export const severityStyle = (severity) =>
  SEVERITY_STYLE[String(severity || '').toLowerCase()] || SEVERITY_STYLE.info;

export const statusStyle = (status) => STATUS_STYLE[status] || STATUS_STYLE.pass;

// ---------------------------------------------------------------------------
// Detector matrix — all ten categories as a compact grid.
//
// This is the "what did the scan check" view. Each cell is a live status
// indicator: grey while the detector has not run, coloured once it has.
// ---------------------------------------------------------------------------
export const DetectorMatrix = ({ findings = [], onSelect, activeId = null, running = false }) => {
  const byId = useMemo(() => {
    const map = {};
    findings.forEach((f) => {
      if (f?.id) map[f.id] = f;
    });
    return map;
  }, [findings]);

  const ids = Object.keys(CATEGORY_ICONS);

  return (
    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
      {ids.map((id) => {
        const finding = byId[id];
        const Icon = CATEGORY_ICONS[id];
        const hasResult = Boolean(finding);
        const style = hasResult ? statusStyle(finding.status) : null;
        const isActive = activeId === id;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect?.(id)}
            title={
              hasResult
                ? `${id} — ${style.label}${finding.count ? ` · ${finding.count} hit${finding.count === 1 ? '' : 's'}` : ''}`
                : `${id} — ${running ? 'running…' : 'not checked yet'}`
            }
            aria-label={
              hasResult
                ? `${id}: ${style.label}`
                : `${id}: not checked yet`
            }
            className={`relative aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all duration-300 ${
              hasResult
                ? `${style.bg} ${style.border} hover:-translate-y-0.5 hover:shadow-md cursor-pointer`
                : 'bg-slate-50 dark:bg-slate-800/40 border-dashed border-slate-200 dark:border-slate-700 cursor-default'
            } ${isActive ? 'ring-2 ring-blue-400/70' : ''}`}
          >
            <Icon
              className={`w-4 h-4 ${
                hasResult ? style.text : 'text-slate-300 dark:text-slate-600'
              }`}
            />
            <span
              className={`font-mono text-[9px] font-bold ${
                hasResult ? style.text : 'text-slate-400 dark:text-slate-600'
              }`}
            >
              {id}
            </span>
            {hasResult && finding.count > 0 && (
              <span
                className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center ${
                  finding.status === 'fail' ? 'bg-red-500' : 'bg-amber-500'
                }`}
              >
                {finding.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Score ring — the headline number of a scan.
//
// The ring is drawn as two half arcs so the score can be read as a gauge
// rather than a pie.
// ---------------------------------------------------------------------------
export const ScoreRing = ({ score = 0, size = 160, label = 'Secure score' }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const stroke = 10;
  const radius = size / 2 - stroke / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  // The colour follows the same score bands the dashboard uses.
  const color = clamped >= 85 ? '#10b981' : clamped >= 65 ? '#f59e0b' : '#ef4444';
  const trackColor = 'rgba(148,163,184,0.18)';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (clamped / 100) * circumference}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1), stroke 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold tabular-nums leading-none"
          style={{ color, transition: 'color 0.4s ease' }}
        >
          {clamped}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-1">
          {label}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Severity meter — the per-severity breakdown of a scan's issues.
// ---------------------------------------------------------------------------
export const SeverityMeter = ({ counts = {} }) => {
  const order = ['critical', 'high', 'medium', 'low'];
  const total = order.reduce((sum, key) => sum + (counts[key] || 0), 0);

  if (total === 0) {
    return (
      <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center py-3">
        No issues were raised by this scan.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        {order.map((key) => {
          const count = counts[key] || 0;
          if (count === 0) return null;
          const style = severityStyle(key);
          return (
            <div
              key={key}
              className={`${style.dot} transition-all duration-500`}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${style.label}: ${count}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {order.map((key) => {
          const count = counts[key] || 0;
          const style = severityStyle(key);
          return (
            <div
              key={key}
              className="text-center px-1 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/50"
              title={`${style.label}: ${count}`}
            >
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                {count}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {style.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Code chip — a copyable snippet panel.
//
// Used for the before/after pair inside an expanded finding.
// ---------------------------------------------------------------------------
export const CodeChip = ({ value, label, tone = 'slate', onCopy }) => {
  const [copied, setCopied] = useState(false);
  const tones = {
    danger:  { wrap: 'border-red-300/70 dark:border-red-500/40',    head: 'bg-red-100/80 dark:bg-red-500/20 text-red-700 dark:text-red-200',    body: 'bg-red-950/40 text-red-100 border-red-900/60' },
    success: { wrap: 'border-emerald-300/70 dark:border-emerald-500/40', head: 'bg-emerald-100/80 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-200', body: 'bg-emerald-950/40 text-emerald-100 border-emerald-900/60' },
    slate:   { wrap: 'border-slate-300/70 dark:border-slate-700/60',  head: 'bg-slate-200/80 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200', body: 'bg-slate-950 text-slate-100 border-slate-800' },
  };
  const t = tones[tone] || tones.slate;

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopy?.(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Fallback: select-and-copy through a throwaway textarea.
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        onCopy?.(true);
        setTimeout(() => setCopied(false), 1400);
      } catch {
        onCopy?.(false);
      }
    }
  };

  return (
    <div className={`rounded-xl border ${t.wrap} overflow-hidden`}>
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
      <pre className={`m-0 px-3 py-2.5 text-[11px] leading-relaxed font-mono whitespace-pre overflow-auto max-h-48 border-t ${t.body}`}>
        {value || (
          <span className="text-slate-500 italic">
            No snippet available for this category — follow the change list below.
          </span>
        )}
      </pre>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Improvement block — the "how to fix this" panel.
//
// Everything it renders comes from the detector's own suggestion object, so
// the guidance stays in step with the rules that produced the finding.
// ---------------------------------------------------------------------------
export const ImprovementBlock = ({ suggestion, onToast }) => {
  if (!suggestion) return null;

  const handleCopyToast = (ok) => {
    if (ok && onToast) onToast('Suggestion copied — paste it into your editor as a reference.', 'success');
    if (!ok && onToast) onToast('Copy failed — your browser may have blocked clipboard access.', 'warning');
  };

  return (
    <div className="pt-2">
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
        <Lightbulb className="w-3 h-3" /> How to improve
      </p>

      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-3 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-500/10 dark:to-yellow-500/10 border border-amber-200/70 dark:border-amber-500/30 p-2.5 rounded-xl">
        {suggestion.summary}
      </p>

      {(suggestion.before || suggestion.after) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
          <CodeChip
            value={suggestion.before}
            label={suggestion.beforeLabel || 'Before'}
            tone="danger"
            onCopy={handleCopyToast}
          />
          <CodeChip
            value={suggestion.after}
            label={suggestion.afterLabel || 'After — copy this as a reference'}
            tone="success"
            onCopy={handleCopyToast}
          />
        </div>
      )}

      {Array.isArray(suggestion.changes) && suggestion.changes.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
            <Wand2 className="w-3 h-3" /> Apply these changes
          </p>
          <ol className="list-decimal list-inside space-y-1 text-xs text-slate-700 dark:text-slate-300 pl-1 marker:text-blue-500 marker:font-bold">
            {suggestion.changes.map((c, i) => (
              <li key={i} className="leading-relaxed">
                {c}
              </li>
            ))}
          </ol>
        </div>
      )}

      {Array.isArray(suggestion.checklist) && suggestion.checklist.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> Validate after the fix
          </p>
          <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
            {suggestion.checklist.map((c, i) => (
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

      {Array.isArray(suggestion.refs) && suggestion.refs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestion.refs.map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-200/70 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
            >
              <BookOpen className="w-3 h-3" /> {r.title} <ArrowRight className="w-3 h-3" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Category card — one OWASP category and everything the detector found.
//
// The card has three levels of detail:
//   collapsed  → status, severity, hit count, one-line description
//   expanded   → evidence, remediation, the before/after reference
// ---------------------------------------------------------------------------
export const CategoryCard = ({
  finding,
  expanded,
  onToggle,
  onToast,
  code,
  language,
  dialect,
  mode,
  aiPanel,
}) => {
  const Icon = CATEGORY_ICONS[finding.id] || Shield;
  const status = statusStyle(finding.status);
  const StatusIcon = status.Icon;
  const sev = severityStyle(finding.severity);
  const gradient = CATEGORY_GRADIENTS[finding.id] || 'from-slate-400 to-slate-600';

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-white/80 dark:bg-slate-900/70 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${status.border} ${status.bg}`}
    >
      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${gradient} opacity-15 blur-2xl`} />

      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 flex items-start gap-3"
        aria-expanded={expanded}
      >
        <div className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
          <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
            <StatusIcon className={`w-3 h-3 ${status.text}`} />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-[10px] font-bold text-slate-400">{finding.id}</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${status.dot} text-white`}
            >
              <StatusIcon className="w-3 h-3" />
              {status.label}
            </span>
            {finding.status !== 'pass' && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${sev.pill}`}
              >
                {sev.label}
              </span>
            )}
            {finding.count > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/70 dark:bg-slate-800/80 text-[10px] font-mono font-semibold text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700/60">
                <Hash className="w-3 h-3" /> {finding.count}
              </span>
            )}
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{finding.name}</h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed line-clamp-2">
            {finding.description}
          </p>
        </div>

        <div className="flex-shrink-0 self-center text-slate-400 group-hover:text-slate-700 transition-colors">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200/70 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40 animate-slide-up">
          <div className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">CWE</p>
                <code className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200">
                  {finding.cwe}
                </code>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">Count</p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {`${finding.count} ${finding.count === 1 ? 'issue' : 'issues'}`}
                </p>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" /> Description
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{finding.description}</p>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
                <Wand2 className="w-3 h-3" /> Remediation
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60 p-2.5 rounded-xl leading-relaxed">
                {finding.remediation}
              </p>
            </div>

            {finding.evidence && finding.evidence.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <Terminal className="w-3 h-3" /> Evidence ({finding.evidence.length})
                </p>
                <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
                  {finding.evidence.map((ev, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 text-emerald-300 font-mono text-[11px] border border-slate-800"
                    >
                      {ev.line > 0 && (
                        <span className="text-slate-500 select-none flex-shrink-0">{ev.line}</span>
                      )}
                      <span className="break-all whitespace-pre-wrap">{ev.snippet}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ImprovementBlock suggestion={finding.suggestion} onToast={onToast} />

            {/* The AI fix advisor is injected by the page, so this module
                stays independent of the Gemini service. */}
            {aiPanel}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Scan comparison — the previous run next to the current one.
//
// This answers the question the score alone cannot: did the last change
// make things better or worse?
// ---------------------------------------------------------------------------
export const ScanComparison = ({ current, previous }) => {
  if (!current || !previous) return null;

  const delta = current.score - previous.score;
  const issueDelta = (current.totalIssues || 0) - (previous.totalIssues || 0);

  const better = delta > 0 || issueDelta < 0;
  const worse = delta < 0 || issueDelta > 0;

  const tone = better
    ? { text: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/30' }
    : worse
    ? { text: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-200 dark:border-rose-500/30' }
    : { text: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800/50', border: 'border-slate-200 dark:border-slate-700/60' };

  const verdict = better ? 'Improved' : worse ? 'Regressed' : 'Unchanged';

  return (
    <div className={`rounded-2xl border p-3.5 ${tone.bg} ${tone.border}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
          Compared to the previous run
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/70 dark:bg-slate-900/50 ${tone.text}`}>
          {verdict}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Score</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {previous.score} → {current.score}
            <span className={`ml-1.5 text-xs ${tone.text}`}>
              {delta > 0 ? '+' : ''}
              {delta}
            </span>
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Issues</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {previous.totalIssues ?? '—'} → {current.totalIssues ?? '—'}
            {issueDelta !== 0 && (
              <span className={`ml-1.5 text-xs ${tone.text}`}>
                {issueDelta > 0 ? '+' : ''}
                {issueDelta}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Keyboard shortcut list — shown in the scanner's help popover.
// ---------------------------------------------------------------------------
export const SHORTCUTS = [
  { keys: ['⌘', 'Enter'], label: 'Run the scan' },
  { keys: ['⌘', 'K'], label: 'Open the scanner search' },
  { keys: ['⌘', 'E'], label: 'Export the results as JSON' },
  { keys: ['⌘', '⇧', 'E'], label: 'Export the results as CSV' },
  { keys: ['⌘', 'P'], label: 'Generate the PDF report' },
  { keys: ['⌘', 'K', 'U'], label: 'Upload a source file' },
  { keys: ['Esc'], label: 'Clear the editor' },
];

export const ShortcutHint = ({ shortcuts = SHORTCUTS }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/50 p-3">
    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2 flex items-center gap-1.5">
      <Sparkles className="w-3 h-3" /> Keyboard shortcuts
    </p>
    <ul className="space-y-1.5">
      {shortcuts.map((s) => (
        <li key={s.label} className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-600 dark:text-slate-300">{s.label}</span>
          <span className="flex items-center gap-0.5 flex-shrink-0">
            {s.keys.map((k) => (
              <kbd
                key={k}
                className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-mono rounded"
              >
                {k}
              </kbd>
            ))}
          </span>
        </li>
      ))}
    </ul>
  </div>
);

export default DetectorMatrix;
