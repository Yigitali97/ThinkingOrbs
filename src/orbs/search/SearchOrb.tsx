'use client';

import { CSSProperties, useEffect, useRef } from 'react';
import { createSearchOrb, SEARCH_COLORS, SearchOrbHandle, SearchPhase, SearchSource } from './engine';

export interface SearchOrbProps {
  /** idle · searching · ranking · synthesizing · done · empty */
  phase: SearchPhase;
  /** Sources found so far; each new one flies in. Give `score` (0..1) to rank them. */
  sources?: SearchSource[];
  /** Orb width and height in CSS pixels. */
  size?: number;
  /** Show a status line such as "Searching · 7 sources" under the orb. */
  showCaption?: boolean;
  className?: string;
  style?: CSSProperties;
}

function caption(phase: SearchPhase, n: number) {
  const sources = `${n} source${n === 1 ? '' : 's'}`;
  switch (phase) {
    case 'searching':
      return n ? `Searching · ${sources}` : 'Searching…';
    case 'ranking':
      return `Ranking ${sources}`;
    case 'synthesizing':
      return `Synthesizing ${sources}`;
    case 'done':
      return `Done · ${sources}`;
    case 'empty':
      return 'No results';
    default:
      return '';
  }
}

export function SearchOrb({ phase, sources = [], size = 260, showCaption = true, className, style }: SearchOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<SearchOrbHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createSearchOrb(canvas, { size, phase, sources });
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    orbRef.current?.update({ size, phase, sources });
  }, [size, phase, sources]);

  const text = caption(phase, sources.length);
  const accent = phase === 'done' || phase === 'empty';

  return (
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, ...style }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: size, height: size }} role="img" aria-label={text || 'Search'} />
      {showCaption && (
        <div
          aria-live="polite"
          style={{
            minHeight: '1.4em',
            fontSize: 14,
            color: accent ? SEARCH_COLORS[phase] : '#b9b9c2',
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

export default SearchOrb;
