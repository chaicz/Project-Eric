/**
 * Provider sign-in buttons for Google and GitHub.
 *
 * The Google button signs you in as a preset identity that lives in
 * the browser. It does not open Google's website, it does not request
 * OAuth credentials, and it does not write anything to the database —
 * the whole sign-in happens in the page.
 *
 * The GitHub button keeps the server-side OAuth flow. The API owns the
 * client secret, exchanges the authorization code, and issues the
 * Project Eric session, so the browser never handles a provider token.
 */

import React, { useState } from 'react';
import { Github } from 'lucide-react';
import { authAPI, API_BASE_URL } from '../../services/api';

const PROVIDER_ICONS = {
  google: (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.14c1.84-1.69 2.91-4.18 2.91-7.41Z"
      />
      <path
        fill="#34A853"
        d="M12 21.72c2.62 0 4.82-.87 6.43-2.36l-3.14-2.44c-.87.58-1.98.93-3.29.93-2.53 0-4.67-1.71-5.44-4.01H3.31v2.52A9.7 9.7 0 0 0 12 21.72Z"
      />
      <path
        fill="#FBBC05"
        d="M6.56 13.84A5.84 5.84 0 0 1 6.26 12c0-.64.11-1.26.3-1.84V7.64H3.31A9.7 9.7 0 0 0 2.3 12c0 1.56.37 3.03 1.01 4.36l3.25-2.52Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.15c1.43 0 2.71.49 3.72 1.45l2.79-2.79A9.36 9.36 0 0 0 12 2.3a9.7 9.7 0 0 0-8.69 5.34l3.25 2.52c.77-2.3 2.91-4.01 5.44-4.01Z"
      />
    </svg>
  ),
  github: <Github className="w-[18px] h-[18px]" aria-hidden="true" />,
};

const PROVIDER_LABELS = {
  google: 'Google',
  github: 'GitHub',
};

export default function SocialAuthButtons({
  action = 'login',
  disabled = false,
  onError,
  compact = false,
  dividerLabel,
  preview = false,
  onPreviewLogin,
}) {
  const [loadingProvider, setLoadingProvider] = useState(null);

  const startProviderLogin = (provider) => {
    setLoadingProvider(provider);

    // Google is a preset sign-in. It never redirects to Google and
    // never contacts the API. The parent signs the browser in as the
    // preset identity and sends the person to the app.
    if (provider === 'google') {
      try {
        onPreviewLogin?.();
      } catch (error) {
        setLoadingProvider(null);
        onError?.(error?.message || 'The preview sign-in could not be started.');
      }
      return;
    }

    const target = `${API_BASE_URL}/auth/oauth/${provider}/start`;
    window.location.assign(target);
  };

  const visibleProviders = ['google', 'github'];

  // The label above the buttons. On the login page it separates the
  // social options from the email form below them; on the sign-up page
  // it separates them from the email form above them.
  const label =
    dividerLabel ?? (action === 'signup' ? 'or sign up with' : 'or continue with');

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-slate-700" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-3.5 bg-white dark:bg-slate-900 text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold">
            {label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {visibleProviders.map((provider) => {
          const isLoading = loadingProvider === provider;
          const isPreview = provider === 'google';
          return (
            <button
              key={provider}
              type="button"
              disabled={disabled || loadingProvider !== null}
              onClick={() => startProviderLogin(provider)}
              data-testid={`${action}-${provider}-button`}
              className="group flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold text-[13px] transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span
                  className="w-[18px] h-[18px] rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                PROVIDER_ICONS[provider]
              )}
              <span>{isLoading ? 'Connecting...' : `Continue with ${PROVIDER_LABELS[provider] || provider}`}</span>
              {isPreview && (
                <span
                  className="ml-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700"
                  title="Preset sign-in — no Google account and nothing is saved to the database"
                >
                  Preset
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        Google sign-in uses a preset account that is set up in this browser. No Google account is
        requested, and nothing is saved to the database.
      </p>
    </div>
  );
}
