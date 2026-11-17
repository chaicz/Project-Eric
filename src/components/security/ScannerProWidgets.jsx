import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Cpu,
  FileCode,
  Flame,
  Gauge,
  GitCompare,
  Hash,
  Lightbulb,
  Loader2,
  Radar,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  XCircle,
  Zap,
} from 'lucide-react';
import { CATEGORY_GRADIENTS, CATEGORY_ICONS, STATUS_STYLE, statusStyle } from './ScannerWidgets';

// ---------------------------------------------------------------------------
// Scanner Pro widgets.
//
// The rebuilt scanner is an IDE-style workbench, so these components are
// built around the idea of "instrument panels" rather than "cards". Each
// one shows one measurement clearly and says so when there is nothing to
// measure.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Scan status bar — the persistent strip above the editor.
//
// This is the scanner's centre of gravity: it always shows what mode is
// active, how much source is loaded, what the last score was, and what
// the detectors found.
// ---------------------------------------------------------------------------
export const ScanStatusBar = ({
  mode,
  languageLabel,
  lines = 0,
  chars = 0,
  running = false,
  progress = 0,
  score = null,
  summary = null,
  pass = 0,
  warn = 0,
  fail = 0,
}) => {
  const stats = [
    { label: 'Mode', value: mode === 'sql' ? 'SQL' : 'Code', Icon: FileCode, tone: 'text-blue-600 dark:text-blue-400' },
    { label: 'Language', value: languageLabel || '—', Icon: Cpu, tone: 'text-violet-600 dark:text-violet-400' },
    { label: 'Lines', value: lines.toLocaleString(), Icon: ScanLine, tone: 'text-slate-600 dark:text-slate-300' },
    { label: 'Size', value: `${(chars / 1024).toFixed(1)} KB`, Icon: Hash, tone: 'text-slate-600 dark:text-slate-300' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <s.Icon className={`w-3.5 h-3.5 ${s.tone}`} />
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
            {s.label}
          </span>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">{s.value}</span>
        </div>
      ))}

      <span className="hidden sm:block w-px h-4 bg-slate-200 dark:bg-slate-700" />

      {/* The live detector tally. */}
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold tabular-nums">
          <CheckCircle2 className="w-3 h-3" />
          {pass}
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold tabular-nums">
          <AlertTriangle className="w-3 h-3" />
          {warn}
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[10px] font-bold tabular-nums">
          <XCircle className="w-3 h-3" />
          {fail}
        </span>
      </div>

      {running ? (
        <div className="flex items-center gap-2 ml-auto min-w-[160px]">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
          <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-violet-500 rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-500 tabular-nums w-8 text-right">{progress}%</span>
        </div>
      ) : score !== null && score !== undefined ? (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
            Last score
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums border ${
              score >= 85
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                : score >= 65
                ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {score}/100
            {summary && <span className="font-medium opacity-75">· {summary}</span>}
          </span>
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Detector grid — all ten categories, expanded.
//
// The old matrix was a 10-cell strip of icons. This version is a proper
// instrument panel: every category gets a row with its icon, name, CWE
// reference, status and a progress bar for the finding count.
// ---------------------------------------------------------------------------
export const DetectorGrid = ({ findings = [], onSelect, activeId = null, running = false }) => {
  const byId = useMemo(() => {
    const map = {};
    findings.forEach((f) => {
      if (f?.id) map[f.id] = f;
    });
    return map;
  }, [findings]);

  const ids = Object.keys(CATEGORY_ICONS);

  const totals = useMemo(() => {
    const t = { pass: 0, warning: 0, fail: 0 };
    findings.forEach((f) => {
      if (f?.status in t) t[f.status] += 1;
    });
    return t;
  }, [findings]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { key: 'pass', label: 'Passed', Icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-400' },
          { key: 'warning', label: 'Warnings', Icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-400' },
          { key: 'fail', label: 'Failed', Icon: XCircle, tone: 'text-rose-600 dark:text-rose-400' },
        ].map((s) => (
          <div
            key={s.key}
            className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/40 px-2 py-1.5 text-center"
          >
            <s.Icon className={`w-3.5 h-3.5 mx-auto ${s.tone}`} />
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-tight mt-0.5">
              {totals[s.key]}
            </div>
            <div className="text-[9px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {ids.map((id) => {
          const finding = byId[id];
          const Icon = CATEGORY_ICONS[id];
          const has = Boolean(finding);
          const style = has ? statusStyle(finding.status) : null;
          const isActive = activeId === id;

          return (
            <button
              key={id}
              type="button"
              disabled={!has}
              onClick={() => onSelect?.(id)}
              title={
                has
                  ? `${id} — ${style.label}${finding.count ? ` · ${finding.count} hit${finding.count === 1 ? '' : 's'}` : ''}`
                  : `${id} — ${running ? 'running…' : 'not checked yet'}`
              }
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border transition-all text-left ${
                has
                  ? `${style.bg} ${style.border} hover:shadow-sm cursor-pointer`
                  : 'bg-slate-50/60 dark:bg-slate-800/30 border-dashed border-slate-200 dark:border-slate-700 cursor-default'
              } ${isActive ? 'ring-2 ring-blue-400/60' : ''}`}
            >
              <span
                className={`w-6 h-6 rounded-md bg-gradient-to-br ${CATEGORY_GRADIENTS[id]} flex items-center justify-center flex-shrink-0 shadow-sm`}
              >
                <Icon className="w-3 h-3 text-white" />
              </span>

              <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 w-7 flex-shrink-0">
                {id}
              </span>

              <span className="flex-1 min-w-0">
                <span
                  className={`block text-[11px] font-semibold truncate ${
                    has ? style.text : 'text-slate-400 dark:text-slate-600'
                  }`}
                >
                  {has ? finding.name : 'Awaiting scan'}
                </span>
                {has && finding.cwe && (
                  <span className="block text-[9px] font-mono text-slate-400 dark:text-slate-500">
                    {finding.cwe}
                  </span>
                )}
              </span>

              {has && finding.count > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-bold text-white tabular-nums flex-shrink-0 ${
                    finding.status === 'fail' ? 'bg-rose-500' : 'bg-amber-500'
                  }`}
                >
                  {finding.count}
                </span>
              )}

              {has && (
                <span
                  className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider flex-shrink-0 ${style.text}`}
                >
                  <style.Icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{style.label}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Score gauge — a radial arc with a verdict.
//
// A bigger, clearer version of the old ring, with the risk band written
// out so the number has a meaning attached to it.
// ---------------------------------------------------------------------------
export const ScoreGauge = ({
  score = null,
  size = 180,
  summary = null,
  findings = 0,
  running = false,
  completed = 0,
  total = 10,
  idle = false,
}) => {
  const showIdle = idle && !running;
  const clamped = Math.max(0, Math.min(100, score ?? 0));
  const stroke = 14;
  const radius = size / 2 - stroke / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = showIdle ? 0 : (clamped / 100) * circumference;

  const color = clamped >= 85 ? '#10b981' : clamped >= 65 ? '#f59e0b' : '#ef4444';
  const band = clamped >= 85 ? 'Low risk' : clamped >= 65 ? 'Medium risk' : 'High risk';

  // A score computed from only some of the detectors is not a verdict on
  // the snippet. While the scan is still running the gauge shows the
  // progress instead, so a partially-scanned snippet never reads as a
  // clean "Low risk" result.
  const label = showIdle ? 'No scan yet' : running ? 'Scanning…' : summary || band;
  const caption = showIdle
    ? 'Run a scan to get a score'
    : running
    ? `${completed} of ${total} detectors done`
    : `${findings} ${findings === 1 ? 'finding' : 'findings'} raised`;

  return (
    <div className="relative flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-slate-200 dark:text-slate-800"
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={running ? '#3b82f6' : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 6px ${running ? '#3b82f655' : `${color}55`})` }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className="text-4xl font-bold tabular-nums leading-none text-slate-400 dark:text-slate-300"
          style={showIdle || running ? undefined : { color: running ? '#3b82f6' : color }}
        >
          {showIdle ? '—' : clamped}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">
          / 100
        </span>
      </div>

      <div className="mt-2 text-center">
        <p
          className={`text-xs font-bold ${showIdle ? 'text-slate-400 dark:text-slate-500' : ''}`}
          style={showIdle ? undefined : { color: running ? '#3b82f6' : color }}
        >
          {label}
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{caption}</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Severity histogram — the per-severity split of the findings.
//
// A horizontal histogram with the count inside each bar. Unlike a donut
// it stays readable at small widths, which matters because this sits in
// a narrow column.
// ---------------------------------------------------------------------------
export const SeverityHistogram = ({ counts = {}, total = 0 }) => {
  const order = ['critical', 'high', 'medium', 'low'];
  const meta = {
    critical: { label: 'Critical', bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
    high: { label: 'High', bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
    medium: { label: 'Medium', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
    low: { label: 'Low', bar: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  };

  const safeTotal = total || order.reduce((s, k) => s + (counts[k] || 0), 0);
  const max = Math.max(1, ...order.map((k) => counts[k] || 0));

  if (!safeTotal) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
        No severity data for this scan.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {order.map((key) => {
        const count = counts[key] || 0;
        const pct = (count / safeTotal) * 100;
        const m = meta[key];
        return (
          <div key={key} className="flex items-center gap-2.5">
            <span className={`text-[10px] font-bold uppercase tracking-wider w-14 flex-shrink-0 ${m.text}`}>
              {m.label}
            </span>
            <div className="flex-1 h-5 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
              <div
                className={`h-full ${m.bar} rounded-md transition-all duration-700 flex items-center justify-end pr-1.5`}
                style={{ width: `${Math.max(count ? 12 : 0, (count / max) * 100)}%` }}
              >
                {count > 0 && (
                  <span className="text-[10px] font-bold text-white tabular-nums">{count}</span>
                )}
              </div>
            </div>
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums w-8 text-right flex-shrink-0">
              {Math.round(pct)}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Comparison strip — this scan against the previous one.
//
// A scan without a comparison is just a list of problems. The delta is
// what tells the user whether their last hour of work paid off.
// ---------------------------------------------------------------------------
export const ComparisonStrip = ({ current = null, previous = null }) => {
  if (!current) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">
        Run a scan to compare against your previous result.
      </p>
    );
  }

  if (!previous) {
    return (
      <div className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700/70 bg-slate-50/60 dark:bg-slate-800/40">
        <GitCompare className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          This is your first recorded scan. Run another one to see the score move.
        </p>
      </div>
    );
  }

  const scoreDelta = (current.score ?? 0) - (previous.score ?? 0);
  const issueDelta = (current.totalIssues ?? 0) - (previous.totalIssues ?? 0);

  const scoreGood = scoreDelta > 0;
  const issueGood = issueDelta < 0;

  const Row = ({ label, now, before, delta, good }) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums line-through">
          {before}
        </span>
        <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">{now}</span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums border ${
            delta === 0
              ? 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              : good
              ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
              : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
          }`}
        >
          {delta > 0 ? '+' : ''}
          {delta}
        </span>
      </span>
    </div>
  );

  return (
    <div className="space-y-1 divide-y divide-slate-100 dark:divide-slate-800">
      <Row
        label="Secure score"
        now={current.score}
        before={previous.score}
        delta={scoreDelta}
        good={scoreGood}
      />
      <Row
        label="Findings"
        now={current.totalIssues}
        before={previous.totalIssues}
        delta={issueDelta}
        good={issueGood}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Findings filter — the segmented control.
//
// A filter that shows its own counts is easier to use than a dropdown,
// because the user can see what selecting each option would give them.
// ---------------------------------------------------------------------------
export const FindingsFilter = ({ value = 'all', counts = {}, onChange }) => {
  const options = [
    { id: 'all', label: 'All', count: counts.all ?? 0 },
    { id: 'fail', label: 'Fail', count: counts.fail ?? 0 },
    { id: 'warning', label: 'Warn', count: counts.warning ?? 0 },
    { id: 'pass', label: 'Pass', count: counts.pass ?? 0 },
  ];

  return (
    <div className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange?.(o.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              active
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {o.label}
            <span
              className={`tabular-nums px-1 rounded text-[10px] ${
                active
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {o.count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Recent runs strip — the scan history as a horizontal strip.
//
// The history is more useful as a row of comparable scores than as a
// vertical list, because the question is "how have my scores moved".
// ---------------------------------------------------------------------------
export const RunHistoryStrip = ({ runs = [], onSelect }) => {
  if (!runs.length) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">
        No scans yet — this will be your first.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {runs.map((r) => {
        const tone =
          r.score >= 85
            ? 'border-emerald-200 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-500/10'
            : r.score >= 65
            ? 'border-amber-200 dark:border-amber-500/40 bg-amber-50/70 dark:bg-amber-500/10'
            : 'border-rose-200 dark:border-rose-500/40 bg-rose-50/70 dark:bg-rose-500/10';

        const scoreTone =
          r.score >= 85
            ? 'text-emerald-600 dark:text-emerald-400'
            : r.score >= 65
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-rose-600 dark:text-rose-400';

        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect?.(r)}
            className="w-full flex items-center gap-3 p-2 rounded-xl border border-slate-200 dark:border-slate-700/70 hover:border-blue-300 dark:hover:border-blue-500/40 hover:shadow-sm transition-all text-left group"
          >
            <span
              className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border font-bold text-xs tabular-nums flex-shrink-0 ${tone} ${scoreTone}`}
            >
              {r.score}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
                {r.mode === 'sql' ? 'SQL' : 'Code'} · {r.language}
              </span>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {`${r.issues} ${r.issues === 1 ? 'issue' : 'issues'} · ${r.summary}`}
              </span>
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono flex-shrink-0">
              {new Date(r.when).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Triage guidance — what to do with each status.
//
// The scanner used to hand over a result with no interpretation. These
// three lines turn the raw status into an instruction.
// ---------------------------------------------------------------------------
export const TriageGuide = ({ totalIssues = 0, fail = 0, warn = 0, idle = false }) => {
  if (idle) {
    return (
      <div className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/40">
        <ScanLine className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-400" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">No scan yet</p>
          <p className="text-[11px] mt-0.5 leading-relaxed text-slate-500 dark:text-slate-400">
            Paste a snippet on the left and press Run OWASP Scan. Guidance will appear here.
          </p>
        </div>
      </div>
    );
  }

  const tips = [];

  if (fail > 0) {
    tips.push({
      Icon: Flame,
      tone: 'rose',
      title: fail === 1 ? '1 category failed' : `${fail} categories failed`,
      body: 'A failed detector matched a concrete vulnerable pattern. Expand the card to see the evidence line and the CWE.',
    });
  }
  if (warn > 0) {
    tips.push({
      Icon: AlertTriangle,
      tone: 'amber',
      title: warn === 1 ? '1 category needs review' : `${warn} categories need review`,
      body: 'A warning means the pattern is suspicious but not conclusive. Read the evidence before changing the code.',
    });
  }
  if (fail === 0 && warn === 0 && totalIssues === 0) {
    tips.push({
      Icon: ShieldCheck,
      tone: 'emerald',
      title: 'All ten detectors passed',
      body: 'No known pattern from the OWASP Top 10 was found in this snippet. Keep scanning as the code changes.',
    });
  } else if (fail === 0) {
    tips.push({
      Icon: ShieldCheck,
      tone: 'emerald',
      title: 'No failing category',
      body: 'Nothing reached the fail threshold. Work through the warnings when you have time.',
    });
  }

  const tones = {
    rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  };

  return (
    <div className="space-y-2">
      {tips.map((t) => (
        <div
          key={t.title}
          className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${tones[t.tone]}`}
        >
          <t.Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold">{t.title}</p>
            <p className="text-[11px] mt-0.5 leading-relaxed opacity-90">{t.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Keyboard map — the shortcut reference.
//
// Rendered as a proper table so the key and the action line up, instead of
// a row of loose chips.
// ---------------------------------------------------------------------------
export const KeyboardMap = ({ shortcuts = [] }) => {
  if (!shortcuts.length) return null;

  return (
    <div className="space-y-1">
      {shortcuts.map((s) => (
        <div
          key={`${s.keys}-${s.label}`}
          className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <span className="text-[11px] text-slate-600 dark:text-slate-300">{s.label}</span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {(Array.isArray(s.keys) ? s.keys : [s.keys]).map((k) => (
              <kbd
                key={k}
                className="px-1.5 py-0.5 min-w-[20px] text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-mono rounded shadow-sm"
              >
                {k}
              </kbd>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Confidence bar — how sure the scanner is about each category.
//
// The detectors are pattern matchers, so a category that matched several
// times is a stronger signal than one that matched once. This makes that
// difference visible instead of hiding it behind a pass/fail badge.
// ---------------------------------------------------------------------------
export const ConfidenceBar = ({ count = 0, max = 10 }) => {
  const pct = Math.min(100, (count / (max || 1)) * 100);
  const tone =
    count === 0
      ? 'bg-slate-300 dark:bg-slate-700'
      : count >= 5
      ? 'bg-rose-500'
      : count >= 3
      ? 'bg-amber-500'
      : 'bg-yellow-400';

  return (
    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div
        className={`h-full ${tone} rounded-full transition-all duration-700`}
        style={{ width: `${count ? Math.max(12, pct) : 0}%` }}
      />
    </div>
  );
};

export default DetectorGrid;
