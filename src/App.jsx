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
import Analysis from './pages/Analysis';
import Threats from './pages/Threats';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import Team from './pages/Team';
import APIKeys from './pages/APIKeys';
import AuditLogs from './pages/AuditLogs';
import Integrations from './pages/Integrations';
import Notifications from './pages/Notifications';
import Onboarding from './pages/Onboarding';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import ForgotPassword from './pages/ForgotPassword';
import AboutTeam from './pages/AboutTeam';
import Sandbox from './pages/Sandbox';
import OWASPAnalysis from './pages/OWASPAnalysis';

// Components
import Layout from './components/layout/Layout';
import WelcomeTour from './components/WelcomeTour';

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
              <Route path="/analysis" element={<Analysis />} />
              <Route path="/threats" element={<Threats />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />

              {/* New Pages */}
              <Route path="/reports" element={<Reports />} />
              <Route path="/team" element={<Team />} />
              <Route path="/about-team" element={<AboutTeam />} />
              <Route path="/api-keys" element={<APIKeys />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/sandbox" element={<Sandbox />} />
              <Route path="/owasp-analysis" element={<OWASPAnalysis />} />
            </Route>

            {/* Public Pages */}
            <Route path="/terms-of-service" element={<PublicRoute><TermsOfService /></PublicRoute>} />
            <Route path="/privacy-policy" element={<PublicRoute><PrivacyPolicy /></PublicRoute>} />

            {/* Catch all - Redirect to landing */}
            <Route path="*" element={<Navigate to="/landing" replace />} />
          </Routes>
          <WelcomeTour />
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}

export default App;
