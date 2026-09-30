import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BackgroundSlideshow from '../components/BackgroundSlideshow';
import BrandPanel from '../components/auth/BrandPanel';
import FormShell from '../components/auth/FormShell';
import FadeIn from '../components/auth/FadeIn';
import AuthInput from '../components/auth/AuthInput';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  CheckCircle2,
  Github,
  Chrome,
  Shield,
  Loader2,
  AlertCircle,
  Sparkles,
  ScanSearch,
  Users,
  KeyRound,
} from 'lucide-react';

const LOGIN_FEATURES = [
  {
    icon: Shield,
    color: 'text-blue-300',
    title: 'Enterprise-grade',
    desc: 'OWASP & SOC2 ready',
  },
  {
    icon: ScanSearch,
    color: 'text-purple-300',
    title: 'Threat detection',
    desc: 'AI-powered analysis',
  },
  {
    icon: KeyRound,
    color: 'text-pink-300',
    title: 'Zero-trust auth',
    desc: 'Hardware-grade keys',
  },
];

const Login = () => {
  const navigate = useNavigate();
  const { login, loginWithOAuth } = useApp();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [mounted, setMounted] = useState(false);
  const [shake, setShake] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const validateForm = () => {
    const newErrors = {};
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    login(formData.email, formData.password);
    setIsSuccess(true);
    await new Promise((r) => setTimeout(r, 600));
    navigate('/onboarding');
  };

  const handleOAuth = async (provider) => {
    loginWithOAuth(provider);
    await new Promise((r) => setTimeout(r, 100));
    navigate('/onboarding');
  };

  // ⌘/Ctrl + Enter shortcut to submit
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(e);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  const emailValid = formData.email && /\S+@\S+\.\S+/.test(formData.email);

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      <BackgroundSlideshow interval={6000} overlayOpacity={0.35} />

      {/* LEFT — Brand */}
      <BrandPanel
        mounted={mounted}
        badgeTitle="Welcome back"
        heroPrefix="Sign in to your"
        heroHighlight="secure workspace"
        description="Pick up right where you left off — your projects, scans, and team are all waiting for you."
        features={LOGIN_FEATURES}
      />

      {/* RIGHT — Form */}
      <FormShell mounted={mounted} shake={shake}>
        {/* Heading */}
        <div className="mb-7">
          {/* Mobile-only badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-medium text-indigo-700 mb-4 lg:hidden">
            <Sparkles className="w-3.5 h-3.5" /> Welcome back
          </div>

          <h2 className="text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
            Sign in to your account
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/signup')}
              className="text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
            >
              Create one free
            </button>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <AuthInput
            id="email"
            label="Email address"
            type="email"
            value={formData.email}
            onChange={(e) => {
              setFormData({ ...formData, email: e.target.value });
              if (errors.email) setErrors({ ...errors, email: '' });
            }}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            focused={focusedField === 'email'}
            Icon={Mail}
            placeholder="name@company.com"
            hasError={!!errors.email}
            errorMessage={errors.email}
            isValid={emailValid}
            showValidIcon
            autoComplete="email"
            delay={100}
            shake={shake}
            shakeTrigger={!!errors.email}
          />

          {/* Password */}
          <AuthInput
            id="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={(e) => {
              setFormData({ ...formData, password: e.target.value });
              if (errors.password) setErrors({ ...errors, password: '' });
            }}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
            focused={focusedField === 'password'}
            Icon={Lock}
            placeholder="Enter your password"
            hasError={!!errors.password}
            errorMessage={errors.password}
            autoComplete="current-password"
            delay={150}
            shake={shake}
            shakeTrigger={!!errors.password}
            rightAccessory={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            }
          />

          {/* Remember & Forgot */}
          <FadeIn delay={200}>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setRememberMe(!rememberMe)}
                className="flex items-center gap-2.5 group focus:outline-none"
              >
                <div
                  className={`relative w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                    rememberMe
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'border-slate-300 bg-white group-hover:border-indigo-400'
                  }`}
                >
                  {rememberMe && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="animate-scale-in"
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                </div>
                <span className="text-sm text-slate-600 select-none">
                  Remember me for 30 days
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold transition-colors focus:outline-none"
              >
                Forgot password?
              </button>
            </div>
          </FadeIn>

          {/* Submit */}
          <FadeIn delay={250}>
            <button
              type="submit"
              disabled={isLoading || isSuccess}
              className={`group relative w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden ${
                isSuccess
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:shadow-[0_10px_30px_-8px_rgba(99,102,241,0.55)] hover:-translate-y-0.5 active:translate-y-0'
              } ${
                isLoading || isSuccess
                  ? 'cursor-not-allowed opacity-90'
                  : 'shadow-lg shadow-indigo-600/20'
              }`}
            >
              {isLoading && (
                <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-indigo-300 to-purple-300 animate-progress-bar" />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Signing you in...
                  </>
                ) : isSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Redirecting...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </button>
          </FadeIn>

          {/* Keyboard shortcut hint */}
          <FadeIn delay={300}>
            <p className="text-[11px] text-slate-400 text-center">
              Tip: press{' '}
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono text-[10px] border border-slate-200">
                ⌘
              </kbd>{' '}
              +{' '}
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono text-[10px] border border-slate-200">
                Enter
              </kbd>{' '}
              to submit
            </p>
          </FadeIn>
        </form>

        {/* Divider */}
        <FadeIn delay={350}>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-white text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold">
                or continue with
              </span>
            </div>
          </div>
        </FadeIn>

        {/* Social */}
        <FadeIn delay={400}>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleOAuth('github')}
              className="group relative flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-900 hover:shadow-md transition-all duration-200 text-slate-700 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <Github className="w-[18px] h-[18px] text-slate-800" />
              <span>GitHub</span>
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              className="group relative flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-900 hover:shadow-md transition-all duration-200 text-slate-700 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <Chrome className="w-[18px] h-[18px]" />
              <span>Google</span>
            </button>
          </div>
        </FadeIn>

        {/* Footer — Trust indicators */}
        <FadeIn delay={450}>
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-5 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>256-bit encryption</span>
            </div>
            <div className="w-px h-3 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-500" />
              <span>10K+ teams trust us</span>
            </div>
          </div>
        </FadeIn>

        {/* Back to Home */}
        <FadeIn delay={500}>
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => navigate('/landing')}
              className="text-xs text-slate-400 hover:text-slate-700 transition-colors inline-flex items-center gap-1.5 group focus:outline-none"
            >
              <span className="transition-transform duration-300 group-hover:-translate-x-0.5">
                ←
              </span>
              Back to homepage
            </button>
          </div>
        </FadeIn>

        {/* Legal */}
        <FadeIn delay={550}>
          <p className="mt-4 text-center text-[10.5px] text-slate-400 leading-relaxed">
            By signing in, you agree to our{' '}
            <Link
              to="/terms-of-service"
              className="text-slate-600 hover:text-indigo-600 underline underline-offset-2 transition-colors"
            >
              Terms
            </Link>{' '}
            and{' '}
            <Link
              to="/privacy-policy"
              className="text-slate-600 hover:text-indigo-600 underline underline-offset-2 transition-colors"
            >
              Privacy Policy
            </Link>
          </p>
        </FadeIn>
      </FormShell>
    </div>
  );
};

export default Login;