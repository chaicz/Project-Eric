import React from 'react';

/**
 * Illustrated day/night theme toggle.
 *
 * Visual: a pill-shaped track whose background and contents change
 * between a night sky (stars + moon on the left, clouds on the right)
 * and a day sky (clouds + sun on the right).
 *
 * The celestial body (sun or moon) slides across the track while the
 * track itself cross-fades between the two skies via CSS transitions.
 */
const W = 72;   // track width
const H = 32;   // track height
const BALL = 24; // celestial body diameter
const PAD = (H - BALL) / 2; // vertical padding

const ThemeToggle = ({ theme, onToggle }) => {
  // `theme` is the theme that is actually on screen. With the
  // 'system' option selected the AppContext resolves it to light or
  // dark, so the toggle always shows the real state.
  const isDark = theme === 'dark';

  // Position of the celestial body. Left for dark (moon), right for light (sun).
  const ballX = isDark ? PAD : W - PAD - BALL;

  // Sky gradients — matched to the reference image.
  const skyGradient = isDark
    ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #7c3aed 100%)'
    : 'linear-gradient(135deg, #bae6fd 0%, #7dd3fc 50%, #38bdf8 100%)';

  // Celestial body gradients.
  const ballGradient = isDark
    ? 'radial-gradient(circle at 32% 30%, #ffffff 0%, #e2e8f0 45%, #94a3b8 85%, #64748b 100%)'
    : 'radial-gradient(circle at 32% 30%, #fef9c3 0%, #fde047 40%, #fbbf24 75%, #f59e0b 100%)';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className="relative inline-flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 transition-transform active:scale-95"
      style={{
        width: W,
        height: H,
        background: skyGradient,
        boxShadow:
          'inset 0 1px 2px rgba(0,0,0,0.25), inset 0 -1px 1px rgba(255,255,255,0.05), 0 1px 3px rgba(0,0,0,0.15)',
      }}
    >
      {/* Dark-mode stars (fade out when going to light) */}
      <svg
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{ opacity: isDark ? 1 : 0 }}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        aria-hidden
      >
        {/* Tiny star dots scattered across the dark sky */}
        <g fill="#ffffff">
          <circle cx="14" cy="6" r="0.6" />
          <circle cx="22" cy="14" r="0.4" />
          <circle cx="32" cy="4" r="0.5" />
          <circle cx="38" cy="10" r="0.7" />
          <circle cx="46" cy="22" r="0.5" />
          <circle cx="52" cy="6" r="0.4" />
          <circle cx="58" cy="18" r="0.6" />
          <circle cx="64" cy="12" r="0.4" />
          <circle cx="28" cy="24" r="0.5" />
          <circle cx="44" cy="14" r="0.4" />
          <circle cx="68" cy="24" r="0.5" />
          <circle cx="18" cy="20" r="0.4" />
        </g>
        {/* Subtle four-point sparkles */}
        <g fill="#ffffff" opacity="0.85">
          <path d="M36 8 L36.4 9.2 L37.6 9.6 L36.4 10 L36 11.2 L35.6 10 L34.4 9.6 L35.6 9.2 Z" />
          <path d="M60 22 L60.35 23 L61.35 23.35 L60.35 23.7 L60 24.7 L59.65 23.7 L58.65 23.35 L59.65 23 Z" />
        </g>
      </svg>

      {/* Light-mode clouds (fade out when going to dark) */}
      <svg
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{ opacity: isDark ? 0 : 1 }}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        aria-hidden
      >
        {/* Soft cloud on the left */}
        <g fill="#ffffff" opacity="0.95">
          <ellipse cx="14" cy="22" rx="9" ry="3.2" />
          <ellipse cx="11" cy="20" rx="4" ry="2.6" />
          <ellipse cx="17" cy="19" rx="4.5" ry="3" />
        </g>
        {/* Smaller cloud on the bottom-right behind the sun */}
        <g fill="#ffffff" opacity="0.85">
          <ellipse cx="56" cy="27" rx="8" ry="2.6" />
          <ellipse cx="53" cy="25.5" rx="3.5" ry="2.2" />
          <ellipse cx="58" cy="24.5" rx="3.5" ry="2.4" />
        </g>
        {/* Tiny cloud top-right */}
        <g fill="#ffffff" opacity="0.7">
          <ellipse cx="65" cy="9" rx="5" ry="1.8" />
          <ellipse cx="62" cy="8" rx="2" ry="1.4" />
          <ellipse cx="67" cy="7.5" rx="2" ry="1.3" />
        </g>
      </svg>

      {/* The celestial body (slides left <-> right) */}
      <span
        className="absolute rounded-full transition-all duration-500 ease-[cubic-bezier(0.65,0,0.35,1)]"
        style={{
          width: BALL,
          height: BALL,
          left: 0,
          top: PAD,
          transform: `translateX(${ballX}px)`,
          background: ballGradient,
          boxShadow: isDark
            ? '0 0 6px rgba(255,255,255,0.25), inset -3px -4px 6px rgba(30,27,75,0.35), inset 2px 2px 4px rgba(255,255,255,0.7)'
            : '0 0 10px rgba(251,191,36,0.55), inset -3px -4px 6px rgba(180,83,9,0.25), inset 2px 2px 4px rgba(255,255,255,0.5)',
        }}
        aria-hidden
      >
        {/* Moon craters / sun details rendered inside the ball via an SVG mask overlay */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-500"
          viewBox="0 0 24 24"
          style={{ opacity: 1 }}
          aria-hidden
        >
          {isDark ? (
            <g fill="#cbd5e1" opacity="0.55">
              <circle cx="9" cy="9" r="1.6" />
              <circle cx="14" cy="13" r="2.2" />
              <circle cx="8" cy="16" r="1.1" />
              <circle cx="16" cy="7" r="0.9" />
            </g>
          ) : (
            <g fill="#fef9c3" opacity="0.9">
              <circle cx="8" cy="9" r="1.4" />
              <circle cx="15" cy="14" r="1.8" />
              <circle cx="9" cy="16" r="1" />
            </g>
          )}
        </svg>
      </span>
    </button>
  );
};

export default ThemeToggle;
