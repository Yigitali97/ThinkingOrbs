// The bot's presence: which state it shows, which company systems are busy, and when a reply just finished happily.
// Pure rules over the conversation snapshot, voice mode and dictation, shared by whatever UI draws the bot.

import type { AssistantState, BotState } from '../../src/orbs';
import type { ConversationSnapshot } from './conversation';
import type { AgentDefinition } from './protocol';
import type { AssistantReply } from './reply';
import { dockState } from './shortcuts';

const FROM_ASSISTANT: Partial<Record<AssistantState, BotState>> = {
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  error: 'error',
};

/** Voice mode wins, then dictation, then the latest reply; anything else is idle. */
export function botStateFor(s: ConversationSnapshot, voice: { active: boolean; state?: AssistantState }, dictating: boolean): BotState {
  if (voice.active) return (voice.state && FROM_ASSISTANT[voice.state]) ?? 'idle';
  if (dictating) return 'listening';
  return FROM_ASSISTANT[dockState(s)] ?? 'idle';
}

/** The systems (e.g. "Jira") of the reply's tool calls still running. A call id is `<tool id>#<n>`. */
export function activeSystems(tools: AgentDefinition['tools'], reply?: AssistantReply): Set<string> {
  const systems = new Set<string>();
  for (const a of reply?.activities ?? []) {
    if (a.kind !== 'tools') continue;
    for (const call of a.calls) {
      if (call.status !== 'running') continue;
      const id = call.id.split('#')[0];
      const tool = tools.find((t) => t.id === id);
      if (tool) systems.add(tool.system);
    }
  }
  return systems;
}

/**
 * True when the latest reply has just become `done`: the same turn was there before and not done yet.
 * A restored conversation, already done, doesn't count.
 */
export function finishedHappily(prev: ConversationSnapshot, next: ConversationSnapshot): boolean {
  const last = next.turns[next.turns.length - 1];
  if (!last || last.reply.state !== 'done') return false;
  const before = prev.turns.find((t) => t.id === last.id);
  return !!before && before.reply.state !== 'done';
}
