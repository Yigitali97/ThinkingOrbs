// Voice assistant sample — AssistantOrb + the browser's speech APIs, no backend.
// Replace `localBrain` with your model: respond={(text, signal) => callYourModel(text, { signal })}

import { FormEvent, useEffect, useState } from 'react';
import { ASSISTANT_COLORS, AssistantOrb } from '../../src/orbs';
import { localBrain, Reply } from './brain';
import { useVoiceAssistant } from './useVoiceAssistant';
import './voice-assistant.css';

const LABELS = {
  idle: 'Tap the orb to start',
  connecting: 'Connecting…',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking — tap to interrupt',
  interrupted: 'Go ahead…',
  muted: 'Muted',
  error: 'Something went wrong',
} as const;

export function VoiceAssistant({ respond = localBrain }: { respond?: (text: string, signal: AbortSignal) => Promise<Reply> }) {
  const va = useVoiceAssistant({ respond });
  const [draft, setDraft] = useState('');
  const busy = va.state === 'speaking' || va.state === 'thinking';

  // Space interrupts while the assistant is talking (unless you're typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.code === 'Space' && !typing && (va.state === 'speaking' || va.state === 'thinking')) {
        e.preventDefault();
        va.interrupt();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [va.state, va.interrupt]);

  const onOrb = () => {
    if (busy) va.interrupt();
    else if (!va.active) void va.start();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    va.send(draft);
    setDraft('');
  };

  return (
    <div className="va">
      <button
        className="va-orb"
        onClick={onOrb}
        aria-label={busy ? 'Interrupt the assistant' : va.active ? 'Assistant is listening' : 'Start talking'}
      >
        <AssistantOrb
          state={va.state}
          size={300}
          stream={va.state === 'listening' ? va.stream : null}
          getLevel={va.getLevel}
          label={null}
        />
      </button>

      <div className="va-status" style={{ color: ASSISTANT_COLORS[va.state] }} aria-live="polite">
        {va.error && va.state === 'error' ? va.error : LABELS[va.state]}
      </div>

      <div className="va-captions" aria-live="polite">
        {va.heard && (
          <p className="va-you">
            <span>You</span>
            {va.heard}
          </p>
        )}
        {va.reply && (
          <p className="va-ai">
            <span>Assistant</span>
            <mark>{va.reply.slice(0, va.spoken)}</mark>
            {va.reply.slice(va.spoken)}
          </p>
        )}
      </div>

      <div className="actions">
        {va.active ? (
          <button className="btn" onClick={va.stop}>
            End conversation
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => void va.start()} disabled={!va.support.recognition}>
            Start talking
          </button>
        )}
        <button className="btn" onClick={va.toggleMute} aria-pressed={va.muted}>
          {va.muted ? 'Unmute' : 'Mute'}
        </button>
        <button className="btn" onClick={va.interrupt} disabled={!busy}>
          Interrupt
        </button>
      </div>

      <form className="va-type" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={va.support.recognition ? 'Or type a message…' : 'Type a message…'}
          aria-label="Type a message"
        />
        <button className="btn" type="submit" disabled={!draft.trim()}>
          Send
        </button>
      </form>

      <p className="hint">
        {!va.support.recognition
          ? "This browser can't do speech recognition (try Chrome, Edge or Safari) — typing still works, and replies are spoken aloud."
          : !va.support.synthesis
            ? "This browser can't speak replies — they'll appear as text."
            : 'Try "what time is it?", "what is 12 times 7?" or "tell me a joke". Press Space to interrupt.'}
      </p>
    </div>
  );
}
