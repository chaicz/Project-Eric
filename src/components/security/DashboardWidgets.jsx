import React, { useMemo, useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Flame,
  AlertTriangle,
  Eye,
  ShieldCheck,
  Info,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Severity configuration shared by the dashboard widgets.
//
// One table drives every colour, label and icon so a severity can never
// look different in two places on the same page.
// ---------------------------------------------------------------------------
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

export const SEVERITY_META = {
  critical: {
    label: 'Critical',
    short: 'Crit',
    Icon: Flame,
    text: 'text-red-600 dark:text-red-400',
    textStrong: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-500',
    bgSoft: 'bg-red-50 dark:bg-red-500/10',
    bgGlass: 'bg-red-50/70 dark:bg-red-500/10',
    border: 'border-red-200 dark:border-red-500/30',
    borderStrong: 'border-red-300 dark:border-red-500/50',
    ring: 'ring-red-400/30',
    gradient: 'from-red-500 to-rose-600',
    bar: 'bg-gradient-to-r from-red-600 to-rose-500',
    dot: 'bg-red-500',
    glow: 'bg-red-500/20',
  },
  high: {
    label: 'High',
    short: 'High',
    Icon: AlertTriangle,
    text: 'text-amber-600 dark:text-amber-400',
    textStrong: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-500',
    bgSoft: 'bg-amber-50 dark:bg-amber-500/10',
    bgGlass: 'bg-amber-50/70 dark:bg-amber-500/10',
    border: 'border-amber-200 dark:border-amber-500/30',
    borderStrong: 'border-amber-300 dark:border-amber-500/50',
    ring: 'ring-amber-400/30',
    gradient: 'from-amber-500 to-orange-500',
    bar: 'bg-gradient-to-r from-amber-500 to-orange-500',
    dot: 'bg-amber-500',
    glow: 'bg-amber-500/20',
  },
  medium: {
    label: 'Medium',
    short: 'Med',
    Icon: AlertTriangle,
    text: 'text-yellow-600 dark:text-yellow-400',
    textStrong: 'text-yellow-700 dark:text-yellow-300',
    bg: 'bg-yellow-500',
    bgSoft: 'bg-yellow-50 dark:bg-yellow-500/10',
    bgGlass: 'bg-yellow-50/70 dark:bg-yellow-500/10',
    border: 'border-yellow-200 dark:border-yellow-500/30',
    borderStrong: 'border-yellow-300 dark:border-yellow-500/50',
    ring: 'ring-yellow-400/30',
    gradient: 'from-yellow-500 to-amber-500',
    bar: 'bg-gradient-to-r from-yellow-500 to-amber-400',
    dot: 'bg-yellow-500',
    glow: 'bg-yellow-500/20',
  },
  low: {
    label: 'Low',
    short: 'Low',
    Icon: Eye,
    text: 'text-blue-600 dark:text-blue-400',
    textStrong: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-500',
    bgSoft: 'bg-blue-50 dark:bg-blue-500/10',
    bgGlass: 'bg-blue-50/70 dark:bg-blue-500/10',
    border: 'border-blue-200 dark:border-blue-500/30',
    borderStrong: 'border-blue-300 dark:border-blue-500/50',
    ring: 'ring-blue-400/30',
    gradient: 'from-blue-500 to-sky-500',
    bar: 'bg-gradient-to-r from-blue-500 to-sky-400',
    dot: 'bg-blue-500',
    glow: 'bg-blue-500/20',
  },
};

export const severityMeta = (severity) =>
  SEVERITY_META[String(severity || '').toLowerCase()] || SEVERITY_META.low;

// ---------------------------------------------------------------------------
// Risk radar — an SVG polar chart of the OWASP category distribution.
//
// A radar chart is the right shape here because each axis is the same unit
// (a finding count) and the reader's question is "which category is the
// worst", which a radar answers at a glance.
// ---------------------------------------------------------------------------
export const RiskRadar = ({
  data = [],
  size = 220,
  onSelect,
  activeId = null,
}) => {
  const points = useMemo(() => {
    const list = data.slice(0, 10);
    const max = Math.max(1, ...list.map((d) => d.value || 0));
    const radius = size / 2 - 26;
    const cx = size / 2;
    const cy = size / 2;

    return list.map((d, i) => {
      // Start the first spoke at the top and walk clockwise.
      const angle = (Math.PI * 2 * i) / list.length - Math.PI / 2;
      const ratio = (d.value || 0) / max;
      return {
        ...d,
        id: d.id,
        value: d.value || 0,
        max,
        x: cx + Math.cos(angle) * radius * ratio,
        y: cy + Math.sin(angle) * radius * ratio,
        labelX: cx + Math.cos(angle) * (radius + 15),
        labelY: cy + Math.sin(angle) * (radius + 15),
        axisX: cx + Math.cos(angle) * radius,
        axisY: cy + Math.sin(angle) * radius,
        angle,
      };
    });
  }, [data, size]);

  if (points.length < 3) {
    return (
      <div
        className="flex items-center justify-center text-center text-xs text-slate-400 dark:text-slate-500"
        style={{ height: size }}
      >
        Not enough category data to plot.
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const polygon = points.map((p) => `${p.x},${p.y}`).join(' ');
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="relative flex items-center justify-center" style={{ height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <defs>
          <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.16" />
          </linearGradient>
        </defs>

        {/* Grid rings */}
        {rings.map((ratio) => {
          const radius = (size / 2 - 26) * ratio;
          const ringPoints = points
            .map((_, i) => {
              const angle = (Math.PI * 2 * i) / points.length - Math.PI / 2;
              return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
            })
            .join(' ');
          return (
            <polygon
              key={ratio}
              points={ringPoints}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-slate-200 dark:text-slate-700"
              strokeDasharray={ratio === 1 ? undefined : '3 4'}
            />
          );
        })}

        {/* Spokes */}
        {points.map((p) => (
          <line
            key={`axis-${p.id}`}
            x1={cx}
            y1={cy}
            x2={p.axisX}
            y2={p.axisY}
            stroke="currentColor"
            strokeWidth="1"
            className="text-slate-200 dark:text-slate-700"
          />
        ))}

        {/* The data polygon */}
        <polygon
          points={polygon}
          fill="url(#radarFill)"
          stroke="#f43f5e"
          strokeWidth="2"
          strokeLinejoin="round"
          className="transition-all duration-700"
        />

        {/* Vertices */}
        {points.map((p) => (
          <circle
            key={`dot-${p.id}`}
            cx={p.x}
            cy={p.y}
            r={activeId === p.id ? 5 : 3.5}
            fill="#fff"
            stroke="#f43f5e"
            strokeWidth="2"
            className="transition-all duration-200"
          />
        ))}

        {/* Axis labels */}
        {points.map((p) => (
          <text
            key={`label-${p.id}`}
            x={p.labelX}
            y={p.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`font-mono text-[9px] font-bold ${
              activeId === p.id
                ? 'fill-rose-600 dark:fill-rose-400'
                : 'fill-slate-500 dark:fill-slate-400'
            }`}
          >
            {p.id}
          </text>
        ))}
      </svg>

      {/* Clickable hit areas, so the chart is not just decoration. */}
      {onSelect && (
        <div className="absolute inset-0">
          {points.map((p) => (
            <button
              key={`hit-${p.id}`}
              type="button"
              onClick={() => onSelect(p.id)}
              title={`${p.id} · ${p.name || ''} — ${p.value} finding${p.value === 1 ? '' : 's'}`}
              aria-label={`${p.id} ${p.name || ''}: ${p.value} findings`}
              className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full hover:bg-rose-500/10 focus:bg-rose-500/20 transition-colors"
              style={{ left: `${(p.x / size) * 100}%`, top: `${(p.y / size) * 100}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stacked severity bar — one row per severity, with the share of the total.
// ---------------------------------------------------------------------------
export const SeverityBreakdown = ({ counts = {}, total = 0, onSelect }) => {
  const rows = SEVERITY_ORDER.map((key) => ({
    key,
    meta: SEVERITY_META[key],
    count: counts[key] || 0,
  }));

  const safeTotal = total || rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="space-y-2.5">
      {/* The combined bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        {safeTotal > 0 &&
          rows.map((row) =>
            row.count > 0 ? (
              <div
                key={row.key}
                className={`${row.meta.bar} transition-all duration-500`}
                style={{ width: `${(row.count / safeTotal) * 100}%` }}
                title={`${row.meta.label}: ${row.count}`}
              />
            ) : null
          )}
      </div>

      {/* The legend, doubling as a filter */}
      <div className="grid grid-cols-2 gap-2">
        {rows.map((row) => {
          const share = safeTotal > 0 ? Math.round((row.count / safeTotal) * 100) : 0;
          const clickable = typeof onSelect === 'function';
          return (
            <button
              key={row.key}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect(row.key)}
              className={`flex items-center gap-2 p-2 rounded-xl border transition-all text-left ${
                clickable ? 'hover:shadow-sm cursor-pointer' : 'cursor-default'
              } ${row.meta.bgSoft} ${row.meta.border}`}
            >
              <span className={`w-2 h-2 rounded-full ${row.meta.dot} flex-shrink-0`} />
              <span className={`text-xs font-bold ${row.meta.text}`}>{row.meta.label}</span>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 ml-auto tabular-nums">
                {row.count}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums w-8 text-right">
                {share}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Category matrix — all ten OWASP categories as a grid of tiles.
//
// A tile per category answers "where are my findings" in one screen, and
// the tiles are links into the Security page filtered to that category.
// ---------------------------------------------------------------------------
export const CategoryMatrix = ({ categories = [], onSelect, activeId = null }) => {
  const max = Math.max(1, ...categories.map((c) => c.count || 0));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {categories.map((cat) => {
        const count = cat.count || 0;
        const ratio = count / max;
        const level = count === 0 ? 'clean' : ratio > 0.66 ? 'critical' : ratio > 0.33 ? 'high' : 'medium';
        const tone = {
          clean: {
            ring: 'border-emerald-200 dark:border-emerald-500/25',
            chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            bar: 'bg-emerald-400',
          },
          medium: {
            ring: 'border-yellow-200 dark:border-yellow-500/25',
            chip: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
            bar: 'bg-yellow-400',
          },
          high: {
            ring: 'border-amber-200 dark:border-amber-500/25',
            chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
            bar: 'bg-amber-400',
          },
          critical: {
            ring: 'border-red-200 dark:border-red-500/25',
            chip: 'bg-red-500/15 text-red-700 dark:text-red-300',
            bar: 'bg-red-500',
          },
        }[level];

        const isActive = activeId === cat.id;
        const clickable = typeof onSelect === 'function';

        return (
          <button
            key={cat.id}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onSelect(cat.id)}
            title={`${cat.id} · ${cat.name} — ${count} finding${count === 1 ? '' : 's'}`}
            className={`relative overflow-hidden rounded-xl border p-2.5 text-left transition-all duration-300 ${
              tone.ring
            } ${clickable ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer' : 'cursor-default'} ${
              isActive ? 'ring-2 ring-blue-400/60' : ''
            } ${count === 0 ? 'bg-emerald-50/40 dark:bg-emerald-500/5' : 'bg-white dark:bg-slate-800/50'}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 flex-shrink-0">
                {cat.id}
              </span>
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums ml-auto flex-shrink-0 ${tone.chip}`}>
                {count}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 leading-tight line-clamp-1">
              {cat.name}
            </p>
            <div className="mt-1.5 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full ${tone.bar} transition-all duration-700`}
                style={{ width: `${Math.max(count > 0 ? 8 : 0, ratio * 100)}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Collapsible section — used for the "what to do next" panel.
// ---------------------------------------------------------------------------
export const CollapsiblePanel = ({
  title,
  subtitle,
  icon: Icon,
  badge,
  children,
  defaultOpen = false,
  tone = 'slate',
}) => {
  const [open, setOpen] = useState(defaultOpen);

  const tones = {
    slate: 'text-slate-500 dark:text-slate-400',
    rose: 'text-rose-600 dark:text-rose-400',
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    blue: 'text-blue-600 dark:text-blue-400',
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-800/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors text-left"
      >
        {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${tones[tone]}`} />}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{title}</span>
          {subtitle && (
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</span>
          )}
        </span>
        {badge !== undefined && badge !== null && (
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full tabular-nums">
            {badge}
          </span>
        )}
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-700/60">{children}</div>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Recommendation engine.
//
// This is a small, honest ruleset: each rule looks at the stored findings
// and produces one actionable line. Every rule states the condition it
// matched, so the user can see why it is being told to do something.
//
// Nothing here invents a number — a recommendation only appears when the
// data actually supports it.
// ---------------------------------------------------------------------------
export const buildRecommendations = ({ stats = {}, projects = [], categoryCounts = {}, vulnerabilities = [] }) => {
  const out = [];

  const critical = stats.criticalVulnerabilities || 0;
  const high = stats.highVulnerabilities || 0;

  if (critical > 0) {
    out.push({
      id: 'critical-first',
      severity: 'critical',
      title: `Fix ${critical} critical finding${critical === 1 ? '' : 's'} first`,
      detail:
        'Critical findings are reachable attack paths with a working exploit shape. They carry the most weight in your secure score, so clearing them moves it fastest.',
      action: 'Open critical findings',
      href: '/security?tab=findings',
    });
  }

  const weakCrypto = categoryCounts.A02 || 0;
  if (weakCrypto > 0) {
    out.push({
      id: 'crypto',
      severity: 'high',
      title: `${weakCrypto} cryptographic finding${weakCrypto === 1 ? '' : 's'} detected`,
      detail:
        'Weak hashing and hard-coded secrets sit in this category. Replace MD5/SHA1 password hashing with Argon2 or bcrypt, and move every secret into an environment variable.',
      action: 'Review crypto findings',
      href: '/security?tab=findings',
    });
  }

  const injection = categoryCounts.A03 || 0;
  if (injection > 0) {
    out.push({
      id: 'injection',
      severity: 'high',
      title: `${injection} injection finding${injection === 1 ? '' : 's'} to parameterise`,
      detail:
        'Every string-concatenated query is a candidate for parameterised binding. Fixing these usually removes the most repeated finding class across a codebase.',
      action: 'Review injection findings',
      href: '/security?tab=findings',
    });
  }

  const access = categoryCounts.A01 || 0;
  if (access > 0) {
    out.push({
      id: 'access',
      severity: 'medium',
      title: `${access} access-control finding${access === 1 ? '' : 's'} — add an ownership check`,
      detail:
        'Endpoints that read a record by id without confirming the caller owns it are the classic IDOR shape. One authorisation helper used consistently closes the whole class.',
      action: 'Review access findings',
      href: '/security?tab=findings',
    });
  }

  const openCount = vulnerabilities.filter((v) => v.status === 'open').length;
  const inProgress = vulnerabilities.filter((v) => v.status === 'in_progress').length;
  if (inProgress > 0) {
    out.push({
      id: 'wip',
      severity: 'medium',
      title: `${inProgress} finding${inProgress === 1 ? '' : 's'} already in progress`,
      detail:
        'You have started work on these. Finishing them moves them to remediated and lifts both the resolved count and the weekly score.',
      action: 'See in-progress work',
      href: '/security?tab=findings',
    });
  }

  const riskyProjects = projects.filter((p) => (p.criticalCount || 0) > 0);
  if (riskyProjects.length > 0) {
    out.push({
      id: 'risky-projects',
      severity: 'high',
      title: `${riskyProjects.length} project${riskyProjects.length === 1 ? '' : 's'} with critical findings`,
      detail: `${riskyProjects
        .slice(0, 3)
        .map((p) => p.name)
        .join(', ')}${riskyProjects.length > 3 ? ` and ${riskyProjects.length - 3} more` : ''} still carry critical findings. Start with the one that has the most.`,
      action: 'Review projects',
      href: '/security?tab=findings',
    });
  }

  if ((stats.scansCompleted || 0) === 0 && projects.length === 0) {
    out.push({
      id: 'first-scan',
      severity: 'low',
      title: 'Run your first scan',
      detail:
        'Nothing has been scanned yet. The OWASP scanner analyses code or SQL in your browser — nothing is uploaded and nothing is executed.',
      action: 'Open the scanner',
      href: '/owasp',
    });
  }

  if (out.length === 0 && openCount === 0) {
    out.push({
      id: 'clean',
      severity: 'low',
      title: 'Nothing outstanding',
      detail:
        'There are no open or in-progress findings in the stored data. Re-run a scan to confirm the current state of the code.',
      action: 'Run a scan',
      href: '/owasp',
    });
  }

  return out;
};

// ---------------------------------------------------------------------------
// Scan timeline — the stored scan history as a vertical timeline.
// ---------------------------------------------------------------------------
export const ScanTimeline = ({ scans = [], onSelect }) => {
  if (!scans.length) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
        No scans recorded yet.
      </p>
    );
  }

  const relative = (value) => {
    if (!value) return '';
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return '';
    const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative">
      {/* The spine */}
      <span className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-blue-400/60 via-slate-300/60 to-transparent dark:from-blue-500/40 dark:via-slate-700" />

      <div className="space-y-1">
        {scans.map((scan, index) => {
          const found = scan.vulnerabilitiesFound || 0;
          const tone =
            found === 0
              ? 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-500/20'
              : found >= 5
              ? 'bg-rose-500 ring-rose-100 dark:ring-rose-500/20'
              : 'bg-amber-500 ring-amber-100 dark:ring-amber-500/20';

          return (
            <button
              key={scan.id ?? index}
              type="button"
              onClick={() => onSelect?.(scan)}
              className="relative w-full flex items-start gap-3 pl-0 pr-2 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left group"
            >
              <span
                className={`relative z-10 w-8 h-8 rounded-full ring-4 ring-white dark:ring-slate-900 flex items-center justify-center flex-shrink-0 ${tone}`}
              >
                {found === 0 ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-white" />
                ) : (
                  <span className="text-[10px] font-bold text-white tabular-nums">{found}</span>
                )}
              </span>
              <span className="flex-1 min-w-0 pt-1">
                <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {scan.projectName || 'Untitled scan'}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {found === 0
                    ? 'Clean — no findings'
                    : `${found} finding${found === 1 ? '' : 's'}`}
                  {scan.codeLinesAnalyzed ? ` · ${Number(scan.codeLinesAnalyzed).toLocaleString()} lines` : ''}
                </span>
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0 pt-1.5 tabular-nums">
                {relative(scan.completedAt)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Health gauge — a semicircular arc for the secure score.
//
// The arc is easier to read than the full ring when it sits next to text,
// and the needle gives an unambiguous "where am I" reading.
// ---------------------------------------------------------------------------
export const HealthGauge = ({ score = 0, size = 190 }) => {
  const radius = size / 2 - 16;
  const cx = size / 2;
  // The arc is a semicircle, so its flat side sits on the baseline. The
  // baseline is placed above the bottom of the box so the score has room
  // to sit underneath without the needle crossing it.
  const baseline = radius + 12;
  const height = baseline + 46;
  const stroke = 12;
  const circumference = Math.PI * radius;

  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;

  // The colour follows the score bands used everywhere else.
  const color = clamped >= 85 ? '#10b981' : clamped >= 65 ? '#f59e0b' : '#ef4444';

  const needleAngle = -90 + (clamped / 100) * 180;

  return (
    <div className="relative" style={{ width: size, height }}>
      <svg width={size} height={height} viewBox={`0 0 ${size} ${height}`}>
        <path
          d={`M ${cx - radius} ${baseline} A ${radius} ${radius} 0 0 1 ${cx + radius} ${baseline}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="text-slate-200 dark:text-slate-700/70"
        />
        <path
          d={`M ${cx - radius} ${baseline} A ${radius} ${radius} 0 0 1 ${cx + radius} ${baseline}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-all duration-1000 ease-out"
        />

        {/* The needle */}
        <g
          style={{
            transform: `rotate(${needleAngle}deg)`,
            transformOrigin: `${cx}px ${baseline}px`,
            transition: 'transform 1s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <line
            x1={cx}
            y1={baseline}
            x2={cx}
            y2={baseline - radius + 12}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
        <circle cx={cx} cy={baseline} r="6" fill={color} className="transition-colors duration-500" />
      </svg>

      <div
        className="absolute inset-x-0 text-center"
        style={{ top: baseline - 16 }}
      >
        <span className="text-4xl font-bold tabular-nums leading-none" style={{ color }}>
          {clamped}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">/100</span>
      </div>
    </div>
  );
};

export default RiskRadar;
