// A table block: a real <table> with an optional caption, numbers aligned right, and the first cell linked when a row has an href.

import { Link } from '../../site/router';
import type { Block } from '../protocol';

export type TableProps = Omit<Extract<Block, { kind: 'table' }>, 'kind'>;

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function cell(v: string | number | undefined): string {
  if (typeof v === 'number') return Number.isFinite(v) ? NUMBER.format(v) : '—';
  return v ?? '';
}

export function Table({ columns, rows, caption }: TableProps) {
  return (
    // a wide table scrolls inside its own box, which keyboard users can reach and scroll
    <div className="as-table-wrap" role="region" aria-label={caption ?? 'Table'} tabIndex={0}>
      <table className="as-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" data-align={c.align ?? 'left'}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c, j) => {
                const text = cell(row[c.key]);
                const content = j === 0 && row.href ? <Link to={row.href}>{text}</Link> : text;
                return j === 0 ? (
                  <th key={c.key} scope="row" data-align={c.align ?? 'left'}>
                    {content}
                  </th>
                ) : (
                  <td key={c.key} data-align={c.align ?? (typeof row[c.key] === 'number' ? 'right' : 'left')}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
