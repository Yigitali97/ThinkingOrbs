'use client';

import { CSSProperties, useEffect, useRef } from 'react';
import { createVoiceOrb, VoiceOrbHandle } from './engine';

export interface VoiceOrbProps {
  /** Width and height in CSS pixels. */
  size?: number;
  /** Audio to react to, e.g. `useMicrophone().stream` or a TTS playback stream. */
  stream?: MediaStream | null;
  /** Alternative to `stream`: polled every frame, return 0..1. Doesn't re-render. */
  getLevel?: () => number;
  /** How strongly the ring reacts (default 1). */
  sensitivity?: number;
  /** Accessible label. Pass `null` to hide from assistive tech. */
  label?: string | null;
  className?: string;
  style?: CSSProperties;
}

export function VoiceOrb({
  size = 420,
  stream = null,
  getLevel,
  sensitivity = 1,
  label = 'Voice activity',
  className,
  style,
}: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<VoiceOrbHandle | null>(null);
  // keep the latest callback without re-creating the orb
  const getLevelRef = useRef(getLevel);
  getLevelRef.current = getLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createVoiceOrb(canvas, {
      size,
      stream,
      sensitivity,
      getLevel: () => getLevelRef.current?.() ?? 0,
    });
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    orbRef.current?.update({ size, stream, sensitivity });
  }, [size, stream, sensitivity]);

  const a11y = label === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: size, height: size, ...style }}
      {...a11y}
    />
  );
}

export default VoiceOrb;
