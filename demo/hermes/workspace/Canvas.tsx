// The canvas: where Hermes shows a dashboard. Beside the conversation from 1024px (a labelled aside), a full-screen modal
// sheet below that (Tab stays inside, Esc closes). Opening moves focus to it; closing returns focus to what opened it.

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { focusComposer } from '../../assistant/Composer';
import { navigate, useLocation } from '../../site/router';
import { HERMES_ROOT } from '../config';
import { stillThere, trapTab, useWide } from './focus';

export function Canvas({ title, view }: { title: string; view: ReactNode }) {
  const wide = useWide();
  const { path } = useLocation();
  const ref = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // remember what had focus when the canvas opened, and give it back when the canvas closes
  useLayoutEffect(() => {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    const self = ref.current;
    return () => {
      const back = opener.current;
      // after the layout without the canvas is on screen; under StrictMode's remount the canvas is still here, so skip
      setTimeout(() => {
        if (self?.isConnected) return;
        const target = stillThere(back);
        if (target) target.focus();
        else focusComposer();
      }, 0);
    };
  }, []);

  // a new address (or a new layout) starts at the top, with focus on the canvas so it is announced; switching user can
  // retitle the same address (a project becomes Not found), which is not a navigation, so focus stays where it was
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    ref.current?.focus({ preventScroll: true });
  }, [path, wide]);

  // the sheet covers the conversation, so the page behind it must not scroll
  useEffect(() => {
    if (wide) return;
    const root = document.documentElement;
    root.dataset.sheet = 'open';
    return () => {
      delete root.dataset.sheet;
    };
  }, [wide]);

  const close = () => navigate(HERMES_ROOT);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (wide) return;
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      close();
      return;
    }
    trapTab(e, ref.current);
  };

  const head = (
    <div className="canvas-head">
      {/* the view's own h2 names it for assistive tech; this is the title you see, kept while the view scrolls */}
      <p className="canvas-title" aria-hidden="true">
        {title}
      </p>
      <button type="button" className="icon-btn canvas-close" onClick={close} aria-label="Close" title="Close">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
  const body = (
    <div className="canvas-body" ref={bodyRef}>
      {view}
    </div>
  );

  return wide ? (
    <aside ref={ref} className="canvas" data-canvas="" data-mode="side" aria-label={title} tabIndex={-1} onKeyDown={onKeyDown}>
      {head}
      {body}
    </aside>
  ) : (
    <div
      ref={ref as RefObject<HTMLDivElement>}
      className="canvas"
      data-canvas=""
      data-mode="sheet"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {head}
      {body}
    </div>
  );
}
