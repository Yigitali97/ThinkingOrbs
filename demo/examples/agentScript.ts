// A scripted agent turn: reasoning → web search → tools → streamed answer.
// The script is a list of timed events applied in order; `advance` applies the
// ones that are due, reusing unchanged arrays so the orbs only see real changes.

import type { ReasoningStep, SearchPhase, SearchSource, ToolCall } from '../../src/orbs';

export type Stage = 'idle' | 'thinking' | 'searching' | 'tools' | 'writing' | 'done';
export const STAGE_ORDER: Stage[] = ['idle', 'thinking', 'searching', 'tools', 'writing', 'done'];

export interface LogEntry {
  stage: 'thinking' | 'searching' | 'tools';
  text: string;
  ok: boolean;
}

export interface RunState {
  stage: Stage;
  steps: ReasoningStep[];
  budget: number;
  phase: SearchPhase;
  sources: SearchSource[];
  tools: ToolCall[];
  text: string;
  tokens: number;
  log: LogEntry[];
  /** when the current stage began, ms into the run */
  since: number;
}

export interface RunEvent {
  at: number;
  apply: (s: RunState, at: number) => RunState;
}

export const QUESTION = 'Plan a long weekend in Lisbon in May. What should I budget?';
export const ANSWER =
  'Lisbon in May is mild, around 22°C by day. The hotels I found average €140 a night, so four nights come to about €560. ' +
  'Add roughly €45 a day for food and €25 for transport and you land near €840 for the trip. ' +
  'The currency tool failed, so every price here is in euros.';

const THOUGHTS = ['Restating the question', 'Listing what a trip costs', 'Checking the season', 'Choosing what to look up', 'Planning the tool calls', 'Settling the order'];
const SOURCES: SearchSource[] = [
  { id: 's1', domain: 'visitlisboa.com', score: 0.92 },
  { id: 's2', domain: 'wikivoyage.org', score: 0.8 },
  { id: 's3', domain: 'timeout.com', score: 0.7 },
  { id: 's4', domain: 'lonelyplanet.com', score: 0.85 },
  { id: 's5', domain: 'booking.com', score: 0.6 },
  { id: 's6', domain: 'weather.com', score: 0.75 },
  { id: 's7', domain: 'reddit.com', score: 0.4 },
  { id: 's8', domain: 'nytimes.com', score: 0.55 },
];

export function initialRun(): RunState {
  return { stage: 'idle', steps: [], budget: 0, phase: 'idle', sources: [], tools: [], text: '', tokens: 0, log: [], since: 0 };
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function tool(id: string, label: string | undefined, status: ToolCall['status']) {
  return (s: RunState): RunState => {
    const found = s.tools.some((t) => t.id === id);
    const tools = found ? s.tools.map((t) => (t.id === id ? { ...t, status } : t)) : [...s.tools, { id, label, status }];
    return { ...s, tools };
  };
}

/** Build the script. Times are in ms at normal speed. */
export function buildRun(): RunEvent[] {
  const ev: RunEvent[] = [];
  const at = (ms: number, apply: RunEvent['apply']) => ev.push({ at: ms, apply });

  // reasoning
  at(300, (s, t) => ({ ...s, stage: 'thinking', since: t }));
  THOUGHTS.forEach((label, k) =>
    at(500 + k * 650, (s) => ({ ...s, steps: [...s.steps, { id: `t${k}`, label }], budget: ((k + 1) / THOUGHTS.length) * 0.38 }))
  );
  const thinkEnd = 500 + THOUGHTS.length * 650 + 300;

  // search
  at(thinkEnd, (s, t) => ({
    ...s,
    stage: 'searching',
    phase: 'searching',
    log: [...s.log, { stage: 'thinking', text: `Thought for ${seconds(t - s.since)}`, ok: true }],
    since: t,
  }));
  SOURCES.forEach((src, k) => at(thinkEnd + 350 + k * 280, (s) => ({ ...s, sources: [...s.sources, src] })));
  const found = thinkEnd + 350 + SOURCES.length * 280;
  at(found + 500, (s) => ({ ...s, phase: 'ranking' }));
  at(found + 1900, (s) => ({ ...s, phase: 'synthesizing' }));
  at(found + 3900, (s) => ({ ...s, phase: 'done' }));
  const searchEnd = found + 4500;

  // tools
  at(searchEnd, (s, t) => ({
    ...s,
    stage: 'tools',
    log: [...s.log, { stage: 'searching', text: `Read ${s.sources.length} sources`, ok: true }],
    since: t,
  }));
  at(searchEnd + 200, tool('weather', 'weather.forecast', 'running'));
  at(searchEnd + 600, tool('hotels', 'hotels.search', 'running'));
  at(searchEnd + 1000, tool('fx', 'currency.convert', 'running'));
  at(searchEnd + 2000, tool('weather', undefined, 'done'));
  at(searchEnd + 2700, tool('fx', undefined, 'error'));
  at(searchEnd + 3400, tool('hotels', undefined, 'done'));
  const toolsEnd = searchEnd + 4400;

  // answer
  at(toolsEnd, (s, t) => {
    const failed = s.tools.filter((x) => x.status === 'error').length;
    const text = `Used ${s.tools.length} tools` + (failed ? `, ${failed} failed` : '');
    return { ...s, stage: 'writing', log: [...s.log, { stage: 'tools', text, ok: failed === 0 }], since: t };
  });
  const words = ANSWER.split(' ').map((w, k, all) => (k < all.length - 1 ? w + ' ' : w));
  let ms = toolsEnd + 500;
  for (let i = 0; i < words.length; ) {
    const n = 1 + ((i * 7) % 3); // 1–3 words per chunk, deterministic
    const chunk = words.slice(i, i + n).join('');
    at(ms, (s) => ({ ...s, text: s.text + chunk, tokens: s.tokens + n }));
    i += n;
    ms += i % 11 === 0 ? 380 : 70;
  }
  at(ms + 300, (s, t) => ({ ...s, stage: 'done', since: t }));
  return ev.sort((a, b) => a.at - b.at); // stable, so same-time events keep their order
}

/** Total length of a run in ms. */
export const runLength = (events: RunEvent[]) => events[events.length - 1].at;

/** Apply every event due by `t`, starting at `next`. */
export function advance(state: RunState, events: RunEvent[], next: number, t: number): { state: RunState; next: number } {
  let s = state;
  let i = next;
  while (i < events.length && events[i].at <= t) {
    s = events[i].apply(s, events[i].at);
    i++;
  }
  return { state: s, next: i };
}
