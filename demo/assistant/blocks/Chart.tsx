// A chart block as plain SVG: grouped bars or lines on one value axis from 0, with ticks from niceTicks.
// Screen readers get the caption as the image's name and the same numbers in a visually hidden table.

import type { Block } from '../protocol';
import { niceTicks } from './scale';

export type ChartProps = Omit<Extract<Block, { kind: 'chart' }>, 'kind'>;

const W = 360;
const H = 200;
const TOP = 24;
const BOTTOM = 24;
const RIGHT = 8;
const SERIES = 8;

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

const isMoney = (unit?: string) => unit === 'USD' || unit === '$';

/** A tick label: short, with the unit where it reads naturally ($1.2K, 40 h). */
function tickLabel(v: number, unit?: string): string {
  if (isMoney(unit)) return `$${compact.format(v)}`;
  return compact.format(v);
}

/** A value as said in a tooltip or table: 1,234 h, $12,400. */
export function valueLabel(v: number, unit?: string): string {
  if (!Number.isFinite(v)) return '—';
  if (isMoney(unit)) return `$${full.format(v)}`;
  return unit ? `${full.format(v)} ${unit}` : full.format(v);
}

/** A bar with 4px rounded top corners, anchored square on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Chart({ type, series, x, unit, caption }: ChartProps) {
  const shown = series.slice(0, SERIES);
  const values = shown.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const ticks = niceTicks(Math.max(0, ...values));
  const top = ticks[ticks.length - 1];
  const left = Math.max(...ticks.map((t) => tickLabel(t, unit).length)) * 6.6 + 10;
  const plotW = W - left - RIGHT;
  const plotH = H - TOP - BOTTOM;
  const y = (v: number) => TOP + plotH - (Math.max(0, Number.isFinite(v) ? v : 0) / top) * plotH;
  const band = plotW / Math.max(1, x.length);
  const label = caption ?? `${type === 'bar' ? 'Bar' : 'Line'} chart${unit ? ` in ${unit}` : ''}`;
  // with many categories, label every other one so the words never collide
  const every = Math.ceil(x.length / 8);
  const color = (i: number) => `var(--as-series-${(i % SERIES) + 1})`;

  const bars = () => {
    const gap = 2;
    // bars stay slim however few there are
    const w = Math.max(2, Math.min(40, (band * 0.72 - gap * (shown.length - 1)) / shown.length));
    const inner = w * shown.length + gap * (shown.length - 1);
    return shown.map((s, si) => (
      <g key={s.name} fill={color(si)}>
        {x.map((cat, xi) => {
          const v = s.values[xi] ?? 0;
          const bx = left + xi * band + (band - inner) / 2 + si * (w + gap);
          const by = y(v);
          return (
            <path key={cat} d={barPath(bx, by, w, TOP + plotH - by)}>
              <title>{`${s.name}, ${cat}: ${valueLabel(v, unit)}`}</title>
            </path>
          );
        })}
      </g>
    ));
  };

  const lines = () =>
    shown.map((s, si) => {
      const pts = x.map((_, xi) => [left + xi * band + band / 2, y(s.values[xi] ?? 0)] as const);
      return (
        <g key={s.name} stroke={color(si)} fill={color(si)}>
          <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map(([px, py], xi) => (
            <circle key={xi} cx={px} cy={py} r="4" stroke="var(--as-bg)" strokeWidth="2">
              <title>{`${s.name}, ${x[xi]}: ${valueLabel(s.values[xi] ?? 0, unit)}`}</title>
            </circle>
          ))}
        </g>
      );
    });

  return (
    <figure className="as-chart">
      {caption && (
        // the image is named by the same caption, so it is said once
        <figcaption className="as-chart-caption" aria-hidden="true">
          {caption}
        </figcaption>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="as-chart-svg">
        {unit && (
          <text x={left - 8} y={TOP - 12} textAnchor="end" className="as-chart-unit">
            {isMoney(unit) ? 'USD' : unit}
          </text>
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - RIGHT} y1={y(t)} y2={y(t)} className={t === 0 ? 'as-chart-base' : 'as-chart-grid'} />
            <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="as-chart-tick">
              {tickLabel(t, unit)}
            </text>
          </g>
        ))}
        {x.map((cat, xi) =>
          xi % every === 0 ? (
            <text key={cat + xi} x={left + xi * band + band / 2} y={H - 6} textAnchor="middle" className="as-chart-tick">
              {cat}
            </text>
          ) : null,
        )}
        {type === 'bar' ? bars() : lines()}
      </svg>
      {shown.length > 1 && (
        <ul className="as-legend" aria-hidden="true">
          {shown.map((s, i) => (
            <li key={s.name}>
              <i style={{ background: color(i) }} data-shape={type} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <table className="sr-only as-sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{unit ? `Series (${unit})` : 'Series'}</th>
            {x.map((cat, i) => (
              <th key={i} scope="col">
                {cat}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((s) => (
            <tr key={s.name}>
              <th scope="row">{s.name}</th>
              {x.map((_, i) => (
                <td key={i}>{valueLabel(s.values[i] ?? NaN, unit)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
