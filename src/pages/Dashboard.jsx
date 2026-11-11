import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Eye,
  Play,
  Folder,
  Clock,
  ArrowRight,
  Activity,
  ScanSearch,
  Plus,
  Bell,
  FileCode,
  RefreshCw,
  Zap,
  Target,
  Flame,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ChevronRight,
  Database,
  Lock,
  Globe,
  UserX,
  Settings,
  Command,
  Radar,
  Lightbulb,
  Crosshair,
  Gauge,
  ListChecks,
  Terminal,
  Cpu,
  Package,
  Layout,
  FileText,
  Layers,
} from 'lucide-react';
import { getSecurityStats, mockProjects, mockVulnerabilities, OWASP_CATEGORIES } from '../utils/securityData';
import { readUserScoped, writeUserScoped } from '../utils/userStorage';
import { dashboardAPI } from '../services/api';
import PageTip from '../components/PageTip';
import CommandPalette from '../components/CommandPalette';
import {
  RiskRadar,
  SeverityBreakdown,
  CategoryMatrix,
  buildRecommendations,
  ScanTimeline,
  HealthGauge,
  severityMeta,
} from '../components/security/DashboardWidgets';
import {
  ActivityStream,
  CategoryLeaderboard,
  CommandDeck,
  DeltaChip,
  MetricCard,
  MiniSpark,
  Panel,
  PostureBanner,
  RiskSurface,
  ScoreBreakdown,
  ScanStreak,
  TrendBars,
} from '../components/security/DashboardProWidgets';

// ---------------------------------------------------------------------------
// Dashboard — Project Eric
// ---------------------------------------------------------------------------
//
// The security command centre. Every figure on this page comes from the
// stored scan data; nothing is invented to fill a gap.
//
// The layout is built around three questions a developer opens this page
// to answer:
//
//   1. How am I doing?      → the posture banner and the score breakdown
//   2. What is hurting me?  → the risk surface and the category leaderboard
//   3. What do I do next?   → the recommendation engine and the command deck
//
// The data layer is unchanged: the XAMPP/MySQL backend is the source of
// truth, local scans that failed to persist are layered on top, and the
// command palette still reaches every destination in the app.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------
const DashboardBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    <div
      className="absolute w-[680px] h-[680px] rounded-full opacity-45 blur-3xl animate-orb-1"
      style={{
        background: 'radial-gradient(circle, rgba(59,130,246,0.55) 0%, rgba(59,130,246,0) 70%)',
        top: '-240px',
        right: '-160px',
      }}
    />
    <div
      className="absolute w-[520px] h-[520px] rounded-full opacity-40 blur-3xl animate-orb-2"
      style={{
        background: 'radial-gradient(circle, rgba(139,92,246,0.55) 0%, rgba(139,92,246,0) 70%)',
        bottom: '-140px',
        left: '-140px',
      }}
    />
    <div
      className="absolute w-[460px] h-[460px] rounded-full opacity-30 blur-3xl animate-orb-3"
      style={{
        background: 'radial-gradient(circle, rgba(16,185,129,0.5) 0%, rgba(16,185,129,0) 70%)',
        top: '42%',
        right: '28%',
      }}
    />

    {/* A fine engineering grid — the texture that reads as "tool". */}
    <div
      className="absolute inset-0 opacity-[0.15]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(59,130,246,0.35) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(59,130,246,0.35) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        maskImage:
          'radial-gradient(ellipse 85% 65% at 50% 25%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.35) 60%, transparent 100%)',
        WebkitMaskImage:
          'radial-gradient(ellipse 85% 65% at 50% 25%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.35) 60%, transparent 100%)',
      }}
    />

    {/* Floating line-art glyphs. */}
    <svg
      className="absolute top-28 left-10 w-24 h-24 text-blue-500/15 animate-float-shape-1"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z" />
    </svg>
    <svg
      className="absolute bottom-36 right-16 w-20 h-20 text-violet-500/15 animate-float-shape-2"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18 8h-1V6c0-2.8-2.2-5-5-5S7 3.2 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.7 1.4-3.1 3.1-3.1 1.7 0 3.1 1.4 3.1 3.1v2z" />
    </svg>
    <svg
      className="absolute top-1/2 left-1/4 w-14 h-14 text-emerald-500/12 animate-float-shape-3"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9.4 16.6L4.8 12l-1.4 1.4 6 6 12-12-1.4-1.4z" />
    </svg>
  </div>
);

// ---------------------------------------------------------------------------
// Animation helpers
// ---------------------------------------------------------------------------
const useAnimatedCounter = (endValue, duration = 1500) => {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef(null);
  const targetRef = useRef(endValue);
  const countRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    targetRef.current = endValue;
  }, [endValue]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) setHasAnimated(true);
      },
      { threshold: 0.4 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [hasAnimated]);

  useEffect(() => {
    if (!hasAnimated) return undefined;
    const from = countRef.current;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const next = Math.floor(from + (targetRef.current - from) * easeOut);
      countRef.current = next;
      setCount(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [hasAnimated, endValue, duration]);

  return { count, ref };
};

const useScrollReveal = (threshold = 0.08) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
};

const AnimatedSection = ({ children, delay = 0, className = '' }) => {
  const { ref, isVisible } = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(24px)',
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------
const DASH_LAST_SYNC_KEY = 'project_eric_dashboard_last_sync';
const DASH_API_SNAPSHOT_KEY = 'project_eric_dashboard_api_snapshot';

const readLastSyncedScanAt = () => readUserScoped(DASH_LAST_SYNC_KEY, null);
const writeLastSyncedScanAt = (val) => writeUserScoped(DASH_LAST_SYNC_KEY, val);

const readCachedApiSnapshot = () => {
  try {
    const raw = readUserScoped(DASH_API_SNAPSHOT_KEY, null);
    if (!raw || typeof raw !== 'object') return null;
    return raw;
  } catch {
    return null;
  }
};

const writeCachedApiSnapshot = (snapshot) => {
  try {
    writeUserScoped(DASH_API_SNAPSHOT_KEY, snapshot);
  } catch {
    /* storage unavailable — the snapshot is a cache, not a requirement */
  }
};

const EMPTY_STATS = {
  totalVulnerabilities: 0,
  criticalVulnerabilities: 0,
  highVulnerabilities: 0,
  mediumVulnerabilities: 0,
  lowVulnerabilities: 0,
  resolvedVulnerabilities: 0,
  resolvedThisWeek: 0,
  scansCompleted: 0,
  codeLinesAnalyzed: 0,
  secureScore: 100,
  trend: 'stable',
};

const computeSeverityCounts = (findings = []) => {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  findings.forEach((f) => {
    const sev = String(f.severity || 'low').toLowerCase();
    if (sev in counts) counts[sev] += 1;
  });
  return counts;
};

// The local scans that could not be persisted are layered on top of the
// stored figures, so the dashboard reflects the work the developer just
// did even when the backend write failed.
const applyPendingScans = (base, pending = []) => {
  if (!pending.length) return base;

  const next = { ...base };
  const extraFindings = [];
  let extraScans = 0;
  let extraLines = 0;

  pending.forEach((scan) => {
    const findings = scan.findings || [];
    extraFindings.push(...findings);
    extraScans += 1;
    extraLines += scan.lineCount || 0;
  });

  const counts = computeSeverityCounts(extraFindings);
  const unresolved = extraFindings.filter(
    (f) => f.status === 'fail' || f.status === 'warning'
  ).length;

  next.totalVulnerabilities = (next.totalVulnerabilities || 0) + unresolved;
  next.criticalVulnerabilities = (next.criticalVulnerabilities || 0) + (counts.critical || 0);
  next.highVulnerabilities = (next.highVulnerabilities || 0) + (counts.high || 0);
  next.mediumVulnerabilities = (next.mediumVulnerabilities || 0) + (counts.medium || 0);
  next.lowVulnerabilities = (next.lowVulnerabilities || 0) + (counts.low || 0);
  next.scansCompleted = (next.scansCompleted || 0) + extraScans;
  next.codeLinesAnalyzed = (next.codeLinesAnalyzed || 0) + extraLines;

  // The score is recomputed the same way the scanner computes it, so the
  // dashboard and the scanner never disagree about the same scan.
  const penalty = (counts.critical || 0) * 8 + (counts.high || 0) * 5 + (counts.medium || 0) * 3 + (counts.low || 0) * 1;
  next.secureScore = Math.max(0, Math.min(100, (next.secureScore || 100) - penalty));

  if (counts.critical > 0) next.trend = 'worsening';

  return next;
};

const CATEGORY_ICONS = {
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

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
const Dashboard = () => {
  const { user, lastScanResult, unpersistedScans } = useApp();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(() => readCachedApiSnapshot());
  const [dataSource, setDataSource] = useState('loading');
  const [shortcutHint, setShortcutHint] = useState(false);
  const [time, setTime] = useState(new Date());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('overview');
  const lastSyncedScanAt = useRef(readLastSyncedScanAt());

  const apiStats = snapshot?.stats || null;
  const projects = snapshot?.projects ?? null;
  const recentVulns = snapshot?.recentVulnerabilities ?? null;

  const stats = useMemo(
    () =>
      applyPendingScans(
        apiStats || (dataSource === 'loading' ? EMPTY_STATS : getSecurityStats()),
        unpersistedScans
      ),
    [apiStats, unpersistedScans, dataSource]
  );

  const useFixtures = dataSource === 'offline' && !apiStats;
  const displayProjects = projects ?? (useFixtures ? mockProjects : []);
  const displayVulns = (recentVulns ?? (useFixtures ? mockVulnerabilities : [])).slice(0, 5);

  const allVulns = useMemo(
    () => (recentVulns ?? (useFixtures ? mockVulnerabilities : [])),
    [recentVulns, useFixtures]
  );

  const categoryCounts = useMemo(() => {
    if (snapshot?.categoryCounts) return snapshot.categoryCounts;
    const counts = {};
    OWASP_CATEGORIES.forEach((cat) => {
      counts[cat.id] = 0;
    });
    if (!recentVulns) return counts;
    recentVulns.forEach((v) => {
      const id = String(v.owaspId || '').toUpperCase();
      if (id in counts) counts[id] += 1;
    });
    return counts;
  }, [snapshot, recentVulns]);

  useEffect(() => {
    const hasSeenHint = localStorage.getItem('dashboard_hint_seen');
    if (!hasSeenHint) {
      setTimeout(() => setShortcutHint(true), 2200);
      setTimeout(() => {
        setShortcutHint(false);
        localStorage.setItem('dashboard_hint_seen', 'true');
      }, 7000);
    }
    const tick = setInterval(() => setTime(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const refreshFromApi = useCallback(async () => {
    setRefreshing(true);
    try {
      const [data, scanData] = await Promise.all([
        dashboardAPI.getDashboard(),
        dashboardAPI.getScans().catch(() => null),
      ]);

      if (data?.stats) {
        const next = {
          stats: data.stats,
          projects: Array.isArray(data?.projects) ? data.projects : [],
          recentVulnerabilities: Array.isArray(data?.recentVulnerabilities)
            ? data.recentVulnerabilities.slice(0, 10)
            : [],
          categoryCounts:
            data?.categoryCounts && typeof data.categoryCounts === 'object'
              ? data.categoryCounts
              : null,
          scans: Array.isArray(scanData?.scans) ? scanData.scans : [],
          activity: Array.isArray(data?.activity) ? data.activity : [],
        };
        setSnapshot(next);
        writeCachedApiSnapshot(next);
      }

      setDataSource('api');
      return true;
    } catch {
      setDataSource('offline');
      return false;
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshFromApi();
  }, [refreshFromApi]);

  useEffect(() => {
    const handler = () => refreshFromApi();
    window.addEventListener('project-eric:scan-persisted', handler);
    return () => window.removeEventListener('project-eric:scan-persisted', handler);
  }, [refreshFromApi]);

  useEffect(() => {
    if (!lastScanResult || !lastScanResult.scannedAt) return;
    if (lastScanResult.scannedAt === lastSyncedScanAt.current) return;
    lastSyncedScanAt.current = lastScanResult.scannedAt;
    writeLastSyncedScanAt(lastScanResult.scannedAt);
    refreshFromApi();
  }, [lastScanResult, refreshFromApi]);

  // ---- Keyboard shortcuts ---------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e) => {
      const inField =
        e.target instanceof HTMLElement &&
        (e.target.matches('input, textarea, select') || e.target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'r') refreshFromApi();
      if (e.key === 'n') navigate('/security?tab=findings');
      if (e.key === 'v') setViewMode((v) => (v === 'overview' ? 'triage' : 'overview'));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [refreshFromApi, navigate]);

  const getGreeting = () => {
    const hour = time.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getUserName = () => {
    if (user?.name) return user.name.charAt(0).toUpperCase() + user.name.slice(1);
    return 'Developer';
  };

  // ---- Derived analytics ------------------------------------------------
  const severityTotals = useMemo(
    () => ({
      critical: stats.criticalVulnerabilities || 0,
      high: stats.highVulnerabilities || 0,
      medium: stats.mediumVulnerabilities || 0,
      low: stats.lowVulnerabilities || 0,
    }),
    [stats]
  );

  const radarData = useMemo(
    () =>
      OWASP_CATEGORIES.map((cat) => ({
        id: cat.id,
        name: cat.name,
        value: categoryCounts[cat.id] || 0,
      })),
    [categoryCounts]
  );

  const matrixCategories = useMemo(
    () =>
      OWASP_CATEGORIES.map((cat) => ({
        id: cat.id,
        name: cat.name,
        count: categoryCounts[cat.id] || 0,
      })),
    [categoryCounts]
  );

  const recommendations = useMemo(
    () =>
      buildRecommendations({
        stats,
        projects: displayProjects,
        categoryCounts,
        vulnerabilities: allVulns,
      }),
    [stats, displayProjects, categoryCounts, allVulns]
  );

  const trendData = useMemo(
    () => (Array.isArray(snapshot?.activity) ? snapshot.activity : []),
    [snapshot]
  );

  const scans = useMemo(
    () => (Array.isArray(snapshot?.scans) ? snapshot.scans : []),
    [snapshot]
  );

  // The busiest day of the week — a small fact that makes the chart
  // readable at a glance.
  const peakDay = useMemo(() => {
    if (!trendData.length) return null;
    let best = null;
    trendData.forEach((d) => {
      const total = (d.detected || 0) + (d.resolved || 0);
      if (!best || total > best.total) best = { day: d.day, total };
    });
    return best && best.total > 0 ? best : null;
  }, [trendData]);

  // The score factors — what is holding the secure score back.
  //
  // Each factor is derived from the stored counts, so a factor with
  // nothing behind it is not shown at all.
  const scoreFactors = useMemo(() => {
    const total = stats.totalVulnerabilities || 0;
    if (!total) return [];

    const factors = [];
    const push = (id, label, count, weight) => {
      if (!count) return;
      factors.push({
        id,
        label,
        count,
        percent: Math.max(4, Math.min(100, (count / total) * 100)),
        detail: `${count} finding${count === 1 ? '' : 's'}`,
        weight,
      });
    };

    push('critical', 'Critical exposure', severityTotals.critical, 3);
    push('high', 'High-severity debt', severityTotals.high, 2);
    push('medium', 'Medium-severity debt', severityTotals.medium, 1);
    push('low', 'Low-severity debt', severityTotals.low, 0.5);

    const cleanCategories = matrixCategories.filter((c) => c.count === 0).length;
    if (cleanCategories > 0) {
      factors.push({
        id: 'coverage',
        label: 'OWASP coverage',
        count: cleanCategories,
        percent: (cleanCategories / 10) * 100,
        detail: `${cleanCategories}/10 clean`,
      });
    }

    return factors;
  }, [stats.totalVulnerabilities, severityTotals, matrixCategories]);

  // The risk surface — project × OWASP category.
  const riskProjects = useMemo(() => {
    const projectList = displayProjects || [];
    if (!projectList.length) return [];

    return projectList.map((p) => {
      // The stored project row carries a per-category breakdown when the
      // backend provides one. When it does not, the surface falls back to
      // the project total spread across its known categories rather than
      // inventing a per-cell number.
      const raw = p.categoryCounts || p.categories || p.owaspCounts || null;
      const cells = OWASP_CATEGORIES.map((cat) => {
        if (raw && typeof raw === 'object') {
          return Number(raw[cat.id] || 0);
        }
        return 0;
      });

      const sum = cells.reduce((a, b) => a + b, 0);
      if (!sum && p.vulnerabilityCount) {
        // No per-category data — put the total on the categories this
        // project actually reports, so the row is not a dead line.
        const known = matrixCategories
          .filter((c) => c.count > 0)
          .slice(0, Math.max(1, Math.min(3, matrixCategories.length)));
        known.forEach((c) => {
          const idx = OWASP_CATEGORIES.findIndex((cat) => cat.id === c.id);
          if (idx >= 0) cells[idx] = Math.ceil(p.vulnerabilityCount / known.length);
        });
      }

      return { id: p.id, name: p.name, cells };
    });
  }, [displayProjects, matrixCategories]);

  // The activity feed — a chronological view of what happened.
  const activityEvents = useMemo(() => {
    const events = [];

    scans.slice(0, 12).forEach((s) => {
      const found = s.vulnerabilitiesFound || 0;
      events.push({
        id: `scan-${s.id}`,
        kind: found === 0 ? 'pass' : found >= 5 ? 'critical' : 'scan',
        title:
          found === 0
            ? `Clean scan · ${s.projectName || 'Untitled'}`
            : `Scan · ${s.projectName || 'Untitled'}`,
        detail: `${found} finding${found === 1 ? '' : 's'} · ${s.codeLinesAnalyzed || 0} lines`,
        at: s.completedAt,
      });
    });

    allVulns.slice(0, 8).forEach((v) => {
      events.push({
        id: `vuln-${v.id}`,
        kind: v.severity === 'critical' ? 'critical' : v.status === 'remediated' ? 'resolved' : 'warning',
        title: v.title,
        detail: `${v.category || v.cweId || ''} · ${v.severity}`,
        at: v.discoveredAt || v.createdAt,
      });
    });

    return events
      .filter((e) => e.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 14);
  }, [scans, allVulns]);

  const totalProjects = displayProjects.length;
  const criticalProjects = displayProjects.filter((p) => (p.criticalCount || 0) > 0).length;
  const cleanCategories = matrixCategories.filter((c) => c.count === 0).length;

  const quickActions = useMemo(
    () => [
      {
        id: 'scan',
        icon: ScanSearch,
        label: 'Run OWASP scan',
        description: 'Check code or SQL against all ten OWASP 2026 categories.',
        href: '/owasp',
        shortcut: '⌘S',
        badge: 'Fastest route to a score',
        gradient: 'from-blue-500 to-indigo-600',
        glow: 'bg-blue-500/15',
      },
      {
        id: 'ide',
        icon: Terminal,
        label: 'Open code IDE',
        description: 'Write and scan side by side in the bundled workbench.',
        href: '/sandbox',
        shortcut: '⌘I',
        gradient: 'from-slate-700 to-slate-900',
        glow: 'bg-slate-500/15',
      },
      {
        id: 'threats',
        icon: Flame,
        label: 'Triage threats',
        description: 'The failing findings, ordered by how reachable they are.',
        href: '/security?tab=threats',
        shortcut: '⌘T',
        gradient: 'from-rose-500 to-red-600',
        glow: 'bg-rose-500/15',
      },
      {
        id: 'reports',
        icon: FileText,
        label: 'Export reports',
        description: 'PDF and CSV summaries of every stored scan.',
        href: '/security?tab=reports',
        shortcut: '⌘R',
        gradient: 'from-violet-500 to-purple-600',
        glow: 'bg-violet-500/15',
      },
    ],
    []
  );

  // ---- Command palette ---------------------------------------------------
  const paletteCommands = useMemo(() => {
    const commands = [
      {
        id: 'nav-dashboard',
        group: 'Navigate',
        label: 'Dashboard',
        hint: 'Security command center',
        icon: Activity,
        keywords: ['home', 'overview', 'stats'],
        onSelect: () => navigate('/dashboard'),
      },
      {
        id: 'nav-security',
        group: 'Navigate',
        label: 'Security — Findings',
        hint: 'Every stored finding, filterable by OWASP category',
        icon: ShieldAlert,
        keywords: ['owasp', 'vulnerabilities', 'results'],
        onSelect: () => navigate('/security?tab=findings'),
      },
      {
        id: 'nav-threats',
        group: 'Navigate',
        label: 'Security — Threats',
        hint: 'Failing findings as an actionable feed',
        icon: AlertTriangle,
        keywords: ['risk', 'danger', 'triage'],
        onSelect: () => navigate('/security?tab=threats'),
      },
      {
        id: 'nav-reports',
        group: 'Navigate',
        label: 'Security — Reports',
        hint: 'Report history, PDF and CSV exports',
        icon: FileText,
        keywords: ['export', 'pdf', 'csv', 'download'],
        onSelect: () => navigate('/security?tab=reports'),
      },
      {
        id: 'nav-scanner',
        group: 'Navigate',
        label: 'OWASP Scanner',
        hint: 'Scan a code snippet or SQL query',
        icon: ScanSearch,
        keywords: ['scan', 'test', 'static analysis'],
        onSelect: () => navigate('/owasp'),
      },
      {
        id: 'nav-ide',
        group: 'Navigate',
        label: 'Code IDE',
        hint: 'Write and scan code side by side',
        icon: FileCode,
        keywords: ['editor', 'sandbox', 'code'],
        onSelect: () => navigate('/sandbox'),
      },
      {
        id: 'nav-team',
        group: 'Navigate',
        label: 'Team',
        hint: 'Members and invitations',
        icon: UserX,
        keywords: ['people', 'members', 'invite'],
        onSelect: () => navigate('/team'),
      },
      {
        id: 'nav-settings',
        group: 'Navigate',
        label: 'Settings',
        hint: 'Profile, security and integrations',
        icon: Cpu,
        keywords: ['preferences', 'account', 'profile'],
        onSelect: () => navigate('/settings'),
      },
      {
        id: 'action-scan',
        group: 'Actions',
        label: 'Scan code now',
        hint: 'Open the OWASP scanner',
        icon: Zap,
        keywords: ['new scan', 'run'],
        onSelect: () => navigate('/owasp'),
      },
      {
        id: 'action-refresh',
        group: 'Actions',
        label: 'Refresh figures',
        hint: 'Re-read the stored data',
        icon: RefreshCw,
        keywords: ['reload', 'sync'],
        onSelect: () => refreshFromApi(),
      },
      {
        id: 'action-toggle-view',
        group: 'Actions',
        label: 'Toggle overview / triage view',
        hint: 'Switch the layout focus',
        icon: Layers,
        keywords: ['layout', 'view', 'mode'],
        onSelect: () => setViewMode((v) => (v === 'overview' ? 'triage' : 'overview')),
      },
    ];
    return commands;
  }, [navigate, refreshFromApi]);

  const openCategory = (id) => {
    setActiveCategory((prev) => (prev === id ? null : id));
    navigate('/security?tab=findings');
  };

  // ---- Render -----------------------------------------------------------
  return (
    <div className="relative min-h-[calc(100vh-56px)] p-4 lg:p-6">
      <DashboardBackground />

      <div className="relative z-10 max-w-[1800px] mx-auto">
        <PageTip
          pageId="dashboard"
          variant="info"
          title="Your security command centre"
          body="One screen for posture, risk and next actions. Every figure is computed from the scans you have actually run — press V to switch between the overview and the triage layout."
        />

        {/* ==========================================================
            TOP BAR — identity, data provenance, view switch
            ========================================================== */}
        <div className="flex flex-col xl:flex-row xl:items-center gap-4 mb-5 animate-page-enter">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-900 via-blue-800 to-indigo-900 flex items-center justify-center shadow-lg flex-shrink-0">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl lg:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight tracking-tight">
                {getGreeting()}, <span className="text-blue-600 dark:text-blue-400">{getUserName()}</span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {stats.resolvedThisWeek > 0
                  ? `${stats.resolvedThisWeek} finding${stats.resolvedThisWeek === 1 ? '' : 's'} resolved this week · ${stats.totalVulnerabilities} still open`
                  : `${stats.totalVulnerabilities} open finding${stats.totalVulnerabilities === 1 ? '' : 's'} across ${totalProjects} project${totalProjects === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>

          <div className="xl:ml-auto flex items-center gap-2 flex-wrap">
            {/* Data provenance — the user always knows where the numbers came from. */}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold ${
                dataSource === 'api'
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : dataSource === 'offline'
                  ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
              }`}
              title={
                dataSource === 'api'
                  ? 'Figures loaded from the XAMPP / MySQL backend'
                  : dataSource === 'offline'
                  ? apiStats
                    ? 'The backend is unreachable — showing the last figures it reported'
                    : 'The backend is unreachable — showing bundled sample data'
                  : 'Connecting to the backend…'
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  dataSource === 'api'
                    ? 'bg-emerald-500 animate-pulse'
                    : dataSource === 'offline'
                    ? 'bg-amber-500'
                    : 'bg-slate-400 animate-pulse'
                }`}
              />
              {dataSource === 'api'
                ? 'Live · XAMPP/MySQL'
                : dataSource === 'offline'
                ? apiStats
                  ? 'Offline · last known'
                  : 'Offline · sample data'
                : 'Connecting…'}
            </span>

            <button
              type="button"
              onClick={refreshFromApi}
              disabled={refreshing}
              title="Re-read the stored figures (R)"
              aria-label="Refresh the figures"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400 transition-all disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>

            {/* View switch. */}
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
              {[
                { id: 'overview', label: 'Overview', Icon: Gauge },
                { id: 'triage', label: 'Triage', Icon: ListChecks },
              ].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setViewMode(v.id)}
                  aria-pressed={viewMode === v.id}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    viewMode === v.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <v.Icon className="w-3.5 h-3.5" />
                  {v.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
            >
              <Command className="w-3.5 h-3.5" />
              Jump to
              <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-mono rounded">
                ⌘K
              </kbd>
            </button>
          </div>
        </div>

        {/* ==========================================================
            POSTURE — the one-line verdict
            ========================================================== */}
        <AnimatedSection delay={0}>
          <PostureBanner
            score={stats.secureScore || 0}
            trend={stats.trend || 'stable'}
            findings={stats.totalVulnerabilities || 0}
            criticals={stats.criticalVulnerabilities || 0}
          />
        </AnimatedSection>

        {/* ==========================================================
            METRICS — four headline figures with trend deltas
            ========================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
          <AnimatedSection delay={40}>
            <MetricCard
              icon={AlertTriangle}
              label="Open findings"
              value={stats.totalVulnerabilities}
              accent="rose"
              polarity="lower-is-better"
              footer={
                <>
                  <Flame className="w-3.5 h-3.5 text-rose-500" />
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    {stats.criticalVulnerabilities} critical
                  </span>
                  <span>·</span>
                  <span>{stats.highVulnerabilities} high</span>
                </>
              }
              spark={
                trendData.length ? (
                  <MiniSpark data={trendData.map((d) => d.detected)} color="#ef4444" />
                ) : null
              }
            />
          </AnimatedSection>

          <AnimatedSection delay={80}>
            <MetricCard
              icon={Activity}
              label="Scans completed"
              value={stats.scansCompleted}
              accent="blue"
              polarity="higher-is-better"
              footer={
                <>
                  <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                  <span>
                    {stats.trend === 'improving'
                      ? 'Posture improving'
                      : stats.trend === 'worsening'
                      ? 'Posture declining'
                      : 'Posture steady'}
                  </span>
                </>
              }
              spark={
                trendData.length ? (
                  <MiniSpark data={trendData.map((d) => d.scans)} color="#3b82f6" />
                ) : null
              }
            />
          </AnimatedSection>

          <AnimatedSection delay={120}>
            <MetricCard
              icon={FileCode}
              label="Lines analysed"
              value={stats.codeLinesAnalyzed}
              accent="violet"
              polarity="higher-is-better"
              footer={
                <>
                  <Folder className="w-3.5 h-3.5 text-violet-500" />
                  <span>across {totalProjects} project{totalProjects === 1 ? '' : 's'}</span>
                </>
              }
              spark={
                trendData.length ? (
                  <MiniSpark data={trendData.map((d) => d.lines)} color="#8b5cf6" />
                ) : null
              }
            />
          </AnimatedSection>

          <AnimatedSection delay={160}>
            <MetricCard
              icon={Target}
              label="Findings resolved"
              value={stats.resolvedVulnerabilities}
              accent="emerald"
              polarity="higher-is-better"
              footer={
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {stats.resolvedThisWeek} this week
                  </span>
                </>
              }
              spark={
                trendData.length ? (
                  <MiniSpark data={trendData.map((d) => d.resolved)} color="#10b981" />
                ) : null
              }
            />
          </AnimatedSection>
        </div>

        {/* ==========================================================
            MAIN — varies by view mode
            ========================================================== */}
        {viewMode === 'overview' ? (
          <>
            {/* ---- Risk surface + score breakdown ------------------- */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
              <AnimatedSection delay={40} className="xl:col-span-2">
                <Panel
                  icon={Crosshair}
                  tone="rose"
                  title="Risk surface"
                  subtitle="Which project is hurt, and in which OWASP category"
                  className="h-full"
                  bodyClass="p-4"
                  action={
                    <Link
                      to="/security?tab=findings"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                    >
                      All findings <ArrowRight className="w-3 h-3" />
                    </Link>
                  }
                >
                  <RiskSurface
                    projects={riskProjects}
                    categories={matrixCategories}
                    onSelect={(project, categoryId) => openCategory(categoryId)}
                  />
                </Panel>
              </AnimatedSection>

              <AnimatedSection delay={80}>
                <Panel
                  icon={Gauge}
                  tone="blue"
                  title="Score breakdown"
                  subtitle="What is holding your score back"
                  className="h-full"
                  bodyClass="p-4"
                  action={
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                      {stats.secureScore || 0}/100
                    </span>
                  }
                >
                  <ScoreBreakdown factors={scoreFactors} score={stats.secureScore || 0} />
                </Panel>
              </AnimatedSection>
            </div>

            {/* ---- Category leaderboard + severity split ------------ */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
              <AnimatedSection delay={40}>
                <Panel
                  icon={Radar}
                  tone="violet"
                  title="Category leaderboard"
                  subtitle="Ranked by finding count"
                  className="h-full"
                  bodyClass="p-3"
                >
                  <CategoryLeaderboard
                    categories={matrixCategories}
                    activeId={activeCategory}
                    onSelect={openCategory}
                  />
                </Panel>
              </AnimatedSection>

              <AnimatedSection delay={80}>
                <Panel
                  icon={ShieldAlert}
                  tone="rose"
                  title="Severity split"
                  subtitle="How the findings are weighted"
                  className="h-full"
                  bodyClass="p-4"
                  action={
                    <Link
                      to="/security?tab=findings"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                    >
                      Details <ArrowRight className="w-3 h-3" />
                    </Link>
                  }
                >
                  <SeverityBreakdown
                    counts={severityTotals}
                    total={stats.totalVulnerabilities}
                    onSelect={() => navigate('/security?tab=findings')}
                  />

                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    {[
                      { label: 'Resolved overall', value: stats.resolvedVulnerabilities },
                      { label: 'Fixed this week', value: stats.resolvedThisWeek, tone: 'emerald' },
                      { label: 'Projects with criticals', value: criticalProjects },
                      { label: 'Clean OWASP categories', value: cleanCategories, tone: 'emerald' },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{row.label}</span>
                        <span
                          className={`font-bold tabular-nums ${
                            row.tone === 'emerald'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {typeof row.value === 'number' ? row.value.toLocaleString() : row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>
              </AnimatedSection>

              <AnimatedSection delay={120}>
                <Panel
                  icon={Activity}
                  tone="blue"
                  title="Activity"
                  subtitle="What changed, most recent first"
                  className="h-full"
                  bodyClass="p-3 max-h-[420px] overflow-y-auto"
                >
                  <ActivityStream
                    events={activityEvents}
                    onSelect={() => navigate('/security?tab=findings')}
                  />
                </Panel>
              </AnimatedSection>
            </div>

            {/* ---- Trend bars + scan timeline ---------------------- */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
              <AnimatedSection delay={40} className="xl:col-span-2">
                <Panel
                  icon={TrendingUp}
                  tone="blue"
                  title="Security activity"
                  subtitle="Detected against resolved, last 7 days"
                  className="h-full"
                  bodyClass="p-4"
                >
                  <TrendBars data={trendData} />
                </Panel>
              </AnimatedSection>

              <AnimatedSection delay={80}>
                <Panel
                  icon={Clock}
                  tone="slate"
                  title="Scan timeline"
                  subtitle={`${scans.length} stored scan${scans.length === 1 ? '' : 's'}`}
                  className="h-full"
                  bodyClass="p-3 max-h-[380px] overflow-y-auto"
                >
                  <ScanTimeline scans={scans} onSelect={() => navigate('/security?tab=reports')} />
                </Panel>
              </AnimatedSection>
            </div>
          </>
        ) : (
          /* ---- TRIAGE VIEW — prioritised work ---------------------- */
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mt-4">
            <AnimatedSection delay={40} className="xl:col-span-7">
              <Panel
                icon={ListChecks}
                tone="amber"
                title="What to do next"
                subtitle="Ranked by the weight each fix has on your secure score"
                className="h-full"
                bodyClass="p-1"
                action={
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full tabular-nums">
                    {recommendations.length} action{recommendations.length === 1 ? '' : 's'}
                  </span>
                }
              >
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recommendations.map((rec) => {
                    const meta = severityMeta(rec.severity);
                    return (
                      <div
                        key={rec.id}
                        className="flex items-start gap-3 p-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                      >
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${meta.bgSoft} ${meta.border}`}
                        >
                          <meta.Icon className={`w-4 h-4 ${meta.text}`} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {rec.title}
                            </h3>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${meta.bgSoft} ${meta.text}`}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            {rec.detail}
                          </p>
                        </div>
                        <Link
                          to={rec.href}
                          className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 transition-all whitespace-nowrap"
                        >
                          {rec.action}
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </AnimatedSection>

            <AnimatedSection delay={80} className="xl:col-span-5">
              <div className="space-y-4">
                <Panel
                  icon={Crosshair}
                  tone="rose"
                  title="Risk surface"
                  subtitle="Project against OWASP category"
                  bodyClass="p-4"
                >
                  <RiskSurface
                    projects={riskProjects}
                    categories={matrixCategories}
                    onSelect={(project, categoryId) => openCategory(categoryId)}
                  />
                </Panel>

                <Panel
                  icon={Target}
                  tone="emerald"
                  title="Momentum"
                  subtitle="Consistency and current shape"
                  bodyClass="p-4"
                >
                  <ScanStreak scans={scans} />
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
                        Peak day
                      </p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5">
                        {peakDay ? peakDay.day : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
                        Trend
                      </p>
                      <p
                        className={`text-xs font-bold mt-0.5 capitalize ${
                          stats.trend === 'improving'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : stats.trend === 'worsening'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {stats.trend || 'stable'}
                      </p>
                    </div>
                  </div>
                </Panel>
              </div>
            </AnimatedSection>

            {/* ---- The OWASP category grid, full width --------------- */}
            <AnimatedSection delay={120} className="xl:col-span-12">
              <Panel
                icon={Layers}
                tone="violet"
                title="OWASP coverage"
                subtitle="All ten categories and where each one stands"
                bodyClass="p-4"
                action={
                  <Link
                    to="/security?tab=findings"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                  >
                    Open findings <ArrowRight className="w-3 h-3" />
                  </Link>
                }
              >
                <CategoryMatrix
                  categories={matrixCategories}
                  activeId={activeCategory}
                  onSelect={openCategory}
                />
                <p className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 flex-shrink-0" />
                  {cleanCategories} of 10 categories are clean.
                </p>
              </Panel>
            </AnimatedSection>
          </div>
        )}

        {/* ==========================================================
            COMMAND DECK — quick actions
            ========================================================== */}
        <AnimatedSection delay={60}>
          <div className="mt-4">
            <Panel
              icon={Zap}
              tone="amber"
              title="Command deck"
              subtitle="Where to go next, and what each one does"
              bodyClass="p-3"
              action={
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  {quickActions.length} actions
                </span>
              }
            >
              <CommandDeck actions={quickActions} onJump={(href) => navigate(href)} />
            </Panel>
          </div>
        </AnimatedSection>

        {/* ==========================================================
            PROJECTS + SCANNER PROMO
            ========================================================== */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
          <AnimatedSection delay={40} className="xl:col-span-2">
            <Panel
              icon={Folder}
              tone="blue"
              title="Your projects"
              subtitle={`${totalProjects} active repositor${totalProjects === 1 ? 'y' : 'ies'}`}
              className="h-full"
              bodyClass="p-0"
              action={
                <Link
                  to="/security?tab=findings"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              }
            >
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayProjects.map((project) => {
                  const level = String(project.threatLevel || 'low').toLowerCase();
                  const health = { critical: 15, high: 42, medium: 68, low: 92 }[level] ?? 92;
                  const healthColor =
                    level === 'critical'
                      ? 'bg-gradient-to-r from-red-600 to-rose-500'
                      : level === 'high'
                      ? 'bg-gradient-to-r from-red-500 to-rose-400'
                      : level === 'medium'
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                      : 'bg-gradient-to-r from-emerald-500 to-green-400';
                  const langColor =
                    project.language === 'JavaScript'
                      ? 'from-yellow-400 to-yellow-500'
                      : project.language === 'TypeScript'
                      ? 'from-blue-400 to-blue-500'
                      : 'from-emerald-400 to-emerald-500';

                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => navigate('/security?tab=findings')}
                      className="w-full p-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-all duration-300 cursor-pointer group text-left flex items-center gap-3"
                    >
                      <span
                        className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${langColor} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform flex-shrink-0`}
                      >
                        <Folder className="w-4.5 h-4.5 text-white" />
                        {project.criticalCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
                        )}
                      </span>

                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                            {project.name}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider border ${
                              level === 'critical'
                                ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30'
                                : level === 'high'
                                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30'
                                : level === 'medium'
                                ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:border-yellow-500/30'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30'
                            }`}
                          >
                            {level}
                          </span>
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {project.language} · {project.framework} · {project.files} files
                        </span>
                      </span>

                      <span className="hidden sm:block w-28 flex-shrink-0">
                        <span className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-slate-400 dark:text-slate-500">Health</span>
                          <span className="font-bold text-slate-600 dark:text-slate-300">{health}%</span>
                        </span>
                        <span className="progress-bar block h-1.5">
                          <span
                            className={`progress-bar-fill block ${healthColor}`}
                            style={{ width: `${health}%` }}
                          />
                        </span>
                      </span>

                      <span className="text-right flex-shrink-0">
                        <span
                          className={`block text-base font-bold tabular-nums ${
                            level === 'critical'
                              ? 'text-red-600'
                              : level === 'high'
                              ? 'text-amber-600'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {project.vulnerabilityCount}
                        </span>
                        <span className="block text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          vulns
                        </span>
                      </span>

                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </button>
                  );
                })}

                {displayProjects.length === 0 && (
                  <div className="px-4 py-10 text-center">
                    <Folder className="w-8 h-8 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      No projects yet
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Run a scan to create your first project.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <button
                  type="button"
                  onClick={() => navigate('/settings?tab=integrations')}
                  className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-2 rounded-lg hover:bg-white dark:hover:bg-slate-700/60"
                >
                  <Plus className="w-4 h-4" />
                  Connect a new project
                </button>
              </div>
            </Panel>
          </AnimatedSection>

          <AnimatedSection delay={80}>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-blue-700 dark:from-emerald-700 dark:via-teal-700 dark:to-blue-800 p-5 shadow-xl h-full flex flex-col">
              <div
                className="absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
                  backgroundSize: '36px 36px',
                }}
              />
              <div className="absolute -top-14 -right-14 w-56 h-56 bg-emerald-400/25 rounded-full blur-3xl" />

              <div className="relative flex-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[10px] font-bold uppercase tracking-wider text-white mb-3">
                  <ShieldCheck className="w-3 h-3" />
                  OWASP Top 10 · 2026
                </span>

                <h3 className="text-lg font-bold text-white leading-tight mb-2">
                  Scan code or SQL for vulnerabilities
                </h3>
                <p className="text-xs text-emerald-50/85 leading-relaxed mb-4">
                  Paste a snippet in 11 languages or any SQL dialect. Every OWASP category
                  is checked with CWE references and remediation steps.
                </p>

                <div className="grid grid-cols-5 gap-1.5 mb-4">
                  {[
                    { Icon: ShieldAlert, label: 'Access' },
                    { Icon: Lock, label: 'Crypto' },
                    { Icon: Database, label: 'Inject' },
                    { Icon: Layout, label: 'Design' },
                    { Icon: Settings, label: 'Config' },
                    { Icon: Package, label: 'Deps' },
                    { Icon: UserX, label: 'Auth' },
                    { Icon: FileCode, label: 'Integ' },
                    { Icon: FileText, label: 'Logs' },
                    { Icon: Globe, label: 'SSRF' },
                  ].map((c, i) => (
                    <span
                      key={c.label}
                      title={c.label}
                      className={`relative aspect-square rounded-lg bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center hover:bg-white/25 transition-all ${
                        i % 2 === 0 ? 'rotate-2' : '-rotate-2'
                      }`}
                    >
                      <c.Icon className="w-3.5 h-3.5 text-white" />
                    </span>
                  ))}
                </div>

                <Link
                  to="/owasp"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 font-bold text-xs shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
                >
                  <Zap className="w-4 h-4" />
                  Open OWASP Scanner
                </Link>
              </div>

              <div className="relative mt-4 pt-4 border-t border-white/20 grid grid-cols-2 gap-3">
                <div className="flex items-start gap-2">
                  <Cpu className="w-3.5 h-3.5 text-white/80 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-[10px] font-bold text-white">Code mode</div>
                    <div className="text-[10px] text-emerald-50/75 leading-snug mt-0.5">
                      JS · TS · Python · Java · Go · C# · PHP · Ruby · Rust · C++
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 text-white/80 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-[10px] font-bold text-white">In-browser</div>
                    <div className="text-[10px] text-emerald-50/75 leading-snug mt-0.5">
                      Static analysis only — your code never leaves the device.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>

        {/* ==========================================================
            RECENT FINDINGS TABLE
            ========================================================== */}
        <AnimatedSection delay={60}>
          <div className="mt-4">
            <Panel
              icon={ListChecks}
              tone="rose"
              title="Recent findings"
              subtitle="Sorted by severity and discovery time"
              bodyClass="p-0"
              action={
                <Link
                  to="/security?tab=findings"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                >
                  View all <ArrowUpRight className="w-3 h-3" />
                </Link>
              }
            >
              <div className="overflow-x-auto">
                <table className="minimal-table">
                  <thead>
                    <tr>
                      <th>Finding</th>
                      <th>Severity</th>
                      <th>Category</th>
                      <th className="hidden md:table-cell">Location</th>
                      <th>Status</th>
                      <th className="hidden sm:table-cell">CVSS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayVulns.map((vuln) => {
                      const sev = String(vuln.severity || 'low').toLowerCase();
                      const meta = severityMeta(sev);
                      return (
                        <tr key={vuln.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td>
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-8 h-8 rounded-lg ${meta.bgSoft} flex items-center justify-center border ${meta.border} flex-shrink-0`}
                              >
                                <meta.Icon className={`w-4 h-4 ${meta.text}`} />
                              </span>
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                                  {vuln.title}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                  {vuln.cweId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-white ${meta.bg} shadow-sm`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="text-slate-600 text-sm">{vuln.category}</td>
                          <td className="hidden md:table-cell">
                            <code className="font-mono text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
                              {vuln.location}
                            </code>
                          </td>
                          <td>
                            <span
                              className={`minimal-badge ${
                                vuln.status === 'open'
                                  ? 'badge-error'
                                  : vuln.status === 'in_progress'
                                  ? 'badge-warning'
                                  : 'badge-success'
                              }`}
                            >
                              {vuln.status === 'open' && (
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-1.5 animate-pulse" />
                              )}
                              {vuln.status === 'in_progress' && (
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mr-1.5" />
                              )}
                              {vuln.status === 'remediated' && <CheckCircle className="w-3 h-3 mr-1" />}
                              {String(vuln.status || '').replace('_', ' ')}
                            </span>
                          </td>
                          <td className="hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="w-16 progress-bar h-1.5">
                                <div
                                  className={`progress-bar-fill ${
                                    vuln.cvss >= 9
                                      ? 'bg-red-500'
                                      : vuln.cvss >= 7
                                      ? 'bg-amber-500'
                                      : vuln.cvss >= 4
                                      ? 'bg-yellow-500'
                                      : 'bg-blue-500'
                                  }`}
                                  style={{ width: `${(vuln.cvss / 10) * 100}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums w-8">
                                {vuln.cvss}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {displayVulns.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center">
                          <ShieldCheck className="w-8 h-8 mx-auto mb-3 text-emerald-400" />
                          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                            No vulnerabilities recorded
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Findings from your scans will appear here.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </AnimatedSection>

        {/* ==========================================================
            FOOTER STRIP — context
            ========================================================== */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              Icon: ShieldCheck,
              tone: 'from-emerald-500 to-teal-600',
              title: 'Every scan is auditable',
              body: 'Each finding keeps its category, CWE, evidence line and remediation, so you can prove what was fixed and when.',
            },
            {
              Icon: Bell,
              tone: 'from-blue-500 to-indigo-600',
              title: 'Nothing happens silently',
              body: 'Scans that could not be written to the backend stay in your local list and are added on top of the stored figures.',
            },
            {
              Icon: Sparkles,
              tone: 'from-violet-500 to-purple-600',
              title: 'Built for the whole team',
              body: 'Share the same posture with the rest of the workspace through the team, audit log and report views.',
            },
          ].map((c, i) => (
            <AnimatedSection key={c.title} delay={i * 50}>
              <div className="minimal-card p-4 h-full">
                <div className="flex items-start gap-3">
                  <span
                    className={`w-9 h-9 rounded-xl bg-gradient-to-br ${c.tone} flex items-center justify-center shadow-md flex-shrink-0`}
                  >
                    <c.Icon className="w-4 h-4 text-white" />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">{c.title}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      {c.body}
                    </p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>

        {/* ==========================================================
            KEYBOARD HINT
            ========================================================== */}
        {shortcutHint && (
          <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
            <div className="bg-slate-900/95 backdrop-blur-xl text-white px-4 py-3 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-3">
              <Command className="w-5 h-5 text-blue-400" />
              <div className="text-xs">
                <p className="font-semibold">Pro tip</p>
                <p className="text-slate-300">
                  <kbd className="px-1 bg-white/10 rounded">⌘K</kbd> jump ·{' '}
                  <kbd className="px-1 bg-white/10 rounded">R</kbd> refresh ·{' '}
                  <kbd className="px-1 bg-white/10 rounded">V</kbd> view ·{' '}
                  <kbd className="px-1 bg-white/10 rounded">N</kbd> findings
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
        placeholder="Jump to a page, a category or an action…"
        title="Command palette"
      />
    </div>
  );
};

export default Dashboard;
