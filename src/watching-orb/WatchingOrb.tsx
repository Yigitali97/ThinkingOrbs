'use client';

import { CSSProperties, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createWatchingOrb, WatchingOrbHandle } from './engine';

export interface WatchingOrbProps {
  /** Width and height in CSS pixels. */
  size?: number;
  ballColor?: string;
  eyeColor?: string;
  /** Hairline around the ball; pass 'transparent' to hide. */
  outlineColor?: string;
  /** Blink at random intervals. */
  blinking?: boolean;
  /** Accessible label. Pass `null` to hide from assistive tech. */
  label?: string | null;
  className?: string;
  style?: CSSProperties;
}

export interface WatchingOrbRef {
  /** Trigger a blink right now. */
  blink(): void;
}

export const WatchingOrb = forwardRef<WatchingOrbRef, WatchingOrbProps>(function WatchingOrb(
  {
    size = 240,
    ballColor = '#f2f2f2',
    eyeColor = '#0e0e0e',
    outlineColor = 'rgba(0, 0, 0, 0.35)',
    blinking = true,
    label = 'Orb watching the pointer',
    className,
    style,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<WatchingOrbHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createWatchingOrb(canvas, { size, ballColor, eyeColor, outlineColor, blinking });
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    orbRef.current?.update({ size, ballColor, eyeColor, outlineColor, blinking });
  }, [size, ballColor, eyeColor, outlineColor, blinking]);

  useImperativeHandle(ref, () => ({ blink: () => orbRef.current?.blink() }), []);

  const a11y = label === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: size, height: size, ...style }}
      {...a11y}
    />
  );
});

export default WatchingOrb;
