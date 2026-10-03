// Test helper: runs an agent's brain (or its opening brief) once with no latency or pacing and returns the folded reply,
// plus every tool id it asked for, every result it received and every view it asked the site to open.

import type { ChatAttachment } from '../chat-app/agent';
import type { Activity } from '../chat-app/activity';
import { setPace } from './brain';
import { createCaller } from './callTool';
import type { AgentDefinition, AssistantEvent, Block, Brain, PageContext, ToolResult, User } from './protocol';
import { applyAssistantEvent, createAssistantReply } from './reply';

export interface BrainRun {
  text: string;
  blocks: Block[];
  activities: Activity[];
  tools: string[];
  received: ToolResult[];
  /** the hrefs of the `open` events, in order */
  opens: string[];
}

type RunOpts = { now: Date; page?: PageContext; user?: User; attachments?: ChatAttachment[] };

async function run(def: AgentDefinition, brain: Brain, text: string, opts: RunOpts): Promise<BrainRun> {
  setPace(0);
  const signal = new AbortController().signal;
  let reply = createAssistantReply('test', opts.now.getTime());
  const opens: string[] = [];
  const emit = (e: AssistantEvent) => {
    if (e.type === 'open') opens.push(e.href);
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
  await brain({ text, attachments: opts.attachments ?? [] }, { page, user: opts.user, now: opts.now, call }, emit, signal);
  return { text: reply.text, blocks: reply.blocks, activities: reply.activities, tools, received, opens };
}

export const runBrain = (def: AgentDefinition, text: string, opts: RunOpts): Promise<BrainRun> => run(def, def.brain, text, opts);

/** Runs the agent's opening brief with empty input; an agent without one gets an empty reply. */
export const runBrief = (def: AgentDefinition, opts: RunOpts): Promise<BrainRun> => run(def, def.brief ?? (async () => {}), '', opts);
