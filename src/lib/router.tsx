import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { isWeb } from './platform';

/* Path routing on the Mac (app://academic-weapon/…). On the web the page lives inside a
   claude.ai viewer whose address it cannot change, so the current path is kept in memory. */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
let memoryPath = '/';
if (!isWeb) window.addEventListener('popstate', notify);

export function normalize(p: string) {
  const s = p.replace(/\/+$/, '');
  return s === '' ? '/' : s;
}

export function navigate(to: string, replace = false) {
  if (isWeb) memoryPath = normalize(to);
  else if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  notify();
}

export function usePath() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (isWeb ? memoryPath : normalize(location.pathname)),
  );
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (/^(https?:|mailto:)/.test(href)) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={isWeb && href.startsWith('/') ? `#${href.slice(1) || 'oggi'}` : href} onClick={handle} {...rest} />;
}
