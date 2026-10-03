// The signed-in Hermes workspace: the rail, the conversation and, when the address names one, a dashboard in the canvas.
// One assistant provider sits above it all, so a canvas change never unmounts the conversation or stops a reply.
// `/` and Cmd/Ctrl+K go to the composer; Hermes's `open` events navigate, which opens the canvas.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AssistantProvider } from '../../assistant/AssistantProvider';
import { focusComposer } from '../../assistant/Composer';
import type { User } from '../../assistant/protocol';
import { isOpenShortcut } from '../../assistant/shortcuts';
import { ErrorBoundary } from '../../site/ErrorBoundary';
import { navigate, normalisePath, useLocation } from '../../site/router';
import { hermesAgent } from '../agent/definition';
import { HERMES_NAME } from '../config';
import { hermesNow } from '../store';
import { Canvas } from './Canvas';
import { ConversationArea } from './ConversationArea';
import { useWide } from './focus';
import { Rail } from './Rail';
import { canvasFor } from './views';
import '../../assistant/assistant.css';

const COLLAPSED_KEY = 'hermes.rail';

function readCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(COLLAPSED_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function Layout({ user }: { user: User }) {
  const loc = useLocation();
  const path = normalisePath(loc.path);
  const wide = useWide();
  const canvas = canvasFor(path, user);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const sheet = !wide && !!canvas;
  const modal = useRef(false);
  modal.current = (!wide && drawer) || sheet;

  // the drawer exists only below 1024px, and a navigation (picking a dashboard) closes it
  useEffect(() => {
    if (wide) setDrawer(false);
  }, [wide]);
  useEffect(() => setDrawer(false), [path]);

  const closeDrawer = useCallback((refocus: boolean) => {
    setDrawer(false);
    if (refocus) setTimeout(() => menuRef.current?.focus(), 0);
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        globalThis.localStorage?.setItem(COLLAPSED_KEY, c ? 'open' : 'collapsed');
      } catch {
        // storage is blocked: the rail just forgets on reload
      }
      return !c;
    });

  // `/` and Cmd/Ctrl+K go to the composer, unless a drawer or sheet is covering it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || modal.current) return;
      if (!isOpenShortcut({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, target: e.target as HTMLElement | null })) return;
      e.preventDefault();
      focusComposer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="hermes workspace" data-layout={wide ? (collapsed ? 'collapsed' : 'open') : 'drawer'}>
      <a className="skip" href="#main">
        Skip to the conversation
      </a>

      {wide ? (
        <Rail user={user} mode="side" collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      ) : (
        <>
          <header className="topline">
            <button
              type="button"
              ref={menuRef}
              className="icon-btn topline-menu"
              aria-label="Menu"
              aria-expanded={drawer}
              aria-haspopup="dialog"
              onClick={() => setDrawer(true)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M3.5 6h13M3.5 10h13M3.5 14h8" />
              </svg>
            </button>
            <span className="topline-brand">
              <span className="brand-mark" aria-hidden="true" />
              {HERMES_NAME}
            </span>
          </header>
          {drawer && (
            <>
              <div className="rail-backdrop" data-rail-backdrop="" onClick={() => closeDrawer(true)} />
              <Rail user={user} mode="drawer" onClose={closeDrawer} />
            </>
          )}
        </>
      )}

      <main id="main" className="stage" tabIndex={-1}>
        <section className="conversation as" aria-label="Conversation">
          <ConversationArea canvasOpen={!!canvas} />
        </section>
      </main>

      {canvas && (
        <Canvas
          title={canvas.title}
          view={
            <ErrorBoundary key={path} level={2}>
              {canvas.view}
            </ErrorBoundary>
          }
        />
      )}
    </div>
  );
}

export function Workspace({ user }: { user: User }) {
  // an `open` event arrives inside the brain's emit: navigate after it returns, and never let a router error break the reply
  const onOpen = useCallback((href: string) => {
    queueMicrotask(() => {
      try {
        navigate(href);
      } catch {
        // the answer still says where to look; the canvas just doesn't open
      }
    });
  }, []);

  return (
    <AssistantProvider agent={hermesAgent} user={user} now={hermesNow} onOpen={onOpen}>
      <Layout user={user} />
    </AssistantProvider>
  );
}
