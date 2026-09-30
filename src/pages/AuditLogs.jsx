import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Search, 
  Filter,
  Download,
  Calendar,
  Clock,
  User,
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useToast } from '../components/Toast';
import PageTip from '../components/PageTip';
import EmptyState from '../components/EmptyState';

const AuditLogs = () => {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [expandedLog, setExpandedLog] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle export logs
  const handleExportLogs = () => {
    showToast('Preparing audit logs export...', 'info');
    setTimeout(() => {
      const data = logs.map(log => ({
        timestamp: log.timestamp,
        action: log.action,
        actor: log.actor,
        email: log.actorEmail,
        resource: log.resource,
        details: log.details,
        ip: log.ip,
        status: log.status
      }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Audit logs exported successfully!');
    }, 1000);
  };

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    showToast('Refreshing audit logs...', 'info');
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsRefreshing(false);
    showToast('Audit logs refreshed!');
  };

  const logs = [
    { 
      id: 1, 
      timestamp: '2024-01-17 14:32:15',
      action: 'security_scan',
      actor: 'Sarah Chen',
      actorEmail: 'sarah.chen@company.com',
      resource: 'Project: E-Commerce API',
      details: 'Completed OWASP vulnerability scan',
      ip: '192.168.1.105',
      status: 'success',
      severity: 'info'
    },
    { 
      id: 2, 
      timestamp: '2024-01-17 14:15:42',
      action: 'vulnerability_fixed',
      actor: 'Marcus Johnson',
      actorEmail: 'marcus.j@company.com',
      resource: 'Vulnerability: SQL Injection (CWE-89)',
      details: 'Marked as fixed after code remediation',
      ip: '192.168.1.112',
      status: 'success',
      severity: 'success'
    },
    { 
      id: 3, 
      timestamp: '2024-01-17 13:58:23',
      action: 'api_key_created',
      actor: 'Sarah Chen',
      actorEmail: 'sarah.chen@company.com',
      resource: 'API Key: CI/CD Integration',
      details: 'New API key created with scan permissions',
      ip: '192.168.1.105',
      status: 'success',
      severity: 'warning'
    },
    { 
      id: 4, 
      timestamp: '2024-01-17 13:45:11',
      action: 'critical_vulnerability',
      actor: 'System',
      actorEmail: 'system@secureide',
      resource: 'Project: Auth Service',
      details: 'Critical SQL Injection detected in /api/login endpoint',
      ip: 'N/A',
      status: 'alert',
      severity: 'error'
    },
    { 
      id: 5, 
      timestamp: '2024-01-17 12:30:05',
      action: 'team_invite',
      actor: 'Sarah Chen',
      actorEmail: 'sarah.chen@company.com',
      resource: 'User: new.user@company.com',
      details: 'Invited as Developer role',
      ip: '192.168.1.105',
      status: 'success',
      severity: 'info'
    },
    { 
      id: 6, 
      timestamp: '2024-01-17 11:22:18',
      action: 'login',
      actor: 'Emily Watson',
      actorEmail: 'emily.w@company.com',
      resource: 'Session',
      details: 'Successful login via GitHub OAuth',
      ip: '203.0.113.42',
      status: 'success',
      severity: 'info'
    },
    { 
      id: 7, 
      timestamp: '2024-01-17 10:15:33',
      action: 'failed_login',
      actor: 'Unknown',
      actorEmail: 'admin@malicious.com',
      resource: 'Session',
      details: 'Failed login attempt - invalid credentials',
      ip: '198.51.100.23',
      status: 'failed',
      severity: 'warning'
    },
    { 
      id: 8, 
      timestamp: '2024-01-17 09:45:00',
      action: 'settings_changed',
      actor: 'Sarah Chen',
      actorEmail: 'sarah.chen@company.com',
      resource: 'Organization Settings',
      details: 'Updated webhook URL configuration',
      ip: '192.168.1.105',
      status: 'success',
      severity: 'info'
    },
  ];

  const logTypes = [
    { id: 'all', label: 'All Events' },
    { id: 'security', label: 'Security' },
    { id: 'auth', label: 'Authentication' },
    { id: 'team', label: 'Team' },
    { id: 'api', label: 'API' },
  ];

  const actionConfig = {
    security_scan: { icon: Shield, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Security Scan' },
    vulnerability_fixed: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Vulnerability Fixed' },
    api_key_created: { icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50', label: 'API Key Created' },
    critical_vulnerability: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: 'Critical Alert' },
    team_invite: { icon: User, color: 'text-violet-600', bg: 'bg-violet-50', label: 'Team Invite' },
    login: { icon: Activity, color: 'text-slate-600', bg: 'bg-slate-50', label: 'Login' },
    failed_login: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Failed Login' },
    settings_changed: { icon: Activity, color: 'text-slate-600', bg: 'bg-slate-50', label: 'Settings Changed' },
  };

  const severityConfig = {
    info: 'bg-blue-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  };

  const statusConfig = {
    success: 'badge-success',
    failed: 'badge-error',
    alert: 'badge-error',
  };

  const filteredLogs = logs.filter(log => {
    if (searchQuery && !log.details.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !log.actor.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className={`p-6 lg:p-8 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Page Tip — first-time guidance */}
      <PageTip
        pageId="audit-logs"
        variant="info"
        title="Full activity timeline"
        body="Every scan, fix, login, and setting change is recorded here. Click any row to expand it for IP and resource details, or export the full log to JSON."
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Audit Logs</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Track all security and system events</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportLogs}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Logs
          </button>
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{logs.length}</div>
          <div className="text-sm text-slate-500">Total Events</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-emerald-600">{logs.filter(l => l.severity === 'success').length}</div>
          <div className="text-sm text-slate-500">Successful</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-amber-600">{logs.filter(l => l.severity === 'warning').length}</div>
          <div className="text-sm text-slate-500">Warnings</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-red-600">{logs.filter(l => l.severity === 'error').length}</div>
          <div className="text-sm text-slate-500">Critical</div>
        </div>
      </div>

      {/* Filters */}
      <div className="minimal-card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div className="flex gap-1">
            {logTypes.map(type => (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  selectedType === type.id
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="minimal-card overflow-hidden">
            <EmptyState
              icon={ClipboardList}
              iconColor="from-blue-500 to-violet-500"
              iconBg="bg-blue-50"
              title={searchQuery ? 'No log entries match your search' : 'No activity yet'}
              description={searchQuery
                ? 'Try a different keyword or clear the search to see all events.'
                : 'System events will appear here as soon as activity is detected.'}
              primaryCta={searchQuery
                ? { label: 'Clear search', onClick: () => setSearchQuery('') }
                : { label: 'Refresh', onClick: handleRefresh }}
            />
          </div>
        ) : (
        filteredLogs.map((log) => {
          const config = actionConfig[log.action];
          const Icon = config.icon;
          const isExpanded = expandedLog === log.id;
          
          return (
            <div 
              key={log.id}
              className={`minimal-card overflow-hidden transition-all ${log.severity === 'error' ? 'border-l-4 border-l-red-500' : ''}`}
            >
              <div 
                className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setExpandedLog(isExpanded ? null : log.id)}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${severityConfig[log.severity]}`} />
                      <span className="font-medium text-slate-900 dark:text-slate-100">{config.label}</span>
                      <span className={`minimal-badge ${statusConfig[log.status] || 'badge-info'}`}>
                        {log.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">{log.details}</p>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {log.actor}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(log.timestamp).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {log.timestamp.split(' ')[1]}
                      </span>
                      <span>IP: {log.ip}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </div>
              </div>
              
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 border-t border-slate-100 animate-slide-up">
                  <div className="pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-slate-400 mb-1">Actor</div>
                        <div className="text-slate-900 dark:text-slate-100">{log.actor}</div>
                        <div className="text-slate-500 text-xs">{log.actorEmail}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 mb-1">Resource</div>
                        <div className="text-slate-900 dark:text-slate-100">{log.resource}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 mb-1">IP Address</div>
                        <div className="text-slate-900 dark:text-slate-100 font-mono">{log.ip}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 mb-1">Timestamp</div>
                        <div className="text-slate-900 dark:text-slate-100">{log.timestamp}</div>
                      </div>
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
  );
};

export default AuditLogs;
