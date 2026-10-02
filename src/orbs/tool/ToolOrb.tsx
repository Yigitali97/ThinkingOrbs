'use client';

import { CSSProperties, useEffect, useMemo, useRef } from 'react';
import { createToolOrb, TOOL_COLORS, ToolCall, ToolOrbHandle } from './engine';
import './tool-orb.css';

export interface ToolOrbProps {
  /** Current tool calls. A satellite appears per running tool, docks on `done`, drops on `error`. */
  tools: ToolCall[];
  /** Orb width and height in CSS pixels. */
  size?: number;
  /** Show a labelled chip per tool under the orb. */
  showLabels?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ToolOrb({ tools, size = 200, showLabels = true, className, style }: ToolOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<ToolOrbHandle | null>(null);
  // stable color per tool id, in order of first appearance
  const colorsRef = useRef(new Map<string, string>());
  const colored = useMemo(
    () =>
      tools.map((tool) => {
        const map = colorsRef.current;
        if (!map.has(tool.id)) map.set(tool.id, tool.color ?? TOOL_COLORS[map.size % TOOL_COLORS.length]);
        return { ...tool, color: map.get(tool.id)! };
      }),
    [tools]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createToolOrb(canvas, { size, tools: colored });
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    orbRef.current?.update({ size, tools: colored });
  }, [size, colored]);

  const running = colored.filter((t) => t.status === 'running').length;

  return (
    <div className={['to', className].filter(Boolean).join(' ')} style={style}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: size, height: size }}
        role="img"
        aria-label={running ? `Running ${running} tool${running > 1 ? 's' : ''}` : 'No tools running'}
      />
      {showLabels && colored.length > 0 && (
        <ul className="to-list" aria-live="polite">
          {colored.map((tool) => (
            <li key={tool.id} className="to-chip" data-status={tool.status}>
              <span className="to-dot" style={{ background: tool.status === 'error' ? '#f05252' : tool.color }} />
              <span className="to-name">{tool.label ?? tool.id}</span>
              <span className="to-state" aria-hidden="true">
                {tool.status === 'running' ? <span className="to-spin" /> : tool.status === 'done' ? '✓' : '✕'}
              </span>
              <span className="to-sr">{tool.status === 'running' ? ', running' : tool.status === 'done' ? ', done' : ', failed'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ToolOrb;
