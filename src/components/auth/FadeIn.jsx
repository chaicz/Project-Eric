import React from 'react';

/**
 * Lightweight enter-animation wrapper. Uses pure CSS so it works on the
 * initial mount of the page without any scroll triggers.
 */
const FadeIn = ({ delay = 0, className = '', children }) => (
  <div
    className={className}
    style={{
      opacity: 0,
      animation: 'auth-fade-up 0.5s ease-out forwards',
      animationDelay: `${delay}ms`,
    }}
  >
    {children}
  </div>
);

export default FadeIn;
