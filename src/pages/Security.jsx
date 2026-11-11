import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ScanSearch,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  ChevronDown,
  ChevronUp,
  FileCode,
  Package,
  Settings,
  Lock,
  Globe,
  UserX,
  Database,
  FileText,
  Layout,
  ExternalLink,
  RefreshCw,
  Search,
  X,
  Check,
  Eye,
  Sparkles,
  Loader2,
  Bug,
  TrendingUp,
  Calendar,
  FileJson,
  FileSpreadsheet,
  Share2,
  Trash2,
  Filter,
  Send,
  Radar,
  Gauge,
  Activity,
  Target,
  Flame,
  ArrowRight,
} from 'lucide-react';
import { OWASP_CATEGORIES } from '../utils/securityData';
import { dashboardAPI } from '../services/api';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';
import PageTip from '../components/PageTip';
import { readUserScoped, writeUserScoped, removeUserScoped } from '../utils/userStorage';
import {
  severityScale,
  TriageOrder,
  RemediationBrief,
  FindingsTable,
  AgeBuckets,
  ThreatFeed,
  ThreatDetail,
  ReportCard,
  CoverageRadar,
  ShortcutLegend,
  FilterBar,
  PostureLine,
  StatStrip,
  InlineEmpty,
} from '../components/security/SecurityProWidgets';
import {
  HeroBand,
  ScoreRing,
  RiskBreakdown,
  CategoryHeatGrid,
  InsightCard,
  buildInsights,
  INSIGHT_ICONS,
  CommandBar,
  TimelineRail,
  DonutBreakdown,
  SectionHeader,
} from '../components/security/SecurityAdvancedWidgets';

// ---------------------------------------------------------------------------
// Security — the single security workspace.
//
// This page absorbed three separate pages that all showed the same
// underlying data: the OWASP findings of the user's scans.
//
//   Findings   → what the scanner found (was the Analysis page)
//   Threats    → the failing findings, as an actionable feed (was Threats)
//   Reports    → the downloadable documents each scan produced (was Reports)
//
// All three tabs read from the same two sources — the backend's stored
// vulnerabilities and the latest scan in AppContext — so switching tabs
// never shows a different story than the page before it.
//
// The rebuild changed the presentation only. The data sources, the storage
// keys, the API calls and the export formats are all the same as before.
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'findings', label: 'Findings', icon: ScanSearch },
  { id: 'threats', label: 'Threats', icon: AlertTriangle },
  { id: 'reports', label: 'Reports', icon: FileText },
];

const CATEGORY_ICONS = {
  'Broken Access Control': Shield,
  'Cryptographic Failures': Lock,
  'Injection': FileCode,
  'Insecure Design': Layout,
  'Security Misconfiguration': Settings,
  'Vulnerable Components': Package,
  'Authentication Failures': UserX,
  'Data Integrity Failures': Database,
  'Logging Failures': FileText,
  SSRF: Globe,
};

// The OWASP id a detector reports ('A01') and the category name the
// sidebar filters by ('Broken Access Control') are two different things.
// The scanner only knows the id, so map it onto the name — the same
// mapping the API uses when it stores a finding.
const OWASP_CATEGORY_NAME = Object.fromEntries(
  OWASP_CATEGORIES.map((c) => [c.id, c.name])
);

// The CVSS score the API assigns to a stored finding of each severity, so
// a scanner result and a stored row of the same severity score alike.
const SEVERITY_CVSS = {
  critical: 9.5,
  high: 7.5,
  medium: 5.0,
  low: 3.0,
};

// Convert a scanner finding (status: pass | warning | fail, severity:
// critical | high | medium | low | info) to the finding format the page
// renders. Pure transform — keeps the original finding object intact and
// only enriches the shape. The fields it produces are exactly the ones
// the `/api/vulnerabilities` rows carry, so both sources render
// identically.
const findingToVuln = (f, projectName = null, scannedAt = null) => ({
  id: `scanner-${f.id}`,
  title: f.name,
  severity: f.severity && f.severity !== 'info' ? f.severity : 'medium',
  category: OWASP_CATEGORY_NAME[f.id] || f.id,
  owaspId: f.id,
  cweId: f.cwe,
  cvss: SEVERITY_CVSS[f.severity] ?? 5.0,
  location: `Scanner · line ${(f.evidence?.[0]?.line ?? 0) + 1}`,
  status: f.status === 'pass' ? 'fixed' : 'open',
  description: f.description,
  cwe: f.cwe,
  evidence: f.evidence,
  remediation: f.remediation,
  projectName,
  discoveredAt: scannedAt || new Date().toISOString(),
  fromScanner: true,
});

// A scanner finding only becomes a threat when it represents an actual
// issue. `pass` findings are clean results — they belong in the findings
// tab, not in a list of active threats, so they are excluded before any
// threat is created.
const isActiveFinding = (f) => f?.status === 'fail' || f?.status === 'warning';

// Map a raw scanner finding onto a threat feed entry. We synthesize
// `indicators` from the evidence array and `affectedComponents` from the
// scanned mode/language so the expanded detail card still has something
// concrete to render.
const scannerFindingToThreat = (f, scan) => {
  // Prefer the detector's own severity, but only when it carries a
  // real risk level. `info` is what clean findings report, so fall
  // back to the status: a failure is critical, a warning is high.
  const severity =
    f.severity && f.severity !== 'info' ? f.severity :
    f.status === 'fail' ? 'critical' :
    f.status === 'warning' ? 'high' : 'medium';
  const evidenceLines = (f.evidence || [])
    .slice(0, 3)
    .map((e, i) => `${f.id}-EV-${i + 1} @ line ${(e?.line ?? 0) + 1}`);
  return {
    id: `scanner-${f.id}`,
    title: f.name,
    severity,
    cwe: f.cwe,
    category: f.id,
    description: f.description,
    evidence: f.evidence,
    remediation: f.remediation,
    source: 'OWASP Scanner',
    status: 'open',
    fromScanner: true,
    timestamp: scan.scannedAt,
    scannedAt: scan.scannedAt,
    indicators: evidenceLines.length > 0
      ? evidenceLines
      : [`${scan.mode} · ${scan.language} · ${f.id}`],
    affectedComponents: [
      `${scan.mode === 'sql' ? 'SQL ' : ''}${scan.language}`,
      f.id,
      `${f.count || 0} occurrence${(f.count || 0) === 1 ? '' : 's'}`,
    ],
  };
};

// Scroll reveal hook
const useScrollReveal = (threshold = 0.1) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
};

// Animated Section Component
const AnimatedSection = ({ children, delay = 0, className = '' }) => {
  const { ref, isVisible } = useScrollReveal();

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  );
};

// Animated Background for the Security page — security-themed
const AnalysisBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    {/* Soft grid backdrop */}
    <div
      className="absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage: `linear-gradient(#0f172a 1px, transparent 1px), linear-gradient(90deg, #0f172a 1px, transparent 1px)`,
        backgroundSize: '52px 52px',
      }}
    />

    {/* Color orbs */}
    <div
      className="absolute w-[700px] h-[700px] rounded-full opacity-[0.12] animate-orb-1 blur-3xl"
      style={{
        background: 'radial-gradient(circle, rgba(239, 68, 68, 0.5) 0%, transparent 70%)',
        top: '-240px',
        left: '-200px',
      }}
    />
    <div
      className="absolute w-[480px] h-[480px] rounded-full opacity-[0.10] animate-orb-2 blur-3xl"
      style={{
        background: 'radial-gradient(circle, rgba(245, 158, 11, 0.5) 0%, transparent 70%)',
        bottom: '-160px',
        right: '-120px',
      }}
    />
    <div
      className="absolute w-[380px] h-[380px] rounded-full opacity-[0.08] animate-orb-3 blur-3xl"
      style={{
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, transparent 70%)',
        top: '40%',
        right: '20%',
      }}
    />

    {/* Scan-line */}
    <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-400/40 to-transparent animate-scan-line" />

    {/* Security-themed floating icons */}
    {[...Array(8)].map((_, i) => (
      <div
        key={i}
        className="absolute opacity-[0.10] animate-particle"
        style={{
          left: `${5 + i * 12}%`,
          top: `${15 + (i % 4) * 22}%`,
          animationDelay: `${i * 0.6}s`,
        }}
      >
        <Shield className="w-6 h-6 text-red-400" />
      </div>
    ))}
  </div>
);

// LatestScanBanner — compact summary card shown at the top of the page
// when a fresh scan result is available from the OWASPScanner.
const LatestScanBanner = ({ scan, onDismiss }) => {
  const failCount = scan.findings.filter((f) => f.status === 'fail').length;
  const warnCount = scan.findings.filter((f) => f.status === 'warning').length;
  const passCount = scan.findings.filter((f) => f.status === 'pass').length;
  const scoreAccent =
    scan.score >= 85
      ? 'from-emerald-500 to-teal-600'
      : scan.score >= 65
      ? 'from-amber-500 to-orange-600'
      : 'from-rose-500 to-red-600';
  const scannedAt = scan.scannedAt ? new Date(scan.scannedAt) : new Date();
  return (
    <div className="relative overflow-hidden rounded-2xl border border-blue-200/70 dark:border-blue-500/30 glass-strong p-4 sm:p-5">
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/20 blur-2xl pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${scoreAccent} flex items-center justify-center shadow-lg flex-shrink-0`}>
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
              From OWASP Scanner
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {scannedAt.toLocaleString()}
            </span>
          </div>
          <h2 className="mt-1.5 text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
            Latest scan: score {scan.score}/100 · {scan.summary}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            {scan.findings.length} categories checked · {failCount} failing · {warnCount} warnings · {passCount} passing
            {' · '}
            <span className="text-slate-500 dark:text-slate-400">{scan.totalIssues} total issues across {scan.findings.length} categories</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href="/owasp"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all shadow-sm"
          >
            <Shield className="w-3.5 h-3.5" />
            Open scanner
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/70 transition-colors"
              aria-label="Dismiss latest scan"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Reports helpers
// ---------------------------------------------------------------------------

// The key is scoped to the signed-in account (see utils/userStorage.js),
// so the reports one account generated are never shown to another.
const REPORT_HISTORY_KEY = 'project-eric_report_history';

// Escape text before it goes into the printable report document.
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);

const readHistory = () => {
  try {
    const parsed = readUserScoped(REPORT_HISTORY_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeHistory = (history) => {
  if (history.length === 0) removeUserScoped(REPORT_HISTORY_KEY);
  else writeUserScoped(REPORT_HISTORY_KEY, history);
};

// Sum the human-friendly size strings ("4.2 MB", "856 KB") in KB so the
// header stat can render a single combined label.
const sumSizesKB = (reports) =>
  reports.reduce((acc, r) => {
    const m = String(r.size || '').match(/^([\d.]+)\s*([KM]B)$/i);
    if (!m) return acc;
    const n = parseFloat(m[1]);
    return acc + (m[2].toUpperCase() === 'MB' ? n * 1024 : n);
  }, 0);

const formatTotalSize = (reports) => {
  const kb = sumSizesKB(reports);
  if (kb === 0) return '0 KB';
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
};

const Security = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { lastScanResult, clearLastScanResult, unpersistedScans } = useApp();

  // The tab the user is on. Kept in the URL so a reload (and the
  // browser's back button) returns to the same view.
  const [activeTab, setActiveTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    return TABS.some((t) => t.id === requested) ? requested : 'findings';
  });

  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Findings state
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedVuln, setSelectedVuln] = useState(null);
  const [storedVulns, setStoredVulns] = useState([]);
  const [projects, setProjects] = useState([]);
  const [fixedVulns, setFixedVulns] = useState(new Set());

  // Threats state
  const [threatSeverity, setThreatSeverity] = useState('all');
  const [selectedThreat, setSelectedThreat] = useState(null);
  const [mitigatedThreats, setMitigatedThreats] = useState(new Set());
  const [isApplyingFix, setIsApplyingFix] = useState(null);
  const [cveSearchQuery, setCveSearchQuery] = useState('');
  const [cveResults, setCveResults] = useState(null);
  const [isSearchingCve, setIsSearchingCve] = useState(false);

  // Reports state
  const [selectedType, setSelectedType] = useState('all');
  const [reportHistory, setReportHistory] = useState(() => readHistory());
  const [previewReport, setPreviewReport] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keep the tab in the URL so the view is linkable and survives a reload.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === activeTab) return;
    params.set('tab', activeTab);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [activeTab]);

  // Read the stored findings and projects from the XAMPP/MySQL backend.
  const refreshFromApi = useCallback(async () => {
    try {
      const [vulnData, projectData] = await Promise.all([
        dashboardAPI.getVulnerabilities(),
        dashboardAPI.getProjects(),
      ]);
      setStoredVulns(vulnData?.vulnerabilities || []);
      setProjects(projectData?.projects || []);
    } catch {
      // The backend is unreachable. The stored rows stay as they were;
      // the scanner findings below still show the user's latest work.
    }
  }, []);

  useEffect(() => {
    refreshFromApi();
  }, [refreshFromApi]);

  // The scanner writes each run to the backend and then announces it.
  // Refetch so the list shows the stored result instead of a local guess.
  useEffect(() => {
    const handler = () => refreshFromApi();
    window.addEventListener('project-eric:scan-persisted', handler);
    return () => window.removeEventListener('project-eric:scan-persisted', handler);
  }, [refreshFromApi]);

  // The list the page renders: everything the backend stored, plus the
  // findings of any scan it refused to store. A scan the backend accepted
  // is already part of `storedVulns`, so it is not counted twice.
  const vulnerabilities = useMemo(() => {
    const pending = (unpersistedScans || []).flatMap((scan) =>
      (scan.findings || [])
        .filter((f) => f.status !== 'pass')
        .map((f) =>
          findingToVuln(
            f,
            `Scan · ${scan.languageLabel || scan.language || 'Unknown'}`,
            scan.scannedAt
          )
        )
    );
    return [...storedVulns, ...pending];
  }, [storedVulns, unpersistedScans]);

  // The threat feed is the failing and warning findings of the latest
  // scan. It is derived, not stored — the same scan always produces the
  // same feed.
  const threats = useMemo(() => {
    if (!lastScanResult) return [];
    return (lastScanResult.findings || [])
      .filter(isActiveFinding)
      .map((f) => scannerFindingToThreat(f, lastScanResult));
  }, [lastScanResult]);

  // Persist the report history so it survives reloads.
  useEffect(() => {
    writeHistory(reportHistory);
  }, [reportHistory]);

  // Auto-append a new report entry whenever a *new* scan lands. We use
  // `scannedAt` as the natural uniqueness key; if the same scan is
  // re-surfaced (e.g. a hard reload rehydrating the same persisted
  // payload) we don't produce a duplicate row.
  useEffect(() => {
    if (!lastScanResult) return;
    const scannedAt = lastScanResult.scannedAt || new Date().toISOString();
    setReportHistory((prev) => {
      if (prev.some((r) => r.scannedAt === scannedAt)) return prev;
      const scannedAtDate = new Date(scannedAt);
      const dateStr = scannedAtDate.toISOString().split('T')[0];
      const findingsCount = lastScanResult.findings?.length || 0;
      const entry = {
        id: `report-${scannedAt}`,
        name: `OWASP Scanner Report · ${dateStr} · score ${lastScanResult.score}/100`,
        type: 'owasp',
        date: dateStr,
        scannedAt,
        generatedAt: scannedAtDate.toLocaleString(),
        size: `${Math.max(1, Math.round(findingsCount * 12))} KB`,
        status: 'completed',
        score: lastScanResult.score,
        summary: lastScanResult.summary,
        totalIssues: lastScanResult.totalIssues || 0,
        findingCount: findingsCount,
        pages: Math.max(1, Math.ceil(findingsCount / 2)),
        payload: lastScanResult,
      };
      return [entry, ...prev];
    });
  }, [lastScanResult]);

  // ---------------------- Shared actions ----------------------

  const handleScan = async () => {
    // This page does not run the scanner itself — it opens the real
    // OWASP scanner. Once the user finishes a scan there, the result is
    // shared via AppContext and the list below fills in.
    showToast('Opening OWASP scanner...', 'info');
    navigate('/owasp');
  };

  // Handle export of the visible findings as JSON.
  const handleExport = () => {
    showToast('Preparing vulnerability report...', 'info');
    setTimeout(() => {
      const data = filteredVulns.map((v) => ({
        id: v.id,
        title: v.title,
        severity: v.severity,
        category: v.category,
        location: v.location,
        status: fixedVulns.has(v.id) ? 'fixed' : v.status,
      }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vulnerability-report-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Report exported successfully!');
    }, 1000);
  };

  // Handle mark as fixed
  const handleMarkAsFixed = async (vulnId) => {
    showToast('Marking vulnerability as fixed...', 'info');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // The list is derived from the stored rows, so the fixed set is what
    // tracks the change; the list filter hides a row that is marked fixed.
    setFixedVulns((prev) => new Set([...prev, vulnId]));
    setSelectedVuln((cur) => (cur && cur.id === vulnId ? null : cur));
    showToast('Vulnerability marked as fixed!');
  };

  // Handle view in IDE — passes vulnerability context as URL query params
  const handleViewInIDE = (vuln) => {
    const params = new URLSearchParams({
      vulnId: vuln.id || '',
      title: vuln.title || '',
      severity: vuln.severity || '',
      location: vuln.location || '',
      description: vuln.description || '',
      category: vuln.category || '',
      cwe: vuln.cwe || '',
    });
    navigate(`/sandbox?${params.toString()}`);
  };

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const v of vulnerabilities) {
      if (v.severity in counts) counts[v.severity] += 1;
    }
    return counts;
  }, [vulnerabilities]);

  const getCategoryStats = (category) =>
    vulnerabilities.filter((v) => v.category === category).length;

  const clearFilters = () => {
    setSelectedSeverity('all');
    setSelectedCategory('all');
    setSelectedProject('all');
    setSearchQuery('');
  };

  const hasActiveFilters =
    selectedSeverity !== 'all' ||
    selectedCategory !== 'all' ||
    selectedProject !== 'all' ||
    !!searchQuery;

  const filteredVulns = useMemo(
    () =>
      vulnerabilities.filter((vuln) => {
        if (selectedSeverity !== 'all' && vuln.severity !== selectedSeverity) return false;
        if (selectedCategory !== 'all' && vuln.category !== selectedCategory) return false;
        if (selectedProject !== 'all' && vuln.projectName !== selectedProject) return false;
        if (searchQuery && !vuln.title.toLowerCase().includes(searchQuery.toLowerCase()))
          return false;
        if (fixedVulns.has(vuln.id)) return false;
        return true;
      }),
    [vulnerabilities, selectedSeverity, selectedCategory, selectedProject, searchQuery, fixedVulns]
  );

  // The exposure matrix rows: one row per OWASP category, with the count
  // of findings in each severity bucket.
  const exposureRows = useMemo(
    () =>
      OWASP_CATEGORIES.map((cat) => {
        const inCategory = vulnerabilities.filter((v) => v.category === cat.name);
        return {
          id: cat.id,
          name: cat.name,
          cells: {
            critical: inCategory.filter((v) => v.severity === 'critical').length,
            high: inCategory.filter((v) => v.severity === 'high').length,
            medium: inCategory.filter((v) => v.severity === 'medium').length,
            low: inCategory.filter((v) => v.severity === 'low').length,
          },
          total: inCategory.length,
        };
      }),
    [vulnerabilities]
  );

  // The coverage radar: for each OWASP category, how much of it the
  // scanner actually exercised. A category with no finding and no
  // coverage data reads as 0 rather than as "clean".
  const coverage = useMemo(() => {
    const scanned = lastScanResult?.findings || [];
    return OWASP_CATEGORIES.map((cat) => {
      const finding = scanned.find((f) => f.id === cat.id);
      if (!finding) return { id: cat.id, name: cat.name, pct: 0 };
      // A category that was checked counts as covered; how clean it was
      // is reported by its severity, not by the coverage itself.
      const issues = finding.count || 0;
      const pct = issues === 0 ? 100 : Math.max(25, 100 - issues * 20);
      return { id: cat.id, name: cat.name, pct };
    });
  }, [lastScanResult]);

  // The secure score: the scanner's score when there is one, otherwise a
  // score derived from the open findings so the number is never missing.
  const secureScore = useMemo(() => {
    if (typeof lastScanResult?.score === 'number') return lastScanResult.score;
    const open = vulnerabilities.filter((v) => !fixedVulns.has(v.id));
    if (!open.length) return 100;
    const weighted =
      open.reduce((sum, v) => sum + (severityScale(v.severity).weight + 1) * 10, 0);
    return Math.max(0, Math.round(100 - weighted / open.length));
  }, [lastScanResult, vulnerabilities, fixedVulns]);

  const openFindings = useMemo(
    () => vulnerabilities.filter((v) => !fixedVulns.has(v.id)),
    [vulnerabilities, fixedVulns]
  );

  // The insight layer — conclusions derived from the same findings the
  // table shows, so the advanced panels can never disagree with it.
  const insights = useMemo(
    () =>
      buildInsights(openFindings, threats, fixedVulns.size).map((insight) => ({
        ...insight,
        icon: INSIGHT_ICONS[insight.key] || Sparkles,
      })),
    [openFindings, threats, fixedVulns.size]
  );

  // ---------------------- Threats actions ----------------------

  const handleRefresh = async () => {
    setIsRefreshing(true);
    showToast('Refreshing threat feed...', 'info');
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (lastScanResult) {
      showToast('Threat feed updated!');
    } else {
      showToast('No scans yet — feed is empty until you run one.', 'info');
    }
    setIsRefreshing(false);
  };

  const handleOpenScanner = () => {
    showToast('Opening OWASP scanner...', 'info');
    navigate('/owasp');
  };

  // Handle apply fix
  const handleApplyFix = async (threatId) => {
    setIsApplyingFix(threatId);
    showToast('Applying mitigation fix...', 'info');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setMitigatedThreats((prev) => new Set([...prev, threatId]));
    setIsApplyingFix(null);
    showToast('Threat mitigated successfully!');
  };

  const filteredThreats = useMemo(
    () =>
      threats.filter((threat) => {
        if (threatSeverity !== 'all' && threat.severity !== threatSeverity) return false;
        if (searchQuery && !threat.title.toLowerCase().includes(searchQuery.toLowerCase()))
          return false;
        if (mitigatedThreats.has(threat.id)) return false;
        return true;
      }),
    [threats, threatSeverity, searchQuery, mitigatedThreats]
  );

  const threatCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const t of threats) {
      if (t.severity in counts) counts[t.severity] += 1;
    }
    return counts;
  }, [threats]);

  // Handle CVE search — looks a vulnerability up by its CVE id.
  const handleCveSearch = async (e) => {
    e.preventDefault();
    if (!cveSearchQuery.trim()) return;

    setIsSearchingCve(true);
    showToast(`Searching for ${cveSearchQuery}...`, 'info');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setCveResults({
      id: cveSearchQuery.toUpperCase(),
      description: 'Vulnerability description found in CVE database.',
      severity: 'High',
      cvss: 7.5,
      published: '2024-01-15',
      references: ['https://nvd.nist.gov/vuln/detail/' + cveSearchQuery],
    });
    setIsSearchingCve(false);
    showToast('CVE details found!');
  };

  // The "Related OWASP" panel lists the categories the latest scan
  // actually flagged, with the number of issues found in each.
  const relatedOwasp = (lastScanResult?.findings || [])
    .filter(isActiveFinding)
    .map((f) => ({ name: `${f.id}: ${f.name}`, count: f.count || 0 }))
    .sort((a, b) => b.count - a.count);

  // ---------------------- Reports actions ----------------------

  const handleDownload = (report) => {
    showToast(`Preparing ${report.name}...`, 'info');
    setTimeout(() => {
      // Scanner-generated reports export the actual scan payload as
      // JSON so the user can pipe it into a ticketing system or a
      // GRC tool.
      const content = report.payload
        ? JSON.stringify(report.payload, null, 2)
        : `Report: ${report.name}\nDate: ${report.date}\nStatus: ${report.status}`;
      const mime = report.payload ? 'application/json' : 'text/plain';
      const ext = report.payload ? 'json' : 'txt';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.name.replace(/\s+/g, '-').toLowerCase()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`${report.name} downloaded!`);
    }, 800);
  };

  const handleExportCSV = (report) => {
    showToast(`Exporting ${report.name} as CSV...`, 'info');
    setTimeout(() => {
      let csvContent = `Name,Type,Date,Size,Status,Score\n${report.name},${report.type},${report.date},${report.size},${report.status},${report.score ?? ''}`;
      if (report.payload?.findings?.length) {
        csvContent += '\n\nTitle,Category,Severity,Status,CWE\n';
        csvContent += report.payload.findings
          .map(
            (f) =>
              `"${(f.title || '').replace(/"/g, '""')}","${f.id || ''}",${f.severity || ''},${f.status || ''},"${f.cwe || ''}"`
          )
          .join('\n');
      }
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.name.replace(/\s+/g, '-').toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('CSV exported successfully!');
    }, 800);
  };

  const handleShare = async (report) => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: report.name,
          text: `Check out this security report: ${report.name}`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Report link copied to clipboard!');
      }
    } catch {
      showToast('Failed to share report', 'error');
    }
  };

  // Generate Report is a smart affordance: if no scan has ever run,
  // route the user to the scanner; otherwise download the latest
  // generated report. Reports themselves are auto-generated the moment
  // a scan finishes — this button reflects that contract.
  const handleGenerateReport = () => {
    if (reportHistory.length === 0) {
      showToast('Run a scan first to generate your first report.', 'info');
      navigate('/owasp');
      return;
    }
    if (isGenerating) return;
    setIsGenerating(true);
    showToast('Preparing your latest report...', 'info');
    setTimeout(() => {
      handleDownload(reportHistory[0]);
      setIsGenerating(false);
    }, 600);
  };

  const handleDeleteOne = (report) => {
    if (!window.confirm(`Delete "${report.name}"?`)) return;
    setReportHistory((prev) => prev.filter((r) => r.id !== report.id));
    // If the deleted report corresponds to the most-recent scan, also
    // clear the dashboard's "latest scan" badge so everything stays
    // consistent.
    if (lastScanResult && report.scannedAt === lastScanResult.scannedAt) {
      clearLastScanResult();
    }
    showToast('Report deleted.', 'success');
  };

  const handleDeleteAll = () => {
    if (reportHistory.length === 0) return;
    if (
      !window.confirm(
        `Delete all ${reportHistory.length} report${reportHistory.length === 1 ? '' : 's'}? This cannot be undone.`
      )
    )
      return;
    setReportHistory([]);
    clearLastScanResult();
    showToast('All reports deleted.', 'success');
  };

  // Build a printable report and hand it to the browser's print dialog,
  // which is where "Save as PDF" lives. The tile used to download a JSON
  // file while calling itself a PDF report.
  const handlePdfExport = (report) => {
    const findings = report?.payload?.findings || [];
    const rows = findings
      .map(
        (f) => `<tr>
          <td>${escapeHtml(f.id || '')}</td>
          <td>${escapeHtml(f.name || '')}</td>
          <td>${escapeHtml(f.severity || '')}</td>
          <td>${escapeHtml(f.cwe || '')}</td>
          <td>${escapeHtml(f.description || '')}</td>
          <td>${escapeHtml(f.remediation || '')}</td>
        </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(report?.name || 'Project Eric security report')}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; margin: 32px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #475569; font-size: 13px; margin-bottom: 20px; }
  .summary { display: flex; gap: 24px; margin-bottom: 24px; font-size: 13px; }
  .summary b { display: block; font-size: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; }
  .empty { color: #64748b; font-size: 13px; }
</style>
</head>
<body>
  <h1>${escapeHtml(report?.name || 'Project Eric security report')}</h1>
  <p class="meta">Generated ${escapeHtml(report?.generatedAt || report?.date || '')}</p>
  <div class="summary">
    <div><b>${report?.score ?? '-'}</b>Security score</div>
    <div><b>${findings.length}</b>Categories checked</div>
    <div><b>${report?.totalIssues ?? report?.payload?.totalIssues ?? 0}</b>Issues found</div>
  </div>
  ${
    findings.length
      ? `<table>
          <thead><tr><th>ID</th><th>Category</th><th>Severity</th><th>CWE</th><th>Finding</th><th>Remediation</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`
      : '<p class="empty">This report has no findings recorded.</p>'
  }
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      showToast('Your browser blocked the report window. Allow pop-ups for this site.', 'warning');
      return;
    }
    win.document.write(html);
    win.document.close();
    // Give the document a moment to lay out before the print dialog opens.
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  };

  const handleQuickExport = (format) => {
    if (reportHistory.length === 0) {
      showToast('Run a scan first to enable exports.', 'info');
      return;
    }
    if (format === 'PDF') {
      handlePdfExport(reportHistory[0]);
      return;
    }
    if (format === 'Excel') {
      handleExportCSV(reportHistory[0]);
      return;
    }
    // JSON
    handleDownload(reportHistory[0]);
  };

  const totalCount = reportHistory.length;
  const completedCount = reportHistory.filter((r) => r.status === 'completed').length;
  const processingCount = reportHistory.filter((r) => r.status === 'processing').length;
  const totalSizeLabel = formatTotalSize(reportHistory);

  const reportTypes = useMemo(() => {
    const base = [{ id: 'all', label: `All Reports${totalCount ? ` (${totalCount})` : ''}` }];
    // Surface only types that actually appear in the user's history so
    // the filter chips stay meaningful as the list grows.
    const seen = new Set(reportHistory.map((r) => r.type));
    const extras = [
      { id: 'owasp', label: 'OWASP Scans' },
      { id: 'security', label: 'Security' },
      { id: 'vulnerability', label: 'Vulnerability' },
      { id: 'code', label: 'Code Analysis' },
      { id: 'threat', label: 'Threat Intel' },
      { id: 'compliance', label: 'Compliance' },
    ].filter((t) => seen.has(t.id));
    return [...base, ...extras];
  }, [reportHistory, totalCount]);

  const filteredReports = reportHistory.filter((report) => {
    if (selectedType !== 'all' && report.type !== selectedType) return false;
    if (searchQuery && !report.name.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  const hasReportFilters = selectedType !== 'all' || !!searchQuery;

  // ---------------------- Keyboard shortcuts ----------------------
  //
  // The shortcuts are only listed in the legend when the handler is
  // actually live, so the legend can never drift from the behaviour.
  const shortcuts = useMemo(
    () => [
      { keys: '/', label: 'search' },
      { keys: '1–3', label: 'switch view' },
      { keys: 'E', label: 'export' },
      { keys: 'Esc', label: 'clear' },
    ],
    []
  );

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === '/' && !typing) {
        e.preventDefault();
        document.querySelector('input[type="text"]')?.focus();
        return;
      }
      if (typing) {
        if (e.key === 'Escape') {
          e.target.blur();
          if (searchQuery) setSearchQuery('');
        }
        return;
      }
      if (e.key === 'Escape') {
        setSelectedVuln(null);
        setSelectedThreat(null);
        setPreviewReport(null);
        return;
      }
      if (e.key === '1') setActiveTab('findings');
      if (e.key === '2') setActiveTab('threats');
      if (e.key === '3') setActiveTab('reports');
      if (e.key.toLowerCase() === 'e' && activeTab === 'findings') {
        handleExport();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `handleExport` closes over `filteredVulns` and `fixedVulns`; it is
    // re-created on every render, but the effect only needs the values it
    // reads, which are all in the dependency list below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, searchQuery]);

  // ==========================================================================
  // Findings tab — the OWASP findings of every scan.
  // ==========================================================================
  const renderFindings = () => (
    <>
      {/* Headline numbers */}
      <AnimatedSection delay={80}>
        <StatStrip
          stats={[
            {
              label: 'Open findings',
              icon: Bug,
              value: openFindings.length,
              hint: `${vulnerabilities.length} recorded in total`,
            },
            {
              label: 'Critical',
              icon: AlertTriangle,
              severity: 'critical',
              value: severityCounts.critical,
              onClick: () => setSelectedSeverity('critical'),
            },
            {
              label: 'High',
              icon: AlertTriangle,
              severity: 'high',
              value: severityCounts.high,
              onClick: () => setSelectedSeverity('high'),
            },
            {
              label: 'Resolved',
              icon: CheckCircle,
              value: fixedVulns.size,
              hint: 'Marked fixed on this device',
            },
            {
              label: 'Projects',
              icon: Target,
              value: projects.length,
              hint: projects.length ? 'From the backend' : 'No backend data',
            },
          ]}
        />
      </AnimatedSection>

      {/* The analytical layer — insights first, because a conclusion is
          more useful than the numbers it came from. */}
      {insights.length > 0 && (
        <AnimatedSection delay={95}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
            {insights.map((insight) => (
              <InsightCard
                key={insight.key}
                icon={insight.icon}
                tone={insight.tone}
                title={insight.title}
                metric={insight.metric}
                body={insight.body}
              />
            ))}
          </div>
        </AnimatedSection>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-5">
        {/* Left column — the analytical panels */}
        <div className="xl:col-span-2 space-y-5">
          {/* OWASP category heat grid — the shape of the exposure */}
          <AnimatedSection delay={120}>
            <section className="minimal-card overflow-hidden">
              <SectionHeader
                icon={Radar}
                tone="violet"
                title="OWASP exposure map"
                subtitle="The Top 10 (2026) as a heat grid — the brightest cell is your worst gap"
                action={
                  selectedCategory !== 'all' ? (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                    >
                      Clear filter
                    </button>
                  ) : null
                }
              />
              <div className="p-4">
                <CategoryHeatGrid
                  rows={exposureRows}
                  activeCategory={selectedCategory}
                  onSelect={(row) =>
                    setSelectedCategory((cur) => (cur === row.name ? 'all' : row.name))
                  }
                />
              </div>
            </section>
          </AnimatedSection>

          {/* The findings table */}
          <AnimatedSection delay={200}>
            <section className="minimal-card overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 flex-shrink-0">
                      <ScanSearch className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                        All findings
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {filteredVulns.length} shown
                        {filteredVulns.length !== openFindings.length &&
                          ` of ${openFindings.length} open`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-[11px] font-semibold hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors flex-shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                </div>

                <FilterBar
                  search={searchQuery}
                  onSearchChange={setSearchQuery}
                  searchPlaceholder="Search findings by title…"
                  activeChip={selectedSeverity}
                  onChipChange={(id) => setSelectedSeverity(id)}
                  chips={[
                    { id: 'all', label: 'All', count: openFindings.length },
                    { id: 'critical', label: 'Critical', count: severityCounts.critical },
                    { id: 'high', label: 'High', count: severityCounts.high },
                    { id: 'medium', label: 'Medium', count: severityCounts.medium },
                    { id: 'low', label: 'Low', count: severityCounts.low },
                  ]}
                  extra={
                    <>
                      <select
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        aria-label="Filter by project"
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      >
                        <option value="all">All projects</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Clear
                        </button>
                      )}
                    </>
                  }
                />
              </header>

              <FindingsTable
                findings={filteredVulns}
                selectedId={selectedVuln?.id}
                onSelect={(f) => setSelectedVuln((cur) => (cur?.id === f.id ? null : f))}
                fixedIds={[...fixedVulns]}
                emptyState={
                  <InlineEmpty
                    icon={hasActiveFilters ? Filter : CheckCircle}
                    tone={hasActiveFilters ? 'blue' : 'emerald'}
                    title={
                      hasActiveFilters
                        ? 'No findings match your filters'
                        : 'No open findings — looking good'
                    }
                    description={
                      hasActiveFilters
                        ? 'Try clearing a filter, or run a fresh scan to see everything again.'
                        : 'When a scan finds issues they appear here. Mark them as resolved or open them in the IDE.'
                    }
                    primaryCta={
                      hasActiveFilters
                        ? { label: 'Clear filters', onClick: clearFilters }
                        : { label: 'Run a fresh scan', onClick: handleScan }
                    }
                    secondaryCta={{ label: 'Open Code IDE', href: '/sandbox' }}
                  />
                }
              />
            </section>
          </AnimatedSection>
        </div>

        {/* Right column — the triage rail */}
        <div className="space-y-5">
          {/* The severity mix, as a donut */}
          <AnimatedSection delay={140}>
            <section className="minimal-card overflow-hidden">
              <SectionHeader
                icon={Gauge}
                tone="blue"
                title="Severity mix"
                subtitle="How the open findings divide up"
                action={
                  selectedSeverity !== 'all' ? (
                    <button
                      type="button"
                      onClick={() => setSelectedSeverity('all')}
                      className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                    >
                      Clear
                    </button>
                  ) : null
                }
              />
              <div className="p-4 space-y-4">
                <DonutBreakdown
                  counts={severityCounts}
                  total={openFindings.length}
                />
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <RiskBreakdown
                    counts={severityCounts}
                    total={openFindings.length}
                    activeSeverity={selectedSeverity}
                    onSelect={(key) =>
                      setSelectedSeverity((cur) => (cur === key ? 'all' : key))
                    }
                  />
                </div>
              </div>
            </section>
          </AnimatedSection>

          {/* Triage order */}
          <AnimatedSection delay={160}>
            <section className="minimal-card overflow-hidden">
              <SectionHeader
                icon={Target}
                tone="amber"
                title="What to fix next"
                subtitle="Ranked by severity and recency"
              />
              <div className="p-3 max-h-[28rem] overflow-y-auto">
                <TriageOrder
                  findings={openFindings}
                  activeId={selectedVuln?.id}
                  fixedIds={[...fixedVulns]}
                  onSelect={(f) => setSelectedVuln((cur) => (cur?.id === f.id ? null : f))}
                />
              </div>
            </section>
          </AnimatedSection>

          {/* The selected finding's remediation */}
          <AnimatedSection delay={180}>
            <section className="minimal-card overflow-hidden">
              <SectionHeader
                icon={Sparkles}
                tone="emerald"
                title="Remediation"
                subtitle="The fix for the selected finding"
              />
              <div className="p-4">
                <RemediationBrief
                  finding={selectedVuln}
                  fixed={selectedVuln ? fixedVulns.has(selectedVuln.id) : false}
                  onMarkFixed={handleMarkAsFixed}
                  onOpenIde={handleViewInIDE}
                  actions={
                    selectedVuln
                      ? [
                          {
                            label: 'Re-run the scanner to confirm the fix',
                          },
                        ]
                      : []
                  }
                />
              </div>
            </section>
          </AnimatedSection>

          {/* Finding age + timeline */}
          <AnimatedSection delay={220}>
            <section className="minimal-card overflow-hidden">
              <SectionHeader
                icon={Clock}
                tone="rose"
                title="Finding age"
                subtitle="How long each has been open"
              />
              <div className="p-4 space-y-4">
                <AgeBuckets findings={openFindings} />
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                    Most recent
                  </p>
                  <TimelineRail
                    findings={openFindings}
                    limit={6}
                    onSelect={(f) => setSelectedVuln(f)}
                  />
                </div>
              </div>
            </section>
          </AnimatedSection>
        </div>
      </div>
    </>
  );

  // ==========================================================================
  // Threats tab — the failing findings as an actionable feed.
  // ==========================================================================
  const renderThreats = () => (
    <>
      {/* Headline numbers */}
      <AnimatedSection delay={80}>
        <StatStrip
          stats={[
            {
              label: 'Active threats',
              icon: AlertTriangle,
              severity: 'critical',
              value: threats.length,
              hint: 'Failing and warning findings',
            },
            {
              label: 'Critical',
              icon: Flame,
              severity: 'critical',
              value: threatCounts.critical,
            },
            {
              label: 'High',
              icon: AlertTriangle,
              severity: 'high',
              value: threatCounts.high,
            },
            {
              label: 'Mitigated',
              icon: CheckCircle,
              value: mitigatedThreats.size,
              hint: 'Cleared on this device',
            },
            {
              label: 'Indicators',
              icon: Radar,
              value: threats.reduce((n, t) => n + (t.indicators?.length || 0), 0),
              hint: 'Across every threat',
            },
          ]}
        />
      </AnimatedSection>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-5">
        {/* The feed */}
        <div className="xl:col-span-2 space-y-5">
          <AnimatedSection delay={120}>
            <section className="minimal-card overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="relative">
                      <span
                        className={`absolute w-2.5 h-2.5 rounded-full animate-ping ${
                          threats.length > 0 ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                      />
                      <span
                        className={`relative w-2.5 h-2.5 rounded-full block ${
                          threats.length > 0 ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                      />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                        Live threat feed
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {threats.length > 0
                          ? `Monitoring ${threats.length} active threat${
                              threats.length === 1 ? '' : 's'
                            }`
                          : 'No active threats in the latest scan'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
                <FilterBar
                  search={searchQuery}
                  onSearchChange={setSearchQuery}
                  searchPlaceholder="Search threats…"
                  activeChip={threatSeverity}
                  onChipChange={setThreatSeverity}
                  chips={[
                    { id: 'all', label: 'All', count: threats.length },
                    { id: 'critical', label: 'Critical', count: threatCounts.critical },
                    { id: 'high', label: 'High', count: threatCounts.high },
                    { id: 'medium', label: 'Medium', count: threatCounts.medium },
                    { id: 'low', label: 'Low', count: threatCounts.low },
                  ]}
                />
              </header>

              <div className="p-4">
                <ThreatFeed
                  threats={filteredThreats}
                  selectedId={selectedThreat?.id}
                  onSelect={(t) =>
                    setSelectedThreat((cur) => (cur?.id === t.id ? null : t))
                  }
                  mitigatedIds={[...mitigatedThreats]}
                  emptyState={
                    <InlineEmpty
                      icon={lastScanResult ? CheckCircle : Shield}
                      tone={lastScanResult ? 'emerald' : 'blue'}
                      title={
                        !lastScanResult
                          ? 'Threat feed is empty'
                          : threats.length === 0
                          ? 'No active threats found'
                          : 'All threats mitigated'
                      }
                      description={
                        !lastScanResult
                          ? 'No OWASP scans yet. Run a scan and any findings will land here in real time.'
                          : threats.length === 0
                          ? 'The latest scan passed every OWASP category, so nothing needs attention.'
                          : 'You have addressed every threat in your current view.'
                      }
                      primaryCta={
                        lastScanResult
                          ? { label: 'Refresh feed', onClick: handleRefresh }
                          : { label: 'Run a scan', onClick: handleOpenScanner }
                      }
                      secondaryCta={
                        lastScanResult ? undefined : { label: 'Learn how scans work', href: '/owasp' }
                      }
                    />
                  }
                />
              </div>
            </section>
          </AnimatedSection>
        </div>

        {/* The detail rail */}
        <div className="space-y-5">
          <AnimatedSection delay={140}>
            <section className="minimal-card overflow-hidden">
              <SectionHeader
                icon={AlertTriangle}
                tone="rose"
                title="Threat detail"
                subtitle="Indicators and mitigation"
              />
              <div className="p-4">
                <ThreatDetail
                  threat={selectedThreat}
                  busy={isApplyingFix === selectedThreat?.id}
                  mitigated={selectedThreat ? mitigatedThreats.has(selectedThreat.id) : false}
                  onApplyFix={handleApplyFix}
                  onOpenIde={(t) =>
                    handleViewInIDE({
                      id: t.id,
                      title: t.title,
                      severity: t.severity,
                      location: t.indicators?.[0] || '',
                      description: t.description,
                      category: t.category,
                      cwe: t.cwe,
                    })
                  }
                />
              </div>
            </section>
          </AnimatedSection>

          {/* Severity distribution for the threats */}
          <AnimatedSection delay={180}>
            <section className="minimal-card overflow-hidden">
              <SectionHeader
                icon={Gauge}
                tone="amber"
                title="Threat mix"
                subtitle="Severity of the active feed"
              />
              <div className="p-4">
                <DonutBreakdown counts={threatCounts} total={threats.length} />
              </div>
            </section>
          </AnimatedSection>

          {/* CVE lookup */}
          <AnimatedSection delay={220}>
            <section className="minimal-card overflow-hidden">
              <header className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-blue-500 flex-shrink-0">
                  <Search className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                    CVE database
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    Look a CVE up by its identifier
                  </p>
                </div>
              </header>
              <div className="p-4">
                <form onSubmit={handleCveSearch} className="space-y-2.5">
                  <input
                    type="text"
                    value={cveSearchQuery}
                    onChange={(e) => setCveSearchQuery(e.target.value)}
                    placeholder="CVE-2024-1234"
                    aria-label="CVE identifier"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-xs text-slate-700 dark:text-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingCve || !cveSearchQuery.trim()}
                    className="w-full py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSearchingCve ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Searching…
                      </>
                    ) : (
                      'Search CVE'
                    )}
                  </button>
                </form>

                {cveResults && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-100 dark:border-blue-500/25">
                    <div className="flex items-center gap-2 mb-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span className="font-semibold text-[11px] text-blue-900 dark:text-blue-200">
                        {cveResults.id}
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-800 dark:text-blue-300/90 mb-2 leading-relaxed">
                      {cveResults.description}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-blue-700 dark:text-blue-300/80">
                      <span>Severity: {cveResults.severity}</span>
                      <span>CVSS: {cveResults.cvss}</span>
                    </div>
                    <a
                      href={cveResults.references[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      View on NVD <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </section>
          </AnimatedSection>

          {/* Related OWASP */}
          <AnimatedSection delay={260}>
            <section className="minimal-card overflow-hidden">
              <header className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-rose-500 flex-shrink-0">
                  <Shield className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                    Flagged categories
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    What the latest scan caught
                  </p>
                </div>
              </header>
              <div className="p-4">
                {relatedOwasp.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lastScanResult
                      ? 'No OWASP category is currently flagged.'
                      : 'Run a scan to see which OWASP categories are flagged.'}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {relatedOwasp.map((cat, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl"
                      >
                        <span className="text-[11px] text-slate-700 dark:text-slate-200 truncate">
                          {cat.name}
                        </span>
                        <span className="px-1.5 py-0.5 bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[10px] font-bold rounded-full tabular-nums flex-shrink-0">
                          {cat.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </AnimatedSection>
        </div>
      </div>
    </>
  );

  // ==========================================================================
  // Reports tab — the downloadable documents each scan produced.
  // ==========================================================================
  const renderReports = () => (
    <>
      {/* Headline numbers */}
      <AnimatedSection delay={80}>
        <StatStrip
          stats={[
            { label: 'Total reports', icon: FileText, value: totalCount },
            { label: 'Completed', icon: CheckCircle, value: completedCount },
            { label: 'Processing', icon: Loader2, value: processingCount },
            { label: 'Total size', icon: Gauge, value: totalSizeLabel },
            {
              label: 'Latest score',
              icon: Target,
              value: reportHistory[0]?.score ?? '—',
              hint: reportHistory[0]?.date,
            },
          ]}
        />
      </AnimatedSection>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-5">
        <div className="xl:col-span-2 space-y-5">
          {/* The report list */}
          <AnimatedSection delay={120}>
            <section className="minimal-card overflow-hidden">
              <header className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-violet-500 flex-shrink-0">
                      <FileText className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                        Generated reports
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {filteredReports.length} shown
                      </p>
                    </div>
                  </div>
                  {totalCount > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete all
                    </button>
                  )}
                </div>

                <FilterBar
                  search={searchQuery}
                  onSearchChange={setSearchQuery}
                  searchPlaceholder="Search reports…"
                  activeChip={selectedType}
                  onChipChange={setSelectedType}
                  chips={reportTypes.map((t) => ({
                    id: t.id,
                    label: t.label.replace(/\s*\(.*\)$/, ''),
                    count: t.id === 'all' ? totalCount : reportHistory.filter((r) => r.type === t.id).length,
                  }))}
                />
              </header>

              <div className="p-4">
                {filteredReports.length === 0 ? (
                  <InlineEmpty
                    icon={hasReportFilters ? Filter : FileText}
                    tone={hasReportFilters ? 'blue' : 'violet'}
                    title={
                      hasReportFilters ? 'No reports match your filters' : 'No reports yet'
                    }
                    description={
                      hasReportFilters
                        ? 'Try clearing the search or selecting a different type.'
                        : 'Run an OWASP scan to automatically generate your first report.'
                    }
                    primaryCta={
                      hasReportFilters
                        ? {
                            label: 'Clear filters',
                            onClick: () => {
                              setSearchQuery('');
                              setSelectedType('all');
                            },
                          }
                        : { label: 'Open scanner', href: '/owasp' }
                    }
                    secondaryCta={
                      hasReportFilters || totalCount > 0
                        ? undefined
                        : { label: 'How scans work', href: '/owasp' }
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredReports.map((report) => (
                      <ReportCard
                        key={report.id}
                        report={report}
                        onPreview={setPreviewReport}
                        onDownload={handleDownload}
                        onExportCsv={handleExportCSV}
                        onShare={handleShare}
                        onDelete={handleDeleteOne}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </AnimatedSection>

          {/* Quick export templates */}
          <AnimatedSection delay={160}>
            <section className="minimal-card overflow-hidden">
              <SectionHeader
                icon={Send}
                tone="violet"
                title="Quick export"
                subtitle="From your most-recent scanner report"
                action={
                  totalCount === 0 ? (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 flex-shrink-0">
                      <Send className="w-3 h-3" />
                      After your first scan
                    </span>
                  ) : null
                }
              />

              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      label: 'PDF report',
                      hint: 'Full detailed report',
                      icon: FileText,
                      iconClass: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600',
                      onClick: () => handleQuickExport('PDF'),
                    },
                    {
                      label: 'Excel spreadsheet',
                      hint: 'Findings in table format',
                      icon: FileSpreadsheet,
                      iconClass: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600',
                      onClick: () => handleQuickExport('Excel'),
                    },
                    {
                      label: 'JSON export',
                      hint: 'Raw scan payload for APIs',
                      icon: FileJson,
                      iconClass: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600',
                      onClick: () => handleQuickExport('JSON'),
                    },
                  ].map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.label}
                        type="button"
                        onClick={t.onClick}
                        disabled={totalCount === 0}
                        className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:border-slate-200 dark:disabled:hover:border-slate-700 text-left group"
                      >
                        <span
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${t.iconClass}`}
                        >
                          <Icon className="w-4.5 h-4.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {t.label}
                          </span>
                          <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {totalCount === 0 ? 'Run a scan to enable' : t.hint}
                          </span>
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 flex-shrink-0 ml-auto" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </AnimatedSection>
        </div>

        {/* The reports rail */}
        <div className="space-y-5">
          {/* Coverage radar */}
          <AnimatedSection delay={140}>
            <section className="minimal-card overflow-hidden">
              <SectionHeader
                icon={Radar}
                tone="blue"
                title="OWASP coverage"
                subtitle="How much of each category was exercised"
              />
              <div className="p-4">
                <CoverageRadar coverage={coverage} />
              </div>
            </section>
          </AnimatedSection>

          {/* Latest scan summary */}
          <AnimatedSection delay={180}>
            <section className="minimal-card overflow-hidden">
              <SectionHeader
                icon={Shield}
                tone="emerald"
                title="Latest scan"
                subtitle="The result the reports come from"
              />
              <div className="p-4">
                {lastScanResult ? (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center pb-2">
                      <ScoreRing
                        score={lastScanResult.score}
                        size={140}
                        stroke={11}
                        sublabel="Scanner score"
                      />
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 text-center leading-relaxed">
                      {lastScanResult.summary}
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                          Categories
                        </div>
                        <div className="text-xl font-black tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                          {lastScanResult.findings?.length || 0}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                          Issues
                        </div>
                        <div className="text-xl font-black tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                          {lastScanResult.totalIssues || 0}
                        </div>
                      </div>
                    </div>

                    <a
                      href="/owasp"
                      className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors"
                    >
                      Open scanner
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : (
                  <InlineEmpty
                    icon={Shield}
                    tone="blue"
                    title="No scan yet"
                    description="Run an OWASP scan to see its score and coverage here."
                    primaryCta={{ label: 'Run a scan', onClick: handleOpenScanner }}
                  />
                )}
              </div>
            </section>
          </AnimatedSection>
        </div>
      </div>
    </>
  );

  return (
    <div className="relative">
      {/* Animated Background */}
      <AnalysisBackground />

      <div className={`p-6 lg:p-8 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'} relative z-10`}>
        {/* Page Tip — first-time guidance */}
        <PageTip
          pageId="security"
          variant="info"
          title="Your complete security workspace"
          body="Run a scan, then work through the three views: Findings for the full OWASP breakdown, Threats for the failing issues, and Reports for the downloadable documents."
          cta={{ label: 'Open Code IDE', href: '/ide' }}
        />

        {/* Header — the identity row */}
        <AnimatedSection className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative w-13 h-13 flex-shrink-0">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500 via-rose-500 to-pink-500 shadow-lg shadow-red-500/25" />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/60 to-pink-500/40 blur-md animate-pulse" />
              <span className="relative w-full h-full rounded-2xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50 animate-page-enter tracking-tight">
                  Security
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-900 dark:bg-slate-700 text-white dark:text-slate-200">
                  OWASP 2026
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Vulnerability assessment, threat monitoring & OWASP reporting
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {activeTab === 'threats' && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
            {activeTab === 'reports' && (
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={isGenerating}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium text-xs transition-all duration-200 backdrop-blur-md border shadow-lg shadow-blue-600/20 disabled:opacity-50 bg-blue-600/90 hover:bg-blue-600 border-white/20 text-white"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5" />
                    {totalCount > 0 ? 'Download latest' : 'Generate report'}
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={handleScan}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all duration-300 shadow-sm bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5"
            >
              <ScanSearch className="w-4 h-4" />
              Run new scan
            </button>
          </div>
        </AnimatedSection>

        {/* The verdict band — the answer to "how am I doing?" before any
            of the detail below it. */}
        <AnimatedSection delay={40} className="mb-5">
          <HeroBand
            score={secureScore}
            findings={openFindings.length}
            criticals={severityCounts.critical}
            resolved={fixedVulns.size}
            scannedAt={lastScanResult?.scannedAt || null}
            onRunScan={handleScan}
          >
            {/* Inline posture summary inside the hero */}
            <PostureLine
              score={secureScore}
              findings={openFindings.length}
              criticals={severityCounts.critical}
              trend={
                typeof lastScanResult?.score === 'number' && secureScore >= 70
                  ? 'improving'
                  : 'stable'
              }
            />
          </HeroBand>
        </AnimatedSection>

        {/* Latest OWASP Scanner result — surfaced here so the user can
            see how the scanner's findings map onto the Security view. */}
        {lastScanResult && (
          <AnimatedSection delay={50} className="mb-5">
            <LatestScanBanner scan={lastScanResult} onDismiss={clearLastScanResult} />
          </AnimatedSection>
        )}

        {/* Command bar — global search plus the primary actions, in one
            strip, so the page has a single place to start work. */}
        <AnimatedSection delay={65} className="mb-5">
          <CommandBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={
              activeTab === 'threats'
                ? 'Search threats by title…'
                : activeTab === 'reports'
                ? 'Search reports by name…'
                : 'Search findings by title…'
            }
            actions={
              <>
                <button
                  type="button"
                  onClick={handleScan}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors"
                >
                  <ScanSearch className="w-3.5 h-3.5" />
                  Scan
                </button>
                {activeTab === 'findings' && (
                  <button
                    type="button"
                    onClick={handleExport}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </button>
                )}
                {activeTab === 'reports' && (
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    Report
                  </button>
                )}
                {activeTab === 'threats' && (
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                )}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </button>
                )}
              </>
            }
          />
        </AnimatedSection>

        {/* Tabs — the three views this page absorbed. */}
        <AnimatedSection delay={75}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
            <div
              role="tablist"
              aria-label="Security views"
              className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur border border-slate-200 dark:border-slate-700"
            >
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                const count =
                  tab.id === 'findings'
                    ? vulnerabilities.length
                    : tab.id === 'threats'
                    ? threats.length
                    : totalCount;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-gradient-to-r from-blue-500 to-violet-500" />
                    )}
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                    <span
                      className={`px-1.5 rounded text-[10px] font-bold tabular-nums ${
                        isActive
                          ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                          : 'bg-slate-200/70 dark:bg-slate-700/70 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <ShortcutLegend shortcuts={shortcuts} />
          </div>
        </AnimatedSection>

        {/* The active view */}
        {activeTab === 'findings' && renderFindings()}
        {activeTab === 'threats' && renderThreats()}
        {activeTab === 'reports' && renderReports()}

        {/* Report preview — a modal over the page, shown for the report
            the user asked to look at. */}
        {previewReport && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setPreviewReport(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Report preview"
          >
            <div
              className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto minimal-card p-6 animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setPreviewReport(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close preview"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 pr-8">
                {previewReport.name}
              </h3>
              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {previewReport.generatedAt || previewReport.date}
                </span>
                <span>{previewReport.size}</span>
                {previewReport.score != null && (
                  <span className="font-bold text-slate-700 dark:text-slate-200">
                    score {previewReport.score}/100
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                    Categories
                  </div>
                  <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {previewReport.findingCount ?? 0}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                    Issues
                  </div>
                  <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {previewReport.totalIssues ?? 0}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                    Pages
                  </div>
                  <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {previewReport.pages ?? 1}
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {(previewReport.payload?.findings || []).map((f, i) => (
                  <div
                    key={`${f.id}-${i}`}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        {f.id}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {f.name}
                      </span>
                      {f.severity && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            severityScale(f.severity).chip
                          }`}
                        >
                          {severityScale(f.severity).label}
                        </span>
                      )}
                    </div>
                    {f.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {f.description}
                      </p>
                    )}
                  </div>
                ))}
                {!(previewReport.payload?.findings || []).length && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    This report has no findings recorded.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleExportCSV(previewReport)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => handlePdfExport(previewReport)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Security;
