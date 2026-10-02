import { useCallback, useEffect, useRef, useState } from 'react';

export interface MicrophoneState {
  /** Live microphone stream while recording, otherwise null. */
  stream: MediaStream | null;
  recording: boolean;
  /** Waiting for the user to answer the permission prompt. */
  pending: boolean;
  /** Permission denied, no device, insecure origin, … */
  error: string | null;
  start(): Promise<void>;
  stop(): void;
  toggle(): Promise<void>;
}

/** Ask for the microphone and hand back its stream; stops tracks on unmount. */
export function useMicrophone(): MicrophoneState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access needs a secure (https or localhost) page.');
      return;
    }
    setPending(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = s;
      setStream(s);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : name === 'NotFoundError'
            ? 'No microphone found.'
            : 'Could not start the microphone.'
      );
    } finally {
      setPending(false);
    }
  }, []);

  const toggle = useCallback(async () => {
    if (streamRef.current) stop();
    else await start();
  }, [start, stop]);

  useEffect(() => stop, [stop]);

  return { stream, recording: !!stream, pending, error, start, stop, toggle };
}
