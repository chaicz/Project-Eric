import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Code2,
  ScanSearch,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  X,
  Check,
  Rocket,
  Users,
  Key,
} from 'lucide-react';

const TOUR_STEPS = [
  {
    id: 'welcome',
    icon: Sparkles,
    iconColor: 'from-blue-500 to-cyan-500',
    title: 'Welcome to Project Eric!',
    description:
      'Your security-first development platform. Let us show you around the four most important areas — takes about 30 seconds.',
    target: null,
    next: 'dashboard',
    primaryLabel: 'Start tour',
  },
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    iconColor: 'from-blue-600 to-indigo-600',
    title: 'Your Dashboard at a glance',
    description:
      'See your secure score, active vulnerabilities, and recent activity. Click any card to dive deeper.',
    target: '/dashboard',
    next: 'ide',
    primaryLabel: 'Next: IDE',
  },
  {
    id: 'ide',
    icon: Code2,
    iconColor: 'from-violet-500 to-purple-600',
    title: 'Code in the secure IDE',
    description:
      'Write code with AI assistance, real-time OWASP scanning, and sandboxed execution. Your code never leaves a protected environment.',
    target: '/sandbox',
    next: 'analysis',
    primaryLabel: 'Next: Analysis',
  },
  {
    id: 'analysis',
    icon: ScanSearch,
    iconColor: 'from-emerald-500 to-teal-600',
    title: 'Find vulnerabilities in one click',
    description:
      'Run OWASP Top 10 scans across every project. Drill into any finding to see the exact line of code and remediation steps.',
    target: '/analysis',
    next: 'threats',
    primaryLabel: 'Next: Threats',
  },
  {
    id: 'threats',
    icon: AlertTriangle,
    iconColor: 'from-red-500 to-rose-600',
    title: 'Stay ahead of live threats',
    description:
      'Get real-time threat intelligence and proactively patch CVEs before they hit. Search the NVD/CVE database from here.',
    target: '/threats',
    next: 'team',
    primaryLabel: 'Next: Team',
  },
  {
    id: 'team',
    icon: Users,
    iconColor: 'from-amber-500 to-orange-600',
    title: 'Collaborate with your team',
    description:
      'Invite teammates, assign roles (Admin, Developer, Analyst, Viewer), and audit every action in the Activity Log.',
    target: '/team',
    next: 'keys',
    primaryLabel: 'Next: API Keys',
  },
  {
    id: 'keys',
    icon: Key,
    iconColor: 'from-slate-700 to-slate-900',
    title: 'Connect AI + APIs',
    description:
      'Generate keys for the AI assistant, sandbox runner, and OWASP scanner. Quotas and usage are visible per key.',
    target: '/api-keys',
    next: 'done',
    primaryLabel: 'Finish tour',
  },
  {
    id: 'done',
    icon: Rocket,
    iconColor: 'from-emerald-500 to-teal-600',
    title: "You're all set!",
    description:
      'You can restart this tour any time from Settings → Help. Tip: press ⌘K in the top bar to jump anywhere fast.',
    target: null,
    next: null,
    primaryLabel: 'Got it',
  },
];

const STORAGE_KEY = 'eric_welcome_tour_seen';

const WelcomeTour = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hasSeen, setHasSeen] = useState(true);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    setHasSeen(seen === 'true');
    if (!seen) {
      // delay so the user sees the dashboard first
      const t = setTimeout(() => {
        setHasSeen(false);
        setOpen(true);
      }, 900);
      return () => clearTimeout(t);
    }
  }, []);

  const closeAndRemember = useCallback(() => {
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, 'true');
    setHasSeen(true);
  }, []);

  const handleNext = useCallback(() => {
    const step = TOUR_STEPS[stepIndex];
    if (step.next === null) {
      closeAndRemember();
      return;
    }
    const nextIdx = TOUR_STEPS.findIndex((s) => s.id === step.next);
    if (nextIdx === -1) {
      closeAndRemember();
      return;
    }
    setStepIndex(nextIdx);
    if (step.target) {
      navigate(step.target);
    }
  }, [stepIndex, navigate, closeAndRemember]);

  const handlePrev = useCallback(() => {
    if (stepIndex === 0) return;
    const prevId = TOUR_STEPS[stepIndex - 1].id;
    setStepIndex((i) => i - 1);
    const target = TOUR_STEPS[stepIndex - 1].target;
    if (target) navigate(target);
    void prevId;
  }, [stepIndex, navigate]);

  const restart = useCallback(() => {
    setStepIndex(0);
    setOpen(true);
    setHasSeen(false);
  }, []);

  // expose a global-ish API so settings can call it
  useEffect(() => {
    window.__restartEricTour = restart;
    return () => { delete window.__restartEricTour; };
  }, [restart]);

  if (!open || hasSeen) return null;

  const step = TOUR_STEPS[stepIndex];
  const StepIcon = step.icon;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
        {/* coloured top stripe */}
        <div className={`h-2 bg-gradient-to-r ${step.iconColor}`} />

        <button
          onClick={closeAndRemember}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Close tour"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-8">
          {/* icon + step counter */}
          <div className="flex items-start gap-4 mb-4">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.iconColor} flex items-center justify-center shadow-lg flex-shrink-0`}>
              <StepIcon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">
                Step {stepIndex + 1} of {TOUR_STEPS.length}
              </p>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">{step.title}</h3>
            </div>
          </div>

          <p className="text-slate-600 leading-relaxed mb-6">{step.description}</p>

          {/* progress dots */}
          <div className="flex items-center gap-1.5 mb-6" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? 'w-8 bg-slate-900' : i < stepIndex ? 'w-1.5 bg-slate-400' : 'w-1.5 bg-slate-200'
                }`}
              />
            ))}
          </div>

          {/* controls */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={closeAndRemember}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={stepIndex === 0}
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Back
              </button>
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
              >
                {step.primaryLabel}
                {step.next ? <ArrowRight className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeTour;
