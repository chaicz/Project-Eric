import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * PageTransition wraps each page and applies a fade + slide-up effect
 * whenever the route changes. The `key` on the inner div causes a
 * fresh mount per route, which restarts the CSS animation.
 *
 * The blur is applied to an inner layer rather than the wrapper
 * itself. A `filter` on an ancestor establishes a containing block
 * for `position: fixed` descendants, which would make every fixed
 * element (sticky headers, floating nav) size and position itself
 * against the full document height instead of the viewport.
 */
const PageTransition = ({ children }) => {
  const location = useLocation();
  const [transitionKey, setTransitionKey] = useState(location.pathname);

  useEffect(() => {
    // Update the key whenever the route changes so the wrapper remounts
    setTransitionKey(location.pathname);
  }, [location.pathname]);

  return (
    <div key={transitionKey} className="page-transition-wrapper">
      <div className="page-transition-inner animate-pageTransition">
        {children}
      </div>
    </div>
  );
};

export default PageTransition;
