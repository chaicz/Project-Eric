import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BackgroundSlideshow from '../components/BackgroundSlideshow';
import {
  ChevronRight,
  ChevronLeft,
  Shield,
  GitBranch,
  CheckCircle,
  Rocket,
  Bug,
  ScanSearch,
  Lock,
  Heart,
  SkipForward,
  Play,
  Pause,
} from 'lucide-react';

// Loading Screen Component
const LoadingScreen = () => (
  <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center z-50">
    <div className="text-center">
      <img 
        src="/Logo.png" 
        alt="Logo" 
        className="w-20 h-20 mx-auto mb-6" 
        style={{ filter: 'drop-shadow(0 10px 30px rgba(59, 130, 246, 0.5))' }} 
      />
      <p className="text-white/80 text-lg mb-4">Loading Project Eric...</p>
      <div className="flex items-center gap-2 justify-center">
        <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-3 h-3 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-3 h-3 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
);

/**
 * Every step carries two gradients.
 *
 * `gradient` is the bright one. It is used where the colour sits on a
 * dark backdrop and carries no text — the gradient-clipped subtitle and
 * the glow behind the illustration.
 *
 * `solidGradient` is the accessible one. White text and white icons are
 * drawn on top of it, so the fill has to be dark enough for them to
 * read. The bright shades sit at roughly 2.5:1 against white, which is
 * below the 4.5:1 WCAG AA threshold for text and below the 3:1
 * threshold for a meaningful icon, so the solid stops are two or three
 * shades deeper.
 */
const STEPS = [
  {
    title: 'Welcome to Project Eric',
    subtitle: 'Your Security-First IDE',
    description: 'Experience the future of secure software development. Built by security experts for developers who care about protecting their applications from day one.',
    icon: Shield,
    gradient: 'from-blue-500 to-cyan-500',
    solidGradient: 'from-blue-700 to-cyan-800',
    bgGradient: 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20',
    features: ['Enterprise-grade security', 'Real-time threat detection', 'OWASP compliance checks'],
    image: '/Onboarding1.jpg'
  },
  {
    title: 'Smart Code Analysis',
    subtitle: 'AI-Powered Security Scanning',
    description: 'Our advanced AI engine analyzes your code in real-time, identifying vulnerabilities before they reach production. Powered by machine learning trained on millions of security patterns.',
    icon: ScanSearch,
    gradient: 'from-purple-500 to-pink-500',
    solidGradient: 'from-purple-700 to-pink-800',
    bgGradient: 'bg-gradient-to-br from-purple-500/20 to-pink-500/20',
    features: ['Automatic vulnerability detection', 'Fix suggestions with code examples', 'Continuous security monitoring'],
    image: '/Onboarding2.jpg'
  },
  {
    title: 'Secure Execution',
    subtitle: 'Sandboxed Code Running',
    description: 'Run your code in a fully isolated environment with network isolation and filesystem sandboxing. Debug with confidence knowing your system is protected.',
    icon: Lock,
    gradient: 'from-emerald-500 to-teal-500',
    solidGradient: 'from-emerald-700 to-teal-700',
    bgGradient: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20',
    features: ['Isolated execution environment', 'Network sandboxing', 'Safe debugging experience'],
    image: '/Onboarding3.jpg'
  },
  {
    title: 'Built-in Git',
    subtitle: 'Version Control Simplified',
    description: 'Manage your entire development workflow without leaving the IDE. Branch, commit, merge, and collaborate with powerful Git integration.',
    icon: GitBranch,
    gradient: 'from-amber-500 to-orange-500',
    solidGradient: 'from-amber-700 to-orange-700',
    bgGradient: 'bg-gradient-to-br from-amber-500/20 to-orange-500/20',
    features: ['Visual branch management', 'One-click commits', 'Integrated pull requests'],
    image: '/Onboarding4.jpg'
  },
  {
    title: 'Ready to Build',
    subtitle: 'Start Your Secure Journey',
    description: "You're all set! Your secure development environment is ready. Join thousands of developers who trust Project Eric to build secure, reliable software.",
    icon: Rocket,
    gradient: 'from-rose-500 to-red-500',
    solidGradient: 'from-rose-700 to-red-700',
    bgGradient: 'bg-gradient-to-br from-rose-500/20 to-red-500/20',
    features: ['24/7 security monitoring', 'Community support', 'Regular security updates'],
    image: '/Onboarding5.jpg'
  }
];

const Illustration = ({ step, gradient }) => {
  return (
    <div className="relative w-full aspect-square max-w-md mx-auto">
      {/* Background Glow */}
      <div className={`absolute inset-0 bg-gradient-to-br ${step.bgGradient} rounded-full blur-3xl`} />

      {/* Main glass card — translucent so the background slideshow reads
          through, while keeping the Onboarding image fully intact inside. */}
      <div className="relative bg-white/55 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden h-full flex flex-col">
        {/* Image Container — keeps the original Onboarding1-5.jpg untouched */}
        <div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-slate-50/70 to-slate-100/70">
          <div className="relative w-full h-full">
            <img
              src={step.image}
              alt={step.title}
              className="w-full h-full object-cover rounded-xl shadow-lg"
              onLoad={(e) => {
                e.target.style.opacity = '1';
                e.target.nextSibling.style.opacity = '0';
              }}
              onError={(e) => {
                // Fallback to shield logo with gradient if image fails
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
              style={{ transition: 'opacity 0.5s ease' }}
            />
            {/* Loading skeleton */}
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100/80 to-slate-200/80 rounded-xl">
              <div className="w-32 h-32 rounded-xl bg-slate-300" />
            </div>
            {/* Fallback placeholder */}
            <div className="hidden absolute inset-0 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl">
              <img src="/Logo.png" alt="Logo" className="w-32 h-32 opacity-50" />
            </div>
          </div>
        </div>
      </div>

      {/* Floating glass tiles around the illustration card */}
      <div className="absolute -top-4 -right-4 w-16 h-16 bg-white/60 backdrop-blur-xl rounded-2xl flex items-center justify-center shadow-lg animate-bounce border border-white/50">
        <Shield className="w-8 h-8 text-blue-500" />
      </div>
      <div className="absolute -bottom-4 -left-4 w-12 h-12 bg-white/60 backdrop-blur-xl rounded-xl flex items-center justify-center shadow-lg animate-pulse border border-white/50">
        <Bug className="w-6 h-6 text-purple-500" />
      </div>
      <div className="absolute top-1/2 -right-6 w-10 h-10 bg-white/60 backdrop-blur-xl rounded-lg flex items-center justify-center shadow-lg animate-pulse border border-white/50" style={{ animationDelay: '1s' }}>
        <Lock className="w-5 h-5 text-emerald-500" />
      </div>
    </div>
  );
};

const ProgressDots = ({ total, current, onClick }) => (
  <div className="flex items-center justify-center gap-3 mb-12 px-4 py-2 bg-slate-900/40 backdrop-blur-md rounded-full border border-white/15 shadow-xl w-fit mx-auto">
    {Array.from({ length: total }).map((_, i) => (
      <button
        key={i}
        onClick={() => onClick(i)}
        className={`h-3 rounded-full transition-all duration-500 backdrop-blur-sm ${
          i === current
            ? 'w-12 bg-gradient-to-r from-blue-400 to-purple-400 shadow-lg shadow-purple-400/40'
            : i < current
              ? 'w-8 bg-gradient-to-r from-blue-300 to-cyan-300'
              : 'w-3 bg-white/40 hover:bg-white/60'
        }`}
      />
    ))}
  </div>
);

const Onboarding = () => {
  const navigate = useNavigate();
  const { completeOnboarding } = useApp();
  const [currentStep, setCurrentStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
      setTimeout(() => setShowContent(true), 200);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Auto-play functionality
  useEffect(() => {
    let interval;
    if (autoPlay && isPlaying && currentStep < STEPS.length - 1) {
      interval = setInterval(() => {
        handleNext();
      }, 5000);
    } else if (isPlaying && currentStep === STEPS.length - 1) {
      setIsPlaying(false);
      setAutoPlay(false);
    }
    return () => clearInterval(interval);
  }, [autoPlay, isPlaying, currentStep]);

  const toggleAutoPlay = () => {
    if (!isPlaying && currentStep < STEPS.length - 1) {
      setAutoPlay(true);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setIsAnimating(true);
      setShowContent(false);
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        setIsAnimating(false);
        setTimeout(() => setShowContent(true), 100);
      }, 400);
    } else {
      handleComplete();
    }
  }, [currentStep]);

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setIsAnimating(true);
      setShowContent(false);
      setTimeout(() => {
        setCurrentStep(currentStep - 1);
        setIsAnimating(false);
        setTimeout(() => setShowContent(true), 100);
      }, 400);
    }
  }, [currentStep]);

  const handleComplete = () => {
    completeOnboarding();
    navigate('/dashboard');
  };

  const handleDotClick = (index) => {
    if (index !== currentStep) {
      setIsAnimating(true);
      setShowContent(false);
      setTimeout(() => {
        setCurrentStep(index);
        setIsAnimating(false);
        setTimeout(() => setShowContent(true), 100);
      }, 400);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      else if (e.key === 'ArrowLeft') handlePrevious();
      else if (e.key === ' ' && !isLastStep) { 
        e.preventDefault(); 
        toggleAutoPlay(); 
      }
      else if (e.key === 'Escape') handleComplete();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrevious]);

  if (!mounted) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Background Slideshow using background1-12.jpg */}
      <BackgroundSlideshow interval={8000} overlayOpacity={0.35} />

      {/* Decorative glass orbs — luminous depth cues that show through
          the glass cards on top. They sit just below content but above
          the dark slideshow overlay. */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-[2]" aria-hidden="true">
        <div
          className="absolute top-[8%] left-[6%] w-80 h-80 rounded-full blur-3xl opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.55) 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-[40%] right-[8%] w-72 h-72 rounded-full blur-3xl opacity-35"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.5) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[10%] left-[12%] w-72 h-72 rounded-full blur-3xl opacity-30"
          style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.4) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[20%] right-[14%] w-64 h-64 rounded-full blur-3xl opacity-35"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.5) 0%, transparent 70%)' }}
        />
      </div>

      {/* Content Container */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="p-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Logo - no background */}
              <img 
                src="/Logo.png" 
                alt="Logo" 
                className="w-12 h-12" 
                style={{ filter: 'drop-shadow(0 4px 8px rgba(59, 130, 246, 0.3))' }} 
              />
              <div>
                <span className="text-xl font-bold text-white drop-shadow">Project Eric</span>
                <div className="text-xs text-slate-200 font-medium drop-shadow">Security Platform</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Auto-play Button */}
              {!isLastStep && (
                <button
                  onClick={toggleAutoPlay}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all backdrop-blur-md border ${
                    isPlaying
                      ? 'bg-blue-500/30 text-white border-blue-300/40 shadow-lg shadow-blue-500/20'
                      : 'text-white bg-white/10 hover:bg-white/20 border-white/20'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span className="text-sm font-medium">Auto-playing...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span className="text-sm font-medium">Auto-play</span>
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleComplete}
                className="flex items-center gap-2 text-sm text-white hover:text-slate-200 transition-colors px-4 py-2 rounded-lg hover:bg-white/10 font-medium backdrop-blur-sm"
              >
                <SkipForward className="w-4 h-4" />
                Skip tour
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center px-6 pb-12">
          <div className="max-w-7xl w-full">
            {/* Progress Dots */}
            <ProgressDots total={STEPS.length} current={currentStep} onClick={handleDotClick} />

            <div className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center transition-all duration-500 ${isAnimating ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}>
              
              {/* Left - Visual Illustration */}
              <div className="lg:sticky lg:top-12 order-2 lg:order-1">
                <Illustration step={step} gradient={step.gradient} />
              </div>

              {/* Right - Content */}
              <div className="order-1 lg:order-2">
                <div className={`transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  {/* Step Badge — glass pill with stronger blur */}
                  <div className="flex items-center gap-3 mb-6">
                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r ${step.solidGradient} text-white shadow-lg backdrop-blur-md border border-white/30`}>
                      <span className="w-2 h-2 bg-white/70 rounded-full animate-pulse" />
                      Step {currentStep + 1} of {STEPS.length}
                    </span>
                  </div>

                  {/* Title */}
                  <div className="mb-6">
                    <h1 className="text-4xl lg:text-5xl font-bold text-white mb-3 leading-tight drop-shadow-2xl">
                      {step.title}
                    </h1>
                    <h2 className={`text-2xl lg:text-3xl font-semibold bg-gradient-to-r ${step.gradient} bg-clip-text text-transparent drop-shadow-lg`}>
                      {step.subtitle}
                    </h2>
                  </div>

                  {/* Description */}
                  <p className="text-lg text-slate-100 leading-relaxed mb-8 drop-shadow-lg">
                    {step.description}
                  </p>

                  {/* Feature Cards — translucent glass with stronger blur */}
                  <div className="space-y-4 mb-8">
                    {step.features.map((feature, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-4 p-4 bg-white/55 backdrop-blur-xl rounded-2xl border border-white/50 shadow-xl hover:shadow-2xl hover:border-blue-200/80 hover:bg-white/65 transition-all duration-300"
                        style={{ animation: `fade-up 0.5s ease-out ${index * 100}ms both` }}
                      >
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${step.solidGradient} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                          <CheckCircle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          {/* The card is a light glass panel in both themes, so
                              the label stays dark. The `dark:` variant made it
                              near-white on a near-white card, which is
                              unreadable. */}
                          <h3 className="font-semibold text-slate-900 eric-text-on-light drop-shadow-sm">{feature}</h3>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Final Step - Community Stats — glass dark panel so the
                      slideshow still shows through the numbers */}
                  {isLastStep && (
                    <div className="bg-slate-900/55 backdrop-blur-2xl rounded-2xl p-6 mb-8 border border-white/20 shadow-2xl">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        {[
                          { value: '10K+', label: 'Developers' },
                          { value: '500+', label: 'Vulnerabilities Caught' },
                          { value: '99.9%', label: 'Uptime' },
                        ].map((stat, i) => (
                          <div key={i}>
                            <div className="text-2xl font-bold text-white mb-1 drop-shadow">{stat.value}</div>
                            <div className="text-xs text-white/80">{stat.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons — glass buttons with proper blur */}
                  <div className="flex items-center justify-between pt-8 border-t border-white/20">
                    <button
                      onClick={handlePrevious}
                      disabled={isFirstStep}
                      className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all backdrop-blur-md border ${
                        isFirstStep
                          ? 'text-white/40 bg-white/5 cursor-not-allowed border-white/5'
                          : 'text-white bg-white/10 hover:bg-white/20 hover:text-white border-white/20 hover:border-white/40'
                      }`}
                    >
                      <ChevronLeft className="w-5 h-5" />
                      Previous
                    </button>

                    <button
                      onClick={handleNext}
                      className={`flex items-center gap-2 px-8 py-3 rounded-xl font-semibold transition-all shadow-lg bg-gradient-to-r ${step.solidGradient} text-white hover:shadow-xl hover:scale-105 border border-white/20`}
                    >
                      {isLastStep ? (
                        <>
                          Get Started
                          <Rocket className="w-5 h-5" />
                        </>
                      ) : (
                        <>
                          Next
                          <ChevronRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                  </div>

                  {/* Keyboard Hints — glass pill container */}
                  <div className="flex items-center justify-center gap-6 text-sm text-slate-100 pt-12 px-4 py-3 bg-slate-900/40 backdrop-blur-md rounded-full border border-white/15 shadow-xl w-fit mx-auto">
                    <span className="flex items-center gap-2">
                      <kbd className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded text-xs text-white border border-white/30">←</kbd>
                      <kbd className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded text-xs text-white border border-white/30">→</kbd>
                      <span className="drop-shadow">navigate</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <kbd className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded text-xs text-white border border-white/30">Space</kbd>
                      <span className="drop-shadow">auto-play</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <kbd className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded text-xs text-white border border-white/30">Esc</kbd>
                      <span className="drop-shadow">skip</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer — glass pill with dark tint so the line still reads */}
        <footer className="py-4 text-center text-sm relative z-10">
          <p className="inline-flex items-center gap-1 px-4 py-1.5 bg-slate-900/40 backdrop-blur-md rounded-full border border-white/15 text-white/85 shadow-lg">
            © 2026 Project Eric. Built with <Heart className="w-4 h-4 inline text-rose-400 mx-1 animate-pulse" /> for secure development.
          </p>
        </footer>
      </div>

      {/* Animation Keyframes - Using global CSS */}
      <style>{`
        @keyframes fade-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Onboarding;
