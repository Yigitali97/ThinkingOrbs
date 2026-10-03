// Chat state: messages, uploads, sending and stopping. Agent events go through the pure
// activity reducer, so the UI only ever renders a Reply.

import { useCallback, useEffect, useRef, useState } from 'react';
import { applyEvent, createReply, finishReply, Reply } from './activity';
import type { Agent, AgentEvent, ChatAttachment } from './agent';
import { useUploads } from './useUploads';
import type { Upload } from './useUploads';

export type { Upload };
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
  const { uploads, attachFiles, addUploads, removeUpload, takeReady } = useUploads();
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pending = useRef<{ text: string; ids: string[] } | null>(null);
  const onDone = useRef(onReplyDone);
  onDone.current = onReplyDone;
  // sent attachments' preview URLs belong to the messages, so they go when the chat does
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(
    () => () => {
      abortRef.current?.abort();
      for (const m of messagesRef.current) if (m.role === 'user') m.attachments.forEach((a) => a.url?.startsWith('blob:') && URL.revokeObjectURL(a.url));
    },
    []
  );

  const updateReply = (id: string, fn: (r: Reply) => Reply) =>
    setMessages((list) => list.map((m) => (m.role === 'assistant' && m.id === id ? { ...m, reply: fn(m.reply) } : m)));

  const send = useCallback(
    async (text: string) => {
      if (abortRef.current) return;
      const attachments = takeReady();
      if (!text.trim() && !attachments.length) return;
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
    [agent, takeReady]
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
