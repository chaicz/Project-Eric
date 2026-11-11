import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  User,
  Shield,
  Bell,
  Palette,
  Lock,
  Globe,
  CreditCard,
  HelpCircle,
  Camera,
  Copy,
  Trash2,
  Check,
  X,
  Plus,
  Loader2,
  ExternalLink,
  Rocket,
  RotateCcw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageTip from '../components/PageTip';
import { useToast } from '../components/Toast';
import TwoFactorSetup from '../components/TwoFactorSetup';
import { dashboardAPI, authAPI, resolveAssetUrl } from '../services/api';
import {
  readCachedSettings,
  loadSettings,
  saveSettings,
} from '../utils/accountSettings';
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  accentLabel,
  accentShades,
  applyAccentColor,
  normalizeAccent,
} from '../utils/accentColor';

// The tabs of the Settings page.
//
// The list lives at module scope so the initial tab can be validated
// against it before the component is created: `?tab=integrations` on the
// URL opens that tab, and anything else falls back to the first one.
const SETTINGS_TABS = [
  'profile',
  'security',
  'notifications',
  'appearance',
  'integrations',
  'billing',
  'help',
];

const Settings = () => {
  const { user, setUser, theme, setTheme, accentColor, setAccentColor } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(() => {
    // The tab can be chosen with `?tab=`, so another page can send the
    // user straight to the right section. The Dashboard's "Connect a new
    // project" button uses it to open the integrations tab.
    const requested = new URLSearchParams(window.location.search).get('tab');
    return SETTINGS_TABS.includes(requested) ? requested : 'profile';
  });
  // The profile is the account's own, read from the API.
  //
  // The form used to start with a demo persona ("developer", "TechCorp
  // Inc.", a fixed bio) for every account, including a brand-new one.
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    username: '',
    email: user?.email || '',
    bio: '',
    company: ''
  });
  const [accountMeta, setAccountMeta] = useState({ createdAt: null, lastLogin: null });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // The picture the account uploaded. Null until the file picker has
  // been used.
  const [avatarUrl, setAvatarUrl] = useState(resolveAssetUrl(user?.avatar));
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  // Notification preferences.
  //
  // These belong to the account, not to the browser. The API owns them;
  // the browser keeps a per-account cache so the page paints instantly
  // and still works when the API is unreachable. The Notifications page
  // reads the same store, so the two screens cannot disagree.
  const [notifications, setNotifications] = useState(
    () => readCachedSettings().notifications
  );
  // True while a preference is being written to the account.
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  // The selected theme and accent come straight from the context, so the
// page always shows what is actually applied — even when the theme was
// changed from the header toggle instead of from here.
  const selectedTheme = theme || 'light';
  const selectedColor = normalizeAccent(accentColor) || DEFAULT_ACCENT;

  // The colour the custom picker holds. It starts empty, so the picker
  // shows the colour that is actually applied.
  const [customColor, setCustomColor] = useState('');

  // The native colour picker. It only fires `change` once the user
  // closes the picker, which is the moment the colour should be
  // saved. React's `onChange` maps to the native `input` event, so
  // that one is only used for the live preview.
  const customColorRef = useRef(null);

  // The shades of the current accent, used for the live preview.
  const accentShadeSet = accentShades(selectedColor);

  // The account's own connections. Nothing is connected until the account
  // connects something.
  const [integrations, setIntegrations] = useState([
    { name: 'GitHub', desc: 'Repository scanning', connected: false, icon: '🐙', provider: 'github' },
    { name: 'GitLab', desc: 'CI/CD integration', connected: false, icon: '🦊', provider: 'gitlab' },
    { name: 'Slack', desc: 'Team notifications', connected: false, icon: '💬', provider: 'slack' },
    { name: 'Jira', desc: 'Issue tracking', connected: false, icon: '📋', provider: 'jira' },
  ]);
  // The integration whose Connect/Disconnect button is currently being
  // processed, so it can show a spinner and cannot be clicked twice.
  const [busyIntegration, setBusyIntegration] = useState(null);

  const menuItems = [
    { id: 'profile', label: 'Profile', icon: User, description: 'Manage your personal information' },
    { id: 'security', label: 'Security', icon: Shield, description: 'Password and authentication' },
    { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Configure alerts and emails' },
    { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and display settings' },
    { id: 'integrations', label: 'Integrations', icon: Globe, description: 'Connected apps and services' },
    { id: 'billing', label: 'Billing', icon: CreditCard, description: 'Plans and payment methods' },
    { id: 'help', label: 'Help & Tour', icon: HelpCircle, description: 'Restart the welcome tour or reset tips' },
  ];
  // The account's own keys.
  const [apiKeys, setApiKeys] = useState([]);
  const [copiedKey, setCopiedKey] = useState(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState(null);

  // The second factor.
  //
  // The card used to be a badge that said "Not enabled" and could not
  // be acted on. `twoFactorStage` drives the setup dialog: 'setup'
  // starts it, 'disable' turns it off again, and null closes it.
  const [twoFactor, setTwoFactor] = useState({
    enabled: false,
    enabledAt: null,
    recoveryCodes: 0,
  });
  const [twoFactorStage, setTwoFactorStage] = useState(null);

  // Password change. The current password has to be confirmed, so the
  // dialog keeps all three fields and clears them when it closes.
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    next: '',
    confirm: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Usage figures for the billing tab, counted from this account's own
  // projects and scans.
  const [usage, setUsage] = useState(null);

  // Switch to another tab.
  //
  // The tab is written to the URL as `?tab=`, so the section the user is
  // on can be linked to and survives a reload. Another page can send
  // the user straight to a tab the same way.
  const selectTab = (tabId) => {
    setActiveTab(tabId);
    try {
      const params = new URLSearchParams(window.location.search);
      params.set('tab', tabId);
      navigate({ pathname: '/settings', search: `?${params.toString()}` }, { replace: true });
    } catch {
      /* the history API is unavailable — the tab still changes */
    }
  };

  // Load the profile, the keys, the connections and the preferences.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // The account's preferences come first: they decide what the
      // switches and the theme controls show before anything else is
      // read.
      try {
        const { settings, fromCache } = await loadSettings();
        if (!cancelled) {
          setNotifications(settings.notifications);
          // The stored theme is applied to the document, so the page
          // shows the theme the account actually uses — not the one left
          // over from another account on this browser.
          if (settings.appearance?.theme) {
            setTheme(settings.appearance.theme);
          }
          if (settings.appearance?.accent) {
            const accent = normalizeAccent(settings.appearance.accent);
            if (accent) {
              setAccentColor(accent);
              applyAccentColor(accent);
            }
          }
          if (fromCache) {
            showToast('Showing the preferences cached on this device.', 'info');
          }
        }
      } catch {
        /* the backend is unreachable — the cached values stay on screen */
      }
      // Whether the account has a second factor turned on.
      try {
        const status = await dashboardAPI.getTwoFactor();
        if (!cancelled) {
          setTwoFactor({
            enabled: !!status?.enabled,
            enabledAt: status?.enabledAt || null,
            recoveryCodes: status?.recoveryCodes || 0,
          });
        }
      } catch {
        /* the backend is unreachable — the card keeps its default state */
      }
      try {
        const profile = await dashboardAPI.getProfile();
        if (cancelled) return;
        if (profile?.user) {
          setProfileForm({
            name: profile.user.name || '',
            username: profile.user.username || '',
            email: profile.user.email || '',
            bio: profile.user.bio || '',
            company: profile.user.company || ''
          });
          setAccountMeta({
            createdAt: profile.user.createdAt || null,
            lastLogin: profile.user.lastLogin || null
          });
          if (profile.user.avatar) {
            setAvatarUrl(resolveAssetUrl(profile.user.avatar));
          }
          // The billing tab shows this account's own figures.
          if (profile.stats) {
            setUsage({
              projects: profile.stats.projects ?? 0,
              scans: profile.stats.scans ?? 0,
              findings: profile.stats.findings ?? 0,
              linesAnalyzed: profile.stats.linesAnalyzed ?? 0
            });
          }
        }
      } catch {
        /* the backend is unreachable — the form keeps whatever it had */
      }
      try {
        const keys = await dashboardAPI.getApiKeys();
        if (!cancelled) {
          setApiKeys(
            (Array.isArray(keys?.apiKeys) ? keys.apiKeys : []).map((k) => ({
              id: k.id,
              name: k.name,
              // The API masks the secret of keys it did not just create —
              // the full value is handed out once, at creation time.
              key: k.key,
              isNew: false,
              created: k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '—',
              lastUsed: k.lastUsed ? new Date(k.lastUsed).toLocaleDateString() : 'Never'
            }))
          );
        }
      } catch {
        if (!cancelled) setApiKeys([]);
      }
      try {
        const data = await dashboardAPI.getIntegrations();
        if (!cancelled) {
          const connected = new Set(
            (Array.isArray(data?.integrations) ? data.integrations : [])
              .filter((i) => i.connected)
              .map((i) => i.provider)
          );
          setIntegrations((prev) =>
            prev.map((i) => ({ ...i, connected: connected.has(i.provider) }))
          );
        }
      } catch {
        /* leave the list as it is */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Toggle a notification preference.
  //
  // The change is applied to the screen straight away and written to the
  // account afterwards, so the switch never lags behind the click. If
  // the server refuses the change, the old value is restored.
  const toggleNotification = async (key) => {
    const nextValue = !notifications[key];
    const previous = notifications;

    setNotifications((prev) => ({ ...prev, [key]: nextValue }));
    setIsSavingNotifications(true);

    const result = await saveSettings({ notifications: { [key]: nextValue } });
    setIsSavingNotifications(false);

    if (!result.ok) {
      setNotifications(previous);
      showToast(result.error || 'Could not save the preference', 'error');
      return;
    }
    if (result.settings?.notifications) {
      setNotifications(result.settings.notifications);
    }
  };

  // Save profile
  const handleSaveProfile = async () => {
    if (isSavingProfile) return;
    setIsSavingProfile(true);
    try {
      const saved = await dashboardAPI.saveProfile({
        name: profileForm.name,
        username: profileForm.username,
        bio: profileForm.bio,
        company: profileForm.company
      });
      if (saved?.user && user) {
        setUser({ ...user, ...saved.user });
      }
      showToast('Profile updated successfully', 'success');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      showToast(err?.message || 'Could not save the profile', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Upload a new profile picture. The file is read in the browser and
  // sent to the API, which stores it and returns its path.
  const handleAvatarSelected = async (event) => {
    const file = event.target.files?.[0];
    // Reset the input so picking the same file twice still fires.
    event.target.value = '';
    if (!file) return;

    if (!/^image\//.test(file.type)) {
      showToast('Please choose an image file', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('The image must be smaller than 2 MB', 'error');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('The image could not be read'));
        reader.readAsDataURL(file);
      });

      const saved = await dashboardAPI.uploadAvatar(dataUrl);
      const url = resolveAssetUrl(saved?.avatar || saved?.avatarUrl);
      setAvatarUrl(url);
      if (saved?.user) setUser((prev) => (prev ? { ...prev, ...saved.user } : prev));
      showToast('Profile picture updated', 'success');
    } catch (err) {
      showToast(err?.message || 'Could not upload the image', 'error');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Copy API key. The clipboard can be unavailable (an insecure origin,
  // or a browser that blocks it), so the failure is reported instead of
  // leaving the button looking broken.
  const handleCopyKey = async (key) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      showToast('Could not copy the key to the clipboard', 'error');
    }
  };

  // Delete API key — the key is removed on the server first, and only
  // dropped from the list once the API confirmed it.
  const handleDeleteKey = async (id) => {
    if (deletingKeyId) return;
    setDeletingKeyId(id);
    try {
      await dashboardAPI.deleteApiKey(id);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
      showToast('API key deleted', 'info');
    } catch (err) {
      showToast(err?.message || 'Could not delete the API key', 'error');
    } finally {
      setDeletingKeyId(null);
    }
  };

  // Generate new API key. The API creates the key and returns its
  // secret once — it is never shown again, so it is copied right away.
  const handleGenerateKey = async () => {
    if (isGeneratingKey) return;
    const name = window.prompt('Name for the new API key:', 'New API Key');
    if (!name || !name.trim()) return;

    setIsGeneratingKey(true);
    try {
      const created = await dashboardAPI.createApiKey(name.trim());
      setApiKeys((prev) => [
        {
          id: created.id,
          name: created.name,
          key: created.key,
          created: created.createdAt
            ? new Date(created.createdAt).toLocaleDateString()
            : new Date().toLocaleDateString(),
          lastUsed: 'Never',
          // The secret is only handed out once. It is kept in the list
          // so it can be copied, and masked everywhere else.
          isNew: true
        },
        ...prev,
      ]);
      showToast('API key created — copy it now, it is not shown again', 'success');
    } catch (err) {
      showToast(err?.message || 'Could not create the API key', 'error');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // Change password. The current password is verified by the API, so a
  // wrong one is rejected instead of silently succeeding.
  const handleChangePassword = async () => {
    const { current, next, confirm } = passwordForm;

    if (!current) {
      setPasswordError('Enter your current password');
      return;
    }
    if (next.length < 8) {
      setPasswordError('The new password must be at least 8 characters');
      return;
    }
    if (next !== confirm) {
      setPasswordError('The two new passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    setPasswordError('');
    try {
      await authAPI.changePassword(current, next);
      setPasswordForm({ current: '', next: '', confirm: '' });
      setPasswordDialogOpen(false);
      showToast('Password updated successfully', 'success');
    } catch (err) {
      setPasswordError(err?.message || 'Could not change the password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const closePasswordDialog = useCallback(() => {
    setPasswordDialogOpen(false);
    setPasswordError('');
    setPasswordForm({ current: '', next: '', confirm: '' });
  }, []);

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

  // Apply theme. The context resolves 'system' to the operating
  // system's preference and keeps following it.
  //
  // The choice is also written to the account, so it follows the user
  // to another machine instead of staying in this browser.
  const handleApplyTheme = async (newTheme) => {
    setTheme(newTheme);
    const result = await saveSettings({ appearance: { theme: newTheme } });
    if (!result.ok) {
      showToast(result.error || 'Could not save the theme', 'error');
      return;
    }
    showToast(
      `Theme set to ${newTheme.charAt(0).toUpperCase()}${newTheme.slice(1)}`,
      'success'
    );
  };

  // Apply the accent colour.
  //
  // The colour is applied to the document first so the change is visible
  // immediately, then written to the account. The value is normalised
  // before it is stored, so the API always receives a six digit hex.
  const handleApplyAccent = async (color) => {
    const normalized = normalizeAccent(color);
    if (!normalized) {
      showToast('That is not a colour the app can use', 'error');
      return;
    }

    setAccentColor(normalized);
    applyAccentColor(normalized);

    const result = await saveSettings({ appearance: { accent: normalized } });
    if (!result.ok) {
      showToast(result.error || 'Could not save the accent colour', 'error');
      return;
    }
    showToast(`Accent colour updated to ${accentLabel(normalized)}`, 'success');
  };

  // Toggle integration. The connection is stored on the server, so the
  // list is refreshed from the API instead of only being flipped
  // locally.
  const toggleIntegration = async (app) => {
    setBusyIntegration(app.provider);
    try {
      if (app.connected) {
        await dashboardAPI.disconnectIntegration(app.provider);
        setIntegrations((prev) =>
          prev.map((i) => (i.provider === app.provider ? { ...i, connected: false } : i))
        );
        showToast(`${app.name} disconnected`, 'info');
      } else {
        await dashboardAPI.connectIntegration(app.provider);
        setIntegrations((prev) =>
          prev.map((i) => (i.provider === app.provider ? { ...i, connected: true } : i))
        );
        showToast(`${app.name} connected`, 'success');
      }
    } catch (err) {
      showToast(err?.message || `Could not update ${app.name}`, 'error');
    } finally {
      setBusyIntegration(null);
    }
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
            <nav className="space-y-1" data-testid="settings-tabs">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`settings-tab-${item.id}`}
                  onClick={() => selectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeTab === item.id
                      ? 'bg-[var(--accent-color)] text-[var(--accent-contrast)] shadow-sm'
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
            <div className="minimal-card p-6" data-testid="settings-panel-profile">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-6">Profile Settings</h3>
              
              {/* Avatar */}
              <div className="flex items-center gap-6 mb-8">
                <div className="relative">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={profileForm.name || 'Profile picture'}
                      className="w-20 h-20 rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white text-2xl font-bold">
                      {profileForm.name?.[0] || 'U'}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="absolute -bottom-2 -right-2 w-8 h-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Change profile picture"
                    aria-label="Change profile picture"
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleAvatarSelected}
                    className="hidden"
                  />
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={profileForm.email}
                    readOnly
                    title="The sign-in address cannot be changed here"
                    className="minimal-input opacity-60 cursor-not-allowed"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    This is the address you sign in with. To change it, use the password reset flow.
                  </p>
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
                    disabled={isSavingProfile}
                    className="btn-primary flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSavingProfile ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : saveSuccess ? (
                      <Check className="w-4 h-4" />
                    ) : null}
                    {isSavingProfile ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Changes'}
                  </button>
                  {saveSuccess && (
                    <span className="text-sm text-emerald-600">Profile updated successfully</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6" data-testid="settings-panel-security">
              {/* Password */}
              <div className="minimal-card p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100">Password</h4>
                      <p className="text-sm text-slate-500">
                        {accountMeta.createdAt
                          ? `Account created ${new Date(accountMeta.createdAt).toLocaleDateString()}`
                          : 'Password last changed when your account was created'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setPasswordError('');
                      setPasswordDialogOpen(true);
                    }}
                    className="btn-secondary"
                  >
                    Change Password
                  </button>
                </div>
              </div>

              {/* Two Factor */}
              <div className="minimal-card p-6" data-testid="settings-two-factor">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                        Two-Factor Authentication
                      </h4>
                      <p className="text-sm text-slate-500">
                        {twoFactor.enabled
                          ? `A code from your authenticator app is required to sign in${
                              twoFactor.enabledAt
                                ? ` — on since ${new Date(twoFactor.enabledAt).toLocaleDateString()}`
                                : ''
                            }`
                          : 'Ask for a six digit code from an authenticator app when you sign in'}
                      </p>
                    </div>
                  </div>

                  {twoFactor.enabled ? (
                    <div className="flex items-center gap-3">
                      <span className="minimal-badge badge-success">Enabled</span>
                      <button
                        type="button"
                        onClick={() => setTwoFactorStage('disable')}
                        data-testid="two-factor-disable"
                        className="btn-secondary"
                      >
                        Turn off
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="minimal-badge badge-warning">Not enabled</span>
                      <button
                        type="button"
                        onClick={() => setTwoFactorStage('setup')}
                        data-testid="two-factor-enable"
                        className="btn-secondary"
                      >
                        Set up
                      </button>
                    </div>
                  )}
                </div>

                {twoFactor.enabled && twoFactor.recoveryCodes > 0 && (
                  <p className="mt-3 text-xs text-slate-500">
                    {twoFactor.recoveryCodes} recovery codes are stored for this account. They are
                    shown once, when the second factor is turned on.
                  </p>
                )}
              </div>

              {/* API Keys */}
              <div className="minimal-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100">API Keys</h4>
                  <button
                    onClick={handleGenerateKey}
                    disabled={isGeneratingKey}
                    className="btn-primary flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isGeneratingKey ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Generate New Key
                  </button>
                </div>

                <div className="space-y-3">
                  {apiKeys.length === 0 && (
                    <p className="text-sm text-slate-500">
                      No API keys yet. Generate one to call the API from a script or a CI job.
                    </p>
                  )}
                  {apiKeys.map((apiKey) => (
                    <div key={apiKey.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h5 className="font-medium text-slate-900 dark:text-slate-100">{apiKey.name}</h5>
                          {apiKey.isNew && (
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
                              New — copy it now
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 font-mono break-all">{apiKey.key}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Created {apiKey.created}
                          {apiKey.lastUsed ? ` · Last used ${apiKey.lastUsed}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <button
                          onClick={() => handleCopyKey(apiKey.key)}
                          disabled={!apiKey.isNew}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={
                            apiKey.isNew
                              ? 'Copy key'
                              : 'This key is masked. Delete it and generate a new one to get the secret.'
                          }
                          aria-label={`Copy ${apiKey.name}`}
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
                          disabled={deletingKeyId === apiKey.id}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete key"
                          aria-label={`Delete ${apiKey.name}`}
                        >
                          {deletingKeyId === apiKey.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  A key's secret is shown once, when it is created. Later it is masked — delete the
                  key and generate a new one if you lose it.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6" data-testid="settings-panel-notifications">
              <div className="minimal-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                    Notification Settings
                  </h4>
                  {isSavingNotifications && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving to your account…
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  These preferences belong to your account, so they follow you to any device you
                  sign in on.
                </p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">Security Alerts</p>
                      <p className="text-sm text-slate-500">Get notified about critical vulnerabilities</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifications.email}
                      aria-label="Security Alerts"
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
                      type="button"
                      role="switch"
                      aria-checked={notifications.push}
                      aria-label="Push Notifications"
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
                      type="button"
                      role="switch"
                      aria-checked={notifications.vulnerabilityAlerts}
                      aria-label="Vulnerability Alerts"
                      onClick={() => toggleNotification('vulnerabilityAlerts')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${notifications.vulnerabilityAlerts ? 'bg-slate-900 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifications.vulnerabilityAlerts ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">Scan Completion</p>
                      <p className="text-sm text-slate-500">Get notified when a scan finishes</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifications.scanCompletion}
                      aria-label="Scan Completion"
                      onClick={() => toggleNotification('scanCompletion')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${notifications.scanCompletion ? 'bg-slate-900 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifications.scanCompletion ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">Weekly Report</p>
                      <p className="text-sm text-slate-500">Summary of your security status</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifications.weeklyReport}
                      aria-label="Weekly Report"
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
            <div className="minimal-card p-6" data-testid="settings-panel-appearance">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Theme</h4>
              <div className="grid grid-cols-3 gap-4">
                {['light', 'dark', 'system'].map((themeOption) => (
                  <button
                    key={themeOption}
                    type="button"
                    data-testid={`settings-theme-${themeOption}`}
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

              {/* ---- Accent colour ------------------------------------ */}
              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700/60">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100">Accent Colour</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Used for buttons, focus rings and the active navigation item.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-4" data-testid="settings-accent-swatches">
                  {ACCENT_PRESETS.map((preset) => {
                    const isSelected = selectedColor === preset.value;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyAccent(preset.value)}
                        title={preset.label}
                        aria-label={`Apply accent colour ${preset.label}`}
                        aria-pressed={isSelected}
                        data-testid={`settings-accent-${preset.id}`}
                        className={`relative w-10 h-10 rounded-full border-2 shadow-md hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
                          isSelected
                            ? 'border-slate-900 dark:border-slate-100 scale-110 ring-2 ring-offset-2 ring-[var(--accent-color-ring)]'
                            : 'border-white dark:border-slate-700'
                        }`}
                        style={{ backgroundColor: preset.value }}
                      >
                        {isSelected && (
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
                    );
                  })}

                  {/* Custom colour — the native picker, opened by a
                      button that looks like one of the swatches. The
                      picked colour is previewed in the swatch; it is
                      saved when the native picker closes. */}
                  <label
                    className="relative w-10 h-10 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600 shadow-md hover:scale-110 transition-transform cursor-pointer overflow-hidden"
                    title="Pick a custom colour"
                    data-testid="settings-accent-custom-label"
                    style={customColor ? { backgroundColor: customColor } : undefined}
                  >
                    {!customColor && (
                      <span className="absolute inset-0 m-auto text-slate-400 dark:text-slate-500 text-lg leading-none pointer-events-none">
                        +
                      </span>
                    )}
                    {customColor && (
                      <span className="absolute inset-0 m-auto text-white text-lg leading-none pointer-events-none mix-blend-difference">
                        +
                      </span>
                    )}
                    <input
                      ref={customColorRef}
                      type="color"
                      value={customColor || selectedColor}
                      onChange={(e) => setCustomColor(e.target.value)}
                      aria-label="Pick a custom accent colour"
                      data-testid="settings-accent-custom"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>
                </div>

                {/* The staged custom colour is committed with an
                    explicit button, so the native picker — which fires
                    `change` on every drag — does not write to the
                    account on every pixel. */}
                {customColor && normalizeAccent(customColor) !== selectedColor && (
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      type="button"
                      onClick={() => handleApplyAccent(customColor)}
                      className="btn-primary"
                      data-testid="settings-accent-apply-custom"
                    >
                      Apply {customColor.toUpperCase()}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomColor('')}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Current accent:{' '}
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                      {selectedColor}
                    </span>
                    <span className="text-slate-400"> · {accentLabel(selectedColor)}</span>
                  </p>
                  {selectedColor !== DEFAULT_ACCENT && (
                    <button
                      type="button"
                      onClick={() => handleApplyAccent(DEFAULT_ACCENT)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 underline underline-offset-2 transition-colors"
                    >
                      Reset to default
                    </button>
                  )}
                </div>

                {/* Live preview — shows the accent on the components
                    that use it, so the choice can be judged before it
                    is used elsewhere in the app. */}
                <div
                  className="mt-4 rounded-xl border border-slate-100 dark:border-slate-700/60 p-4 bg-slate-50/60 dark:bg-slate-800/40"
                  data-testid="settings-accent-preview"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Preview
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                      style={{
                        backgroundColor: accentShadeSet.base,
                        color: accentShadeSet.contrast,
                      }}
                    >
                      Primary button
                    </span>
                    <span
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: accentShadeSet.soft,
                        color: accentShadeSet.base,
                      }}
                    >
                      Soft surface
                    </span>
                    <span
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
                      style={{ borderColor: accentShadeSet.base, color: accentShadeSet.base }}
                    >
                      Outlined
                    </span>
                    <span
                      className="w-8 h-8 rounded-full shadow-md"
                      style={{ backgroundColor: accentShadeSet.base }}
                      title="Accent colour"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="minimal-card p-6" data-testid="settings-panel-integrations">
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
                      onClick={() => toggleIntegration(app)}
                      disabled={busyIntegration === app.provider}
                      className={`w-full py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                        app.connected
                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                          : 'bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700'
                      }`}
                    >
                      {busyIntegration === app.provider ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {app.connected ? 'Disconnecting...' : 'Connecting...'}
                        </span>
                      ) : app.connected ? (
                        'Disconnect'
                      ) : (
                        'Connect'
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6" data-testid="settings-panel-billing">
              {/* Current Plan */}
              <div className="bg-slate-900 dark:bg-slate-950 rounded-2xl p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Current Plan</p>
                    <h4 className="text-2xl font-bold mt-1">Community</h4>
                    <p className="text-slate-400 mt-1">
                      Free forever · all core security features included
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      showToast('Paid plans are not available on this deployment yet.', 'info')
                    }
                    className="px-4 py-2 bg-white text-slate-900 dark:text-slate-100 rounded-lg font-medium hover:bg-slate-100 transition-colors"
                  >
                    Upgrade Plan
                  </button>
                </div>
              </div>

              {/* Usage */}
              <div className="minimal-card p-6">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">
                  Usage This Month
                </h4>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Projects</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {usage?.projects ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Scans run</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {usage?.scans ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Findings recorded</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {usage?.findings ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Lines of code analysed</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {(usage?.linesAnalyzed ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">API keys</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {apiKeys.length}
                    </span>
                  </div>
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  These are the figures for your own account, counted from your projects and scans.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'help' && (
            <div className="space-y-6" data-testid="settings-panel-help">
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

      {/* Change password dialog */}
      {passwordDialogOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
          onClick={closePasswordDialog}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3
                  id="change-password-title"
                  className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                >
                  Change password
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Your current password is required to confirm the change.
                </p>
              </div>
              <button
                onClick={closePasswordDialog}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Current password
                </label>
                <input
                  type="password"
                  autoFocus
                  value={passwordForm.current}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, current: e.target.value }))
                  }
                  className="minimal-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  New password
                </label>
                <input
                  type="password"
                  value={passwordForm.next}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, next: e.target.value }))
                  }
                  className="minimal-input"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  At least 8 characters.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Confirm new password
                </label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleChangePassword();
                  }}
                  className="minimal-input"
                />
              </div>

              {passwordError && (
                <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closePasswordDialog} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={isChangingPassword}
                className="btn-primary flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isChangingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                {isChangingPassword ? 'Updating...' : 'Change password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-factor setup dialog */}
      {twoFactorStage && (
        <TwoFactorSetup
          initialStage={twoFactorStage}
          onClose={(result) => {
            setTwoFactorStage(null);
            if (result?.enabled !== undefined) {
              setTwoFactor((prev) => ({
                ...prev,
                enabled: result.enabled,
                enabledAt: result.enabled ? prev.enabledAt : null,
                recoveryCodes: result.enabled ? 8 : 0,
              }));
            }
          }}
        />
      )}
    </div>
  );
};

export default Settings;
