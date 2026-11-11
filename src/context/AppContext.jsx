import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, dashboardAPI, getToken, clearToken } from '../services/api';
import { readUserScoped, writeUserScoped, removeUserScoped } from '../utils/userStorage';
import {
  applyAccentColor,
  normalizeAccent,
  DEFAULT_ACCENT,
} from '../utils/accentColor';

const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

// ---------------------------------------------------------------------------
// Latest OWASP scanner result — shared across the app so the scanner page
// can hand off findings to the Analysis, Threats, and Reports pages. We
// keep a single canonical shape (id, name, status, severity, cwe, evidence,
// remediation) and let each consumer render it in its own style.
// ---------------------------------------------------------------------------
const SCAN_STORAGE_KEY = 'project-eric_last_scan';

const readSavedScan = () => {
  try {
    const parsed = readUserScoped(SCAN_STORAGE_KEY, null);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writeSavedScan = (scan) => {
  if (scan) writeUserScoped(SCAN_STORAGE_KEY, scan);
  else removeUserScoped(SCAN_STORAGE_KEY);
};

// ---------------------------------------------------------------------------
// Scans the backend refused to store
// ---------------------------------------------------------------------------
// A scan that could not be written to MySQL (the backend was unreachable or
// rejected the save) is still real work the user did. The dashboard adds
// those on top of the stored figures so a failed save never silently
// disappears from the totals.
//
// The list lives here — in the context and in localStorage — because the
// scanner and the dashboard are usually not mounted at the same time: the
// user scans on one page and looks at the dashboard on another.
const UNPERSISTED_SCANS_KEY = 'project-eric_unpersisted_scans';

const readUnpersistedScans = () => {
  try {
    const parsed = readUserScoped(UNPERSISTED_SCANS_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeUnpersistedScans = (list) => {
  try {
    writeUserScoped(UNPERSISTED_SCANS_KEY, list);
  } catch {
    /* quota or privacy mode — ignore */
  }
};

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('project-eric_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      localStorage.removeItem('project-eric_user');
      return null;
    }
  });

  const [onboarding, setOnboarding] = useState(() => {
    // Scoped to the signed-in account: the onboarding answers describe
    // one person, not the browser.
    const parsed = readUserScoped('project-eric_onboarding', {}) || {};
    return {
      step: 1,
      totalSteps: 5,
      data: parsed
    };
  });

  // The theme the user picked: 'light', 'dark' or 'system'. The value
  // is persisted, so the choice survives a reload.
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('project-eric_theme');
    return saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'light';
  });

  // Whether the operating system asks for a dark interface. This is
  // what the 'system' theme follows.
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  // The theme that is actually rendered. With 'system' selected it is
  // whichever one the operating system currently asks for.
  const resolvedTheme = theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;

  // Keep the document in sync with the resolved theme.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  // While 'system' is selected, follow the operating system when the
  // user changes it.
  useEffect(() => {
    if (theme !== 'system') return undefined;
    let query;
    try {
      query = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return undefined;
    }
    const onChange = (event) => setSystemPrefersDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);

  // Pick a theme and remember it.
  const setTheme = useCallback((next) => {
    if (next !== 'light' && next !== 'dark' && next !== 'system') return;
    setThemeState(next);
    try {
      localStorage.setItem('project-eric_theme', next);
    } catch {
      /* private mode — the choice just will not survive a reload */
    }
  }, []);

  // The accent colour the user picked. It is stored in the browser so
  // the page paints in the right colour immediately, and it is also
  // written to the account (see `accountSettings`) so it follows the
  // user to another machine.
  const [accentColor, setAccentColorState] = useState(() => {
    try {
      return normalizeAccent(localStorage.getItem('project-eric_accent')) || DEFAULT_ACCENT;
    } catch {
      return DEFAULT_ACCENT;
    }
  });

  // Publish the accent to the document whenever it changes. This runs
  // on mount as well, so the very first paint already uses the stored
  // colour instead of the default.
  useEffect(() => {
    applyAccentColor(accentColor);
  }, [accentColor]);

  // Pick an accent colour. The value is normalised first, so a colour
  // that is not a hex value never reaches the CSS custom property.
  const setAccentColor = useCallback((next) => {
    const normalized = normalizeAccent(next);
    if (!normalized) return;
    setAccentColorState(normalized);
    applyAccentColor(normalized);
  }, []);

  // Latest OWASP scan result (set by OWASPScanner on completion).
  // Persisted to localStorage so the destination pages can pick it up
  // even on a hard reload.
  const [lastScanResult, setLastScanResultState] = useState(() => readSavedScan());

  useEffect(() => {
    localStorage.setItem('project-eric_user', JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    writeUserScoped('project-eric_onboarding', onboarding.data);
  }, [onboarding]);

  useEffect(() => {
    localStorage.setItem('project-eric_accent', accentColor);
  }, [accentColor]);

  useEffect(() => {
    writeSavedScan(lastScanResult);
  }, [lastScanResult]);

  const setLastScanResult = (scan) => setLastScanResultState(scan);
  const clearLastScanResult = () => setLastScanResultState(null);

  // Scans the backend could not store. They are kept so the dashboard can
  // count them on top of the stored figures instead of dropping them.
  const [unpersistedScans, setUnpersistedScansState] = useState(() => readUnpersistedScans());

  useEffect(() => {
    writeUnpersistedScans(unpersistedScans);
  }, [unpersistedScans]);

  // Record a scan the backend refused. The same scan is never recorded
  // twice, so a retry of the same run cannot inflate the totals.
  const markScanUnpersisted = (scan) => {
    if (!scan?.scannedAt) return;
    setUnpersistedScansState((prev) => {
      if (prev.some((s) => s.scannedAt === scan.scannedAt)) return prev;
      return [...prev, scan];
    });
  };

  // Drop a scan from the unpersisted list — the backend holds it now.
  const clearUnpersistedScan = (scan) => {
    if (!scan?.scannedAt) return;
    setUnpersistedScansState((prev) => {
      const next = prev.filter((s) => s.scannedAt !== scan.scannedAt);
      return next.length === prev.length ? prev : next;
    });
  };

  // -------------------------------------------------------------------------
  // Authentication — backed by the XAMPP/PHP API.
  //
  // The API's `buildUserPayload()` returns exactly the user shape the
  // dashboard consumes, so the response can be stored as-is. The token is
  // stored separately in `localStorage.token` by `authAPI`.
  // -------------------------------------------------------------------------
  const login = async (email, password) => {
    const data = await authAPI.login(email, password);

    // An account with a second factor does not get a token here. The API
    // answers with a challenge, and the caller has to come back with
    // the six digit code.
    if (data?.requiresTwoFactor) {
      return { requiresTwoFactor: true, challenge: data.challenge };
    }

    const user = data?.user || null;
    if (!user) throw new Error('Login succeeded but no user was returned.');
    setUser(user);
    return user;
  };

  /**
   * Finish signing in with the second factor.
   *
   * @param {{email: string, password: string, challenge: string, code: string}} credentials
   */
  const loginWithTwoFactor = async ({ email, password, challenge, code }) => {
    const data = await authAPI.loginWithTwoFactor({ email, password, challenge, code });
    const user = data?.user || null;
    if (!user) throw new Error('Sign in succeeded but no user was returned.');
    setUser(user);
    return user;
  };

  const register = async ({ name, email, password }) => {
    // The API stores the display name split across first/last name.
    const trimmed = String(name || '').trim();
    const parts = trimmed.split(/\s+/);
    const firstName = parts.shift() || trimmed;
    const lastName = parts.join(' ');

    const data = await authAPI.register({ firstName, lastName, email, password });
    const user = data?.user || null;
    if (!user) throw new Error('Registration succeeded but no user was returned.');
    // Keep the full display name the user typed.
    setUser({ ...user, name: trimmed || user.name });
    return user;
  };

  const loginWithOAuth = async (provider) => {
    // The OAuth endpoint expects an oauth id and an email. Real provider
    // SDKs would supply these; the demo accounts are seeded to match.
    const accounts = {
      google: { email: 'developer@gmail.com', firstName: 'Google', lastName: 'Developer' },
      github: { email: 'developer@github.com', firstName: 'GitHub', lastName: 'Developer' },
    };
    const account = accounts[provider];
    if (!account) throw new Error(`Unsupported OAuth provider: ${provider}`);

    const data = await authAPI.oauth(provider, {
      oauthId: `${provider}-${account.email.split('@')[0]}`,
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
    });
    const user = data?.user || null;
    if (!user) throw new Error('OAuth login succeeded but no user was returned.');
    setUser(user);
    return user;
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      // The local session must end even if the server call failed.
      clearToken();
    }
    setUser(null);
    // Drop the caches that belong to the account that just signed out.
    // They are keyed per account, so the next sign-in cannot read them —
    // but on a shared machine they should not linger either.
    //
    // These have to go BEFORE `project-eric_user` is removed: the key
    // is derived from the signed-in account, so removing the account
    // first would point the cleanup at the wrong entry.
    removeUserScoped('project_eric_last_scan');
    removeUserScoped('project-eric_unpersisted_scans');
    removeUserScoped('project_eric_dashboard_api_snapshot');
    removeUserScoped('project_eric_dashboard_last_sync');
    localStorage.removeItem('project-eric_user');
  };

  // Re-validate the stored token against the API on boot so a revoked or
  // expired session doesn't linger in the dashboard.
  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setUser(null);
      return undefined;
    }

    authAPI
      .validate()
      .then((data) => {
        if (cancelled) return;
        if (data?.user) setUser(data.user);
      })
      .catch(() => {
        if (cancelled) return;
        clearToken();
        setUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateOnboardingStep = (step, data = null) => {
    setOnboarding(prev => ({
      ...prev,
      step,
      data: data ? { ...prev.data, ...data } : prev.data
    }));
  };

  const completeOnboarding = (data = {}) => {
    const updatedUser = { ...user, ...data, onboardingComplete: true };
    setUser(updatedUser);

    // The flag has to live on the server as well as in the browser.
    //
    // It used to be local only. The next `/auth/validate` call replaced
    // the cached user object with the server's copy, the flag came back
    // false, and a page refresh threw the user straight back into the
    // tour they had already finished.
    //
    // A failure here must not trap the user in the tour, so the local
    // state is updated first and the server copy is filled in behind it.
    dashboardAPI
      .saveOnboarding(data)
      .then((res) => {
        const saved = res?.user;
        if (saved) setUser((prev) => (prev ? { ...prev, ...saved } : saved));
      })
      .catch(() => {
        // The backend is unreachable. The session keeps working; the flag
        // is simply re-saved the next time the tour is completed.
        console.warn('[project-eric] Could not persist the onboarding state.');
      });
  };

  const value = {
    user,
    setUser,
    login,
    loginWithTwoFactor,
    register,
    loginWithOAuth,
    logout,
    onboarding,
    setOnboarding,
    updateOnboardingStep,
    completeOnboarding,
    theme,
    setTheme,
    // The theme that is actually on screen. With 'system' selected this
    // is whichever one the operating system currently asks for.
    resolvedTheme,
    accentColor,
    setAccentColor,
    lastScanResult,
    setLastScanResult,
    clearLastScanResult,
    unpersistedScans,
    markScanUnpersisted,
    clearUnpersistedScan,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
