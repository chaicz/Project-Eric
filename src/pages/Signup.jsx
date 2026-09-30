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
  User,
  ArrowRight,
  CheckCircle2,
  Github,
  Chrome,
  AlertCircle,
  Loader2,
  Shield,
  ScanSearch,
  KeyRound,
  Check,
  Sparkles,
  X,
  Users,
} from 'lucide-react';

const SIGNUP_FEATURES = [
  {
    icon: Shield,
    color: 'text-blue-300',
    title: 'Enterprise Security',
    desc: 'OWASP-compliant protection',
  },
  {
    icon: ScanSearch,
    color: 'text-purple-300',
    title: 'Real-time Analysis',
    desc: 'Instant vulnerability detection',
  },
  {
    icon: KeyRound,
    color: 'text-pink-300',
    title: 'Developer Tools',
    desc: 'IDE integration & APIs',
  },
];

const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'One number', test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const Signup = () => {
  const navigate = useNavigate();
  const { login, loginWithOAuth } = useApp();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [mounted, setMounted] = useState(false);
  const [shake, setShake] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!acceptTerms) {
      newErrors.terms = 'You must accept the terms to continue';
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
    await new Promise((r) => setTimeout(r, 1500));
    login(formData.email, formData.password);
    navigate('/onboarding');
  };

  const handleOAuth = async (provider) => {
    loginWithOAuth(provider);
    await new Promise((r) => setTimeout(r, 100));
    navigate('/onboarding');
  };

  const emailValid = formData.email && /\S+@\S+\.\S+/.test(formData.email);
  const passwordStrength = PASSWORD_RULES.filter((r) =>
    r.test(formData.password)
  ).length;
  const passwordsMatch =
    !!formData.confirmPassword && formData.confirmPassword === formData.password;

  const strengthConfig = {
    0: { color: 'bg-slate-200', label: '', text: 'text-slate-400' },
    1: { color: 'bg-red-500', label: 'Weak', text: 'text-red-500' },
    2: { color: 'bg-amber-500', label: 'Fair', text: 'text-amber-500' },
    3: { color: 'bg-yellow-500', label: 'Good', text: 'text-yellow-600' },
    4: {
      color: 'bg-gradient-to-r from-emerald-500 to-teal-500',
      label: 'Strong',
      text: 'text-emerald-600',
    },
  }[passwordStrength];

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      <BackgroundSlideshow interval={6000} overlayOpacity={0.35} />

      {/* LEFT — Brand */}
      <BrandPanel
        mounted={mounted}
        badgeTitle="Get started — it's free"
        heroPrefix="Build"
        heroHighlight="secure"
        heroSuffix=" apps from day one"
        description="Join thousands of developers who trust Project Eric to ship vulnerability-free code with confidence."
        features={SIGNUP_FEATURES}
      />

      {/* RIGHT — Form */}
      <FormShell mounted={mounted} shake={shake}>
        {/* Heading */}
        <div className="mb-7">
          {/* Mobile-only badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-medium text-indigo-700 mb-4 lg:hidden">
            <Sparkles className="w-3.5 h-3.5" /> Get started — it's free
          </div>

          <h2 className="text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
            Create your account
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
            >
              Sign in instead
            </button>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <AuthInput
            id="name"
            label="Full name"
            type="text"
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value });
              if (errors.name) setErrors({ ...errors, name: '' });
            }}
            onFocus={() => setFocusedField('name')}
            onBlur={() => setFocusedField(null)}
            focused={focusedField === 'name'}
            Icon={User}
            placeholder="John Smith"
            hasError={!!errors.name}
            errorMessage={errors.name}
            autoComplete="name"
            delay={100}
            shake={shake}
            shakeTrigger={!!errors.name}
          />

          {/* Email */}
          <AuthInput
            id="email"
            label="Work email"
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
            placeholder="you@company.com"
            hasError={!!errors.email}
            errorMessage={errors.email}
            isValid={emailValid}
            showValidIcon
            autoComplete="email"
            delay={150}
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
            placeholder="Min. 8 characters"
            hasError={!!errors.password}
            errorMessage={errors.password}
            autoComplete="new-password"
            delay={200}
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

          {/* Password strength meter */}
          {formData.password && (
            <div
              className="space-y-2.5 -mt-1 animate-fade-in"
              key={`strength-${passwordStrength}`}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex-1 grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-1 rounded-full transition-all duration-500 ${
                        passwordStrength >= step
                          ? strengthConfig.color
                          : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
                <span
                  className={`text-[11px] font-semibold min-w-[50px] text-right ${strengthConfig.text}`}
                >
                  {strengthConfig.label}
                </span>
              </div>
              {/* Rules checklist */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {PASSWORD_RULES.map((rule) => {
                  const passed = rule.test(formData.password);
                  return (
                    <div
                      key={rule.id}
                      className={`flex items-center gap-1.5 text-[11px] transition-colors duration-200 ${
                        passed ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full transition-colors ${
                          passed
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        {passed ? (
                          <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                        ) : (
                          <X className="w-2.5 h-2.5" strokeWidth={3} />
                        )}
                      </span>
                      <span>{rule.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Confirm Password */}
          <AuthInput
            id="confirmPassword"
            label="Confirm password"
            type={showPassword ? 'text' : 'password'}
            value={formData.confirmPassword}
            onChange={(e) => {
              setFormData({ ...formData, confirmPassword: e.target.value });
              if (errors.confirmPassword)
                setErrors({ ...errors, confirmPassword: '' });
            }}
            onFocus={() => setFocusedField('confirmPassword')}
            onBlur={() => setFocusedField(null)}
            focused={focusedField === 'confirmPassword'}
            Icon={Lock}
            placeholder="Re-enter your password"
            hasError={!!errors.confirmPassword}
            errorMessage={errors.confirmPassword}
            isValid={passwordsMatch}
            showValidIcon
            autoComplete="new-password"
            delay={250}
            shake={shake}
            shakeTrigger={!!errors.confirmPassword}
          />

          {/* Terms */}
          <FadeIn delay={300}>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  setAcceptTerms(!acceptTerms);
                  if (errors.terms) setErrors({ ...errors, terms: '' });
                }}
                className="flex items-start gap-3 text-left focus:outline-none group"
              >
                <div
                  className={`relative w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center transition-all duration-200 mt-0.5 shrink-0 ${
                    acceptTerms
                      ? 'bg-indigo-600 border-indigo-600'
                      : errors.terms
                      ? 'border-red-300 bg-red-50'
                      : 'border-slate-300 bg-white group-hover:border-indigo-400'
                  }`}
                >
                  {acceptTerms && (
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
                <span className="text-[13px] text-slate-600 leading-snug">
                  I agree to the{' '}
                  <Link
                    to="/terms-of-service"
                    className="text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
                  >
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link
                    to="/privacy-policy"
                    className="text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </span>
              </button>
              {errors.terms && (
                <p className="text-xs text-red-500 flex items-center gap-1.5 mt-1.5 ml-7">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.terms}
                </p>
              )}
            </div>
          </FadeIn>

          {/* Submit */}
          <FadeIn delay={350}>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:shadow-[0_10px_30px_-8px_rgba(99,102,241,0.55)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden shadow-lg shadow-indigo-600/20 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {isLoading && (
                <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-indigo-300 to-purple-300 animate-progress-bar" />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating your account...
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </button>
          </FadeIn>
        </form>

        {/* Divider */}
        <FadeIn delay={400}>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-white text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold">
                or sign up with
              </span>
            </div>
          </div>
        </FadeIn>

        {/* OAuth */}
        <FadeIn delay={450}>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleOAuth('github')}
              className="flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-900 hover:shadow-md transition-all duration-200 text-slate-700 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <Github className="w-[18px] h-[18px] text-slate-800" />
              <span>GitHub</span>
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              className="flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-900 hover:shadow-md transition-all duration-200 text-slate-700 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <Chrome className="w-[18px] h-[18px]" />
              <span>Google</span>
            </button>
          </div>
        </FadeIn>

        {/* Trust indicators */}
        <FadeIn delay={500}>
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-5 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>256-bit encryption</span>
            </div>
            <div className="w-px h-3 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-500" />
              <span>No credit card needed</span>
            </div>
          </div>
        </FadeIn>

        {/* Back to Home */}
        <FadeIn delay={550}>
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
      </FormShell>
    </div>
  );
};

export default Signup;