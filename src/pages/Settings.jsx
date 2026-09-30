import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  User,
  Shield,
  Bell,
  Palette,
  Lock,
  Key,
  Globe,
  CreditCard,
  HelpCircle,
  ChevronRight,
  Camera,
  Copy,
  Trash2,
  Monitor,
  Check,
  X,
  Eye,
  EyeOff,
  Plus,
  Download,
  ExternalLink,
  Rocket,
  RotateCcw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageTip from '../components/PageTip';
import { useToast } from '../components/Toast';

const Settings = () => {
  const { user, setUser, theme, setTheme, accentColor, setAccentColor } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('profile');
  const [profileForm, setProfileForm] = useState({
    name: user?.name || 'User',
    username: 'developer',
    email: user?.email || 'user@example.com',
    bio: 'Full-stack developer passionate about security and clean code.',
    company: 'TechCorp Inc.'
  });
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    vulnerabilityAlerts: true,
    weeklyReport: false,
  });
  
  const [selectedTheme, setSelectedTheme] = useState(theme || 'light');
  const [selectedColor, setSelectedColor] = useState(accentColor || '#3B82F6');
  
  const [integrations, setIntegrations] = useState([
    { name: 'GitHub', desc: 'Repository scanning', connected: true, icon: '🐙' },
    { name: 'GitLab', desc: 'CI/CD integration', connected: false, icon: '🦊' },
    { name: 'VS Code', desc: 'IDE extension', connected: true, icon: '💻' },
    { name: 'Slack', desc: 'Team notifications', connected: false, icon: '💬' },
  ]);

  const menuItems = [
    { id: 'profile', label: 'Profile', icon: User, description: 'Manage your personal information' },
    { id: 'security', label: 'Security', icon: Shield, description: 'Password and authentication' },
    { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Configure alerts and emails' },
    { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and display settings' },
    { id: 'integrations', label: 'Integrations', icon: Globe, description: 'Connected apps and services' },
    { id: 'billing', label: 'Billing', icon: CreditCard, description: 'Plans and payment methods' },
    { id: 'help', label: 'Help & Tour', icon: HelpCircle, description: 'Restart the welcome tour or reset tips' },
  ];

  const [apiKeys, setApiKeys] = useState([
    { id: 1, name: 'Production API Key', key: 'sk_live_xxxxxxxxxxxx', created: '2024-01-15', lastUsed: '2 hours ago' },
    { id: 2, name: 'Development API Key', key: 'sk_test_xxxxxxxxxxxx', created: '2024-01-10', lastUsed: '1 day ago' },
  ]);

  const [copiedKey, setCopiedKey] = useState(null);

  // Toggle notification
  const toggleNotification = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Save profile
  const handleSaveProfile = () => {
    if (user) {
      setUser({ ...user, name: profileForm.name, email: profileForm.email });
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Copy API key
  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Delete API key
  const handleDeleteKey = (id) => {
    setApiKeys(prev => prev.filter(k => k.id !== id));
  };

  // Generate new API key
  const handleGenerateKey = () => {
    const newKey = {
      id: Date.now(),
      name: 'New API Key',
      key: `sk_new_${Math.random().toString(36).substring(2, 15)}`,
      created: new Date().toLocaleDateString(),
      lastUsed: 'Just now'
    };
    setApiKeys(prev => [newKey, ...prev]);
  };

  // Change password
  const handleChangePassword = () => {
    const newPassword = window.prompt('Enter your new password (min 8 chars):');
    if (newPassword && newPassword.length >= 8) {
      showToast('Password updated successfully!', 'success');
    } else if (newPassword) {
      showToast('Password must be at least 8 characters', 'error');
    }
  };

  // Restart welcome tour
  const handleRestartTour = () => {
    try { localStorage.removeItem('eric_welcome_tour_seen'); } catch {}
    if (typeof window !== 'undefined' && window.__restartEricTour) {
      window.__restartEricTour();
      showToast('Restarting the welcome tour...', 'info');
    } else {
      showToast('Tour will start next time you visit the dashboard.', 'info');
      navigate('/dashboard');
    }
  };

  // Reset all page tips
  const handleResetTips = () => {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('eric_pagetip_dismissed_')) {
          localStorage.removeItem(key);
        }
      });
      showToast('All page tips restored. Reload any page to see them again.', 'success');
    } catch {
      showToast('Could not reset tips', 'error');
    }
  };

  // Apply theme
  const handleApplyTheme = (newTheme) => {
    setSelectedTheme(newTheme);
    setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('project-eric_theme', newTheme);
  };

  // Apply accent color — persists, propagates globally via --accent-color.
  const handleApplyAccent = (color) => {
    setSelectedColor(color);
    setAccentColor(color);
    document.documentElement.style.setProperty('--accent-color', color);
    localStorage.setItem('project-eric_accent', color);
    showToast({
      type: 'success',
      title: 'Accent color updated',
      message: `Your accent color is now ${color}.`,
    });
  };

  // Toggle integration
  const toggleIntegration = (name) => {
    setIntegrations(prev => prev.map(i => 
      i.name === name ? { ...i, connected: !i.connected } : i
    ));
  };

  // Upgrade plan
  const handleUpgradePlan = () => {
    alert('This would open the billing upgrade page');
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Page Tip — first-time guidance */}
      <PageTip
        pageId="settings"
        variant="tip"
        title="Customize your experience"
        body="Update your profile, change password, configure notifications, switch themes, or manage integrations. Everything syncs to your account automatically."
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your account settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="minimal-card p-2">
            <nav className="space-y-1">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeTab === item.id
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium text-sm">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {activeTab === 'profile' && (
            <div className="minimal-card p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-6">Profile Settings</h3>
              
              {/* Avatar */}
              <div className="flex items-center gap-6 mb-8">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white text-2xl font-bold">
                    {profileForm.name?.[0] || 'U'}
                  </div>
                  <button className="absolute -bottom-2 -right-2 w-8 h-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600 transition-colors shadow-sm">
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{profileForm.name}</h4>
                  <p className="text-slate-500">{profileForm.email}</p>
                </div>
              </div>

              {/* Form */}
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Full Name</label>
                    <input
                      type="text"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      className="minimal-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Username</label>
                    <input
                      type="text"
                      value={profileForm.username}
                      onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                      className="minimal-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email Address</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                    className="minimal-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Bio</label>
                  <textarea
                    rows={3}
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                    className="minimal-input resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Company</label>
                  <input
                    type="text"
                    value={profileForm.company}
                    onChange={(e) => setProfileForm({ ...profileForm, company: e.target.value })}
                    className="minimal-input"
                  />
                </div>

                <div className="pt-4 flex items-center gap-3">
                  <button 
                    onClick={handleSaveProfile}
                    className="btn-primary flex items-center gap-2"
                  >
                    {saveSuccess ? <Check className="w-4 h-4" /> : null}
                    {saveSuccess ? 'Saved!' : 'Save Changes'}
                  </button>
                  {saveSuccess && (
                    <span className="text-sm text-emerald-600">Profile updated successfully</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Password */}
              <div className="minimal-card p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100">Password</h4>
                      <p className="text-sm text-slate-500">Last changed 30 days ago</p>
                    </div>
                  </div>
                  <button onClick={handleChangePassword} className="btn-secondary">Change Password</button>
                </div>
              </div>

              {/* Two Factor */}
              <div className="minimal-card p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100">Two-Factor Authentication</h4>
                      <p className="text-sm text-slate-500">Add an extra layer of security</p>
                    </div>
                  </div>
                  <span className="minimal-badge badge-success">Enabled</span>
                </div>
              </div>

              {/* API Keys */}
              <div className="minimal-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100">API Keys</h4>
                  <button onClick={handleGenerateKey} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Generate New Key
                  </button>
                </div>
                
                <div className="space-y-3">
                  {apiKeys.map((apiKey) => (
                    <div key={apiKey.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div>
                        <h5 className="font-medium text-slate-900 dark:text-slate-100">{apiKey.name}</h5>
                        <p className="text-sm text-slate-500 font-mono">{apiKey.key}</p>
                        <p className="text-xs text-slate-400 mt-1">Created {apiKey.created} · Last used {apiKey.lastUsed}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleCopyKey(apiKey.key)}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1"
                        >
                          {copiedKey === apiKey.key ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-500" />
                              <span className="text-xs text-emerald-500">Copied!</span>
                            </>
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button 
                          onClick={() => handleDeleteKey(apiKey.id)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="minimal-card p-6">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Notification Settings</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">Security Alerts</p>
                      <p className="text-sm text-slate-500">Get notified about critical vulnerabilities</p>
                    </div>
                    <button
                      onClick={() => toggleNotification('email')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${notifications.email ? 'bg-slate-900 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifications.email ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">Push Notifications</p>
                      <p className="text-sm text-slate-500">Receive push notifications in browser</p>
                    </div>
                    <button
                      onClick={() => toggleNotification('push')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${notifications.push ? 'bg-slate-900 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifications.push ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">Vulnerability Alerts</p>
                      <p className="text-sm text-slate-500">Get alerts for new vulnerability findings</p>
                    </div>
                    <button
                      onClick={() => toggleNotification('vulnerabilityAlerts')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${notifications.vulnerabilityAlerts ? 'bg-slate-900 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifications.vulnerabilityAlerts ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">Weekly Report</p>
                      <p className="text-sm text-slate-500">Summary of your security status</p>
                    </div>
                    <button
                      onClick={() => toggleNotification('weeklyReport')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${notifications.weeklyReport ? 'bg-slate-900 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifications.weeklyReport ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="minimal-card p-6">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Theme</h4>
              <div className="grid grid-cols-3 gap-4">
                {['light', 'dark', 'system'].map((themeOption) => (
                  <button 
                    key={themeOption} 
                    onClick={() => handleApplyTheme(themeOption)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      selectedTheme === themeOption ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-full h-16 bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg mb-3 flex items-center justify-center">
                      {themeOption === 'light' && <span className="text-2xl">☀️</span>}
                      {themeOption === 'dark' && <span className="text-2xl">🌙</span>}
                      {themeOption === 'system' && <span className="text-2xl">💻</span>}
                    </div>
                    <p className={`font-medium ${selectedTheme === themeOption ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}>
                      {themeOption.charAt(0).toUpperCase() + themeOption.slice(1)}
                    </p>
                  </button>
                ))}
              </div>

              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mt-6 mb-4">Accent Color</h4>
              <div className="flex gap-3 flex-wrap">
                {['#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B'].map((color) => (
                  <button
                    key={color}
                    onClick={() => handleApplyAccent(color)}
                    title={`Apply accent color ${color}`}
                    aria-label={`Apply accent color ${color}`}
                    aria-pressed={selectedColor === color}
                    className={`relative w-10 h-10 rounded-full border-2 shadow-md hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
                      selectedColor === color ? 'border-slate-900 dark:border-slate-100 scale-110 ring-2 ring-offset-2 ring-blue-400/60' : 'border-white dark:border-slate-700'
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    {selectedColor === color && (
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        className="absolute inset-0 m-auto w-5 h-5 text-white drop-shadow"
                        aria-hidden
                      >
                        <path
                          d="M5 10.5l3 3 7-7"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                Current accent: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{selectedColor}</span>
              </p>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="minimal-card p-6">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Connected Apps</h4>
              <div className="grid grid-cols-2 gap-4">
                {integrations.map((app) => (
                  <div key={app.name} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{app.icon}</span>
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-slate-100">{app.name}</h4>
                        <p className="text-sm text-slate-500">{app.desc}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => toggleIntegration(app.name)}
                      className={`w-full py-2 rounded-lg font-medium text-sm transition-colors ${
                        app.connected 
                          ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                          : 'bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700'
                      }`}
                    >
                      {app.connected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              {/* Current Plan */}
              <div className="bg-slate-900 dark:bg-slate-950 rounded-2xl p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Current Plan</p>
                    <h4 className="text-2xl font-bold mt-1">Pro Plan</h4>
                    <p className="text-slate-400 mt-1">$29/month · Renews on Oct 15, 2024</p>
                  </div>
                  <button
                    onClick={() => showToast('Upgrade page coming soon!', 'info')}
                    className="px-4 py-2 bg-white text-slate-900 dark:text-slate-100 rounded-lg font-medium hover:bg-slate-100 transition-colors"
                  >
                    Upgrade Plan
                  </button>
                </div>
              </div>

              {/* Usage */}
              <div className="minimal-card p-6">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Usage This Month</h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-600">API Calls</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">8,420 / 10,000</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-bar-fill bg-blue-500" style={{ width: '84%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-600">Projects</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">5 / 10</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-bar-fill bg-emerald-500" style={{ width: '50%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'help' && (
            <div className="space-y-6">
              <div className="minimal-card p-6">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Welcome Tour</h4>
                <p className="text-sm text-slate-600 mb-4">
                  Take the guided tour again to learn about every part of the platform — dashboard, IDE, analysis, threats, team, and API keys.
                </p>
                <button
                  onClick={handleRestartTour}
                  className="btn-primary flex items-center gap-2"
                >
                  <Rocket className="w-4 h-4" />
                  Restart Welcome Tour
                </button>
              </div>

              <div className="minimal-card p-6">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Page Tips</h4>
                <p className="text-sm text-slate-600 mb-4">
                  We hide contextual tips on each page once you dismiss them. Reset them here so they reappear the next time you visit each page.
                </p>
                <button
                  onClick={handleResetTips}
                  className="btn-secondary flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset All Page Tips
                </button>
              </div>

              <div className="minimal-card p-6">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Keyboard Shortcuts</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <span className="text-slate-600 dark:text-slate-300">Open search</span>
                    <kbd className="px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-xs text-slate-600 dark:text-slate-300">⌘K</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <span className="text-slate-600 dark:text-slate-300">Save file (IDE)</span>
                    <kbd className="px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-xs text-slate-600 dark:text-slate-300">Ctrl + S</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <span className="text-slate-600 dark:text-slate-300">Find in file (IDE)</span>
                    <kbd className="px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-xs text-slate-600 dark:text-slate-300">Ctrl + F</kbd>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <span className="text-slate-600 dark:text-slate-300">Toggle theme</span>
                    <span className="px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-xs text-slate-600 dark:text-slate-300">Click moon/sun icon</span>
                  </div>
                </div>
              </div>

              <div className="minimal-card p-6 bg-gradient-to-br from-blue-50 to-violet-50 dark:from-blue-950/40 dark:to-violet-950/40 border-blue-100 dark:border-blue-900/50">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Need more help?</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                  Reach our team any time. We typically reply within a few hours during business days.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a href="mailto:support@project-eric.com" className="btn-primary flex items-center gap-2">
                    Contact Support
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <a href="https://docs.project-eric.com" target="_blank" rel="noopener noreferrer" className="btn-secondary flex items-center gap-2">
                    Read the Docs
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
