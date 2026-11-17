import React, { useMemo } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Crosshair,
  Fingerprint,
  Flame,
  Layers,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { severityScale } from './SecurityProWidgets';

// ---------------------------------------------------------------------------
// Security Advanced widgets.
//
// The pieces that turn the Security page from "a list of findings with a
// filter bar" into a security operations workspace.
//
// The ideas here:
//   • A hero band that states the verdict and the next action, instead of
//     making the user read a table to work out where they stand.
//   • A risk meter that shows the score as a gauge with the band it falls
//     in, so the number has a shape.
//   • A category heat grid where the OWASP Top 10 is the axis, so the
//     user sees the shape of their exposure, not a list of 10 rows.
//   • Insight cards that state a conclusion ("3 critical findings share
//     one CWE") rather than restating a count.
//   • Everything is derived from the same findings the rest of the page
//     uses, so the advanced layer can never disagree with the table.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ScoreRing — the secure score as a radial gauge.
//
// A number alone ("72") does not tell the user whether that is good. The
// ring gives the number a visual weight and the band label gives it a
// meaning.
// ---------------------------------------------------------------------------
// Hex fills for SVG strokes. Tailwind classes like `bg-rose-500` are not
// valid SVG `stroke` values, so the donut previously rendered its
// segments in black. One map keeps the chart in sync with the scale.
const SEVERITY_HEX = {
  critical: '#f43f5e',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#3b82f6',
  info: '#64748b',
};

export const ScoreRing = ({
  score = null,
  size = 168,
  stroke = 12,
  label = 'Secure score',
  sublabel = null,
  idle = false,
}) => {
  const hasScore = !idle && score !== null && score !== undefined;
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // With no score there is nothing to fill — the ring stays empty so an
  // unscanned workspace never reads as a verdict.
  const offset = hasScore ? circumference - (clamped / 100) * circumference : circumference;

  const band = !hasScore
    ? { label: 'No scan yet', tone: 'text-slate-400 dark:text-slate-500', from: '#94a3b8', to: '#64748b', Icon: ShieldCheck }
    : clamped >= 85
    ? { label: 'Strong posture', tone: 'text-emerald-600 dark:text-emerald-400', from: '#10b981', to: '#14b8a6', Icon: ShieldCheck }
      : clamped >= 65
      ? { label: 'Needs attention', tone: 'text-amber-600 dark:text-amber-400', from: '#f59e0b', to: '#f97316', Icon: Target }
      : { label: 'Action required', tone: 'text-rose-600 dark:text-rose-400', from: '#f43f5e', to: '#ef4444', Icon: Flame };

  const gradientId = `score-ring-grad-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rotate-[-90deg]"
          role="img"
          aria-label={`${label}: ${clamped} out of 100 — ${band.label}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={band.from} />
              <stop offset="100%" stopColor={band.to} />
            </linearGradient>
          </defs>

          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-slate-100 dark:stroke-slate-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 1200ms cubic-bezier(0.22, 1, 0.36, 1)',
              filter: `drop-shadow(0 0 6px ${band.from}55)`,
            }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black tabular-nums leading-none text-slate-900 dark:text-slate-50">
            {hasScore ? clamped : '—'}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">
            / 100
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-col items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${band.tone} bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/70`}
        >
          <band.Icon className="w-3.5 h-3.5" />
          {band.label}
        </span>
        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
          {hasScore ? sublabel || label : 'Run a scan to get a score'}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// HeroBand — the verdict strip at the top of the page.
//
// One sentence, one number, one action. Everything else on the page is
// detail; this is the answer.
// ---------------------------------------------------------------------------
export const HeroBand = ({
  score = null,
  findings = 0,
  criticals = 0,
  resolved = 0,
  scannedAt = null,
  onRunScan = null,
  children = null,
  idle = false,
}) => {
  const hasScore = !idle && score !== null && score !== undefined;
  const numericScore = Number(score) || 0;
  const band = !hasScore
    ? { label: 'No scan yet', tone: 'text-slate-500 dark:text-slate-400', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', Icon: ShieldCheck }
    : numericScore >= 85
    ? { label: 'Strong posture', tone: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', Icon: ShieldCheck }
      : numericScore >= 65
      ? { label: 'Needs attention', tone: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', Icon: Target }
      : { label: 'Action required', tone: 'text-rose-600 dark:text-rose-400', chip: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', Icon: Flame };

  const summary = !hasScore
    ? 'No scan recorded yet — run your first scan to get a verdict.'
    : criticals > 0
    ? `${criticals} critical ${criticals === 1 ? 'finding needs' : 'findings need'} immediate attention.`
    : findings > 0
    ? `${findings} open ${findings === 1 ? 'finding' : 'findings'}, none critical.`
    : 'No open findings — your codebase is clean.';

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-700/70 glass-strong">
      {/* Accent wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(120% 140% at 0% 0%, rgba(59,130,246,0.10) 0%, transparent 55%), radial-gradient(90% 120% at 100% 0%, rgba(236,72,153,0.09) 0%, transparent 55%)',
        }}
      />

      <div className="relative p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-6">
        {/* Left — the verdict */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold ${band.chip}`}
            >
              <band.Icon className="w-3.5 h-3.5" />
              {band.label}
            </span>
            {scannedAt && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                <Clock className="w-3 h-3" />
                Last scan {new Date(scannedAt).toLocaleString()}
              </span>
            )}
          </div>

          <p className="mt-2.5 text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-50 leading-snug">
            {summary}
          </p>

          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-[54ch] leading-relaxed">
            {findings > 0
              ? `Work through the triage rail to close them, or open the IDE to fix a finding in place. ${resolved > 0 ? `${resolved} already resolved.` : ''}`
              : 'Run a scan to check your code against the OWASP Top 10 (2026).'}
          </p>

          {children && <div className="mt-4">{children}</div>}
        </div>

        {/* Right — the score and the action */}
        <div className="flex items-center gap-5 lg:gap-6 flex-shrink-0">
          <ScoreRing score={score} size={132} stroke={10} idle={idle} />
          {onRunScan && (
            <button
              type="button"
              onClick={onRunScan}
              className="group inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-xs text-white transition-all duration-300 shadow-lg shadow-blue-600/20 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 hover:shadow-xl hover:-translate-y-0.5"
            >
              <Crosshair className="w-4 h-4" />
              Run new scan
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// RiskBreakdown — where the risk actually sits.
//
// Four horizontal meters (one per severity) next to the total. This is the
// "how bad is it" answer in a form the eye can compare in one pass.
// ---------------------------------------------------------------------------
export const RiskBreakdown = ({ counts = {}, total = 0, onSelect, activeSeverity = 'all' }) => {
  const order = ['critical', 'high', 'medium', 'low'];
  const sum = order.reduce((s, k) => s + (counts[k] || 0), 0);
  const safeTotal = total || sum;

  if (!safeTotal) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8">
        <ShieldCheck className="w-6 h-6 text-emerald-500 mb-2" />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Nothing open — every finding has been resolved.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {order.map((key) => {
        const scale = severityScale(key);
        const value = counts[key] || 0;
        const pct = safeTotal ? Math.round((value / safeTotal) * 100) : 0;
        const isActive = activeSeverity === key;

        return (
          <button
            key={key}
            type="button"
            onClick={onSelect ? () => onSelect(key) : undefined}
            disabled={!onSelect}
            className={`w-full group text-left rounded-xl px-2 py-1.5 -mx-2 transition-colors disabled:cursor-default ${
              isActive ? 'bg-slate-50 dark:bg-slate-800/60' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full ${scale.bar} flex-shrink-0`} />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {scale.label}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                  {pct}%
                </span>
              </span>
              <span className={`text-sm font-bold tabular-nums ${value ? scale.text : 'text-slate-300 dark:text-slate-600'}`}>
                {value}
              </span>
            </div>

            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${scale.bar} transition-all duration-1000 ease-out`}
                style={{ width: `${Math.max(value ? 6 : 0, pct)}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// CategoryHeatGrid — the OWASP Top 10 as a heat grid.
//
// Ten rows of numbers is a table to read; ten rows of coloured cells is a
// shape to see. The worst category is visible without reading a single
// label.
// ---------------------------------------------------------------------------
export const CategoryHeatGrid = ({ rows = [], onSelect, activeCategory = 'all' }) => {
  const max = Math.max(1, ...rows.map((r) => r.total || 0));

  if (!rows.length) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
        No category data yet. Run a scan to populate the grid.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {rows.map((row) => {
        const total = row.total || 0;
        const intensity = total ? 0.2 + (total / max) * 0.8 : 0;
        const worst =
          row.cells?.critical > 0
            ? 'critical'
            : row.cells?.high > 0
            ? 'high'
            : row.cells?.medium > 0
            ? 'medium'
            : row.cells?.low > 0
            ? 'low'
            : null;
        const scale = worst ? severityScale(worst) : null;
        const isActive = activeCategory === row.name;

        return (
          <button
            key={row.id || row.name}
            type="button"
            onClick={onSelect ? () => onSelect(row) : undefined}
            disabled={!onSelect}
            className={`relative text-left p-3 rounded-xl border transition-all duration-200 group ${
              isActive
                ? 'border-blue-400 dark:border-blue-500/60 bg-blue-50/70 dark:bg-blue-500/10 ring-1 ring-blue-300 dark:ring-blue-500/40'
                : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
            } bg-white/70 dark:bg-slate-900/50 disabled:cursor-default`}
          >
            {/* Heat wash */}
            <div
              className="absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-300"
              style={{
                opacity: total ? intensity * 0.32 : 0,
                background: scale
                  ? `linear-gradient(135deg, ${SEVERITY_HEX[worst] || '#94a3b8'}33, transparent)`
                  : 'transparent',
                filter: 'blur(22px)',
              }}
            />

            <div className="relative">
              <span className="font-mono text-[9px] font-bold text-slate-400 dark:text-slate-500">
                {row.id}
              </span>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 leading-tight line-clamp-2 min-h-[2.2em]">
                {row.name}
              </p>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span
                  className={`text-base font-black tabular-nums leading-none ${
                    total ? scale?.text || 'text-slate-800 dark:text-slate-100' : 'text-slate-300 dark:text-slate-600'
                  }`}
                >
                  {total}
                </span>
                {worst && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${scale.chip}`}>
                    {scale.label}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// InsightCard — a conclusion, not a count.
//
// The analytical layer of the page. Each card answers a question the
// user would otherwise have to answer by hand across the findings list.
// ---------------------------------------------------------------------------
export const InsightCard = ({
  icon: Icon = Sparkles,
  tone = 'blue',
  title,
  body,
  metric = null,
  action = null,
}) => {
  const tones = {
    blue: { chip: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300', grad: 'from-blue-500 to-indigo-600' },
    rose: { chip: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300', grad: 'from-rose-500 to-red-600' },
    amber: { chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300', grad: 'from-amber-500 to-orange-600' },
    emerald: { chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300', grad: 'from-emerald-500 to-teal-600' },
    violet: { chip: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300', grad: 'from-violet-500 to-purple-600' },
  };
  const t = tones[tone] || tones.blue;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 p-4 transition-all duration-300 hover:shadow-lg hover:shadow-slate-900/5 dark:hover:shadow-black/20 hover:-translate-y-0.5">
      <div
        className={`absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br ${t.grad} opacity-[0.07] blur-2xl transition-opacity duration-500 group-hover:opacity-[0.14]`}
      />

      <div className="relative flex items-start gap-3">
        <span className={`w-9 h-9 rounded-xl ${t.chip} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4" />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
              {title}
            </h4>
            {metric !== null && (
              <span className="text-sm font-black tabular-nums text-slate-900 dark:text-slate-50">
                {metric}
              </span>
            )}
          </div>

          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {body}
          </p>

          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:gap-1.5 transition-all"
            >
              {action.label}
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// buildInsights — derive the conclusions from the findings.
//
// The reasoning lives in `utils/securityInsights.js` so it can be unit
// tested on its own. It is re-exported here so the Security page can
// import every widget it needs from one place.
//
// The icon for each insight is applied here, not in the reasoning module,
// because the reasoning has no business knowing which glyph represents
// it — that is a presentation concern.
// ---------------------------------------------------------------------------
export { buildInsights } from '../../utils/securityInsights';

/** The glyph each insight key is drawn with. */
export const INSIGHT_ICONS = {
  cwe: Fingerprint,
  category: Layers,
  critical: Flame,
  resolved: CheckCircle2,
  threats: Radar,
};

// ---------------------------------------------------------------------------
// CommandBar — the global search + action strip.
//
// One place to search findings, threats and reports at once, plus the
// actions that would otherwise be scattered across the header.
// ---------------------------------------------------------------------------
export const CommandBar = ({ value, onChange, placeholder = 'Search…', actions = null }) => (
  <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl p-2 flex flex-wrap items-center gap-2 shadow-sm">
    <div className="relative flex-1 min-w-[220px]">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
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
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full pl-10 pr-16 py-2.5 rounded-xl bg-transparent text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none focus:bg-white/70 dark:focus:bg-slate-800/70 transition-colors"
      />
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md text-[9px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pointer-events-none">
        /
      </kbd>
    </div>

    {actions && <div className="flex items-center gap-1.5 flex-wrap">{actions}</div>}
  </div>
);

// ---------------------------------------------------------------------------
// TimelineRail — the finding lifecycle, newest first.
//
// A compact vertical timeline so the user can see when the problems
// appeared, which is what tells them whether the codebase got worse or
// the tooling did.
// ---------------------------------------------------------------------------
export const TimelineRail = ({ findings = [], limit = 8, onSelect }) => {
  const items = useMemo(() => {
    return [...findings]
      .filter((f) => f.discoveredAt)
      .sort((a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt))
      .slice(0, limit);
  }, [findings, limit]);

  if (!items.length) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
        No timestamps on these findings.
      </p>
    );
  }

  return (
    <ol className="relative pl-5">
      {/* The spine */}
      <span className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-slate-200 dark:bg-slate-700" />

      {items.map((f) => {
        const scale = severityScale(f.severity);
        const when = new Date(f.discoveredAt);
        const ageDays = Math.max(0, Math.floor((Date.now() - when.getTime()) / 86400000));
        const age =
          ageDays === 0
            ? 'today'
            : ageDays === 1
            ? 'yesterday'
            : ageDays < 30
            ? `${ageDays}d ago`
            : `${Math.floor(ageDays / 30)}mo ago`;

        return (
          <li key={f.id} className="relative pb-3.5 last:pb-0">
            <span
              className={`absolute -left-5 top-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${scale.bar}`}
            />
            <button
              type="button"
              onClick={onSelect ? () => onSelect(f) : undefined}
              disabled={!onSelect}
              className="w-full text-left group disabled:cursor-default"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tabular-nums">
                  {when.toLocaleDateString()}
                </span>
                <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">{age}</span>
              </div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate mt-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {f.title}
              </p>
            </button>
          </li>
        );
      })}
    </ol>
  );
};

// ---------------------------------------------------------------------------
// DonutBreakdown — the severity mix as a donut.
//
// The stacked bar answers "how much", the donut answers "of what" — the
// proportion of the whole each severity owns.
// ---------------------------------------------------------------------------
export const DonutBreakdown = ({ counts = {}, total = 0, size = 150 }) => {
  const order = ['critical', 'high', 'medium', 'low'];
  const sum = order.reduce((s, k) => s + (counts[k] || 0), 0);
  const safeTotal = total || sum;

  if (!safeTotal) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8">
        <ShieldCheck className="w-6 h-6 text-emerald-500 mb-2" />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No open findings to break down.
        </p>
      </div>
    );
  }

  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const segments = order
    .map((key) => ({
      key,
      value: counts[key] || 0,
      scale: severityScale(key),
    }))
    .filter((s) => s.value > 0);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="relative flex-shrink-0 mx-auto sm:mx-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={16}
            className="stroke-slate-100 dark:stroke-slate-800"
          />
          {segments.map((s) => {
            const length = (s.value / safeTotal) * circumference;
            const dash = `${length} ${circumference - length}`;
            const el = (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={16}
                stroke={SEVERITY_HEX[s.key] || '#64748b'}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                style={{ transition: 'stroke-dasharray 900ms ease-out, stroke-dashoffset 900ms ease-out' }}
              />
            );
            offset += length;
            return el;
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black tabular-nums leading-none text-slate-900 dark:text-slate-50">
            {safeTotal}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">
            Open
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-2 min-w-0">
        {order.map((key) => {
          const value = counts[key] || 0;
          const scale = severityScale(key);
          const pct = safeTotal ? Math.round((value / safeTotal) * 100) : 0;
          return (
            <div key={key} className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded ${scale.bar} flex-shrink-0`} />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300 flex-1 min-w-0 truncate">
                {scale.label}
              </span>
              <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500 w-9 text-right">
                {pct}%
              </span>
              <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200 w-7 text-right">
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SectionHeader — the standard panel header for the advanced layout.
//
// A single definition so every panel in the advanced view has the same
// header rhythm: glyph, title, subtitle, optional action.
// ---------------------------------------------------------------------------
export const SectionHeader = ({
  icon: Icon = Activity,
  tone = 'slate',
  title,
  subtitle = null,
  action = null,
}) => {
  const tones = {
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-500',
    blue: 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400',
    rose: 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400',
    amber: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    violet: 'bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400',
  };
  const t = tones[tone] || tones.slate;

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-8 h-8 rounded-lg ${t} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {action}
    </header>
  );
};
