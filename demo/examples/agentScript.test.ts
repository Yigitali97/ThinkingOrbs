import { describe, expect, it } from 'vitest';
import { advance, ANSWER, buildRun, initialRun, runLength, STAGE_ORDER } from './agentScript';

describe('agent run script', () => {
  const events = buildRun();

  it('is sorted by time', () => {
    for (let i = 1; i < events.length; i++) expect(events[i].at).toBeGreaterThanOrEqual(events[i - 1].at);
  });

  it('ends with the full answer, every tool finished and a summary per stage', () => {
    const { state, next } = advance(initialRun(), events, 0, runLength(events));
    expect(next).toBe(events.length);
    expect(state.stage).toBe('done');
    expect(state.text).toBe(ANSWER);
    expect(state.tokens).toBe(ANSWER.split(' ').length);
    expect(state.tools.every((t) => t.status !== 'running')).toBe(true);
    expect(state.phase).toBe('done');
    expect(state.log.map((l) => l.stage)).toEqual(['thinking', 'searching', 'tools']);
    expect(state.log[2]).toEqual({ stage: 'tools', text: 'Used 3 tools, 1 failed', ok: false });
    expect(state.log[0].text).toMatch(/^Thought for \d+\.\ds$/);
    expect(state.log[1].text).toBe('Read 8 sources');
  });

  it('only moves forward through the stages', () => {
    let s = initialRun();
    let next = 0;
    let last = 0;
    const end = runLength(events);
    for (let t = 0; t < end + 50; t += 50) {
      t = Math.min(t, end);
      ({ state: s, next } = advance(s, events, next, t));
      const k = STAGE_ORDER.indexOf(s.stage);
      expect(k).toBeGreaterThanOrEqual(last);
      last = k;
    }
    expect(s.stage).toBe('done');
  });

  it('gives the same result however finely it is stepped', () => {
    const end = runLength(events);
    const once = advance(initialRun(), events, 0, end).state;
    let s = initialRun();
    let next = 0;
    for (let t = 0; t <= end; t += 7) ({ state: s, next } = advance(s, events, next, t));
    ({ state: s } = advance(s, events, next, end));
    expect(s.text).toBe(once.text);
    expect(s.tools).toEqual(once.tools);
    expect(s.sources).toEqual(once.sources);
  });

  it('keeps arrays stable when nothing about them changed', () => {
    const a = advance(initialRun(), events, 0, 6000);
    const b = advance(a.state, events, a.next, 6050);
    if (b.next === a.next) expect(b.state).toBe(a.state);
    const late = advance(initialRun(), events, 0, runLength(events) - 400);
    const later = advance(late.state, events, late.next, runLength(events));
    expect(later.state.sources).toBe(late.state.sources);
    expect(later.state.steps).toBe(late.state.steps);
  });
});
