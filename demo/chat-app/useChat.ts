// Chat state: messages, uploads, sending and stopping. Agent events go through the pure
// activity reducer, so the UI only ever renders a Reply.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IngestStatus } from '../../src/orbs';
import { applyEvent, createReply, finishReply, Reply } from './activity';
import type { Agent, AgentEvent, ChatAttachment } from './agent';

export interface Upload extends ChatAttachment {
  progress: number;
  status: IngestStatus;
}
export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
  attachments: ChatAttachment[];
}
export interface AssistantMessage {
  id: string;
  role: 'assistant';
  reply: Reply;
}
export type Message = UserMessage | AssistantMessage;

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => performance.now();

export function useChat(agent: Agent, { onReplyDone }: { onReplyDone?: () => void } = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  // latest rendered uploads, readable from callbacks without stale closures
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pending = useRef<{ text: string; ids: string[] } | null>(null);
  const onDone = useRef(onReplyDone);
  onDone.current = onReplyDone;

  useEffect(
    () => () => {
      abortRef.current?.abort();
      timers.current.forEach(clearTimeout);
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  const updateReply = (id: string, fn: (r: Reply) => Reply) =>
    setMessages((list) => list.map((m) => (m.role === 'assistant' && m.id === id ? { ...m, reply: fn(m.reply) } : m)));

  /** Simulated upload, so the IngestOrb in the composer has real progress to show. */
  const addUploads = useCallback((atts: ChatAttachment[]) => {
    for (const att of atts) {
      setUploads((list) => [...list, { ...att, progress: 0, status: 'uploading' }]);
      let p = 0;
      const tick = () => {
        p = Math.min(1, p + 0.07 + Math.random() * 0.1);
        setUploads((list) => list.map((u) => (u.id === att.id ? { ...u, progress: p, status: p >= 1 ? 'reading' : 'uploading' } : u)));
        if (p < 1) timers.current.push(setTimeout(tick, 110));
        else timers.current.push(setTimeout(() => setUploads((list) => list.map((u) => (u.id === att.id ? { ...u, status: 'done' } : u))), 600));
      };
      timers.current.push(setTimeout(tick, 150));
    }
  }, []);

  const attachFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      addUploads(
        Array.from(files).map((file) => {
          const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
          if (url) urls.current.push(url);
          return { id: uid(), name: file.name, type: file.type, size: file.size, file, url };
        })
      );
    },
    [addUploads]
  );

  const removeUpload = useCallback((id: string) => setUploads((list) => list.filter((u) => u.id !== id)), []);

  const send = useCallback(
    async (text: string) => {
      if (abortRef.current) return;
      const ready = uploadsRef.current.filter((u) => u.status === 'done');
      if (!text.trim() && !ready.length) return;
      setUploads((list) => list.filter((u) => u.status !== 'done'));
      const attachments: ChatAttachment[] = ready.map(({ progress: _p, status: _s, ...att }) => att);
      const reply = createReply(uid(), now());
      setMessages((list) => [...list, { id: uid(), role: 'user', text: text.trim(), attachments }, { id: reply.id, role: 'assistant', reply }]);
      setBusy(true);

      const ctl = new AbortController();
      abortRef.current = ctl;
      const emit = (e: AgentEvent) => {
        if (!ctl.signal.aborted) updateReply(reply.id, (r) => applyEvent(r, e, now()));
      };
      try {
        await agent({ text, attachments }, emit, ctl.signal);
        updateReply(reply.id, (r) => finishReply(r, 'done', now()));
        onDone.current?.();
      } catch (err) {
        if (ctl.signal.aborted) updateReply(reply.id, (r) => finishReply(r, 'stopped', now()));
        else updateReply(reply.id, (r) => finishReply(r, 'error', now(), err instanceof Error ? err.message : 'Something went wrong.'));
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [agent]
  );

  /** Queue a message that sends itself once the given uploads are ready (used by sample hints). */
  const sendWhenReady = useCallback(
    (text: string, atts: ChatAttachment[]) => {
      pending.current = { text, ids: atts.map((a) => a.id) };
      addUploads(atts);
    },
    [addUploads]
  );
  useEffect(() => {
    const p = pending.current;
    if (!p || busy) return;
    if (p.ids.every((id) => uploads.find((u) => u.id === id)?.status === 'done')) {
      pending.current = null;
      void send(p.text);
    }
  }, [uploads, busy, send]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const clear = useCallback(() => {
    if (!abortRef.current) setMessages([]);
  }, []);

  return { messages, uploads, busy, send, stop, clear, attachFiles, removeUpload, sendWhenReady };
}
