// Playground state in the URL: ?orb=search-orb&phase=ranking&sources=8
// Only values that differ from the playground's starting values are written,
// and everything read back is validated against the control, so a hand-edited
// or stale link can never put a control into an impossible state.

import type { Control, Value, Values } from './registry';

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_TEXT = 80;

export function encodeValue(c: Control, v: Value): string {
  if (c.type === 'toggle') return v ? '1' : '0';
  return String(v);
}

/** Parse a query value for a control, or return undefined if it isn't valid. */
export function decodeValue(c: Control, raw: string): Value | undefined {
  switch (c.type) {
    case 'toggle':
      return raw === '1' || raw === 'true' ? true : raw === '0' || raw === 'false' ? false : undefined;
    case 'range': {
      if (raw.trim() === '') return undefined;
      const n = Number(raw);
      if (!Number.isFinite(n)) return undefined;
      const snapped = c.min + Math.round((n - c.min) / c.step) * c.step;
      return Math.round(Math.min(c.max, Math.max(c.min, snapped)) * 1000) / 1000;
    }
    case 'select':
      return c.options.includes(raw) ? raw : undefined;
    case 'color':
      return HEX.test(raw) ? raw.toLowerCase() : undefined;
    case 'text':
      return raw.slice(0, MAX_TEXT);
  }
}

/**
 * Start from each control's initial value and apply any valid overrides.
 * `adjust` (the entry's linked-controls rule) runs as if the overrides were
 * typed in, but never replaces a value the link set explicitly.
 */
export function readValues(controls: Control[], params: URLSearchParams, adjust?: (prev: Values, next: Values) => Values): Values {
  const init: Values = {};
  const explicit: Values = {};
  for (const c of controls) {
    init[c.key] = c.init;
    const raw = params.get(c.key);
    const v = raw === null ? undefined : decodeValue(c, raw);
    if (v !== undefined) explicit[c.key] = v;
  }
  const merged = { ...init, ...explicit };
  return adjust ? { ...adjust(init, merged), ...explicit } : merged;
}

const same = (a: Value, b: Value) => (typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Query string (with the leading '?') for an orb and its values. */
export function writeQuery(slug: string, controls: Control[], values: Values): string {
  const params = new URLSearchParams({ orb: slug });
  for (const c of controls) {
    const v = values[c.key];
    if (v !== undefined && !same(v, c.init)) params.set(c.key, encodeValue(c, v));
  }
  return '?' + params.toString();
}
