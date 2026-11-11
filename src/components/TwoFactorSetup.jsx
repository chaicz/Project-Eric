/**
 * Two-Factor Authentication setup.
 *
 * The Settings page's "Two-Factor Authentication" card used to be a
 * badge that said "Not enabled" and could not be acted on. This is the
 * function behind it:
 *
 *   1. ask the API for a secret
 *   2. show it as a QR code (and as text, for an app that cannot scan)
 *   3. take a six digit code and confirm it, which turns the factor on
 *   4. show the recovery codes once, and the only time
 *
 * Turning it off again asks for the password, so a session that is
 * borrowed cannot quietly remove the second factor.
 */

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { dashboardAPI } from '../services/api';
import { useToast } from './Toast';
import {
  Shield,
  Loader2,
  Check,
  Copy,
  CheckCircle2,
  X,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';

const TwoFactorSetup = ({ initialStage = 'idle', onClose }) => {
  const { showToast } = useToast();

  // 'idle' | 'setup' | 'verify' | 'enabled' | 'disable'
  //
  // 'setup' starts the walk-through from the beginning; 'disable' opens
  // straight on the form that turns the factor off.
  const [stage, setStage] = useState(initialStage === 'disable' ? 'disable' : 'idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The secret and the QR code for it.
  const [secret, setSecret] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // The code the account types in.
  const [code, setCode] = useState('');

  // The recovery codes, shown once.
  const [recoveryCodes, setRecoveryCodes] = useState([]);

  // The password, to turn the factor off again.
  const [password, setPassword] = useState('');

  // ---- Start the setup --------------------------------------------------
  const startSetup = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await dashboardAPI.setupTwoFactor();
      setSecret(data.secret);
      setQrDataUrl(await QRCode.toDataURL(data.uri, { width: 220, margin: 1 }));
      setStage('verify');
    } catch (err) {
      setError(err?.message || 'Could not start the setup.');
    } finally {
      setBusy(false);
    }
  };

  // ---- Turn the factor on ----------------------------------------------
  const confirmCode = async (e) => {
    e.preventDefault();
    const trimmed = code.replace(/\D/g, '');
    if (trimmed.length !== 6) {
      setError('The code is six digits.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const data = await dashboardAPI.enableTwoFactor(trimmed);
      setRecoveryCodes(data.recoveryCodes || []);
      setStage('enabled');
      showToast('Two-factor authentication is now on.', 'success');
    } catch (err) {
      setError(err?.message || 'That code is not correct.');
    } finally {
      setBusy(false);
    }
  };

  // ---- Turn the factor off ----------------------------------------------
  const turnOff = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await dashboardAPI.disableTwoFactor(password);
      showToast('Two-factor authentication is now off.', 'info');
      onClose?.({ enabled: false });
    } catch (err) {
      setError(err?.message || 'Could not turn the second factor off.');
    } finally {
      setBusy(false);
    }
  };

  // ---- Copy helpers ------------------------------------------------------
  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(`Could not copy the ${what}. Select it and copy it manually.`, 'warning');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Two-factor authentication"
      data-testid="two-factor-dialog"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700/60">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Two-Factor Authentication
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A second step when you sign in
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Close"
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3 text-sm text-red-700 dark:text-red-300"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ---- Step 1: what this is ---------------------------------- */}
          {stage === 'idle' && (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                With a second factor, signing in needs your password <em>and</em> a six digit
                code from an authenticator app on your phone. Even if your password leaks, the
                account stays out of reach.
              </p>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                  Works with Google Authenticator, Authy, 1Password and any other TOTP app.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                  Recovery codes are given to you once, in case you lose the phone.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                  You can turn it off again at any time with your password.
                </li>
              </ul>
              <button
                type="button"
                onClick={startSetup}
                disabled={busy}
                data-testid="two-factor-start"
                className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {busy ? 'Preparing…' : 'Set up an authenticator app'}
              </button>
            </>
          )}

          {/* ---- Step 2: scan the code -------------------------------- */}
          {stage === 'verify' && (
            <>
              <div className="flex flex-col items-center gap-3">
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt="QR code for the authenticator app"
                    className="w-56 h-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-2"
                  />
                )}
                <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
                  Scan this code with your authenticator app, or type the key below by hand.
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Setup key
                </p>
                <div className="flex items-center gap-2">
                  <code
                    data-testid="two-factor-secret"
                    className="flex-1 font-mono text-sm tracking-widest text-slate-800 dark:text-slate-100 break-all"
                  >
                    {secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(secret, 'setup key')}
                    aria-label="Copy the setup key"
                    className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <form onSubmit={confirmCode} className="space-y-3">
                <div>
                  <label
                    htmlFor="two-factor-code"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                  >
                    The six digit code from the app
                  </label>
                  <input
                    id="two-factor-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    data-testid="two-factor-code"
                    className="minimal-input text-center font-mono text-2xl tracking-[0.5em]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || code.length !== 6}
                  data-testid="two-factor-confirm"
                  className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  {busy ? 'Checking…' : 'Turn on two-factor authentication'}
                </button>
              </form>
            </>
          )}

          {/* ---- Step 3: the recovery codes ---------------------------- */}
          {stage === 'enabled' && (
            <>
              <div className="flex items-start gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-3 text-sm text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Two-factor authentication is on. Your account now needs a code to sign in.</span>
              </div>

              <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Save your recovery codes
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 mb-3">
                  Each code works once, and only if you lose the phone. They are shown here and
                  nowhere else.
                </p>
                <ul
                  data-testid="two-factor-recovery-codes"
                  className="grid grid-cols-2 gap-2 font-mono text-sm text-amber-900 dark:text-amber-100"
                >
                  {recoveryCodes.map((c) => (
                    <li key={c} className="bg-white/70 dark:bg-slate-900/50 rounded px-2 py-1 text-center">
                      {c}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => copy(recoveryCodes.join('\n'), 'recovery codes')}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:underline"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy all codes'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => onClose?.({ enabled: true })}
                data-testid="two-factor-done"
                className="w-full btn-primary"
              >
                Done
              </button>
            </>
          )}

          {/* ---- Turning it off ---------------------------------------- */}
          {stage === 'disable' && (
            <form onSubmit={turnOff} className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Confirm your password to turn the second factor off. Without it, a borrowed
                session could not remove the protection.
              </p>
              <div>
                <label
                  htmlFor="two-factor-password"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  Your password
                </label>
                <input
                  id="two-factor-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="two-factor-password"
                  className="minimal-input"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !password}
                data-testid="two-factor-disable-confirm"
                className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {busy ? 'Turning off…' : 'Turn off two-factor authentication'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default TwoFactorSetup;
