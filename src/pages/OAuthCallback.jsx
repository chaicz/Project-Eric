import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { authAPI } from '../services/api';

/**
 * The landing page for a social sign-in.
 *
 * The API performs the whole provider handshake on the server and then
 * redirects here with either an error or a one-time handoff code. This
 * page trades that code for the session and sends the person on to the
 * dashboard (or to onboarding, when the account is new).
 *
 * The code is used exactly once: the API clears the cookie that carried
 * it as soon as the exchange happens, and the code itself is dropped
 * from the address bar so it cannot be replayed from the history.
 *
 * A preview sign-in arrives here with `?preview=google` instead of a
 * handoff code. There is no account and no token: the API returns the
 * verified identity, and the browser keeps it as a local session.
 */
const OAuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser } = useApp();

  const [status, setStatus] = useState('working'); // working | error | done
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // React runs effects twice in development mode, and `useSearchParams`
    // hands back a new object on every render — so this effect would
    // re-run as soon as the status changed. The exchange is single-use,
    // so a second run would fail on a sign-in that actually worked.
    //
    // The guard below is therefore checked before anything else, and
    // the cleanup is deliberately not allowed to cancel the work that
    // is already running.
    if (started.current) return;
    started.current = true;

    const error = searchParams.get('error');
    const handoff = searchParams.get('handoff');
    const preview = searchParams.get('preview');

    if (error) {
      setStatus('error');
      setMessage(error);
      return;
    }

    // A preview sign-in has no handoff code. The exchange call reads
    // the preview cookie the API set and answers with the identity.
    if (!handoff && !preview) {
      setStatus('error');
      setMessage('This sign-in link is missing its verification code. Please try again.');
      return;
    }

    (async () => {
      try {
        const data = await authAPI.oauthExchange(handoff || '');

        const user = data?.user;
        if (!user) {
          throw new Error('The sign-in succeeded but no account was returned.');
        }

        setUser(user);
        setStatus('done');

        // Drop the code from the address bar so it stays out of the
        // history and out of a copied link.
        window.history.replaceState({}, '', '/oauth/callback');

        // A new account still has to fill in the onboarding tour. A
        // preview session has no account, so it goes straight to the
        // dashboard.
        const isPreviewSession = Boolean(data.isPreview);
        const destination = isPreviewSession
          ? '/dashboard'
          : data.isNewUser || !user.onboardingComplete
            ? '/onboarding'
            : '/dashboard';

        setTimeout(() => {
          navigate(destination, { replace: true });
        }, 900);
      } catch (err) {
        setStatus('error');
        setMessage(
          err?.message || 'The sign-in could not be completed. Please try again.'
        );
      }
    })();
  }, [searchParams, navigate, setUser]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mb-5">
            <ShieldCheck className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Project Eric
          </h1>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-8 text-center">
          {status === 'working' && (
            <>
              <Loader2 className="w-10 h-10 mx-auto mb-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Completing your sign-in
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                One moment while we finish setting up your account.
              </p>
            </>
          )}

          {status === 'done' && (
            <>
              <CheckCircle2 className="w-10 h-10 mx-auto mb-5 text-emerald-500" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                You're signed in
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Taking you to your dashboard.
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <AlertCircle className="w-10 h-10 mx-auto mb-5 text-red-500" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Sign-in failed
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                {message}
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OAuthCallback;
