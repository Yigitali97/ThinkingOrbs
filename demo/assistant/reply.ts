// The chat sample's reply model, extended with structured blocks (tables, charts, drafts...).
// Everything except `block` events is delegated to the chat sample's own reducer; `open` events don't touch the reply.

import { applyEvent, createReply, finishReply } from '../chat-app/activity';
import type { Reply } from '../chat-app/activity';
import type { AssistantEvent, Block } from './protocol';

export type AssistantReply = Reply & { blocks: Block[] };

export function createAssistantReply(id: string, now: number): AssistantReply {
  return { ...createReply(id, now), blocks: [] };
}

export function applyAssistantEvent(r: AssistantReply, e: AssistantEvent, now: number): AssistantReply {
  if (e.type === 'open') return r;
  if (e.type === 'block') {
    return { ...r, blocks: [...r.blocks, e.block], firstTextAt: r.firstTextAt ?? now, state: r.state === 'working' ? 'writing' : r.state };
  }
  return { ...applyEvent(r, e, now), blocks: r.blocks };
}

export function finishAssistantReply(r: AssistantReply, outcome: 'done' | 'stopped' | 'error', now: number, error?: string): AssistantReply {
  return { ...finishReply(r, outcome, now, error), blocks: r.blocks };
}
