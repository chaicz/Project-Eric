import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ToastProvider } from './components/Toast';
import PageTransition from './components/PageTransition';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Security from './pages/Security';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Team from './pages/Team';
import APIKeys from './pages/APIKeys';
import AuditLogs from './pages/AuditLogs';
import Notifications from './pages/Notifications';
import Onboarding from './pages/Onboarding';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import ForgotPassword from './pages/ForgotPassword';
import AboutTeam from './pages/AboutTeam';
import Sandbox from './pages/Sandbox';
import OWASPScanner from './pages/OWASPScanner';
import OWASPAnalysis from './pages/OWASPAnalysis';
import IDEWorkspace from './pages/IDEWorkspace';
import EricCollabLiteViewer from './pages/EricCollabLiteViewer';

// Components
import Layout from './components/layout/Layout';
import WelcomeTour from './components/WelcomeTour';
import ErrorBoundary from './components/ErrorBoundary';

// Protected Route - Requires authentication
const ProtectedRoute = ({ children }) => {
  const { user } = useApp();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/landing" replace />;
  }

  if (!user.onboardingComplete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  if (user.onboardingComplete && location.pathname === '/onboarding') {
    return <Navigate to="/dashboard" replace />;
  }

  return <PageTransition>{children}</PageTransition>;
};

// Auth Route - Redirects if already logged in. Wraps in PageTransition
// so the page entrance/exit animation plays on every navigation.
const AuthRoute = ({ children }) => {
  const { user } = useApp();

  if (user) {
    if (!user.onboardingComplete) {
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <PageTransition>{children}</PageTransition>;
};

// Wrapper for fully public pages that should still get the entrance animation.
const PublicRoute = ({ children }) => <PageTransition>{children}</PageTransition>;

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Landing Page - Entry point for non-logged in users */}
              <Route path="/landing" element={<PublicRoute><Landing /></PublicRoute>} />

              {/* Root redirects to landing */}
              <Route path="/" element={<Navigate to="/landing" replace />} />

              {/* Auth Routes */}
              <Route path="/login" element={
                <AuthRoute>
                  <Login />
                </AuthRoute>
              } />
              <Route path="/signup" element={
                <AuthRoute>
                  <Signup />
                </AuthRoute>
              } />
              <Route path="/forgot-password" element={
                <AuthRoute>
                  <ForgotPassword />
                </AuthRoute>
              } />

              {/* Onboarding Route - For logged in users who haven't completed */}
              <Route path="/onboarding" element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              } />

              {/* Protected Routes - Require login and completed onboarding.
                  Layout's Outlet applies the per-route page transition. */}
              <Route element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route path="/dashboard" element={<Dashboard />} />
                {/* The security workspace. It absorbed the old Analysis,
                    Threats and Reports pages, so each of those paths
                    still lands on the right view — the `tab` query
                    parameter picks which one. */}
                <Route path="/security" element={<Security />} />
                <Route path="/analysis" element={<Navigate to="/security?tab=findings" replace />} />
                <Route path="/threats" element={<Navigate to="/security?tab=threats" replace />} />
                <Route path="/reports" element={<Navigate to="/security?tab=reports" replace />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/profile" element={<Profile />} />

                {/* New Pages */}
                <Route path="/team" element={<Team />} />
                <Route path="/about-team" element={<AboutTeam />} />
                <Route path="/api-keys" element={<APIKeys />} />
                <Route path="/audit-logs" element={<AuditLogs />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/sandbox" element={<Sandbox />} />
                <Route path="/owasp-analysis" element={<OWASPAnalysis />} />
                <Route path="/owasp" element={<OWASPScanner />} />
                <Route path="/ide" element={<IDEWorkspace />} />
              </Route>

              {/* Public Pages */}
              <Route path="/terms-of-service" element={<PublicRoute><TermsOfService /></PublicRoute>} />
              <Route path="/privacy-policy" element={<PublicRoute><PrivacyPolicy /></PublicRoute>} />

              {/* Eric Collab Lite Viewer — public, no login, no onboarding.
                  This is the tunnel-independent path for guests: the page
                  connects straight to the public Yjs signaling server so
                  they can read/edit the shared file even when the host's
                  localtunnel is returning 502. */}
              <Route path="/viewer" element={<PublicRoute><EricCollabLiteViewer /></PublicRoute>} />

              {/* Catch all - Redirect to landing */}
              <Route path="*" element={<Navigate to="/landing" replace />} />
            </Routes>
            <WelcomeTour />
          </BrowserRouter>
        </ToastProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
