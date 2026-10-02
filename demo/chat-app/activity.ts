// Pure model for one assistant reply: agent events → an ordered activity timeline.
// No React, no DOM — so it can be unit tested and reused with any UI.

import type { IngestStatus, ReelStatus, SearchPhase, ToolStatus } from '../../src/orbs';
import type { AgentEvent, Source } from './agent';

export type ActivityKind = 'thinking' | 'search' | 'tools' | 'file' | 'image' | 'video';
export type ActivityStatus = 'active' | 'done' | 'error';

interface Base {
  id: string;
  status: ActivityStatus;
  startedAt: number;
  endedAt?: number;
}
export interface Focus {
  x: number;
  y: number;
  label?: string;
}
export interface ToolCallRecord {
  id: string;
  label?: string;
  status: ToolStatus;
  startedAt: number;
  endedAt?: number;
}
export type Activity =
  | (Base & { kind: 'thinking'; steps: Array<{ id: string; label: string; at: number }>; budget?: number })
  | (Base & { kind: 'search'; phase: SearchPhase; sources: Source[] })
  | (Base & { kind: 'tools'; calls: ToolCallRecord[] })
  | (Base & { kind: 'file'; name: string; size?: number; progress: number; phase: IngestStatus })
  | (Base & { kind: 'image'; name?: string; src: string; phase: 'scanning' | 'done'; focus: Focus[] })
  | (Base & { kind: 'video'; name?: string; frames: string[]; progress: number; phase: ReelStatus });

export type ReplyState = 'working' | 'writing' | 'done' | 'stopped' | 'error';

export interface Reply {
  id: string;
  startedAt: number;
  firstTextAt?: number;
  endedAt?: number;
  activities: Activity[];
  text: string;
  tokens: number;
  state: ReplyState;
  error?: string;
}

/** The colour each kind of activity is drawn in — matches the orb that shows it. */
export const KIND_COLOR: Record<ActivityKind, string> = {
  thinking: '#ff9a2e',
  search: '#a78bfa',
  tools: '#38bdf8',
  file: '#2dd4bf',
  image: '#f472b6',
  video: '#fb923c',
};

let seq = 0;
const nextId = (kind: string) => `${kind}-${++seq}`;

export function createReply(id: string, now: number): Reply {
  return { id, startedAt: now, activities: [], text: '', tokens: 0, state: 'working' };
}

type Of<K extends ActivityKind> = Extract<Activity, { kind: K }>;

/**
 * Update the open activity of `kind` that `match` accepts, or start a new one.
 * Activities keep their order of first appearance, which is the order they happened in.
 */
function upsert<K extends ActivityKind>(
  reply: Reply,
  kind: K,
  match: (a: Of<K>) => boolean,
  create: () => Of<K>,
  update: (a: Of<K>) => Of<K>
): Reply {
  const i = reply.activities.findIndex((a) => a.kind === kind && a.status === 'active' && match(a as Of<K>));
  if (i === -1) return { ...reply, activities: [...reply.activities, update(create())] };
  const activities = reply.activities.slice();
  activities[i] = update(activities[i] as Of<K>);
  return { ...reply, activities };
}

const close = <A extends Activity>(a: A, now: number, status: ActivityStatus = 'done'): A =>
  a.status === 'active' ? { ...a, status, endedAt: now } : a;

export function applyEvent(reply: Reply, e: AgentEvent, now: number): Reply {
  switch (e.type) {
    case 'thinking':
      return upsert(
        reply,
        'thinking',
        () => true,
        () => ({ kind: 'thinking', id: nextId('thinking'), status: 'active', startedAt: now, steps: [] }),
        (a) => ({ ...a, steps: [...a.steps, { id: nextId('step'), label: e.label, at: now }], budget: e.budget ?? a.budget })
      );

    case 'search': {
      const finished = e.phase === 'done' || e.phase === 'empty';
      return upsert(
        reply,
        'search',
        () => true,
        () => ({ kind: 'search', id: nextId('search'), status: 'active', startedAt: now, phase: e.phase, sources: [] }),
        (a) => {
          const next = { ...a, phase: e.phase, sources: e.sources };
          return finished ? close(next, now) : next;
        }
      );
    }

    case 'tool':
      return upsert(
        reply,
        'tools',
        () => true,
        () => ({ kind: 'tools', id: nextId('tools'), status: 'active', startedAt: now, calls: [] }),
        (a) => {
          const found = a.calls.find((c) => c.id === e.id);
          const calls = found
            ? a.calls.map((c) =>
                c.id === e.id ? { ...c, status: e.status, label: e.label ?? c.label, endedAt: e.status === 'running' ? undefined : now } : c
              )
            : [...a.calls, { id: e.id, label: e.label, status: e.status, startedAt: now, endedAt: e.status === 'running' ? undefined : now }];
          const next = { ...a, calls };
          return calls.some((c) => c.status === 'running') ? next : close(next, now);
        }
      );

    case 'ingest':
      return upsert(
        reply,
        'file',
        (a) => a.name === e.name,
        () => ({ kind: 'file', id: nextId('file'), status: 'active', startedAt: now, name: e.name, progress: 0, phase: 'uploading' }),
        (a) => {
          const next = { ...a, size: e.size ?? a.size, progress: e.progress, phase: e.status };
          return e.status === 'done' ? close(next, now) : e.status === 'error' ? close(next, now, 'error') : next;
        }
      );

    case 'vision':
      return upsert(
        reply,
        'image',
        (a) => a.src === e.src,
        () => ({ kind: 'image', id: nextId('image'), status: 'active', startedAt: now, name: e.name, src: e.src, phase: 'scanning', focus: [] }),
        (a) => {
          const next = { ...a, phase: e.status, focus: e.focus ?? a.focus, name: e.name ?? a.name };
          return e.status === 'done' ? close(next, now) : next;
        }
      );

    case 'reel':
      return upsert(
        reply,
        'video',
        () => true,
        () => ({ kind: 'video', id: nextId('video'), status: 'active', startedAt: now, name: e.name, frames: [], progress: 0, phase: 'loading' }),
        (a) => {
          const next = { ...a, frames: e.frames.length ? e.frames : a.frames, progress: e.progress, phase: e.status, name: e.name ?? a.name };
          return e.status === 'done' ? close(next, now) : e.status === 'error' ? close(next, now, 'error') : next;
        }
      );

    case 'text':
      // the first words end the thinking phase; everything else reports its own end
      return {
        ...reply,
        firstTextAt: reply.firstTextAt ?? now,
        state: 'writing',
        text: reply.text + e.delta,
        tokens: reply.tokens + 1,
        activities: reply.firstTextAt === undefined ? reply.activities.map((a) => (a.kind === 'thinking' ? close(a, now) : a)) : reply.activities,
      };
  }
}

/** End the reply. Anything still running is closed — as failed if the reply was stopped or errored. */
export function finishReply(reply: Reply, outcome: 'done' | 'stopped' | 'error', now: number, error?: string): Reply {
  const failed = outcome !== 'done';
  return {
    ...reply,
    state: outcome,
    error,
    endedAt: now,
    activities: reply.activities.map((a) => {
      if (a.kind === 'tools') {
        const calls = a.calls.map((c) => (c.status === 'running' ? { ...c, status: (failed ? 'error' : 'done') as ToolStatus, endedAt: now } : c));
        return close({ ...a, calls }, now, failed && calls.some((c) => c.status === 'error') ? 'error' : 'done');
      }
      return close(a, now, failed ? 'error' : 'done');
    }),
  };
}

/** The activity to show in the live row: the newest one still running. */
export function currentActivity(reply: Reply): Activity | undefined {
  for (let i = reply.activities.length - 1; i >= 0; i--) if (reply.activities[i].status === 'active') return reply.activities[i];
  return undefined;
}

/**
 * What the live row should show: the running activity, or — in the gap between finishing
 * one and the answer starting — the last one, so the row never steps backwards.
 */
export function shownActivity(reply: Reply): Activity | undefined {
  return currentActivity(reply) ?? reply.activities[reply.activities.length - 1];
}

const secs = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What the live row says about an activity right now. */
export function liveLabel(a: Activity | undefined, now: number): { title: string; meta: string[] } {
  if (!a) return { title: 'Getting started', meta: [] };
  if (a.status !== 'active') return { title: 'Preparing the answer', meta: [] };
  const elapsed = secs(now - a.startedAt);
  switch (a.kind) {
    case 'thinking': {
      const step = a.steps[a.steps.length - 1];
      const meta = [`Step ${a.steps.length}`];
      if (a.budget != null) meta.push(`${Math.round(a.budget * 100)}% of thinking budget`);
      return { title: step?.label ?? 'Thinking', meta: [...meta, elapsed] };
    }
    case 'search': {
      const title = a.phase === 'ranking' ? 'Ranking sources' : a.phase === 'synthesizing' ? 'Reading the top sources' : 'Searching the web';
      return { title, meta: [a.sources.length ? `${plural(a.sources.length, 'source')} found` : 'Looking for sources', elapsed] };
    }
    case 'tools': {
      const running = a.calls.filter((c) => c.status === 'running');
      const finished = a.calls.filter((c) => c.status !== 'running').length;
      const failed = a.calls.filter((c) => c.status === 'error').length;
      const title = running.length === 1 ? `Running ${running[0].label ?? running[0].id}` : `Running ${running.length} tools`;
      const meta = [`${finished} of ${a.calls.length} finished`];
      if (failed) meta.push(`${failed} failed`);
      return { title, meta: [...meta, elapsed] };
    }
    case 'file':
      return { title: `${a.phase === 'uploading' ? 'Uploading' : 'Reading'} ${a.name}`, meta: [a.phase === 'uploading' ? `${Math.round(a.progress * 100)}%` : 'Extracting text', elapsed] };
    case 'image':
      return { title: `Looking at ${a.name ?? 'the image'}`, meta: ['Scanning', elapsed] };
    case 'video': {
      const n = a.frames.length;
      const frame = Math.min(n, Math.floor(a.progress * n) + 1);
      return { title: `Watching ${a.name ?? 'the video'}`, meta: [a.phase === 'loading' || !n ? 'Extracting frames' : `Frame ${frame} of ${n}`, elapsed] };
    }
  }
}

/** One activity as a past-tense phrase, e.g. "searched 8 sources". */
export function describe(a: Activity, reply: Reply): string {
  const end = a.endedAt ?? reply.endedAt ?? a.startedAt;
  switch (a.kind) {
    case 'thinking':
      return `thought for ${secs(end - a.startedAt)}`;
    case 'search':
      return a.phase === 'empty' ? 'found no sources' : `searched ${plural(a.sources.length, 'source')}`;
    case 'tools': {
      const failed = a.calls.filter((c) => c.status === 'error').length;
      return `used ${plural(a.calls.length, 'tool')}${failed ? ` (${failed} failed)` : ''}`;
    }
    case 'file':
      return `read ${a.name}`;
    case 'image':
      return `looked at ${a.name ?? 'the image'}`;
    case 'video':
      return a.status === 'error' ? `couldn't open ${a.name ?? 'the video'}` : `watched ${plural(a.frames.length, 'frame')}`;
  }
}

/** The collapsed one-liner: "Searched 8 sources and thought for 4s". */
export function summarize(reply: Reply): string {
  const parts = reply.activities.map((a) => describe(a, reply));
  if (!parts.length) return '';
  const sentence = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return sentence[0].toUpperCase() + sentence.slice(1);
}
