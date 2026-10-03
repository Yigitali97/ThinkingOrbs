// The assistant's conversation store: turns, the running reply, and a short archive of cleared conversations.
// Plain TypeScript with no React, so it is unit-tested in node; AssistantProvider wraps it for the UI.
// Sent attachments belong to it: their object URLs are revoked when their turns leave the archive or the store is disposed.
// An agent's brief runs once on an empty conversation as a turn with no question; `open` events go to `onOpen`.

import type { ChatAttachment } from '../chat-app/agent';
import { createCaller } from './callTool';
import type { AgentDefinition, AssistantEvent, Brain, PageContext, User } from './protocol';
import { applyAssistantEvent, createAssistantReply, finishAssistantReply } from './reply';
import type { AssistantReply } from './reply';

export interface Turn {
  id: string;
  question: string;
  attachments: ChatAttachment[];
  reply: AssistantReply;
  /** the agent's opening brief: no question, nothing the user asked */
  brief?: boolean;
}
export interface Archived {
  id: string;
  title: string;
  turns: Turn[];
}
export interface ConversationSnapshot {
  turns: Turn[];
  busy: boolean;
  archive: Archived[];
}

export interface Conversation {
  getSnapshot(): ConversationSnapshot;
  subscribe(fn: () => void): () => void;
  /** Resolves with the finished reply, or null when there was nothing to send. */
  send(text: string, attachments?: ChatAttachment[]): Promise<AssistantReply | null>;
  /**
   * Runs the agent's brief on an empty conversation, once until the next clear(). Resolves with the finished reply,
   * or null when the agent has no brief, there are turns already, or a brief already ran.
   */
  startBrief(): Promise<AssistantReply | null>;
  stop(): void;
  clear(): void;
  restore(id: string): void;
  dispose(): void;
}

const ARCHIVE_MAX = 5;
const TITLE_MAX = 60;

interface Run {
  turnId: string;
  ctl: AbortController;
  finished: boolean;
  /** settles with the reply once it has finished, however it ended */
  done: Promise<AssistantReply>;
  finish(outcome: 'done' | 'stopped' | 'error', error?: string): void;
}

/** Revokes the object URLs of attachments nothing will show again. */
function release(attachments: ChatAttachment[]): void {
  for (const a of attachments) if (a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url);
}
const releaseTurns = (turns: Turn[]) => turns.forEach((t) => release(t.attachments));

export function createConversation(
  def: AgentDefinition,
  opts: {
    user?: User;
    page: () => PageContext;
    now?: () => Date;
    latency?: (toolId: string) => number;
    /** called for each `open` event of the live run, never once that run is stopped or the store disposed */
    onOpen?: (href: string) => void;
  },
): Conversation {
  let snap: ConversationSnapshot = { turns: [], busy: false, archive: [] };
  const listeners = new Set<() => void>();
  let running: Run | null = null;
  let disposed = false;
  /** a brief ran (or a conversation was restored) since the last clear(), so none runs again */
  let briefed = false;
  let seq = 0;
  const uid = () => `t${++seq}-${Math.random().toString(36).slice(2, 7)}`;
  const clock = () => performance.now();

  const commit = (patch: Partial<ConversationSnapshot>) => {
    snap = { ...snap, ...patch };
    listeners.forEach((fn) => fn());
  };

  const updateReply = (turnId: string, fn: (r: AssistantReply) => AssistantReply) =>
    commit({ turns: snap.turns.map((t) => (t.id === turnId ? { ...t, reply: fn(t.reply) } : t)) });

  const stopRun = () => {
    if (!running) return;
    running.ctl.abort();
    running.finish('stopped');
  };

  /** Files the current turns away, unless there is nothing but the brief: that is not a conversation worth keeping. */
  const archiveCurrent = (archive: Archived[]): Archived[] => {
    const asked = snap.turns.filter((t) => !t.brief);
    if (!asked.length) {
      releaseTurns(snap.turns);
      return archive;
    }
    const title = asked[0].question.slice(0, TITLE_MAX);
    const next = [{ id: uid(), title, turns: snap.turns }, ...archive];
    // a conversation that falls off the end can't come back, so its images go
    next.slice(ARCHIVE_MAX).forEach((a) => releaseTurns(a.turns));
    return next.slice(0, ARCHIVE_MAX);
  };

  const start = (text: string, attachments: ChatAttachment[], brain: Brain = def.brain, brief = false): Promise<AssistantReply> => {
    const ctl = new AbortController();
    const turnId = uid();
    const reply = createAssistantReply(uid(), clock());
    let resolveDone!: (r: AssistantReply) => void;
    const done = new Promise<AssistantReply>((resolve) => (resolveDone = resolve));
    const run: Run = {
      turnId,
      ctl,
      finished: false,
      done,
      finish(outcome, error) {
        if (run.finished) return;
        run.finished = true;
        if (running === run) running = null;
        let finished: AssistantReply | undefined;
        const turns = snap.turns.map((t) => {
          if (t.id !== turnId) return t;
          finished = finishAssistantReply(t.reply, outcome, clock(), error);
          return { ...t, reply: finished };
        });
        if (!finished) finished = finishAssistantReply(reply, outcome, clock(), error);
        commit({ turns, busy: false });
        resolveDone(finished);
      },
    };
    running = run;
    const turn: Turn = { id: turnId, question: text, attachments, reply, ...(brief ? { brief: true } : {}) };
    commit({ turns: [...snap.turns, turn], busy: true });

    const emit = (e: AssistantEvent) => {
      if (ctl.signal.aborted || run.finished) return;
      if (e.type === 'open') opts.onOpen?.(e.href);
      else updateReply(turnId, (r) => applyAssistantEvent(r, e, clock()));
    };
    const now = opts.now?.() ?? new Date();
    const call = createCaller(def, { user: opts.user, now, emit, signal: ctl.signal, latency: opts.latency });
    const ctx = { page: opts.page(), user: opts.user, now, call };

    brain({ text, attachments }, ctx, emit, ctl.signal).then(
      () => run.finish(ctl.signal.aborted ? 'stopped' : 'done'),
      (err) => (ctl.signal.aborted ? run.finish('stopped') : run.finish('error', err instanceof Error ? err.message : 'Something went wrong.')),
    );
    return done;
  };

  return {
    getSnapshot: () => snap,
    subscribe(fn) {
      if (disposed) return () => {};
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    async send(text, attachments = []) {
      const question = text.trim();
      if (disposed || (!question && !attachments.length)) {
        release(attachments);
        return null;
      }
      // a running reply is stopped and settled before the new one starts
      while (running) {
        const current: Run = running;
        stopRun();
        await current.done;
      }
      if (disposed) {
        release(attachments);
        return null;
      }
      return start(question, attachments);
    },
    async startBrief() {
      if (disposed || !def.brief || briefed || snap.turns.length || running) return null;
      briefed = true;
      return start('', [], def.brief, true);
    },
    stop: stopRun,
    clear() {
      stopRun();
      briefed = false;
      if (!snap.turns.length) return;
      commit({ turns: [], archive: archiveCurrent(snap.archive) });
    },
    restore(id) {
      const target = snap.archive.find((a) => a.id === id);
      if (!target) return;
      stopRun();
      briefed = true;
      commit({ turns: target.turns, archive: archiveCurrent(snap.archive.filter((a) => a.id !== id)) });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      stopRun();
      releaseTurns(snap.turns);
      snap.archive.forEach((a) => releaseTurns(a.turns));
    },
  };
}
