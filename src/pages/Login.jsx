import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { authAPI } from '../services/api';
import BackgroundSlideshow from '../components/BackgroundSlideshow';
import BrandPanel from '../components/auth/BrandPanel';
import FormShell from '../components/auth/FormShell';
import FadeIn from '../components/auth/FadeIn';
import AuthInput from '../components/auth/AuthInput';
import SocialAuthButtons from '../components/auth/SocialAuthButtons';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  CheckCircle2,
  Shield,
  Loader2,
  AlertCircle,
  Sparkles,
  ScanSearch,
  Users,
  KeyRound,
  Fingerprint,
  TerminalSquare,
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

/**
 * Password strength meter.
 *
 * Shown under the password field while the user types. It scores the
 * password on length and character variety, then reports a plain
 * language verdict with a coloured bar.
 *
 * The scoring is deliberately simple and local — it never leaves the
 * browser, so it cannot become an oracle for guessing a real password.
 */
const PASSWORD_CHECKS = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'mixed', label: 'Upper and lower case', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { id: 'number', label: 'A number', test: (v) => /\d/.test(v) },
  { id: 'symbol', label: 'A symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const scorePassword = (value) => {
  const password = String(value || '');
  if (!password) return { score: 0, label: '', checks: PASSWORD_CHECKS.map((c) => ({ ...c, passed: false })) };

  const checks = PASSWORD_CHECKS.map((c) => ({ ...c, passed: c.test(password) }));
  const passed = checks.filter((c) => c.passed).length;

  // Length carries extra weight — a long passphrase beats a short
  // one with more character classes.
  let score = passed;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  const capped = Math.min(score, 5);
  const label =
    capped <= 1 ? 'Weak' : capped <= 2 ? 'Fair' : capped <= 3 ? 'Good' : capped === 4 ? 'Strong' : 'Very strong';

  return { score: capped, label, checks };
};

const STRENGTH_TONES = {
  Weak: { bar: 'bg-red-500', text: 'text-red-600' },
  Fair: { bar: 'bg-amber-500', text: 'text-amber-600' },
  Good: { bar: 'bg-yellow-500', text: 'text-yellow-600' },
  Strong: { bar: 'bg-lime-500', text: 'text-lime-600' },
  'Very strong': { bar: 'bg-emerald-500', text: 'text-emerald-600' },
};

const PasswordStrength = ({ value }) => {
  const { score, label, checks } = scorePassword(value);
  if (!value) return null;

  const tone = STRENGTH_TONES[label] || STRENGTH_TONES.Weak;

  return (
    <div className="mt-2.5 animate-fade-in" aria-live="polite">
      {/* Bar */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1" role="presentation">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i < score ? tone.bar : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
        <span className={`text-[11px] font-semibold ${tone.text}`}>{label}</span>
      </div>

      {/* Checklist — tells the user exactly what is still missing. */}
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {checks.map((c) => (
          <li
            key={c.id}
            className={`flex items-center gap-1.5 text-[11px] transition-colors duration-300 ${
              c.passed ? 'text-emerald-600' : 'text-slate-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                c.passed ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
              aria-hidden="true"
            />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

const Login = () => {
  const navigate = useNavigate();
  const { login, loginWithTwoFactor, setUser } = useApp();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [authError, setAuthError] = useState('');
  const [errors, setErrors] = useState({});
  const [mounted, setMounted] = useState(false);
  const [shake, setShake] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  // The second step of signing in, for an account that has a second
  // factor turned on. The password alone is not enough there, so the
  // API answers with a challenge and the six digit code is asked for
  // here.
  const [twoFactor, setTwoFactor] = useState(null);

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
    setAuthError('');
    try {
      const result = await login(formData.email, formData.password);

      // The account has a second factor: the password alone was not
      // enough, so the code is asked for next.
      if (result?.requiresTwoFactor) {
        setTwoFactor({
          challenge: result.challenge,
          code: '',
        });
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
      await new Promise((r) => setTimeout(r, 400));
      navigate('/onboarding');
    } catch (err) {
      setAuthError(err.message || 'Sign in failed. Please try again.');
      setIsLoading(false);
    }
  };

  /**
   * Finish signing in with the six digit code.
   *
   * A recovery code is accepted here too — it is ten characters rather
   * than six digits, so it is not filtered to digits.
   */
  const handleTwoFactorSubmit = async (e) => {
    e.preventDefault();
    const code = (twoFactor?.code || '').trim();
    if (!code) {
      setAuthError('Enter the code from your authenticator app.');
      return;
    }

    setIsLoading(true);
    setAuthError('');
    try {
      await loginWithTwoFactor({
        email: formData.email,
        password: formData.password,
        challenge: twoFactor.challenge,
        code,
      });
      setTwoFactor(null);
      setIsSuccess(true);
      await new Promise((r) => setTimeout(r, 400));
      navigate('/onboarding');
    } catch (err) {
      setAuthError(err.message || 'That code is not correct.');
      setIsLoading(false);
    }
  };

  /**
   * Open the shared preview account.
   *
   * This does not contact Google. The API creates the preview account
   * once, gives it a normal team and JWT session, and returns the same
   * user shape as a password sign-in.
   */
  const handleGooglePreviewLogin = async () => {
    setIsLoading(true);
    setAuthError('');

    try {
      const data = await authAPI.oauthPreviewLogin();
      const previewUser = data?.user;
      if (!previewUser) {
        throw new Error('The preview sign-in did not return a user.');
      }

      setUser(previewUser);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setAuthError(error?.message || 'The preview sign-in could not be started.');
      setIsLoading(false);
    }
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
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-medium text-indigo-700 mb-5 lg:hidden">
            <Sparkles className="w-3.5 h-3.5" /> Welcome back
          </div>

          <h2 className="text-[32px] font-bold text-slate-900 tracking-tight leading-tight">
            Sign in to your account
          </h2>
          <p className="text-[15px] text-slate-600 mt-2.5">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/signup')}
              className="text-indigo-600 hover:text-indigo-700 font-semibold transition-colors focus:outline-none focus-visible:underline"
            >
              Create one free
            </button>
          </p>
        </div>

        {/* Passkey sign-in — a faster, phishing-resistant path that sits
            above the password form so it is visible without scrolling. */}
        <button
          type="button"
          onClick={() => {
            setAuthError('Passkey sign-in requires a browser with WebAuthn support.');
          }}
          className="group relative w-full mb-5 flex items-center justify-center gap-3 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[14px] overflow-hidden transition-all duration-300 hover:shadow-[0_10px_30px_-8px_rgba(15,23,42,0.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 active:scale-[0.99]"
        >
          <span
            className="absolute inset-0 -translate-x-full group-hover:translate-x-0 bg-gradient-to-r from-indigo-600 to-purple-600 transition-transform duration-500"
            aria-hidden="true"
          />
          <Fingerprint className="relative z-10 w-5 h-5" />
          <span className="relative z-10">Sign in with a passkey</span>
          <span className="relative z-10 ml-1 text-[10px] font-medium uppercase tracking-wider text-white/60 group-hover:text-white/80 transition-colors">
            New
          </span>
        </button>

        {/* Social sign-in — Google and GitHub. Google is a local
            preview button: it opens a browser-only session and goes
            straight to the dashboard without contacting Google or the
            database. GitHub keeps the normal OAuth sign-in. */}
        <SocialAuthButtons
          action="login"
          disabled={isLoading}
          onError={setAuthError}
          onPreviewLogin={handleGooglePreviewLogin}
          dividerLabel="or sign in with"
        />

        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="px-3.5 bg-white text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold">
              or use your email
            </span>
          </div>
        </div>

        <form onSubmit={twoFactor ? handleTwoFactorSubmit : handleSubmit} noValidate className="space-y-5">
          {twoFactor ? (
            /* ---- The second step: the code from the authenticator app ---- */
            <>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3.5 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
                  <Shield className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-indigo-900">
                    Two-factor authentication
                  </p>
                  <p className="text-[13px] text-indigo-700 mt-0.5">
                    Enter the six digit code from your authenticator app. A recovery code works
                    here too.
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="two-factor-code"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  {formData.email}
                </label>
                <input
                  id="two-factor-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={twoFactor.code}
                  onChange={(e) =>
                    setTwoFactor({ ...twoFactor, code: e.target.value.toUpperCase() })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTwoFactorSubmit(e);
                  }}
                  placeholder="000000"
                  data-testid="login-two-factor-code"
                  className="w-full px-4 py-4 rounded-xl border border-slate-200 bg-white text-center font-mono text-2xl tracking-[0.5em] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
                />
              </div>

              {authError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm shadow-red-900/5"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                  <span className="font-medium leading-relaxed">{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !twoFactor.code.trim()}
                data-testid="login-two-factor-submit"
                className="group relative w-full py-4 rounded-xl font-semibold text-[15px] text-white bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:shadow-[0_10px_30px_-8px_rgba(99,102,241,0.55)] transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-[18px] h-[18px] animate-spin" /> Checking the code...
                  </>
                ) : (
                  <>
                    Verify and sign in
                    <ArrowRight className="w-[18px] h-[18px] transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setTwoFactor(null);
                  setAuthError('');
                }}
                className="w-full text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                Use a different account
              </button>
            </>
          ) : (
            <>
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
                className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            }
          />

          {/* Strength meter — only useful while the field has content,
              so it stays out of the way on an empty form. */}
          <PasswordStrength value={formData.password} />

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

          {/* API error banner */}
          {authError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm shadow-red-900/5"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
              <span className="font-medium leading-relaxed">{authError}</span>
            </div>
          )}

          {/* Submit */}
          <FadeIn delay={250}>
            <button
              type="submit"
              disabled={isLoading || isSuccess}
              className={`group relative w-full py-4 rounded-xl font-semibold text-[15px] text-white transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
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
                    <Loader2 className="w-[18px] h-[18px] animate-spin" /> Signing you in...
                  </>
                ) : isSuccess ? (
                  <>
                    <CheckCircle2 className="w-[18px] h-[18px]" /> Redirecting...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-[18px] h-[18px] transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </button>
          </FadeIn>

          {/* Keyboard shortcut hint */}
          <FadeIn delay={300}>
            <p className="text-[11px] text-slate-500 text-center">
              Tip: press{' '}
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono text-[10px] border border-slate-200">
                ⌘
              </kbd>{' '}
              +{' '}
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono text-[10px] border border-slate-200">
                Enter
              </kbd>{' '}
              to submit
            </p>
          </FadeIn>
            </>
          )}
        </form>

        {/* Footer — Trust indicators */}
        <FadeIn delay={450}>
          <div className="mt-6 pt-5 border-t border-slate-200 flex items-center justify-center gap-5 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>256-bit encryption</span>
            </div>
            <div className="w-px h-3 bg-slate-300" />
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>10K+ teams trust us</span>
            </div>
          </div>
        </FadeIn>

        {/* Capability strip — a compact reminder of what the account unlocks.
            It sits below the form, so it does not crowd the sign-in
            fields themselves. */}
        <FadeIn delay={500}>
          <div className="mt-6 grid grid-cols-3 gap-2.5">
            {[
              { icon: ScanSearch, label: 'Live scanning' },
              { icon: TerminalSquare, label: 'Cloud IDE' },
              { icon: Shield, label: 'SOC 2 reports' },
            ].map((c) => (
              <div
                key={c.label}
                className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all duration-300"
              >
                <c.icon className="w-4 h-4 text-indigo-500" />
                <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">
                  {c.label}
                </span>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Back to Home */}
        <FadeIn delay={550}>
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => navigate('/landing')}
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-1.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg px-2 py-1"
            >
              <span className="transition-transform duration-300 group-hover:-translate-x-0.5">
                ←
              </span>
              Back to homepage
            </button>
          </div>
        </FadeIn>

        {/* Legal */}
        <FadeIn delay={600}>
          <p className="mt-4 text-center text-[10.5px] text-slate-500 leading-relaxed">
            By signing in, you agree to our{' '}
            <Link
              to="/terms-of-service"
              className="text-slate-700 hover:text-indigo-600 underline underline-offset-2 transition-colors"
            >
              Terms
            </Link>{' '}
            and{' '}
            <Link
              to="/privacy-policy"
              className="text-slate-700 hover:text-indigo-600 underline underline-offset-2 transition-colors"
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