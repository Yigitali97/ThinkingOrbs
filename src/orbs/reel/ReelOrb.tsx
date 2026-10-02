'use client';

import { CSSProperties, useEffect, useRef } from 'react';
import { createReelOrb, REEL_COLORS, ReelOrbHandle, ReelStatus } from './engine';

export interface ReelOrbProps {
  /** Thumbnail URLs, one per frame — e.g. from `captureFrames(file)`. */
  frames?: string[];
  /** Number of frames to show when you don't have thumbnails. */
  count?: number;
  /** 0..1 — how far through the video the analysis is. */
  progress?: number;
  /** loading · analyzing · done · error */
  status?: ReelStatus;
  width?: number;
  height?: number;
  showCaption?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ReelOrb({
  frames = [],
  count = 12,
  progress = 0,
  status = 'loading',
  width = 420,
  height = 260,
  showCaption = true,
  className,
  style,
}: ReelOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<ReelOrbHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createReelOrb(canvas, { width, height, frames, count, progress, status });
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    orbRef.current?.update({ width, height, frames, count, progress, status });
  }, [width, height, frames, count, progress, status]);

  const n = frames.length || count;
  const current = Math.min(n, Math.floor(progress * n) + 1);
  const text =
    status === 'loading'
      ? 'Loading video…'
      : status === 'analyzing'
        ? `Watching frame ${current} of ${n}`
        : status === 'done'
          ? `Watched ${n} frames`
          : "Couldn't read the video";

  return (
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, ...style }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width, height, maxWidth: '100%' }}
        role="progressbar"
        aria-label={text}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((status === 'done' ? 1 : progress) * 100)}
      />
      {showCaption && (
        <div
          aria-hidden="true"
          style={{
            minHeight: '1.4em',
            fontSize: 14,
            color: status === 'done' || status === 'error' ? REEL_COLORS[status] : '#b9b9c2',
            transition: 'color 0.4s',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

export default ReelOrb;
