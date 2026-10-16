import React, { createContext, useContext, useState, useEffect } from 'react';

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
    const raw = localStorage.getItem(SCAN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeSavedScan = (scan) => {
  try {
    if (scan) localStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify(scan));
    else localStorage.removeItem(SCAN_STORAGE_KEY);
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
    const saved = localStorage.getItem('project-eric_onboarding');
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      step: 1,
      totalSteps: 5,
      data: parsed
    };
  });

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('project-eric_theme');
    return saved || 'light';
  });

  const [accentColor, setAccentColor] = useState(() => {
    const saved = localStorage.getItem('project-eric_accent');
    return saved || '#3B82F6';
  });

  // Latest OWASP scan result (set by OWASPScanner on completion).
  // Persisted to localStorage so the destination pages can pick it up
  // even on a hard reload.
  const [lastScanResult, setLastScanResultState] = useState(() => readSavedScan());

  useEffect(() => {
    localStorage.setItem('project-eric_user', JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem('project-eric_onboarding', JSON.stringify(onboarding.data));
  }, [onboarding]);

  useEffect(() => {
    localStorage.setItem('project-eric_accent', accentColor);
  }, [accentColor]);

  useEffect(() => {
    writeSavedScan(lastScanResult);
  }, [lastScanResult]);

  const setLastScanResult = (scan) => setLastScanResultState(scan);
  const clearLastScanResult = () => setLastScanResultState(null);

  const login = (email, password, provider = null) => {
    // Mock login - in real app, this would be an API call
    let userName = email.split('@')[0];
    
    // Format the name properly for OAuth providers
    if (provider === 'google') {
      userName = email.split('@')[0].replace(/\./g, ' ').replace(/\d+/g, '').trim() || 'Google User';
    } else if (provider === 'github') {
      userName = email.split('@')[0].replace(/[._]/g, ' ').replace(/\d+/g, '').trim() || 'GitHub User';
    }
    
    // Capitalize first letter of each word
    userName = userName.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ') || 'User';
    
    const mockUser = {
      id: '1',
      name: userName,
      email,
      avatar: null,
      role: 'developer',
      experience: 'mid',
      languages: ['JavaScript', 'Python'],
      securityFocus: ['A01', 'A03', 'A06'],
      onboardingComplete: false, // User needs to complete onboarding first
      provider: provider || 'email'
    };
    setUser(mockUser);
    return mockUser;
  };

  const loginWithOAuth = (provider) => {
    // Mock OAuth login
    let mockEmail, mockName;
    
    if (provider === 'google') {
      mockEmail = 'developer@gmail.com';
      mockName = 'Google Developer';
    } else if (provider === 'github') {
      mockEmail = 'developer@github.com';
      mockName = 'GitHub Developer';
    }
    
    return login(mockEmail, 'oauth-verified', provider);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('project-eric_user');
  };

  const updateOnboardingStep = (step, data = null) => {
    setOnboarding(prev => ({
      ...prev,
      step,
      data: data ? { ...prev.data, ...data } : prev.data
    }));
  };

  const completeOnboarding = (data) => {
    const updatedUser = { ...user, ...data, onboardingComplete: true };
    setUser(updatedUser);
  };

  const value = {
    user,
    setUser,
    login,
    loginWithOAuth,
    logout,
    onboarding,
    setOnboarding,
    updateOnboardingStep,
    completeOnboarding,
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    lastScanResult,
    setLastScanResult,
    clearLastScanResult,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
