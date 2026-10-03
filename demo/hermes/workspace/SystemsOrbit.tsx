// The systems Hermes reads, on a ring around the bot: each a button that asks about it. A system being read glows, and a
// beam runs from it to the bot. In a narrow column the ring folds into one row of icons under the bot. Under reduced
// motion nothing moves: the ring and the beams are drawn still.

import type { CSSProperties, ReactNode } from 'react';
import { useAssistant } from '../../assistant/AssistantProvider';
import { focusComposer } from '../../assistant/Composer';
import { HERMES_SYSTEMS } from './systems';
import type { HermesSystemName } from './systems';

/** The stage is drawn in 640 × 360; the ring is an ellipse round the bot, and the systems sit on it, leaving the pedestal clear. */
const W = 640;
const H = 360;
const RING = { cx: 320, cy: 180, rx: 262, ry: 140 };
/** where a beam ends: just inside the bot, which is drawn over the beams, so they meet its body wherever they come from */
const BOT = { cx: 320, cy: 172, rx: 58, ry: 64 };

const ANGLE: Record<HermesSystemName, number> = { Directory: 245, Clockify: 295, Jira: 340, GitHub: 20, Teams: 160, AWS: 200 };

const point = (name: HermesSystemName) => {
  const a = (ANGLE[name] * Math.PI) / 180;
  return { x: RING.cx + RING.rx * Math.cos(a), y: RING.cy + RING.ry * Math.sin(a) };
};

/** The beam from a system to the edge of the bot. */
function beam(name: HermesSystemName) {
  const p = point(name);
  const dx = p.x - BOT.cx;
  const dy = p.y - BOT.cy;
  const k = 1 / Math.hypot(dx / BOT.rx, dy / BOT.ry);
  return { x1: p.x, y1: p.y, x2: BOT.cx + dx * k, y2: BOT.cy + dy * k };
}

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

export function SystemsOrbit({ active, children }: { active: ReadonlySet<string>; children: ReactNode }) {
  const { conversation } = useAssistant();
  const ask = (text: string) => {
    void conversation.send(text);
    focusComposer();
  };

  return (
    <div className="orbit">
      <svg className="orbit-lines" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="orbit-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b7cff" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#3fd8ff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#8b7cff" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <ellipse className="orbit-ring" cx={RING.cx} cy={RING.cy} rx={RING.rx} ry={RING.ry} stroke="url(#orbit-ring)" />
        <ellipse className="orbit-ring-dash" cx={RING.cx} cy={RING.cy} rx={RING.rx} ry={RING.ry} />
        {HERMES_SYSTEMS.map((s) => (
          <line key={s.name} className="orbit-link" data-active={active.has(s.name) || undefined} {...beam(s.name)} />
        ))}
      </svg>
      <div className="orbit-bot">{children}</div>
      <ul className="orbit-nodes" aria-label="Systems Hermes reads">
        {HERMES_SYSTEMS.map((s) => {
          const p = point(s.name);
          const on = active.has(s.name);
          return (
            <li key={s.name} style={{ '--x': pct(p.x, W), '--y': pct(p.y, H) } as CSSProperties}>
              <button
                type="button"
                className="orbit-node"
                data-system={s.name}
                data-active={on || undefined}
                aria-label={`Ask about ${s.name}`}
                title={s.ask}
                onClick={() => ask(s.ask)}
              >
                <span className="orbit-icon">{s.icon}</span>
                <span className="orbit-name">{s.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
