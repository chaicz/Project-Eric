import React from 'react';

/**
 * Right form shell used by both Login and Signup.
 *
 * Glass-morphism design:
 *  - Right panel is transparent so the background slideshow shows through
 *  - A subtle white tint softens the image for readability without blocking it
 *  - The form card itself is white glass (translucent fill + heavy blur)
 *  - Gradient border ring is reduced so it doesn't look heavy against glass
 *  - Mobile-only logo pill is glass-styled too
 *
 * Props mirror the previous version so consumers don't need changes.
 */
const FormShell = ({ children, mounted = true, shake = false }) => {
  return (
    <div className="w-full lg:w-1/2 flex items-center justify-center px-6 sm:px-10 py-10 relative overflow-y-auto">
      {/* Subtle white tint over the slideshow for legibility without blocking it */}
      <div
        className="absolute inset-0 backdrop-blur-[2px]"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.15) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Soft decorative orbs — now used to add colour hints through the glass */}
      <div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-40 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(236,72,153,0.25) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Mobile-only glass logo pill */}
      <div className="absolute top-5 left-5 flex items-center gap-2 lg:hidden z-20">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500/40 blur-lg rounded-full" />
          <img
            src="/Logo.png"
            alt="Logo"
            className="relative w-9 h-9 drop-shadow"
          />
        </div>
        <div className="leading-tight">
          <div className="text-base font-bold text-slate-900 drop-shadow-sm">
            Project Eric
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-600">
            Security Platform
          </div>
        </div>
      </div>

      {/* Glass form card */}
      <div
        className={`relative z-10 w-full max-w-md my-auto transition-all duration-700 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div
          className="p-[1px] rounded-3xl bg-gradient-to-br from-white/60 via-white/30 to-white/60 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.25)] backdrop-blur-sm"
          style={{ animation: 'auth-fade-up 0.6s ease-out 100ms both' }}
        >
          <div
            className={`rounded-[23px] px-7 sm:px-9 py-8 relative backdrop-blur-2xl bg-white/65 border border-white/40 ${
              shake ? 'animate-shake' : ''
            }`}
          >
            {children}
          </div>
        </div>

        {/* Subtle "powered by" line under the card */}
        <p
          className="text-center text-[11px] text-slate-600 mt-5 tracking-wide drop-shadow-sm"
          style={{ animation: 'auth-fade-up 0.6s ease-out 500ms both' }}
        >
          Protected by Project Eric's zero-trust security framework
        </p>
      </div>
    </div>
  );
};

export default FormShell;