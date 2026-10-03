// Voice mode's glue: turns what was heard into a conversation turn and the answer into words to speak.
// Aborting the voice loop stops the running reply, so nothing is left working behind a closed voice mode.

import type { Conversation } from './conversation';
import { speakable } from './speakable';

/** Voice mode needs both halves: hearing (recognition) and speaking (synthesis). */
export function voiceSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition) && 'speechSynthesis' in window;
}

export function voiceResponder(c: Conversation): (text: string, signal: AbortSignal) => Promise<string> {
  return async (text, signal) => {
    const stop = () => c.stop();
    signal.addEventListener('abort', stop, { once: true });
    try {
      const reply = await c.send(text);
      if (!reply || signal.aborted || reply.state === 'stopped') return '';
      if (reply.state === 'error') return speakable(reply) || reply.error || 'Something went wrong.';
      return speakable(reply);
    } finally {
      signal.removeEventListener('abort', stop);
    }
  };
}
