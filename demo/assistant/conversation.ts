// The assistant's conversation store: turns, the running reply, and a short archive of cleared conversations.
// Plain TypeScript with no React, so it is unit-tested in node; AssistantProvider wraps it for the UI.

import type { ChatAttachment } from '../chat-app/agent';
import { createCaller } from './callTool';
import type { AgentDefinition, AssistantEvent, PageContext, User } from './protocol';
import { applyAssistantEvent, createAssistantReply, finishAssistantReply } from './reply';
import type { AssistantReply } from './reply';

export interface Turn {
  id: string;
  question: string;
  attachments: ChatAttachment[];
  reply: AssistantReply;
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

export function createConversation(
  def: AgentDefinition,
  opts: { user?: User; page: () => PageContext; now?: () => Date; latency?: (toolId: string) => number },
): Conversation {
  let snap: ConversationSnapshot = { turns: [], busy: false, archive: [] };
  const listeners = new Set<() => void>();
  let running: Run | null = null;
  let disposed = false;
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

  const archiveCurrent = (archive: Archived[]): Archived[] => {
    if (!snap.turns.length) return archive;
    const title = snap.turns[0].question.slice(0, TITLE_MAX);
    return [{ id: uid(), title, turns: snap.turns }, ...archive].slice(0, ARCHIVE_MAX);
  };

  const start = (text: string, attachments: ChatAttachment[]): Promise<AssistantReply> => {
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
    commit({ turns: [...snap.turns, { id: turnId, question: text, attachments, reply }], busy: true });

    const emit = (e: AssistantEvent) => {
      if (!ctl.signal.aborted) updateReply(turnId, (r) => applyAssistantEvent(r, e, clock()));
    };
    const now = opts.now?.() ?? new Date();
    const call = createCaller(def, { user: opts.user, now, emit, signal: ctl.signal, latency: opts.latency });
    const ctx = { page: opts.page(), user: opts.user, now, call };

    def.brain({ text, attachments }, ctx, emit, ctl.signal).then(
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
      if (disposed || (!question && !attachments.length)) return null;
      // a running reply is stopped and settled before the new one starts
      while (running) {
        const current: Run = running;
        stopRun();
        await current.done;
      }
      if (disposed) return null;
      return start(question, attachments);
    },
    stop: stopRun,
    clear() {
      stopRun();
      if (!snap.turns.length) return;
      commit({ turns: [], archive: archiveCurrent(snap.archive) });
    },
    restore(id) {
      const target = snap.archive.find((a) => a.id === id);
      if (!target) return;
      stopRun();
      commit({ turns: target.turns, archive: archiveCurrent(snap.archive.filter((a) => a.id !== id)) });
    },
    dispose() {
      disposed = true;
      listeners.clear();
      stopRun();
    },
  };
}
