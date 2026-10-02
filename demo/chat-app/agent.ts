// The chat sample's agent protocol, and a demo agent with one use case per orb.
// It does real work where it can (maths, budgets, file stats, image and video analysis)
// and says plainly when something is simulated (web search has no internet here).
//
// Map a real model's stream onto these events:
//   reasoning / "thinking" blocks → { type: 'thinking' }
//   web search progress           → { type: 'search' }
//   tool_use start / result        → { type: 'tool' }
//   file / image / video reading   → { type: 'ingest' | 'vision' | 'reel' }
//   text deltas                    → { type: 'text' }

import { captureFrames } from '../../src/orbs';
import type { IngestStatus, ReelStatus, SearchPhase, SearchSource, ToolStatus } from '../../src/orbs';

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  file?: File;
  /** object/data URL for images */
  url?: string;
  /** pre-extracted video frames (the built-in sample has no real file) */
  frames?: string[];
}

export interface Source extends SearchSource {
  title: string;
  /** made-up result (this demo has no internet) — the UI labels it */
  demo?: boolean;
}

export type AgentEvent =
  | { type: 'thinking'; label: string; budget?: number }
  | { type: 'search'; phase: SearchPhase; sources: Source[] }
  | { type: 'tool'; id: string; label?: string; status: ToolStatus }
  | { type: 'ingest'; name: string; size?: number; progress: number; status: IngestStatus }
  | { type: 'vision'; name?: string; status: 'scanning' | 'done'; src: string; focus?: Array<{ x: number; y: number; label?: string }> }
  | { type: 'reel'; name?: string; frames: string[]; progress: number; status: ReelStatus }
  | { type: 'text'; delta: string };

export type Agent = (
  input: { text: string; attachments: ChatAttachment[] },
  emit: (event: AgentEvent) => void,
  signal: AbortSignal
) => Promise<void>;

// ------------------------------------------------------------------ helpers

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

/** Stream text in word-sized chunks with an uneven, model-like rhythm. */
async function stream(text: string, emit: (e: AgentEvent) => void, signal: AbortSignal) {
  const parts = text.match(/\S+\s*/g) ?? [];
  for (let i = 0; i < parts.length; ) {
    const n = 1 + Math.floor(Math.random() * 3);
    emit({ type: 'text', delta: parts.slice(i, i + n).join('') });
    i += n;
    await sleep(Math.random() < 0.1 ? 240 : 28 + Math.random() * 55, signal);
  }
}

const money = (n: number) => '$' + Math.round(n).toLocaleString();
const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 }));

/** A small, safe arithmetic parser: + - * / ^ ( ) and decimals. */
function evaluate(expr: string): number | null {
  const src = expr.replace(/,/g, '').replace(/\s+/g, '');
  let i = 0;
  const peek = () => src[i];
  const atom = (): number | null => {
    if (peek() === '(') {
      i++;
      const v = add();
      if (peek() !== ')') return null;
      i++;
      return v;
    }
    if (peek() === '-') {
      i++;
      const v = atom();
      return v === null ? null : -v;
    }
    const m = src.slice(i).match(/^\d+(\.\d+)?/);
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const pow = (): number | null => {
    const a = atom();
    if (a === null || peek() !== '^') return a;
    i++;
    const b = pow();
    return b === null ? null : Math.pow(a, b);
  };
  const mul = (): number | null => {
    let a = pow();
    while (a !== null && (peek() === '*' || peek() === '/')) {
      const op = src[i++];
      const b = pow();
      if (b === null) return null;
      a = op === '*' ? a * b : a / b;
    }
    return a;
  };
  function add(): number | null {
    let a = mul();
    while (a !== null && (peek() === '+' || peek() === '-')) {
      const op = src[i++];
      const b = mul();
      if (b === null) return null;
      a = op === '+' ? a + b : a - b;
    }
    return a;
  }
  const v = add();
  return v !== null && i === src.length && isFinite(v) ? v : null;
}

function findMath(text: string): { expr: string; value: number } | null {
  const pct = text.match(/(\d+(?:\.\d+)?)\s*%\s*of\s*([\d,]+(?:\.\d+)?)/i);
  if (pct) return { expr: `${pct[1]}% of ${pct[2]}`, value: (Number(pct[1]) / 100) * Number(pct[2].replace(/,/g, '')) };
  const spoken = text.replace(/\btimes\b|×/gi, '*').replace(/\bdivided by\b|÷/gi, '/').replace(/\bplus\b/gi, '+').replace(/\bminus\b/gi, '-');
  const m = spoken.match(/[-(\d][\d,.\s+\-*/^()]*[\d)]/);
  if (!m || !/[+\-*/^]/.test(m[0].replace(/^-/, ''))) return null;
  const value = evaluate(m[0]);
  return value === null ? null : { expr: m[0].trim(), value };
}

/** Average colour → a plain-words tone, plus brightness. */
function tone(r: number, g: number, b: number) {
  const lum = r * 0.3 + g * 0.59 + b * 0.11;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let name = 'grey';
  if (max - min > 18) {
    const h = ((max === r ? ((g - b) / (max - min)) * 60 : max === g ? (2 + (b - r) / (max - min)) * 60 : (4 + (r - g) / (max - min)) * 60) + 360) % 360;
    name = h < 20 || h >= 330 ? 'red' : h < 50 ? 'orange' : h < 70 ? 'yellow' : h < 160 ? 'green' : h < 200 ? 'teal' : h < 260 ? 'blue' : 'purple';
  }
  return { name, lum, bright: lum > 170 ? 'bright' : lum > 90 ? 'medium' : 'dark' };
}

function sample(url: string, n = 24): Promise<{ w: number; h: number; r: number; g: number; b: number; hot: { x: number; y: number } }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = n;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, n, n);
      const d = ctx.getImageData(0, 0, n, n).data;
      let r = 0, g = 0, b = 0, best = -1, hx = 0, hy = 0;
      for (let k = 0; k < d.length; k += 4) {
        r += d[k];
        g += d[k + 1];
        b += d[k + 2];
        const l = d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11;
        if (l > best) {
          best = l;
          hx = (k / 4) % n;
          hy = Math.floor(k / 4 / n);
        }
      }
      const px = d.length / 4;
      resolve({ w: img.naturalWidth, h: img.naturalHeight, r: r / px, g: g / px, b: b / px, hot: { x: (hx + 0.5) / n, y: (hy + 0.5) / n } });
    };
    img.onerror = () => reject(new Error('Could not read the image.'));
    img.src = url;
  });
}

const STOP = new Set('the a an and or of to in on for is are was were be it this that with as at by from you your our we they i'.split(' '));
const TEXTY = /\.(txt|md|csv|json|js|ts|tsx|py|html|css|log|xml|ya?ml)$/i;

// ------------------------------------------------------------- use cases

type Emit = (e: AgentEvent) => void;

async function searchUseCase(q: string, emit: Emit, signal: AbortSignal) {
  const topic = q.replace(/^(please\s+)?(search( the web)?|look up|find)\s*(for|about)?\s*/i, '').replace(/[?.!]+$/, '') || 'your question';
  const pool: Source[] = ([
    { id: '1', domain: 'wikipedia.org', title: `${topic} — overview`, score: 0.92 },
    { id: '2', domain: 'reuters.com', title: `What changed this year: ${topic}`, score: 0.78 },
    { id: '3', domain: 'nature.com', title: `A study on ${topic}`, score: 0.88 },
    { id: '4', domain: 'github.com', title: `Open data about ${topic}`, score: 0.55 },
    { id: '5', domain: 'mit.edu', title: `${topic}: an explainer`, score: 0.8 },
    { id: '6', domain: 'bbc.co.uk', title: `${topic}, in plain English`, score: 0.6 },
    { id: '7', domain: 'stackexchange.com', title: `Q&A: ${topic}`, score: 0.42 },
    { id: '8', domain: 'arxiv.org', title: `Recent research on ${topic}`, score: 0.85 },
  ] as Source[]).map((s) => ({ ...s, demo: true }));
  const found: Source[] = [];
  emit({ type: 'search', phase: 'searching', sources: [] });
  await sleep(500, signal);
  for (const s of pool) {
    found.push(s);
    emit({ type: 'search', phase: 'searching', sources: [...found] });
    await sleep(220 + Math.random() * 230, signal);
  }
  await sleep(500, signal);
  emit({ type: 'search', phase: 'ranking', sources: found });
  await sleep(1500, signal);
  emit({ type: 'search', phase: 'synthesizing', sources: found });
  await sleep(2100, signal);
  emit({ type: 'search', phase: 'done', sources: found });
  await sleep(400, signal);
  const top = [...found].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3);
  await stream(
    `I looked through **${found.length} sources** on ${topic}. The most relevant were ${top
      .map((s) => `**${s.domain}**`)
      .join(', ')}, so the answer leans on those.\n\n` +
      `These are demo results — connect a search API to the agent to get real ones.`,
    emit,
    signal
  );
}

async function toolsUseCase(q: string, emit: Emit, signal: AbortSignal) {
  const people = Number(q.match(/(\d+)\s*(people|persons|guests|of us)/i)?.[1] ?? 4);
  const days = Number(q.match(/(\d+)[-\s]*(day|night)/i)?.[1] ?? 3);
  const nights = Math.max(1, days - 1) || days;
  const rooms = Math.ceil(people / 2);
  const hotel = rooms * nights * 145;
  const food = people * days * 48;
  const transport = people * 62 + days * 30;
  const total = hotel + food + transport;

  emit({ type: 'tool', id: 'dates', label: 'calendar.check_dates', status: 'running' });
  await sleep(600, signal);
  emit({ type: 'tool', id: 'hotels', label: 'hotels.search', status: 'running' });
  await sleep(700, signal);
  emit({ type: 'tool', id: 'dates', status: 'done' });
  emit({ type: 'tool', id: 'weather', label: 'weather.forecast', status: 'running' });
  await sleep(800, signal);
  emit({ type: 'tool', id: 'hotels', status: 'done' });
  emit({ type: 'tool', id: 'calc', label: 'calculator', status: 'running' });
  await sleep(700, signal);
  emit({ type: 'tool', id: 'weather', status: 'error' });
  await sleep(500, signal);
  emit({ type: 'tool', id: 'calc', status: 'done' });
  await sleep(300, signal);
  await stream(
    `Here's a ${days}-day budget for ${people} people, at example rates:\n\n` +
      `- **Hotel:** ${rooms} room${rooms > 1 ? 's' : ''} for ${nights} night${nights > 1 ? 's' : ''}, ${money(hotel)}\n` +
      `- **Food:** ${money(48)} a day each, ${money(food)}\n` +
      `- **Getting around:** ${money(transport)}\n\n` +
      `That's **${money(total)}** in total, or about ${money(total / people)} each. I couldn't get a weather forecast — that service didn't respond.`,
    emit,
    signal
  );
}

async function mathUseCase(math: { expr: string; value: number }, emit: Emit, signal: AbortSignal) {
  emit({ type: 'tool', id: 'calc', label: 'calculator', status: 'running' });
  await sleep(900, signal);
  emit({ type: 'tool', id: 'calc', status: 'done' });
  await sleep(250, signal);
  await stream(`${math.expr} = **${fmt(math.value)}**`, emit, signal);
}

async function thinkUseCase(q: string, emit: Emit, signal: AbortSignal) {
  const prices = (q.match(/\$?\s?(\d{2,3}(?:,\d{3})|\d{2,3}k)\b/gi) ?? []).map((p) => {
    const v = p.replace(/[$\s,]/g, '').toLowerCase();
    return v.endsWith('k') ? Number(v.slice(0, -1)) * 1000 : Number(v);
  });
  const ev = prices[0] ?? 32000, petrol = prices[1] ?? 26000;
  const years = Number(q.match(/(\d+)\s*years?/i)?.[1] ?? 5);
  const miles = 12000;
  const evRun = (miles / 3.5) * 0.17 + 350; // kWh at 3.5 mi/kWh × $0.17, + upkeep
  const petrolRun = (miles / 35) * 3.6 + 900; // gallons at 35 mpg × $3.60, + upkeep
  const evTotal = ev + evRun * years, petrolTotal = petrol + petrolRun * years;
  const breakEven = (ev - petrol) / (petrolRun - evRun);

  const steps = [
    'Restating the question',
    `Upfront: EV ${money(ev)} vs petrol ${money(petrol)}`,
    `Yearly EV running cost ≈ ${money(evRun)}`,
    `Yearly petrol running cost ≈ ${money(petrolRun)}`,
    `${years}-year totals: ${money(evTotal)} vs ${money(petrolTotal)}`,
    `Break-even after ≈ ${breakEven.toFixed(1)} years`,
    'Checking the assumptions',
  ];
  for (let k = 0; k < steps.length; k++) {
    emit({ type: 'thinking', label: steps[k], budget: ((k + 1) / steps.length) * 0.58 });
    await sleep(650 + Math.random() * 350, signal);
  }
  const cheaper = evTotal < petrolTotal ? 'EV' : 'petrol car';
  await stream(
    `Over **${years} years** the **${cheaper}** is cheaper: about **${money(evTotal)}** for the EV vs **${money(petrolTotal)}** for petrol, ` +
      `a difference of ${money(Math.abs(evTotal - petrolTotal))}. The EV costs more up front but saves ${money(petrolRun - evRun)} a year, so it breaks even after roughly **${breakEven.toFixed(1)} years**.\n\n` +
      `This assumes ${miles.toLocaleString()} miles a year, electricity at $0.17/kWh, and petrol at $3.60 a gallon in a 35 mpg car.`,
    emit,
    signal
  );
}

async function fileUseCase(a: ChatAttachment, emit: Emit, signal: AbortSignal) {
  emit({ type: 'ingest', name: a.name, size: a.size, progress: 1, status: 'reading' });
  let text: string | null = null;
  if (a.file && TEXTY.test(a.name) && a.size < 2_000_000) text = await a.file.text();
  await sleep(1700, signal);
  emit({ type: 'ingest', name: a.name, size: a.size, progress: 1, status: 'done' });
  await sleep(350, signal);
  if (!text) {
    return stream(
      `**${a.name}** is ${bytes(a.size)} of ${a.type || 'binary data'}. I can only read plain-text files here — try a .txt, .md, .csv or .json file.`,
      emit,
      signal
    );
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const words = text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const w of words) if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const topWords = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([w]) => w);
  // figures, not digits glued to words (the "3" in "Q3")
  const numbers = [...text.matchAll(/\$?\d[\d,]*(?:\.\d+)?%?/g)].filter((m) => !/[A-Za-z]/.test(text[(m.index ?? 0) - 1] ?? '')).map((m) => m[0]);
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');
  await stream(
    `**${a.name}** is short — ${lines.length} lines, ${words.length} words — and opens with “${lines[0].slice(0, 80)}”.` +
      (topWords.length ? ` It's mostly about ${list(topWords)}.` : '') +
      (numbers.length ? ` It includes ${numbers.length} figures, such as ${list(numbers.slice(0, 3))}.` : ''),
    emit,
    signal
  );
}

async function imageUseCase(a: ChatAttachment, emit: Emit, signal: AbortSignal) {
  emit({ type: 'vision', name: a.name, status: 'scanning', src: a.url! });
  const s = await sample(a.url!);
  await sleep(3500, signal);
  const t = tone(s.r, s.g, s.b);
  emit({ type: 'vision', name: a.name, status: 'done', src: a.url!, focus: [{ x: s.hot.x, y: s.hot.y, label: 'Brightest area' }] });
  await sleep(500, signal);
  const where = `${s.hot.y < 0.34 ? 'top' : s.hot.y > 0.66 ? 'bottom' : 'middle'}${s.hot.x < 0.34 ? ' left' : s.hot.x > 0.66 ? ' right' : ''}`;
  const light = t.bright === 'dark' ? 'low-light' : t.bright === 'bright' ? 'bright' : 'softly lit';
  await stream(
    `A ${light} ${s.w > s.h ? 'landscape' : s.w < s.h ? 'portrait' : 'square'} image, ${s.w} × ${s.h}, dominated by **${t.name}** tones. ` +
      `The brightest area sits near the **${where.trim()}** — I've marked it on the image.`,
    emit,
    signal
  );
}

async function videoUseCase(a: ChatAttachment, emit: Emit, signal: AbortSignal) {
  emit({ type: 'reel', name: a.name, frames: a.frames ?? [], progress: 0, status: 'loading' });
  let frames = a.frames;
  if (!frames && a.file) {
    try {
      frames = await captureFrames(a.file, 12);
    } catch {
      emit({ type: 'reel', name: a.name, frames: [], progress: 0, status: 'error' });
      return stream(`I couldn't open **${a.name}** in this browser. Try an MP4 or WebM file.`, emit, signal);
    }
  }
  frames = frames ?? [];
  const n = frames.length;
  const tones: Array<ReturnType<typeof tone>> = [];
  for (let k = 0; k < n; k++) {
    const s = await sample(frames[k], 12);
    tones.push(tone(s.r, s.g, s.b));
    emit({ type: 'reel', name: a.name, frames, progress: (k + 0.5) / n, status: 'analyzing' });
    await sleep(320, signal);
  }
  emit({ type: 'reel', name: a.name, frames, progress: 1, status: 'done' });
  await sleep(400, signal);
  const first = tones[0], lastT = tones[n - 1];
  const trend = lastT && first ? (lastT.lum > first.lum + 25 ? 'gets brighter' : lastT.lum < first.lum - 25 ? 'gets darker' : 'keeps a similar brightness') : '';
  await stream(
    `The clip opens **${first?.name ?? 'neutral'}** and ${first?.bright ?? 'evenly lit'}, and ends **${lastT?.name ?? 'neutral'}** and ${lastT?.bright ?? 'evenly lit'} — it ${trend} as it goes, like a day turning into evening. I sampled ${n} frames to tell.`,
    emit,
    signal
  );
}

// --------------------------------------------------------------- the agent

export const demoAgent: Agent = async ({ text, attachments }, emit, signal) => {
  const q = text.trim();
  const lower = q.toLowerCase();

  // attachments first: each kind has its own orb
  for (const a of attachments) {
    if (a.type.startsWith('image/') && a.url) await imageUseCase(a, emit, signal);
    else if (a.type.startsWith('video/') || a.frames) await videoUseCase(a, emit, signal);
    else await fileUseCase(a, emit, signal);
    if (a !== attachments[attachments.length - 1]) emit({ type: 'text', delta: '\n\n' });
  }
  if (attachments.length) return;

  if (/\b(search|look up|latest|news)\b/.test(lower)) return searchUseCase(q, emit, signal);
  if (/\b(think|step by step|which is cheaper|compare|worth it|over \d+ years)\b/.test(lower)) return thinkUseCase(q, emit, signal);
  if (/\b(budget|plan|trip|book|schedule|tools?)\b/.test(lower)) return toolsUseCase(q, emit, signal);
  const math = findMath(q);
  if (math) return mathUseCase(math, emit, signal);

  await sleep(500, signal);
  if (/^(hi|hello|hey)\b/.test(lower)) return stream('Hi! Pick a suggestion below the message box to see what I can do.', emit, signal);
  return stream(
    `I'm a demo assistant, so I can only do a few things:\n\n` +
      `- **Search the web** for a topic\n` +
      `- **Plan a budget** using tools\n` +
      `- **Think through** a comparison step by step\n` +
      `- **Read a file**, **look at an image** or **watch a video** you attach\n` +
      `- Work out a sum, like 18% of 2,450\n\n` +
      `Pick a suggestion below the message box to try one.`,
    emit,
    signal
  );
};
