// Dictation for the chat composer: speech recognition fills the message box,
// and the microphone stream drives a VoiceOrb so you can see it hearing you.

import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: RecognitionResult } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const getRecognition = (): RecognitionCtor | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export function useDictation(onText: (text: string) => void, lang = 'en-US') {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const supported = !!getRecognition();

  const release = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  };

  const stop = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onend = null;
      rec.stop();
    }
    release();
    setActive(false);
  }, []);

  /** Start listening; `prefix` is text already in the box, kept in front of what you say. */
  const start = useCallback(
    async (prefix = '') => {
      const Ctor = getRecognition();
      if (!Ctor || recRef.current) return;
      setError(null);
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        streamRef.current = s;
        setStream(s);
      } catch {
        setError('Microphone permission was denied — you can still type.');
        return;
      }
      const rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = false;
      const base = prefix.trim() ? prefix.trim() + ' ' : '';
      let finalText = '';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        onTextRef.current((base + finalText + interim).trimEnd());
      };
      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        setError(e.error === 'not-allowed' ? 'Microphone permission was denied — you can still type.' : `Dictation stopped (${e.error}).`);
      };
      rec.onend = () => {
        recRef.current = null;
        release();
        setActive(false);
      };
      recRef.current = rec;
      setActive(true);
      rec.start();
    },
    [lang]
  );

  // errors are a passing notice, not a permanent state
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  useEffect(() => () => stop(), [stop]);

  return { supported, active, error, stream, start, stop };
}
