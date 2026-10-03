// Hands-free voice mode: an orb that listens, thinks and speaks, with a caption of what was heard. Answers still land in the thread.
// It replaces the message box while it is on; End voice mode stops the loop. While it thinks or speaks, the orb is a button
// that interrupts, by tap or from the keyboard. While mounted it reports its state and stream to the provider, for the bot.
// A site whose bot stands in for the orb passes `orb={false}`: an Interrupt button takes the orb's place among the controls.

import { useEffect, useMemo, useRef } from 'react';
import { ASSISTANT_COLORS, AssistantOrb } from '../../src/orbs';
import { useVoiceAssistant } from '../voice-assistant/useVoiceAssistant';
import { useAssistant } from './AssistantProvider';
import { voiceResponder } from './voice';

const LABELS = {
  idle: 'Starting…',
  connecting: 'Connecting…',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking — press the orb to interrupt',
  interrupted: 'Go ahead…',
  muted: 'Muted',
  error: 'Something went wrong',
} as const;

export function VoiceMode({ onEnd, orb = true }: { onEnd: () => void; orb?: boolean }) {
  const { conversation, setVoice } = useAssistant();
  const respond = useMemo(() => voiceResponder(conversation), [conversation]);
  const va = useVoiceAssistant({ respond });
  const endRef = useRef<HTMLButtonElement>(null);
  const busy = va.state === 'speaking' || va.state === 'thinking';
  const interruptRef = useRef(va.interrupt);
  interruptRef.current = va.interrupt;

  // start listening as it opens (a tick later, so a strict-mode remount doesn't open the microphone twice);
  // stopping releases the microphone and any speech
  useEffect(() => {
    endRef.current?.focus();
    const t = setTimeout(() => void va.start(), 0);
    return () => {
      clearTimeout(t);
      va.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the provider hears what voice mode is doing while it's on, and that it is off once it's gone
  useEffect(() => {
    setVoice({ active: true, state: va.state, stream: va.stream, interrupt: () => interruptRef.current() });
  }, [setVoice, va.state, va.stream]);
  useEffect(() => () => setVoice({ active: false }), [setVoice]);

  const status = va.error && va.state === 'error' ? va.error : LABELS[va.state];

  return (
    <div className="as-voice" data-state={va.state}>
      {orb && (
        <button
          type="button"
          className="as-voice-orb"
          onClick={() => busy && va.interrupt()}
          aria-label={busy ? 'Interrupt the assistant' : 'Voice mode orb'}
          tabIndex={busy ? 0 : -1}
        >
          <AssistantOrb state={va.state} size={120} stream={va.state === 'listening' ? va.stream : null} getLevel={va.getLevel} label={null} />
        </button>
      )}
      <p className="as-voice-status" style={{ color: `color-mix(in srgb, ${ASSISTANT_COLORS[va.state]} 72%, var(--as-text))` }} role="status">
        {status}
      </p>
      <p className="as-voice-heard" aria-live="polite">
        {va.heard ? (
          <>
            <span>You</span>
            {va.heard}
          </>
        ) : null}
      </p>
      <div className="as-voice-actions">
        {!orb && (
          // aria-disabled, not disabled: it stays focusable while the assistant goes back to listening
          <button type="button" className="as-voice-btn" aria-label="Interrupt the assistant" aria-disabled={!busy} onClick={() => busy && va.interrupt()}>
            Interrupt
          </button>
        )}
        <button type="button" className="as-voice-btn" onClick={va.toggleMute} aria-pressed={va.muted}>
          {va.muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className="as-voice-btn" data-primary="" ref={endRef} onClick={onEnd}>
          End voice mode
        </button>
      </div>
    </div>
  );
}
