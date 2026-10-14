import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowLeft,
  Shield,
  ShieldCheck,
  Zap,
  Code2,
  CheckCircle2,
  Sparkles,
  Menu,
  X,
  Lock,
  Bot,
  AlertTriangle,
  Activity,
  FileCheck,
  Bug,
  Eye,
  GitBranch,
  ChevronRight,
  CircleDot,
  TerminalSquare,
  Star,
  Check,
} from 'lucide-react';

// ============================================================
// Custom hooks — in-view detection and count-up animation
// ============================================================
const useInView = (options = {}) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (!options.repeat) observer.unobserve(entry.target);
        } else if (options.repeat) {
          setInView(false);
        }
      },
      { threshold: options.threshold ?? 0.2, rootMargin: options.rootMargin ?? '0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [options.threshold, options.rootMargin, options.repeat]);

  return [ref, inView];
};

const useCountUp = (end, duration = 1600, start = false) => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf;
    const t0 = performance.now();
    // Parse numeric portion of strings like "99.8%", "12×", "180K+"
    const match = String(end).match(/^([\d.]+)(.*)$/);
    const target = match ? parseFloat(match[1]) : 0;
    const suffix = match ? match[2] : '';
    const step = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [end, duration, start]);
  return value;
};

// ============================================================
// Slide navigation controls: progress bar, arrows, dots, counter
// ============================================================
const SlideControls = ({ goNext, goPrev, current, total, goTo, slideLabel }) => {
  return (
    <>
      {/* Top progress bar */}
      <div className="fixed top-16 left-0 right-0 z-40 h-[2px] bg-slate-200/60 pointer-events-none overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 bg-[length:200%_auto] animate-gradient transition-all duration-700 ease-out"
          style={{ width: `${((current + 1) / total) * 100}%` }}
        />
      </div>

      {/* Side arrows (desktop only) */}
      <button
        onClick={goPrev}
        disabled={current === 0}
        aria-label="Previous slide"
        className={`hidden md:flex fixed left-6 lg:left-10 top-1/2 -translate-y-1/2 z-40 w-12 h-12 lg:w-14 lg:h-14 items-center justify-center rounded-full border border-slate-300 bg-white/80 backdrop-blur-md transition-all duration-300 ${
          current === 0
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-900 hover:bg-white hover:scale-110 hover:border-blue-500 hover:text-blue-600 shadow-lg'
        }`}
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      <button
        onClick={goNext}
        disabled={current === total - 1}
        aria-label="Next slide"
        className={`hidden md:flex fixed right-6 lg:right-10 top-1/2 -translate-y-1/2 z-40 w-12 h-12 lg:w-14 lg:h-14 items-center justify-center rounded-full border border-slate-300 bg-white/80 backdrop-blur-md transition-all duration-300 ${
          current === total - 1
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-900 hover:bg-white hover:scale-110 hover:border-blue-500 hover:text-blue-600 shadow-lg'
        }`}
      >
        <ArrowRight className="w-5 h-5" />
      </button>

      {/* Slide name (top center) */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 bg-white/80 backdrop-blur-md rounded-full border border-slate-200 text-slate-700 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] shadow-sm transition-all duration-500">
        <span className="text-blue-600 mr-2 tabular-nums transition-all duration-300">0{current + 1}</span>
        <span key={current} className="inline-block animate-fadeInUp">{slideLabel}</span>
      </div>

      {/* Bottom dots (mobile) + slide counter (desktop) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-2 bg-white/80 backdrop-blur-md rounded-full border border-slate-200 shadow-sm">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === current ? 'w-6 bg-blue-600' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Slide counter pill — top right (desktop only) */}
      <div className="fixed top-20 right-6 lg:right-10 z-40 hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-md rounded-full border border-slate-200 text-slate-900 text-xs font-mono tracking-wider shadow-sm">
        <span className="text-blue-600 font-bold">{String(current + 1).padStart(2, '0')}</span>
        <span className="text-slate-400">/</span>
        <span className="text-slate-500">{String(total).padStart(2, '0')}</span>
      </div>
    </>
  );
};

// ============================================================
// Editorial section label — Max Arden style "/TITLE"
// ============================================================
const SectionLabel = ({ label, number }) => (
  <div className="flex items-center gap-4 text-slate-900">
    <span className="text-4xl sm:text-5xl font-light text-blue-600 leading-none">{number}</span>
    <span className="text-sm sm:text-base font-bold uppercase tracking-[0.3em]">
      {label}
    </span>
  </div>
);

// ============================================================
// InteractiveWord — word-level hover micro-interactions
// Three variants:
//   - underline : draws a brand gradient underline on hover
//   - lift      : slight raise + color shift to blue gradient
//   - glow      : text-shadow glow + slight scale
// Each word is independently hoverable, so a heading feels
// responsive when the user explores it.
// ============================================================
const InteractiveWord = ({ children, variant = 'underline', className = '', as: Tag = 'span' }) => (
  <Tag
    className={[
      'inline-block relative cursor-default select-none transition-all duration-300 ease-out',
      variant === 'underline' &&
        'after:absolute after:left-0 after:bottom-0 after:h-[3px] after:w-0 after:bg-gradient-to-r after:from-blue-600 after:to-cyan-500 after:rounded-full hover:after:w-full after:transition-all after:duration-500 after:ease-out hover:text-slate-900',
      variant === 'lift' &&
        'hover:-translate-y-1 hover:text-blue-600 hover:tracking-wider',
      variant === 'glow' &&
        'hover:text-blue-600 hover:drop-shadow-[0_2px_8px_rgba(59,130,246,0.45)] hover:scale-105',
      variant === 'tilt' &&
        'hover:rotate-[-2deg] hover:scale-105 hover:text-blue-600',
      className,
    ].filter(Boolean).join(' ')}
  >
    {children}
  </Tag>
);

// ============================================================
// Slide shell — full viewport snap with light bg + accents
// ============================================================
const Slide = ({ children, variant = 'white' }) => {
  const bg =
    variant === 'white'
      ? 'bg-white'
      : variant === 'blue'
      ? 'bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 text-white'
      : variant === 'soft'
      ? 'bg-gradient-to-b from-slate-50 to-white'
      : 'bg-white';

  return (
    <section
      className={`relative w-full h-screen flex items-center justify-center overflow-hidden ${bg}`}
    >
      {/* Decorative grid lines */}
      {variant === 'white' && (
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, #0f172a 1px, transparent 1px), linear-gradient(to bottom, #0f172a 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />
      )}

      {/* Floating decorative orbs to fill the canvas */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-25 animate-drift"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.55) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[32rem] h-[32rem] rounded-full blur-3xl opacity-20 animate-drift"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.55) 0%, transparent 70%)', animationDelay: '6s' }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full blur-3xl opacity-15 animate-drift"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.55) 0%, transparent 70%)', animationDelay: '3s' }}
        />
      </div>

      <div className="relative z-10 w-full h-full flex items-center justify-center px-8 sm:px-12 lg:px-20 xl:px-24 pt-24 pb-20">
        {children}
      </div>
    </section>
  );
};

// ============================================================
// SLIDE 1: Hero — "FOR DEVELOPERS WHO SHIP SECURE CODE."
// ============================================================
const HeroSlide = ({ navigate }) => {
  return (
    <Slide variant="white">
      <div
        key="hero"
        className="w-full max-w-[88rem] mx-auto grid lg:grid-cols-12 gap-8 xl:gap-12 items-center animate-slideEnter"
      >
        {/* Left: editorial copy */}
        <div className="lg:col-span-7 relative">
          {/* Decorative accent line behind section label */}
          <div className="absolute -left-6 top-2 bottom-2 w-1 bg-gradient-to-b from-blue-500 via-cyan-400 to-blue-500 rounded-full opacity-60 animate-pulse-soft" aria-hidden="true" />

          <div className="animate-fadeInUp" style={{ animationDelay: '100ms' }}>
            <SectionLabel label="Security-first IDE" number="/" />
          </div>

          <h1 className="mt-6 font-bold text-slate-900 leading-[0.92] tracking-tight text-[16vw] sm:text-[12vw] lg:text-[9rem] xl:text-[10.5rem] 2xl:text-[12rem]">
            <span className="block animate-fadeInUp" style={{ animationDelay: '200ms' }}>
              <InteractiveWord variant="underline" className="mr-[0.15em]">SECURE</InteractiveWord>
            </span>
            <span className="block relative animate-fadeInUp" style={{ animationDelay: '320ms' }}>
              <span className="relative z-10">
                <InteractiveWord variant="tilt" className="bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
                  CODE
                </InteractiveWord>
              </span>
              <span className="absolute -right-2 top-2 sm:top-4 text-slate-900 text-[12vw] sm:text-[9vw] lg:text-8xl xl:text-9xl 2xl:text-[10rem] font-light">
                .
              </span>
            </span>
          </h1>

          <div className="mt-10 max-w-2xl animate-fadeInUp" style={{ animationDelay: '460ms' }}>
            <p className="text-lg sm:text-xl text-slate-600 leading-relaxed">
              Project Eric is the security-first IDE. Real-time vulnerability detection,
              OWASP Top 10 coverage, and an AI assistant that writes secure code alongside
              you — built into a single, blazing-fast editor.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-4 animate-fadeInUp" style={{ animationDelay: '560ms' }}>
            <button
              onClick={() => navigate('/signup')}
              className="group relative overflow-hidden inline-flex items-center gap-2.5 px-7 py-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-base rounded-xl transition-all duration-200 shadow-lg shadow-slate-900/20 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <span className="relative z-10 inline-flex items-center gap-2.5">
                Start Free Trial
                <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
              <span className="absolute inset-0 -translate-x-full group-hover:translate-x-0 bg-gradient-to-r from-blue-600 to-cyan-500 transition-transform duration-500" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="group inline-flex items-center gap-2.5 px-7 py-4 bg-white hover:bg-slate-50 text-slate-900 font-semibold text-base rounded-xl border border-slate-200 hover:border-slate-300 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200"
            >
              Sign In
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 transition-all duration-300 group-hover:w-6 group-hover:h-1.5" />
            </button>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-2 text-sm text-slate-500 animate-fadeInUp" style={{ animationDelay: '660ms' }}>
            <span className="inline-flex items-center gap-1.5 transition-colors hover:text-slate-900">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              No credit card
            </span>
            <span className="inline-flex items-center gap-1.5 transition-colors hover:text-slate-900">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              14-day Pro trial
            </span>
            <span className="inline-flex items-center gap-1.5 transition-colors hover:text-slate-900">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              SOC 2 & ISO 27001
            </span>
          </div>
        </div>

        {/* Right: IDE preview card */}
        <div className="lg:col-span-5 animate-fadeInUp" style={{ animationDelay: '400ms' }}>
          <div className="animate-float">
            <IDECard />
          </div>
        </div>
      </div>
    </Slide>
  );
};

// ============================================================
// IDE Preview card — used across slides
// ============================================================
const IDECard = () => (
  <div className="group relative rounded-2xl border border-slate-200 bg-slate-950 shadow-2xl shadow-slate-900/30 overflow-hidden text-left transition-transform duration-500 hover:scale-[1.02] hover:-rotate-1">
    {/* Subtle outer glow */}
    <div className="absolute -inset-4 bg-gradient-to-br from-blue-500/20 via-cyan-400/10 to-blue-500/20 rounded-3xl blur-2xl -z-10 group-hover:from-blue-500/40 transition-all duration-500" aria-hidden="true" />

    {/* Scanning line animation */}
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl" aria-hidden="true">
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-scan" />
    </div>

    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-slate-900/60">
      <span className="w-3 h-3 rounded-full bg-rose-400/80" />
      <span className="w-3 h-3 rounded-full bg-amber-400/80" />
      <span className="w-3 h-3 rounded-full bg-emerald-400/80" />
      <div className="ml-3 px-3 py-1 rounded-md bg-slate-800/80 text-[11px] text-slate-400 font-mono">
        eric-ide · secure-payments-api
      </div>
      <span className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        live
      </span>
    </div>

    <div className="grid grid-cols-12 min-h-[400px] sm:min-h-[480px] lg:min-h-[520px]">
      {/* Sidebar */}
      <div className="hidden sm:flex col-span-3 bg-slate-900/60 border-r border-white/10 p-3 flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 px-2 mb-1">
          Explorer
        </div>
        {[
          { icon: '📁', name: 'src' },
          { icon: '📄', name: 'auth.js', active: true },
          { icon: '📄', name: 'payments.js' },
          { icon: '📄', name: 'db.js' },
          { icon: '📁', name: 'tests' },
        ].map((f, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 px-2 py-1.5 text-[11px] font-mono rounded ${
              f.active
                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                : 'text-slate-400'
            }`}
          >
            <span>{f.icon}</span>
            <span>{f.name}</span>
          </div>
        ))}
      </div>

      {/* Editor */}
      <div className="col-span-12 sm:col-span-6 p-5 font-mono text-[12px] sm:text-[13px] leading-relaxed bg-slate-950">
        <div className="flex gap-3">
          <div className="text-slate-600 select-none text-right">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i}>{i + 12}</div>
            ))}
          </div>
          <pre className="text-slate-300 flex-1 overflow-hidden">
            <code>
              <span className="text-pink-400">async function</span>{' '}
              <span className="text-cyan-300">login</span>(email, password) {'{'}
              {'\n'}  <span className="text-pink-400">const</span> user ={' '}
              <span className="text-pink-400">await</span> db.users.find(email);
              {'\n'}
              {'\n'}  <span className="text-pink-400">if</span> (!user) {'{'}
              {'\n'}    <span className="text-rose-300 bg-rose-500/15 px-1 rounded">
                // ⚠ no rate limiting
              </span>
              {'\n'}    <span className="text-pink-400">throw new</span>{' '}
              <span className="text-cyan-300">AuthError</span>(<span className="text-emerald-300">'user_not_found'</span>);
              {'\n'}  {'}'}
              {'\n'}
              {'\n'}  <span className="text-pink-400">const</span> ok ={' '}
              <span className="text-pink-400">await</span> bcrypt.compare(password, user.hash);
              {'\n'}  <span className="text-pink-400">return</span> ok ? issueToken(user) :{' '}
              <span className="text-pink-400">null</span>;
              {'\n'}{'}'}
            </code>
          </pre>
        </div>
      </div>

      {/* Inspector */}
      <div className="hidden sm:flex col-span-3 bg-slate-900/40 border-l border-white/10 p-3 flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
          <Shield className="w-3 h-3" />
          3 issues
        </div>
        {[
          { sev: 'Critical', color: 'rose', title: 'No rate limiting', meta: 'A07' },
          { sev: 'Warning', color: 'amber', title: 'Weak password hash', meta: 'A02' },
          { sev: 'Info', color: 'blue', title: 'Add 2FA', meta: 'A07' },
        ].map((v, i) => (
          <div
            key={i}
            className={`rounded-md border p-1.5 bg-slate-950/60 ${
              v.color === 'rose'
                ? 'border-rose-500/30'
                : v.color === 'amber'
                ? 'border-amber-500/30'
                : 'border-blue-500/30'
            }`}
          >
            <span
              className={`text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${
                v.color === 'rose'
                  ? 'bg-rose-500/20 text-rose-300'
                  : v.color === 'amber'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-blue-500/20 text-blue-300'
              }`}
            >
              {v.sev}
            </span>
            <div className="text-[10px] text-slate-200 mt-1 leading-snug">{v.title}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Status bar */}
    <div className="flex items-center justify-between px-4 py-1.5 border-t border-white/10 bg-blue-600 text-white text-[10px] font-medium">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <CircleDot className="w-2.5 h-2.5" />
          main
        </span>
        <span className="hidden sm:inline-flex items-center gap-1">
          <Shield className="w-2.5 h-2.5" />3 issues
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline-flex items-center gap-1">
          <Bot className="w-2.5 h-2.5" /> Eric AI ready
        </span>
        <span>UTF-8</span>
      </div>
    </div>
  </div>
);

// ============================================================
// SLIDE 2: Real-time detection
// ============================================================
const DetectionSlide = ({ navigate }) => {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const features = [
    { icon: Eye, label: 'Data-flow aware analysis' },
    { icon: Zap, label: 'Findings in under 50ms' },
    { icon: CheckCircle2, label: 'One-click auto-fixes' },
  ];

  return (
    <Slide variant="soft">
      <div
        ref={ref}
        key="detect"
        className="w-full max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-center animate-slideEnter"
      >
        <div className="lg:col-span-5">
          <SectionLabel label="Real-time Detection" number="/" />
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-slate-900 leading-[0.95]">
            <InteractiveWord variant="lift" className="mr-[0.2em]">Find</InteractiveWord>
            <InteractiveWord variant="lift" className="mr-[0.2em]">bugs</InteractiveWord>
            <br />
            <InteractiveWord variant="tilt" className="mr-[0.2em] bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
              before
            </InteractiveWord>{' '}
            they ship.
          </h2>
          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-md leading-relaxed">
            Eric scans every keystroke against the OWASP Top 10 and your custom rules.
            Findings appear inline with one-click fixes that compile.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {features.map((b, i) => (
              <div
                key={b.label}
                className="group flex items-center gap-3 transition-all duration-500"
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateX(0)' : 'translateX(-20px)',
                  transitionDelay: `${i * 120 + 200}ms`,
                }}
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center transition-all duration-300 group-hover:bg-blue-600 group-hover:border-blue-600 group-hover:scale-110 group-hover:rotate-3">
                  <b.icon className="w-4 h-4 text-blue-600 transition-colors duration-300 group-hover:text-white" />
                </div>
                <span className="text-sm font-medium text-slate-700 transition-colors group-hover:text-slate-900">{b.label}</span>
                <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 text-xs">→</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate('/signup')}
            className="group mt-10 inline-flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/30 active:scale-[0.98]"
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateY(0)' : 'translateY(10px)',
              transition: 'all 600ms cubic-bezier(0.65, 0, 0.35, 1) 600ms',
            }}
          >
            Try on your repo
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Right: code sample */}
        <div
          className="lg:col-span-7 transition-all duration-700"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.97)',
            transitionDelay: '300ms',
          }}
        >
          <div className="group rounded-2xl border border-slate-200 bg-slate-950 overflow-hidden shadow-2xl shadow-slate-900/20 transition-all duration-500 hover:shadow-blue-500/20 hover:border-blue-500/50">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-slate-900/70">
              <div className="flex items-center gap-2">
                <TerminalSquare className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-mono text-slate-300">app.js · line 24</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                scanning
              </span>
            </div>
            <div className="relative p-5 font-mono text-[12px] sm:text-[13px] leading-relaxed">
              <div className="text-slate-500 mb-2">// Eric found a SQL injection risk</div>
              <pre className="text-slate-300">
                <code>
                  <span className="text-pink-400">const</span> query ={' '}
                  <span className="text-emerald-300">
                    `SELECT * FROM users WHERE id = ${'{'}id{'}'}`
                  </span>
                  ;{' '}
                  <span className="inline-block align-middle w-3.5 h-3.5 bg-rose-500 rounded-sm animate-pulse" />
                  {'\n'}
                  <span className="text-pink-400">await</span> db.query(query);
                </code>
              </pre>
              <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 transition-all duration-300 hover:bg-rose-500/15 hover:border-rose-500/50">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0 animate-pulse" />
                  <div>
                    <div className="text-rose-300 font-semibold text-[12px]">
                      SQL Injection · OWASP A03
                    </div>
                    <div className="text-slate-300 text-[11px] mt-0.5">
                      Untrusted input concatenated into SQL query. Use parameterized
                      queries.
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button className="group/btn px-2 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-semibold transition-all duration-200 hover:scale-105 active:scale-95">
                        Auto-fix
                      </button>
                      <button className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold transition-all duration-200 hover:scale-105 active:scale-95">
                        Learn more
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Slide>
  );
};

// ============================================================
// SLIDE 3: OWASP Coverage
// ============================================================
const OWASPSlide = () => {
  const [ref, inView] = useInView({ threshold: 0.2 });
  const items = [
    { id: 'A01', label: 'Broken Access Control' },
    { id: 'A02', label: 'Cryptographic Failures' },
    { id: 'A03', label: 'Injection' },
    { id: 'A04', label: 'Insecure Design' },
    { id: 'A05', label: 'Security Misconfiguration' },
    { id: 'A06', label: 'Vulnerable Components' },
    { id: 'A07', label: 'Auth Failures' },
    { id: 'A08', label: 'Software & Data Integrity' },
    { id: 'A09', label: 'Logging & Monitoring' },
    { id: 'A10', label: 'Server-Side Request Forgery' },
  ];

  return (
    <Slide variant="white">
      <div
        ref={ref}
        key="owasp"
        className="w-full max-w-7xl mx-auto animate-slideEnter"
      >
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <SectionLabel label="OWASP Coverage" number="/" />
            <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-slate-900 leading-[0.95]">
              <InteractiveWord variant="underline" className="mr-[0.15em]">All</InteractiveWord>
              <InteractiveWord variant="glow" className="mr-[0.15em]">10.</InteractiveWord>
              <br />
              <InteractiveWord variant="tilt" className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
                Always on.
              </InteractiveWord>
            </h2>
            <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-md leading-relaxed">
              Every release is checked against the latest OWASP Top 10. Eric ships
              audit-ready reports and custom rule authoring for whatever else you need.
            </p>
            <div className="mt-8 inline-flex items-center gap-2 text-xs font-mono text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live monitoring · last scan 2s ago
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className="group relative aspect-square rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 flex flex-col justify-between hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-500 cursor-pointer overflow-hidden"
                  style={{
                    opacity: inView ? 1 : 0,
                    transform: inView ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.9)',
                    transition: `all 500ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 70}ms`,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:to-cyan-500/5 transition-all duration-500" />
                  <div className="text-xs font-bold text-blue-600 tracking-wider relative z-10">
                    {item.id}
                  </div>
                  <Check
                    className="w-4 h-4 text-emerald-500 self-end transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12"
                    strokeWidth={3}
                  />
                  <div className="text-[10px] sm:text-[11px] font-semibold text-slate-700 leading-tight relative z-10">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Slide>
  );
};

// ============================================================
// SLIDE 4: AI Assistant
// ============================================================
const AISlide = ({ navigate }) => {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const [typed, setTyped] = useState('');
  const fullText = 'Use an overlapping key window: ship a new key, accept tokens signed with either key for 24 hours, then drop the old one.';

  // Type out the assistant's reply when the slide enters view
  useEffect(() => {
    if (!inView) {
      setTyped('');
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(fullText.slice(0, i));
      if (i >= fullText.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [inView]);

  return (
    <Slide variant="soft">
      <div
        ref={ref}
        key="ai"
        className="w-full max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-center animate-slideEnter"
      >
        <div className="lg:col-span-7 order-2 lg:order-1">
          <div
            className="rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 overflow-hidden transition-all duration-500 hover:shadow-blue-500/20 hover:-translate-y-1"
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateY(0)' : 'translateY(30px)',
              transition: 'all 700ms cubic-bezier(0.65, 0, 0.35, 1) 200ms',
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center animate-pulse-soft">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-semibold text-slate-900">Eric AI</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold uppercase tracking-wider">
                  Beta
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-500 inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                online
              </span>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-end animate-fadeInUp" style={{ animationDelay: '400ms' }}>
                <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-slate-100 text-slate-900 text-sm">
                  How do I rotate the JWT secret without logging everyone out?
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[90%] px-4 py-3 rounded-2xl rounded-tl-sm bg-blue-600 text-white text-sm">
                  <p>
                    {typed}
                    {typed.length < fullText.length && (
                      <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-white animate-blink" />
                    )}
                  </p>
                  {typed.length >= fullText.length && (
                    <div className="mt-2 rounded-md bg-slate-950/80 p-2 font-mono text-[11px] text-slate-200 leading-relaxed animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                      <span className="text-pink-400">const</span> verifier ={' '}
                      <span className="text-cyan-300">jwt</span>.
                      <span className="text-cyan-300">verify</span>(token, [KEY_NEXT, KEY_CURRENT]);
                    </div>
                  )}
                  <div className="mt-2 flex gap-2" style={{ opacity: typed.length >= fullText.length ? 1 : 0, transition: 'opacity 400ms' }}>
                    <button className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold transition-all duration-200 hover:scale-105">
                      Insert snippet
                    </button>
                    <button className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold transition-all duration-200 hover:scale-105">
                      Open docs
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 order-1 lg:order-2">
          <SectionLabel label="AI Assistant" number="/" />
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-slate-900 leading-[0.95]">
            <InteractiveWord variant="lift" className="mr-[0.2em]">Ask</InteractiveWord>
            <InteractiveWord variant="lift" className="mr-[0.2em]">in</InteractiveWord>
            <br />
            <InteractiveWord variant="tilt" className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
              plain English.
            </InteractiveWord>
          </h2>
          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-md leading-relaxed">
            Eric explains vulnerabilities, suggests fixes, and writes secure code
            alongside you. It's like pair-programming with a senior security engineer.
          </p>
          <button
            onClick={() => navigate('/signup')}
            className="group mt-8 inline-flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/30 active:scale-[0.98]"
          >
            Meet Eric AI
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </Slide>
  );
};

// ============================================================
// SLIDE 5: Threat Intelligence
// ============================================================
const ThreatSlide = () => {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const rows = [
    { sev: 'Critical', color: 'rose', id: 'CVE-2026-1842', name: 'lodash', desc: 'Prototype pollution · patched in 4.17.22' },
    { sev: 'Warning', color: 'amber', id: 'CVE-2026-0911', name: 'openssl', desc: 'Memory disclosure · upgrade to 3.4.1' },
    { sev: 'Info', color: 'blue', id: 'GHSA-xxxx', name: 'axios', desc: 'SSRF via proxy · review recommended' },
    { sev: 'Critical', color: 'rose', id: 'CVE-2026-2210', name: 'next', desc: 'Path traversal · upgrade to 14.2.5' },
    { sev: 'Warning', color: 'amber', id: 'CVE-2026-1872', name: 'django', desc: 'XSS via admin · upgrade to 5.1.4' },
  ];

  return (
    <Slide variant="white">
      <div
        ref={ref}
        key="threat"
        className="w-full max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-center animate-slideEnter"
      >
        <div className="lg:col-span-5">
          <SectionLabel label="Threat Intelligence" number="/" />
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-slate-900 leading-[0.95]">
            <InteractiveWord variant="lift" className="mr-[0.2em]">We</InteractiveWord>
            <InteractiveWord variant="lift" className="mr-[0.2em]">watch</InteractiveWord>
            <InteractiveWord variant="lift" className="mr-[0.2em]">the</InteractiveWord>
            <br />
            <InteractiveWord variant="tilt" className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
              CVE feed
            </InteractiveWord>
            <br />
            <InteractiveWord variant="underline" className="mr-[0.2em]">so</InteractiveWord>
            <InteractiveWord variant="underline" className="mr-[0.2em]">you</InteractiveWord>
            <InteractiveWord variant="underline" className="mr-[0.2em]">don't.</InteractiveWord>
          </h2>
          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-md leading-relaxed">
            Eric matches live CVE and exploit data against your dependencies. You'll
            know about a critical vulnerability before your vendor emails you.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { v: '24/7', l: 'Monitoring' },
              { v: '180K+', l: 'CVEs tracked' },
              { v: '<5m', l: 'Alert latency' },
            ].map((s, i) => (
              <div
                key={s.l}
                className="group cursor-default transition-transform duration-300 hover:-translate-y-1"
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateY(0)' : 'translateY(10px)',
                  transition: `all 500ms cubic-bezier(0.65, 0, 0.35, 1) ${i * 120 + 200}ms`,
                }}
              >
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                  {s.v}
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7">
          <div
            className="rounded-2xl border border-slate-200 bg-slate-950 overflow-hidden shadow-2xl shadow-slate-900/20 transition-all duration-500 hover:shadow-blue-500/20 hover:border-blue-500/50"
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateY(0)' : 'translateY(30px)',
              transition: 'all 700ms cubic-bezier(0.65, 0, 0.35, 1) 200ms',
            }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-slate-900/70">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-mono text-slate-300">eric-threat-feed.live</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 inline-flex items-center gap-1.5">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
                </span>
                streaming
              </span>
            </div>
            <div className="p-3 space-y-1.5">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-900/60 border border-white/5 hover:border-blue-500/50 hover:bg-slate-900 transition-all duration-300 cursor-pointer"
                  style={{
                    opacity: inView ? 1 : 0,
                    transform: inView ? 'translateX(0)' : 'translateX(20px)',
                    transition: `all 500ms cubic-bezier(0.65, 0, 0.35, 1) ${i * 100 + 400}ms`,
                  }}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      r.color === 'rose'
                        ? 'bg-rose-400 animate-pulse'
                        : r.color === 'amber'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-blue-400 animate-pulse'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 transition-transform group-hover:scale-105 ${
                      r.color === 'rose'
                        ? 'bg-rose-500/20 text-rose-300'
                        : r.color === 'amber'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {r.sev}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-200 text-sm font-mono truncate">
                      {r.id} · {r.name}
                    </div>
                    <div className="text-slate-500 text-xs truncate">{r.desc}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0 transition-all duration-300 group-hover:text-blue-400 group-hover:translate-x-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Slide>
  );
};

// ============================================================
// SLIDE 6: Stats — big editorial numbers
// ============================================================
const StatsSlide = () => {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const stats = [
    { v: '99.8%', l: 'Detection precision', s: 'Industry-leading false-positive rate' },
    { v: '12×', l: 'Faster code review', s: 'Compared to manual security audits' },
    { v: '24/7', l: 'Threat monitoring', s: 'Live CVE & exploit feed' },
  ];
  return (
    <Slide variant="white">
      <div ref={ref} key="stats" className="w-full max-w-7xl mx-auto animate-slideEnter">
        <div className="text-center mb-16">
          <SectionLabel label="By the Numbers" number="/" />
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-slate-900 leading-[0.95]">
            <InteractiveWord variant="underline" className="mr-[0.2em]">Metrics</InteractiveWord>
            <InteractiveWord variant="underline" className="mr-[0.2em]">that</InteractiveWord>
            <br />
            <InteractiveWord variant="tilt" className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
              matter.
            </InteractiveWord>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {stats.map((s, i) => (
            <StatCard key={s.l} stat={s} index={i} inView={inView} />
          ))}
        </div>
      </div>
    </Slide>
  );
};

const StatCard = ({ stat, index, inView }) => {
  const value = useCountUp(stat.v, 1600, inView);
  // Format value back to original string style
  const match = stat.v.match(/^([\d.]+)(.*)$/);
  const numericPart = match ? match[1] : '';
  const suffix = match ? match[2] : '';
  const decimals = numericPart.includes('.') ? numericPart.split('.')[1].length : 0;
  const display = decimals > 0 ? value.toFixed(decimals) : Math.round(value);

  return (
    <div
      className="group relative border-t border-slate-200 pt-6 transition-transform duration-500 hover:-translate-y-2"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(20px)',
        transition: `all 700ms cubic-bezier(0.65, 0, 0.35, 1) ${index * 150}ms`,
      }}
    >
      <div className="absolute -top-px left-0 h-px bg-gradient-to-r from-blue-500 to-cyan-500 w-0 group-hover:w-full transition-all duration-700" />
      <div className="text-[14vw] sm:text-[8vw] lg:text-[7rem] font-bold tracking-tight text-slate-900 leading-none tabular-nums">
        {display}
        {suffix}
      </div>
      <div className="mt-4 text-lg sm:text-xl font-bold text-slate-900 uppercase tracking-wider transition-colors group-hover:text-blue-600">
        {stat.l}
      </div>
      <div className="mt-1 text-sm text-slate-500">{stat.s}</div>
    </div>
  );
};

// ============================================================
// SLIDE 7: Trust bar (editorial)
// ============================================================
const TrustSlide = () => {
  const [ref, inView] = useInView({ threshold: 0.2 });

  // Each company gets a unique mark, palette and wordmark style
  // so the trust bar feels like a real customer wall instead of placeholder boxes.
  const logos = [
    {
      name: 'ACME',
      wordmark: 'ACME',
      glyph: 'diamond',
      from: 'from-slate-700',
      to: 'to-slate-900',
      accent: 'bg-amber-400',
      glyphBg: 'bg-slate-900',
    },
    {
      name: 'Northwind',
      wordmark: 'Northwind',
      glyph: 'compass',
      from: 'from-sky-500',
      to: 'to-blue-700',
      accent: 'bg-sky-300',
      glyphBg: 'bg-blue-700',
    },
    {
      name: 'Globex',
      wordmark: 'Globex',
      glyph: 'globe',
      from: 'from-emerald-500',
      to: 'to-teal-700',
      accent: 'bg-emerald-300',
      glyphBg: 'bg-emerald-700',
    },
    {
      name: 'Initech',
      wordmark: 'Initech',
      glyph: 'cube',
      from: 'from-rose-500',
      to: 'to-pink-700',
      accent: 'bg-rose-300',
      glyphBg: 'bg-rose-700',
    },
    {
      name: 'Umbrella',
      wordmark: 'Umbrella',
      glyph: 'umbrella',
      from: 'from-violet-500',
      to: 'to-purple-700',
      accent: 'bg-violet-300',
      glyphBg: 'bg-violet-700',
    },
    {
      name: 'Cyberdyne',
      wordmark: 'Cyberdyne',
      glyph: 'circuit',
      from: 'from-cyan-500',
      to: 'to-blue-700',
      accent: 'bg-cyan-300',
      glyphBg: 'bg-slate-900',
    },
    {
      name: 'Wayne',
      wordmark: 'Wayne',
      glyph: 'shield',
      from: 'from-amber-500',
      to: 'to-orange-700',
      accent: 'bg-amber-300',
      glyphBg: 'bg-slate-900',
    },
  ];

  // Tiny inline-SVG mark for each brand — keeps rendering crisp at any size
  const BrandGlyph = ({ kind }) => {
    const base = 'w-7 h-7';
    switch (kind) {
      case 'diamond':
        return (
          <svg viewBox="0 0 24 24" className={`${base} text-white`} fill="none">
            <path d="M12 2L22 12L12 22L2 12L12 2Z" fill="currentColor" />
            <path d="M12 2L22 12L12 22L2 12L12 2Z" stroke="white" strokeWidth="1.2" strokeOpacity="0.35" />
            <path d="M7 12h10M12 7v10" stroke="white" strokeOpacity="0.5" strokeWidth="0.8" />
          </svg>
        );
      case 'compass':
        return (
          <svg viewBox="0 0 24 24" className={`${base} text-white`} fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path d="M16 8L13 13L8 16L11 11L16 8Z" fill="currentColor" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" />
          </svg>
        );
      case 'globe':
        return (
          <svg viewBox="0 0 24 24" className={`${base} text-white`} fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <ellipse cx="12" cy="12" rx="4" ry="10" stroke="currentColor" strokeWidth="1.2" />
            <path d="M2 12h20" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3.5 7.5h17M3.5 16.5h17" stroke="currentColor" strokeWidth="0.9" strokeOpacity="0.7" />
          </svg>
        );
      case 'cube':
        return (
          <svg viewBox="0 0 24 24" className={`${base} text-white`} fill="none">
            <path d="M12 2L21 7V17L12 22L3 17V7L12 2Z" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 2L12 12M3 7L12 12M21 7L12 12M12 22L12 12" stroke="currentColor" strokeWidth="1.2" />
            <path d="M12 2L21 7L12 12L3 7L12 2Z" fill="currentColor" fillOpacity="0.35" />
          </svg>
        );
      case 'umbrella':
        return (
          <svg viewBox="0 0 24 24" className={`${base} text-white`} fill="none">
            <path d="M3 12C3 7 7 3 12 3C17 3 21 7 21 12H3Z" fill="currentColor" />
            <path d="M3 12C5 9 7 9 9 12M9 12C11 9 13 9 15 12M15 12C17 9 19 9 21 12" stroke="white" strokeOpacity="0.5" strokeWidth="0.9" />
            <path d="M12 12V19" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 19C10 19 9 20 9 21" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        );
      case 'circuit':
        return (
          <svg viewBox="0 0 24 24" className={`${base} text-white`} fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="7" cy="7" r="1.4" fill="currentColor" />
            <circle cx="17" cy="7" r="1.4" fill="currentColor" />
            <circle cx="7" cy="17" r="1.4" fill="currentColor" />
            <circle cx="17" cy="17" r="1.4" fill="currentColor" />
            <circle cx="12" cy="12" r="1.8" fill="currentColor" />
            <path d="M12 12L7 7M12 12L17 7M12 12L7 17M12 12L17 17" stroke="currentColor" strokeWidth="1" />
          </svg>
        );
      case 'shield':
        return (
          <svg viewBox="0 0 24 24" className={`${base} text-white`} fill="none">
            <path d="M12 2L20 5V11C20 16 16 20 12 22C8 20 4 16 4 11V5L12 2Z" fill="currentColor" />
            <path d="M9 12L11 14L15 10" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <Slide variant="white">
      <div ref={ref} key="trust" className="w-full max-w-7xl mx-auto animate-slideEnter">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <SectionLabel label="Trusted by" number="/" />
            <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-slate-900 leading-[0.95]">
              <InteractiveWord variant="underline" className="mr-[0.2em]">Teams</InteractiveWord>
              <InteractiveWord variant="underline" className="mr-[0.2em]">that</InteractiveWord>
              <br />
              <InteractiveWord variant="lift" className="mr-[0.2em]">ship</InteractiveWord>{' '}
              <InteractiveWord variant="tilt" className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
                secure code.
              </InteractiveWord>
            </h2>
            <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-md leading-relaxed">
              From fintech startups to Fortune 500s — engineering teams trust Eric to
              protect their codebases.
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {logos.map((b, i) => (
              <div
                key={b.name}
                className="group relative aspect-[3/2] flex items-center justify-center gap-2.5 px-3 border border-slate-200 rounded-xl bg-white hover:border-transparent hover:-translate-y-1 transition-all duration-500 cursor-pointer overflow-hidden"
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateY(0) scale(1)' : 'translateY(15px) scale(0.95)',
                  transition: `all 500ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 60}ms`,
                }}
              >
                {/* Hover background — gradient glow that fades in */}
                <div
                  className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${b.from} ${b.to}`}
                  aria-hidden="true"
                />
                {/* Subtle accent line that draws in on hover */}
                <div className={`absolute bottom-0 left-0 h-0.5 w-0 group-hover:w-full ${b.accent} transition-all duration-500`} />
                {/* Shimmer sweep on hover */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                  aria-hidden="true"
                >
                  <div className="absolute inset-y-0 -left-1/2 w-1/3 bg-white/15 skew-x-12 group-hover:left-full transition-transform duration-1000 ease-out" />
                </div>

                <div className={`relative w-9 h-9 rounded-lg ${b.glyphBg} flex items-center justify-center shadow-md group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 ring-1 ring-white/10`}>
                  <BrandGlyph kind={b.glyph} />
                </div>
                <span className="relative text-sm font-bold tracking-tight text-slate-700 group-hover:text-white transition-colors duration-500">
                  {b.wordmark}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Slide>
  );
};

// ============================================================
// SLIDE 8: Pricing
// ============================================================
const PricingSlide = ({ navigate }) => {
  const [ref, inView] = useInView({ threshold: 0.2 });
  const tiers = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      desc: 'For solo developers and side projects',
      cta: 'Get started',
      features: [
        'Up to 3 projects',
        'OWASP Top 10 scanning',
        'Inline vulnerability alerts',
        'Eric AI · 100 req/mo',
        'Community support',
      ],
      highlight: false,
    },
    {
      name: 'Pro',
      price: '$29',
      period: 'per dev / month',
      desc: 'For teams that ship every day',
      cta: 'Start 14-day trial',
      features: [
        'Unlimited projects',
        'Full CWE + custom rules',
        'Eric AI · unlimited',
        'Threat intelligence feed',
        'Audit-ready reports',
        'Priority support',
      ],
      highlight: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: 'volume pricing',
      desc: 'For organizations with strict requirements',
      cta: 'Talk to sales',
      features: [
        'Everything in Pro',
        'Self-hosted runners',
        'SOC 2 / ISO 27001 reports',
        'SAML SSO & SCIM',
        'Dedicated security engineer',
        'Custom SLAs',
      ],
      highlight: false,
    },
  ];

  return (
    <Slide variant="white">
      <div ref={ref} key="pricing" className="w-full max-w-7xl mx-auto animate-slideEnter">
        <div className="text-center mb-14">
          <SectionLabel label="Pricing" number="/" />
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-slate-900 leading-[0.95]">
            <InteractiveWord variant="underline" className="mr-[0.2em]">Simple</InteractiveWord>
            <InteractiveWord variant="underline" className="mr-[0.2em]">plans.</InteractiveWord>
            <br />
            <InteractiveWord variant="tilt" className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
              Powerful protection.
            </InteractiveWord>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 max-w-5xl mx-auto">
          {tiers.map((t, i) => (
            <div
              key={t.name}
              className={`group relative rounded-2xl border p-6 sm:p-8 flex flex-col transition-all duration-500 hover:-translate-y-2 ${
                t.highlight
                  ? 'border-slate-900 bg-slate-900 text-white shadow-2xl scale-[1.02] md:scale-105 hover:shadow-cyan-500/30 overflow-hidden'
                  : 'border-slate-200 bg-white text-slate-900 hover:shadow-xl hover:border-blue-500'
              }`}
              style={{
                opacity: inView ? 1 : 0,
                transform: inView
                  ? `${t.highlight ? 'translateY(0) scale(1.02) md:scale-105' : 'translateY(0) scale(1)'}`
                  : 'translateY(30px) scale(0.95)',
                transition: `all 600ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 120}ms`,
              }}
            >
              {t.highlight && (
                <>
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg z-20 animate-pulse-soft">
                    Most popular
                  </span>
                  <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden" aria-hidden="true">
                    <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                  </div>
                </>
              )}
              <h3 className="text-lg font-bold relative z-10">{t.name}</h3>
              <p
                className={`text-sm mt-1 relative z-10 ${
                  t.highlight ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {t.desc}
              </p>
              <div className="mt-5 flex items-baseline gap-1.5 relative z-10">
                <span className="text-4xl sm:text-5xl font-bold tracking-tight">
                  {t.price}
                </span>
                <span
                  className={`text-sm ${
                    t.highlight ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {t.period}
                </span>
              </div>
              <ul className="mt-6 space-y-2.5 flex-1 relative z-10">
                {t.features.map((f, fi) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm transition-transform duration-300 hover:translate-x-1"
                    style={{
                      opacity: inView ? 1 : 0,
                      transition: `opacity 400ms ${i * 120 + 400 + fi * 50}ms`,
                    }}
                  >
                    <Check
                      className={`w-4 h-4 mt-0.5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110 ${
                        t.highlight ? 'text-cyan-300' : 'text-blue-600'
                      }`}
                      strokeWidth={3}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate('/signup')}
                className={`mt-7 w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300 active:scale-[0.98] relative z-10 ${
                  t.highlight
                    ? 'bg-white hover:bg-slate-100 text-slate-900 hover:shadow-lg hover:shadow-white/20'
                    : 'bg-slate-900 hover:bg-slate-800 text-white hover:shadow-lg'
                }`}
              >
                {t.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
};

// ============================================================
// SLIDE 9: Team — landscape background with real team data
// ============================================================
const TeamSlide = () => {
  const [ref, inView] = useInView({ threshold: 0.2 });
  // URL-encode for spaces / special chars in the background image filename.
  const bgImage = encodeURI('/b536bf44245f1a0777494187ea3b173a (1).jpg');
  const photo = (file) => encodeURI(`/${file}`);

  const team = [
    {
      name: 'Eric Tze Wei Voon',
      studentId: '104399883',
      role: 'Project Leader / Frontend Developer',
      photo: photo('Eric Tze Wei Voon.png'),
      avatar: 'ET',
    },
    {
      name: 'Gloria Arroyo Dabin',
      studentId: '104398314',
      role: 'Security / Semgrep / AI-LLM Developer',
      photo: photo('Gloria Arroyo Dabin.png'),
      avatar: 'GA',
    },
    {
      name: 'Alvin Thomas Egat Anak Peter',
      studentId: '104398217',
      role: 'Frontend / UI-UX & Documentation',
      photo: photo('Alvin Thomas Egat Anak Peter.png'),
      avatar: 'AT',
    },
    {
      name: 'Nuur Ashya Lara Binti Araman',
      studentId: '102789246',
      role: 'Security / Semgrep / Testing & Evaluation',
      photo: photo('Nuur Ashya LaraBinti Araman.png'),
      avatar: 'NA',
    },
    {
      name: 'Cheng Zu Chai',
      studentId: '106765596',
      role: 'Backend Developer / Security / Semgrep',
      photo: photo('Cheng Zu Chai.png'),
      avatar: 'CZ',
    },
  ];

  return (
    <section className="relative w-full h-screen flex items-center justify-center overflow-hidden">
      {/* Landscape background image — full bleed, slow zoom on entry */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat animate-bgZoom"
        style={{ backgroundImage: `url('${bgImage}')` }}
        aria-hidden="true"
      />
      {/* Dark overlay for legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-900/70 to-slate-950/85" aria-hidden="true" />
      {/* Subtle grid texture on top */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
        aria-hidden="true"
      />
      {/* Drifting light orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full blur-3xl opacity-20 bg-cyan-500 animate-drift" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full blur-3xl opacity-20 bg-blue-500 animate-drift" style={{ animationDelay: '4s' }} />
      </div>

      <div ref={ref} className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 pt-24 pb-20 animate-slideEnter">
        <div className="text-center mb-10 sm:mb-14">
          <div className="flex items-center justify-center gap-3 text-white">
            <span className="text-3xl sm:text-4xl font-light text-cyan-300 animate-pulse-soft">/</span>
            <span className="text-xs sm:text-sm font-bold uppercase tracking-[0.3em]">
              About the Team
            </span>
          </div>
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight text-white leading-[0.95]">
            <InteractiveWord variant="lift" className="mr-[0.2em] text-white">People</InteractiveWord>
            <InteractiveWord variant="lift" className="mr-[0.2em] text-white">who</InteractiveWord>
            <InteractiveWord variant="lift" className="mr-[0.2em] text-white">care</InteractiveWord>
            <br />
            <InteractiveWord variant="tilt" className="bg-gradient-to-r from-cyan-300 via-blue-200 to-cyan-300 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
              about secure code.
            </InteractiveWord>
          </h2>
          <p className="mt-5 text-lg sm:text-xl text-slate-200/90 max-w-2xl mx-auto leading-relaxed">
            A small group of security engineers and designers building the tools
            we wish we had — one keystroke at a time.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6 max-w-6xl mx-auto">
          {team.map((m, i) => (
            <div
              key={m.name}
              className="group relative rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-4 sm:p-5 text-center hover:border-cyan-300/60 hover:-translate-y-2 hover:bg-white/15 transition-all duration-500 shadow-xl shadow-black/30 cursor-pointer overflow-hidden"
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? 'translateY(0)' : 'translateY(30px)',
                transition: `all 600ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 90}ms`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-blue-500/0 group-hover:from-cyan-500/10 group-hover:to-blue-500/10 transition-all duration-500" />
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 lg:w-36 lg:h-36 mx-auto rounded-2xl overflow-hidden ring-2 ring-white/40 shadow-xl shadow-black/40 group-hover:ring-cyan-300/80 group-hover:scale-105 transition-all duration-500">
                <img
                  src={m.photo}
                  alt={m.name}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    e.currentTarget.nextElementSibling?.classList.add('flex');
                  }}
                />
                <div className="hidden w-full h-full items-center justify-center bg-gradient-to-br from-blue-500 to-cyan-500 text-white text-2xl font-bold">
                  {m.avatar}
                </div>
              </div>
              <h3 className="mt-3 sm:mt-4 text-sm sm:text-base font-bold text-white leading-tight relative z-10">
                {m.name}
              </h3>
              <p className="mt-1.5 text-[10px] sm:text-[11px] font-semibold text-cyan-200 uppercase tracking-wider leading-snug relative z-10">
                {m.role}
              </p>
              {m.studentId && (
                <p className="mt-1 text-[10px] font-mono text-slate-300/70 relative z-10">
                  {m.studentId}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ============================================================
// SLIDE 10: CTA
// ============================================================
const CTASlide = ({ navigate }) => {
  return (
    <Slide variant="blue">
      <div key="cta" className="w-full max-w-5xl mx-auto text-center animate-slideEnter">
        <SectionLabel label="Get Started" number="/" />

        <h2 className="mt-8 text-[12vw] sm:text-[9vw] lg:text-[8rem] xl:text-[9rem] font-bold tracking-tight text-white leading-[0.95]">
          <span className="block animate-fadeInUp" style={{ animationDelay: '100ms' }}>
            <InteractiveWord variant="glow" className="text-white mr-[0.15em]">START</InteractiveWord>
          </span>
          <span className="block animate-fadeInUp" style={{ animationDelay: '220ms' }}>
            <InteractiveWord variant="tilt" className="bg-gradient-to-r from-cyan-300 via-white to-blue-200 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
              SHIPPING
            </InteractiveWord>
          </span>
          <span className="block animate-fadeInUp" style={{ animationDelay: '340ms' }}>
            <InteractiveWord variant="glow" className="text-white">SECURE CODE.</InteractiveWord>
          </span>
        </h2>

        <p className="mt-8 text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto leading-relaxed animate-fadeInUp" style={{ animationDelay: '480ms' }}>
          Free to start. No credit card required. 14-day Pro trial with full access to
          every feature.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fadeInUp" style={{ animationDelay: '600ms' }}>
          <button
            onClick={() => navigate('/signup')}
            className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-white hover:bg-slate-50 text-slate-900 font-bold rounded-xl transition-all duration-200 shadow-2xl hover:-translate-y-0.5 hover:shadow-cyan-500/40 active:scale-[0.98] overflow-hidden"
          >
            <span className="relative z-10 inline-flex items-center gap-2">
              Start free trial
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </span>
            <span className="absolute inset-0 bg-gradient-to-r from-cyan-200 via-white to-cyan-200 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </button>
          <button
            onClick={() => navigate('/login')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl border border-white/30 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
          >
            Sign In
          </button>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-blue-100 animate-fadeInUp" style={{ animationDelay: '720ms' }}>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> No credit card
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> 14-day Pro trial
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Cancel anytime
          </span>
        </div>
      </div>
    </Slide>
  );
};

// ============================================================
// Header (fixed, minimal)
// ============================================================
const Header = ({ navigate, currentSlide }) => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: 'Detection', idx: 1 },
    { label: 'OWASP', idx: 2 },
    { label: 'AI', idx: 3 },
    { label: 'Threats', idx: 4 },
    { label: 'Stats', idx: 5 },
    { label: 'Pricing', idx: 7 },
  ];

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/85 backdrop-blur-xl border-b border-slate-200/80 shadow-sm'
          : 'bg-white/40 backdrop-blur-md border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-2.5 group"
          >
            <img
              src="/Logo.png"
              alt="Project Eric"
              className="w-8 h-8 rounded-lg object-contain transition-transform group-hover:scale-110"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling.style.display = 'flex';
              }}
            />
            <div
              className="hidden w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 items-center justify-center shadow-md shadow-blue-500/30"
              style={{ display: 'none' }}
            >
              <ShieldCheck className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900">
              Project Eric
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <a
                key={l.label}
                href={`#${l.idx}`}
                onClick={(e) => {
                  e.preventDefault();
                  const slide = document.querySelector(`[data-slide-index="${l.idx}"]`);
                  if (slide)
                    slide.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                  currentSlide === l.idx
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/login')}
              className="hidden sm:inline-flex text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
            >
              Get Started
            </button>
            <button
              className="md:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ${
            open ? 'max-h-72 pb-4' : 'max-h-0'
          }`}
        >
          <div className="flex flex-col gap-1 pt-2 border-t border-slate-200/80">
            {links.map((l) => (
              <a
                key={l.label}
                href={`#${l.idx}`}
                onClick={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  const slide = document.querySelector(
                    `[data-slide-index="${l.idx}"]`
                  );
                  if (slide)
                    slide.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                {l.label}
              </a>
            ))}
            <button
              onClick={() => {
                setOpen(false);
                navigate('/login');
              }}
              className="text-left px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

// ============================================================
// Main Page
// ============================================================
const Landing = () => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const slidesRef = useRef([]);

  const slides = [
    { id: 'hero', name: 'Intro' },
    { id: 'detection', name: 'Detection' },
    { id: 'owasp', name: 'OWASP' },
    { id: 'ai', name: 'AI Assistant' },
    { id: 'threat', name: 'Threats' },
    { id: 'stats', name: 'By the Numbers' },
    { id: 'trust', name: 'Trusted by' },
    { id: 'pricing', name: 'Pricing' },
    { id: 'team', name: 'About the Team' },
    { id: 'cta', name: 'Get Started' },
  ];
  const totalSlides = slides.length;

  // Track current slide based on scroll position
  useEffect(() => {
    const observers = [];
    slidesRef.current.forEach((el, idx) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
              setCurrentSlide(idx);
            }
          });
        },
        { threshold: [0.55] }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const goTo = useCallback(
    (index) => {
      const el = slidesRef.current[index];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    []
  );

  const goNext = useCallback(
    () => goTo(Math.min(currentSlide + 1, totalSlides - 1)),
    [currentSlide, totalSlides, goTo]
  );
  const goPrev = useCallback(
    () => goTo(Math.max(currentSlide - 1, 0)),
    [currentSlide, goTo]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Home') {
        goTo(0);
      } else if (e.key === 'End') {
        goTo(totalSlides - 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, goTo, totalSlides]);

  // Touch / swipe
  useEffect(() => {
    let startY = 0;
    const onStart = (e) => {
      startY = e.touches ? e.touches[0].clientY : e.clientY;
    };
    const onEnd = (e) => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      const dy = t.clientY - startY;
      if (Math.abs(dy) > 80) {
        if (dy < 0) goNext();
        else goPrev();
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [goNext, goPrev]);

  // Wheel: one slide per deliberate scroll
  useEffect(() => {
    let lock = false;
    const onWheel = (e) => {
      if (lock) return;
      if (Math.abs(e.deltaY) > 30) {
        lock = true;
        if (e.deltaY > 0) goNext();
        else goPrev();
        setTimeout(() => {
          lock = false;
        }, 800);
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [goNext, goPrev]);

  return (
    <div className="relative bg-white text-slate-900 snap-container">
      <Header navigate={navigate} currentSlide={currentSlide} />

      <SlideControls
        goNext={goNext}
        goPrev={goPrev}
        current={currentSlide}
        total={totalSlides}
        goTo={goTo}
        slideLabel={slides[currentSlide]?.name}
      />

      {/* Slide 1 — Hero */}
      <div
        ref={(el) => (slidesRef.current[0] = el)}
        data-slide-index="0"
        className="snap-slide"
      >
        <HeroSlide navigate={navigate} />
      </div>

      {/* Slide 2 — Detection */}
      <div
        ref={(el) => (slidesRef.current[1] = el)}
        data-slide-index="1"
        className="snap-slide"
      >
        <DetectionSlide navigate={navigate} />
      </div>

      {/* Slide 3 — OWASP */}
      <div
        ref={(el) => (slidesRef.current[2] = el)}
        data-slide-index="2"
        className="snap-slide"
      >
        <OWASPSlide />
      </div>

      {/* Slide 4 — AI */}
      <div
        ref={(el) => (slidesRef.current[3] = el)}
        data-slide-index="3"
        className="snap-slide"
      >
        <AISlide navigate={navigate} />
      </div>

      {/* Slide 5 — Threat */}
      <div
        ref={(el) => (slidesRef.current[4] = el)}
        data-slide-index="4"
        className="snap-slide"
      >
        <ThreatSlide />
      </div>

      {/* Slide 6 — Stats */}
      <div
        ref={(el) => (slidesRef.current[5] = el)}
        data-slide-index="5"
        className="snap-slide"
      >
        <StatsSlide />
      </div>

      {/* Slide 7 — Trust */}
      <div
        ref={(el) => (slidesRef.current[6] = el)}
        data-slide-index="6"
        className="snap-slide"
      >
        <TrustSlide />
      </div>

      {/* Slide 8 — Pricing */}
      <div
        ref={(el) => (slidesRef.current[7] = el)}
        data-slide-index="7"
        className="snap-slide"
      >
        <PricingSlide navigate={navigate} />
      </div>

      {/* Slide 9 — Team */}
      <div
        ref={(el) => (slidesRef.current[8] = el)}
        data-slide-index="8"
        className="snap-slide"
      >
        <TeamSlide />
      </div>

      {/* Slide 10 — CTA */}
      <div
        ref={(el) => (slidesRef.current[9] = el)}
        data-slide-index="9"
        className="snap-slide"
      >
        <CTASlide navigate={navigate} />
      </div>

      <style>{`
        /* Snap scrolling — each slide is exactly one viewport tall. */
        html, body {
          scroll-snap-type: y mandatory;
          scroll-behavior: smooth;
          overscroll-behavior: none;
        }
        .snap-slide {
          scroll-snap-align: start;
          scroll-snap-stop: always;
        }

        /* ===== Entry animation ===== */
        @keyframes slideEnter {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideEnter {
          animation: slideEnter 600ms cubic-bezier(0.65, 0, 0.35, 1) both;
        }

        /* ===== Staggered fade-in-up (used across slides) ===== */
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeInUp {
          animation: fadeInUp 700ms cubic-bezier(0.65, 0, 0.35, 1) both;
        }

        /* ===== Floating motion (used on hero IDE card) ===== */
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0); }
          50%      { transform: translateY(-10px) rotate(0.3deg); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }

        /* ===== Drifting orbs (background ambience) ===== */
        @keyframes drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(40px, -30px) scale(1.08); }
          66%      { transform: translate(-30px, 25px) scale(0.95); }
        }
        .animate-drift {
          animation: drift 14s ease-in-out infinite;
        }

        /* ===== Subtle pulsing (highlighted pills, accent lines) ===== */
        @keyframes pulseSoft {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }
        .animate-pulse-soft {
          animation: pulseSoft 2.4s ease-in-out infinite;
        }

        /* ===== Animated gradient text shift ===== */
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          animation: gradientShift 6s ease infinite;
        }

        /* ===== IDE scanning line ===== */
        @keyframes scan {
          0%   { top: -2px;   opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 100%;   opacity: 0; }
        }
        .animate-scan {
          animation: scan 3.2s linear infinite;
        }

        /* ===== Pricing card shimmer (highlighted Pro tier) ===== */
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 3.5s ease-in-out infinite;
        }

        /* ===== AI chat cursor blink ===== */
        @keyframes blink {
          0%, 49%   { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 0.9s steps(2) infinite;
        }

        /* ===== Team background slow zoom ===== */
        @keyframes bgZoom {
          0%   { transform: scale(1); }
          100% { transform: scale(1.08); }
        }
        .animate-bgZoom {
          animation: bgZoom 20s ease-out both;
        }

        /* ===== CTA background gradient shift (subtle) ===== */
        @keyframes slideEnterSlow {
          from { opacity: 0; transform: scale(0.98); }
          to   { opacity: 1; transform: scale(1); }
        }

        /* Custom scrollbar — light, fits white theme */
        ::-webkit-scrollbar {
          width: 0;
          background: transparent;
        }
      `}</style>
    </div>
  );
};

export default Landing;
