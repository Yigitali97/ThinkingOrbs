// The conversation, always mounted while signed in. Empty (or holding only the brief) it is the hero: the bot among its
// systems, the greeting as the screen's h1, the brief, a centred composer and chips. Once you ask something the h1 is a
// visually hidden "Hermes", the thread fills the column and the composer pins to the bottom with the bot docked beside it.
// It starts the brief once per conversation: on arrival, after New conversation, and for a new user.

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAssistant } from '../../assistant/AssistantProvider';
import { Composer } from '../../assistant/Composer';
import type { Turn } from '../../assistant/conversation';
import { Suggestions, Thread } from '../../assistant/Thread';
import { activeSystems } from '../../assistant/presence';
import { usePageContext } from '../../assistant/usePageContext';
import { Link } from '../../site/router';
import { DockedBot, statusLine } from './DockedBot';
import type { Overlay } from './DockedBot';
import { PHONE_QUERY, useMedia } from './focus';
import { Hero } from './Hero';
import { canvasFor } from './views';

/** What "this one" refers to with no canvas open: the conversation itself. */
function HomeContext() {
  usePageContext({ page: 'home', title: 'Hermes' });
  return null;
}

/**
 * While a reply works the docked bot and its status line show what Hermes is reading, so the thread shows no activity card;
 * screen readers hear the same words here (the bot's line is hidden from them).
 */
function Working({ turn }: { turn: Turn }) {
  const { agent } = useAssistant();
  return (
    <p className="sr-only" aria-live="polite" data-working="">
      {statusLine(activeSystems(agent.tools, turn.reply), true)}
    </p>
  );
}
const working = (t: Turn) => <Working turn={t} />;

export interface ConversationAreaProps {
  canvasOpen: boolean;
  /** below 1024px, what covers the conversation: the canvas sheet or the rail drawer */
  overlay: Overlay;
  /** closes that overlay, for the bot riding above it */
  onLeaveOverlay: () => void;
  /** views Hermes offered to open, by turn: below 1024px they are links in the answer instead of a sheet over it */
  offers: Readonly<Record<string, string>>;
}

export function ConversationArea({ canvasOpen, overlay, onLeaveOverlay, offers }: ConversationAreaProps) {
  const { user, snapshot, conversation } = useAssistant();
  const asked = snapshot.turns.some((t) => !t.brief);
  const phone = useMedia(PHONE_QUERY, false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // the brief, once per conversation; the store refuses a second one until the next clear()
  const empty = snapshot.turns.length === 0;
  useEffect(() => {
    if (empty) void conversation.startBrief();
  }, [conversation, empty]);

  // follow the answer as it streams, unless you have scrolled up to read; a new question always follows
  const count = snapshot.turns.length;
  useLayoutEffect(() => {
    stick.current = true;
  }, [count]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [snapshot, offers]);

  const offer = (t: Turn) => {
    const href = offers[t.id];
    const view = href && user ? canvasFor(href, user) : null;
    return view ? (
      <p className="open-offer">
        <Link to={href} className="open-chip">
          Open {view.title}
        </Link>
      </p>
    ) : null;
  };

  return (
    <div className="talk" data-empty={!asked || undefined}>
      {!canvasOpen && <HomeContext />}
      <div
        className="talk-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {asked ? (
          <>
            <h1 className="sr-only">Hermes</h1>
            <div className="talk-column">
              <Thread turns={snapshot.turns} after={offer} live={working} />
            </div>
          </>
        ) : (
          <Hero />
        )}
      </div>
      <div className="talk-dock">
        <div className="talk-column dock-row">
          {/* on the first screen the hero is the bot, unless a sheet or drawer covers it */}
          {(asked || overlay) && <DockedBot overlay={overlay} onLeaveOverlay={onLeaveOverlay} />}
          <div className="dock-main">
            {/* beside the docked bot a phone's box is narrow: a shorter placeholder that fits */}
            <Composer voiceOrb={false} placeholder={asked && phone ? 'Ask Hermes' : undefined} />
            {!asked && <Suggestions />}
          </div>
        </div>
      </div>
    </div>
  );
}
