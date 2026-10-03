// Tests for the conversation store: sending, stopping, replacing a running reply, archive, dispose, the brief and open events.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatAttachment } from '../chat-app/agent';
import { say } from './brain';
import { createConversation } from './conversation';
import type { AgentDefinition, Brain } from './protocol';
import { applyAssistantEvent, createAssistantReply } from './reply';
import { speakable } from './speakable';
import { voiceResponder } from './voice';

let lastSignal: AbortSignal | undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const brain: Brain = async ({ text }, _ctx, emit, signal) => {
  lastSignal = signal;
  if (text === 'boom') throw new Error('Kaboom');
  if (text === 'open') {
    emit({ type: 'open', href: '/x' });
    await say(emit, 'Opened.', signal, 5);
    return;
  }
  if (text === 'open late') {
    // ignores the signal on purpose, so it emits after being stopped
    await sleep(30);
    emit({ type: 'open', href: '/late' });
    return;
  }
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

let briefSlow = false;
let briefInput: { text: string; attachments: ChatAttachment[] } | undefined;
let briefSignal: AbortSignal | undefined;
let briefRuns = 0;

const brief: Brain = async (input, _ctx, emit, signal) => {
  briefRuns++;
  briefInput = input;
  briefSignal = signal;
  if (briefSlow) {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 200);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  }
  await say(emit, 'Good morning, here is your day', signal, 5);
};

const def: AgentDefinition = {
  id: 'fake',
  name: 'Fake',
  scope: 'tests',
  tools: [],
  brain,
  brief,
  greeting: () => 'Hi',
  suggestions: () => [],
};

const make = (onOpen?: (href: string) => void, agent: AgentDefinition = def) =>
  createConversation(agent, { page: () => ({ page: 'home', title: 'Home' }), latency: () => 0, onOpen });

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

describe('startBrief', () => {
  afterEach(() => {
    briefSlow = false;
    briefRuns = 0;
  });

  it("runs the agent's brief with empty input as a brief turn with no question", async () => {
    const c = make();
    const reply = await c.startBrief();
    expect(reply?.state).toBe('done');
    expect(reply?.text).toBe('Good morning, here is your day');
    expect(briefInput).toEqual({ text: '', attachments: [] });
    const { turns, busy } = c.getSnapshot();
    expect(turns.map((t) => [t.question, t.brief, t.reply.state])).toEqual([['', true, 'done']]);
    expect(busy).toBe(false);
  });

  it('runs only once per conversation', async () => {
    const c = make();
    await c.startBrief();
    expect(await c.startBrief()).toBeNull();
    expect(briefRuns).toBe(1);
  });

  it('does nothing once there are turns', async () => {
    const c = make();
    await c.send('hi');
    expect(await c.startBrief()).toBeNull();
    expect(briefRuns).toBe(0);
    expect(c.getSnapshot().turns).toHaveLength(1);
  });

  it('does nothing when the agent has no brief', async () => {
    const c = make(undefined, { ...def, brief: undefined });
    expect(await c.startBrief()).toBeNull();
    expect(c.getSnapshot().turns).toEqual([]);
  });

  it('is stopped by a message sent while it runs', async () => {
    briefSlow = true;
    const c = make();
    const b = c.startBrief();
    const hi = c.send('hi');
    expect((await b)?.state).toBe('stopped');
    expect((await hi)?.state).toBe('done');
    const { turns, busy } = c.getSnapshot();
    expect(turns.map((t) => [t.brief ? 'brief' : t.question, t.reply.state])).toEqual([
      ['brief', 'stopped'],
      ['hi', 'done'],
    ]);
    expect(busy).toBe(false);
  });

  it('archives nothing when the conversation only has the brief', async () => {
    const c = make();
    await c.startBrief();
    c.clear();
    expect(c.getSnapshot()).toMatchObject({ turns: [], archive: [] });
  });

  it('titles an archived conversation by its first question and never re-runs the brief on restore', async () => {
    const c = make();
    await c.startBrief();
    await c.send('hi');
    c.clear();
    const { archive } = c.getSnapshot();
    expect(archive.map((a) => a.title)).toEqual(['hi']);
    c.restore(archive[0].id);
    expect(c.getSnapshot().turns.map((t) => [t.brief ?? false, t.question])).toEqual([
      [true, ''],
      [false, 'hi'],
    ]);
    expect(await c.startBrief()).toBeNull();
    expect(briefRuns).toBe(1);
  });

  it('can brief again after clear', async () => {
    const c = make();
    await c.startBrief();
    c.clear();
    expect((await c.startBrief())?.state).toBe('done');
    expect(briefRuns).toBe(2);
  });

  it('is aborted by dispose', async () => {
    briefSlow = true;
    const c = make();
    const b = c.startBrief();
    await sleep(10);
    c.dispose();
    expect((await b)?.state).toBe('stopped');
    expect(briefSignal?.aborted).toBe(true);
  });
});

describe('open events', () => {
  it('hands each open event of the live run to onOpen', async () => {
    const onOpen = vi.fn();
    const c = make(onOpen);
    const reply = await c.send('open');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('/x');
    // the reply itself is untouched by the open event
    expect(reply?.text).toBe('Opened.');
  });

  it('ignores an open event emitted after the run was stopped', async () => {
    const onOpen = vi.fn();
    const c = make(onOpen);
    const p = c.send('open late');
    await sleep(5);
    c.stop();
    expect((await p)?.state).toBe('stopped');
    await sleep(50);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('ignores an open event emitted after dispose', async () => {
    const onOpen = vi.fn();
    const c = make(onOpen);
    void c.send('open late');
    await sleep(5);
    c.dispose();
    await sleep(50);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('leaves a reply unchanged when applied to it', () => {
    const r = createAssistantReply('r', 0);
    expect(applyAssistantEvent(r, { type: 'open', href: '/x' }, 10)).toBe(r);
  });
});

describe('attachment URLs', () => {
  afterEach(() => vi.restoreAllMocks());
  const image = (n: number): ChatAttachment => ({ id: `a${n}`, name: `${n}.png`, type: 'image/png', size: 10, url: `blob:test/${n}` });
  const spy = () => vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  it('keeps a sent image alive through clear and restore', async () => {
    const revoke = spy();
    const c = make();
    await c.send('look', [image(1)]);
    c.clear();
    c.restore(c.getSnapshot().archive[0].id);
    expect(c.getSnapshot().turns[0].attachments[0].url).toBe('blob:test/1');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('revokes a sent image once its conversation falls out of the archive', async () => {
    const revoke = spy();
    const c = make();
    await c.send('first', [image(1)]);
    c.clear();
    for (let i = 2; i <= 6; i++) {
      await c.send(`q${i}`);
      c.clear();
      if (i < 6) expect(revoke).not.toHaveBeenCalled();
    }
    expect(revoke).toHaveBeenCalledWith('blob:test/1');
  });

  it('revokes every image, current and archived, on dispose', async () => {
    const revoke = spy();
    const c = make();
    await c.send('one', [image(1)]);
    c.clear();
    await c.send('two', [image(2), { id: 'f', name: 'notes.txt', type: 'text/plain', size: 3 }]);
    c.dispose();
    expect(revoke.mock.calls.map(([u]) => u).sort()).toEqual(['blob:test/1', 'blob:test/2']);
  });

  it('revokes the images of a send a disposed store refuses', async () => {
    const revoke = spy();
    const c = make();
    c.dispose();
    expect(await c.send('late', [image(3)])).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:test/3');
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
