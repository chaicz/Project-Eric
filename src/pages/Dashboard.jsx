import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  Shield,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Eye,
  Play,
  Folder,
  Clock,
  ArrowRight,
  Activity,
  ScanSearch,
  Plus,
  Bell,
  FileCode,
  Keyboard,
  RefreshCw,
  Zap,
  Target,
  Flame,
  Award,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ChevronRight,
  ShieldCheck,
  Database,
  Lock,
  Globe,
  UserX,
  Settings,
  Package,
  Layout,
  FileText,
  Cpu,
} from 'lucide-react';
import { getSecurityStats, mockProjects, mockVulnerabilities, OWASP_CATEGORIES } from '../utils/securityData';
import PageTip from '../components/PageTip';

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------
const DashboardBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    <div
      className="absolute w-[600px] h-[600px] rounded-full opacity-50 blur-3xl animate-orb-1"
      style={{
        background: 'radial-gradient(circle, rgba(59,130,246,0.6) 0%, rgba(59,130,246,0) 70%)',
        top: '-200px',
        right: '-140px',
      }}
    />
    <div
      className="absolute w-[450px] h-[450px] rounded-full opacity-45 blur-3xl animate-orb-2"
      style={{
        background: 'radial-gradient(circle, rgba(139,92,246,0.6) 0%, rgba(139,92,246,0) 70%)',
        bottom: '-100px',
        left: '-120px',
      }}
    />

    {[...Array(10)].map((_, i) => (
      <div
        key={i}
        className="absolute w-2 h-2 bg-blue-400/50 rounded-full animate-particle"
        style={{
          left: `${8 + i * 9}%`,
          top: `${12 + (i % 4) * 20}%`,
          animationDelay: `${i * 0.6}s`,
          animationDuration: `${7 + i % 3}s`,
        }}
      />
    ))}

    {/* Third accent orb (emerald) */}
    <div
      className="absolute w-[400px] h-[400px] rounded-full opacity-35 blur-3xl animate-orb-3"
      style={{
        background: 'radial-gradient(circle, rgba(16,185,129,0.5) 0%, rgba(16,185,129,0) 70%)',
        top: '45%',
        right: '25%',
      }}
    />

    {/* Grid pattern (faded at edges via mask) */}
    <div
      className="absolute inset-0 opacity-[0.18]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(59,130,246,0.4) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(59,130,246,0.4) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        maskImage:
          'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
        WebkitMaskImage:
          'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
      }}
    />

    {/* Floating security-themed silhouettes */}
    <svg
      className="absolute top-24 left-8 w-24 h-24 text-blue-500/20 animate-float-shape-1"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z" />
    </svg>
    <svg
      className="absolute bottom-32 right-12 w-20 h-20 text-violet-500/20 animate-float-shape-2"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18 8h-1V6c0-2.8-2.2-5-5-5S7 3.2 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.7 1.4-3.1 3.1-3.1 1.7 0 3.1 1.4 3.1 3.1v2z" />
    </svg>
    <svg
      className="absolute top-1/2 left-1/3 w-16 h-16 text-emerald-500/15 animate-float-shape-3"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9.4 16.6L4.8 12l-1.4 1.4 6 6 12-12-1.4-1.4z" />
    </svg>

    {/* Subtle vignette to keep content readable */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse 90% 70% at 50% 50%, transparent 40%, rgba(248,250,252,0.3) 100%)',
      }}
    />
  </div>
);

// ---------------------------------------------------------------------------
// Animation hooks
// ---------------------------------------------------------------------------
const useAnimatedCounter = (endValue, duration = 1500) => {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const startTime = Date.now();
          const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(endValue * easeOut));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [endValue, duration, hasAnimated]);

  return { count, ref };
};

const useScrollReveal = (threshold = 0.1) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
};

// ---------------------------------------------------------------------------
// Section / card wrappers
// ---------------------------------------------------------------------------
const AnimatedSection = ({ children, delay = 0, className = '' }) => {
  const { ref, isVisible } = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

const AnimatedCard = ({ children, delay = 0, className = '' }) => {
  const { ref, isVisible } = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`minimal-card p-5 transition-all duration-500 ease-out ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.98)',
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Security Score Ring (SVG)
// ---------------------------------------------------------------------------
const SecurityScoreRing = ({ score = 78 }) => {
  const radius = 70;
  const stroke = 10;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const [dashOffset, setDashOffset] = useState(circumference);

  useEffect(() => {
    const t = setTimeout(() => {
      setDashOffset(circumference - (score / 100) * circumference);
    }, 250);
    return () => clearTimeout(t);
  }, [score, circumference]);

  const { count } = useAnimatedCounter(score);

  return (
    <div className="relative w-[180px] h-[180px] flex items-center justify-center">
      <svg height={radius * 2} width={radius * 2} className="absolute -rotate-90">
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        <circle
          stroke="rgba(226,232,240,0.6)"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke="url(#ringGradient)"
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset: dashOffset, transition: 'stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1)' }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-5xl font-bold bg-gradient-to-br from-emerald-600 to-blue-600 bg-clip-text text-transparent tabular-nums">
          {count}
        </span>
        <span className="text-xs uppercase tracking-widest text-slate-500 mt-1">Secure Score</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Security Trend Chart (SVG sparkline + bars)
// ---------------------------------------------------------------------------
const trendData = [
  { day: 'Mon', detected: 12, resolved: 6 },
  { day: 'Tue', detected: 9, resolved: 11 },
  { day: 'Wed', detected: 14, resolved: 8 },
  { day: 'Thu', detected: 7, resolved: 10 },
  { day: 'Fri', detected: 5, resolved: 9 },
  { day: 'Sat', detected: 3, resolved: 6 },
  { day: 'Sun', detected: 4, resolved: 7 },
];

const SecurityTrendChart = () => {
  const max = Math.max(...trendData.map((d) => d.detected));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Security Activity</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Last 7 days</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-400" /> Detected
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Resolved
          </span>
        </div>
      </div>
      <div className="flex items-end gap-3 h-44 pt-2">
        {trendData.map((d, i) => {
          const detectedH = (d.detected / max) * 100;
          const resolvedH = (d.resolved / max) * 100;
          return (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-2 group">
              <div className="w-full flex items-end gap-1 h-full">
                <div
                  className="flex-1 rounded-t-md bg-gradient-to-t from-rose-500 to-rose-300 shadow-sm group-hover:from-rose-600 group-hover:to-rose-400 transition-all duration-300 relative"
                  style={{ height: `${detectedH}%`, animationDelay: `${i * 60}ms` }}
                >
                  <span className="opacity-0 group-hover:opacity-100 absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-medium bg-slate-900 text-white px-1.5 py-0.5 rounded transition-opacity">
                    {d.detected}
                  </span>
                </div>
                <div
                  className="flex-1 rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-300 shadow-sm group-hover:from-emerald-700 group-hover:to-emerald-400 transition-all duration-300 relative"
                  style={{ height: `${resolvedH}%`, animationDelay: `${i * 60 + 30}ms` }}
                >
                  <span className="opacity-0 group-hover:opacity-100 absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-medium bg-slate-900 text-white px-1.5 py-0.5 rounded transition-opacity">
                    {d.resolved}
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-medium text-slate-500">{d.day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Threat Level Gauge
// ---------------------------------------------------------------------------
const ThreatLevelGauge = ({ level = 'medium', score = 78 }) => {
  const config = {
    low: { color: '#10b981', label: 'Low Risk', desc: 'Your posture is strong', gradient: 'from-emerald-500 to-emerald-300' },
    medium: { color: '#f59e0b', label: 'Moderate Risk', desc: 'Some issues need attention', gradient: 'from-amber-500 to-amber-300' },
    high: { color: '#ef4444', label: 'High Risk', desc: 'Action required immediately', gradient: 'from-rose-500 to-rose-300' },
  };
  const c = config[level] || config.medium;
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg viewBox="0 0 80 80" className="absolute -rotate-90 w-full h-full">
          <circle cx="40" cy="40" r="32" fill="transparent" stroke="rgba(226,232,240,0.7)" strokeWidth="8" />
          <circle
            cx="40"
            cy="40"
            r="32"
            fill="transparent"
            stroke={c.color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 201} 201`}
            style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>
        <Shield className="w-7 h-7" style={{ color: c.color }} />
      </div>
      <div className="flex-1">
        <p className="text-xs uppercase tracking-widest text-slate-500">Posture</p>
        <p className={`text-lg font-bold bg-gradient-to-r ${c.gradient} bg-clip-text text-transparent`}>{c.label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{c.desc}</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------
const Sparkline = ({ data, color = '#10b981', width = 80, height = 28 }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;
  const gradId = `spark-${color.replace('#', '')}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
const Dashboard = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [stats, setStats] = useState(getSecurityStats());
  const [projects] = useState(mockProjects);
  const [recentVulns, setRecentVulns] = useState(mockVulnerabilities.slice(0, 5));
  const [mounted, setMounted] = useState(false);
  const [shortcutHint, setShortcutHint] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    setMounted(true);
    const hasSeenHint = localStorage.getItem('dashboard_hint_seen');
    if (!hasSeenHint) {
      setTimeout(() => setShortcutHint(true), 2000);
      setTimeout(() => {
        setShortcutHint(false);
        localStorage.setItem('dashboard_hint_seen', 'true');
      }, 6000);
    }
    const tick = setInterval(() => setTime(new Date()), 60_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'r' && !e.target.matches('input, textarea')) {
        setStats(getSecurityStats());
      }
      if (e.key === 'n' && !e.target.matches('input, textarea')) {
        window.location.href = '/analysis';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getGreeting = () => {
    const hour = time.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getUserName = () => {
    if (user?.name) return user.name.charAt(0).toUpperCase() + user.name.slice(1);
    return 'Developer';
  };

  const severityConfig = {
    critical: { bg: 'bg-red-500', text: 'text-red-600', bgLight: 'bg-red-50', border: 'border-red-200', icon: Flame, ring: 'ring-red-100' },
    high: { bg: 'bg-amber-500', text: 'text-amber-600', bgLight: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle, ring: 'ring-amber-100' },
    medium: { bg: 'bg-yellow-500', text: 'text-yellow-600', bgLight: 'bg-yellow-50', border: 'border-yellow-200', icon: AlertTriangle, ring: 'ring-yellow-100' },
    low: { bg: 'bg-blue-500', text: 'text-blue-600', bgLight: 'bg-blue-50', border: 'border-blue-200', icon: Eye, ring: 'ring-blue-100' },
  };

  const threatLevelConfig = {
    low: { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    medium: { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' },
    high: { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' },
  };

  const quickActions = [
    { icon: Play, label: 'Open Code IDE', desc: 'Start coding securely', href: '/sandbox', color: 'bg-slate-900', shortcut: '⌘I', accent: 'from-slate-700 to-slate-900' },
    { icon: ScanSearch, label: 'Run Scan', desc: 'Analyze all projects', href: '/analysis', color: 'bg-blue-600', shortcut: '⌘S', accent: 'from-blue-500 to-blue-700' },
    { icon: Eye, label: 'View Threats', desc: 'Latest intelligence', href: '/threats', color: 'bg-amber-600', shortcut: '⌘T', accent: 'from-amber-500 to-amber-700' },
  ];

  const recentActivity = [
    { id: 1, type: 'scan', text: 'Full scan completed on E-Commerce API', time: '2m ago', icon: ScanSearch, color: 'text-blue-600 bg-blue-50' },
    { id: 2, type: 'fix', text: 'CVE-2026-1234 mitigated in Payment Service', time: '14m ago', icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
    { id: 3, type: 'alert', text: 'New critical vulnerability detected', time: '1h ago', icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
    { id: 4, type: 'update', text: 'Dependency updates available (7 packages)', time: '3h ago', icon: RefreshCw, color: 'text-violet-600 bg-violet-50' },
    { id: 5, type: 'achievement', text: 'Reached 7-day clean streak', time: '1d ago', icon: Award, color: 'text-amber-600 bg-amber-50' },
  ];

  const totalProjects = projects.length;
  const criticalProjects = projects.filter((p) => p.criticalCount > 0).length;

  return (
    <div className="relative">
      <DashboardBackground />

      <div className={`p-6 lg:p-8 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'} relative z-10 space-y-6`}>
        {/* ============================================================
            PAGE TIP — first-time guidance for new users
            ============================================================ */}
        <PageTip
          pageId="dashboard"
          variant="tip"
          title="Welcome to your Dashboard"
          body="This is your security command center. Use the quick actions below to run a scan, open the IDE, or view the latest threats. Press ⌘K anywhere to jump to any page fast."
          cta={{ label: "Take the tour", href: "#", external: false, onClick: () => {
            try { localStorage.removeItem('eric_welcome_tour_seen'); } catch {}
            if (typeof window !== 'undefined' && window.__restartEricTour) {
              window.__restartEricTour();
            } else {
              window.location.reload();
            }
          } }}
        />

        {/* ============================================================
            HERO WELCOME BANNER
            ============================================================ */}
        <AnimatedSection delay={0}>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 dark:from-slate-950 dark:via-blue-950 dark:to-indigo-950 p-6 lg:p-8 shadow-2xl">
            {/* Decorative grid + glow */}
            <div className="absolute inset-0 opacity-[0.07]" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }} />
            <div className="absolute -top-20 -right-20 w-72 h-72 bg-blue-500/30 rounded-full blur-3xl" />
            <div className="absolute -bottom-24 -left-12 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl" />

            <div className="relative grid lg:grid-cols-[1fr_auto] gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-medium text-blue-100 mb-4">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                  <span>All systems protected</span>
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                </div>
                <h1 className="text-3xl lg:text-4xl font-bold text-white dark:text-slate-100 mb-2 tracking-tight">
                  {getGreeting()}, <span className="bg-gradient-to-r from-blue-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">{getUserName()}</span>
                </h1>
                <p className="text-slate-300 text-sm lg:text-base max-w-xl mb-5">
                  You've resolved <span className="font-semibold text-emerald-300">57 vulnerabilities</span> this week — that's your best streak yet. Keep pushing toward a perfect score.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/analysis"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-slate-900 font-semibold text-sm shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200"
                  >
                    <Zap className="w-4 h-4" />
                    Run a scan
                  </Link>
                  <Link
                    to="/sandbox"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white font-medium text-sm hover:bg-white/20 transition-all duration-200"
                  >
                    <Play className="w-4 h-4" />
                    Open IDE
                  </Link>
                </div>
                <div className="flex items-center gap-5 mt-5 text-xs text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>

              <div className="flex justify-center lg:justify-end">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/30 to-blue-500/30 blur-2xl rounded-full" />
                  <div className="relative bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-3xl p-5 shadow-2xl border border-white/40 dark:border-slate-700/60">
                    <SecurityScoreRing score={stats.secureScore} />
                    <div className="mt-2 text-center">
                      <p className="text-[11px] text-slate-500 uppercase tracking-widest">Posture</p>
                      <p className="text-sm font-semibold text-emerald-600">Improving</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AnimatedSection>

        {/* ============================================================
            STATS GRID
            ============================================================ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Vulnerabilities */}
          <AnimatedCard delay={50} className="group relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-colors duration-500" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-100">
                  {stats.criticalVulnerabilities} critical
                </span>
              </div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-red-600 transition-colors duration-300 tabular-nums">
                {stats.totalVulnerabilities}
              </h3>
              <p className="text-sm text-slate-500 mt-1">Open Vulnerabilities</p>
              <div className="mt-3 -mx-1">
                <Sparkline data={[18, 22, 19, 16, 20, 15, 12]} color="#ef4444" width={220} height={36} />
              </div>
            </div>
          </AnimatedCard>

          {/* Scans */}
          <AnimatedCard delay={100} className="group relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-colors duration-500" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                  <TrendingUp className="w-3 h-3" /> +12%
                </span>
              </div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors duration-300 tabular-nums">
                {stats.scansCompleted}
              </h3>
              <p className="text-sm text-slate-500 mt-1">Scans Completed</p>
              <div className="mt-3 -mx-1">
                <Sparkline data={[4, 6, 5, 8, 7, 10, 12]} color="#3b82f6" width={220} height={36} />
              </div>
            </div>
          </AnimatedCard>

          {/* Code Lines */}
          <AnimatedCard delay={150} className="group relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl group-hover:bg-violet-500/20 transition-colors duration-500" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <FileCode className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded-full border border-slate-100">
                  across {totalProjects} repos
                </span>
              </div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-violet-600 transition-colors duration-300 tabular-nums">
                {stats.codeLinesAnalyzed.toLocaleString()}
              </h3>
              <p className="text-sm text-slate-500 mt-1">Lines Analyzed</p>
              <div className="mt-3 -mx-1">
                <Sparkline data={[8, 12, 11, 14, 13, 15, 16]} color="#8b5cf6" width={220} height={36} />
              </div>
            </div>
          </AnimatedCard>

          {/* Avg Fix Time */}
          <AnimatedCard delay={200} className="group relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-colors duration-500" />
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                  <TrendingDown className="w-3 h-3" /> -18%
                </span>
              </div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 transition-colors duration-300 tabular-nums">
                2.4<span className="text-lg text-slate-400 ml-1">hrs</span>
              </h3>
              <p className="text-sm text-slate-500 mt-1">Avg. Fix Time</p>
              <div className="mt-3 -mx-1">
                <Sparkline data={[4.2, 3.8, 3.5, 3.1, 2.9, 2.6, 2.4]} color="#10b981" width={220} height={36} />
              </div>
            </div>
          </AnimatedCard>
        </div>

        {/* ============================================================
            OWASP SCANNER FEATURE — prominent entry point on the main page
            ============================================================ */}
        <AnimatedSection delay={120}>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-blue-700 dark:from-emerald-700 dark:via-teal-700 dark:to-blue-800 p-6 lg:p-7 shadow-2xl">
            {/* Decorative grid + glow */}
            <div className="absolute inset-0 opacity-[0.07]" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }} />
            <div className="absolute -top-16 -right-16 w-72 h-72 bg-emerald-400/30 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-12 w-72 h-72 bg-blue-400/30 rounded-full blur-3xl" />

            {/* Floating shield silhouettes */}
            <Shield className="absolute top-6 right-12 w-20 h-20 text-white/10 animate-float-shape-1 hidden lg:block" />
            <ShieldCheck className="absolute bottom-6 right-40 w-14 h-14 text-white/10 animate-float-shape-2 hidden lg:block" />

            <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 items-center">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-semibold text-white mb-3">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>OWASP Top 10 · 2026</span>
                  <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" />
                </div>
                <h3 className="text-2xl lg:text-3xl font-bold text-white mb-2 tracking-tight">
                  Scan your code or SQL for vulnerabilities
                </h3>
                <p className="text-emerald-50/90 text-sm lg:text-base max-w-2xl mb-5">
                  Paste any snippet in 11 languages or any SQL dialect and we'll check it against
                  every OWASP category — Injection, Cryptographic Failures, SSRF and more — with
                  CWE references and remediation steps.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to="/owasp"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-slate-900 font-bold text-sm shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200"
                  >
                    <Zap className="w-4 h-4" />
                    Open OWASP Scanner
                  </Link>
                  <Link
                    to="/owasp-analysis"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/25 text-white font-semibold text-sm hover:bg-white/20 transition-all duration-200"
                  >
                    Full analysis
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* Right: OWASP category icons grid */}
              <div className="grid grid-cols-5 gap-2 lg:gap-3 lg:max-w-md justify-end">
                {[
                  { Icon: ShieldAlert, label: 'Access',   rot: 'rotate-3' },
                  { Icon: Lock,        label: 'Crypto',   rot: '-rotate-3' },
                  { Icon: Database,    label: 'Inject',   rot: 'rotate-2' },
                  { Icon: Layout,      label: 'Design',   rot: '-rotate-2' },
                  { Icon: Settings,    label: 'Config',   rot: 'rotate-3' },
                  { Icon: Package,     label: 'Deps',     rot: '-rotate-3' },
                  { Icon: UserX,       label: 'Auth',     rot: 'rotate-2' },
                  { Icon: FileCode,    label: 'Integ.',   rot: '-rotate-2' },
                  { Icon: FileText,    label: 'Logs',     rot: 'rotate-3' },
                  { Icon: Globe,       label: 'SSRF',     rot: '-rotate-3' },
                ].map((c, i) => (
                  <div
                    key={i}
                    className={`relative w-14 h-14 lg:w-16 lg:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex flex-col items-center justify-center text-white hover:bg-white/25 hover:scale-110 transition-all duration-200 ${c.rot} hover:rotate-0 shadow-lg`}
                    title={c.label}
                  >
                    <c.Icon className="w-5 h-5 lg:w-6 lg:h-6" />
                    <span className="text-[9px] font-bold mt-1 opacity-90">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom strip: scan modes */}
            <div className="relative mt-6 pt-5 border-t border-white/20 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { Icon: Cpu,        label: 'Code Mode',   hint: 'JS · TS · Python · Java · Go · C# · PHP · Ruby · Rust · C++' },
                { Icon: Database,   label: 'SQL Mode',    hint: 'MySQL · PostgreSQL · T-SQL · SQLite · Oracle · generic' },
                { Icon: Lock,       label: 'In-browser',  hint: 'Static analysis only — your code never leaves the device.' },
              ].map((m) => (
                <div key={m.label} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur border border-white/25 flex items-center justify-center flex-shrink-0">
                    <m.Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">{m.label}</div>
                    <div className="text-[11px] text-emerald-50/80 mt-0.5 leading-relaxed">{m.hint}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AnimatedSection>

        {/* ============================================================
            TREND CHART + THREAT GAUGE
            ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <AnimatedCard delay={50} className="lg:col-span-2 relative overflow-hidden">
            <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl" />
            <SecurityTrendChart />
          </AnimatedCard>

          <AnimatedCard delay={100} className="relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl" />
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Threat Posture</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Real-time assessment</p>
              </div>
              <Link to="/threats" className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5">
                Details <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <ThreatLevelGauge level={criticalProjects > 0 ? 'medium' : 'low'} score={stats.secureScore} />

            <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-2 gap-3">
              {OWASP_CATEGORIES.slice(0, 4).map((cat, i) => (
                <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className={`w-2 h-2 rounded-full ${i % 2 === 0 ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-xs text-slate-600 flex-1 truncate">{cat.id}</span>
                  <span className="text-xs font-semibold text-slate-700">{Math.floor(Math.random() * 5) + 1}</span>
                </div>
              ))}
            </div>
          </AnimatedCard>
        </div>

        {/* ============================================================
            PROJECTS + ACTIVITY
            ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Projects List */}
          <AnimatedSection delay={50} className="lg:col-span-2">
            <div className="minimal-card overflow-hidden h-full flex flex-col">
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-50/50 to-transparent dark:from-slate-800/40 dark:to-transparent">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Your Projects</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{totalProjects} active repositories</p>
                </div>
                <Link
                  to="/analysis"
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 group"
                >
                  View All
                  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-slate-800 flex-1">
                {projects.map((project, index) => {
                  const tc = threatLevelConfig[project.threatLevel];
                  const langColor =
                    project.language === 'JavaScript' ? 'from-yellow-400 to-yellow-500' :
                    project.language === 'TypeScript' ? 'from-blue-400 to-blue-500' :
                    'from-emerald-400 to-emerald-500';
                  return (
                    <div
                      key={project.id}
                      onClick={() => navigate('/analysis')}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/analysis'); } }}
                      className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-all duration-300 cursor-pointer group"
                      style={{ animationDelay: `${index * 60}ms` }}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`relative w-11 h-11 rounded-xl bg-gradient-to-br ${langColor} flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:shadow-md transition-all duration-300`}>
                          <Folder className="w-5 h-5 text-white" />
                          {project.criticalCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                              {project.name}
                            </h3>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${tc.bg} ${tc.color} font-medium border ${tc.border}`}>
                              {project.threatLevel.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                            <span>{project.language}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                            <span>{project.framework}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                            <span>{project.files} files</span>
                          </p>
                        </div>
                        <div className="hidden sm:block w-32">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-500 dark:text-slate-400">Health</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {project.threatLevel === 'high' ? 42 : project.threatLevel === 'medium' ? 68 : 92}%
                            </span>
                          </div>
                          <div className="progress-bar h-1.5">
                            <div
                              className={`progress-bar-fill ${
                                project.threatLevel === 'high' ? 'bg-gradient-to-r from-red-500 to-rose-400' :
                                project.threatLevel === 'medium' ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
                                'bg-gradient-to-r from-emerald-500 to-green-400'
                              }`}
                              style={{ width: `${project.threatLevel === 'high' ? 42 : project.threatLevel === 'medium' ? 68 : 92}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${tc.color} tabular-nums`}>{project.vulnerabilityCount}</div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">vulns</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 dark:group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <button
                  onClick={() => {
                    alert('To connect a new project, head to Settings → Integrations and connect GitHub or GitLab. We support scanning on every push.');
                  }}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-2 rounded-lg hover:bg-white dark:hover:bg-slate-700/60"
                >
                  <Plus className="w-4 h-4" />
                  Connect a new project
                </button>
              </div>
            </div>
          </AnimatedSection>

          {/* Quick Actions & Activity */}
          <div className="space-y-6">
            <AnimatedCard delay={100}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Quick Actions</h2>
                <span className="text-xs text-slate-500">3 shortcuts</span>
              </div>
              <div className="space-y-2.5">
                {quickActions.map((action, index) => (
                  <Link
                    key={index}
                    to={action.href}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-slate-50 to-white hover:from-white hover:to-slate-50 dark:from-slate-800/60 dark:to-slate-900/60 dark:hover:from-slate-800 dark:hover:to-slate-900 border border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600 hover:shadow-md dark:hover:shadow-black/40 transition-all duration-300 group"
                  >
                    <div className={`w-10 h-10 ${action.color} rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                      <action.icon className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{action.label}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{action.desc}</p>
                    </div>
                    <kbd className="hidden sm:flex items-center px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 text-[10px] font-mono rounded shadow-sm">
                      {action.shortcut}
                    </kbd>
                  </Link>
                ))}
              </div>
            </AnimatedCard>

            <AnimatedCard delay={150}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Activity</h2>
                <Bell className="w-4 h-4 text-slate-400" />
              </div>
              <div className="space-y-1">
                {recentActivity.map((activity, index) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <div className={`w-8 h-8 rounded-lg ${activity.color} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                      <activity.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 group-hover:text-slate-900 leading-snug">{activity.text}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AnimatedCard>
          </div>
        </div>

        {/* ============================================================
            VULNERABILITIES TABLE
            ============================================================ */}
        <AnimatedCard delay={50}>
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-50/50 to-transparent dark:from-slate-800/40 dark:to-transparent">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Vulnerabilities</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Sorted by severity and discovery time</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                {recentVulns.length} issues
              </span>
              <Link
                to="/analysis"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 group"
              >
                View All
                <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="minimal-table">
              <thead>
                <tr>
                  <th>Vulnerability</th>
                  <th>Severity</th>
                  <th>Category</th>
                  <th className="hidden md:table-cell">Location</th>
                  <th>Status</th>
                  <th className="hidden sm:table-cell">CVSS</th>
                </tr>
              </thead>
              <tbody>
                {recentVulns.map((vuln, index) => {
                  const config = severityConfig[vuln.severity];
                  const SeverityIcon = config.icon;
                  return (
                    <tr
                      key={vuln.id}
                      className="transition-all duration-300 hover:bg-slate-50 group"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg ${config.bgLight} flex items-center justify-center ring-1 ${config.ring} group-hover:scale-110 transition-transform`}>
                            <SeverityIcon className={`w-4 h-4 ${config.text}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{vuln.title}</div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">{vuln.cweId}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white ${config.bg} shadow-sm`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                          {vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1)}
                        </span>
                      </td>
                      <td className="text-slate-600 text-sm">{vuln.category}</td>
                      <td className="hidden md:table-cell">
                        <code className="font-mono text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{vuln.location}</code>
                      </td>
                      <td>
                        <span
                          className={`minimal-badge ${
                            vuln.status === 'open' ? 'badge-error' :
                            vuln.status === 'in_progress' ? 'badge-warning' :
                            'badge-success'
                          }`}
                        >
                          {vuln.status === 'open' && <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-1.5 animate-pulse" />}
                          {vuln.status === 'in_progress' && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mr-1.5" />}
                          {vuln.status === 'remediated' && <CheckCircle className="w-3 h-3 mr-1" />}
                          {vuln.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-16 progress-bar h-1.5">
                            <div
                              className={`progress-bar-fill ${
                                vuln.cvss >= 9 ? 'bg-red-500' :
                                vuln.cvss >= 7 ? 'bg-amber-500' :
                                vuln.cvss >= 4 ? 'bg-yellow-500' :
                                'bg-blue-500'
                              }`}
                              style={{ width: `${(vuln.cvss / 10) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-700 tabular-nums w-8">{vuln.cvss}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AnimatedCard>

        {/* ============================================================
            KEYBOARD HINT (existing behaviour preserved)
            ============================================================ */}
        {shortcutHint && (
          <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
            <div className="bg-slate-900/95 backdrop-blur-xl text-white px-4 py-3 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-3">
              <Keyboard className="w-5 h-5 text-blue-400" />
              <div className="text-xs">
                <p className="font-semibold">Pro tip</p>
                <p className="text-slate-300">Press <kbd className="px-1 bg-white/10 rounded">R</kbd> to refresh, <kbd className="px-1 bg-white/10 rounded">N</kbd> to scan</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;