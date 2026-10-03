// Playground registry: for every orb, its controls, a live preview and a code generator.

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AskOrb,
  ASSISTANT_COLORS,
  AssistantOrb,
  AssistantState,
  BOT_STATES,
  BotOrb,
  BotState,
  GazeOrb,
  IngestOrb,
  IngestStatus,
  MascotOrb,
  ReasoningOrb,
  ReelOrb,
  ReelStatus,
  SearchOrb,
  SearchPhase,
  STATUS_VARIANTS,
  StatusOrb,
  StatusVariant,
  TokenOrb,
  ToolCall,
  ToolOrb,
  VisionOrb,
  VisionStatus,
  VoiceOrb,
} from '../../src/orbs';
import { reelFrames, SCENE_FOCUS, sceneImage, Scene } from '../samples';

export type Value = string | number | boolean;
export type Values = Record<string, Value>;

interface Base {
  key: string;
  label: string;
  /** Initial value in the playground. */
  init: Value;
  /**
   * The component's own default. Props equal to it are left out of the code.
   * `null` marks a playground-only control (sample data, simulated audio).
   */
  def: Value | null;
}
export type Control = Base &
  (
    | { type: 'select'; options: string[] }
    | { type: 'range'; min: number; max: number; step: number }
    | { type: 'toggle' }
    | { type: 'color' }
    | { type: 'text' }
  );

export interface Entry {
  name: string;
  blurb: string;
  controls: Control[];
  Preview: (props: { v: Values }) => ReactNode;
  code: (v: Values, changed: (key: string) => boolean) => string;
  /** Keep linked controls in sync when one changes. */
  adjust?: (prev: Values, next: Values) => Values;
}

// ---------------------------------------------------------------- code helpers

const fmt = (v: Value) => (typeof v === 'string' ? JSON.stringify(v) : `{${v}}`);
const round = (n: number) => Math.round(n * 100) / 100;

/** Build a JSX tag; `props` entries are [name, value-as-JSX-attribute or null to skip]. */
function tag(name: string, props: Array<[string, string | null]>) {
  const attrs = props.filter(([, val]) => val !== null).map(([k, val]) => (val === '' ? k : `${k}=${val}`));
  if (!attrs.length) return `<${name} />`;
  const one = `<${name} ${attrs.join(' ')} />`;
  return one.length <= 78 ? one : `<${name}\n  ${attrs.join('\n  ')}\n/>`;
}

/** Attribute for a control value, or null when it equals the component default. */
function attr(v: Values, changed: (k: string) => boolean, key: string): [string, string | null] {
  if (!changed(key)) return [key, null];
  const val = v[key];
  if (val === true) return [key, ''];
  return [key, fmt(typeof val === 'number' ? round(val) : val)];
}

function literal(items: object[]) {
  const value = (v: unknown) => (typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : String(v));
  const row = (it: object) => `{ ${Object.entries(it).map(([k, v]) => `${k}: ${value(v)}`).join(', ')} }`;
  return items.length ? `[\n${items.map((it) => `  ${row(it)},`).join('\n')}\n]` : '[]';
}

// --------------------------------------------------------------- sample data

const DOMAINS = ['wikipedia.org', 'arxiv.org', 'reuters.com', 'nature.com', 'github.com', 'mit.edu', 'bbc.co.uk', 'who.int', 'nytimes.com', 'stackoverflow.com', 'ieee.org', 'nasa.gov'];
const SCORES = [0.9, 0.95, 0.7, 0.85, 0.5, 0.75, 0.4, 0.3, 0.55, 0.6, 0.8, 0.65];
const sampleSources = (n: number) => DOMAINS.slice(0, n).map((domain, i) => ({ id: String(i + 1), domain, score: SCORES[i] }));

const THOUGHTS = ['Reading the question', 'Recalling the data', 'Comparing options', 'Checking constraints', 'Estimating the cost', 'Double-checking the maths', 'Looking for edge cases', 'Weighing trade-offs', 'Simplifying the plan', 'Drafting the answer', 'Re-reading the question', 'Tightening the wording', 'Checking units', 'Final review'];
const sampleSteps = (n: number) => THOUGHTS.slice(0, n).map((label, i) => ({ id: String(i + 1), label }));

const TOOL_PRESETS: Record<string, ToolCall[]> = {
  'one running': [{ id: 'search', label: 'web_search', status: 'running' }],
  'three running': [
    { id: 'search', label: 'web_search', status: 'running' },
    { id: 'files', label: 'read_file', status: 'running' },
    { id: 'code', label: 'run_code', status: 'running' },
  ],
  mixed: [
    { id: 'search', label: 'web_search', status: 'done' },
    { id: 'files', label: 'read_file', status: 'running' },
    { id: 'calc', label: 'calculator', status: 'error' },
    { id: 'code', label: 'run_code', status: 'running' },
  ],
  'all done': [
    { id: 'search', label: 'web_search', status: 'done' },
    { id: 'files', label: 'read_file', status: 'done' },
    { id: 'code', label: 'run_code', status: 'done' },
  ],
};

// a held audio level slider → getLevel; adds gentle movement so it reads as voice
function useLevel(level: number) {
  const ref = useRef(level);
  ref.current = level;
  return useMemo(() => () => ref.current * (0.75 + 0.25 * Math.sin(performance.now() / 70)), []);
}

// ------------------------------------------------------------------- entries

const ASSISTANT_STATES: AssistantState[] = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'interrupted', 'muted', 'error'];

export const ENTRIES: Entry[] = [
  {
    name: 'AssistantOrb',
    blurb: 'Voice assistant states with colour and motion.',
    controls: [
      { key: 'state', label: 'State', type: 'select', options: ASSISTANT_STATES, init: 'listening', def: 'idle' },
      { key: 'size', label: 'Size', type: 'range', min: 120, max: 420, step: 10, init: 300, def: 320 },
      { key: 'level', label: 'Audio level (simulated)', type: 'range', min: 0, max: 1, step: 0.05, init: 0.6, def: null },
      { key: 'accent', label: 'Colour for this state', type: 'color', init: ASSISTANT_COLORS.listening, def: null },
    ],
    // picking a new state resets the colour picker to that state's colour
    adjust: (prev, next) => (prev.state !== next.state ? { ...next, accent: ASSISTANT_COLORS[next.state as AssistantState] } : next),
    Preview: ({ v }) => {
      const getLevel = useLevel(v.level as number);
      const state = v.state as AssistantState;
      const custom = v.accent !== ASSISTANT_COLORS[state];
      return <AssistantOrb state={state} size={v.size as number} getLevel={getLevel} colors={custom ? { [state]: v.accent as string } : undefined} />;
    },
    code: (v, changed) => {
      const state = v.state as AssistantState;
      const custom = v.accent !== ASSISTANT_COLORS[state];
      return tag('AssistantOrb', [
        attr(v, changed, 'state'),
        attr(v, changed, 'size'),
        ['getLevel', '{() => level}'],
        ['colors', custom ? `{{ ${state}: '${v.accent}' }}` : null],
      ]) + '\n// level: your audio level 0..1 — or pass stream={mic.stream}';
    },
  },
  {
    name: 'VoiceOrb',
    blurb: 'Glowing ring that breathes with audio.',
    controls: [
      { key: 'size', label: 'Size', type: 'range', min: 200, max: 480, step: 10, init: 380, def: 420 },
      { key: 'sensitivity', label: 'Sensitivity', type: 'range', min: 0.2, max: 3, step: 0.1, init: 1, def: 1 },
      { key: 'level', label: 'Audio level (simulated)', type: 'range', min: 0, max: 1, step: 0.05, init: 0.5, def: null },
    ],
    Preview: ({ v }) => {
      const getLevel = useLevel(v.level as number);
      return <VoiceOrb size={v.size as number} sensitivity={v.sensitivity as number} getLevel={getLevel} />;
    },
    code: (v, changed) =>
      tag('VoiceOrb', [attr(v, changed, 'size'), attr(v, changed, 'sensitivity'), ['getLevel', '{() => level}']]) +
      '\n// or stream={mic.stream} with useMicrophone()',
  },
  {
    name: 'StatusOrb',
    blurb: 'Fifteen small "working" indicators.',
    controls: [
      { key: 'variant', label: 'Variant', type: 'select', options: STATUS_VARIANTS as unknown as string[], init: 'reasoning', def: 'base' },
      { key: 'size', label: 'Size', type: 'range', min: 16, max: 200, step: 2, init: 140, def: 72 },
      { key: 'color', label: 'Colour', type: 'color', init: '#ffffff', def: '#ffffff' },
      { key: 'paused', label: 'Paused', type: 'toggle', init: false, def: false },
    ],
    Preview: ({ v }) => (
      <StatusOrb variant={v.variant as StatusVariant} size={v.size as number} color={v.color as string} paused={v.paused as boolean} />
    ),
    code: (v, changed) => tag('StatusOrb', ['variant', 'size', 'color', 'paused'].map((k) => attr(v, changed, k))),
  },
  {
    name: 'TokenOrb',
    blurb: 'Inline orb that pulses with streamed tokens.',
    controls: [
      { key: 'stream', label: 'Simulated stream', type: 'select', options: ['bursty', 'steady', 'slow', 'paused'], init: 'bursty', def: null },
      { key: 'done', label: 'Done', type: 'toggle', init: false, def: false },
      { key: 'size', label: 'Size', type: 'range', min: 14, max: 120, step: 2, init: 64, def: 22 },
      { key: 'color', label: 'Colour', type: 'color', init: '#d4d4dc', def: '#d4d4dc' },
      { key: 'doneColor', label: 'Done colour', type: 'color', init: '#34d399', def: '#34d399' },
    ],
    Preview: ({ v }) => {
      const [tokens, setTokens] = useState(0);
      useEffect(() => {
        if (v.done || v.stream === 'paused') return;
        let timer: ReturnType<typeof setTimeout>;
        const tick = () => {
          setTokens((n) => n + 1 + Math.floor(Math.random() * 3));
          const gap = v.stream === 'steady' ? 80 : v.stream === 'slow' ? 320 : Math.random() < 0.15 ? 650 : 40 + Math.random() * 70;
          timer = setTimeout(tick, gap);
        };
        tick();
        return () => clearTimeout(timer);
      }, [v.stream, v.done]);
      return (
        <TokenOrb tokens={tokens} done={v.done as boolean} size={v.size as number} color={v.color as string} doneColor={v.doneColor as string} />
      );
    },
    code: (v, changed) =>
      tag('TokenOrb', [['tokens', '{tokenCount}'], attr(v, changed, 'done'), attr(v, changed, 'size'), attr(v, changed, 'color'), attr(v, changed, 'doneColor')]) +
      '\n// tokenCount: running total of streamed tokens — or ref.current.push(n) per chunk',
  },
  {
    name: 'ToolOrb',
    blurb: 'A satellite per tool call.',
    controls: [
      { key: 'tools', label: 'Tools', type: 'select', options: Object.keys(TOOL_PRESETS), init: 'mixed', def: null },
      { key: 'size', label: 'Size', type: 'range', min: 140, max: 320, step: 10, init: 220, def: 200 },
      { key: 'showLabels', label: 'Show labels', type: 'toggle', init: true, def: true },
    ],
    Preview: ({ v }) => <ToolOrb tools={TOOL_PRESETS[v.tools as string]} size={v.size as number} showLabels={v.showLabels as boolean} />,
    code: (v, changed) =>
      `const tools = ${literal(TOOL_PRESETS[v.tools as string])};\n\n` +
      tag('ToolOrb', [['tools', '{tools}'], attr(v, changed, 'size'), attr(v, changed, 'showLabels')]),
  },
  {
    name: 'SearchOrb',
    blurb: 'Sources fly in, get ranked and merged.',
    controls: [
      { key: 'phase', label: 'Phase', type: 'select', options: ['idle', 'searching', 'ranking', 'synthesizing', 'done', 'empty'], init: 'searching', def: null },
      { key: 'sources', label: 'Sources', type: 'range', min: 0, max: 12, step: 1, init: 6, def: null },
      { key: 'size', label: 'Size', type: 'range', min: 180, max: 360, step: 10, init: 280, def: 260 },
      { key: 'showCaption', label: 'Caption', type: 'toggle', init: true, def: true },
    ],
    Preview: ({ v }) => {
      const sources = useMemo(() => sampleSources(v.sources as number), [v.sources]);
      return <SearchOrb phase={v.phase as SearchPhase} sources={sources} size={v.size as number} showCaption={v.showCaption as boolean} />;
    },
    code: (v, changed) =>
      ((v.sources as number) ? `const sources = ${literal(sampleSources(v.sources as number))};\n\n` : '') +
      tag('SearchOrb', [['phase', fmt(v.phase)], ['sources', (v.sources as number) ? '{sources}' : null], attr(v, changed, 'size'), attr(v, changed, 'showCaption')]),
  },
  {
    name: 'IngestOrb',
    blurb: 'File card that dissolves into the sphere.',
    controls: [
      { key: 'name', label: 'File name', type: 'text', init: 'report.pdf', def: 'file' },
      { key: 'progress', label: 'Progress', type: 'range', min: 0, max: 1, step: 0.01, init: 0.45, def: null },
      { key: 'status', label: 'Status', type: 'select', options: ['uploading', 'reading', 'done', 'error'], init: 'uploading', def: 'uploading' },
      { key: 'showCaption', label: 'Caption', type: 'toggle', init: true, def: true },
    ],
    Preview: ({ v }) => (
      <IngestOrb name={v.name as string} progress={v.progress as number} status={v.status as IngestStatus} showCaption={v.showCaption as boolean} />
    ),
    code: (v, changed) =>
      tag('IngestOrb', [attr(v, changed, 'name'), ['progress', `{${round(v.progress as number)}}`], attr(v, changed, 'status'), attr(v, changed, 'showCaption')]),
  },
  {
    name: 'ReasoningOrb',
    blurb: 'A constellation of reasoning steps.',
    controls: [
      { key: 'steps', label: 'Steps', type: 'range', min: 0, max: 14, step: 1, init: 6, def: null },
      { key: 'thinking', label: 'Thinking', type: 'toggle', init: true, def: true },
      { key: 'showBudget', label: 'Show budget', type: 'toggle', init: true, def: null },
      { key: 'budget', label: 'Budget used', type: 'range', min: 0, max: 1, step: 0.01, init: 0.45, def: null },
      { key: 'size', label: 'Size', type: 'range', min: 200, max: 360, step: 10, init: 300, def: 280 },
    ],
    Preview: ({ v }) => {
      const steps = useMemo(() => sampleSteps(v.steps as number), [v.steps]);
      return (
        <ReasoningOrb steps={steps} thinking={v.thinking as boolean} budget={v.showBudget ? (v.budget as number) : undefined} size={v.size as number} />
      );
    },
    code: (v, changed) =>
      `const steps = ${literal(sampleSteps(v.steps as number))};\n\n` +
      tag('ReasoningOrb', [
        ['steps', '{steps}'],
        ['thinking', v.thinking ? null : '{false}'],
        ['budget', v.showBudget ? `{${round(v.budget as number)}}` : null],
        attr(v, changed, 'size'),
      ]),
  },
  {
    name: 'VisionOrb',
    blurb: 'An image seen through a dot sphere.',
    controls: [
      { key: 'image', label: 'Sample image', type: 'select', options: ['sunset', 'lake'], init: 'sunset', def: null },
      { key: 'status', label: 'Status', type: 'select', options: ['loading', 'scanning', 'done', 'error'], init: 'done', def: 'loading' },
      { key: 'focus', label: 'Focus points', type: 'toggle', init: true, def: null },
      { key: 'size', label: 'Size', type: 'range', min: 200, max: 360, step: 10, init: 300, def: 300 },
    ],
    Preview: ({ v }) => {
      const src = useMemo(() => sceneImage(v.image as Scene), [v.image]);
      return <VisionOrb src={src} status={v.status as VisionStatus} focus={v.focus ? SCENE_FOCUS[v.image as Scene] : []} size={v.size as number} />;
    },
    code: (v, changed) =>
      (v.focus ? `const focus = ${literal(SCENE_FOCUS[v.image as Scene])};\n\n` : '') +
      tag('VisionOrb', [['src', '{imageUrl}'], attr(v, changed, 'status'), ['focus', v.focus ? '{focus}' : null], attr(v, changed, 'size')]) +
      '\n// imageUrl: blob:, data:, same-origin or CORS-enabled — e.g. URL.createObjectURL(file)',
  },
  {
    name: 'ReelOrb',
    blurb: 'Video frames orbiting like a film strip.',
    controls: [
      { key: 'progress', label: 'Progress', type: 'range', min: 0, max: 1, step: 0.01, init: 0.35, def: 0 },
      { key: 'status', label: 'Status', type: 'select', options: ['loading', 'analyzing', 'done', 'error'], init: 'analyzing', def: 'loading' },
      { key: 'thumbs', label: 'Thumbnails', type: 'toggle', init: true, def: null },
      { key: 'count', label: 'Frames', type: 'range', min: 4, max: 18, step: 1, init: 12, def: 12 },
    ],
    Preview: ({ v }) => {
      const frames = useMemo(() => (v.thumbs ? reelFrames(v.count as number) : []), [v.thumbs, v.count]);
      return <ReelOrb frames={frames} count={v.count as number} progress={v.progress as number} status={v.status as ReelStatus} width={440} height={260} />;
    },
    code: (v, changed) =>
      (v.thumbs ? `const frames = await captureFrames(videoFile, ${v.count});\n\n` : '') +
      tag('ReelOrb', [
        ['frames', v.thumbs ? '{frames}' : null],
        ['count', !v.thumbs && changed('count') ? `{${v.count}}` : null],
        attr(v, changed, 'progress'),
        attr(v, changed, 'status'),
      ]),
  },
  {
    name: 'MascotOrb',
    blurb: 'Bubble character — click it.',
    controls: [
      { key: 'size', label: 'Size', type: 'range', min: 120, max: 320, step: 10, init: 240, def: 240 },
      { key: 'color', label: 'Colour', type: 'color', init: '#5f9ae6', def: '#5f9ae6' },
      { key: 'blinking', label: 'Blinking', type: 'toggle', init: true, def: true },
      { key: 'bouncy', label: 'Bouncy', type: 'toggle', init: true, def: true },
    ],
    Preview: ({ v }) => <MascotOrb size={v.size as number} color={v.color as string} blinking={v.blinking as boolean} bouncy={v.bouncy as boolean} />,
    code: (v, changed) => tag('MascotOrb', ['size', 'color', 'blinking', 'bouncy'].map((k) => attr(v, changed, k))),
  },
  {
    name: 'BotOrb',
    blurb: 'A robot on a glowing pedestal that shows what the assistant is doing.',
    controls: [
      { key: 'state', label: 'State', type: 'select', options: BOT_STATES, init: 'thinking', def: 'idle' },
      { key: 'size', label: 'Size', type: 'range', min: 56, max: 320, step: 4, init: 240, def: 160 },
      { key: 'pedestal', label: 'Pedestal', type: 'toggle', init: true, def: true },
      { key: 'level', label: 'Audio level (simulated)', type: 'range', min: 0, max: 1, step: 0.05, init: 0.6, def: null },
    ],
    Preview: ({ v }) => {
      const getLevel = useLevel(v.level as number);
      return <BotOrb state={v.state as BotState} size={v.size as number} pedestal={v.pedestal as boolean} getLevel={getLevel} />;
    },
    code: (v, changed) => {
      const voiced = v.state === 'listening' || v.state === 'speaking';
      return (
        tag('BotOrb', [
          attr(v, changed, 'state'),
          attr(v, changed, 'size'),
          attr(v, changed, 'pedestal'),
          ['getLevel', voiced ? '{() => level}' : null],
        ]) +
        (voiced ? '\n// level: your audio level 0..1 — or pass stream={mic.stream}' : '')
      );
    },
  },
  {
    name: 'GazeOrb',
    blurb: 'Eyes that follow the pointer.',
    controls: [
      { key: 'size', label: 'Size', type: 'range', min: 120, max: 320, step: 10, init: 220, def: 240 },
      { key: 'ballColor', label: 'Ball colour', type: 'color', init: '#f2f2f2', def: '#f2f2f2' },
      { key: 'eyeColor', label: 'Eye colour', type: 'color', init: '#0e0e0e', def: '#0e0e0e' },
      { key: 'blinking', label: 'Blinking', type: 'toggle', init: true, def: true },
    ],
    Preview: ({ v }) => <GazeOrb size={v.size as number} ballColor={v.ballColor as string} eyeColor={v.eyeColor as string} blinking={v.blinking as boolean} />,
    code: (v, changed) => tag('GazeOrb', ['size', 'ballColor', 'eyeColor', 'blinking'].map((k) => attr(v, changed, k))),
  },
  {
    name: 'AskOrb',
    blurb: 'The whole ask → answer flow. Type a question in the preview.',
    controls: [
      { key: 'placeholder', label: 'Placeholder', type: 'text', init: 'Ask anything...', def: 'Ask anything...' },
      { key: 'answerLabel', label: 'Answer label', type: 'text', init: 'Answer', def: 'Answer' },
      { key: 'minStageMs', label: 'Min stage time (ms)', type: 'range', min: 300, max: 3000, step: 100, init: 1100, def: 1100 },
    ],
    Preview: ({ v }) => (
      <div style={{ width: '100%', height: 480, borderRadius: 14, overflow: 'hidden' }}>
        <AskOrb style={{ height: '100%' }} placeholder={v.placeholder as string} answerLabel={v.answerLabel as string} minStageMs={v.minStageMs as number} />
      </div>
    ),
    code: (v, changed) => {
      const extra = (['placeholder', 'answerLabel', 'minStageMs'] as const)
        .map((k) => attr(v, changed, k))
        .filter(([, val]) => val !== null)
        .map(([k, val]) => `\n  ${k}=${val}`)
        .join('');
      return (
        '<AskOrb\n' +
        "  onAsk={async (question, report, signal) => {\n" +
        "    report('searching');\n" +
        '    // …call your agent…\n' +
        '    return answer;\n' +
        '  }}' +
        extra +
        "\n  style={{ height: '100vh' }}\n/>"
      );
    },
  },
];
