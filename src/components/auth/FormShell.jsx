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
 * Readability fix:
 *  The card was translucent enough that a bright slide behind it could
 *  wash out the heading. The fill is now more opaque, the heading area
 *  sits on an opaque panel, and a dedicated backdrop layer under the
 *  card keeps contrast stable no matter which image is showing.
 *
 * Props mirror the previous version so consumers don't need changes.
 */
const FormShell = ({ children, mounted = true, shake = false }) => {
  return (
    <div className="w-full lg:w-1/2 flex items-center justify-center px-6 sm:px-10 py-10 relative overflow-y-auto">
      {/* Readability scrim — a soft wash over the slideshow. It is
          stronger than the old 18% tint because the form has to stay
          legible over any of the twelve background images.

          In dark mode the wash is a dark one. The global dark-mode rules
          repaint the slate text colours for a dark surface, so a light
          scrim underneath them left the form card with pale text on a
          pale panel — the heading and the helper copy both disappeared. */}
      <div
        className="absolute inset-0 backdrop-blur-[3px]"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.62) 0%, rgba(248,250,252,0.74) 50%, rgba(255,255,255,0.60) 100%)',
        }}
        aria-hidden="true"
      />
      {/* The dark-mode counterpart of the scrim above. It is a separate
          element rather than a second inline style on the same one,
          because the inline `background` always wins over a class. */}
      <div
        className="absolute inset-0 backdrop-blur-[3px] hidden dark:block"
        style={{
          background:
            'linear-gradient(135deg, rgba(11,18,32,0.72) 0%, rgba(15,23,42,0.82) 50%, rgba(11,18,32,0.70) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Soft decorative orbs — now used to add colour hints through the glass */}
      <div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-25 pointer-events-none"
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
          <div className="text-base font-bold text-slate-900 dark:text-slate-100 drop-shadow-sm">
            Project Eric
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Security Platform
          </div>
        </div>
      </div>

      {/* Glass form card */}
      <div
        className={`relative z-10 w-full max-w-lg my-auto transition-all duration-700 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div
          className="p-[1.5px] rounded-3xl bg-gradient-to-br from-white/90 via-white/60 to-white/90 dark:from-slate-700/80 dark:via-slate-800/60 dark:to-slate-700/80 shadow-[0_28px_70px_-20px_rgba(15,23,42,0.35)] backdrop-blur-sm"
          style={{ animation: 'auth-fade-up 0.6s ease-out 100ms forwards' }}
        >
          <div
            className={`rounded-[22.5px] px-9 sm:px-11 py-10 relative backdrop-blur-2xl bg-white/95 dark:bg-slate-900/95 border border-white/70 dark:border-slate-700/70 shadow-inner ${
              shake ? 'animate-shake' : ''
            }`}
          >
            {children}
          </div>
        </div>

        {/* Subtle "powered by" line under the card */}
        <p
          className="text-center text-xs text-slate-600 dark:text-slate-400 mt-6 tracking-wide font-medium"
          style={{ animation: 'auth-fade-up 0.6s ease-out 500ms forwards' }}
        >
          Protected by Project Eric's zero-trust security framework
        </p>
      </div>
    </div>
  );
};

export default FormShell;
