'use client';

import { CSSProperties, useEffect, useRef } from 'react';
import { AssistantOrbHandle, AssistantState, createAssistantOrb } from './engine';

export interface AssistantOrbProps {
  /** idle (grey) · listening (blue) · thinking (orange) · speaking (green). Transitions are animated. */
  state?: AssistantState;
  /** Width and height in CSS pixels. */
  size?: number;
  /** Audio to react to — the mic while listening, TTS playback while speaking. */
  stream?: MediaStream | null;
  /** Alternative to `stream`: polled every frame, return 0..1. Doesn't re-render. */
  getLevel?: () => number;
  /** Override the color of any state (hex), e.g. `{ thinking: '#f5b400' }`. */
  colors?: Partial<Record<AssistantState, string>>;
  /** Accessible label; defaults to the state. Pass `null` to hide from assistive tech. */
  label?: string | null;
  className?: string;
  style?: CSSProperties;
}

export function AssistantOrb({ state = 'idle', size = 320, stream = null, getLevel, colors, label, className, style }: AssistantOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<AssistantOrbHandle | null>(null);
  const getLevelRef = useRef(getLevel);
  getLevelRef.current = getLevel;
  const colorsKey = JSON.stringify(colors ?? {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createAssistantOrb(canvas, {
      state,
      size,
      stream,
      colors,
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
    orbRef.current?.update({ state, size, stream, colors });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, size, stream, colorsKey]);

  const a11y =
    label === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label ?? `Assistant ${state}` };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: size, height: size, ...style }}
      {...a11y}
    />
  );
}

export default AssistantOrb;
