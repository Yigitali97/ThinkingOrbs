// Tests for the assistant UI's pure parts: the open shortcut, the dock orb's state, chart ticks and the unread rule.

import { describe, expect, it } from 'vitest';
import { marksUnread } from './AssistantProvider';
import { niceTicks } from './blocks/scale';
import type { ConversationSnapshot, Turn } from './conversation';
import type { ReplyState } from '../chat-app/activity';
import { createAssistantReply } from './reply';
import { dockState, isOpenShortcut } from './shortcuts';
import { briefShown, foldTools } from './Thread';
import { applyAssistantEvent, finishAssistantReply } from './reply';
import { summarize } from '../chat-app/activity';

const key = (k: string, target: { tagName?: string; isContentEditable?: boolean } | null, mods: { metaKey?: boolean; ctrlKey?: boolean } = {}) => ({
  key: k,
  metaKey: !!mods.metaKey,
  ctrlKey: !!mods.ctrlKey,
  target,
});
const body = { tagName: 'BODY' };

const turn = (state: ReplyState): Turn => ({ id: state, question: 'q', attachments: [], reply: { ...createAssistantReply('r', 0), state } });
const snap = (states: ReplyState[], busy = false): ConversationSnapshot => ({ turns: states.map(turn), busy, archive: [] });

describe('isOpenShortcut', () => {
  it('opens on / from the page', () => {
    expect(isOpenShortcut(key('/', body))).toBe(true);
    expect(isOpenShortcut(key('/', null))).toBe(true);
  });

  it('leaves / alone while typing', () => {
    expect(isOpenShortcut(key('/', { tagName: 'TEXTAREA' }))).toBe(false);
    expect(isOpenShortcut(key('/', { tagName: 'INPUT' }))).toBe(false);
    expect(isOpenShortcut(key('/', { tagName: 'SELECT' }))).toBe(false);
    expect(isOpenShortcut(key('/', { tagName: 'DIV', isContentEditable: true }))).toBe(false);
  });

  it('opens on Cmd+K or Ctrl+K anywhere, even in a field', () => {
    expect(isOpenShortcut(key('k', { tagName: 'INPUT' }, { metaKey: true }))).toBe(true);
    expect(isOpenShortcut(key('k', body, { ctrlKey: true }))).toBe(true);
    expect(isOpenShortcut(key('K', body, { ctrlKey: true }))).toBe(true);
  });

  it('ignores a plain k and other keys', () => {
    expect(isOpenShortcut(key('k', body))).toBe(false);
    expect(isOpenShortcut(key('a', body))).toBe(false);
    expect(isOpenShortcut(key('/', body, { metaKey: true }))).toBe(false);
  });
});

describe('dockState', () => {
  it('maps the last reply state to the orb state', () => {
    expect(dockState(snap([]))).toBe('idle');
    expect(dockState(snap(['working'], true))).toBe('thinking');
    expect(dockState(snap(['writing'], true))).toBe('speaking');
    expect(dockState(snap(['error']))).toBe('error');
    expect(dockState(snap(['done']))).toBe('idle');
    expect(dockState(snap(['stopped']))).toBe('idle');
    expect(dockState(snap(['error', 'done']))).toBe('idle');
  });
});

describe('niceTicks', () => {
  it('steps by a nice number (1, 2, 2.5 or 5 times a power of ten) from 0 past the max', () => {
    expect(niceTicks(87)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(10)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceTicks(3.2)).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(1234)).toEqual([0, 500, 1000, 1500]);
  });

  it('returns [0, 1] for nothing to scale', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(-5)).toEqual([0, 1]);
    expect(niceTicks(NaN)).toEqual([0, 1]);
    expect(niceTicks(Infinity)).toEqual([0, 1]);
  });

  it('always reaches the max with clean steps', () => {
    for (const max of [3.2, 0.07, 1, 7, 19, 42.5, 999, 31_415]) {
      const ticks = niceTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
      const step = ticks[1] - ticks[0];
      const mantissa = Number((step / 10 ** Math.floor(Math.log10(step))).toFixed(6));
      expect([1, 2, 2.5, 5]).toContain(mantissa);
      ticks.forEach((t, i) => expect(t).toBeCloseTo(i * step, 9));
    }
    expect(niceTicks(3.2)[niceTicks(3.2).length - 1]).toBeGreaterThanOrEqual(3.2);
  });
});

describe('marksUnread', () => {
  const finished = (state: ReplyState) => snap([state]);
  it('marks a reply that ends while nobody is looking, unless it was stopped', () => {
    expect(marksUnread(true, finished('done'), { open: false, inline: false })).toBe(true);
    expect(marksUnread(true, finished('error'), { open: false, inline: false })).toBe(true);
    expect(marksUnread(true, finished('stopped'), { open: false, inline: false })).toBe(false);
  });

  it('does not mark when the answer is on screen or nothing just finished', () => {
    expect(marksUnread(true, finished('done'), { open: true, inline: false })).toBe(false);
    expect(marksUnread(true, finished('done'), { open: false, inline: true })).toBe(false);
    expect(marksUnread(false, finished('done'), { open: false, inline: false })).toBe(false);
    expect(marksUnread(true, snap(['writing'], true), { open: false, inline: false })).toBe(false);
  });

  it('does not mark the brief: it is not an answer to anything you asked', () => {
    const s = snap(['done']);
    const briefed = { ...s, turns: [{ ...s.turns[0], question: '', brief: true }] };
    expect(marksUnread(true, briefed, { open: false, inline: false })).toBe(false);
  });
});

describe('briefShown', () => {
  const brief = (state: ReplyState, text: string): Turn => ({ ...turn(state), question: '', brief: true, reply: { ...turn(state).reply, text } });
  it('shows a brief that said something, however it ended', () => {
    expect(briefShown(brief('done', 'Three PRs merged.'))).toBe(true);
    expect(briefShown(brief('stopped', 'This week'))).toBe(true);
  });
  it('hides a brief with nothing to say: stopped before a word, or every system down', () => {
    expect(briefShown(brief('stopped', ''))).toBe(false);
    expect(briefShown(brief('done', ''))).toBe(false);
    expect(briefShown(brief('error', ' '))).toBe(false);
  });
});

describe('foldTools', () => {
  it('sums one tool call after another into a single "used N tools" step', () => {
    let r = createAssistantReply('r', 0);
    r = applyAssistantEvent(r, { type: 'thinking', label: 'Working out what you need' }, 0);
    for (const [i, id] of ['a', 'b', 'c'].entries()) {
      r = applyAssistantEvent(r, { type: 'tool', id, label: id, status: 'running' }, 100 + i * 100);
      r = applyAssistantEvent(r, { type: 'tool', id, label: id, status: 'done' }, 150 + i * 100);
    }
    r = applyAssistantEvent(r, { type: 'text', delta: 'Hi' }, 500);
    r = finishAssistantReply(r, 'done', 600);
    expect(r.activities.filter((a) => a.kind === 'tools')).toHaveLength(3);
    const folded = foldTools(r);
    expect(folded.activities.map((a) => a.kind)).toEqual(['thinking', 'tools']);
    expect(summarize(folded)).toBe('Thought for 1s and used 3 tools');
    const tools = folded.activities[1];
    expect(tools.kind === 'tools' && [tools.startedAt, tools.endedAt, tools.calls.length]).toEqual([100, 350, 3]);
    // a reply with one tool activity or none is returned as is
    expect(foldTools(createAssistantReply('x', 0)).activities).toEqual([]);
  });
});
