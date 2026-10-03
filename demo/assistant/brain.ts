// A rule-based brain: reads attachments, then tries a site's intents in order and runs the first that matches.
// `say` streams text in word chunks; tests call setPace(0) so nothing waits.

import type { ChatAttachment } from '../chat-app/agent';
import type { Brain, BrainContext, Emit } from './protocol';

export interface Intent<P = unknown> {
  id: string;
  /** the parameters to run with, or null when the question isn't this intent's */
  match(text: string, ctx: BrainContext): P | null;
  run(params: P, ctx: BrainContext, emit: Emit, signal: AbortSignal): Promise<void>;
}

const DEFAULT_PACE = 18;
let paceOverride: number | null = null;

/** Overrides every pace (and attachment-reading delay) in this module; tests set 0. */
export function setPace(ms: number): void {
  paceOverride = ms;
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(id);
      reject(abortError());
    };
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** A delay that shrinks with the pace override, so setPace(0) removes it. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return wait(paceOverride === null ? ms : (ms * paceOverride) / DEFAULT_PACE, signal);
}

/** Streams `text` as word chunks, `pace` ms apart. Whitespace (including paragraph breaks) stays with its word. */
export async function say(emit: Emit, text: string, signal: AbortSignal, pace = DEFAULT_PACE): Promise<void> {
  const ms = paceOverride ?? pace;
  const chunks = text.match(/\s*\S+\s*/g) ?? (text ? [text] : []);
  for (let i = 0; i < chunks.length; i++) {
    if (signal.aborted) throw abortError();
    emit({ type: 'text', delta: chunks[i] });
    if (i < chunks.length - 1) await wait(ms, signal);
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function read(a: ChatAttachment, emit: Emit, signal: AbortSignal): Promise<void> {
  if (a.type.startsWith('image/') && a.url) {
    emit({ type: 'vision', name: a.name, status: 'scanning', src: a.url });
    await pause(600, signal);
    emit({ type: 'vision', name: a.name, status: 'done', src: a.url });
    return;
  }
  for (const progress of [0, 1 / 3, 2 / 3, 1]) {
    emit({ type: 'ingest', name: a.name, size: a.size, progress, status: progress === 0 ? 'uploading' : 'reading' });
    await pause(150, signal);
  }
  emit({ type: 'ingest', name: a.name, size: a.size, progress: 1, status: 'done' });
}

export function createBrain(opts: { intents: Intent[]; notUnderstood: (ctx: BrainContext) => string }): Brain {
  return async ({ text, attachments }, ctx, emit, signal) => {
    const question = text.trim();
    if (attachments.length) {
      for (const a of attachments) await read(a, emit, signal);
      const readNote = attachments.map((a) => `I've read ${a.name} (${formatSize(a.size)}).`).join(' ');
      if (!question) {
        await say(emit, `${readNote} What would you like to know about ${attachments.length === 1 ? 'it' : 'them'}?`, signal);
        return;
      }
      await say(emit, `${readNote}\n\n`, signal);
    }

    for (const intent of opts.intents) {
      const params = intent.match(question, ctx);
      if (params === null) continue;
      emit({ type: 'thinking', label: 'Working out what you need' });
      await intent.run(params, ctx, emit, signal);
      return;
    }
    await say(emit, opts.notUnderstood(ctx), signal);
  };
}
