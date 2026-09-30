import React, { useState, useEffect } from 'react';
import { 
  Plug, 
  Search,
  CheckCircle,
  XCircle,
  ExternalLink,
  RefreshCw,
  Github,
  Slack,
  LayoutList,
  GitBranch,
  Plus,
  Settings,
  Trash2,
  ArrowRight,
  Loader2,
  Link2,
  Unlink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import PageTip from '../components/PageTip';
import EmptyState from '../components/EmptyState';

const Integrations = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [connectedFilter, setConnectedFilter] = useState('all');
  const [connectingId, setConnectingId] = useState(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [integrations, setIntegrations] = useState([
    { 
      id: 1, 
      name: 'GitHub',
      category: 'vcs',
      description: 'Connect repositories and enable automatic security scanning on pull requests',
      icon: Github,
      connected: true,
      status: 'active',
      lastSync: '2024-01-17 14:30',
      features: ['Auto scan PRs', 'Security alerts', 'Dependency updates']
    },
    { 
      id: 2, 
      name: 'Slack',
      category: 'notifications',
      description: 'Receive security alerts and scan results directly in your Slack channels',
      icon: Slack,
      connected: true,
      status: 'active',
      lastSync: '2024-01-17 14:00',
      features: ['Real-time alerts', 'Daily digests', 'Custom channels']
    },
    { 
      id: 3, 
      name: 'Jira',
      category: 'project',
      description: 'Create tickets automatically for discovered vulnerabilities',
      icon: LayoutList,
      connected: false,
      status: null,
      lastSync: null,
      features: ['Auto-create tickets', 'Sync status', 'Priority mapping']
    },
    { 
      id: 4, 
      name: 'GitLab',
      category: 'vcs',
      description: 'Integrate security scanning into your GitLab CI/CD pipelines',
      icon: GitBranch,
      connected: false,
      status: null,
      lastSync: null,
      features: ['CI/CD integration', 'Merge request scanning', 'Security dashboards']
    },
    { 
      id: 5, 
      name: 'PagerDuty',
      category: 'notifications',
      description: 'Route critical security alerts to on-call teams',
      icon: Plug,
      connected: false,
      status: null,
      lastSync: null,
      features: ['Critical alerts', 'Escalation policies', 'Incident response']
    },
    { 
      id: 6, 
      name: 'Datadog',
      category: 'monitoring',
      description: 'Send security metrics and events to your Datadog dashboards',
      icon: Plug,
      connected: false,
      status: null,
      lastSync: null,
      features: ['Security metrics', 'Event tracking', 'Custom dashboards']
    },
  ]);

  // Handle connect integration
  const handleConnect = async (integration) => {
    setConnectingId(integration.id);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIntegrations(prev => prev.map(i => 
      i.id === integration.id ? { 
        ...i, 
        connected: true, 
        status: 'active',
        lastSync: new Date().toLocaleString()
      } : i
    ));
    setConnectingId(null);
    showToast(`${integration.name} connected successfully!`);
  };

  // Handle disconnect integration
  const handleDisconnect = (integration) => {
    if (window.confirm(`Are you sure you want to disconnect ${integration.name}?`)) {
      setIntegrations(prev => prev.map(i => 
        i.id === integration.id ? { 
          ...i, 
          connected: false, 
          status: null,
          lastSync: null
        } : i
      ));
      showToast(`${integration.name} disconnected`, 'info');
    }
  };

  // Handle configure integration
  const handleConfigure = (integration) => {
    showToast(`Opening ${integration.name} configuration...`, 'info');
    // In a real app, this would open a settings modal or redirect
  };

  // Handle learn more
  const handleLearnMore = (integration) => {
    showToast(`Opening documentation for ${integration.name}...`, 'info');
  };

  // Handle refresh
  const handleRefresh = () => {
    showToast('Checking for integration updates...', 'info');
    setTimeout(() => {
      setIntegrations(prev => prev.map(i => 
        i.connected ? { ...i, lastSync: new Date().toLocaleString() } : i
      ));
      showToast('Integrations updated!');
    }, 1500);
  };

  // Handle build integration
  const handleBuildIntegration = () => {
    showToast('Opening integration builder...', 'info');
    navigate('/api-keys');
  };

  // Handle API documentation
  const handleApiDocs = () => {
    showToast('Opening API documentation...', 'info');
  };

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'vcs', label: 'Version Control' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'project', label: 'Project Management' },
    { id: 'monitoring', label: 'Monitoring' },
  ];

  const filteredIntegrations = integrations.filter(integration => {
    if (connectedFilter !== 'all') {
      if (connectedFilter === 'connected' && !integration.connected) return false;
      if (connectedFilter === 'available' && integration.connected) return false;
    }
    if (searchQuery && !integration.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const connectedCount = integrations.filter(i => i.connected).length;

  return (
    <div className={`p-6 lg:p-8 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Page Tip — first-time guidance */}
      <PageTip
        pageId="integrations"
        variant="tip"
        title="Connect your toolchain"
        body="Link GitHub or GitLab to scan pull requests automatically, pipe alerts into Slack, and create Jira tickets from findings. Use the Build Integration button to wire up a custom webhook."
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Integrations</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Connect Project Eric with your favorite tools</p>
        </div>
        <button 
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Check for Updates
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{integrations.length}</div>
          <div className="text-sm text-slate-500">Available Integrations</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-emerald-600">{connectedCount}</div>
          <div className="text-sm text-slate-500">Connected</div>
        </div>
        <div className="minimal-card p-4">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{integrations.length - connectedCount}</div>
          <div className="text-sm text-slate-500">Available to Connect</div>
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
              placeholder="Search integrations..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setConnectedFilter('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                connectedFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setConnectedFilter('connected')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                connectedFilter === 'connected'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Connected
            </button>
            <button
              onClick={() => setConnectedFilter('available')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                connectedFilter === 'available'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Available
            </button>
          </div>
        </div>
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredIntegrations.length === 0 ? (
          <div className="md:col-span-2">
            <div className="minimal-card overflow-hidden">
              <EmptyState
                icon={Plug}
                iconColor="from-violet-500 to-purple-500"
                iconBg="bg-violet-50"
                title="No integrations match your filters"
                description="Try clearing your search or selecting a different category to see all available integrations."
                primaryCta={{ label: 'Clear filters', onClick: () => { setSearchQuery(''); setConnectedFilter('all'); } }}
              />
            </div>
          </div>
        ) : (
          filteredIntegrations.map((integration) => {
          const Icon = integration.icon;
          return (
            <div key={integration.id} className="minimal-card p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  integration.connected ? 'bg-emerald-50' : 'bg-slate-100'
                }`}>
                  <Icon className={`w-6 h-6 ${integration.connected ? 'text-emerald-600' : 'text-slate-600'}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{integration.name}</h3>
                    {integration.connected ? (
                      <span className="minimal-badge badge-success flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Connected
                      </span>
                    ) : (
                      <span className="minimal-badge badge-neutral">
                        Available
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{integration.description}</p>
                </div>
              </div>

              {/* Features */}
              <div className="flex flex-wrap gap-2 mb-4">
                {integration.features.map((feature, index) => (
                  <span key={index} className="px-2 py-1 bg-slate-50 text-slate-600 text-xs rounded-lg">
                    {feature}
                  </span>
                ))}
              </div>

              {/* Status */}
              {integration.connected && integration.lastSync && (
                <div className="text-xs text-slate-400 mb-4">
                  Last synced: {integration.lastSync}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                {integration.connected ? (
                  <>
                    <button 
                      onClick={() => handleConfigure(integration)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Configure
                    </button>
                    <button 
                      onClick={() => handleDisconnect(integration)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Unlink className="w-4 h-4" />
                      Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => handleConnect(integration)}
                      disabled={connectingId === integration.id}
                      className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {connectingId === integration.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Link2 className="w-4 h-4" />
                          Connect
                        </>
                      )}
                    </button>
                    <button 
                      onClick={() => handleLearnMore(integration)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Learn More
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })
        )}
      </div>

      {/* Custom Integration */}
      <div className="mt-6 minimal-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Looking for something else?</h2>
        <p className="text-slate-600 mb-4">
          Build a custom integration using our REST API and webhooks.
        </p>
        <div className="flex gap-3">
          <button 
            onClick={handleBuildIntegration}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors"
          >
            <Plug className="w-4 h-4" />
            Build Integration
          </button>
          <button 
            onClick={handleApiDocs}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            API Documentation
          </button>
        </div>
      </div>

      {/* No toast UI needed - using shared Toast */}
    </div>
  );
};

export default Integrations;
