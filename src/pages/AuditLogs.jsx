import React, { useState, useEffect, useCallback } from 'react';
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
import { dashboardAPI } from '../services/api';
import { useApp } from '../context/AppContext';

// The API records what happened ("SCAN_COMPLETED", "login", ...). The page
// renders a small set of known events, so each stored action is mapped onto
// the closest one and anything unknown becomes a plain "Activity" entry.
const ACTION_ALIASES = {
  SCAN_COMPLETED: 'security_scan',
  security_scan: 'security_scan',
  VULNERABILITY_FIXED: 'vulnerability_fixed',
  vulnerability_fixed: 'vulnerability_fixed',
  VULNERABILITY_OPENED: 'critical_vulnerability',
  critical_vulnerability: 'critical_vulnerability',
  API_KEY_CREATED: 'api_key_created',
  api_key_created: 'api_key_created',
  TEAM_MEMBER_INVITED: 'team_invite',
  team_invite: 'team_invite',
  TEAM_MEMBER_REMOVED: 'team_invite',
  TEAM_MEMBER_ROLE_CHANGED: 'team_invite',
  LOGIN: 'login',
  login: 'login',
  REGISTER: 'login',
  register: 'login',
  failed_login: 'failed_login',
  LOGOUT: 'settings_changed',
  logout: 'settings_changed',
  PROFILE_UPDATED: 'settings_changed',
  SETTINGS_CHANGED: 'settings_changed',
  settings_changed: 'settings_changed',
  PROJECT_CREATED: 'security_scan',
  INTEGRATION_CONNECTED: 'settings_changed',
  INTEGRATION_DISCONNECTED: 'settings_changed',
};

const describeDetails = (details) => {
  if (!details) return 'Activity recorded.';
  if (typeof details === 'string') return details;
  if (typeof details !== 'object') return String(details);
  const parts = Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  return parts.length ? parts.join(' · ') : 'Activity recorded.';
};

const normaliseLog = (row, actorName, actorEmail) => {
  const action = ACTION_ALIASES[row.action] || 'activity';
  const resource = row.resourceType
    ? `${row.resourceType}${row.resourceId ? ': ' + row.resourceId : ''}`
    : 'Account';

  return {
    id: row.id,
    timestamp: row.createdAt,
    action,
    actor: actorName || 'You',
    actorEmail: actorEmail || '',
    resource,
    details: describeDetails(row.details),
    ip: row.ipAddress || 'N/A',
    status: 'success',
    severity:
      action === 'critical_vulnerability'
        ? 'error'
        : action === 'api_key_created' || action === 'failed_login'
          ? 'warning'
          : 'info',
  };
};

const AuditLogs = () => {
  const { showToast } = useToast();
  const { user } = useApp();
  const userName = user?.name || user?.email || 'You';
  const userEmail = user?.email || '';
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
    showToast('Refreshing audit logs...', 'info');
    setIsRefreshing(true);
    await loadLogs();
    setIsRefreshing(false);
    showToast('Audit logs refreshed!');
  };

  // The account's own activity trail.
  //
  // These entries used to be a fixed demo list: a GitHub OAuth login that
  // never happened, a failed login from a made-up IP, a SQL injection in
  // somebody else's project. The API records what actually happened.
  const [logs, setLogs] = useState([]);

  const loadLogs = useCallback(async () => {
    try {
      const data = await dashboardAPI.getAuditLogs();
      const list = Array.isArray(data?.logs) ? data.logs : [];
      setLogs(list.map((l) => normaliseLog(l, userName, userEmail)));
    } catch {
      setLogs([]);
    }
  }, [userName, userEmail]);

  useEffect(() => {
    setMounted(true);
    loadLogs();
  }, [loadLogs]);

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
    // Anything the API records that this page does not have a dedicated
    // look for still renders as a plain activity entry.
    activity: { icon: Activity, color: 'text-slate-600', bg: 'bg-slate-50', label: 'Activity' },
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
