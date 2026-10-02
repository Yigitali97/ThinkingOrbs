// The site-agnostic assistant protocol: blocks, tools, policy, brain and agent definition.
// Types only. A site supplies an AgentDefinition; the panel and runtime know nothing else about it.

import type { AgentEvent, ChatAttachment } from '../chat-app/agent';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export interface Column {
  key: string;
  label: string;
  align?: 'left' | 'right';
}
export type Row = Record<string, string | number> & { href?: string };
export interface Series {
  name: string;
  values: number[];
}

/** Structured content an answer can carry besides text. */
export type Block =
  | { kind: 'table'; columns: Column[]; rows: Row[]; caption?: string }
  | { kind: 'chart'; type: 'bar' | 'line'; series: Series[]; x: string[]; unit?: string; caption?: string }
  | { kind: 'stat'; items: { label: string; value: string; delta?: string; tone?: Tone }[] }
  | { kind: 'status'; title: string; status: 'on-track' | 'at-risk' | 'off-track'; reasons: string[]; sources: string[]; href?: string }
  | { kind: 'draft'; channel: 'teams' | 'email'; to?: string; subject?: string; body: string }
  | { kind: 'link'; label: string; href: string };

export type AssistantEvent = AgentEvent | { type: 'block'; block: Block };

export interface PageContext {
  page: string;
  title: string;
  id?: string;
  data?: unknown;
}

export type Role = 'leadership' | 'manager' | 'developer';
export interface User {
  id: string;
  name: string;
  title: string;
  role: Role;
  team: string;
}

export interface ToolContext {
  user?: User;
  now: Date;
  signal: AbortSignal;
}
export interface Tool<I = any, O = any> {
  id: string;
  label: string;
  /** the company system this tool reads, e.g. "Jira" */
  system: string;
  run(input: I, ctx: ToolContext): Promise<O>;
}

export type ToolResult<O = unknown> =
  | { ok: true; data: O; restricted?: string }
  | { ok: false; reason: 'denied' | 'failed' | 'unknown-tool'; message: string; alternative?: string };

/** Access rules: `before` may refuse a call; `after` may narrow what comes back. */
export interface Policy {
  before(tool: Tool, input: unknown, user?: User): { reason: string; alternative?: string } | null;
  after<O>(tool: Tool, output: O, user?: User): { output: O; restricted?: string };
}

export interface BrainContext {
  page: PageContext;
  user?: User;
  now: Date;
  call: <O = unknown>(toolId: string, input?: unknown) => Promise<ToolResult<O>>;
}

export type Emit = (e: AssistantEvent) => void;
export type Brain = (input: { text: string; attachments: ChatAttachment[] }, ctx: BrainContext, emit: Emit, signal: AbortSignal) => Promise<void>;

export interface AgentDefinition {
  id: string;
  name: string;
  scope: string;
  tools: Tool[];
  brain: Brain;
  greeting(user?: User): string;
  suggestions(page: PageContext, user?: User): string[];
  policy?: Policy;
}
