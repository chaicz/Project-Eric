import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Filter,
  Search,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileJson,
  FileSpreadsheet,
  Printer,
  Share2,
  RefreshCw,
  MoreHorizontal,
  Eye,
  X,
  Loader2,
  Shield,
  Sparkles,
  ExternalLink,
  Send,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';
import PageTip from '../components/PageTip';
import EmptyState from '../components/EmptyState';

const Reports = () => {
  const { showToast } = useToast();
  const { lastScanResult, clearLastScanResult } = useApp();
  const [mounted, setMounted] = useState(false);
  const [selectedType, setSelectedType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Whenever a fresh OWASP scan lands, register it as a downloadable
  // report in this page. The report has a date stamp, type, score, and
  // the same `handleDownload` / `handlePreview` shapes used by the
  // curated list, so the existing UI just works.
  const scannerReports = useMemo(() => {
    if (!lastScanResult) return [];
    const scannedAt = lastScanResult.scannedAt ? new Date(lastScanResult.scannedAt) : new Date();
    const dateStr = scannedAt.toISOString().split('T')[0];
    const name = `OWASP Scanner Report · ${dateStr} · score ${lastScanResult.score}/100`;
    return [{
      id: 'scanner-report',
      name,
      type: 'owasp',
      date: dateStr,
      generatedAt: scannedAt.toLocaleString(),
      size: `${Math.max(1, Math.round((lastScanResult.findings?.length || 1) * 12))} KB`,
      status: 'completed',
      score: lastScanResult.score,
      summary: lastScanResult.summary,
      totalIssues: lastScanResult.totalIssues,
      findingCount: lastScanResult.findings.length,
      fromScanner: true,
      payload: lastScanResult,
    }];
  }, [lastScanResult]);

  // Handle preview
  const handlePreview = (report) => {
    showToast(`Opening preview for ${report.name}...`, 'info');
  };

  // Handle download
  const handleDownload = (report) => {
    showToast(`Downloading ${report.name}...`, 'info');
    setTimeout(() => {
      // Scanner-generated reports export the actual scan payload as
      // JSON so the user can pipe it into a ticketing system or a
      // GRC tool. Curated reports keep the original text dump.
      let content;
      let mime = 'text/plain';
      let ext = 'txt';
      if (report.fromScanner && report.payload) {
        content = JSON.stringify(report.payload, null, 2);
        mime = 'application/json';
        ext = 'json';
      } else {
        content = `Report: ${report.name}\nDate: ${report.date}\nStatus: ${report.status}`;
      }
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.name.replace(/\s+/g, '-').toLowerCase()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`${report.name} downloaded!`);
    }, 1000);
  };

  // Handle export CSV
  const handleExportCSV = (report) => {
    showToast(`Exporting ${report.name} as CSV...`, 'info');
    setTimeout(() => {
      const csvContent = `Name,Type,Date,Size,Status\n${report.name},${report.type},${report.date},${report.size},${report.status}`;
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.name.replace(/\s+/g, '-').toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('CSV exported successfully!');
    }, 1000);
  };

  // Handle share
  const handleShare = async (report) => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: report.name,
          text: `Check out this security report: ${report.name}`,
          url: shareUrl
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Report link copied to clipboard!');
      }
    } catch (err) {
      showToast('Failed to share report', 'error');
    }
  };

  // Handle cancel processing
  const handleCancel = (report) => {
    if (window.confirm('Cancel this report generation?')) {
      showToast(`${report.name} generation cancelled`, 'info');
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    showToast('Checking for new reports...', 'info');
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsRefreshing(false);
    showToast('Reports list updated!');
  };

  // Handle generate report
  const handleGenerateReport = () => {
    setIsGenerating(true);
    showToast('Generating new report...', 'info');
    setTimeout(() => {
      setIsGenerating(false);
      showToast('Report generated successfully!');
    }, 2000);
  };

  // Handle quick export templates
  const handleQuickExport = (format) => {
    showToast(`Preparing ${format} export...`, 'info');
    setTimeout(() => {
      const content = format === 'PDF' 
        ? 'PDF Report content...' 
        : format === 'Excel' 
        ? 'Name,Type,Date\nReport 1,Security,2024-01-15'
        : '{"report": "data"}';
      const blob = new Blob([content], { type: format === 'JSON' ? 'application/json' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report.${format.toLowerCase()}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`${format} exported successfully!`);
    }, 1000);
  };

  const reports = [
    { 
      id: 1, 
      name: 'Monthly Security Report', 
      type: 'security',
      date: '2024-01-15',
      size: '2.4 MB',
      status: 'completed',
      pages: 24
    },
    { 
      id: 2, 
      name: 'OWASP Vulnerability Assessment', 
      type: 'vulnerability',
      date: '2024-01-14',
      size: '1.8 MB',
      status: 'completed',
      pages: 18
    },
    { 
      id: 3, 
      name: 'Code Analysis Summary', 
      type: 'code',
      date: '2024-01-13',
      size: '856 KB',
      status: 'completed',
      pages: 12
    },
    { 
      id: 4, 
      name: 'Threat Intelligence Weekly', 
      type: 'threat',
      date: '2024-01-12',
      size: '3.1 MB',
      status: 'completed',
      pages: 32
    },
    { 
      id: 5, 
      name: 'Compliance Report - SOC2', 
      type: 'compliance',
      date: '2024-01-10',
      size: '4.2 MB',
      status: 'completed',
      pages: 45
    },
    { 
      id: 6, 
      name: 'Penetration Test Results', 
      type: 'pentest',
      date: '2024-01-08',
      size: '5.7 MB',
      status: 'processing',
      pages: 0
    },
  ];

  const reportTypes = [
    { id: 'all', label: 'All Reports' },
    { id: 'security', label: 'Security' },
    { id: 'vulnerability', label: 'Vulnerability' },
    { id: 'code', label: 'Code Analysis' },
    { id: 'threat', label: 'Threat Intel' },
    { id: 'compliance', label: 'Compliance' },
  ];

  // Merge the scanner-generated report(s) into the curated list. We
  // prepend them so they're easy to spot, and we filter out duplicates
  // if a re-scan produces the same id.
  const mergedReports = useMemo(() => {
    if (!scannerReports.length) return reports;
    const seen = new Set(reports.map((r) => r.id));
    const extras = scannerReports.filter((r) => !seen.has(r.id));
    return [...extras, ...reports];
  }, [reports, scannerReports]);

  const filteredReports = mergedReports.filter(report => {
    if (selectedType !== 'all' && report.type !== selectedType) return false;
    if (searchQuery && !report.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const hasActiveFilters = selectedType !== 'all' || !!searchQuery;

  const typeColors = {
    security: 'bg-blue-50 text-blue-600',
    vulnerability: 'bg-red-50 text-red-600',
    code: 'bg-violet-50 text-violet-600',
    threat: 'bg-amber-50 text-amber-600',
    compliance: 'bg-emerald-50 text-emerald-600',
    pentest: 'bg-slate-50 text-slate-600',
  };

  return (
    <div className={`p-6 lg:p-8 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Page Tip — first-time guidance */}
      <PageTip
        pageId="reports"
        variant="info"
        title="Generate and export security reports"
        body="Click 'Generate Report' to compile the latest findings, or use one of the quick-export templates below for PDF, Excel, or JSON output."
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Reports</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Download and manage security reports</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={handleGenerateReport}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 backdrop-blur-md border shadow-lg shadow-blue-600/20 disabled:opacity-50 bg-blue-600/90 hover:bg-blue-600 border-white/20 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Generate Report
              </>
            )}
          </button>
        </div>
      </div>

      {/* Latest OWASP Scanner result — surfaced as a banner that
          links the freshest scan to a downloadable report. The actual
          scanner-generated report is also injected into the list below. */}
      {lastScanResult && (
        <div className="relative overflow-hidden rounded-2xl border border-violet-200/70 dark:border-violet-500/30 glass-strong p-4 sm:p-5 mb-6">
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-violet-500/20 to-blue-500/20 blur-2xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0 bg-gradient-to-br ${
              lastScanResult.score >= 85
                ? 'from-emerald-500 to-teal-600'
                : lastScanResult.score >= 65
                ? 'from-amber-500 to-orange-600'
                : 'from-rose-500 to-red-600'
            }`}>
              <Send className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                  From OWASP Scanner
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {lastScanResult.scannedAt ? new Date(lastScanResult.scannedAt).toLocaleString() : 'just now'}
                </span>
              </div>
              <h2 className="mt-1.5 text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Latest scan: score {lastScanResult.score}/100 · {lastScanResult.summary}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                {lastScanResult.totalIssues} issues across {lastScanResult.findings.length} OWASP categories. A ready-to-download report from this scan now appears in the list below.
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

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{reports.length}</div>
          <div className="text-sm text-slate-500">Total Reports</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{reports.filter(r => r.status === 'completed').length}</div>
          <div className="text-sm text-slate-500">Completed</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">1</div>
          <div className="text-sm text-slate-500">Processing</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">18.1 MB</div>
          <div className="text-sm text-slate-500">Total Size</div>
        </div>
      </div>

      {/* Filters */}
      <div className="minimal-card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reports..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <div className="flex gap-1">
              {reportTypes.map(type => (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    selectedType === type.id
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div className="minimal-card overflow-hidden">
        {filteredReports.length === 0 ? (
          <EmptyState
            icon={FileText}
            iconColor="from-blue-500 to-violet-500"
            iconBg="bg-blue-50"
            title={hasActiveFilters ? 'No reports match your filters' : 'No reports yet'}
            description={hasActiveFilters
              ? 'Try clearing the search or selecting a different type.'
              : 'Generate your first report to see it listed here.'}
            primaryCta={hasActiveFilters
              ? { label: 'Clear filters', onClick: () => { setSearchQuery(''); setSelectedType('all'); } }
              : { label: 'Generate Report', onClick: handleGenerateReport }}
          />
        ) : (
          <>
            <table className="minimal-table">
              <thead>
                <tr>
                  <th>Report Name</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((report) => (
              <tr key={report.id} className={report.fromScanner ? 'bg-violet-50/40 dark:bg-violet-500/5' : ''}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      report.fromScanner
                        ? 'bg-gradient-to-br from-violet-500/20 to-blue-500/20'
                        : 'bg-slate-100'
                    }`}>
                      {report.fromScanner
                        ? <Shield className="w-5 h-5 text-violet-600" />
                        : <FileText className="w-5 h-5 text-slate-600" />}
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        {report.name}
                        {report.fromScanner && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700">
                            Scanner
                          </span>
                        )}
                      </div>
                      {report.fromScanner ? (
                        <div className="text-xs text-slate-500">
                          {report.findingCount} OWASP categories · {report.totalIssues} issues
                        </div>
                      ) : report.pages > 0 ? (
                        <div className="text-xs text-slate-400">{report.pages} pages</div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${typeColors[report.type]}`}>
                    {report.type}
                  </span>
                </td>
                <td className="text-slate-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    {new Date(report.date).toLocaleDateString()}
                  </div>
                </td>
                <td className="text-slate-600">{report.size}</td>
                <td>
                  {report.status === 'completed' ? (
                    <span className="minimal-badge badge-success flex items-center gap-1 w-fit">
                      <CheckCircle className="w-3 h-3" />
                      Ready
                    </span>
                  ) : (
                    <span className="minimal-badge badge-warning flex items-center gap-1 w-fit">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Processing
                    </span>
                  )}
                </td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    {report.status === 'completed' ? (
                      <>
                        <button 
                          onClick={() => handlePreview(report)}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" 
                          title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDownload(report)}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" 
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleExportCSV(report)}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" 
                          title="Export CSV"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleShare(report)}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" 
                          title="Share"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={() => handleCancel(report)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          </>
        )}
      </div>

      {/* Export Templates */}
      <div className="mt-6 minimal-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Quick Export Templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button 
            onClick={() => handleQuickExport('PDF')}
            className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
              <FileText className="w-6 h-6 text-red-600" />
            </div>
            <div className="text-left">
              <div className="font-medium text-slate-900 dark:text-slate-100">PDF Report</div>
              <div className="text-sm text-slate-500">Full detailed report</div>
            </div>
          </button>
          <button 
            onClick={() => handleQuickExport('Excel')}
            className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-left">
              <div className="font-medium text-slate-900 dark:text-slate-100">Excel Spreadsheet</div>
              <div className="text-sm text-slate-500">Data in table format</div>
            </div>
          </button>
          <button 
            onClick={() => handleQuickExport('JSON')}
            className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <FileJson className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-left">
              <div className="font-medium text-slate-900 dark:text-slate-100">JSON Export</div>
              <div className="text-sm text-slate-500">Raw data for APIs</div>
            </div>
          </button>
        </div>
      </div>

      {/* No toast UI needed - using shared Toast */}
    </div>
  );
};

export default Reports;
