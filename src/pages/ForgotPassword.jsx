import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  KeyRound, 
  Mail, 
  Lock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Shield,
  Keyboard,
  Sparkles
} from 'lucide-react';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [step, setStep] = useState(1); // 1: email input, 2: email sent
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const validateEmail = (email) => {
    return /\S+@\S+\.\S+/.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsLoading(false);
    setSuccess(true);
    setStep(2);
  };

  const handleResendEmail = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex">
      {/* Left Panel - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 bg-white dark:bg-slate-900 relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Gradient Orbs */}
          <div 
            className="absolute w-[500px] h-[500px] rounded-full opacity-30 animate-float-1" 
            style={{ 
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, transparent 70%)', 
              top: '-100px', 
              left: '-100px' 
            }} 
          />
          <div 
            className="absolute w-[400px] h-[400px] rounded-full opacity-25 animate-float-2" 
            style={{ 
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.5) 0%, transparent 70%)', 
              bottom: '-50px', 
              right: '-50px' 
            }} 
          />
          <div 
            className="absolute w-[300px] h-[300px] rounded-full opacity-20 animate-float-3" 
            style={{ 
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, transparent 70%)', 
              top: '40%', 
              right: '20%' 
            }} 
          />
          {/* Subtle Grid Pattern */}
          <div 
            className="absolute inset-0 opacity-[0.05]" 
            style={{
              backgroundImage: `linear-gradient(rgba(100,116,139,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.6) 1px, transparent 1px)`,
              backgroundSize: '40px 40px'
            }} 
          />
        </div>

        {/* Content */}
        <div className={`relative z-10 flex flex-col justify-center px-16 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 mb-16">
            <img src="/Logo.png" alt="Logo" className="w-12 h-12" />
            <div>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">Project Eric</span>
              <div className="text-xs text-slate-400 dark:text-slate-500">Security Platform</div>
            </div>
          </Link>

          {/* Main Text */}
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-500/15 rounded-full mb-6">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Secure Password Recovery</span>
            </div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 leading-tight mb-4">
              Reset Your<br />
              <span className="text-blue-600 dark:text-blue-400">Password</span>
            </h1>
            <p className="text-lg text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
              Don't worry, we've got you covered. Enter your email and we'll send you a secure link to reset your password.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-4">
            {[
              { title: 'Secure Reset Link', desc: 'Time-limited, single-use recovery links' },
              { title: 'Email Verification', desc: 'Additional verification for your security' },
              { title: 'Quick Recovery', desc: 'Get back to securing your code in minutes' },
            ].map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">{feature.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{feature.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative Circle */}
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-gradient-to-br from-blue-100 to-slate-100 dark:from-blue-950 dark:to-slate-900 rounded-full opacity-50" />
        <div className="absolute -bottom-48 -right-48 w-[500px] h-[500px] border border-slate-100 dark:border-slate-800 rounded-full" />
      </div>

      {/* Right Panel - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-8 bg-transparent dark:bg-slate-950/60">
        {/* Mobile Logo */}
        <div className="absolute top-6 left-6 flex items-center gap-2 lg:hidden">
          <img src="/Logo.png" alt="Logo" className="w-10 h-10" />
          <span className="text-lg font-bold text-slate-900 dark:text-slate-100">Project Eric</span>
        </div>

        {/* Form */}
        <div className={`w-full max-w-md transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>

          {/* Back Button */}
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-8 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back to login</span>
          </button>

          {step === 1 ? (
            <>
              {/* Step 1: Email Input */}
              <div className="mb-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-6 shadow-lg shadow-blue-500/30">
                  <KeyRound className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Forgot your password?</h2>
                <p className="text-slate-500 dark:text-slate-400">
                  No worries, we'll send you a secure reset link. Enter your email address below.
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {/* Email Input */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError('');
                      }}
                      className={`w-full pl-12 pr-4 py-3 rounded-xl border ${
                        error
                          ? 'border-red-300 bg-red-50 dark:border-red-500/60 dark:bg-red-500/10'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                      } text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20`}
                      placeholder="name@company.com"
                      autoFocus
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {error}
                    </p>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending reset link...
                    </>
                  ) : (
                    <>
                      <Mail className="w-5 h-5" />
                      Send Reset Link
                    </>
                  )}
                </button>
              </form>

              {/* Help Text */}
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-100 dark:border-blue-500/30">
                <div className="flex items-start gap-3">
                  <Keyboard className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-200 mb-1">Remember your password?</p>
                    <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
                      Sign in instead
                    </Link>
                  </div>
                </div>
              </div>

            </>
          ) : (
            <>
              {/* Step 2: Email Sent */}
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Check your email!</h2>
                <p className="text-slate-500 mb-6">
                  We've sent a password reset link to <span className="font-medium text-slate-700">{email}</span>
                </p>

                {/* Email Preview Card */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mb-6 text-left">
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100 dark:border-slate-700">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                      <img src="/Logo.png" alt="Logo" className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">Project Eric</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">security@project-eric.com</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                    We received a request to reset your password. Click the button below to create a new password.
                  </p>
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl py-3 px-4 text-center">
                    <span className="text-white font-semibold text-sm">Reset Password</span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
                    This link will expire in 1 hour for your security.
                  </p>
                </div>

                {/* Didn't receive email */}
                <div className="space-y-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Didn't receive the email? Check your spam folder or:
                  </p>
                  <button
                    onClick={handleResendEmail}
                    disabled={isLoading}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-sm flex items-center gap-2 mx-auto disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        Resend email
                      </>
                    )}
                  </button>
                </div>

                {/* Back to login */}
                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700">
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 font-medium transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Sign In
                  </Link>
                </div>
              </div>
            </>
          )}

          {/* Footer Links */}
          <div className="mt-8 flex items-center justify-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <Link to="/terms-of-service" className="hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              Terms
            </Link>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <Link to="/privacy-policy" className="hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
