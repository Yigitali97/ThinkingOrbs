// The conversation, always mounted while signed in. Empty, it greets you by name (the screen's h1) over a centred composer
// and suggestions; once you have asked something, the h1 is a visually hidden "Hermes" and the composer pins to the bottom.
// The bot hero, systems orbit, brief and docked bot arrive in a later step; this keeps the h1 rule and the composer's place.

import { useLayoutEffect, useRef } from 'react';
import { useAssistant } from '../../assistant/AssistantProvider';
import { Composer } from '../../assistant/Composer';
import { Suggestions, Thread } from '../../assistant/Thread';
import { usePageContext } from '../../assistant/usePageContext';
import { firstName } from '../views/shared';
import { hermesNow } from '../store';

export function greeting(now: Date): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** What "this one" refers to with no canvas open: the conversation itself. */
function HomeContext() {
  usePageContext({ page: 'home', title: 'Hermes' });
  return null;
}

export function ConversationArea({ canvasOpen }: { canvasOpen: boolean }) {
  const { user, snapshot } = useAssistant();
  const asked = snapshot.turns.some((t) => !t.brief);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // follow the answer as it streams, unless you have scrolled up to read; a new question always follows
  const count = snapshot.turns.length;
  useLayoutEffect(() => {
    stick.current = true;
  }, [count]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [snapshot]);

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
              <Thread turns={snapshot.turns} />
            </div>
          </>
        ) : (
          <div className="talk-hello">
            <h1 className="greeting">
              {greeting(hermesNow())}, {firstName(user)}
            </h1>
            <p className="talk-sub">Ask about the team, hours, projects, code, Teams or AWS. Dashboards open beside the conversation.</p>
          </div>
        )}
      </div>
      <div className="talk-dock">
        <div className="talk-column">
          <Composer />
          {!asked && <Suggestions />}
        </div>
      </div>
    </div>
  );
}
