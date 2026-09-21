import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RouterContext } from './RouterContextDefinition';

function getHashPath() {
  const hash = window.location.hash;
  if (!hash || hash === '#' || hash === '#/') {
    return '/';
  }
  // Strip leading '#'
  return hash.slice(1);
}

export function RouterProvider({ children }) {
  const [currentRoute, setCurrentRoute] = useState(getHashPath());

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentRoute(getHashPath());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((path) => {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    window.location.hash = `#${normalized}`;
    setCurrentRoute(normalized);
  }, []);

  const value = useMemo(
    () => ({
      currentRoute,
      navigate,
    }),
    [currentRoute, navigate]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function Link({ to, children, className = '', onClick, ...props }) {
  const normalized = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`;

  return (
    <a
      href={normalized}
      onClick={(e) => {
        if (onClick) onClick(e);
      }}
      className={className}
      {...props}
    >
      {children}
    </a>
  );
}

