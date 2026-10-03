// The bot once a conversation exists: docked at the left of the composer, with a short line above it naming the systems it is
// reading. Clicking it puts you in the message box. Below 1024px, while the canvas sheet or the rail drawer covers the
// conversation, it rides above them at the bottom left (beside the drawer), so Hermes never leaves the screen.
// `useBot` is the presence both bots share: the state from the conversation, voice and dictation, and a hop when an answer lands.

import { useEffect, useRef } from 'react';
import { BotOrb } from '../../../src/orbs';
import type { BotOrbRef } from '../../../src/orbs';
import { useAssistant } from '../../assistant/AssistantProvider';
import { focusComposer } from '../../assistant/Composer';
import { activeSystems, botStateFor, finishedHappily } from '../../assistant/presence';
import { useWide } from './focus';
import { HERMES_SYSTEMS } from './systems';

export type Overlay = 'sheet' | 'drawer' | null;

/** "Reading Jira, GitHub…" while tools run, "Thinking…" while it works without one, otherwise nothing. */
export function statusLine(systems: ReadonlySet<string>, working: boolean): string | null {
  if (!working) return null;
  const names = HERMES_SYSTEMS.map((s) => s.name).filter((n) => systems.has(n));
  return names.length ? `Reading ${names.join(', ')}…` : 'Thinking…';
}

export function useBot() {
  const { agent, snapshot, voice, dictating } = useAssistant();
  const ref = useRef<BotOrbRef>(null);
  const prev = useRef(snapshot);

  // a hop when an answer (or the brief) lands; the state itself goes back to idle
  useEffect(() => {
    if (finishedHappily(prev.current, snapshot)) ref.current?.bounce();
    prev.current = snapshot;
  }, [snapshot]);

  const last = snapshot.turns[snapshot.turns.length - 1];
  const systems = activeSystems(agent.tools, last?.reply);
  return {
    ref,
    state: botStateFor(snapshot, voice, dictating),
    systems,
    status: statusLine(systems, last?.reply.state === 'working'),
    stream: voice.active ? voice.stream ?? null : null,
    voice,
  };
}

export function DockedBot({ overlay, onLeaveOverlay }: { overlay: Overlay; onLeaveOverlay: () => void }) {
  const wide = useWide();
  const bot = useBot();
  const { voice } = bot;
  // in voice mode the bot grows and becomes the voice control
  const size = wide ? (voice.active ? 120 : 88) : voice.active ? 76 : 56;
  const interrupts = voice.active && (voice.state === 'thinking' || voice.state === 'speaking') && !!voice.interrupt;
  const label = overlay ? 'Back to the conversation' : interrupts ? 'Interrupt Hermes' : 'Write to Hermes';

  const onClick = () => {
    if (overlay) onLeaveOverlay();
    else if (interrupts) voice.interrupt?.();
    else focusComposer();
  };

  return (
    <div className="docked" data-bot-host="" data-overlay={overlay ?? undefined} data-voice={voice.active || undefined}>
      {/* the thread's own activity row is what assistive tech hears; this is the glanceable version */}
      {bot.status && (
        <p className="docked-status" aria-hidden="true">
          {bot.status}
        </p>
      )}
      <div className="docked-bot">
        <BotOrb ref={bot.ref} size={size} pedestal={false} state={bot.state} stream={bot.stream} />
        <button type="button" className="docked-hit" aria-label={label} title={label} onClick={onClick} />
      </div>
    </div>
  );
}
