// A small History-API router: clean URLs, a configurable base path, and scroll
// positions restored on back/forward. Enough for a docs site, no dependency.

import { AnchorHTMLAttributes, MouseEvent, useLayoutEffect, useSyncExternalStore } from 'react';

/** Base path without a trailing slash: '' at the root, '/orbs' when served from /orbs/. */
export const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

export interface Location {
  path: string;
  search: string;
  hash: string;
}

/** Split an in-app href ('/a/b?x=1#y') into its parts, normalising the path. */
export function parseHref(href: string): Location {
  const hashAt = href.indexOf('#');
  const hash = hashAt >= 0 ? href.slice(hashAt) : '';
  const rest = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const queryAt = rest.indexOf('?');
  const search = queryAt >= 0 ? rest.slice(queryAt) : '';
  const raw = queryAt >= 0 ? rest.slice(0, queryAt) : rest;
  return { path: normalisePath(raw), search: search === '?' ? '' : search, hash: hash === '#' ? '' : hash };
}

export function normalisePath(raw: string) {
  const p = ('/' + raw).replace(/\/{2,}/g, '/').replace(/\/index\.html$/, '/');
  return p.length > 1 ? p.replace(/\/+$/, '') : '/';
}

/** Strip the deploy base from a browser pathname. */
export function stripBase(pathname: string, base = BASE) {
  if (base && (pathname === base || pathname.startsWith(base + '/'))) return normalisePath(pathname.slice(base.length));
  return normalisePath(pathname);
}

export const href = (to: string) => BASE + (to.startsWith('/') ? to : '/' + to);

// ------------------------------------------------------------------ store

let snapshot: Location | null = null;
const listeners = new Set<() => void>();

function read(): Location {
  const next = { path: stripBase(window.location.pathname), search: window.location.search, hash: window.location.hash };
  if (!snapshot || snapshot.path !== next.path || snapshot.search !== next.search || snapshot.hash !== next.hash) snapshot = next;
  return snapshot;
}
const emit = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Scroll positions per history entry, so back/forward land where you were.
const scrolls = new Map<string, number>();
let entryKey = '';
let pendingScroll: { kind: 'top' } | { kind: 'restore'; y: number } | { kind: 'hash' } | null = null;
const newKey = () => Math.random().toString(36).slice(2, 10);

if (typeof window !== 'undefined') {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  entryKey = (history.state as { key?: string } | null)?.key ?? newKey();
  history.replaceState({ ...(history.state ?? {}), key: entryKey }, '');
  window.addEventListener('popstate', (e) => {
    scrolls.set(entryKey, window.scrollY);
    const key = (e.state as { key?: string } | null)?.key;
    if (key) {
      // back/forward: return to where that page was
      entryKey = key;
      pendingScroll = { kind: 'restore', y: scrolls.get(key) ?? 0 };
    } else {
      // a plain #anchor link: the browser already scrolled to it; give the entry a key
      entryKey = newKey();
      history.replaceState({ key: entryKey }, '');
      pendingScroll = null;
    }
    emit();
  });
}

export function navigate(to: string, { replace = false }: { replace?: boolean } = {}) {
  const target = parseHref(to);
  const cur = read();
  const url = href(target.path) + target.search + target.hash;
  if (replace) {
    history.replaceState({ key: entryKey }, '', url);
  } else {
    scrolls.set(entryKey, window.scrollY);
    entryKey = newKey();
    history.pushState({ key: entryKey }, '', url);
    pendingScroll = target.hash ? { kind: 'hash' } : target.path !== cur.path ? { kind: 'top' } : null;
  }
  emit();
}

export function useLocation(): Location {
  return useSyncExternalStore(subscribe, read, read);
}

/** Apply the scroll that the last navigation asked for, after the new page has rendered. */
export function useScrollManagement(loc: Location) {
  useLayoutEffect(() => {
    const p = pendingScroll;
    pendingScroll = null;
    if (!p && !loc.hash) return;
    if (p?.kind === 'top') window.scrollTo(0, 0);
    else if (p?.kind === 'restore') window.scrollTo(0, p.y);
    else if (loc.hash) {
      const el = document.getElementById(decodeURIComponent(loc.hash.slice(1)));
      if (el) el.scrollIntoView();
      else if (p?.kind === 'hash') window.scrollTo(0, 0);
    }
  }, [loc.path, loc.hash]);
}

// ------------------------------------------------------------------- Link

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  /** Mark as current when the path starts with `to` (for section links). */
  section?: boolean;
  /** Mark as current for any path this accepts, as well as `to` itself. */
  match?: (path: string) => boolean;
}

export function isActive(current: string, to: string, section = false) {
  const target = parseHref(to).path;
  if (section && target !== '/') return current === target || current.startsWith(target + '/');
  return current === target;
}

export function Link({ to, section, match, onClick, 'aria-current': ariaCurrent, ...rest }: LinkProps) {
  const loc = useLocation();
  const exact = isActive(loc.path, to) || (!section && !!match?.(loc.path));
  const inSection = isActive(loc.path, to, section) || !!match?.(loc.path);
  // a link to a part of a page (#anchor) never stands for the current page
  const current = to.includes('#') ? undefined : exact ? 'page' : inSection ? 'true' : undefined;
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (rest.target && rest.target !== '_self') return;
    e.preventDefault();
    navigate(to);
  };
  return <a {...rest} href={href(to)} onClick={handle} aria-current={current ?? ariaCurrent} />;
}
