'use client';

import { CSSProperties, useEffect, useRef } from 'react';
import { createVisionOrb, VisionFocus, VisionOrbHandle, VisionStatus } from './engine';

export interface VisionOrbProps {
  /** Image URL — same-origin, CORS-enabled, `data:` or `blob:` (e.g. URL.createObjectURL(file)). */
  src?: string | null;
  /** loading · scanning · done · error */
  status?: VisionStatus;
  /** Points of interest (0..1 image coordinates), pulsed once done. */
  focus?: VisionFocus[];
  /** Orb width and height in CSS pixels. */
  size?: number;
  showCaption?: boolean;
  className?: string;
  style?: CSSProperties;
}

function caption(status: VisionStatus, found: number) {
  switch (status) {
    case 'loading':
      return 'Loading image…';
    case 'scanning':
      return 'Looking at the image…';
    case 'done':
      return found ? `Found ${found} thing${found === 1 ? '' : 's'}` : 'Image understood';
    case 'error':
      return "Couldn't read the image";
  }
}

export function VisionOrb({ src = null, status = 'loading', focus = [], size = 300, showCaption = true, className, style }: VisionOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<VisionOrbHandle | null>(null);
  const focusKey = JSON.stringify(focus);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createVisionOrb(canvas, { size, src, status, focus });
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    orbRef.current?.update({ size, src, status, focus });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, src, status, focusKey]);

  const text = caption(status, focus.length);
  const labels = focus.map((f) => f.label).filter(Boolean).join(', ');

  return (
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, ...style }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: size, height: size }}
        role="img"
        aria-label={status === 'done' && labels ? `${text}: ${labels}` : text}
      />
      {showCaption && (
        <div
          aria-live="polite"
          style={{
            minHeight: '1.4em',
            fontSize: 14,
            color: status === 'done' ? '#34d399' : status === 'error' ? '#f05252' : '#b9b9c2',
            transition: 'color 0.4s',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

export default VisionOrb;
