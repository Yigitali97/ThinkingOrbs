// Tests for the conversation store: sending, stopping, replacing a running reply, archive and dispose.

import { describe, expect, it } from 'vitest';
import { say } from './brain';
import { createConversation } from './conversation';
import type { AgentDefinition, Brain } from './protocol';
import { createAssistantReply } from './reply';
import { speakable } from './speakable';
import { voiceResponder } from './voice';

let lastSignal: AbortSignal | undefined;

const brain: Brain = async ({ text }, _ctx, emit, signal) => {
  lastSignal = signal;
  if (text === 'boom') throw new Error('Kaboom');
  if (text === 'slow') {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 200);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
    await say(emit, 'late', signal, 5);
    return;
  }
  await say(emit, 'one two three', signal, 5);
};

const def: AgentDefinition = {
  id: 'fake',
  name: 'Fake',
  scope: 'tests',
  tools: [],
  brain,
  greeting: () => 'Hi',
  suggestions: () => [],
};

const make = () => createConversation(def, { page: () => ({ page: 'home', title: 'Home' }), latency: () => 0 });

describe('createConversation', () => {
  it('sends and finishes a reply', async () => {
    const c = make();
    const reply = await c.send('hi');
    expect(reply?.state).toBe('done');
    expect(reply?.text).toBe('one two three');
    expect(c.getSnapshot().busy).toBe(false);
  });

  it('returns a stable snapshot between changes', async () => {
    const c = make();
    expect(c.getSnapshot()).toBe(c.getSnapshot());
    await c.send('hi');
    const s = c.getSnapshot();
    expect(c.getSnapshot()).toBe(s);
  });

  it('stops a running reply when a new message is sent', async () => {
    const c = make();
    const first = c.send('slow');
    const second = c.send('hi');
    expect((await first)?.state).toBe('stopped');
    expect((await second)?.state).toBe('done');
    const { turns, busy } = c.getSnapshot();
    expect(turns.map((t) => [t.question, t.reply.state])).toEqual([
      ['slow', 'stopped'],
      ['hi', 'done'],
    ]);
    expect(turns[0].reply.text).not.toContain('late');
    expect(busy).toBe(false);
  });

  it('finishes as error when the brain throws', async () => {
    const reply = await make().send('boom');
    expect(reply?.state).toBe('error');
    expect(reply?.error).toBe('Kaboom');
  });

  it('ignores empty input', async () => {
    expect(await make().send('')).toBeNull();
    expect(await make().send('   ')).toBeNull();
  });

  it('archives on clear and brings a conversation back with restore', async () => {
    const c = make();
    await c.send('first question');
    await c.send('second');
    c.clear();
    const s = c.getSnapshot();
    expect(s.turns).toEqual([]);
    expect(s.archive[0].title).toBe('first question');
    c.restore(s.archive[0].id);
    expect(c.getSnapshot().turns.map((t) => t.question)).toEqual(['first question', 'second']);
    expect(c.getSnapshot().archive).toEqual([]);
  });

  it('keeps at most five archived conversations and cuts titles to 60 characters', async () => {
    const c = make();
    for (let i = 0; i < 7; i++) {
      await c.send(`q${i} ${'x'.repeat(80)}`);
      c.clear();
    }
    const { archive } = c.getSnapshot();
    expect(archive).toHaveLength(5);
    expect(archive[0].title).toHaveLength(60);
    expect(archive[0].title.startsWith('q6')).toBe(true);
  });

  it('does not archive an empty conversation', () => {
    const c = make();
    c.clear();
    expect(c.getSnapshot().archive).toEqual([]);
  });

  it('aborts and goes quiet on dispose', async () => {
    const c = make();
    let calls = 0;
    c.subscribe(() => calls++);
    const p = c.send('slow');
    await new Promise((r) => setTimeout(r, 10));
    const before = calls;
    c.dispose();
    await p;
    expect(lastSignal?.aborted).toBe(true);
    expect(calls).toBe(before);
  });
});

describe('speakable', () => {
  it('adds a spoken note for the first block', () => {
    const reply = { ...createAssistantReply('r', 0), text: 'Done.', blocks: [{ kind: 'table' as const, columns: [], rows: [] }] };
    expect(speakable(reply)).toBe("Done. I've put a table on screen.");
  });
  it('says nothing extra for a link or no block', () => {
    const r = { ...createAssistantReply('r', 0), text: 'Done.' };
    expect(speakable(r)).toBe('Done.');
    expect(speakable({ ...r, blocks: [{ kind: 'link', label: 'x', href: '/x' }] })).toBe('Done.');
  });
});

describe('voiceResponder', () => {
  it('resolves to what the reply sounds like', async () => {
    const c = make();
    const text = await voiceResponder(c)('hi', new AbortController().signal);
    expect(text).toBe('one two three');
    expect(c.getSnapshot().turns.map((t) => [t.question, t.reply.state])).toEqual([['hi', 'done']]);
  });

  it('stops the running reply and resolves to nothing when the voice loop aborts', async () => {
    const c = make();
    const ctl = new AbortController();
    const p = voiceResponder(c)('slow', ctl.signal);
    await new Promise((r) => setTimeout(r, 10));
    expect(c.getSnapshot().busy).toBe(true);
    ctl.abort();
    expect(await p).toBe('');
    const { turns, busy } = c.getSnapshot();
    expect(turns.map((t) => t.reply.state)).toEqual(['stopped']);
    expect(busy).toBe(false);
  });

  it('resolves to nothing when there was nothing to send', async () => {
    expect(await voiceResponder(make())('  ', new AbortController().signal)).toBe('');
  });
});
