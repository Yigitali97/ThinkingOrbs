'use client';

import { CSSProperties, useEffect, useRef } from 'react';
import { createOrb, OrbHandle, OrbVariant } from './engine';

export interface ThinkingOrbProps {
  /** Which animation to play. Can be changed at any time. */
  variant?: OrbVariant;
  /** Width and height in CSS pixels. */
  size?: number;
  /** Dot color — any CSS color string. */
  color?: string;
  /** Freeze on the current frame. */
  paused?: boolean;
  /** Accessible label; defaults to the variant name. Pass `null` to hide from assistive tech. */
  label?: string | null;
  className?: string;
  style?: CSSProperties;
}

export function ThinkingOrb({
  variant = 'base',
  size = 72,
  color = '#ffffff',
  paused = false,
  label,
  className,
  style,
}: ThinkingOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<OrbHandle | null>(null);

  // Mount once; later prop changes are pushed into the live orb below.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createOrb(canvas, { variant, size, color, paused });
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => orbRef.current?.setVariant(variant), [variant]);
  useEffect(() => orbRef.current?.setSize(size), [size]);
  useEffect(() => orbRef.current?.setColor(color), [color]);
  useEffect(() => orbRef.current?.setPaused(paused), [paused]);

  const a11y =
    label === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label ?? variant };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: size, height: size, ...style }}
      {...a11y}
    />
  );
}

export default ThinkingOrb;
