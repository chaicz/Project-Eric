import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Eye,
  FileCode,
  Fingerprint,
  Flame,
  Gauge,
  Layers,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Security Pro widgets.
//
// The building blocks for the rebuilt Security workspace. These are the
// pieces that did not exist on the original page: the original Security page
// was a flat list of findings with a severity filter, and the analytical
// layer lived only on the Dashboard.
//
// The ideas here:
//   — Every number has a context next to it — a share, a trend, a bar —
//     so a bare count is never the whole story.
//   — The findings list is a table, not a stack of cards, because the
//     user is comparing rows (severity, category, CWE, age).
//   — A panel with no data says so instead of rendering a skeleton or
//     a zero that looks like a real measurement.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Severity scale — the one place a severity's colour is decided.
//
// Every widget that renders a severity reads it from here, so the whole
// page agrees on what "critical" looks like.
// ---------------------------------------------------------------------------
export const SEVERITY_SCALE = {
  critical: {
    label: 'Critical',
    text: 'text-rose-600 dark:text-rose-400',
    textSoft: 'text-rose-500',
    chip: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    bar: 'bg-rose-500',
    solid: 'bg-rose-600 text-white',
    ring: 'ring-rose-500/30',
    border: 'border-rose-200 dark:border-rose-500/30',
    weight: 4,
  },
  high: {
    label: 'High',
    text: 'text-orange-600 dark:text-orange-400',
    textSoft: 'text-orange-500',
    chip: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
    bar: 'bg-orange-500',
    solid: 'bg-orange-500 text-white',
    ring: 'ring-orange-500/30',
    border: 'border-orange-200 dark:border-orange-500/30',
    weight: 3,
  },
  medium: {
    label: 'Medium',
    text: 'text-amber-600 dark:text-amber-400',
    textSoft: 'text-amber-500',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    bar: 'bg-amber-500',
    solid: 'bg-amber-500 text-white',
    ring: 'ring-amber-500/30',
    border: 'border-amber-200 dark:border-amber-500/30',
    weight: 2,
  },
  low: {
    label: 'Low',
    text: 'text-blue-600 dark:text-blue-400',
    textSoft: 'text-blue-500',
    chip: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    bar: 'bg-blue-500',
    solid: 'bg-blue-500 text-white',
    ring: 'ring-blue-500/30',
    border: 'border-blue-200 dark:border-blue-500/30',
    weight: 1,
  },
  info: {
    label: 'Info',
    text: 'text-slate-600 dark:text-slate-400',
    textSoft: 'text-slate-500',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    bar: 'bg-slate-400',
    solid: 'bg-slate-500 text-white',
    ring: 'ring-slate-400/30',
    border: 'border-slate-200 dark:border-slate-700',
    weight: 0,
  },
};

export const severityScale = (key) => SEVERITY_SCALE[key] || SEVERITY_SCALE.info;

// ---------------------------------------------------------------------------
// Triage order — the findings, ranked by what to fix first.
//
// The ranking is a real priority score, not the order the API returned.
// Severity is the biggest factor, but a fresh critical outranks an old
// one, and an already-fixed finding drops out entirely.
// ---------------------------------------------------------------------------
export const triageScore = (finding) => {
  const scale = severityScale(finding.severity);
  const cvss = Number(finding.cvss);
  const base = scale.weight * 25;
  // CVSS refines the severity bucket rather than replacing it.
  const cvssBonus = Number.isFinite(cvss) ? (cvss / 10) * 15 : 0;
  // A finding discovered long ago is likely still present; a fresh one is
  // probably what the user just wrote.
  const ageDays = finding.discoveredAt
    ? Math.max(0, (Date.now() - new Date(finding.discoveredAt).getTime()) / 86400000)
    : 0;
  const recencyBonus = Math.max(0, 20 - ageDays * 2);
  return base + cvssBonus + recencyBonus;
};

export const TriageOrder = ({ findings = [], onSelect, activeId = null, fixedIds = [] }) => {
  const ranked = useMemo(() => {
    const fixed = new Set(fixedIds);
    return findings
      .filter((f) => !fixed.has(f.id) && f.status !== 'fixed')
      .map((f) => ({ ...f, _priority: triageScore(f) }))
      .sort((a, b) => b._priority - a._priority);
  }, [findings, fixedIds]);

  if (!ranked.length) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <ShieldCheck className="w-7 h-7 text-emerald-500 mb-2" />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Nothing to triage — every finding is resolved.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-1.5">
      {ranked.map((f, i) => {
        const scale = severityScale(f.severity);
        const isActive = activeId === f.id;
        return (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onSelect?.(f)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all duration-200 ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-300 dark:ring-blue-500/40'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums flex-shrink-0">
                {i + 1}
              </span>

              <span className={`w-1.5 h-9 rounded-full ${scale.bar} flex-shrink-0`} />

              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {f.title}
                </span>
                <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                  {f.category || f.owaspId || 'Uncategorised'}
                  {f.cweId ? ` 路 ${f.cweId}` : ''}
                  {f.location ? ` 路 ${f.location}` : ''}
                </span>
              </span>

              <span className="flex items-center gap-2 flex-shrink-0">
                {Number.isFinite(Number(f.cvss)) && (
                  <span className="text-[10px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
                    {Number(f.cvss).toFixed(1)}
                  </span>
                )}
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${scale.chip}`}>
                  {scale.label}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
};

// ---------------------------------------------------------------------------
// Remediation panel — the fix recipe for one finding.
//
// The remediation text is the important part, but on its own it is a wall
// of prose. This wraps it with the CWE, the CVSS, the location and the
// actions so the answer to "what do I do" is on one screen.
// ---------------------------------------------------------------------------
export const RemediationBrief = ({
  finding,
  actions = [],
  onMarkFixed,
  onOpenIde,
  fixed = false,
  busy = false,
}) => {
  if (!finding) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 px-4">
        <Fingerprint className="w-7 h-7 text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[26ch] leading-relaxed">
          Pick a finding from the list to see its remediation steps.
        </p>
      </div>
    );
  }

  const scale = severityScale(finding.severity);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span
          className={`w-10 h-10 rounded-xl ${scale.solid} flex items-center justify-center flex-shrink-0 shadow-sm`}
        >
          <Bug className="w-4.5 h-4.5 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">
            {finding.title}
          </h4>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${scale.chip}`}>
              {scale.label}
            </span>
            {finding.cweId && (
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                {finding.cweId}
              </span>
            )}
            {finding.owaspId && (
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                {finding.owaspId}
              </span>
            )}
            {finding.category && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                {finding.category}
              </span>
            )}
          </div>
        </div>
      </div>

      {finding.location && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
          <FileCode className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <code className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
            {finding.location}
          </code>
        </div>
      )}

      {finding.description && (
        <div>
          <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
            What is wrong
          </h5>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {finding.description}
          </p>
        </div>
      )}

      {finding.remediation && (
        <div>
          <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
            How to fix it
          </h5>
          <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/5 border border-emerald-200/70 dark:border-emerald-500/20">
            <p className="text-xs text-emerald-900 dark:text-emerald-200/90 leading-relaxed whitespace-pre-line">
              {finding.remediation}
            </p>
          </div>
        </div>
      )}

      {Number.isFinite(Number(finding.cvss)) && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              CVSS
            </h5>
            <span className={`text-xs font-bold tabular-nums ${scale.text}`}>
              {Number(finding.cvss).toFixed(1)} / 10
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${scale.bar} transition-all duration-700`}
              style={{ width: `${Math.max(0, Math.min(100, Number(finding.cvss) * 10))}%` }}
            />
          </div>
        </div>
      )}

      {actions.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {actions.map((a) => (
            <div key={a.label} className="flex items-start gap-2 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
              <span className="text-slate-600 dark:text-slate-300 leading-relaxed">{a.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        {onMarkFixed && (
          <button
            type="button"
            onClick={() => onMarkFixed(finding.id)}
            disabled={fixed || busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {fixed ? 'Resolved' : 'Mark resolved'}
          </button>
        )}
        {onOpenIde && (
          <button
            type="button"
            onClick={() => onOpenIde(finding)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Open in IDE
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Findings table — the dense list of everything open.
//
// A table, because the user compares rows: which category, how severe,
// which CWE, how old. Cards made each row a paragraph.
// ---------------------------------------------------------------------------
export const FindingsTable = ({
  findings = [],
  selectedId = null,
  onSelect,
  fixedIds = [],
  emptyState = null,
}) => {
  const fixed = new Set(fixedIds);
  const rows = findings.filter((f) => !fixed.has(f.id));

  if (!rows.length) {
    return emptyState;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Finding
            </th>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 w-24">
              Severity
            </th>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 hidden md:table-cell w-32">
              Category
            </th>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 hidden lg:table-cell w-28">
              CWE
            </th>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 hidden sm:table-cell w-24 text-right">
              CVSS
            </th>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 hidden xl:table-cell w-24 text-right">
              Age
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
          {rows.map((f) => {
            const scale = severityScale(f.severity);
            const isSelected = selectedId === f.id;
            const age = f.discoveredAt
              ? Math.max(
                  0,
                  Math.floor((Date.now() - new Date(f.discoveredAt).getTime()) / 86400000)
                )
              : null;

            return (
              <tr
                key={f.id}
                onClick={() => onSelect?.(f)}
                className={`cursor-pointer transition-colors duration-150 ${
                  isSelected
                    ? 'bg-blue-50/70 dark:bg-blue-500/10'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-1.5 h-8 rounded-full ${scale.bar} flex-shrink-0`} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[42ch]">
                        {f.title}
                      </div>
                      {f.location && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[52ch] mt-0.5 font-mono">
                          {f.location}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${scale.chip}`}
                  >
                    {scale.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell">
                  <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate block max-w-[20ch]">
                    {f.category || '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell">
                  <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                    {f.cweId || f.cwe || '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 hidden sm:table-cell text-right">
                  <span className={`text-xs font-bold tabular-nums ${scale.text}`}>
                    {Number.isFinite(Number(f.cvss)) ? Number(f.cvss).toFixed(1) : '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 hidden xl:table-cell text-right">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                    {age === null ? '—' : age === 0 ? 'today' : `${age}d`}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Finding age — how long each finding has been open.
//
// Age matters for triage: a finding that has been open for a month is
// either ignored or impossible. Both are worth seeing.
// ---------------------------------------------------------------------------
export const AgeBuckets = ({ findings = [] }) => {
  const buckets = useMemo(() => {
    const b = { today: 0, week: 0, month: 0, older: 0 };
    for (const f of findings) {
      if (!f.discoveredAt) continue;
      const days = Math.max(
        0,
        Math.floor((Date.now() - new Date(f.discoveredAt).getTime()) / 86400000)
      );
      if (days === 0) b.today += 1;
      else if (days < 7) b.week += 1;
      else if (days < 30) b.month += 1;
      else b.older += 1;
    }
    return b;
  }, [findings]);

  const total = buckets.today + buckets.week + buckets.month + buckets.older;
  const rows = [
    { key: 'today', label: 'Today', count: buckets.today, color: 'bg-emerald-500' },
    { key: 'week', label: 'This week', count: buckets.week, color: 'bg-blue-500' },
    { key: 'month', label: 'This month', count: buckets.month, color: 'bg-amber-500' },
    { key: 'older', label: 'Over a month', count: buckets.older, color: 'bg-rose-500' },
  ];

  if (!total) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
        No age information for these findings.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const pct = total ? Math.round((r.count / total) * 100) : 0;
        return (
          <div key={r.key} className="flex items-center gap-2.5">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 w-24 flex-shrink-0">
              {r.label}
            </span>
            <div className="flex-1 h-4 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-md transition-all duration-700 ${r.color}`}
                style={{ width: `${Math.max(r.count ? 8 : 0, pct)}%` }}
              />
            </div>
            <span className="text-[11px] font-bold tabular-nums text-slate-500 dark:text-slate-400 w-8 text-right flex-shrink-0">
              {r.count}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Threat feed — the live list of failing findings.
//
// Each entry carries the indicators and affected components the expanded
// detail card needs, so the feed is readable without expanding anything.
// ---------------------------------------------------------------------------
export const ThreatFeed = ({
  threats = [],
  selectedId = null,
  onSelect,
  mitigatedIds = [],
  emptyState = null,
}) => {
  const mitigated = new Set(mitigatedIds);
  const rows = threats.filter((t) => !mitigated.has(t.id));

  if (!rows.length) {
    return emptyState;
  }

  return (
    <div className="space-y-2">
      {rows.map((t) => {
        const scale = severityScale(t.severity);
        const isSelected = selectedId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect?.(t)}
            className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
              isSelected
                ? `${scale.border} ring-1 ${scale.ring} bg-white dark:bg-slate-900`
                : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-white/60 dark:bg-slate-900/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`w-8 h-8 rounded-lg ${scale.solid} flex items-center justify-center flex-shrink-0 mt-0.5`}
              >
                <AlertTriangle className="w-4 h-4 text-white" />
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {t.title}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${scale.chip}`}>
                    {scale.label}
                  </span>
                  {t.cwe && (
                    <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500">
                      {t.cwe}
                    </span>
                  )}
                </div>

                {t.description && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>
                )}

                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 flex-wrap">
                  {t.timestamp && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(t.timestamp).toLocaleString()}
                    </span>
                  )}
                  {Array.isArray(t.affectedComponents) && t.affectedComponents.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {t.affectedComponents.length} component
                      {t.affectedComponents.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {Array.isArray(t.indicators) && t.indicators.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Radar className="w-3 h-3" />
                      {t.indicators.length} indicator
                      {t.indicators.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0 mt-1" />
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Threat detail — the expanded card for one threat.
//
// Kept separate from the feed so the feed stays a scannable list and the
// detail has room for the mitigation plan.
// ---------------------------------------------------------------------------
export const ThreatDetail = ({
  threat,
  onApplyFix,
  onOpenIde,
  busy = false,
  mitigated = false,
}) => {
  if (!threat) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 px-4">
        <Radar className="w-7 h-7 text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[26ch] leading-relaxed">
          Select a threat to see its indicators and mitigation plan.
        </p>
      </div>
    );
  }

  const scale = severityScale(threat.severity);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-xl ${scale.solid} flex items-center justify-center flex-shrink-0`}>
          <AlertTriangle className="w-4.5 h-4.5 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">
            {threat.title}
          </h4>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${scale.chip}`}>
              {scale.label}
            </span>
            {threat.cwe && (
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                {threat.cwe}
              </span>
            )}
            {threat.source && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">{threat.source}</span>
            )}
          </div>
        </div>
      </div>

      {threat.description && (
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {threat.description}
        </p>
      )}

      {Array.isArray(threat.affectedComponents) && threat.affectedComponents.length > 0 && (
        <div>
          <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
            Affected components
          </h5>
          <div className="space-y-1">
            {threat.affectedComponents.map((c, i) => (
              <div key={`${c}-${i}`} className="flex items-center gap-2">
                <Bug className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                <code className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 truncate">
                  {c}
                </code>
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(threat.indicators) && threat.indicators.length > 0 && (
        <div>
          <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
            Indicators
          </h5>
          <div className="space-y-1">
            {threat.indicators.map((ind, i) => (
              <div key={`${ind}-${i}`} className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <code className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 truncate">
                  {ind}
                </code>
              </div>
            ))}
          </div>
        </div>
      )}

      {threat.remediation && (
        <div>
          <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
            Mitigation
          </h5>
          <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/5 border border-emerald-200/70 dark:border-emerald-500/20">
            <p className="text-xs text-emerald-900 dark:text-emerald-200/90 leading-relaxed whitespace-pre-line">
              {threat.remediation}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        {onApplyFix && (
          <button
            type="button"
            onClick={() => onApplyFix(threat.id)}
            disabled={busy || mitigated}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {mitigated ? 'Mitigated' : busy ? 'Applying…' : 'Apply mitigation'}
          </button>
        )}
        {onOpenIde && (
          <button
            type="button"
            onClick={() => onOpenIde(threat)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Inspect
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Report cards — the generated documents.
//
// A card, not a table row, because a report is something the user opens,
// shares or exports as an object rather than a row they scan.
// ---------------------------------------------------------------------------
export const ReportCard = ({ report, onDownload, onPreview, onExportCsv, onShare, onDelete }) => {
  const score = report.score;
  const scoreScale = score === null || score === undefined
    ? null
    : score >= 85
    ? 'text-emerald-600 dark:text-emerald-400'
    : score >= 65
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-rose-600 dark:text-rose-400';

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:border-blue-200 dark:hover:border-blue-500/40 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
      <div className="absolute -top-14 -right-14 w-32 h-32 rounded-full bg-gradient-to-br from-violet-500/10 to-blue-500/10 blur-2xl pointer-events-none" />

      <div className="relative p-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-md">
            <FileCode className="w-4.5 h-4.5 text-white" />
          </span>

          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">
              {report.name}
            </h4>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 dark:text-slate-500 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {report.date}
              </span>
              <span>{report.size}</span>
              {score !== null && score !== undefined && (
                <span className={`font-bold tabular-nums ${scoreScale}`}>score {score}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Gauge className="w-3 h-3" />
              {report.findingCount ?? 0} categories
            </span>
            <span className="inline-flex items-center gap-1">
              <Flame className="w-3 h-3" />
              {report.totalIssues ?? 0} issues
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            {onPreview && (
              <button
                type="button"
                onClick={() => onPreview(report)}
                title="Preview"
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
            {onDownload && (
              <button
                type="button"
                onClick={() => onDownload(report)}
                title="Download"
                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {onExportCsv && (
              <button
                type="button"
                onClick={() => onExportCsv(report)}
                title="Export CSV"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
            )}
            {onShare && (
              <button
                type="button"
                onClick={() => onShare(report)}
                title="Share"
                className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(report)}
                title="Delete report"
                aria-label="Delete report"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Coverage radar — how much of each OWASP category was exercised.
//
// Every category is scored 0—100. A category that was never checked
// reads as a gap, which is the point: an unscanned category is not a
// clean category.
// ---------------------------------------------------------------------------
export const CoverageRadar = ({ coverage = [], size = 220 }) => {
  if (!coverage.length) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
        No coverage data yet. Run a scan to see it.
      </p>
    );
  }

  const center = size / 2;
  const radius = size / 2 - 30;
  const count = coverage.length;
  const angle = (i) => (Math.PI * 2 * i) / count - Math.PI / 2;

  const points = coverage
    .map((c, i) => {
      const pct = Math.max(0, Math.min(1, (c.pct || 0) / 100));
      return {
        ...c,
        x: center + Math.cos(angle(i)) * radius * pct,
        y: center + Math.sin(angle(i)) * radius * pct,
        lx: center + Math.cos(angle(i)) * (radius + 16),
        ly: center + Math.sin(angle(i)) * (radius + 16),
      };
    });

  const polygon = points.map((p) => `${p.x},${p.y}`).join(' ');
  const ring = (r) =>
    Array.from({ length: count }, (_, i) => {
      const a = angle(i);
      return `${center + Math.cos(a) * r},${center + Math.sin(a) * r}`;
    }).join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="OWASP coverage">
        {[0.33, 0.66, 1].map((f) => (
          <polygon
            key={f}
            points={ring(radius * f)}
            fill="none"
            className="stroke-slate-200 dark:stroke-slate-700"
            strokeWidth="1"
          />
        ))}
        {coverage.map((_, i) => {
          const a = angle(i);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={center + Math.cos(a) * radius}
              y2={center + Math.sin(a) * radius}
              className="stroke-slate-200 dark:stroke-slate-700"
              strokeWidth="1"
            />
          );
        })}

        <polygon
          points={polygon}
          className="fill-blue-500/25 stroke-blue-500"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {points.map((p) => (
          <circle
            key={p.id || p.name}
            cx={p.x}
            cy={p.y}
            r="3"
            className="fill-blue-600 dark:fill-blue-400"
          />
        ))}

        {points.map((p) => (
          <text
            key={`l-${p.id || p.name}`}
            x={p.lx}
            y={p.ly}
            className="fill-slate-400 dark:fill-slate-500"
            fontSize="9"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {p.id}
          </text>
        ))}
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Keyboard shortcuts — the map of what the user can press.
//
// This is the page's own affordance list. It is only useful if it is
// accurate, so the page passes the live handler map.
// ---------------------------------------------------------------------------
export const ShortcutLegend = ({ shortcuts = [] }) => {
  if (!shortcuts.length) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {shortcuts.map((s) => (
        <span key={s.keys} className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-[10px] font-bold text-slate-600 dark:text-slate-300">
            {s.keys}
          </kbd>
          {s.label}
        </span>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Filter bar — search plus the filter chips.
//
// The chips carry their own counts, so the user can see what each filter
// would give them before they press it.
// ---------------------------------------------------------------------------
export const FilterBar = ({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  chips = [],
  activeChip,
  onChipChange,
  extra = null,
}) => (
  <div className="flex flex-wrap items-center gap-2.5">
    <div className="relative flex-1 min-w-[180px]">
      <SearchIcon />
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 backdrop-blur text-xs text-slate-700 dark:text-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20 outline-none transition-all"
      />
    </div>

    {chips.length > 0 && (
      <div className="flex items-center gap-1.5 flex-wrap">
        {chips.map((c) => {
          const isActive = activeChip === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChipChange(c.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-sm'
                  : 'bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {c.label}
              {c.count !== undefined && (
                <span
                  className={`px-1 rounded text-[9px] font-bold tabular-nums ${
                    isActive ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {c.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    )}

    {extra}
  </div>
);

// A tiny local search glyph, so the bar does not depend on an icon import
// that could drift out of sync with the rest of the file.
const SearchIcon = () => (
  <svg
    className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

// ---------------------------------------------------------------------------
// Posture line — the one-sentence verdict.
//
// Deliberately not a banner. A full-width banner on every page pushes the
// content down; this sits in the header row and states the verdict next to
// the number that produced it.
// ---------------------------------------------------------------------------
export const PostureLine = ({ score = 0, findings = 0, criticals = 0, trend = 'stable' }) => {
  const band =
    score >= 85
      ? { label: 'Strong posture', tone: 'text-emerald-600 dark:text-emerald-400', Icon: ShieldCheck }
      : score >= 65
      ? { label: 'Needs attention', tone: 'text-amber-600 dark:text-amber-400', Icon: Target }
      : { label: 'Action required', tone: 'text-rose-600 dark:text-rose-400', Icon: Flame };

  const TrendIcon = trend === 'improving' ? TrendingUp : trend === 'worsening' ? TrendingDown : CircleDot;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold ${band.tone} bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/70`}
      >
        <band.Icon className="w-3.5 h-3.5" />
        {band.label}
      </span>

      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
          {score}
        </span>
        secure score
      </span>

      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <Activity className="w-3.5 h-3.5" />
        {findings} open
        {criticals > 0 && <span className="text-rose-600 dark:text-rose-400 font-semibold">路 {criticals} critical</span>}
      </span>

      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
        <TrendIcon className="w-3.5 h-3.5" />
        {trend}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stat strip — the compact headline row.
//
// Deliberately flat. The number is the point; a card border around each
// one would make the row look like five unrelated tiles.
// ---------------------------------------------------------------------------
export const StatStrip = ({ stats = [], className = '' }) => (
  <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-slate-100 dark:bg-slate-800 overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800 ${className}`}>
    {stats.map((s) => {
      const Icon = s.icon;
      const scale = s.severity ? severityScale(s.severity) : null;
      return (
        <button
          key={s.label}
          type="button"
          onClick={s.onClick}
          disabled={!s.onClick}
          className="group relative bg-white dark:bg-slate-900 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:cursor-default disabled:hover:bg-white dark:disabled:hover:bg-slate-900"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">
              {s.label}
            </span>
            {Icon && (
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${scale ? scale.text : 'text-slate-300 dark:text-slate-600'}`} />
            )}
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span
              className={`text-xl font-bold tabular-nums leading-none ${
                scale ? scale.text : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
            </span>
            {s.unit && (
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">{s.unit}</span>
            )}
          </div>
          {s.hint && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 truncate">{s.hint}</p>
          )}
        </button>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Empty state — the shared "nothing here" panel.
//
// One implementation, so every empty state on the page has the same
// shape and the same two escape hatches: do the thing, or learn about it.
// ---------------------------------------------------------------------------
export const InlineEmpty = ({
  icon: Icon = ShieldCheck,
  title,
  description,
  primaryCta,
  secondaryCta,
  tone = 'emerald',
}) => {
  const tones = {
    emerald: 'from-emerald-500 to-teal-500 bg-emerald-50 dark:bg-emerald-500/10',
    blue: 'from-blue-500 to-indigo-500 bg-blue-50 dark:bg-blue-500/10',
    rose: 'from-rose-500 to-red-500 bg-rose-50 dark:bg-rose-500/10',
  };
  const t = tones[tone] || tones.emerald;

  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
      <span className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${t.split(' ')[0]} ${t.split(' ')[1]} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-white" />
      </span>
      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h4>
      {description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[42ch] leading-relaxed">
          {description}
        </p>
      )}
      {(primaryCta || secondaryCta) && (
        <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
          {primaryCta && (
            <button
              type="button"
              onClick={primaryCta.onClick}
              className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors"
            >
              {primaryCta.label}
            </button>
          )}
          {secondaryCta && (
            <a
              href={secondaryCta.href}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {secondaryCta.label}
            </a>
          )}
        </div>
      )}
    </div>
  );
};
