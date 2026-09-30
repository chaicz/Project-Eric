import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * PageTransition wraps each page and applies a fade + slide-up effect
 * whenever the route changes. The `key` on the inner div causes a
 * fresh mount per route, which restarts the CSS animation.
 */
const PageTransition = ({ children }) => {
  const location = useLocation();
  const [transitionKey, setTransitionKey] = useState(location.pathname);

  useEffect(() => {
    // Update the key whenever the route changes so the wrapper remounts
    setTransitionKey(location.pathname);
  }, [location.pathname]);

  return (
    <div
      key={transitionKey}
      className="page-transition-wrapper animate-pageTransition"
    >
      {children}
    </div>
  );
};

export default PageTransition;
