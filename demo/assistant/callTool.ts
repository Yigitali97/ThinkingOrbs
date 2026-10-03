// Calls an agent's tools through its access policy, emitting tool events and simulating latency and outages.
// queryTool is the quiet variant pages use: same policy, no events, no latency, no outages.

import { isDown } from './flaky';
import { int, seeded } from './random';
import type { AgentDefinition, BrainContext, Emit, Tool, ToolResult, User } from './protocol';

type Def = Pick<AgentDefinition, 'tools' | 'policy'>;

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

/** Settles with `work`, or rejects with an AbortError as soon as `signal` aborts. */
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Looks the tool up and asks the policy; returns the tool, or the refusal to hand back. */
function admit(def: Def, toolId: string, input: unknown, user?: User): { tool: Tool } | { refusal: ToolResult<never> } {
  const tool = def.tools.find((t) => t.id === toolId);
  if (!tool) return { refusal: { ok: false, reason: 'unknown-tool', message: `No tool named ${toolId}` } };
  const denial = def.policy?.before(tool, input, user);
  if (denial) return { refusal: { ok: false, reason: 'denied', message: denial.reason, alternative: denial.alternative } };
  return { tool };
}

function narrow<O>(def: Def, tool: Tool, output: O, user?: User): ToolResult<O> {
  const after = def.policy?.after(tool, output, user) ?? { output };
  return { ok: true, data: after.output, restricted: after.restricted };
}

export function createCaller(
  def: Def,
  opts: { user?: User; now: Date; emit: Emit; signal: AbortSignal; latency?: (toolId: string) => number },
): BrainContext['call'] {
  const { user, now, emit, signal } = opts;
  let n = 0;
  return async <O = unknown>(toolId: string, input?: unknown): Promise<ToolResult<O>> => {
    const admitted = admit(def, toolId, input, user);
    if ('refusal' in admitted) return admitted.refusal;
    const { tool } = admitted;

    const id = `${tool.id}#${++n}`;
    const latency = opts.latency ? opts.latency(tool.id) : int(seeded(n), 250, 700);
    emit({ type: 'tool', id, label: tool.label, status: 'running' });
    try {
      await abortable(sleep(latency), signal);
      if (isDown(tool.system)) {
        emit({ type: 'tool', id, status: 'error' });
        return { ok: false, reason: 'failed', message: `${tool.system} didn't respond` };
      }
      const output = (await abortable(tool.run(input, { user, now, signal }), signal)) as O;
      const result = narrow(def, tool, output, user);
      emit({ type: 'tool', id, status: 'done' });
      return result;
    } catch (e) {
      emit({ type: 'tool', id, status: 'error' });
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      return { ok: false, reason: 'failed', message: messageOf(e) };
    }
  };
}

export async function queryTool<O>(def: Def, toolId: string, input: unknown, ctx: { user?: User; now: Date }): Promise<ToolResult<O>> {
  const admitted = admit(def, toolId, input, ctx.user);
  if ('refusal' in admitted) return admitted.refusal;
  const { tool } = admitted;
  try {
    const output = (await tool.run(input, { user: ctx.user, now: ctx.now, signal: new AbortController().signal })) as O;
    return narrow(def, tool, output, ctx.user);
  } catch (e) {
    return { ok: false, reason: 'failed', message: messageOf(e) };
  }
}
