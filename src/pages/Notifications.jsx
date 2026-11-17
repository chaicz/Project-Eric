import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Search,
  CheckCircle,
  AlertTriangle,
  Info,
  AlertCircle,
  Clock,
  Filter,
  Check,
  X,
  Trash2,
  Settings,
  Volume2,
  VolumeX,
  Eye,
  Mail,
  CheckSquare
} from 'lucide-react';
import { useToast } from '../components/Toast';
import PageTip from '../components/PageTip';
import EmptyState from '../components/EmptyState';
import { dashboardAPI } from '../services/api';
import {
  readCachedSettings,
  loadSettings,
  saveSettings,
} from '../utils/accountSettings';

const Notifications = () => {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  // The account's notification preferences.
  //
  // These used to be kept under a `localStorage` key of their own,
  // separate from the one the Settings page used, so the two screens
  // disagreed about the same setting and neither followed the account.
  // Both now read the account's stored preferences.
  const [notificationPrefs, setNotificationPrefs] = useState(
    () => readCachedSettings().notifications
  );
  
  // The account's own alerts.
  //
  // This list used to be a fixed set of demo entries dated 2024, so every
  // account - including a brand-new one - was shown a SQL injection in an
  // "E-Commerce API" project it does not own. The API owns the list now.
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await dashboardAPI.getNotifications();
      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      setNotifications(
        list.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          timestamp: n.createdAt,
          read: !!n.read,
          // Errors and warnings are the ones that need a human.
          actionRequired: n.type === 'error' || n.type === 'warning',
          project: (n.data && n.data.projectName) || null,
        }))
      );
    } catch {
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    loadNotifications();
    // The preferences belong to the account, so they are read from the
    // API rather than from this browser.
    loadSettings().then(({ settings }) => {
      setNotificationPrefs(settings.notifications);
    });
  }, [loadNotifications]);

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'action-required', label: 'Action Required' },
  ];

  const typeConfig = {
    error: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-l-red-500' },
    warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-l-amber-500' },
    success: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-l-emerald-500' },
    info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-l-blue-500' },
    // Aliases for the shapes the API / mock server returns. Without
    // these the lookup below is undefined and the page crashes.
    vulnerability: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-l-red-500' },
    critical: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-l-red-500' },
    scan: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-l-emerald-500' },
    threat: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-l-amber-500' },
    report: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-l-blue-500' },
    team: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-l-blue-500' },
    dependency: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-l-amber-500' },
  };

  const filteredNotifications = notifications.filter(notif => {
    if (selectedFilter === 'unread' && notif.read) return false;
    if (selectedFilter === 'action-required' && !notif.actionRequired) return false;
    if (searchQuery && !notif.title.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !notif.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;
  const actionRequiredCount = notifications.filter(n => n.actionRequired && !n.read).length;

  const markAsRead = (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    dashboardAPI.markNotificationRead(id).catch(() => loadNotifications());
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    dashboardAPI.markAllNotificationsRead().catch(() => loadNotifications());
  };

  const deleteNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    dashboardAPI.deleteNotification(id).catch(() => loadNotifications());
  };

  const deleteAllRead = () => {
    setNotifications((prev) => prev.filter((n) => !n.read));
    dashboardAPI.deleteReadNotifications().catch(() => loadNotifications());
  };

  const toggleNotificationPref = async (key) => {
    const nextValue = !notificationPrefs[key];
    const previous = notificationPrefs;

    setNotificationPrefs((prev) => ({ ...prev, [key]: nextValue }));

    const result = await saveSettings({ notifications: { [key]: nextValue } });
    if (!result.ok) {
      setNotificationPrefs(previous);
      showToast(result.error || 'Could not save the preference', 'error');
      return;
    }
    if (result.settings?.notifications) {
      setNotificationPrefs(result.settings.notifications);
    }
  };

  const handleSettingsSave = () => {
    setShowSettings(false);
    showToast('Notification preferences saved!', 'success');
  };

  return (
    <div className={`p-6 lg:p-8 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Page Tip — first-time guidance */}
      <PageTip
        pageId="notifications"
        variant="info"
        title="All your alerts in one place"
        body="Use the filter pills to focus on Unread or Action Required items. Click the bell on any item to mark it read, or open Settings to fine-tune which alerts you receive."
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Notifications</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Stay updated with security alerts and activity</p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <CheckSquare className="w-4 h-4" />
              Mark all read
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{notifications.length}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Total Notifications</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{unreadCount}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Unread</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{actionRequiredCount}</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">Action Required</div>
        </div>
      </div>

      {/* Filters */}
      <div className="minimal-card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notifications..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/30 outline-none"
            />
          </div>
          <div className="flex gap-1">
            {filters.map(filter => (
              <button
                key={filter.id}
                onClick={() => setSelectedFilter(filter.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  selectedFilter === filter.id
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {notifications.filter(n => n.read).length > 0 && (
            <button
              onClick={deleteAllRead}
              className="text-sm text-slate-500 hover:text-red-600 flex items-center gap-1"
            >
              <Trash2 className="w-4 h-4" />
              Clear read
            </button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="minimal-card overflow-hidden">
            <EmptyState
              icon={Bell}
              iconColor="from-blue-500 to-cyan-500"
              iconBg="bg-blue-50"
              title={searchQuery ? 'No matches' : "You're all caught up!"}
              description={searchQuery
                ? 'Try a different keyword or clear the search to see all notifications.'
                : 'No notifications right now. New security alerts and activity will appear here.'}
              primaryCta={searchQuery
                ? { label: 'Clear search', onClick: () => setSearchQuery('') }
                : { label: 'Refresh view', onClick: () => showToast('Checking for updates...', 'info') }}
            />
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const config = typeConfig[notif.type] || typeConfig.info;
            const Icon = config.icon;
            
            return (
              <div
                key={notif.id}
                className={`minimal-card overflow-hidden transition-all ${!notif.read ? 'bg-blue-50/50 dark:bg-blue-500/10' : ''} ${config.border} border-l-4`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 ${config.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                        )}
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{notif.title}</h3>
                        {notif.actionRequired && (
                          <span className="minimal-badge badge-error">Action Required</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">{notif.message}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {notif.timestamp}
                        </span>
                        {notif.project && (
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-300">
                            {notif.project}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {!notif.read && (
                        <button
                          onClick={() => markAsRead(notif.id)}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors"
                          title="Mark as read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notif.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Notification Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md animate-scale-in border border-slate-200 dark:border-slate-700/60">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Notification Preferences</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">Critical Alerts</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Get notified about critical vulnerabilities</div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notificationPrefs.vulnerabilityAlerts}
                  aria-label="Critical Alerts"
                  onClick={() => toggleNotificationPref('vulnerabilityAlerts')}
                  className={`w-12 h-6 rounded-full transition-colors relative ${notificationPrefs.vulnerabilityAlerts ? 'bg-slate-900 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notificationPrefs.vulnerabilityAlerts ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">Scan Completion</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Get notified when scans complete</div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notificationPrefs.scanCompletion}
                  aria-label="Scan Completion"
                  onClick={() => toggleNotificationPref('scanCompletion')}
                  className={`w-12 h-6 rounded-full transition-colors relative ${notificationPrefs.scanCompletion ? 'bg-slate-900 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notificationPrefs.scanCompletion ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                    <Volume2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">Email Notifications</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Receive daily digest via email</div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notificationPrefs.email}
                  aria-label="Email Notifications"
                  onClick={() => toggleNotificationPref('email')}
                  className={`w-12 h-6 rounded-full transition-colors relative ${notificationPrefs.email ? 'bg-slate-900 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notificationPrefs.email ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">Push Notifications</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Browser push notifications</div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notificationPrefs.push}
                  aria-label="Push Notifications"
                  onClick={() => toggleNotificationPref('push')}
                  className={`w-12 h-6 rounded-full transition-colors relative ${notificationPrefs.push ? 'bg-slate-900 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notificationPrefs.push ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-700/60 flex justify-end gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSettingsSave}
                className="btn-primary"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
