import { describe, expect, it } from 'vitest';
import { applyAssistantEvent, createAssistantReply, finishAssistantReply } from './reply';
import { int, pick, seeded } from './random';
import { hasAny, normalize, parseRange, percentChange, previousRange } from './text';

describe('random', () => {
  it('seeded is deterministic', () => {
    const a = seeded(7), b = seeded(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('seeded stays in [0, 1) and int / pick stay in range', () => {
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = int(rng, 2, 4);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
      expect(['a', 'b', 'c']).toContain(pick(rng, ['a', 'b', 'c']));
    }
  });
});

describe('assistant reply', () => {
  it('a block event appends and keeps activities', () => {
    let r = createAssistantReply('r1', 0);
    r = applyAssistantEvent(r, { type: 'tool', id: 't1', label: 'Reading Jira issues', status: 'running' }, 1);
    r = applyAssistantEvent(r, { type: 'block', block: { kind: 'link', label: 'Open', href: '/hermes/' } }, 2);
    expect(r.blocks).toHaveLength(1);
    expect(r.activities[0].kind).toBe('tools');
    expect(finishAssistantReply(r, 'done', 3).blocks).toHaveLength(1);
  });
  it('a block sets the first-text time and the writing state once', () => {
    let r = createAssistantReply('r1', 0);
    r = applyAssistantEvent(r, { type: 'block', block: { kind: 'link', label: 'A', href: '/a' } }, 5);
    expect(r.firstTextAt).toBe(5);
    expect(r.state).toBe('writing');
    r = applyAssistantEvent(r, { type: 'block', block: { kind: 'link', label: 'B', href: '/b' } }, 9);
    expect(r.firstTextAt).toBe(5);
    expect(r.blocks).toHaveLength(2);
  });
  it('text events keep the blocks', () => {
    let r = createAssistantReply('r1', 0);
    r = applyAssistantEvent(r, { type: 'block', block: { kind: 'link', label: 'A', href: '/a' } }, 1);
    r = applyAssistantEvent(r, { type: 'text', delta: 'Hi' }, 2);
    expect(r.blocks).toHaveLength(1);
    expect(r.text).toBe('Hi');
  });
});

describe('text helpers', () => {
  it('parseRange this week starts Monday', () => {
    const now = new Date('2026-10-07T15:00:00'); // Wednesday
    expect(parseRange('hours this week?', now)!.from).toEqual(new Date('2026-10-05T00:00:00'));
    expect(parseRange('last week', now)!.to).toEqual(new Date('2026-10-05T00:00:00'));
    expect(parseRange('last month', now)!.from).toEqual(new Date('2026-09-01T00:00:00'));
    expect(parseRange('tell me a joke', now)).toBeNull();
  });
  it('this week on Monday just after midnight is a 30-minute range', () => {
    const r = parseRange('this week', new Date('2026-10-05T00:30:00'))!;
    expect(r.to.getTime() - r.from.getTime()).toBe(30 * 60_000);
  });
  it('parseRange handles today, yesterday and this month', () => {
    const now = new Date('2026-10-07T15:00:00');
    expect(parseRange('today', now)).toMatchObject({ from: new Date('2026-10-07T00:00:00'), to: now });
    expect(parseRange('yesterday', now)).toMatchObject({ from: new Date('2026-10-06T00:00:00'), to: new Date('2026-10-07T00:00:00') });
    expect(parseRange('this month', now)).toMatchObject({ from: new Date('2026-10-01T00:00:00'), to: now });
  });
  it('previousRange is the same length immediately before', () => {
    const now = new Date('2026-10-07T15:00:00');
    const prev = previousRange(parseRange('last week', now)!);
    expect(prev.from).toEqual(new Date('2026-09-21T00:00:00'));
    expect(prev.to).toEqual(new Date('2026-09-28T00:00:00'));
  });
  it('percentChange guards zero', () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(1, 3)).toBe(-66.7);
  });
  it('hasAny matches whole words only', () => {
    expect(hasAny('Any PRs waiting?', ['prs'])).toBe(true);
    expect(hasAny('approves', ['prs'])).toBe(false);
  });
  it('normalize lowercases, straightens quotes and collapses whitespace', () => {
    expect(normalize('  What’s   “Up”\n')).toBe('what\'s "up"');
  });
});
