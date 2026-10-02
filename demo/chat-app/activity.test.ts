import { describe, expect, it } from 'vitest';
import { applyEvent, createReply, currentActivity, finishReply, liveLabel, Reply, shownActivity, summarize } from './activity';
import type { AgentEvent } from './agent';

/** Feed events in order, one second apart. */
function run(events: AgentEvent[], start = 0): Reply {
  return events.reduce((r, e, i) => applyEvent(r, e, start + (i + 1) * 1000), createReply('r', start));
}

describe('activity timeline', () => {
  it('groups reasoning steps into one thinking activity that ends at the first words', () => {
    const r = run([
      { type: 'thinking', label: 'Restating the question' },
      { type: 'thinking', label: 'Comparing options', budget: 0.4 },
      { type: 'text', delta: 'Over 8 years…' },
    ]);
    expect(r.activities).toHaveLength(1);
    const [a] = r.activities;
    expect(a.kind).toBe('thinking');
    expect(a.status).toBe('done');
    expect(a.kind === 'thinking' && a.steps.map((s) => s.label)).toEqual(['Restating the question', 'Comparing options']);
    expect(a.kind === 'thinking' && a.budget).toBe(0.4);
    expect(r.state).toBe('writing');
    expect(summarize(r)).toBe('Thought for 2s');
  });

  it('keeps one tools group until every call has finished, and counts failures', () => {
    const r = run([
      { type: 'tool', id: 'a', label: 'hotels.search', status: 'running' },
      { type: 'tool', id: 'b', label: 'weather.forecast', status: 'running' },
      { type: 'tool', id: 'a', status: 'done' },
    ]);
    expect(r.activities).toHaveLength(1);
    expect(r.activities[0].status).toBe('active');
    expect(liveLabel(currentActivity(r), 4000)).toEqual({ title: 'Running weather.forecast', meta: ['1 of 2 finished', '3s'] });

    const done = applyEvent(r, { type: 'tool', id: 'b', status: 'error' }, 4000);
    expect(done.activities[0].status).toBe('done');
    expect(summarize(done)).toBe('Used 2 tools (1 failed)');
  });

  it('starts a new tools group when tools run again after the first group finished', () => {
    const r = run([
      { type: 'tool', id: 'a', label: 'calc', status: 'running' },
      { type: 'tool', id: 'a', status: 'done' },
      { type: 'tool', id: 'b', label: 'calc', status: 'running' },
    ]);
    expect(r.activities.map((a) => [a.kind, a.status])).toEqual([
      ['tools', 'done'],
      ['tools', 'active'],
    ]);
  });

  it('closes a search when it reaches done, keeping its sources', () => {
    const sources = [{ id: '1', domain: 'arxiv.org', title: 'Paper', score: 0.9 }];
    const r = run([
      { type: 'search', phase: 'searching', sources: [] },
      { type: 'search', phase: 'ranking', sources },
      { type: 'search', phase: 'done', sources },
    ]);
    expect(r.activities).toHaveLength(1);
    expect(r.activities[0]).toMatchObject({ kind: 'search', status: 'done', phase: 'done' });
    expect(summarize(r)).toBe('Searched 1 source');
  });

  it('keeps activities in the order they happened and writes a natural summary', () => {
    const r = run([
      { type: 'vision', name: 'sunset.png', status: 'scanning', src: 'blob:x' },
      { type: 'vision', name: 'sunset.png', status: 'done', src: 'blob:x', focus: [{ x: 0.5, y: 0.3 }] },
      { type: 'thinking', label: 'Describing it' },
      { type: 'text', delta: 'A warm…' },
    ]);
    expect(r.activities.map((a) => a.kind)).toEqual(['image', 'thinking']);
    expect(summarize(r)).toBe('Looked at sunset.png and thought for 1s');
  });

  it('marks running work as failed when the reply is stopped', () => {
    const r = finishReply(
      run([
        { type: 'tool', id: 'a', label: 'slow.tool', status: 'running' },
        { type: 'thinking', label: 'Waiting' },
      ]),
      'stopped',
      5000
    );
    expect(r.state).toBe('stopped');
    expect(r.activities.every((a) => a.status !== 'active')).toBe(true);
    const tools = r.activities.find((a) => a.kind === 'tools');
    expect(tools?.kind === 'tools' && tools.calls[0].status).toBe('error');
    expect(currentActivity(r)).toBeUndefined();
  });

  it('keeps showing the last activity, as "Preparing the answer", until the answer starts', () => {
    const r = run([
      { type: 'ingest', name: 'report.txt', progress: 1, status: 'reading' },
      { type: 'ingest', name: 'report.txt', progress: 1, status: 'done' },
    ]);
    expect(currentActivity(r)).toBeUndefined();
    const shown = shownActivity(r);
    expect(shown?.kind).toBe('file');
    expect(liveLabel(shown, 3000)).toEqual({ title: 'Preparing the answer', meta: [] });
  });

  it('describes file and video work as it happens', () => {
    const file = run([{ type: 'ingest', name: 'report.txt', size: 285, progress: 1, status: 'reading' }]);
    expect(liveLabel(currentActivity(file), 2000).title).toBe('Reading report.txt');

    const video = run([{ type: 'reel', name: 'clip.mp4', frames: ['a', 'b', 'c', 'd'], progress: 0.5, status: 'analyzing' }]);
    expect(liveLabel(currentActivity(video), 2000).meta[0]).toBe('Frame 3 of 4');
  });
});
