import React, { useState } from 'react';
import { Lightbulb, X } from 'lucide-react';

/**
 * PageTip
 * A dismissible contextual banner that sits at the top of a page.
 *
 * Uses a glass-morphism surface so it blends with any background and
 * stays readable in both light and dark themes. Variants are expressed
 * via a coloured accent stripe + icon tile, not a tinted background.
 *
 *   <PageTip
 *     pageId="analysis"
 *     variant="info"
 *     title="How to scan a project"
 *     body="Click 'Run New Scan' to start a full OWASP audit. Filter results by severity or OWASP category."
 *     cta={{ label: "Read docs", href: "..." }}
 *   />
 */
const PageTip = ({
  pageId,
  variant = 'info',
  title,
  body,
  cta = null,
  dismissible = true,
}) => {
  const storageKey = `eric_pagetip_dismissed_${pageId}`;
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'true'; }
    catch { return false; }
  });

  if (hidden) return null;

  // Accent colour per variant — used for the left stripe, icon ring, and icon text.
  const accent = {
    info:    { stripe: 'bg-blue-500',     text: 'text-blue-600 dark:text-blue-400',     ring: 'ring-blue-200 dark:ring-blue-500/40' },
    success: { stripe: 'bg-emerald-500',  text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-200 dark:ring-emerald-500/40' },
    warning: { stripe: 'bg-amber-500',    text: 'text-amber-600 dark:text-amber-400',   ring: 'ring-amber-200 dark:ring-amber-500/40' },
    tip:     { stripe: 'bg-violet-500',   text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-200 dark:ring-violet-500/40' },
  }[variant] || { stripe: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-200 dark:ring-blue-500/40' };

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/40 dark:border-white/10 shadow-lg shadow-slate-900/5 dark:shadow-black/30 backdrop-blur-xl bg-white/60 dark:bg-slate-900/60 p-4 sm:p-5 mb-6"
    >
      {/* Coloured accent stripe on the left — also tints the soft glow */}
      <div className={`absolute inset-y-0 left-0 w-1.5 ${accent.stripe}`} aria-hidden="true" />
      <div className={`absolute -top-12 -left-12 w-40 h-40 rounded-full ${accent.stripe} opacity-20 blur-3xl pointer-events-none`} aria-hidden="true" />

      <div className="relative flex items-start gap-3">
        <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-white/70 dark:bg-slate-800/70 backdrop-blur-md ring-1 ${accent.ring} shadow-sm`}>
          <Lightbulb className={`w-4 h-4 ${accent.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={`text-sm font-semibold mb-1 text-slate-900 dark:text-slate-100`}>{title}</h4>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{body}</p>
          {cta && (
            <a
              href={cta.href}
              target={cta.external ? '_blank' : undefined}
              rel={cta.external ? 'noopener noreferrer' : undefined}
              onClick={(e) => {
                if (cta.onClick) {
                  e.preventDefault();
                  cta.onClick();
                }
              }}
              className={`inline-flex items-center gap-1 text-sm font-semibold mt-2 underline underline-offset-2 hover:no-underline ${accent.text}`}
            >
              {cta.label} →
            </a>
          )}
        </div>
        {dismissible && (
          <button
            onClick={() => {
              localStorage.setItem(storageKey, 'true');
              setHidden(true);
            }}
            className="flex-shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/60 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition-colors"
            aria-label="Dismiss tip"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default PageTip;
