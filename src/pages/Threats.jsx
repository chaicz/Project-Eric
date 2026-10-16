import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Shield,
  ExternalLink,
  Search,
  Clock,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Bug,
  TrendingUp,
  RefreshCw,
  Server,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';
import { mockThreats } from '../utils/securityData';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';
import PageTip from '../components/PageTip';
import EmptyState from '../components/EmptyState';
const AlertIcon = AlertTriangle;

const SEVERITY_CONFIG = {
  critical: { color: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50', border: 'border-l-red-500', label: 'Critical' },
  high: { color: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-l-amber-500', label: 'High' },
  medium: { color: 'bg-yellow-500', text: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-l-yellow-500', label: 'Medium' },
  low: { color: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-l-blue-500', label: 'Low' },
};

const Threats = () => {
  const { showToast } = useToast();
  const { lastScanResult, clearLastScanResult } = useApp();
  const [threats, setThreats] = useState(mockThreats);
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [expandedThreat, setExpandedThreat] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isApplyingFix, setIsApplyingFix] = useState(null);
  const [mitigatedThreats, setMitigatedThreats] = useState(new Set());
  const [cveSearchQuery, setCveSearchQuery] = useState('');
  const [cveResults, setCveResults] = useState(null);
  const [isSearchingCve, setIsSearchingCve] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Merge scanner findings into the threats feed so the latest scan
  // result shows up alongside the curated threats. A scanner finding
  // becomes a threat with a CWE id and a severity mapped from the
  // detector's status.
  useEffect(() => {
    if (!lastScanResult) return;
    setThreats((prev) => {
      const existing = new Set(prev.map((t) => t.id));
      const merged = [...prev];
      lastScanResult.findings.forEach((f) => {
        const id = `scanner-${f.id}`;
        if (existing.has(id)) return;
        const severity =
          f.severity && f.severity !== 'info' ? f.severity :
          f.status === 'fail' ? 'critical' :
          f.status === 'warning' ? 'high' : 'medium';
        merged.push({
          id,
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
        });
      });
      return merged;
    });
  }, [lastScanResult]);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    showToast('Refreshing threat feed...', 'info');
    await new Promise(resolve => setTimeout(resolve, 1500));
    setThreats([...mockThreats]);
    setIsRefreshing(false);
    showToast('Threat feed updated!');
  };

  // Handle view feed
  const handleViewFeed = () => {
    showToast('Opening live threat feed...', 'info');
  };

  // Handle apply fix
  const handleApplyFix = async (threatId) => {
    setIsApplyingFix(threatId);
    showToast('Applying mitigation fix...', 'info');
    await new Promise(resolve => setTimeout(resolve, 2000));
    setMitigatedThreats(prev => new Set([...prev, threatId]));
    setThreats(prev => prev.filter(t => t.id !== threatId));
    setIsApplyingFix(null);
    showToast('Threat mitigated successfully!');
  };

  // Handle view details
  const handleViewDetails = (threat) => {
    showToast(`Opening details for ${threat.title}...`, 'info');
  };

  // Handle CVE search
  const handleCveSearch = async (e) => {
    e.preventDefault();
    if (!cveSearchQuery.trim()) return;
    
    setIsSearchingCve(true);
    showToast(`Searching for ${cveSearchQuery}...`, 'info');
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock CVE results
    setCveResults({
      id: cveSearchQuery.toUpperCase(),
      description: 'Vulnerability description found in CVE database.',
      severity: 'High',
      cvss: 7.5,
      published: '2024-01-15',
      references: ['https://nvd.nist.gov/vuln/detail/' + cveSearchQuery]
    });
    setIsSearchingCve(false);
    showToast('CVE details found!');
  };

  // Handle view full report
  const handleViewFullReport = () => {
    showToast('Generating threat report...', 'info');
  };

  const filteredThreats = threats.filter(threat => {
    if (selectedSeverity !== 'all' && threat.severity !== selectedSeverity) return false;
    if (searchQuery && !threat.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (mitigatedThreats.has(threat.id)) return false;
    return true;
  });

  const threatCounts = {
    critical: threats.filter(t => t.severity === 'critical').length,
    high: threats.filter(t => t.severity === 'high').length,
    medium: threats.filter(t => t.severity === 'medium').length,
    low: threats.filter(t => t.severity === 'low').length,
  };

  return (
    <div className={`p-6 lg:p-8 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Page Tip — first-time guidance */}
      <PageTip
        pageId="threats"
        variant="warning"
        title="Real-time threat intelligence"
        body="Watch the live feed for newly disclosed CVEs and active exploits. Click any threat to expand remediation steps or apply a fix. Use the CVE search to look up any vulnerability by ID."
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Threat Intelligence</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Real-time security threat monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button 
            onClick={handleViewFeed}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors"
          >
            <Server className="w-4 h-4" />
            View Feed
          </button>
        </div>
      </div>

      {/* Latest OWASP Scanner result — surfaced as a banner above the
          live feed so the user can see the freshest scan is now part of
          the threat stream. Clicking the link jumps back to the
          scanner. */}
      {lastScanResult && (
        <div className="relative overflow-hidden rounded-2xl border border-rose-200/70 dark:border-rose-500/30 glass-strong p-4 sm:p-5 mb-6">
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-rose-500/20 to-amber-500/20 blur-2xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0 bg-gradient-to-br ${
              lastScanResult.score >= 85
                ? 'from-emerald-500 to-teal-600'
                : lastScanResult.score >= 65
                ? 'from-amber-500 to-orange-600'
                : 'from-rose-500 to-red-600'
            }`}>
              <AlertIcon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                  From OWASP Scanner
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {lastScanResult.scannedAt ? new Date(lastScanResult.scannedAt).toLocaleString() : 'just now'}
                </span>
              </div>
              <h2 className="mt-1.5 text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                New scanner findings merged into the feed
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Score {lastScanResult.score}/100 · {lastScanResult.summary} · {lastScanResult.totalIssues} issues across {lastScanResult.findings.length} OWASP categories. The findings now appear in the threat list below.
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
              <button
                type="button"
                onClick={clearLastScanResult}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800/70 transition-colors"
                aria-label="Dismiss latest scan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Feed Banner */}
      <div className="bg-slate-900 dark:bg-slate-950 rounded-xl p-4 text-white flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-ping absolute" />
            <div className="w-3 h-3 bg-red-500 rounded-full relative" />
          </div>
          <div>
            <div className="font-semibold">Live Threat Feed Active</div>
            <div className="text-sm text-slate-400">Monitoring {threats.length} active threats</div>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <div className="text-2xl font-bold">{threatCounts.critical}</div>
            <div className="text-slate-400">Critical</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{threatCounts.high}</div>
            <div className="text-slate-400">High</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{threatCounts.medium}</div>
            <div className="text-slate-400">Medium</div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="minimal-card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search threats, CVEs..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'critical', 'high', 'medium', 'low'].map((severity) => (
              <button
                key={severity}
                onClick={() => setSelectedSeverity(severity)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedSeverity === severity
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {severity.charAt(0).toUpperCase() + severity.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Threats List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Active Threats</h2>
            <span className="text-sm text-slate-500">{filteredThreats.length} threats</span>
          </div>
          
          <div className="space-y-3">
            {filteredThreats.length === 0 ? (
              <div className="minimal-card overflow-hidden">
                <EmptyState
                  icon={CheckCircle}
                  iconColor="from-emerald-500 to-teal-500"
                  iconBg="bg-emerald-50"
                  title="All threats mitigated!"
                  description="You've addressed every threat in your current view. New threats will appear automatically as they're discovered."
                  primaryCta={{ label: 'Refresh feed', onClick: handleRefresh }}
                />
              </div>
            ) : (
              filteredThreats.map((threat) => {
                const config = SEVERITY_CONFIG[threat.severity];
                const isExpanded = expandedThreat === threat.id;
                
                return (
                  <div 
                    key={threat.id}
                    className={`minimal-card overflow-hidden transition-all border-l-4 ${config.border}`}
                  >
                    <div 
                      className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedThreat(isExpanded ? null : threat.id)}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.bg}`}>
                          <AlertTriangle className={`w-5 h-5 ${config.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 ${config.color} text-white text-xs font-semibold rounded`}>
                              {config.label}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">{threat.source}</span>
                          </div>
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{threat.title}</h3>
                          <p className="text-sm text-slate-600 mt-1">{threat.description}</p>
                          <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {new Date(threat.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className={`px-4 pb-4 pt-0 border-t border-slate-100 animate-slide-up`}>
                        <div className="pt-4 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Affected Components</h4>
                              <div className="space-y-1">
                                {threat.affectedComponents.map((comp, i) => (
                                  <div key={i} className="flex items-center gap-2 text-sm">
                                    <Bug className="w-4 h-4 text-red-500" />
                                    <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{comp}</code>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Indicators</h4>
                              <div className="space-y-1">
                                {threat.indicators.map((ind, i) => (
                                  <div key={i} className="flex items-center gap-2 text-sm">
                                    <TrendingUp className="w-4 h-4 text-amber-500" />
                                    <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{ind}</code>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          <div>
                            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Mitigation</h4>
                            <p className="text-sm text-slate-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                              {threat.mitigation}
                            </p>
                          </div>
                          
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleApplyFix(threat.id)}
                              disabled={isApplyingFix === threat.id}
                              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                              {isApplyingFix === threat.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Applying...
                                </>
                              ) : (
                                <>
                                  <Shield className="w-4 h-4" />
                                  Apply Fix
                                </>
                              )}
                            </button>
                            <button 
                              onClick={() => handleViewDetails(threat)}
                              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                              View Details
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* CVE Search */}
          <div className="minimal-card p-5">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-600" />
              CVE Database
            </h3>
            <form onSubmit={handleCveSearch} className="space-y-3">
              <input
                type="text"
                value={cveSearchQuery}
                onChange={(e) => setCveSearchQuery(e.target.value)}
                placeholder="Search CVE (e.g., CVE-2024-1234)"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
              />
              <button 
                type="submit"
                disabled={isSearchingCve || !cveSearchQuery.trim()}
                className="w-full py-2.5 bg-slate-900 dark:bg-blue-600 text-white rounded-xl font-medium hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSearchingCve ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  'Search'
                )}
              </button>
            </form>
            
            {/* CVE Results */}
            {cveResults && (
              <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-blue-900">{cveResults.id}</span>
                </div>
                <p className="text-sm text-blue-800 mb-2">{cveResults.description}</p>
                <div className="flex items-center gap-4 text-xs text-blue-700">
                  <span>Severity: {cveResults.severity}</span>
                  <span>CVSS: {cveResults.cvss}</span>
                </div>
                <a 
                  href={cveResults.references[0]} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  View on NVD <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          {/* Related OWASP */}
          <div className="minimal-card p-5">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Related OWASP</h3>
            <div className="space-y-2">
              {[
                { name: 'A06: Vulnerable Components', count: 2 },
                { name: 'A03: Injection', count: 1 },
                { name: 'A02: Cryptographic', count: 1 },
              ].map((cat, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-sm text-slate-700">{cat.name}</span>
                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                    {cat.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-slate-900 dark:text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-violet-500/10 dark:from-blue-500/10 dark:to-violet-500/10 pointer-events-none" />
            <div className="relative">
              <h3 className="text-lg font-semibold mb-4">Threat Summary</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Total Active</span>
                  <span className="font-bold text-xl tabular-nums">{threats.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Mitigated Today</span>
                  <span className="font-bold text-xl tabular-nums">{mitigatedThreats.size}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Avg Response</span>
                  <span className="font-bold text-xl tabular-nums">--</span>
                </div>
              </div>
              <button 
                onClick={handleViewFullReport}
                className="w-full mt-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-white rounded-xl font-medium transition-colors"
              >
                View Full Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* No toast UI needed - using shared Toast */}
    </div>
  );
};

export default Threats;
