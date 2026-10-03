// A stat block: a few headline numbers as a description list, each with an optional change and tone.

import type { Block } from '../protocol';

export type StatProps = Omit<Extract<Block, { kind: 'stat' }>, 'kind'>;

export function Stat({ items }: StatProps) {
  return (
    <dl className="as-stat">
      {items.map((it, i) => (
        <div key={i} className="as-stat-item">
          <dt>{it.label}</dt>
          <dd className="as-stat-value">{it.value}</dd>
          {it.delta && (
            <dd className="as-stat-delta" data-tone={it.tone ?? 'neutral'}>
              {it.delta}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
