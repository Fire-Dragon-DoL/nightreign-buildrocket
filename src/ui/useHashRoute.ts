import { useEffect, useState } from 'react';

export const ROUTES = ['builds', 'missing', 'sell'] as const;
export type Route = (typeof ROUTES)[number];

const parse = (hash: string): Route => {
  const name = hash.replace(/^#\/?/, '');
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'builds';
};

/** The current page, from `#/<route>` (hash routing works over file://). */
export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
