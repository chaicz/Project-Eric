import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  Eye,
  EyeOff,
  Shield,
  AlertTriangle,
  Play,
  Bug,
  Scan,
  CheckCircle2,
  XCircle,
  Activity,
  Zap,
  Clock,
  Search,
  Filter,
  Settings,
  ChevronDown,
  ChevronRight,
  Terminal,
  BugOff,
  FlaskConical,
  BarChart3,
  TrendingUp,
  Lock,
  Unlock,
  RefreshCw,
  ExternalLink,
  FileCode,
  AlertCircle,
  Timer,
  Cpu,
  Loader2,
  X,
  Sparkles,
  Send,
  CheckCircle,
} from 'lucide-react';
import { useToast } from '../components/Toast';
import PageTip from '../components/PageTip';
import {
  AI_PROVIDERS,
  getAIConfig,
  saveAIConfig,
  testAIConnection,
  hasAIKey,
  detectProvider,
} from '../services/aiService';
import { dashboardAPI } from '../services/api';

const AIApiKeys = () => {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [visibleKeys, setVisibleKeys] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedFeature, setExpandedFeature] = useState(null);
  // The account's own keys.
  //
  // This list used to be a fixed set of demo keys, so every account saw a
  // "SecureAI Primary" key with a real-looking secret in it. The API owns
  // the list now.
  const [apiKeys, setApiKeys] = useState([]);
  const [usageStats, setUsageStats] = useState(null);

  const loadKeys = useCallback(async () => {
    try {
      const data = await dashboardAPI.getApiKeys();
      setApiKeys(
        (Array.isArray(data?.apiKeys) ? data.apiKeys : []).map((k) => ({
          ...k,
          // Keys that already existed come back masked — their secret
          // is not retrievable any more.
          isSecretVisible: false,
        }))
      );
    } catch {
      setApiKeys([]);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    loadKeys();
    // The statistics on the overview tab are counted from this account's
    // own projects, scans and findings.
    dashboardAPI
      .getProfile()
      .then((data) => setUsageStats(data?.stats || null))
      .catch(() => setUsageStats(null));
  }, [loadKeys]);

  // --- AI provider config (persisted to localStorage) ----------------------
  const [aiConfig, setAiConfig] = useState(() => getAIConfig());
  const [showAiKey, setShowAiKey] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);
  // Shows a dismissable auto-detected badge when a key prefix matches a known provider
  const [detectedProvider, setDetectedProvider] = useState(null);

  const persistAi = (next) => {
    const saved = saveAIConfig(next);
    setAiConfig(saved);
  };

  const handleProviderChange = (provider) => {
    persistAi({
      ...aiConfig,
      provider,
      model: AI_PROVIDERS[provider].defaultModel,
    });
    setAiTestResult(null);
  };

  const handleModelChange = (model) => {
    persistAi({ ...aiConfig, model });
    setAiTestResult(null);
  };

  const handleAiKeyChange = (e) => {
    const rawKey = e.target.value;
    persistAi({ ...aiConfig, apiKey: rawKey });
    setAiTestResult(null);
    setDetectedProvider(null); // clear stale badge on each keystroke

    // Auto-detect provider once the key is long enough to be identifiable
    if (rawKey.length >= 6) {
      const detected = detectProvider(rawKey);
      if (detected) {
        setDetectedProvider(detected);
        // Only auto-switch if the detected provider is different from the current one
        if (detected.provider !== aiConfig.provider) {
          persistAi({
            ...aiConfig,
            apiKey: rawKey,
            provider: detected.provider,
            model: detected.model,
          });
        }
      }
    }
  };

  const handleTestConnection = async () => {
    if (!aiConfig.apiKey) {
      showToast('Add an API key first', 'error');
      return;
    }
    setTestingAi(true);
    setAiTestResult(null);
    const result = await testAIConnection();
    setTestingAi(false);
    setAiTestResult(result);
    if (result.ok) {
      showToast(`Connected · reply: ${result.reply || '(empty)'}`);
    } else {
      showToast(`Connection failed: ${result.error.slice(0, 80)}`, 'error');
    }
  };

  // Handle add new key
  const handleAddKey = async () => {
    const name = window.prompt('Name for the new API key:', 'New API Key');
    if (!name || !name.trim()) return;
    try {
      const created = await dashboardAPI.createApiKey(name.trim());
      setApiKeys((prev) => [
        {
          id: created.id,
          name: created.name,
          key: created.key,
          prefix: created.prefix,
          createdAt: created.createdAt,
          lastUsed: null,
          status: created.status,
          usageToday: 0,
          quota: 500,
          // The secret is only handed out once, at creation time. Older
          // keys come back masked, so the copy button is disabled for
          // them instead of copying a value that cannot be used.
          isSecretVisible: true,
        },
        ...prev,
      ]);
      showToast('New API key generated — copy it now, it is not shown again.');
    } catch (err) {
      showToast(err?.message || 'Could not create the API key', 'error');
    }
  };

  // Handle delete key
  const handleDeleteKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }
    setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
    dashboardAPI.deleteApiKey(keyId).catch(() => loadKeys());
    showToast('API key deleted', 'info');
  };

  // Handle configure key
  const handleConfigureKey = (key) => {
    showToast(`Opening configuration for ${key.name}...`, 'info');
  };

  // Handle quick action buttons
  const handleRunSandbox = () => {
    showToast('Opening sandbox environment...', 'info');
  };

  const handleOwaspScan = () => {
    showToast('Starting OWASP scan...', 'info');
  };

  const handleAiAssistant = () => {
    showToast('Opening AI assistant...', 'info');
  };

  const handleTestConfig = () => {
    showToast('Validating sandbox configuration...', 'info');
  };

  // Handle OWASP scan button
  const handleOwaspRunScan = () => {
    showToast('Starting OWASP security scan...', 'info');
  };

  // Sandbox Configuration
  const sandboxConfig = {
    status: 'active',
    maxExecutionTime: 30000,
    maxMemory: 512,
    allowedModules: ['node:fs', 'node:path', 'node:http', 'node:https', 'node:crypto'],
    blockedModules: ['child_process', 'eval', 'vm'],
    networkIsolation: true,
    filesystemSandbox: true
  };

  // OWASP Configuration
  // The scan figures come from this account's own history, not from a
  // fixed demo set.
  const owaspConfig = {
    owaspTop10: true,
    customRules: true,
    autoScan: true,
    severityThreshold: 'medium',
    lastScan: usageStats?.lastScanAt || 'Never',
    totalScans: usageStats?.scans ?? 0,
    criticalFound: usageStats?.criticalFindings ?? 0,
    resolved: usageStats?.findingsFixed ?? 0
  };

  // IDE Feature Status
  //
  // The numbers on these cards used to be fixed demo values (1,247 sandbox
  // executions, 3,456 AI suggestions). They are now counted from this
  // account's own scans and findings, so a new account reads zero and the
  // demo account reads its own history.
  const featureStatus = [
    {
      id: 'debug-sandbox',
      name: 'Debug & Run in Sandbox',
      icon: Bug,
      description: 'Execute code in an isolated sandbox environment with full debugging capabilities',
      status: 'operational',
      stats: {
        // The sandbox runs in the browser, so there is no server-side
        // usage to report. The card shows the real limits it runs under.
        execution: 'Local',
        timeout: `${sandboxConfig.maxExecutionTime / 1000}s`,
        memory: `${sandboxConfig.maxMemory}MB`,
      },
      capabilities: [
        { name: 'Breakpoint Debugging', enabled: true },
        { name: 'Step-through Execution', enabled: true },
        { name: 'Variable Inspection', enabled: true },
        { name: 'Call Stack Analysis', enabled: true },
        { name: 'Network Request Mocking', enabled: true },
        { name: 'Environment Variables', enabled: true },
      ],
      security: [
        'Network isolation enabled',
        'Filesystem sandboxing active',
        'Memory limits enforced (512MB)',
        'Execution timeout: 30s'
      ]
    },
    {
      id: 'owasp-analysis',
      name: 'OWASP Security Analysis',
      icon: Shield,
      description: 'Automated security vulnerability detection following OWASP Top 10 guidelines',
      status: 'operational',
      stats: {
        scans: usageStats?.scans ?? 0,
        vulnerabilities: usageStats?.findings ?? 0,
        criticalFixed: usageStats?.findingsFixed ?? 0,
      },
      capabilities: [
        { name: 'OWASP Top 10 Scanning', enabled: true },
        { name: 'SQL Injection Detection', enabled: true },
        { name: 'XSS Prevention Check', enabled: true },
        { name: 'CSRF Token Validation', enabled: true },
        { name: 'Weak Cryptography Flag', enabled: true },
        { name: 'Insecure Dependencies', enabled: true },
      ],
      security: [
        'All analysis runs in your browser',
        'Source code never leaves the device',
        'Only finding metadata is stored',
        'Findings are scoped to your account',
      ],
      standards: ['OWASP Top 10 (2026)', 'CWE', 'CVSS v3.1']
    },
    {
      id: 'ai-assistant',
      name: 'AI Code Assistant',
      icon: Bot,
      description: 'Intelligent code completion, refactoring suggestions, and security guidance',
      status: hasAIKey() ? 'operational' : 'setup_required',
      stats: {
        suggestions: hasAIKey() ? 'Ready' : 'No key',
        acceptRate: aiConfig.provider ? aiConfig.provider : 'Not set',
        avgResponseTime: aiConfig.model ? aiConfig.model : 'Choose a model',
      },
      capabilities: [
        { name: 'Code Completion', enabled: true },
        { name: 'Security Explanations', enabled: true },
        { name: 'Refactoring Suggestions', enabled: true },
        { name: 'Vulnerability Fixes', enabled: true },
      ],
      security: [
        'Your key is stored for your account only',
        'Keys never travel to another browser profile',
        'Requests go straight to the provider you chose',
      ]
    },
  ];

  const filteredKeys = apiKeys.filter(key => 
    key.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    key.prefix.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUsageToday = apiKeys.reduce((sum, k) => sum + (k.usageToday || 0), 0);
  const totalQuota = apiKeys.reduce((sum, k) => sum + (k.quota || 0), 0);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).catch(() => {
      showToast('Could not copy the key to the clipboard', 'error');
    });
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleKeyVisibility = (id) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // The API masks the secret of every key it did not just hand out, so
  // showing or copying it is only possible for a newly created key.
  const maskKey = (key) => {
    if (!key) return '';
    if (key.length <= 20) return key;
    return key.slice(0, 10) + '•'.repeat(key.length - 20) + key.slice(-10);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'operational': return 'bg-emerald-50 text-emerald-600';
      case 'warning': return 'bg-amber-50 text-amber-600';
      case 'setup_required': return 'bg-amber-50 text-amber-600';
      case 'error': return 'bg-red-50 text-red-600';
      default: return 'bg-slate-50 text-slate-600';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'operational': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'warning': return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'setup_required': return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'error': return <XCircle className="w-3.5 h-3.5" />;
      default: return <Activity className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className={`p-6 lg:p-8 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Page Tip — first-time guidance */}
      <PageTip
        pageId="api-keys"
        variant="tip"
        title="Manage AI & sandbox keys"
        body="Generate a key for the AI assistant, sandbox runner, or OWASP scanner. Use the tabs to switch between keys, sandbox settings, and OWASP rules. Daily quotas and usage are visible per key."
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">AI API Keys & IDE Features</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage AI assistant keys, sandbox execution, and security analysis</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'overview' 
              ? 'bg-slate-900 dark:bg-blue-600 text-white' 
              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Feature Overview
        </button>
        <button
          onClick={() => setActiveTab('keys')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'keys' 
              ? 'bg-slate-900 dark:bg-blue-600 text-white' 
              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Key className="w-4 h-4" />
          AI API Keys
        </button>
        <button
          onClick={() => setActiveTab('sandbox')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'sandbox' 
              ? 'bg-slate-900 dark:bg-blue-600 text-white' 
              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Bug className="w-4 h-4" />
          Sandbox Config
        </button>
        <button
          onClick={() => setActiveTab('owasp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'owasp' 
              ? 'bg-slate-900 dark:bg-blue-600 text-white' 
              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Shield className="w-4 h-4" />
          OWASP Settings
        </button>
        <button
          onClick={() => setActiveTab('ai-provider')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'ai-provider'
              ? 'bg-slate-900 dark:bg-blue-600 text-white'
              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          AI Provider
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Feature Status Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {featureStatus.map((feature) => (
              <div key={feature.id} className="minimal-card p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      feature.id === 'debug-sandbox' ? 'bg-blue-50' :
                      feature.id === 'owasp-analysis' ? 'bg-emerald-50' :
                      'bg-violet-50'
                    }`}>
                      <feature.icon className={`w-5 h-5 ${
                        feature.id === 'debug-sandbox' ? 'text-blue-600' :
                        feature.id === 'owasp-analysis' ? 'text-emerald-600' :
                        'text-violet-600'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{feature.name}</h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(feature.status)}`}>
                        {getStatusIcon(feature.status)}
                        {feature.status}
                      </span>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-slate-600 mb-4">{feature.description}</p>
                
                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {feature.id === 'debug-sandbox' && (
                    <>
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{feature.stats.execution}</div>
                        <div className="text-xs text-slate-500">Execution</div>
                      </div>
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{feature.stats.timeout}</div>
                        <div className="text-xs text-slate-500">Timeout</div>
                      </div>
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{feature.stats.memory}</div>
                        <div className="text-xs text-slate-500">Memory</div>
                      </div>
                    </>
                  )}
                  {feature.id === 'owasp-analysis' && (
                    <>
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{feature.stats.scans}</div>
                        <div className="text-xs text-slate-500">Total Scans</div>
                      </div>
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-amber-600">{feature.stats.vulnerabilities}</div>
                        <div className="text-xs text-slate-500">Found</div>
                      </div>
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-emerald-600">{feature.stats.criticalFixed}</div>
                        <div className="text-xs text-slate-500">Fixed</div>
                      </div>
                    </>
                  )}
                  {feature.id === 'ai-assistant' && (
                    <>
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{feature.stats.suggestions}</div>
                        <div className="text-xs text-slate-500">Status</div>
                      </div>
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-violet-600 capitalize">{feature.stats.acceptRate}</div>
                        <div className="text-xs text-slate-500">Provider</div>
                      </div>
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{feature.stats.avgResponseTime}</div>
                        <div className="text-xs text-slate-500">Model</div>
                      </div>
                    </>
                  )}
                </div>

                <button 
                  onClick={() => setExpandedFeature(expandedFeature === feature.id ? null : feature.id)}
                  className="w-full flex items-center justify-between py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <span>View Details</span>
                  {expandedFeature === feature.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {expandedFeature === feature.id && (
                  <div className="pt-4 border-t border-slate-100 space-y-4 animate-slide-down">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Capabilities</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {feature.capabilities.map((cap, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            {cap.enabled ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-slate-300" />
                            )}
                            <span className={cap.enabled ? 'text-slate-700' : 'text-slate-400'}>{cap.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {feature.security && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Security Measures</h4>
                        <div className="space-y-1">
                          {feature.security.map((sec, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                              <Lock className="w-3.5 h-3.5 text-emerald-500" />
                              {sec}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {feature.standards && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Compliance Standards</h4>
                        <div className="flex flex-wrap gap-2">
                          {feature.standards.map((std, i) => (
                            <span key={i} className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-xs font-medium">
                              {std}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="minimal-card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button 
                onClick={handleRunSandbox}
                className="flex items-center gap-3 p-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors text-left"
              >
                <Bug className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="font-medium text-blue-900">Run Sandbox</div>
                  <div className="text-xs text-blue-700">Execute in isolated environment</div>
                </div>
              </button>
              <button 
                onClick={handleOwaspScan}
                className="flex items-center gap-3 p-4 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors text-left"
              >
                <Scan className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="font-medium text-emerald-900">OWASP Scan</div>
                  <div className="text-xs text-emerald-700">Scan current file for vulnerabilities</div>
                </div>
              </button>
              <button 
                onClick={handleAiAssistant}
                className="flex items-center gap-3 p-4 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors text-left"
              >
                <Bot className="w-5 h-5 text-violet-600" />
                <div>
                  <div className="font-medium text-violet-900">AI Assistant</div>
                  <div className="text-xs text-violet-700">Get code assistance</div>
                </div>
              </button>
              <button 
                onClick={handleTestConfig}
                className="flex items-center gap-3 p-4 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors text-left"
              >
                <FlaskConical className="w-5 h-5 text-amber-600" />
                <div>
                  <div className="font-medium text-amber-900">Test Config</div>
                  <div className="text-xs text-amber-700">Validate sandbox settings</div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {activeTab === 'keys' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <div className="minimal-card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                  <Key className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{apiKeys.length}</div>
                  <div className="text-sm text-slate-500">Total Keys</div>
                </div>
              </div>
            </div>
            <div className="minimal-card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-600">{apiKeys.filter(k => k.status === 'active').length}</div>
                  <div className="text-sm text-slate-500">Active Keys</div>
                </div>
              </div>
            </div>
            <div className="minimal-card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalUsageToday.toLocaleString()}</div>
                  <div className="text-sm text-slate-500">Usage Today</div>
                </div>
              </div>
            </div>
            <div className="minimal-card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{apiKeys.filter(k => k.lastUsed === 'Never').length}</div>
                  <div className="text-sm text-slate-500">Never Used</div>
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="minimal-card p-4 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search AI API keys..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
              />
            </div>
          </div>

          {/* AI Keys List */}
          <div className="space-y-4">
            {filteredKeys.map((apiKey) => (
              <div key={apiKey.id} className="minimal-card p-5">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{apiKey.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        apiKey.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {apiKey.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg font-mono">
                        {visibleKeys[apiKey.id] ? apiKey.key : maskKey(apiKey.key)}
                      </code>
                      <button
                        onClick={() => toggleKeyVisibility(apiKey.id)}
                        disabled={!apiKey.isSecretVisible}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          apiKey.isSecretVisible
                            ? visibleKeys[apiKey.id] ? 'Hide' : 'Show'
                            : 'This key is masked. Delete it and create a new one to get the secret.'
                        }
                        aria-label={visibleKeys[apiKey.id] ? 'Hide key' : 'Show key'}
                      >
                        {visibleKeys[apiKey.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => copyToClipboard(apiKey.key, apiKey.id)}
                        disabled={!apiKey.isSecretVisible}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          apiKey.isSecretVisible
                            ? 'Copy key'
                            : 'This key is masked. Delete it and create a new one to get the secret.'
                        }
                        aria-label="Copy key"
                      >
                        {copiedId === apiKey.id ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Usage Today */}
                    <div className="text-center px-4 py-2 bg-slate-50 rounded-lg">
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{apiKey.usageToday}</div>
                      <div className="text-xs text-slate-500">/ {apiKey.quota} daily</div>
                    </div>
                    
                    {/* Last Used */}
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Clock className="w-4 h-4" />
                      {apiKey.lastUsed}
                    </div>
                    
                    {/* Created */}
                    <div className="text-sm text-slate-400">
                      Created {new Date(apiKey.createdAt).toLocaleDateString()}
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => handleConfigureKey(apiKey)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Configure"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteKey(apiKey.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Usage Bar */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-600">Daily Usage</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {apiKey.usageToday} / {apiKey.quota}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        (apiKey.usageToday / apiKey.quota) > 0.9 ? 'bg-red-500' :
                        (apiKey.usageToday / apiKey.quota) > 0.7 ? 'bg-amber-500' :
                        'bg-violet-500'
                      }`}
                      style={{ width: `${Math.min((apiKey.usageToday / apiKey.quota) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Key Button */}
          <button 
            onClick={handleAddKey}
            className="mt-6 w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50/50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add AI API Key
          </button>
        </>
      )}

      {activeTab === 'sandbox' && (
        <>
          {/* Sandbox Status */}
          <div className="minimal-card p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Bug className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sandbox Environment</h2>
                  <p className="text-sm text-slate-500">Isolated execution environment for code testing</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-sm font-medium">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  Active
                </span>
              </div>
            </div>

            {/* Configuration */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Configuration
                </h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Timer className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-700">Max Execution Time</span>
                    </div>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{sandboxConfig.maxExecutionTime}ms</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Cpu className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-700">Memory Limit</span>
                    </div>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{sandboxConfig.maxMemory}MB</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Lock className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-700">Network Isolation</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${sandboxConfig.networkIsolation ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {sandboxConfig.networkIsolation ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileCode className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-700">Filesystem Sandbox</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${sandboxConfig.filesystemSandbox ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {sandboxConfig.filesystemSandbox ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Terminal className="w-4 h-4" /> Allowed Modules
                </h3>
                <div className="p-4 bg-slate-900 rounded-xl">
                  <div className="space-y-2 font-mono text-sm">
                    {sandboxConfig.allowedModules.map((mod, i) => (
                      <div key={i} className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {mod}
                      </div>
                    ))}
                  </div>
                </div>

                <h3 className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <BugOff className="w-4 h-4" /> Blocked Modules
                </h3>
                <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                  <div className="space-y-2 font-mono text-sm">
                    {sandboxConfig.blockedModules.map((mod, i) => (
                      <div key={i} className="flex items-center gap-2 text-red-600">
                        <XCircle className="w-3.5 h-3.5" />
                        {mod}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Debug Capabilities */}
          <div className="minimal-card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Debug Capabilities</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {featureStatus[0].capabilities.map((cap, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  {cap.enabled ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-slate-300" />
                  )}
                  <span className={`text-sm ${cap.enabled ? 'text-slate-700' : 'text-slate-400'}`}>{cap.name}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === 'owasp' && (
        <>
          {/* OWASP Status */}
          <div className="minimal-card p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">OWASP Security Analysis</h2>
                  <p className="text-sm text-slate-500">Automated vulnerability detection following OWASP guidelines</p>
                </div>
              </div>
              <button 
                onClick={handleOwaspRunScan}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
              >
                <Scan className="w-4 h-4" />
                Run Scan
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{owaspConfig.totalScans}</div>
                <div className="text-sm text-slate-500 mt-1">Total Scans</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <div className="text-3xl font-bold text-red-600">{owaspConfig.criticalFound}</div>
                <div className="text-sm text-slate-500 mt-1">Critical Found</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <div className="text-3xl font-bold text-emerald-600">{owaspConfig.resolved}</div>
                <div className="text-sm text-slate-500 mt-1">Fixed/Resolved</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <div className="text-3xl font-bold text-slate-600">{owaspConfig.lastScan}</div>
                <div className="text-sm text-slate-500 mt-1">Last Scan</div>
              </div>
            </div>

            {/* Settings */}
            <div className="space-y-4">
              <h3 className="font-medium text-slate-900 dark:text-slate-100">Scan Settings</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-emerald-500" />
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">OWASP Top 10</div>
                      <div className="text-sm text-slate-500">Include OWASP Top 10 vulnerabilities</div>
                    </div>
                  </div>
                  <div className="w-12 h-6 bg-emerald-500 rounded-full relative">
                    <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow"></div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Bug className="w-5 h-5 text-blue-500" />
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">Custom Rules</div>
                      <div className="text-sm text-slate-500">Enable custom security rules</div>
                    </div>
                  </div>
                  <div className="w-12 h-6 bg-emerald-500 rounded-full relative">
                    <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow"></div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Zap className="w-5 h-5 text-amber-500" />
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">Auto Scan</div>
                      <div className="text-sm text-slate-500">Automatically scan on file save</div>
                    </div>
                  </div>
                  <div className="w-12 h-6 bg-emerald-500 rounded-full relative">
                    <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow"></div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-slate-400" />
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">Severity Threshold</div>
                      <div className="text-sm text-slate-500">Minimum severity to report</div>
                    </div>
                  </div>
                  <select
                    value="medium"
                    onChange={() => {}}
                    className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200"
                  >
                    <option value="low">Low & Above</option>
                    <option value="medium">Medium & Above</option>
                    <option value="high">High & Above</option>
                    <option value="critical">Critical Only</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Compliance Standards */}
          <div className="minimal-card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Compliance Standards</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {featureStatus[1].standards.map((std, i) => (
                <div key={i} className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-800">{std}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === 'ai-provider' && (
        <>
          {/* Status banner */}
          <div className={`minimal-card p-4 mb-6 flex items-center gap-3 ${
            hasAIKey() ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-amber-500'
          }`}>
            {hasAIKey() ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {hasAIKey()
                  ? `AI is configured · ${AI_PROVIDERS[aiConfig.provider]?.name} · ${aiConfig.model}`
                  : 'AI is not configured yet'}
              </div>
              <div className="text-sm text-slate-500">
                {hasAIKey()
                  ? 'The Sandbox and OWASP pages will route AI requests to this provider.'
                  : 'Add a key below to enable AI fixes, suggestions, and security advice.'}
              </div>
            </div>
            {aiTestResult && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                aiTestResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                {aiTestResult.ok ? `Live · reply "${aiTestResult.reply}"` : 'Failed'}
              </span>
            )}
          </div>

          {/* Provider picker */}
          <div className="minimal-card p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">AI Provider</h2>
            <p className="text-sm text-slate-500 mb-5">
              Pick a provider and enter the matching API key. The provider and recommended model are
              automatically detected when you paste your key. Keys are stored locally in your browser and
              sent only to the chosen provider.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {Object.entries(AI_PROVIDERS).map(([id, p]) => {
                const active = aiConfig.provider === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleProviderChange(id)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      active
                        ? 'border-slate-900 dark:border-blue-500 bg-slate-900 dark:bg-blue-600 text-white shadow-md'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="font-semibold mb-1">{p.name}</div>
                    <div className={`text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                      Default: <code className="font-mono">{p.defaultModel}</code>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Model picker */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-700 mb-2">Model</label>
              <select
                value={aiConfig.model}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
              >
                {AI_PROVIDERS[aiConfig.provider].models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* API key */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-700 mb-2">API key</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showAiKey ? 'text' : 'password'}
                    value={aiConfig.apiKey}
                    onChange={handleAiKeyChange}
                    placeholder={AI_PROVIDERS[aiConfig.provider].placeholder}
                    className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-700 dark:text-slate-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none"
                  />
                  {detectedProvider && (
                    <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                        <Sparkles className="w-3 h-3" />
                        Auto-detected: {AI_PROVIDERS[detectedProvider.provider]?.name}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => setShowAiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600"
                    title={showAiKey ? 'Hide' : 'Show'}
                  >
                    {showAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={testingAi || !aiConfig.apiKey}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Test
                </button>
              </div>
              {aiTestResult && !aiTestResult.ok && (
                <div className="mt-2 text-xs text-red-600 break-words">
                  {aiTestResult.error}
                </div>
              )}
            </div>
          </div>

          {/* What AI can do here */}
          <div className="minimal-card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">What AI can do across the app</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="p-4 bg-blue-50 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <Bot className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-900">Code chat</span>
                </div>
                <p className="text-sm text-blue-800">
                  Ask the assistant to explain, refactor, or modify any open file in the Code IDE.
                </p>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium text-emerald-900">Security advisor</span>
                </div>
                <p className="text-sm text-emerald-800">
                  On the OWASP page, ask the model to explain a finding or to auto-fix the
                  vulnerable snippet.
                </p>
              </div>
              <div className="p-4 bg-violet-50 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-violet-600" />
                  <span className="font-medium text-violet-900">Build improvements</span>
                </div>
                <p className="text-sm text-violet-800">
                  From the Code IDE, ask for a project-wide review with quick wins, refactors, and
                  security hardening tips.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* No toast UI needed - using shared Toast */}
    </div>
  );
};

export default AIApiKeys;
