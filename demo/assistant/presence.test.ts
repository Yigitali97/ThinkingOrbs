// Tests for the bot's presence rules: which state it shows, which systems are busy, and when a reply finished happily.

import { describe, expect, it } from 'vitest';
import type { ReplyState } from '../chat-app/activity';
import type { ConversationSnapshot, Turn } from './conversation';
import { activeSystems, botStateFor, finishedHappily } from './presence';
import type { Tool } from './protocol';
import { applyAssistantEvent, createAssistantReply } from './reply';

const turn = (id: string, state: ReplyState): Turn => ({
  id,
  question: id,
  attachments: [],
  reply: { ...createAssistantReply(`r-${id}`, 0), state },
});
const snap = (...turns: Turn[]): ConversationSnapshot => ({ turns, busy: turns.some((t) => t.reply.state === 'working' || t.reply.state === 'writing'), archive: [] });

const off = { active: false };

describe('botStateFor', () => {
  it('follows voice mode first, whatever the conversation or dictation say', () => {
    const busy = snap(turn('a', 'working'));
    expect(botStateFor(busy, { active: true, state: 'listening' }, true)).toBe('listening');
    expect(botStateFor(busy, { active: true, state: 'thinking' }, false)).toBe('thinking');
    expect(botStateFor(snap(), { active: true, state: 'speaking' }, false)).toBe('speaking');
    expect(botStateFor(snap(), { active: true, state: 'error' }, false)).toBe('error');
    for (const state of ['idle', 'connecting', 'interrupted', 'muted', undefined] as const) {
      expect(botStateFor(busy, { active: true, state }, true)).toBe('idle');
    }
  });

  it('listens while dictating, ahead of the conversation', () => {
    expect(botStateFor(snap(turn('a', 'working')), off, true)).toBe('listening');
    expect(botStateFor(snap(), off, true)).toBe('listening');
  });

  it('otherwise follows the latest reply', () => {
    expect(botStateFor(snap(), off, false)).toBe('idle');
    expect(botStateFor(snap(turn('a', 'working')), off, false)).toBe('thinking');
    expect(botStateFor(snap(turn('a', 'writing')), off, false)).toBe('speaking');
    expect(botStateFor(snap(turn('a', 'error')), off, false)).toBe('error');
    expect(botStateFor(snap(turn('a', 'done')), off, false)).toBe('idle');
    expect(botStateFor(snap(turn('a', 'stopped')), off, false)).toBe('idle');
    // a voice state left behind by an inactive voice mode is ignored
    expect(botStateFor(snap(turn('a', 'done')), { active: false, state: 'speaking' }, false)).toBe('idle');
  });
});

describe('activeSystems', () => {
  const tool = (id: string, system: string): Tool => ({ id, label: id, system, run: async () => null });
  const tools = [tool('jira.issues', 'Jira'), tool('clockify.timeEntries', 'Clockify')];

  it('names the systems of the tool calls still running', () => {
    let r = createAssistantReply('r', 0);
    r = applyAssistantEvent(r, { type: 'tool', id: 'jira.issues#1', label: 'Issues', status: 'running' }, 1);
    r = applyAssistantEvent(r, { type: 'tool', id: 'clockify.timeEntries#2', label: 'Hours', status: 'running' }, 2);
    r = applyAssistantEvent(r, { type: 'tool', id: 'clockify.timeEntries#2', status: 'done' }, 3);
    expect(activeSystems(tools, r)).toEqual(new Set(['Jira']));
  });

  it('is empty without a reply, without running calls, or for unknown tools', () => {
    expect(activeSystems(tools)).toEqual(new Set());
    expect(activeSystems(tools, createAssistantReply('r', 0))).toEqual(new Set());
    const r = applyAssistantEvent(createAssistantReply('r', 0), { type: 'tool', id: 'nope#1', status: 'running' }, 1);
    expect(activeSystems(tools, r)).toEqual(new Set());
  });
});

describe('finishedHappily', () => {
  it('is true when the latest reply turns done', () => {
    expect(finishedHappily(snap(turn('a', 'working')), snap(turn('a', 'done')))).toBe(true);
    expect(finishedHappily(snap(turn('a', 'writing')), snap(turn('a', 'done')))).toBe(true);
  });

  it('is false for any other change', () => {
    expect(finishedHappily(snap(turn('a', 'done')), snap(turn('a', 'done')))).toBe(false);
    expect(finishedHappily(snap(turn('a', 'working')), snap(turn('a', 'writing')))).toBe(false);
    expect(finishedHappily(snap(turn('a', 'writing')), snap(turn('a', 'stopped')))).toBe(false);
    expect(finishedHappily(snap(turn('a', 'writing')), snap(turn('a', 'error')))).toBe(false);
    expect(finishedHappily(snap(turn('a', 'done')), snap())).toBe(false);
    // a restored conversation that was already done doesn't count
    expect(finishedHappily(snap(), snap(turn('a', 'done')))).toBe(false);
    expect(finishedHappily(snap(turn('b', 'working')), snap(turn('a', 'done')))).toBe(false);
  });
});
