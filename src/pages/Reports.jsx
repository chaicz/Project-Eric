import React, { useState, useEffect } from 'react';
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
  Loader2
} from 'lucide-react';
import { useToast } from '../components/Toast';
import PageTip from '../components/PageTip';
import EmptyState from '../components/EmptyState';

const Reports = () => {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [selectedType, setSelectedType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle preview
  const handlePreview = (report) => {
    showToast(`Opening preview for ${report.name}...`, 'info');
  };

  // Handle download
  const handleDownload = (report) => {
    showToast(`Downloading ${report.name}...`, 'info');
    setTimeout(() => {
      // Create mock PDF content
      const content = `Report: ${report.name}\nDate: ${report.date}\nStatus: ${report.status}`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.name.replace(/\s+/g, '-').toLowerCase()}.txt`;
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

  const filteredReports = reports.filter(report => {
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
              <tr key={report.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{report.name}</div>
                      {report.pages > 0 && (
                        <div className="text-xs text-slate-400">{report.pages} pages</div>
                      )}
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
