// What the workspace's modal parts share: whether the screen is wide enough for the side-by-side layout, and keeping Tab
// inside a drawer or sheet while it is modal.

import { useCallback, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';

/** From here up the rail and canvas sit beside the conversation; below it they are a drawer and a sheet. */
export const WIDE_QUERY = '(min-width: 1024px)';

export function useWide(): boolean {
  const subscribe = useCallback((fn: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mq = window.matchMedia(WIDE_QUERY);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(WIDE_QUERY).matches : true),
    () => true,
  );
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden && el.getClientRects().length > 0);
}

/** Keeps Tab and Shift+Tab cycling inside `root`. Call from the modal element's keydown handler. */
export function trapTab(e: KeyboardEvent<HTMLElement>, root: HTMLElement | null): void {
  if (e.key !== 'Tab' || !root) return;
  const items = focusables(root);
  if (!items.length) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = root.contains(active);
  if (e.shiftKey && (active === first || active === root || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

/** A focusable element that is still on screen, or null. */
export function stillThere(el: HTMLElement | null): HTMLElement | null {
  return el && el.isConnected && el.getClientRects().length > 0 ? el : null;
}
