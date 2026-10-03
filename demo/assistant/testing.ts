// Test helper: runs an agent's brain once with no latency or pacing and returns the folded reply,
// plus every tool id it asked for and every result it received.

import type { ChatAttachment } from '../chat-app/agent';
import type { Activity } from '../chat-app/activity';
import { setPace } from './brain';
import { createCaller } from './callTool';
import type { AgentDefinition, AssistantEvent, Block, PageContext, ToolResult, User } from './protocol';
import { applyAssistantEvent, createAssistantReply } from './reply';

export interface BrainRun {
  text: string;
  blocks: Block[];
  activities: Activity[];
  tools: string[];
  received: ToolResult[];
}

export async function runBrain(
  def: AgentDefinition,
  text: string,
  opts: { now: Date; page?: PageContext; user?: User; attachments?: ChatAttachment[] },
): Promise<BrainRun> {
  setPace(0);
  const signal = new AbortController().signal;
  let reply = createAssistantReply('test', opts.now.getTime());
  const emit = (e: AssistantEvent) => {
    reply = applyAssistantEvent(reply, e, opts.now.getTime());
  };
  const caller = createCaller(def, { user: opts.user, now: opts.now, emit, signal, latency: () => 0 });
  const tools: string[] = [];
  const received: ToolResult[] = [];
  const call = async <O = unknown>(toolId: string, input?: unknown): Promise<ToolResult<O>> => {
    tools.push(toolId);
    const result = await caller<O>(toolId, input);
    received.push(result);
    return result;
  };
  const page = opts.page ?? { page: 'home', title: 'Home' };
  await def.brain({ text, attachments: opts.attachments ?? [] }, { page, user: opts.user, now: opts.now, call }, emit, signal);
  return { text: reply.text, blocks: reply.blocks, activities: reply.activities, tools, received };
}
