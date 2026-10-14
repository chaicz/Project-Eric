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
  const restLeft = Icon ? 'left-12' : 'left-4';
  const labelFloat = isFloating
    ? '-top-2 left-3 text-[11px] font-semibold px-1.5'
    : `top-1/2 -translate-y-1/2 text-[15px] font-medium ${restLeft}`;

  const labelColor = hasError
    ? 'text-red-500'
    : focused
    ? 'text-indigo-600'
    : 'text-slate-500';

  const labelBg = isFloating ? 'bg-white/80 backdrop-blur-sm' : 'bg-transparent';

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
            className={`absolute left-3 z-10 pointer-events-none transition-all duration-200 ease-out rounded ${labelFloat} ${labelColor} ${labelBg}`}
          >
            {label}
          </label>
        )}

        {/* Leading icon */}
        {Icon && (
          <Icon
            className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-200 ${
              hasError
                ? 'text-red-400'
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
          } ${rightAccessory ? 'pr-12' : 'pr-4'} pt-5 pb-3 rounded-xl border bg-white/70 backdrop-blur-sm text-slate-900 text-[15px] placeholder-slate-400 outline-none transition-all duration-200 ${
            hasError
              ? 'border-red-300/80 ring-2 ring-red-100/70 bg-red-50/70'
              : focused
              ? 'border-indigo-400 ring-4 ring-indigo-100/70 shadow-[0_4px_18px_-6px_rgba(99,102,241,0.35)] bg-white/85'
              : 'border-white/60 hover:border-white/80 shadow-[0_2px_8px_-3px_rgba(15,23,42,0.06)]'
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
        <p className="text-xs text-red-500 flex items-center gap-1.5 pl-1">
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