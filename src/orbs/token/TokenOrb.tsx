'use client';

import { CSSProperties, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createTokenOrb, TokenOrbHandle } from './engine';

export interface TokenOrbProps {
  /**
   * Running total of tokens (or characters) received. Each increase pulses the
   * orb — or skip this and call `ref.current.push(n)` per chunk instead.
   */
  tokens?: number;
  /** The reply has finished streaming; the orb settles and turns `doneColor`. */
  done?: boolean;
  /** Width and height in CSS pixels. */
  size?: number;
  color?: string;
  doneColor?: string;
  /** Accessible label. Pass `null` to hide from assistive tech. */
  label?: string | null;
  className?: string;
  style?: CSSProperties;
}

export interface TokenOrbRef {
  /** Pulse for one streamed chunk containing `count` tokens. */
  push(count?: number): void;
}

export const TokenOrb = forwardRef<TokenOrbRef, TokenOrbProps>(function TokenOrb(
  { tokens, done = false, size = 22, color = '#d4d4dc', doneColor = '#34d399', label, className, style },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<TokenOrbHandle | null>(null);
  const seen = useRef(tokens ?? 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createTokenOrb(canvas, { size, color, doneColor, done });
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    orbRef.current?.update({ size, color, doneColor, done });
  }, [size, color, doneColor, done]);

  useEffect(() => {
    if (tokens == null) return;
    const diff = tokens - seen.current;
    seen.current = tokens;
    if (diff > 0) orbRef.current?.push(diff);
  }, [tokens]);

  useImperativeHandle(ref, () => ({ push: (count?: number) => orbRef.current?.push(count) }), []);

  const a11y =
    label === null
      ? { 'aria-hidden': true }
      : { role: 'img', 'aria-label': label ?? (done ? 'Reply complete' : 'Reply streaming') };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', width: size, height: size, ...style }}
      {...a11y}
    />
  );
});

export default TokenOrb;
