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
// Slide navigation controls: progress bar, arrows, dots, counter
// ============================================================
const SlideControls = ({ goNext, goPrev, current, total, goTo, slideLabel }) => {
  return (
    <>
      {/* Top progress bar */}
      <div className="fixed top-16 left-0 right-0 z-40 h-[2px] bg-slate-200/60 pointer-events-none">
        <div
          className="h-full bg-blue-600 transition-all duration-700 ease-out"
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
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 bg-white/80 backdrop-blur-md rounded-full border border-slate-200 text-slate-700 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] shadow-sm">
        <span className="text-blue-600 mr-2">0{current + 1}</span>
        {slideLabel}
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
  <div className="flex items-center gap-3 text-slate-900">
    <span className="text-3xl sm:text-4xl font-light text-blue-600">{number}</span>
    <span className="text-xs sm:text-sm font-bold uppercase tracking-[0.3em]">
      {label}
    </span>
  </div>
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
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, #0f172a 1px, transparent 1px), linear-gradient(to bottom, #0f172a 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      )}
      <div className="relative z-10 w-full h-full flex items-center justify-center px-6 sm:px-10 lg:px-16 pt-24 pb-20">
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
        className="w-full max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-center animate-slideEnter"
      >
        {/* Left: editorial copy */}
        <div className="lg:col-span-7">
          <SectionLabel label="Security-first IDE" number="/" />

          <h1 className="mt-6 font-bold text-slate-900 leading-[0.95] tracking-tight text-[14vw] sm:text-[10vw] lg:text-[7.5rem] xl:text-[8.5rem]">
            <span className="block">SECURE</span>
            <span className="block relative">
              <span className="relative z-10 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 bg-clip-text text-transparent">
                CODE
              </span>
              <span className="absolute -right-2 top-2 sm:top-4 text-slate-900 text-[10vw] sm:text-[7vw] lg:text-7xl xl:text-8xl font-light">
                .
              </span>
            </span>
          </h1>

          <div className="mt-8 max-w-xl">
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
              Project Eric is the security-first IDE. Real-time vulnerability detection,
              OWASP Top 10 coverage, and an AI assistant that writes secure code alongside
              you — built into a single, blazing-fast editor.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate('/signup')}
              className="group inline-flex items-center gap-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-slate-900/20 hover:shadow-xl hover:-translate-y-0.5"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-900 font-semibold rounded-xl border border-slate-200 hover:border-slate-300 transition-all duration-200"
            >
              Sign In
            </button>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              No credit card
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              14-day Pro trial
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              SOC 2 & ISO 27001
            </span>
          </div>
        </div>

        {/* Right: IDE preview card */}
        <div className="lg:col-span-5">
          <IDECard />
        </div>
      </div>
    </Slide>
  );
};

// ============================================================
// IDE Preview card — used across slides
// ============================================================
const IDECard = () => (
  <div className="relative rounded-2xl border border-slate-200 bg-slate-950 shadow-2xl shadow-slate-900/30 overflow-hidden text-left">
    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-slate-900/60">
      <span className="w-3 h-3 rounded-full bg-rose-400/80" />
      <span className="w-3 h-3 rounded-full bg-amber-400/80" />
      <span className="w-3 h-3 rounded-full bg-emerald-400/80" />
      <div className="ml-3 px-3 py-1 rounded-md bg-slate-800/80 text-[11px] text-slate-400 font-mono">
        eric-ide · secure-payments-api
      </div>
    </div>

    <div className="grid grid-cols-12 min-h-[340px] sm:min-h-[400px]">
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
      <div className="col-span-12 sm:col-span-6 p-4 font-mono text-[11px] sm:text-[12px] leading-relaxed bg-slate-950">
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
  return (
    <Slide variant="soft">
      <div
        key="detect"
        className="w-full max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-center animate-slideEnter"
      >
        <div className="lg:col-span-5">
          <SectionLabel label="Real-time Detection" number="/" />
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 leading-[0.95]">
            Find bugs
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              before
            </span>{' '}
            they ship.
          </h2>
          <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-md leading-relaxed">
            Eric scans every keystroke against the OWASP Top 10 and your custom rules.
            Findings appear inline with one-click fixes that compile.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {[
              { icon: Eye, label: 'Data-flow aware analysis' },
              { icon: Zap, label: 'Findings in under 50ms' },
              { icon: CheckCircle2, label: 'One-click auto-fixes' },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <b.icon className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-slate-700">{b.label}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate('/signup')}
            className="mt-10 inline-flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors"
          >
            Try on your repo
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right: code sample */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-slate-950 overflow-hidden shadow-2xl shadow-slate-900/20">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-slate-900/70">
              <div className="flex items-center gap-2">
                <TerminalSquare className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-mono text-slate-300">app.js · line 24</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400">● scanning</span>
            </div>
            <div className="p-5 font-mono text-[12px] sm:text-[13px] leading-relaxed">
              <div className="text-slate-500 mb-2">// Eric found a SQL injection risk</div>
              <pre className="text-slate-300">
                <code>
                  <span className="text-pink-400">const</span> query ={' '}
                  <span className="text-emerald-300">
                    `SELECT * FROM users WHERE id = ${'{'}id{'}'}`
                  </span>
                  ;{' '}
                  <span className="inline-block align-middle w-3.5 h-3.5 bg-rose-500 rounded-sm" />
                  {'\n'}
                  <span className="text-pink-400">await</span> db.query(query);
                </code>
              </pre>
              <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/30 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-rose-300 font-semibold text-[12px]">
                      SQL Injection · OWASP A03
                    </div>
                    <div className="text-slate-300 text-[11px] mt-0.5">
                      Untrusted input concatenated into SQL query. Use parameterized
                      queries.
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button className="px-2 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-semibold transition-colors">
                        Auto-fix
                      </button>
                      <button className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold transition-colors">
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
        key="owasp"
        className="w-full max-w-7xl mx-auto animate-slideEnter"
      >
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <SectionLabel label="OWASP Coverage" number="/" />
            <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 leading-[0.95]">
              All 10.
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                Always on.
              </span>
            </h2>
            <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-md leading-relaxed">
              Every release is checked against the latest OWASP Top 10. Eric ships
              audit-ready reports and custom rule authoring for whatever else you need.
            </p>
          </div>

          <div className="lg:col-span-7">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className="group aspect-square rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 flex flex-col justify-between hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-300"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="text-xs font-bold text-blue-600 tracking-wider">
                    {item.id}
                  </div>
                  <Check className="w-4 h-4 text-emerald-500 self-end" strokeWidth={3} />
                  <div className="text-[10px] sm:text-[11px] font-semibold text-slate-700 leading-tight">
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
  return (
    <Slide variant="soft">
      <div
        key="ai"
        className="w-full max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-center animate-slideEnter"
      >
        <div className="lg:col-span-7 order-2 lg:order-1">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-semibold text-slate-900">Eric AI</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold uppercase tracking-wider">
                  Beta
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-500">● online</span>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-slate-100 text-slate-900 text-sm">
                  How do I rotate the JWT secret without logging everyone out?
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[90%] px-4 py-3 rounded-2xl rounded-tl-sm bg-blue-600 text-white text-sm">
                  <p>
                    Use an overlapping key window: ship a new key, accept tokens signed
                    with either key for 24 hours, then drop the old one.
                  </p>
                  <div className="mt-2 rounded-md bg-slate-950/80 p-2 font-mono text-[11px] text-slate-200 leading-relaxed">
                    <span className="text-pink-400">const</span> verifier ={' '}
                    <span className="text-cyan-300">jwt</span>.
                    <span className="text-cyan-300">verify</span>(token, [KEY_NEXT, KEY_CURRENT]);
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold">
                      Insert snippet
                    </button>
                    <button className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold">
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
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 leading-[0.95]">
            Ask in
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              plain English.
            </span>
          </h2>
          <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-md leading-relaxed">
            Eric explains vulnerabilities, suggests fixes, and writes secure code
            alongside you. It's like pair-programming with a senior security engineer.
          </p>
          <button
            onClick={() => navigate('/signup')}
            className="mt-8 inline-flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors"
          >
            Meet Eric AI
            <ArrowRight className="w-4 h-4" />
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
        key="threat"
        className="w-full max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-center animate-slideEnter"
      >
        <div className="lg:col-span-5">
          <SectionLabel label="Threat Intelligence" number="/" />
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 leading-[0.95]">
            We watch the
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              CVE feed
            </span>
            <br />
            so you don't.
          </h2>
          <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-md leading-relaxed">
            Eric matches live CVE and exploit data against your dependencies. You'll
            know about a critical vulnerability before your vendor emails you.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { v: '24/7', l: 'Monitoring' },
              { v: '180K+', l: 'CVEs tracked' },
              { v: '<5m', l: 'Alert latency' },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900">{s.v}</div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-slate-950 overflow-hidden shadow-2xl shadow-slate-900/20">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-slate-900/70">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-mono text-slate-300">eric-threat-feed.live</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400">● streaming</span>
            </div>
            <div className="p-3 space-y-1.5">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-900/60 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      r.color === 'rose'
                        ? 'bg-rose-400'
                        : r.color === 'amber'
                        ? 'bg-amber-400'
                        : 'bg-blue-400'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${
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
                  <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
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
  const stats = [
    { v: '99.8%', l: 'Detection precision', s: 'Industry-leading false-positive rate' },
    { v: '12×', l: 'Faster code review', s: 'Compared to manual security audits' },
    { v: '24/7', l: 'Threat monitoring', s: 'Live CVE & exploit feed' },
  ];
  return (
    <Slide variant="white">
      <div key="stats" className="w-full max-w-7xl mx-auto animate-slideEnter">
        <div className="text-center mb-16">
          <SectionLabel label="By the Numbers" number="/" />
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 leading-[0.95]">
            Metrics that
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              matter.
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {stats.map((s, i) => (
            <div
              key={s.l}
              className="relative border-t border-slate-200 pt-6"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="text-[14vw] sm:text-[8vw] lg:text-[7rem] font-bold tracking-tight text-slate-900 leading-none">
                {s.v}
              </div>
              <div className="mt-4 text-lg sm:text-xl font-bold text-slate-900 uppercase tracking-wider">
                {s.l}
              </div>
              <div className="mt-1 text-sm text-slate-500">{s.s}</div>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
};

// ============================================================
// SLIDE 7: Trust bar (editorial)
// ============================================================
const TrustSlide = () => {
  const logos = ['ACME', 'Northwind', 'Globex', 'Initech', 'Umbrella', 'Cyberdyne', 'Wayne'];
  return (
    <Slide variant="white">
      <div key="trust" className="w-full max-w-7xl mx-auto animate-slideEnter">
        <div className="grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <SectionLabel label="Trusted by" number="/" />
            <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 leading-[0.95]">
              Teams that
              <br />
              ship{' '}
              <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                secure code.
              </span>
            </h2>
            <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-md leading-relaxed">
              From fintech startups to Fortune 500s — engineering teams trust Eric to
              protect their codebases.
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {logos.map((name, i) => (
              <div
                key={name}
                className="aspect-[3/2] flex items-center justify-center gap-2 border border-slate-200 rounded-xl hover:border-blue-500 transition-colors"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-slate-300 to-slate-500 flex items-center justify-center text-white text-xs font-bold">
                  {name[0]}
                </div>
                <span className="text-sm font-bold tracking-tight text-slate-700">
                  {name}
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
      <div key="pricing" className="w-full max-w-7xl mx-auto animate-slideEnter">
        <div className="text-center mb-14">
          <SectionLabel label="Pricing" number="/" />
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 leading-[0.95]">
            Simple plans.
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              Powerful protection.
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 max-w-5xl mx-auto">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl border p-6 sm:p-8 flex flex-col ${
                t.highlight
                  ? 'border-slate-900 bg-slate-900 text-white shadow-2xl scale-[1.02] md:scale-105'
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              {t.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-bold">{t.name}</h3>
              <p
                className={`text-sm mt-1 ${
                  t.highlight ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {t.desc}
              </p>
              <div className="mt-5 flex items-baseline gap-1.5">
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
              <ul className="mt-6 space-y-2.5 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check
                      className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
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
                className={`mt-7 w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
                  t.highlight
                    ? 'bg-white hover:bg-slate-100 text-slate-900'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
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
// SLIDE 9: Team
// ============================================================
const TeamSlide = () => {
  const team = [
    { name: 'Alex Chen', role: 'Lead Developer', initials: 'AC', c: 'from-blue-500 to-cyan-500' },
    { name: 'Sarah Kim', role: 'Security Engineer', initials: 'SK', c: 'from-rose-500 to-pink-500' },
    { name: 'Marcus Johnson', role: 'UI/UX Designer', initials: 'MJ', c: 'from-violet-500 to-purple-500' },
    { name: 'Priya Patel', role: 'Backend Engineer', initials: 'PP', c: 'from-emerald-500 to-teal-500' },
  ];
  return (
    <Slide variant="soft">
      <div key="team" className="w-full max-w-7xl mx-auto animate-slideEnter">
        <div className="text-center mb-14">
          <SectionLabel label="The Team" number="/" />
          <h2 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 leading-[0.95]">
            People who care
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              about secure code.
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-5xl mx-auto">
          {team.map((m, i) => (
            <div
              key={m.name}
              className="group border border-slate-200 bg-white rounded-2xl p-6 text-center hover:border-blue-500 hover:-translate-y-1 transition-all duration-300"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div
                className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${m.c} flex items-center justify-center text-white text-lg font-bold shadow-lg`}
              >
                {m.initials}
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{m.name}</h3>
              <p className="text-sm font-semibold text-blue-600 uppercase tracking-wider mt-1">
                {m.role}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Slide>
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
          <span className="block">START</span>
          <span className="block bg-gradient-to-r from-cyan-300 via-white to-blue-200 bg-clip-text text-transparent">
            SHIPPING
          </span>
          <span className="block">SECURE CODE.</span>
        </h2>

        <p className="mt-8 text-base sm:text-lg text-blue-100 max-w-2xl mx-auto leading-relaxed">
          Free to start. No credit card required. 14-day Pro trial with full access to
          every feature.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => navigate('/signup')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-white hover:bg-slate-50 text-slate-900 font-bold rounded-xl transition-colors shadow-2xl"
          >
            Start free trial
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/login')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl border border-white/30 transition-colors"
          >
            Sign In
          </button>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-blue-100">
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
    { id: 'team', name: 'The Team' },
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
