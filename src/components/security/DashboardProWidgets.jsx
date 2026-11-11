import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Flame,
  Gauge,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Dashboard Pro widgets.
//
// These are the "advanced" building blocks for the rebuilt command centre.
// Everything is presentational: the page owns the data and the state, these
// components only render what they are given.
//
// The ideas here are deliberate:
//   • A metric can be compared against its own history, so every number
//     that has a trend gets a delta chip instead of a bare figure.
//   • A risk surface is shown as a heat grid, so "which project is hurt
//     and where" is answerable without opening anything.
//   • Nothing renders a placeholder. A widget with no data says so.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Delta chip — the change between two numbers.
//
// The arrow direction is the direction of *improvement* for the metric's
// own polarity, not the raw direction of the number. A falling count of
// open findings is good, so it renders in green.
// ---------------------------------------------------------------------------
export const DeltaChip = ({
  current = 0,
  previous = 0,
  polarity = 'neutral', // 'higher-is-better' | 'lower-is-better' | 'neutral'
  suffix = '',
  className = '',
}) => {
  const delta = current - previous;
  const isFlat = delta === 0;

  const good =
    isFlat ||
    polarity === 'neutral' ||
    (polarity === 'higher-is-better' ? delta > 0 : delta < 0);

  const tone = isFlat
    ? 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
    : good
    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
    : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30';

  const Icon = isFlat ? CircleDot : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold tabular-nums ${tone} ${className}`}
      title={`Previous value: ${previous}${suffix}`}
    >
      <Icon className="w-3 h-3" />
      {isFlat ? '0' : `${delta > 0 ? '+' : ''}${delta}${suffix}`}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Metric card — the primary headline figure.
//
// Deliberately different from the old card: the value is the loudest
// element, the label is small and quiet, and the delta sits beside the
// value so the two are read together.
// ---------------------------------------------------------------------------
export const MetricCard = ({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  polarity = 'neutral',
  accent = 'blue',
  hint,
  footer,
  spark,
  onClick,
  active = false,
}) => {
  const accents = {
    blue: {
      gradient: 'from-blue-500 to-indigo-600',
      glow: 'bg-blue-500/15',
      text: 'text-blue-600 dark:text-blue-400',
      ring: 'group-hover:border-blue-300 dark:group-hover:border-blue-500/40',
    },
    rose: {
      gradient: 'from-rose-500 to-red-600',
      glow: 'bg-rose-500/15',
      text: 'text-rose-600 dark:text-rose-400',
      ring: 'group-hover:border-rose-300 dark:group-hover:border-rose-500/40',
    },
    emerald: {
      gradient: 'from-emerald-500 to-teal-600',
      glow: 'bg-emerald-500/15',
      text: 'text-emerald-600 dark:text-emerald-400',
      ring: 'group-hover:border-emerald-300 dark:group-hover:border-emerald-500/40',
    },
    violet: {
      gradient: 'from-violet-500 to-purple-600',
      glow: 'bg-violet-500/15',
      text: 'text-violet-600 dark:text-violet-400',
      ring: 'group-hover:border-violet-300 dark:group-hover:border-violet-500/40',
    },
    amber: {
      gradient: 'from-amber-500 to-orange-600',
      glow: 'bg-amber-500/15',
      text: 'text-amber-600 dark:text-amber-400',
      ring: 'group-hover:border-amber-300 dark:group-hover:border-amber-500/40',
    },
  };

  const a = accents[accent] || accents.blue;

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl p-4 text-left transition-all duration-300 minimal-card ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''
      } ${active ? 'ring-2 ring-blue-400/50' : ''} ${a.ring}`}
    >
      {/* The soft accent glow behind the icon. */}
      <div
        className={`absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl ${a.glow} opacity-60 group-hover:opacity-100 transition-opacity duration-500`}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-3xl font-bold tabular-nums leading-none text-slate-900 dark:text-slate-50">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {unit && (
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{unit}</span>
            )}
            {delta && (
              <DeltaChip
                current={delta.current}
                previous={delta.previous}
                polarity={polarity}
                suffix={delta.suffix ?? ''}
              />
            )}
          </div>
        </div>

        <span
          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${a.gradient} flex items-center justify-center shadow-lg flex-shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}
        >
          {Icon && <Icon className="w-4.5 h-4.5 text-white" />}
        </span>
      </div>

      {spark && <div className="relative mt-3 -mx-1">{spark}</div>}

      {footer && (
        <div className="relative mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          {footer}
        </div>
      )}

      {hint && <span className="sr-only">{hint}</span>}
    </Tag>
  );
};

// ---------------------------------------------------------------------------
// Sparkline — a tiny inline trend line.
//
// A filled area under the line reads faster than a bare polyline at this
// size, and the gradient fades out so the line stays the loudest part.
// ---------------------------------------------------------------------------
export const MiniSpark = ({ data = [], color = '#3b82f6', width = 200, height = 34 }) => {
  const points = data && data.length ? data : [0];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;

  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1 || 1)) * width;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return [x, y];
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const id = `ms-${color.replace(/[^a-z0-9]/gi, '')}`;

  const last = coords[coords.length - 1];

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="overflow-visible block"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Risk surface — a heat grid of project × OWASP category.
//
// The old page showed a radar and a category matrix, but never the two
// dimensions together. This grid does: one row per project, one column
// per category, and the cell colour is the finding count. The question
// "which project has the injection problem" is answered by one glance.
// ---------------------------------------------------------------------------
export const RiskSurface = ({ projects = [], categories = [], onSelect }) => {
  const [hover, setHover] = useState(null);

  const max = useMemo(() => {
    let m = 0;
    projects.forEach((p) => {
      (p.cells || []).forEach((c) => {
        if (c > m) m = c;
      });
    });
    return m;
  }, [projects]);

  if (!projects.length || !categories.length) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <Radar className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No risk surface yet</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
          Run a scan on a project and its OWASP breakdown appears here.
        </p>
      </div>
    );
  }

  const cellTone = (count) => {
    if (!count) return 'bg-slate-100/80 dark:bg-slate-800/50';
    const ratio = count / (max || 1);
    if (ratio > 0.66) return 'bg-rose-500/85';
    if (ratio > 0.33) return 'bg-amber-500/80';
    return 'bg-yellow-400/70';
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 min-w-[520px]">
          <thead>
            <tr>
              <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 pb-1.5 pr-2 whitespace-nowrap">
                Project
              </th>
              {categories.map((c) => (
                <th
                  key={c.id}
                  title={c.name}
                  className="text-center font-mono text-[9px] font-bold text-slate-400 dark:text-slate-500 pb-1.5"
                >
                  {c.id.replace('A', '')}
                </th>
              ))}
              <th className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 pb-1.5 pl-2">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const total = (project.cells || []).reduce((a, b) => a + (b || 0), 0);
              return (
                <tr
                  key={project.id}
                      onMouseEnter={() => setHover(project.id)}
                      onMouseLeave={() => setHover(null)}
                >
                  <td className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 pr-2 whitespace-nowrap max-w-[140px] truncate">
                    {project.name}
                  </td>
                  {categories.map((c, i) => {
                    const count = project.cells?.[i] || 0;
                    const isHot = hover === project.id && count > 0;
                    return (
                      <td key={c.id} className="text-center">
                        <button
                          type="button"
                          disabled={!count}
                          onClick={() => onSelect?.(project, c.id)}
                          title={`${project.name} · ${c.id} ${c.name} — ${count} finding${count === 1 ? '' : 's'}`}
                          className={`w-7 h-6 rounded-md ${cellTone(count)} transition-all duration-200 ${
                            isHot ? 'scale-110 ring-2 ring-slate-900/15 dark:ring-white/20' : ''
                          } ${count ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
                        >
                          <span className="text-[9px] font-bold text-white/95 tabular-nums">
                            {count || ''}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                  <td className="text-right pl-2">
                    <span
                      className={`text-[11px] font-bold tabular-nums ${
                        total === 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : total > 5
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {total}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The legend. */}
      <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
          Density
        </span>
        {[
          { cls: 'bg-slate-100/80 dark:bg-slate-800/50', label: '0' },
          { cls: 'bg-yellow-400/70', label: 'low' },
          { cls: 'bg-amber-500/80', label: 'medium' },
          { cls: 'bg-rose-500/85', label: 'high' },
        ].map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            <span className={`w-3 h-3 rounded ${l.cls}`} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Score breakdown — why the secure score is what it is.
//
// A single number tells the user where they are; this tells them what to
// change to move it. Each row shows one factor and its contribution.
// ---------------------------------------------------------------------------
export const ScoreBreakdown = ({ factors = [], score = 0 }) => {
  if (!factors.length) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
        No score factors to show yet.
      </p>
    );
  }

  const tone = score >= 85 ? 'text-emerald-600' : score >= 65 ? 'text-amber-600' : 'text-rose-600';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500">
          Score factors
        </span>
        <span className={`text-sm font-bold tabular-nums ${tone}`}>{score}/100</span>
      </div>

      <div className="space-y-2.5">
        {factors.map((f) => {
          const pct = Math.max(0, Math.min(100, f.percent || 0));
          const barTone =
            pct >= 80
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
              : pct >= 50
              ? 'bg-gradient-to-r from-amber-500 to-yellow-500'
              : 'bg-gradient-to-r from-rose-500 to-red-600';

          return (
            <div key={f.id || f.label}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                  {f.label}
                </span>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums flex-shrink-0">
                  {f.detail ?? `${Math.round(pct)}%`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full ${barTone} rounded-full transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Activity stream — a chronological feed of what happened.
//
// The dashboard used to show only scan totals. A feed answers "what
// changed since I was last here", which is the actual question.
// ---------------------------------------------------------------------------
export const ActivityStream = ({ events = [], onSelect }) => {
  if (!events.length) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-10">
        No activity recorded yet.
      </p>
    );
  }

  const iconFor = (kind) => {
    if (kind === 'critical' || kind === 'fail') return { Icon: Flame, tone: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10' };
    if (kind === 'warning') return { Icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10' };
    if (kind === 'resolved' || kind === 'pass') return { Icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' };
    if (kind === 'scan') return { Icon: Zap, tone: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10' };
    return { Icon: Activity, tone: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800' };
  };

  const relative = (value) => {
    if (!value) return '';
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return '';
    const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d`;
    return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative">
      <span className="absolute left-[13px] top-3 bottom-3 w-px bg-gradient-to-b from-blue-400/50 via-slate-300/60 to-transparent dark:from-blue-500/40 dark:via-slate-700" />
      <div className="space-y-1">
        {events.map((e, i) => {
          const { Icon, tone } = iconFor(e.kind);
          return (
            <button
              key={e.id ?? i}
              type="button"
              onClick={() => onSelect?.(e)}
              className="relative w-full flex items-start gap-3 py-2 pr-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left group"
            >
              <span
                className={`relative z-10 w-7 h-7 rounded-full ring-4 ring-white dark:ring-slate-900 flex items-center justify-center flex-shrink-0 ${tone}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1 min-w-0 pt-1">
                <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {e.title}
                </span>
                {e.detail && (
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                    {e.detail}
                  </span>
                )}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0 pt-1.5 tabular-nums">
                {relative(e.at)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Command deck — the quick-action tiles.
//
// The old quick actions were three plain links. Each tile here states what
// it does, where it goes, and the impact it has on the score, so the
// choice is informed.
// ---------------------------------------------------------------------------
export const CommandDeck = ({ actions = [], onJump }) => {
  if (!actions.length) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {actions.map((a) => (
        <button
          key={a.id || a.label}
          type="button"
          onClick={() => (a.onSelect ? a.onSelect() : a.href ? onJump?.(a.href) : null)}
          className="group relative overflow-hidden rounded-xl p-3 text-left bg-white/70 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 hover:border-blue-300 dark:hover:border-blue-500/40 hover:shadow-md transition-all duration-300"
        >
          <div
            className={`absolute -top-8 -right-8 w-20 h-20 rounded-full blur-2xl ${a.glow || 'bg-blue-500/10'} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
          />
          <div className="relative flex items-start gap-3">
            <span
              className={`w-9 h-9 rounded-lg bg-gradient-to-br ${a.gradient || 'from-blue-500 to-indigo-600'} flex items-center justify-center shadow-md flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}
            >
              {a.icon && <a.icon className="w-4 h-4 text-white" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {a.label}
                </span>
                {a.badge && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 flex-shrink-0">
                    {a.badge}
                  </span>
                )}
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                {a.description}
              </span>
              {a.shortcut && (
                <kbd className="mt-1.5 inline-block px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 text-[9px] font-mono rounded">
                  {a.shortcut}
                </kbd>
              )}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
          </div>
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Section shell — one consistent header for every panel.
//
// A page where every panel has its own header style reads as a pile of
// widgets. This gives them all one rhythm.
// ---------------------------------------------------------------------------
export const Panel = ({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClass = '',
  tone = 'slate',
}) => {
  const tones = {
    slate: 'text-slate-500',
    blue: 'text-blue-600 dark:text-blue-400',
    rose: 'text-rose-600 dark:text-rose-400',
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    violet: 'text-violet-600 dark:text-violet-400',
  };

  return (
    <section
      className={`minimal-card overflow-hidden flex flex-col ${className}`}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <span
              className={`w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 ${tones[tone]}`}
            >
              <Icon className="w-4 h-4" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {action}
      </header>
      <div className={`flex-1 min-h-0 ${bodyClass}`}>{children}</div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Posture banner — the one-line verdict on the security state.
//
// The banner changes colour and wording with the score, so the page
// answers "how am I doing" before the user reads a single number.
// ---------------------------------------------------------------------------
export const PostureBanner = ({ score = 0, trend = 'stable', findings = 0, criticals = 0 }) => {
  const band =
    score >= 85
      ? {
          label: 'Strong posture',
          Icon: ShieldCheck,
          tone: 'from-emerald-600 to-teal-600',
          text: 'text-emerald-700 dark:text-emerald-300',
          note: 'Your score is above the 85 line. Keep new code in the same scan loop.',
        }
      : score >= 65
      ? {
          label: 'Needs attention',
          Icon: Target,
          tone: 'from-amber-500 to-orange-600',
          text: 'text-amber-700 dark:text-amber-300',
          note: 'A handful of categories are still open. The list below is ordered by impact.',
        }
      : {
          label: 'Action required',
          Icon: Flame,
          tone: 'from-rose-600 to-red-700',
          text: 'text-rose-700 dark:text-rose-300',
          note: 'Critical findings are reachable. Fix these before shipping anything new.',
        };

  const TrendIcon = trend === 'improving' ? TrendingUp : trend === 'worsening' ? TrendingDown : Activity;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${band.tone} p-4 sm:p-5 shadow-lg`}
    >
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="absolute -top-12 right-10 w-40 h-40 bg-white/15 rounded-full blur-2xl" />

      <div className="relative flex items-center gap-4">
        <span className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur border border-white/25 flex items-center justify-center flex-shrink-0">
          <band.Icon className="w-5 h-5 text-white" />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-white leading-tight">{band.label}</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 border border-white/25 text-[10px] font-bold uppercase tracking-wider text-white">
              <TrendIcon className="w-3 h-3" />
              {trend}
            </span>
          </div>
          <p className="text-xs text-white/85 mt-1 leading-relaxed max-w-2xl">{band.note}</p>
        </div>

        <div className="hidden sm:flex items-center gap-4 flex-shrink-0 pl-4 border-l border-white/20">
          <div className="text-center">
            <div className="text-2xl font-bold text-white tabular-nums leading-none">{score}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/70 mt-1">Score</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white tabular-nums leading-none">{findings}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/70 mt-1">Open</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white tabular-nums leading-none">{criticals}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/70 mt-1">Critical</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Trend bars — detected vs resolved per day.
//
// A stacked pair of bars per day makes the balance between new and fixed
// visible at a glance, which a line chart of a single series cannot.
// ---------------------------------------------------------------------------
export const TrendBars = ({ data = [] }) => {
  const max = Math.max(1, ...data.map((d) => Math.max(d.detected || 0, d.resolved || 0)));
  const hasActivity = data.some((d) => (d.detected || 0) + (d.resolved || 0) > 0);

  if (!data.length || !hasActivity) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <Activity className="w-7 h-7 text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-xs text-slate-500 dark:text-slate-400">No activity in this window yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-400" /> Detected
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Resolved
        </span>
      </div>

      <div className="flex items-end gap-2 sm:gap-3 h-40">
        {data.map((d, i) => {
          const detH = ((d.detected || 0) / max) * 100;
          const resH = ((d.resolved || 0) / max) * 100;
          return (
            <div key={d.day || i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0 group">
              <div className="w-full flex items-end justify-center gap-1 h-32">
                <div
                  title={`${d.day}: ${d.detected || 0} detected`}
                  className="w-2.5 sm:w-4 rounded-t bg-gradient-to-t from-rose-500 to-rose-400 transition-all duration-500 group-hover:from-rose-600"
                  style={{ height: `${detH}%` }}
                />
                <div
                  title={`${d.day}: ${d.resolved || 0} resolved`}
                  className="w-2.5 sm:w-4 rounded-t bg-gradient-to-t from-emerald-600 to-emerald-400 transition-all duration-500 group-hover:from-emerald-500"
                  style={{ height: `${resH}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 truncate w-full text-center">
                {d.day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Category leaderboard — OWASP categories ranked by finding count.
//
// A ranked list is easier to scan than a grid when the question is
// "which one is worst".
// ---------------------------------------------------------------------------
export const CategoryLeaderboard = ({ categories = [], onSelect, activeId = null }) => {
  const ranked = useMemo(
    () => [...categories].sort((a, b) => (b.count || 0) - (a.count || 0)),
    [categories]
  );

  const max = Math.max(1, ...ranked.map((c) => c.count || 0));

  if (!ranked.length) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-10">
        No category data yet.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {ranked.map((cat) => {
        const count = cat.count || 0;
        const pct = (count / max) * 100;
        const isActive = activeId === cat.id;
        const tone =
          count === 0
            ? 'bg-emerald-500'
            : pct > 66
            ? 'bg-rose-500'
            : pct > 33
            ? 'bg-amber-500'
            : 'bg-yellow-400';

        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect?.(cat.id)}
            className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
              isActive ? 'bg-slate-100 dark:bg-slate-800' : ''
            }`}
          >
            <span className="font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500 w-7 flex-shrink-0">
              {cat.id}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                {cat.name}
              </span>
              <span className="block h-1 mt-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <span
                  className={`block h-full ${tone} rounded-full transition-all duration-700`}
                  style={{ width: `${count > 0 ? Math.max(6, pct) : 0}%` }}
                />
              </span>
            </span>
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums w-6 text-right flex-shrink-0">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Streak tracker — consecutive days with a scan.
//
// A streak is a small, honest nudge: it only counts when the data
// actually has scans on consecutive calendar days.
// ---------------------------------------------------------------------------
export const ScanStreak = ({ scans = [] }) => {
  const streak = useMemo(() => {
    const days = new Set();
    scans.forEach((s) => {
      const at = s.completedAt || s.scannedAt || s.when;
      if (!at) return;
      const d = new Date(at);
      if (Number.isNaN(d.getTime())) return;
      days.add(d.toDateString());
    });
    if (!days.size) return 0;

    let count = 0;
    const cursor = new Date();
    // If today has no scan yet, start counting from yesterday — the
    // streak is not broken until a full day is missed.
    if (!days.has(cursor.toDateString())) {
      cursor.setDate(cursor.getDate() - 1);
      if (!days.has(cursor.toDateString())) return 0;
    }
    while (days.has(cursor.toDateString())) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [scans]);

  if (!streak) {
    return (
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Zap className="w-4.5 h-4.5 text-slate-400" />
        </span>
        <div>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">No active streak</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Scan today to start one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md">
        <Zap className="w-4.5 h-4.5 text-white" />
      </span>
      <div>
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
          {streak}-day scan streak
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Keep it going.</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Focus timer — the elapsed time on the page.
//
// A live-updating timer gives the dashboard a sense of being live
// without polling the API.
// ---------------------------------------------------------------------------
export const LiveClock = ({ date }) => (
  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
    <Gauge className="w-3.5 h-3.5" />
    <span className="font-mono tabular-nums">
      {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  </div>
);

export default Panel;
