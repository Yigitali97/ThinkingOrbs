// The first screen: Hermes on its glowing pedestal among the systems it reads, the greeting (the screen's h1) and the brief,
// streamed in Hermes's serif voice while the systems it reads light up. The composer and the chips under it belong to the
// conversation area, so the message box stays the same element when the first question turns this into a conversation.

import { BotOrb } from '../../../src/orbs';
import { useAssistant } from '../../assistant/AssistantProvider';
import { briefShown } from '../../assistant/Thread';
import { hermesNow } from '../store';
import { firstName } from '../views/shared';
import { useBot } from './DockedBot';
import { PHONE_QUERY, useMedia } from './focus';
import { SystemsOrbit } from './SystemsOrbit';

export function greeting(now: Date): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export function Hero() {
  const { user, snapshot } = useAssistant();
  const bot = useBot();
  const phone = useMedia(PHONE_QUERY, false);
  const brief = snapshot.turns.find((t) => t.brief);
  const state = brief?.reply.state;
  const live = state === 'working' || state === 'writing';
  // nothing to show for a brief that said nothing: every system down, or stopped before its first word
  const shown = !!brief && (live || briefShown(brief));

  return (
    <div className="hero">
      <SystemsOrbit active={bot.systems}>
        <BotOrb ref={bot.ref} size={phone ? 168 : 220} state={bot.state} stream={bot.stream} />
      </SystemsOrbit>
      <h1 className="greeting">
        {greeting(hermesNow())}, {firstName(user)}
      </h1>
      <div className="hero-brief-slot">
        {shown && (
          <p className="hero-brief" data-brief={state} aria-live="polite" aria-busy={live}>
            {brief.reply.text ? (
              <>
                {brief.reply.text}
                {state === 'writing' && <span className="hero-caret" aria-hidden="true" />}
              </>
            ) : (
              <span className="hero-status" aria-hidden="true">
                {bot.status ?? 'Thinking…'}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
