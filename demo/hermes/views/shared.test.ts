// Tests for the page helpers: a page's data load reports what it resolved to, or that it failed, unless it was cancelled first.

import { describe, expect, it } from 'vitest';
import { trackLoad } from './shared';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('trackLoad', () => {
  it('reports the data a load resolves to', async () => {
    const seen: unknown[] = [];
    trackLoad(async () => 42, (s) => seen.push(s));
    await tick();
    expect(seen).toEqual([{ data: 42, failed: false }]);
  });

  it('reports a load that rejects, or throws before it starts, as failed', async () => {
    const seen: unknown[] = [];
    trackLoad(() => Promise.reject(new Error('boom')), (s) => seen.push(s));
    trackLoad(() => {
      throw new Error('sync boom');
    }, (s) => seen.push(s));
    await tick();
    expect(seen).toEqual([{ failed: true }, { failed: true }]);
  });

  it('reports nothing once cancelled', async () => {
    const seen: unknown[] = [];
    const cancel = trackLoad(() => Promise.reject(new Error('late')), (s) => seen.push(s));
    cancel();
    trackLoad(async () => 1, (s) => seen.push(s))();
    await tick();
    expect(seen).toEqual([]);
  });
});
