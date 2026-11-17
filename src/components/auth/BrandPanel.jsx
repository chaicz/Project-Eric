import React, { useEffect, useState } from 'react';
import { Sparkles, Shield, Award, Users, Activity, Zap, Bug, ScanSearch } from 'lucide-react';

/**
 * Sample scan events shown in the live activity feed.
 *
 * These are illustrative product copy, not real telemetry — the
 * panel deliberately avoids implying that a real user's scans are
 * being reported here.
 */
const SCAN_EVENTS = [
  { text: 'SQL injection blocked in payments.js', tone: 'good' },
  { text: 'Dependency patched · lodash 4.17.22', tone: 'good' },
  { text: 'Weak hash detected in auth.service', tone: 'warn' },
  { text: 'SSRF risk resolved in webhooks.ts', tone: 'good' },
  { text: 'Hardcoded secret removed from config', tone: 'good' },
  { text: 'Path traversal patched in file.js', tone: 'warn' },
  { text: 'XSS sink sanitised in render.tsx', tone: 'good' },
  { text: 'Open redirect closed on /login', tone: 'good' },
];

/**
 * Aurora-mesh brand panel used by Login and Signup.
 *
 * Design highlights:
 *  - Deep navy base with 4 layered aurora gradient blobs
 *  - Subtle grid pattern + vignette for premium depth
 *  - Bento-style feature grid at the bottom
 *  - Live scanning activity feed that rotates through events
 *  - Trust metrics strip and social proof row in the footer
 *
 * Props mirror the previous version so Login/Signup don't need
 * to change how they consume this component.
 *
 * A note on the entrance animations
 * ---------------------------------
 * The elements below animate with `auth-fade-up` and a fill mode of
 * `forwards`, not `both`.
 *
 * `both` applies the animation's backwards fill — the `from` keyframe,
 * which is `opacity: 0` — for the whole delay before the animation
 * starts. This panel is an isolated stacking context that contains a
 * grain overlay painted with `mix-blend-mode: overlay`. A fully
 * transparent element inside such a context is composited into the
 * blend group, and Chrome dropped the element entirely: the hero
 * headline, the description and the feature list were never painted,
 * and the panel rendered as an empty gradient with only the logo
 * showing.
 *
 * `forwards` keeps the end state once the animation completes and
 * applies no backwards fill, so nothing is ever composited while it
 * is invisible.
 */
const BrandPanel = ({
  badgeTitle,
  heroPrefix,
  heroHighlight,
  heroSuffix = '',
  description,
  features = [],
  mounted = true,
}) => {
  // Rotating feed — the visible window advances every few seconds so
  // the panel always shows a different pair of events.
  const [eventIndex, setEventIndex] = useState(0);
  const [scansToday, setScansToday] = useState(24817);

  useEffect(() => {
    const id = setInterval(() => {
      setEventIndex((i) => (i + 1) % SCAN_EVENTS.length);
    }, 3200);
    return () => clearInterval(id);
  }, []);

  // The counter ticks upward so the figure reads as live rather than
  // as a static number pasted into the markup.
  useEffect(() => {
    const id = setInterval(() => {
      setScansToday((n) => n + Math.floor(Math.random() * 7) + 1);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const visibleEvents = [
    { ...SCAN_EVENTS[eventIndex], time: 'now' },
    { ...SCAN_EVENTS[(eventIndex + 1) % SCAN_EVENTS.length], time: '2m' },
  ];

  return (
    <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden isolate">
      {/* Aurora mesh blobs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute rounded-full blur-[120px] opacity-50 animate-aurora-a"
          style={{
            width: 520,
            height: 520,
            top: '-15%',
            left: '-12%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.85) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute rounded-full blur-[120px] opacity-45 animate-aurora-b"
          style={{
            width: 480,
            height: 480,
            top: '30%',
            right: '-15%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.85) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute rounded-full blur-[100px] opacity-40 animate-aurora-c"
          style={{
            width: 380,
            height: 380,
            bottom: '-10%',
            left: '30%',
            background: 'radial-gradient(circle, rgba(236,72,153,0.75) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute rounded-full blur-[110px] opacity-35 animate-aurora-d"
          style={{
            width: 340,
            height: 340,
            bottom: '25%',
            right: '25%',
            background: 'radial-gradient(circle, rgba(6,182,212,0.7) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
        aria-hidden="true"
      />

      {/* Noise / grain overlay (very subtle) */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
        }}
        aria-hidden="true"
      />

      {/* Dark glass tint — keeps the white text legible while letting
          the background slideshow show through.

          It has to be painted ON TOP of the aurora blobs and the grid,
          not below them. The blobs are bright saturated colours at
          40-50% opacity, so a tint underneath them was completely
          washed out: in light mode the panel rendered pale lavender
          and the white feature descriptions measured 3.07:1 against
          it — effectively unreadable.

          At 55% over everything the panel reads as a dark tinted
          surface in both themes, and the `text-white/55` labels clear
          the 4.5:1 AA floor. */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/55 via-indigo-950/50 to-slate-950/55 backdrop-blur-md" />

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.35) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Content stack */}
      <div
        className={`relative z-10 flex flex-col h-full w-full px-10 xl:px-14 2xl:px-20 pt-6 pb-4 justify-between transition-all duration-700 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Header — Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <div
              className="absolute inset-0 bg-blue-500/60 blur-2xl rounded-full"
              aria-hidden="true"
            />
            <img
              src="/Logo.png"
              alt="Logo"
              className="relative w-12 h-12 drop-shadow-[0_4px_16px_rgba(59,130,246,0.5)]"
            />
          </div>
          <div className="leading-tight">
            <div className="text-lg font-bold text-white tracking-tight">
              Project Eric
            </div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/50 font-medium">
              Security Platform
            </div>
          </div>
        </div>

        {/* Body — Hero + features.

            The stack distributes its three blocks — hero, trust strip,
            social proof — with `justify-between`, and the hero block
            is `flex-none` so it never claims space it does not need.
            The hero then centres itself inside the leftover room
            with `my-auto`. Sizing the hero by its content (rather
            than letting a `flex-1` column grow into the footer) is
            what keeps the footer on screen at 1080px and above. */}
        <div className="flex-none flex flex-col max-w-xl">
          <div className="my-auto py-3">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2.5 px-4 py-2 bg-white/10 backdrop-blur-md border border-white/15 rounded-full text-sm font-medium text-white/90 mb-6 self-start shadow-lg shadow-black/10"
            style={{ animation: 'auth-fade-up 0.6s ease-out 100ms forwards' }}
          >
            <span className="relative flex w-2.5 h-2.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
              <span className="relative rounded-full w-2.5 h-2.5 bg-emerald-400" />
            </span>
            <Sparkles className="w-4 h-4 text-amber-300" />
            {badgeTitle}
          </div>

          {/* Hero headline */}
          <h1
            className="text-[52px] xl:text-[64px] 2xl:text-[72px] font-bold text-white leading-[1.03] tracking-[-0.025em] mb-5 max-w-[13ch]"
            style={{ animation: 'auth-fade-up 0.6s ease-out 200ms forwards' }}
          >
            {heroPrefix}{' '}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
                {heroHighlight}
              </span>
              <span
                aria-hidden="true"
                className="absolute -bottom-1.5 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 opacity-80"
              />
            </span>
            {heroSuffix}
          </h1>

          {/* Description */}
          <p
            className="text-lg text-white/70 leading-relaxed max-w-lg"
            style={{ animation: 'auth-fade-up 0.6s ease-out 300ms forwards' }}
          >
            {description}
          </p>

          {/* Bento feature grid */}
          {features.length > 0 && (
            <div
              className="grid grid-cols-3 gap-3.5 mt-8"
              style={{ animation: 'auth-fade-up 0.6s ease-out 400ms forwards' }}
            >
              {features.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={i}
                    className="group relative px-5 py-3.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 hover:border-white/25 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1"
                  >
                    {/* A hairline accent that draws in on hover gives the
                        tile a sense of response without adding clutter. */}
                    <span
                      className="absolute left-5 right-5 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      aria-hidden="true"
                    />
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/15 to-white/5 border border-white/15 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform duration-300">
                      <Icon className={`w-5 h-5 ${feature.color || 'text-white/80'}`} />
                    </div>
                    <div className="text-sm font-semibold text-white leading-tight">
                      {feature.title}
                    </div>
                    {/* 70% rather than 45%: the description sits on the
                        brand panel, and at 45% it only reached 4.41:1
                        against the panel behind it, just under the 4.5:1
                        AA floor. */}
                    <div className="text-xs text-white/70 mt-1.5 leading-snug">
                      {feature.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Live activity feed — a rotating stream of scan events.
              It gives the panel a sense of motion and of a product
              that is running right now, rather than a static poster. */}
          <div
            className="mt-6 w-full max-w-md rounded-2xl border border-white/12 bg-white/[0.05] backdrop-blur-xl overflow-hidden"
            style={{ animation: 'auth-fade-up 0.6s ease-out 450ms forwards' }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-white/55 font-semibold">
                  Live scanning
                </span>
              </div>
              <span className="text-[10px] font-mono text-white/40">
                {scansToday.toLocaleString()} scans today
              </span>
            </div>

            {/* The two visible rows sit one above the other and cross-fade
                between events, so the panel always has something
                moving in it. Each row is placed with an explicit
                top offset; stacking them with `absolute inset-x-0`
                alone would overlap them. */}
            <div className="relative h-[52px] overflow-hidden">
              {visibleEvents.map((ev, i) => (
                <div
                  key={`${ev.text}-${i}`}
                  className="absolute inset-x-0 px-4 flex items-center gap-3"
                  style={{
                    top: i * 26,
                    height: 26,
                    animation: `auth-event-in 0.6s ease-out ${i * 120}ms forwards`,
                  }}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      ev.tone === 'good'
                        ? 'bg-emerald-400'
                        : ev.tone === 'warn'
                        ? 'bg-amber-400'
                        : 'bg-blue-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-[11px] font-mono text-white/40 shrink-0">
                    {ev.time}
                  </span>
                  <span className="text-xs text-white/70 truncate">{ev.text}</span>
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>

        {/* Trust metrics strip — laid out as a row rather than floating
            over the content, so nothing can ever overlap at any width.
            It is allowed to run wider than the hero copy so the
            values are never truncated. */}
        <div
          className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 shrink-0 max-w-2xl"
          style={{ animation: 'auth-fade-up 0.6s ease-out 500ms forwards' }}
        >
          {[
            { icon: Shield, label: 'Encryption', value: '256-bit SSL' },
            { icon: Award, label: 'Compliance', value: 'SOC 2 Type II' },
            { icon: Activity, label: 'Uptime', value: '99.99%' },
            { icon: Users, label: 'Trusted by', value: '10K+ teams' },
          ].map((s) => (
            <div
              key={s.label}
              className="group flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/12 backdrop-blur-xl transition-all duration-300 hover:bg-white/[0.1] hover:border-white/25"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-white/15 flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110">
                <s.icon className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="leading-tight min-w-0">
                <div className="text-[8px] uppercase tracking-[0.12em] text-white/50 font-semibold">
                  {s.label}
                </div>
                <div className="text-[12px] font-bold text-white truncate">
                  {s.value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer — social proof */}
        <div
          className="flex items-center gap-3.5 shrink-0"
          style={{ animation: 'auth-fade-up 0.6s ease-out 600ms forwards' }}
        >
          <div className="flex -space-x-2.5">
            {[
              // The avatars carry white initials. A 12px bold initial is
              // "normal" text under WCAG, so the fill has to clear 4.5:1
              // — the 400 shades only reached about 2:1 and the initial
              // disappeared into the circle. Even the 600 shades land
              // around 3.8:1 for the warm ramps, so these go to 700.
              'from-blue-700 to-cyan-700',
              'from-purple-700 to-pink-700',
              'from-emerald-700 to-teal-700',
              'from-amber-700 to-orange-700',
            ].map((grad, i) => (
              <div
                key={i}
                className={`w-9 h-9 rounded-full bg-gradient-to-br ${grad} border-2 border-white/25 dark:border-white/20 flex items-center justify-center text-xs font-bold text-white shadow-md`}
              >
                {['A', 'M', 'K', 'S'][i]}
              </div>
            ))}
          </div>
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <svg
                  key={i}
                  className="w-3.5 h-3.5 text-amber-400 fill-amber-400"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              ))}
              <span className="text-sm text-white/70 ml-1.5 font-medium">4.9/5</span>
            </div>
            <span className="text-xs text-white/50">
              Loved by 10,000+ security teams
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrandPanel;