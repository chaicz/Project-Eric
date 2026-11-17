import React from 'react';

/**
 * Refined text input used across the auth forms.
 *
 * New design (replaces the old dark-overlay input):
 *  - Light surface that matches the new white form card
 *  - Floating-label style (label is always visible, but tightens on focus/value)
 *  - Soft slate border that animates to indigo on focus, with a halo ring
 *  - Inline error/valid accent colors
 *  - Optional trailing accessory (e.g. password toggle, validation check)
 */
const AuthInput = ({
  id,
  label,
  type = 'text',
  value,
  onChange,
  onFocus,
  onBlur,
  focused,
  Icon,
  placeholder,
  hasError = false,
  errorMessage,
  rightAccessory,
  showValidIcon = false,
  isValid = false,
  delay = 0,
  shake = false,
  shakeTrigger = false,
  autoComplete,
}) => {
  const showShake = shake && shakeTrigger;
  const wrapperClass = `relative ${showShake ? 'animate-shake' : ''}`;

  const isFloating = focused || (value && String(value).length > 0);

  // When the input is at rest, the label should sit where the input text
  // starts (pl-12 = 48px, just past the 20px icon at left-4). When floated
  // up, it sits on the border at left-3 so the small label stays compact.
  //
  // The horizontal offset must be decided in exactly one place. Emitting a
  // base `left-3` and then appending `left-12` puts both utilities in the
  // class list, and Tailwind resolves the winner by stylesheet order rather
  // than class order — `left-3` won and the label landed on top of the
  // leading icon, striking through the first characters of every field.
  // So each branch below carries its own complete `left-*` value and the
  // shared class string never sets one.
  const labelFloat = isFloating
    ? '-top-2 left-3 text-[11px] font-semibold px-1.5'
    : `top-1/2 -translate-y-1/2 text-[15px] font-medium ${
        Icon ? 'left-12' : 'left-4'
      }`;

  const labelColor = hasError
    ? 'text-red-600'
    : focused
    ? 'text-indigo-600'
    : 'text-slate-600';

  // The floated label sits on the field's own surface, so it must match
  // that surface or a visible seam appears across the border.
  const labelBg = isFloating ? 'bg-white dark:bg-slate-900' : 'bg-transparent';

  return (
    <div
      className="space-y-2"
      style={{
        opacity: 0,
        animation: `auth-fade-up 0.5s ease-out ${delay}ms forwards`,
      }}
    >
      {/* Field wrapper */}
      <div className={wrapperClass}>
        {/* Floating label */}
        {label && (
          <label
            htmlFor={id}
            className={`absolute z-10 pointer-events-none transition-all duration-200 ease-out rounded ${labelFloat} ${labelColor} ${labelBg}`}
          >
            {label}
          </label>
        )}

        {/* Leading icon */}
        {Icon && (
          <Icon
            className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-200 ${
              hasError
                ? 'text-red-500'
                : focused
                ? 'text-indigo-500'
                : 'text-slate-400'
            }`}
          />
        )}

        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          autoComplete={autoComplete}
          className={`w-full ${
            Icon ? 'pl-12' : 'pl-4'
          } ${rightAccessory ? 'pr-12' : 'pr-4'} pt-5 pb-3 rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-[15px] placeholder-slate-400 outline-none transition-all duration-200 ${
            hasError
              ? 'border-red-400 ring-2 ring-red-100 dark:ring-red-500/20 bg-red-50/60 dark:bg-red-500/10'
              : focused
              ? 'border-indigo-500 ring-4 ring-indigo-100/80 dark:ring-indigo-500/20 shadow-[0_4px_18px_-6px_rgba(99,102,241,0.35)]'
              : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 shadow-[0_2px_8px_-3px_rgba(15,23,42,0.06)]'
          }`}
          placeholder={focused ? placeholder : ''}
        />

        {/* Valid icon */}
        {showValidIcon && isValid && !hasError && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-200 animate-scale-in">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
        )}

        {/* Right accessory */}
        {rightAccessory && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {rightAccessory}
          </div>
        )}
      </div>

      {/* Error message */}
      {hasError && errorMessage && (
        <p className="text-xs text-red-600 flex items-center gap-1.5 pl-1 font-medium">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          {errorMessage}
        </p>
      )}
    </div>
  );
};

export default AuthInput;