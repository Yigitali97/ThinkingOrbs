'use client';

import { CSSProperties, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { BubbleOrbHandle, createBubbleOrb } from './engine';

export interface BubbleOrbProps {
  /** Canvas width and height in CSS pixels; the bubble fills ~70%, the rest is glow room. */
  size?: number;
  /** Body tint as a hex color. */
  color?: string;
  /** Blink at random intervals. */
  blinking?: boolean;
  /** Jelly bounce when pressed. */
  bouncy?: boolean;
  /** Accessible label. Pass `null` to hide from assistive tech. */
  label?: string | null;
  className?: string;
  style?: CSSProperties;
}

export interface BubbleOrbRef {
  blink(): void;
  /** Trigger the jelly bounce, e.g. when a reply arrives. */
  bounce(strength?: number): void;
}

export const BubbleOrb = forwardRef<BubbleOrbRef, BubbleOrbProps>(function BubbleOrb(
  { size = 240, color = '#5f9ae6', blinking = true, bouncy = true, label = 'Bubble character', className, style },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<BubbleOrbHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createBubbleOrb(canvas, { size, color, blinking, bouncy });
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    orbRef.current?.update({ size, color, blinking, bouncy });
  }, [size, color, blinking, bouncy]);

  useImperativeHandle(
    ref,
    () => ({
      blink: () => orbRef.current?.blink(),
      bounce: (strength?: number) => orbRef.current?.bounce(strength),
    }),
    []
  );

  const a11y = label === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: size, height: size, touchAction: 'manipulation', ...style }}
      {...a11y}
    />
  );
});

export default BubbleOrb;
