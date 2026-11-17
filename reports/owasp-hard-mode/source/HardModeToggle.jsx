// ---------------------------------------------------------------------------
// Hard Mode toggle for the OWASP scanner.
//
// Hard mode is a stricter analysis profile: lower score thresholds,
// severity floors, defence-in-depth rules, and a mandatory-control check
// that reports a category as a warning when the expected mitigation is
// absent.
//
// The toggle is a two-state segmented control. It is deliberately small
// so it sits in the scanner's command bar without crowding it.
// ---------------------------------------------------------------------------

import { ShieldAlert, ShieldCheck } from 'lucide-react';

/**
 * @param {object} props
 * @param {boolean} props.enabled   whether hard mode is on
 * @param {(v: boolean) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {string} [props.className]
 */
export default function HardModeToggle({
  enabled,
  onChange,
  disabled = false,
  className = '',
}) {
  const options = [
    { id: 'standard', label: 'Standard', hint: 'Balanced analysis tuned for teaching.' },
    { id: 'hard', label: 'Hard Mode', hint: 'Strict analysis for security reviews.' },
  ];

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-1 ${className}`}
      role="radiogroup"
      aria-label="Analysis profile"
      title="Switch between the standard scanner and the stricter Hard Mode profile"
    >
      {options.map((opt) => {
        const active = opt.id === 'hard' ? enabled : !enabled;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={opt.hint}
            onClick={() => onChange(opt.id === 'hard')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              active
                ? opt.id === 'hard'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm shadow-amber-500/25'
                  : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {opt.id === 'hard' ? (
              <ShieldAlert className="w-3.5 h-3.5" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
