// A voice assistant loop on the browser's own speech APIs — no backend.
//   listen (SpeechRecognition) → think (your respond()) → speak (speechSynthesis) → listen …
// It reports an AssistantOrb state, captions, and a level for the orb while speaking.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssistantState } from '../../src/orbs';
import type { Reply } from './brain';

// Minimal typings — the Web Speech recognition API isn't in TypeScript's DOM lib.
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const getRecognition = (): RecognitionCtor | undefined =>
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);

export interface VoiceAssistantOptions {
  /** Turn what the user said into a reply. Abort `signal` when interrupted. */
  respond: (text: string, signal: AbortSignal) => Promise<Reply>;
  /** BCP-47 language for recognition and speech, e.g. "en-US". */
  lang?: string;
}

export function useVoiceAssistant({ respond, lang = 'en-US' }: VoiceAssistantOptions) {
  const [state, setStateRaw] = useState<AssistantState>('idle');
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [spoken, setSpoken] = useState(0); // characters of `reply` already spoken
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const support = useMemo(
    () => ({
      recognition: !!getRecognition(),
      synthesis: typeof window !== 'undefined' && 'speechSynthesis' in window,
    }),
    []
  );

  const stateRef = useRef<AssistantState>('idle');
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const recRef = useRef<Recognition | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const speakRef = useRef<{ id: number; timers: ReturnType<typeof setTimeout>[] } | null>(null);
  const respondRef = useRef(respond);
  respondRef.current = respond;
  const voiceLevel = useRef({ last: 0, boundaries: false, start: 0 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const setState = (s: AssistantState) => {
    stateRef.current = s;
    setStateRaw(s);
  };
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  };

  const cancelSpeech = () => {
    speakRef.current?.timers.forEach(clearTimeout);
    speakRef.current = null;
    if (support.synthesis) window.speechSynthesis.cancel();
  };

  const stopRecognition = () => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.abort();
    }
  };

  const fail = (message: string) => {
    activeRef.current = false;
    setActive(false);
    abortRef.current?.abort();
    stopRecognition();
    cancelSpeech();
    releaseMic();
    setError(message);
    setState('error');
  };

  // after speaking (or a typed reply): keep the conversation going, or rest
  const next = () => {
    if (activeRef.current && !mutedRef.current) listen();
    else setState(activeRef.current ? 'muted' : 'idle');
  };

  function listen() {
    const Ctor = getRecognition();
    if (!Ctor || !activeRef.current) return setState(activeRef.current ? 'listening' : 'idle');
    if (mutedRef.current) return setState('muted');
    stopRecognition();
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setHeard((finalText + ' ' + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // just listen again
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') fail('Microphone permission was denied.');
      else if (e.error === 'network') fail('Speech recognition needs a network connection in this browser.');
      else fail(`Speech recognition stopped (${e.error}).`);
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      recRef.current = null;
      if (!activeRef.current || stateRef.current !== 'listening') return;
      const text = finalText.trim();
      if (text) void think(text);
      else listen(); // silence: keep listening
    };
    recRef.current = rec;
    setState('listening');
    try {
      rec.start();
    } catch {
      later(listen, 300); // already starting; try again shortly
    }
  }

  async function think(text: string) {
    stopRecognition();
    setHeard(text);
    setReply('');
    setSpoken(0);
    setState('thinking');
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    let out: Reply;
    try {
      out = await respondRef.current(text, ctl.signal);
    } catch (e) {
      if (ctl.signal.aborted) return;
      return fail(e instanceof Error ? e.message : 'The assistant could not answer.');
    }
    if (ctl.signal.aborted) return;
    const { text: answer, end } = typeof out === 'string' ? { text: out, end: false } : { text: out.text, end: !!out.end };
    speak(answer, end);
  }

  function speak(text: string, end: boolean) {
    cancelSpeech();
    setReply(text);
    setSpoken(0);
    setState('speaking');
    const id = Math.random();
    const local = { id, timers: [] as ReturnType<typeof setTimeout>[] };
    speakRef.current = local;
    voiceLevel.current = { last: 0, boundaries: false, start: performance.now() };

    let finished = false;
    const finish = () => {
      if (finished || speakRef.current?.id !== id) return;
      finished = true;
      local.timers.forEach(clearTimeout);
      speakRef.current = null;
      setSpoken(text.length);
      if (end) {
        activeRef.current = false;
        setActive(false);
        releaseMic();
      }
      next();
    };
    // estimated reading time: drives captions when the voice gives no word events,
    // and is a safety net for engines that never fire `end`
    const estimate = 900 + text.length * 70;
    const tick = () => {
      if (speakRef.current?.id !== id) return;
      if (!voiceLevel.current.boundaries) {
        setSpoken(Math.min(text.length, Math.round(((performance.now() - voiceLevel.current.start) / estimate) * text.length)));
      }
      local.timers.push(setTimeout(tick, 120));
    };
    tick();
    local.timers.push(
      setTimeout(() => {
        // the engine never reported the end: stop it so we don't listen to ourselves
        if (support.synthesis) window.speechSynthesis.cancel();
        finish();
      }, estimate * 1.6 + 4000)
    );

    if (!support.synthesis) {
      local.timers.push(setTimeout(finish, estimate));
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 1.03;
    utter.onboundary = (e) => {
      if (speakRef.current?.id !== id) return;
      voiceLevel.current.last = performance.now();
      voiceLevel.current.boundaries = true;
      const rest = text.slice(e.charIndex);
      const len = (e as SpeechSynthesisEvent & { charLength?: number }).charLength || rest.search(/\s|$/);
      setSpoken(Math.min(text.length, e.charIndex + Math.max(1, len)));
    };
    utter.onend = finish;
    utter.onerror = finish;
    window.speechSynthesis.speak(utter);
  }

  // ---------------------------------------------------------------- controls

  const start = useCallback(async () => {
    if (activeRef.current) return;
    setError(null);
    setHeard('');
    setReply('');
    if (!support.recognition) {
      setError("Voice input isn't available in this browser — type a message instead.");
      return;
    }
    activeRef.current = true;
    setActive(true);
    setState('connecting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!activeRef.current) return s.getTracks().forEach((t) => t.stop());
      streamRef.current = s;
      setStream(s);
      s.getAudioTracks().forEach((t) => (t.enabled = !mutedRef.current));
      later(listen, 450); // let "connecting" register before listening
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      fail(name === 'NotFoundError' ? 'No microphone found.' : 'Microphone permission was denied.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    abortRef.current?.abort();
    stopRecognition();
    cancelSpeech();
    releaseMic();
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Barge in: stop thinking/speaking and listen to the user. */
  const interrupt = useCallback(() => {
    const s = stateRef.current;
    if (s !== 'speaking' && s !== 'thinking') return;
    abortRef.current?.abort();
    cancelSpeech();
    setState('interrupted');
    later(() => {
      if (stateRef.current === 'interrupted') next();
    }, 750);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = useCallback(() => {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !m));
    if (m) {
      if (stateRef.current === 'listening' || stateRef.current === 'connecting') {
        stopRecognition();
        setState('muted');
      }
    } else if (stateRef.current === 'muted') {
      if (activeRef.current) listen();
      else setState('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Typed input — works without speech recognition too. */
  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setError(null);
    abortRef.current?.abort();
    cancelSpeech();
    void think(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Level for the orb while speaking: pulses on each spoken word. */
  const getLevel = useCallback(() => {
    if (stateRef.current !== 'speaking') return 0;
    const v = voiceLevel.current;
    const now = performance.now();
    if (v.boundaries) return 0.25 + 0.75 * Math.exp(-(now - v.last) / 140);
    // no word events from this voice: a speech-like rhythm instead
    const t = now / 1000;
    return 0.2 + 0.8 * Math.max(0, Math.sin(t * 8.5) * Math.sin(t * 2.3 + 1));
  }, []);

  useEffect(
    () => () => {
      activeRef.current = false;
      abortRef.current?.abort();
      stopRecognition();
      cancelSpeech();
      releaseMic();
      timers.current.forEach(clearTimeout);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { state, active, muted, heard, reply, spoken, error, stream, support, start, stop, interrupt, toggleMute, send, getLevel };
}
