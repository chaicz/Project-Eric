import React, { useState, useEffect, useRef } from 'react';
import {
  ScanSearch,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
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
  Loader2,
  Check,
  Eye,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { mockVulnerabilities, OWASP_CATEGORIES, mockProjects } from '../utils/securityData';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';
import PageTip from '../components/PageTip';
import EmptyState from '../components/EmptyState';

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

// Animated Card Component
const AnimatedCard = ({ children, delay = 0, className = '' }) => {
  const { ref, isVisible } = useScrollReveal();
  
  return (
    <div
      ref={ref}
      className={`minimal-card transition-all duration-500 ease-out ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.98)',
        transitionDelay: `${delay}ms`
      }}
    >
      {children}
    </div>
  );
};

// Animated Background for Analysis Page — stronger, security-themed
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
  'SSRF': Globe,
};

const SEVERITY_CONFIG = {
  critical: {
    bg: 'bg-red-500',
    text: 'text-red-600',
    textLight: 'text-red-500',
    bgLight: 'bg-red-50',
    bgGlass: 'bg-red-50/80',
    border: 'border-red-200',
    borderGlass: 'border-red-300/70',
    ring: 'ring-red-400/30',
    iconBg: 'from-red-500 to-rose-500',
  },
  high: {
    bg: 'bg-amber-500',
    text: 'text-amber-600',
    textLight: 'text-amber-500',
    bgLight: 'bg-amber-50',
    bgGlass: 'bg-amber-50/80',
    border: 'border-amber-200',
    borderGlass: 'border-amber-300/70',
    ring: 'ring-amber-400/30',
    iconBg: 'from-amber-500 to-orange-500',
  },
  medium: {
    bg: 'bg-yellow-500',
    text: 'text-yellow-600',
    textLight: 'text-yellow-500',
    bgLight: 'bg-yellow-50',
    bgGlass: 'bg-yellow-50/80',
    border: 'border-yellow-200',
    borderGlass: 'border-yellow-300/70',
    ring: 'ring-yellow-400/30',
    iconBg: 'from-yellow-500 to-amber-500',
  },
  low: {
    bg: 'bg-blue-500',
    text: 'text-blue-600',
    textLight: 'text-blue-500',
    bgLight: 'bg-blue-50',
    bgGlass: 'bg-blue-50/80',
    border: 'border-blue-200',
    borderGlass: 'border-blue-300/70',
    ring: 'ring-blue-400/30',
    iconBg: 'from-blue-500 to-cyan-500',
  },
};

// Convert a scanner finding (status: pass | warning | fail, severity:
// critical | high | medium | low | info) to the Analysis-page
// vulnerability format so it can be rendered alongside the existing
// list. Pure transform — keeps the original finding object intact and
// only enriches the shape.
const findingToVuln = (f) => ({
  id: `scanner-${f.id}`,
  title: f.name,
  severity: f.severity && f.severity !== 'info' ? f.severity : 'medium',
  category: f.id,
  location: `Scanner · line ${(f.evidence?.[0]?.line ?? 0) + 1}`,
  status: f.status === 'pass' ? 'fixed' : 'open',
  description: f.description,
  cwe: f.cwe,
  evidence: f.evidence,
  remediation: f.remediation,
  fromScanner: true,
});

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

const Analysis = () => {
  const { showToast } = useToast();
  const { lastScanResult, clearLastScanResult } = useApp();
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedVuln, setExpandedVuln] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState('all');
  const [vulnerabilities, setVulnerabilities] = useState(mockVulnerabilities);
  const [fixedVulns, setFixedVulns] = useState(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  // Whenever a new scan comes in from the OWASPScanner (via
  // AppContext), merge its findings into the visible vulnerabilities
  // list. Scanner entries are tagged `fromScanner: true` so we can
  // avoid duplicates on re-renders and style them slightly differently.
  useEffect(() => {
    if (!lastScanResult) return;
    setVulnerabilities((prev) => {
      const existingIds = new Set(prev.map((v) => v.id));
      const merged = [...prev];
      lastScanResult.findings.forEach((f) => {
        const id = `scanner-${f.id}`;
        if (existingIds.has(id)) return; // already merged
        merged.push(findingToVuln(f));
      });
      return merged;
    });
  }, [lastScanResult]);

  // Handle export
  const handleExport = () => {
    showToast('Preparing vulnerability report...', 'info');
    setTimeout(() => {
      const data = filteredVulns.map(v => ({
        id: v.id,
        title: v.title,
        severity: v.severity,
        category: v.category,
        location: v.location,
        status: fixedVulns.has(v.id) ? 'fixed' : v.status
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
    await new Promise(resolve => setTimeout(resolve, 1000));
    setFixedVulns(prev => new Set([...prev, vulnId]));
    setVulnerabilities(prev => prev.map(v => 
      v.id === vulnId ? { ...v, status: 'fixed' } : v
    ));
    showToast('Vulnerability marked as fixed!');
  };

  // Handle view in IDE
  const handleViewInIDE = (vuln) => {
    showToast(`Opening ${vuln.location} in IDE...`, 'info');
  };

  const filteredVulns = vulnerabilities.filter(vuln => {
    if (selectedSeverity !== 'all' && vuln.severity !== selectedSeverity) return false;
    if (selectedCategory !== 'all' && vuln.category !== selectedCategory) return false;
    if (searchQuery && !vuln.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (fixedVulns.has(vuln.id)) return false;
    return true;
  });

  const handleScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    
    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsScanning(false);
          return 100;
        }
        return prev + 5;
      });
    }, 150);
  };

  const severityCounts = {
    critical: vulnerabilities.filter(v => v.severity === 'critical').length,
    high: vulnerabilities.filter(v => v.severity === 'high').length,
    medium: vulnerabilities.filter(v => v.severity === 'medium').length,
    low: vulnerabilities.filter(v => v.severity === 'low').length,
  };

  const getCategoryStats = (category) => {
    return vulnerabilities.filter(v => v.category === category).length;
  };

  const clearFilters = () => {
    setSelectedSeverity('all');
    setSelectedCategory('all');
    setSearchQuery('');
  };

  const hasActiveFilters = selectedSeverity !== 'all' || selectedCategory !== 'all' || searchQuery;

  return (
    <div className="relative">
      {/* Animated Background */}
      <AnalysisBackground />
      
      <div className={`p-6 lg:p-8 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'} relative z-10`}>
      {/* Page Tip — first-time guidance */}
      <PageTip
        pageId="analysis"
        variant="info"
        title="Run a vulnerability scan"
        body="Click 'Run New Scan' to analyze a project. Use the OWASP sidebar to filter by category, search by keyword, or export the results to JSON for sharing."
        cta={{ label: "Open the Code IDE", href: "/sandbox" }}
      />
      {/* Header */}
      <AnimatedSection className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 via-rose-500 to-pink-500 flex items-center justify-center shadow-lg shadow-red-500/20 flex-shrink-0">
            <ScanSearch className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 animate-page-enter">Security Analysis</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Comprehensive vulnerability assessment & OWASP coverage</p>
          </div>
        </div>
        <button
          onClick={handleScan}
          disabled={isScanning}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 shadow-sm ${
            isScanning
              ? 'bg-slate-200/80 text-slate-600 cursor-not-allowed'
              : 'bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5'
          }`}
        >
          {isScanning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Scanning... {scanProgress}%
            </>
          ) : (
            <>
              <ScanSearch className="w-4 h-4" />
              Run New Scan
            </>
          )}
        </button>
      </AnimatedSection>

      {/* Latest OWASP Scanner result — surfaced here so the user can
          see how the scanner's findings map onto the Analysis view. We
          pre-merge the scan findings into the vulnerabilities list and
          also render a compact banner at the top with the score, summary
          and a "dismiss" link. */}
      {lastScanResult && (
        <AnimatedSection delay={50} className="mb-6">
          <LatestScanBanner
            scan={lastScanResult}
            onDismiss={clearLastScanResult}
          />
        </AnimatedSection>
      )}

      {/* Progress Bar */}
      {isScanning && (
        <AnimatedCard className="glass-strong p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <ScanSearch className="w-4 h-4 text-blue-500 animate-pulse" />
              Scanning project files...
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{scanProgress}%</span>
          </div>
          <div className="h-2 bg-slate-200/70 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-300 rounded-full"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
        </AnimatedCard>
      )}

      {/* Stats Overview — glass cards */}
      <AnimatedSection delay={100}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <button
            onClick={() => setSelectedSeverity('all')}
            className={`group relative p-4 rounded-2xl border transition-all duration-300 backdrop-blur-xl backdrop-saturate-150 ${
              selectedSeverity === 'all'
                ? 'bg-slate-900/95 dark:bg-blue-600/95 text-white border-slate-900 dark:border-blue-600 shadow-lg scale-[1.02]'
                : 'glass-card hover:-translate-y-1'
            }`}
          >
            <div className={`text-2xl font-bold transition-colors ${selectedSeverity === 'all' ? 'text-white' : 'text-slate-900 dark:text-slate-100 group-hover:text-blue-600'}`}>
              {vulnerabilities.length}
            </div>
            <div className={`text-xs uppercase font-semibold mt-1 tracking-wider ${selectedSeverity === 'all' ? 'text-white/70' : 'text-slate-500'}`}>
              Total
            </div>
            {selectedSeverity === 'all' && (
              <div className="absolute inset-x-0 -bottom-px h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
            )}
          </button>

          {Object.entries(severityCounts).map(([severity, count]) => {
            const config = SEVERITY_CONFIG[severity];
            const isActive = selectedSeverity === severity;
            return (
              <button
                key={severity}
                onClick={() => setSelectedSeverity(severity)}
                className={`group relative p-4 rounded-2xl border transition-all duration-300 backdrop-blur-xl backdrop-saturate-150 ${
                  isActive
                    ? `${config.bgGlass} ${config.borderGlass} ring-2 ${config.ring} shadow-lg scale-[1.02]`
                    : 'glass-card hover:-translate-y-1'
                }`}
              >
                <div className={`text-2xl font-bold ${isActive ? config.text : config.textLight}`}>{count}</div>
                <div className={`text-xs uppercase font-semibold mt-1 tracking-wider ${isActive ? config.text : 'text-slate-500'}`}>
                  {severity}
                </div>
                {isActive && (
                  <div className="absolute inset-x-0 -bottom-px h-0.5 bg-gradient-to-r from-transparent via-current to-transparent opacity-50" />
                )}
              </button>
            );
          })}
        </div>
      </AnimatedSection>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* OWASP Categories — glass card */}
        <AnimatedCard delay={150} className="glass-strong p-5 group sticky top-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500" />
              OWASP Top 10
            </h2>
            <span className="text-xs text-slate-400 font-mono">2026</span>
          </div>
          <div className="space-y-1">
            {OWASP_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.name] || Shield;
              const count = getCategoryStats(cat.name);
              const isActive = selectedCategory === cat.name;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(isActive ? 'all' : cat.name)}
                  className={`group/cat w-full flex items-center gap-3 p-2.5 rounded-xl transition-all duration-300 ${
                    isActive
                      ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-md'
                      : 'hover:bg-white/70 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${
                    isActive
                      ? 'bg-white/20 ring-2 ring-white/30'
                      : count > 0
                        ? 'bg-red-50 ring-1 ring-red-200'
                        : 'bg-slate-100'
                  }`}>
                    <Icon className={`w-4 h-4 ${
                      isActive ? 'text-white' :
                      count > 0 ? 'text-red-500' : 'text-slate-400'
                    }`} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className={`font-medium text-sm truncate ${isActive ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>{cat.name}</div>
                    <div className={`text-[10px] font-mono ${isActive ? 'text-white/60' : 'text-slate-400'}`}>{cat.id}</div>
                  </div>
                  {count > 0 && (
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </AnimatedCard>

        {/* Vulnerabilities List */}
        <div className="lg:col-span-3 space-y-4">
          {/* Filters — glass card */}
          <div className="glass-strong p-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search vulnerabilities by title..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 backdrop-blur text-sm text-slate-700 dark:text-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                />
              </div>

              {/* Project Filter */}
              <select 
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 backdrop-blur text-sm text-slate-700 dark:text-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              >
                <option value="all">All Projects</option>
                {mockProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-white/60 transition-all"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}

              {/* Export */}
              <button
                onClick={handleExport}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-3">
            {filteredVulns.length === 0 ? (
              <div className="glass-strong overflow-hidden">
                <EmptyState
                  icon={CheckCircle}
                  iconColor="from-emerald-500 to-teal-500"
                  iconBg="bg-emerald-50"
                  title={hasActiveFilters ? 'No matches for your filters' : 'No vulnerabilities — looking good!'}
                  description={hasActiveFilters
                    ? 'Try clearing some filters or running a fresh scan to see all results.'
                    : 'When a scan finds issues they will appear here. You can mark them as fixed or jump to the IDE.'}
                  primaryCta={hasActiveFilters
                    ? { label: 'Clear filters', onClick: clearFilters }
                    : { label: 'Run a fresh scan', onClick: handleScan }}
                  secondaryCta={{ label: 'Open Code IDE', href: '/sandbox' }}
                />
              </div>
            ) : (
              filteredVulns.map((vuln) => {
                const config = SEVERITY_CONFIG[vuln.severity];
                const Icon = CATEGORY_ICONS[vuln.category] || AlertTriangle;
                const isExpanded = expandedVuln === vuln.id;
                
                return (
                  <AnimatedSection key={vuln.id} delay={vuln.severity === 'critical' ? 0 : Object.keys(SEVERITY_CONFIG).indexOf(vuln.severity) * 50}>
                    <div className="glass-card overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
                      <div 
                        className="p-4 cursor-pointer hover:bg-white/40 dark:hover:bg-slate-700/40 transition-colors duration-300"
                        onClick={() => setExpandedVuln(isExpanded ? null : vuln.id)}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`relative w-11 h-11 rounded-xl bg-gradient-to-br ${config.iconBg} flex items-center justify-center shadow-md flex-shrink-0`}>
                            <Icon className="w-5 h-5 text-white" />
                            <div className="absolute inset-0 rounded-xl bg-white/20 opacity-50" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`px-2 py-0.5 ${config.bg} text-white text-[10px] font-bold rounded uppercase tracking-wider shadow-sm`}>
                                {vuln.severity}
                              </span>
                              <span className="font-mono text-xs text-slate-400">{vuln.cweId}</span>
                              <span className="font-mono text-xs text-slate-400">{vuln.owaspId}</span>
                            </div>
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{vuln.title}</h3>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <FileCode className="w-3.5 h-3.5" />
                                {vuln.location}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {new Date(vuln.discoveredAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`minimal-badge ${
                              fixedVulns.has(vuln.id) ? 'badge-success' :
                              vuln.status === 'open' ? 'badge-error' :
                              vuln.status === 'in_progress' ? 'badge-warning' :
                              'badge-success'
                            }`}>
                              {fixedVulns.has(vuln.id) ? 'fixed' : vuln.status.replace('_', ' ')}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-slate-400 transition-transform duration-300" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-slate-400 transition-transform duration-300" />
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 border-t border-slate-200/70 dark:border-slate-700/70 animate-slide-up bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm">
                          <div className="pt-4 space-y-4">
                            <div>
                              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</h4>
                              <p className="text-sm text-slate-700 leading-relaxed">{vuln.description}</p>
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                CVSS Score
                                <span className={`text-xs font-bold ${config.text}`}>{vuln.cvss} / 10</span>
                              </h4>
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 bg-slate-200/70 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${config.bg} transition-all duration-700 rounded-full`}
                                    style={{ width: `${vuln.cvss * 10}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Remediation</h4>
                              <p className="text-sm text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 p-3 rounded-xl leading-relaxed">{vuln.remediation}</p>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <button 
                                onClick={() => handleMarkAsFixed(vuln.id)}
                                disabled={fixedVulns.has(vuln.id)}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 shadow-sm"
                              >
                                {fixedVulns.has(vuln.id) ? (
                                  <>
                                    <Check className="w-4 h-4" />
                                    Fixed
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4" />
                                    Mark as Fixed
                                  </>
                                )}
                              </button>
                              <button 
                                onClick={() => handleViewInIDE(vuln)}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-all duration-300 hover:-translate-y-0.5"
                              >
                                <Eye className="w-4 h-4" />
                                View in IDE
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </AnimatedSection>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default Analysis;
