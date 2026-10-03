// The signed-in Hermes workspace: the rail, the conversation and, when the address names one, a dashboard in the canvas.
// One assistant provider sits above it all, so a canvas change never unmounts the conversation or stops a reply.
// `/` and Cmd/Ctrl+K go to the composer. Hermes's `open` events open the canvas beside the conversation from 1024px without
// taking your focus; below that they become an "Open <view>" link in the answer, because the sheet would cover what you are reading.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { AssistantProvider, useAssistant } from '../../assistant/AssistantProvider';
import { focusComposer } from '../../assistant/Composer';
import type { User } from '../../assistant/protocol';
import { isOpenShortcut } from '../../assistant/shortcuts';
import { ErrorBoundary } from '../../site/ErrorBoundary';
import { navigate, normalisePath, useLocation } from '../../site/router';
import { hermesAgent } from '../agent/definition';
import { HERMES_NAME, HERMES_ROOT } from '../config';
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

type OpenHandler = (href: string) => void;

function Layout({ user, openRef }: { user: User; openRef: MutableRefObject<OpenHandler> }) {
  const { conversation } = useAssistant();
  const loc = useLocation();
  const path = normalisePath(loc.path);
  const wide = useWide();
  const canvas = canvasFor(path, user);
  const wideRef = useRef(wide);
  wideRef.current = wide;

  // Ruling R6: what Hermes opens never takes your focus. Wide, the address it opened is remembered so the canvas stays quiet
  // there; any other address (a link, back, forward) is yours and moves focus. Narrow, it is offered on the turn instead.
  const agentPath = useRef<string | null>(null);
  const [offers, setOffers] = useState<Record<string, string>>({});
  useEffect(() => setOffers({}), [conversation]);
  useEffect(() => {
    if (agentPath.current !== path) agentPath.current = null;
  }, [path]);
  openRef.current = (href) => {
    if (wideRef.current) {
      agentPath.current = normalisePath(href);
      // the event arrives inside the brain's emit: navigate after it returns, and never let a router error break the reply
      queueMicrotask(() => {
        try {
          navigate(href);
        } catch {
          // the answer still says where to look; the canvas just doesn't open
          agentPath.current = null;
        }
      });
      return;
    }
    const turns = conversation.getSnapshot().turns;
    const turn = turns[turns.length - 1];
    if (turn) setOffers((o) => ({ ...o, [turn.id]: href }));
  };
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const sheet = !wide && !!canvas;
  const modal = useRef(false);
  modal.current = (!wide && drawer) || sheet;
  const overlay = wide ? null : drawer ? 'drawer' : sheet ? 'sheet' : null;

  // the drawer exists only below 1024px, and a navigation (picking a dashboard) closes it
  useEffect(() => {
    if (wide) setDrawer(false);
  }, [wide]);
  useEffect(() => setDrawer(false), [path]);

  const closeDrawer = useCallback((refocus: boolean) => {
    setDrawer(false);
    if (refocus) setTimeout(() => menuRef.current?.focus(), 0);
  }, []);

  // the bot riding above a drawer or sheet takes you back to the conversation
  const leaveOverlay = useCallback(() => {
    if (drawer) {
      setDrawer(false);
      setTimeout(() => focusComposer(), 0);
    } else navigate(HERMES_ROOT);
  }, [drawer]);

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
          <ConversationArea canvasOpen={!!canvas} overlay={overlay} onLeaveOverlay={leaveOverlay} offers={offers} />
        </section>
      </main>

      {canvas && (
        <Canvas
          title={canvas.title}
          quiet={agentPath.current === path}
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
  // the layout knows the width and the turns, so it decides what an `open` does; this stable callback hands it over
  const openRef = useRef<OpenHandler>(() => {});
  const onOpen = useCallback((href: string) => openRef.current(href), []);

  return (
    <AssistantProvider agent={hermesAgent} user={user} now={hermesNow} onOpen={onOpen}>
      <Layout user={user} openRef={openRef} />
    </AssistantProvider>
  );
}
