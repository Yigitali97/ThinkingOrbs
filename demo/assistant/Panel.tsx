// The assistant panel: a 420px side panel at ≥ 768px, a bottom sheet below that. From 1024px the side panel shares the
// screen (the page makes room for it, header included); narrower, side panel and sheet are modal, so nothing they cover
// can take focus. It also owns the global shortcut (/ or Cmd/Ctrl+K), which works whenever the panel is mounted, open or not.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { AssistantOrb } from '../../src/orbs';
import { useAssistant } from './AssistantProvider';
import { Composer, focusComposer } from './Composer';
import { dockState, isOpenShortcut } from './shortcuts';
import { EmptyThread, Thread } from './Thread';
import './assistant.css';

const WIDE = '(min-width: 768px)';
/** wide enough for the page and the side panel side by side */
const SHARED = '(min-width: 1024px)';

function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (fn: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true),
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

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden && el.getClientRects().length > 0);
}

/** The element focus should go back to: what had focus, or the dock when that was nothing in particular. */
function currentOpener(): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && active.isConnected) return active;
  return document.querySelector<HTMLElement>('[data-assistant-dock]');
}

const Icon = ({ d }: { d: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);
const EXPAND = 'M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9';
const COLLAPSE = 'M13 7H9V3M9 7l4.5-4.5M3 9h4v4M7 9l-4.5 4.5';
const CLEAR = 'M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 8.5h6.6l.7-8.5';
const CLOSE = 'M4 4l8 8M12 4l-8 8';

export function Panel() {
  const { agent, open, setOpen, inline, snapshot, conversation } = useAssistant();
  const wide = useMedia(WIDE);
  const shared = useMedia(SHARED);
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const state = useRef({ open, inline });
  state.current = { open, inline };
  const shown = open && !inline;

  // the global shortcut: opens the panel, or goes to the message box that is already on screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (!isOpenShortcut({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, target: e.target as HTMLElement | null })) return;
      e.preventDefault();
      if (state.current.inline || state.current.open) focusComposer();
      else setOpen(true, currentOpener());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // opening starts you in the message box
  useEffect(() => {
    if (shown) inputRef.current?.focus();
    else setExpanded(false);
  }, [shown]);

  // tell the page how the panel sits, so it can make room (side) or stop scrolling behind it (modal, full)
  useEffect(() => {
    if (!shown) return;
    const root = document.documentElement;
    root.dataset.assistant = expanded ? 'full' : shared ? 'side' : 'modal';
    return () => {
      delete root.dataset.assistant;
    };
  }, [shown, expanded, shared]);

  // follow the answer as it streams, unless you have scrolled up to read; a new question always follows
  const turns = snapshot.turns.length;
  useLayoutEffect(() => {
    stick.current = true;
  }, [turns]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [snapshot, shown]);

  if (!shown) return null;

  const close = () => setOpen(false);
  const modal = !shared;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      close();
      return;
    }
    // below 1024px the panel is modal: Tab cycles inside it
    if (modal && e.key === 'Tab' && panelRef.current) {
      const items = focusables(panelRef.current);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const body = (
    <>
      <div className="as-panel-head">
        <AssistantOrb state={dockState(snapshot)} size={28} label={null} />
        <h2 className="as-panel-title">{agent.name}</h2>
        <div className="as-panel-actions">
          <button
            type="button"
            className="as-icon-btn"
            onClick={() => setExpanded((x) => !x)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <Icon d={expanded ? COLLAPSE : EXPAND} />
          </button>
          <button
            type="button"
            className="as-icon-btn"
            onClick={() => {
              conversation.clear();
              inputRef.current?.focus();
            }}
            disabled={!turns}
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <Icon d={CLEAR} />
          </button>
          <button type="button" className="as-icon-btn" onClick={close} aria-label="Close" title="Close">
            <Icon d={CLOSE} />
          </button>
        </div>
      </div>
      <div
        className="as-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {turns ? <Thread turns={snapshot.turns} /> : <EmptyThread />}
      </div>
      <Composer inputRef={inputRef} />
    </>
  );

  const common = {
    className: 'as as-panel',
    'data-mode': wide ? 'side' : 'sheet',
    'data-expanded': expanded ? 'true' : undefined,
    'aria-label': agent.name,
    onKeyDown,
  };

  if (!modal) {
    return (
      <aside {...common} ref={panelRef}>
        {body}
      </aside>
    );
  }
  return (
    <>
      <div className="as-scrim" onClick={close} aria-hidden="true" />
      <div {...common} ref={panelRef as RefObject<HTMLDivElement>} role="dialog" aria-modal="true">
        {body}
      </div>
    </>
  );
}
