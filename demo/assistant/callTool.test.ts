// Tests for the tool caller: policy denials, events, simulated outages and abort.

import { afterEach, describe, expect, it } from 'vitest';
import { createCaller, queryTool } from './callTool';
import { setDown } from './flaky';
import type { AssistantEvent, Policy, Tool } from './protocol';

const tools: Tool[] = [
  { id: 'x.ok', label: 'x.ok', system: 'X', run: async () => ({ n: 1 }) },
  {
    id: 'x.throws',
    label: 'x.throws',
    system: 'X',
    run: async () => {
      throw new Error('boom');
    },
  },
  { id: 'x.secret', label: 'x.secret', system: 'X', run: async () => ({ s: 1 }) },
];
const policy: Policy = {
  before: (tool) => (tool.id === 'x.secret' ? { reason: 'Secret.', alternative: 'Try x.ok.' } : null),
  after: (tool, output) => (tool.id === 'x.ok' ? { output, restricted: 'trimmed' } : { output }),
};
const def = { tools, policy };
const now = new Date('2026-10-03T09:00:00Z');

function setup(latency = 0, signal = new AbortController().signal) {
  const emitted: AssistantEvent[] = [];
  const call = createCaller(def, { now, emit: (e) => emitted.push(e), signal, latency: () => latency });
  return { call, emitted };
}

afterEach(() => setDown('X', false));

describe('createCaller', () => {
  it('returns unknown-tool with no events', async () => {
    const { call, emitted } = setup();
    expect(await call('nope')).toMatchObject({ ok: false, reason: 'unknown-tool' });
    expect(emitted).toEqual([]);
  });

  it('runs a tool, applies policy.after and emits running then done', async () => {
    const { call, emitted } = setup();
    expect(await call('x.ok')).toEqual({ ok: true, data: { n: 1 }, restricted: 'trimmed' });
    expect(emitted).toEqual([
      { type: 'tool', id: 'x.ok#1', label: 'x.ok', status: 'running' },
      { type: 'tool', id: 'x.ok#1', status: 'done' },
    ]);
  });

  it('fails with the system name when it is down', async () => {
    setDown('X', true);
    const { call, emitted } = setup();
    expect(await call('x.ok')).toEqual({ ok: false, reason: 'failed', message: "X didn't respond" });
    expect(emitted[emitted.length - 1]).toMatchObject({ type: 'tool', status: 'error' });
  });

  it('denies through policy.before with no events', async () => {
    const { call, emitted } = setup();
    expect(await call('x.secret')).toEqual({ ok: false, reason: 'denied', message: 'Secret.', alternative: 'Try x.ok.' });
    expect(emitted).toEqual([]);
  });

  it('turns a thrown error into a failure', async () => {
    const { call, emitted } = setup();
    expect(await call('x.throws')).toMatchObject({ ok: false, reason: 'failed' });
    expect(emitted[emitted.length - 1]).toMatchObject({ type: 'tool', status: 'error' });
  });

  it('rejects with AbortError and emits error when aborted mid-latency', async () => {
    const ac = new AbortController();
    const { call, emitted } = setup(50, ac.signal);
    const p = call('x.ok');
    setTimeout(() => ac.abort(), 5);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(emitted[emitted.length - 1]).toMatchObject({ type: 'tool', status: 'error' });
  });
});

describe('queryTool', () => {
  it('ignores outages and applies the policy', async () => {
    setDown('X', true);
    expect(await queryTool(def, 'x.ok', undefined, { now })).toEqual({ ok: true, data: { n: 1 }, restricted: 'trimmed' });
    expect(await queryTool(def, 'x.secret', undefined, { now })).toMatchObject({ ok: false, reason: 'denied' });
    expect(await queryTool(def, 'nope', undefined, { now })).toMatchObject({ ok: false, reason: 'unknown-tool' });
  });
});
