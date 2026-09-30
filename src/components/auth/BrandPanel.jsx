import React from 'react';
import { Sparkles, Shield, Award, Users, Activity, Zap, Bug, ScanSearch } from 'lucide-react';

/**
 * Aurora-mesh brand panel used by Login and Signup.
 *
 * Design highlights:
 *  - Deep navy base with 4 layered aurora gradient blobs
 *  - Subtle grid pattern + vignette for premium depth
 *  - Floating glass "stat cards" showcasing trust metrics
 *  - Gradient-text hero headline
 *  - Bento-style feature grid at the bottom
 *
 * Props mirror the previous version so Login/Signup don't need
 * to change how they consume this component.
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
  return (
    <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden isolate">
      {/* Dark glass tint — keeps white text legible while letting the
          background slideshow show through. */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/55 via-indigo-950/50 to-slate-950/55 backdrop-blur-md" />

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

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.35) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Floating glass stat cards — premium trust badges */}
      <FloatingStat
        icon={Shield}
        label="Encryption"
        value="256-bit SSL"
        sublabel="End-to-end"
        position={{ top: '14%', left: '6%' }}
        delay={0}
      />
      <FloatingStat
        icon={Award}
        label="Compliance"
        value="SOC 2"
        sublabel="Type II Ready"
        position={{ top: '20%', right: '7%' }}
        delay={0.7}
      />
      <FloatingStat
        icon={Activity}
        label="Uptime"
        value="99.99%"
        sublabel="Last 12 months"
        position={{ bottom: '24%', left: '5%' }}
        delay={1.4}
      />
      <FloatingStat
        icon={Users}
        label="Trusted by"
        value="10K+"
        sublabel="Security teams"
        position={{ bottom: '18%', right: '6%' }}
        delay={2.1}
      />

      {/* Content stack */}
      <div
        className={`relative z-10 flex flex-col h-full w-full px-14 xl:px-20 py-10 transition-all duration-700 ${
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
              className="relative w-11 h-11 drop-shadow-[0_4px_16px_rgba(59,130,246,0.5)]"
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

        {/* Body — Hero + features */}
        <div className="flex-1 flex flex-col justify-center max-w-xl py-12">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/8 backdrop-blur-md border border-white/15 rounded-full text-xs font-medium text-white/90 mb-7 self-start shadow-lg shadow-black/10"
            style={{ animation: 'auth-fade-up 0.6s ease-out 100ms both' }}
          >
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
              <span className="relative rounded-full w-2 h-2 bg-emerald-400" />
            </span>
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            {badgeTitle}
          </div>

          {/* Hero headline */}
          <h1
            className="text-[44px] xl:text-[56px] font-bold text-white leading-[1.05] tracking-[-0.02em] mb-5"
            style={{ animation: 'auth-fade-up 0.6s ease-out 200ms both' }}
          >
            {heroPrefix}{' '}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
                {heroHighlight}
              </span>
              <span
                aria-hidden="true"
                className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 opacity-80"
              />
            </span>
            {heroSuffix}
          </h1>

          {/* Description */}
          <p
            className="text-base text-white/65 leading-relaxed max-w-md"
            style={{ animation: 'auth-fade-up 0.6s ease-out 300ms both' }}
          >
            {description}
          </p>

          {/* Bento feature grid */}
          {features.length > 0 && (
            <div
              className="grid grid-cols-3 gap-3 mt-10"
              style={{ animation: 'auth-fade-up 0.6s ease-out 400ms both' }}
            >
              {features.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={i}
                    className="group relative px-4 py-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 hover:border-white/20 backdrop-blur-sm transition-all duration-300"
                  >
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300">
                      <Icon className={`w-4 h-4 ${feature.color || 'text-white/80'}`} />
                    </div>
                    <div className="text-[13px] font-semibold text-white leading-tight">
                      {feature.title}
                    </div>
                    <div className="text-[11px] text-white/45 mt-1 leading-snug">
                      {feature.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — social proof */}
        <div
          className="flex items-center gap-3 shrink-0"
          style={{ animation: 'auth-fade-up 0.6s ease-out 600ms both' }}
        >
          <div className="flex -space-x-2">
            {[
              'from-blue-400 to-cyan-400',
              'from-purple-400 to-pink-400',
              'from-emerald-400 to-teal-400',
              'from-amber-400 to-orange-400',
            ].map((grad, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-full bg-gradient-to-br ${grad} border-2 border-[#0a0a1f] flex items-center justify-center text-[10px] font-bold text-white shadow-md`}
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
                  className="w-3 h-3 text-amber-400 fill-amber-400"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              ))}
              <span className="text-xs text-white/70 ml-1 font-medium">4.9/5</span>
            </div>
            <span className="text-[11px] text-white/45">
              Loved by 10,000+ security teams
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Floating glass stat card                                           */
/* ------------------------------------------------------------------ */
const FloatingStat = ({ icon: Icon, label, value, sublabel, position, delay }) => (
  <div
    className="absolute z-10 hidden xl:block"
    style={{
      ...position,
      animation: 'auth-float-stat 7s ease-in-out infinite',
      animationDelay: `${delay}s`,
    }}
  >
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/15 shadow-2xl shadow-black/30">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-white/15 flex items-center justify-center">
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="leading-tight">
        <div className="text-[9px] uppercase tracking-[0.15em] text-white/45 font-semibold">
          {label}
        </div>
        <div className="text-sm font-bold text-white">{value}</div>
        <div className="text-[10px] text-white/50">{sublabel}</div>
      </div>
    </div>
  </div>
);

export default BrandPanel;