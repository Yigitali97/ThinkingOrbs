'use client';

import { CSSProperties, useEffect, useRef } from 'react';
import { createReasoningOrb, REASONING_COLORS, ReasoningOrbHandle, ReasoningStep } from './engine';

export interface ReasoningOrbProps {
  /** Reasoning steps so far; each new one adds a node to the constellation. */
  steps: ReasoningStep[];
  /** Still reasoning (orange) or finished (green). */
  thinking?: boolean;
  /** 0..1 share of the thinking budget used; shown as an outer arc. Omit to hide. */
  budget?: number;
  /** Orb width and height in CSS pixels. */
  size?: number;
  /** Show the current step under the orb. */
  showCaption?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ReasoningOrb({ steps, thinking = true, budget, size = 280, showCaption = true, className, style }: ReasoningOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<ReasoningOrbHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createReasoningOrb(canvas, { size, steps, thinking, budget });
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    orbRef.current?.update({ size, steps, thinking, budget });
  }, [size, steps, thinking, budget]);

  const n = steps.length;
  const current = steps[n - 1]?.label;
  const text = thinking
    ? n
      ? `Step ${n}${current ? ` · ${current}` : ''}`
      : 'Thinking…'
    : `Reasoned in ${n} step${n === 1 ? '' : 's'}`;

  return (
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, ...style }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: size, height: size }} role="img" aria-label={text} />
      {showCaption && (
        <div
          aria-live="polite"
          style={{
            minHeight: '1.4em',
            maxWidth: size + 80,
            textAlign: 'center',
            fontSize: 14,
            color: thinking ? '#c9c9ce' : REASONING_COLORS.done,
            transition: 'color 0.4s',
          }}
        >
          {text}
          {thinking && budget != null && (
            <span style={{ color: budget > 0.85 ? REASONING_COLORS.over : '#7a7a82', marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(budget * 100)}% of budget
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ReasoningOrb;
