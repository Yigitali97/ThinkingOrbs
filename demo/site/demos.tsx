// Live demos for the component pages, and small previews for the gallery.

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AskOrb,
  AgentStage,
  ASSISTANT_COLORS,
  AssistantOrb,
  AssistantState,
  captureFrames,
  createStageOrb,
  GazeOrb,
  GazeOrbRef,
  IngestOrb,
  IngestStatus,
  MascotOrb,
  MascotOrbRef,
  ReasoningOrb,
  ReasoningStep,
  ReelOrb,
  ReelStatus,
  SearchOrb,
  SearchPhase,
  SearchSource,
  STATUS_VARIANTS,
  StatusOrb,
  TokenOrb,
  ToolCall,
  ToolOrb,
  useMicrophone,
  VisionOrb,
  VisionStatus,
  VoiceOrb,
} from '../../src/orbs';
import { reelFrames, Scene, SCENE_FOCUS, sceneImage } from '../samples';
import { Segmented } from './ui';

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** A state colour lifted toward white so it stays readable as text on black. */
export const readable = (hex: string) => `color-mix(in srgb, ${hex} 72%, #fff)`;

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
    </svg>
  );
}

/** Runs `effect` with a timer helper whose timers are all cleared on cleanup. */
function useTimeline(effect: (at: (ms: number, fn: () => void) => void) => void, deps: unknown[]) {
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    effect((ms, fn) => timers.push(setTimeout(fn, ms)));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// a voice-like level for demos without a microphone
export const fakeVoice = () => {
  const t = performance.now() / 1000;
  const syllables = Math.max(0, Math.sin(t * 9) * Math.sin(t * 2.3 + 1));
  return syllables * (Math.sin(t * 0.7) > -0.3 ? 0.9 : 0);
};

// ------------------------------------------------------------------ AssistantOrb

export const ASSISTANT_STATES: AssistantState[] = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'interrupted', 'muted', 'error'];

function AssistantDemo() {
  const [state, setState] = useState<AssistantState>('idle');
  const mic = useMicrophone();
  return (
    <div className="demo demo-black">
      <Segmented
        label="Assistant state"
        options={ASSISTANT_STATES}
        value={state}
        onChange={setState}
        render={(s) => (
          <>
            <span className="swatch" style={{ background: ASSISTANT_COLORS[s] }} />
            {cap(s)}
          </>
        )}
      />
      <div className="fluid-orb">
        <AssistantOrb state={state} size={340} stream={mic.stream} />
      </div>
      <div className="state-caption" style={{ color: readable(ASSISTANT_COLORS[state]) }} aria-live="polite">
        {state}
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={mic.toggle} aria-pressed={mic.recording} disabled={mic.pending}>
          <MicIcon />
          {mic.pending ? 'Waiting for microphone…' : mic.recording ? 'Turn microphone off' : 'Use microphone'}
        </button>
      </div>
      <p className="hint" role="status">
        {mic.error ?? 'Without audio, Speaking uses a built-in voice pattern. Turn the microphone on to drive Listening with your voice.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------- VoiceOrb

function VoiceDemo() {
  const mic = useMicrophone();
  const [simulate, setSimulate] = useState(true);
  return (
    <div className="demo">
      <div className="fluid-orb">
        <VoiceOrb size={380} stream={mic.stream} getLevel={simulate && !mic.recording ? fakeVoice : undefined} />
      </div>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={mic.toggle} aria-pressed={mic.recording} disabled={mic.pending}>
          <MicIcon />
          {mic.pending ? 'Waiting for microphone…' : mic.recording ? 'Stop recording' : 'Start recording'}
        </button>
        <button type="button" className="btn" aria-pressed={simulate} onClick={() => setSimulate((s) => !s)} disabled={mic.recording}>
          {simulate ? 'Stop simulated voice' : 'Simulate a voice'}
        </button>
      </div>
      <p className="hint" role="status">
        {mic.error ?? 'Record to see the ring move with your own voice.'}
      </p>
    </div>
  );
}

// --------------------------------------------------------------------- StatusOrb

function StatusDemo() {
  const flow = ['working', 'reasoning', 'searching', 'compacting', 'retrying', 'waiting'] as const;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % flow.length), 3200);
    return () => clearInterval(id);
  }, [flow.length]);

  return (
    <div className="demo demo-stretch">
      <div className="status-live" aria-live="polite">
        <StatusOrb variant={flow[i]} size={22} label={null} />
        <span>{cap(flow[i])}…</span>
      </div>
      <div className="status-grid">
        {STATUS_VARIANTS.map((variant) => (
          <figure key={variant}>
            <StatusOrb variant={variant} size={72} label={null} />
            <figcaption>{variant}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- TokenOrb

const REPLY =
  'Sure, here is a quick summary. The fleet logged 1,284 trips this week, up 6% on last week. ' +
  'Fuel spend fell 3% thanks to shorter idle times, and two vehicles are due for service on Friday.';
type Pace = 'bursty' | 'steady' | 'slow';

export function useStreamedText(text: string, pace: Pace, run: unknown, firstTokenMs = 900) {
  const [out, setOut] = useState('');
  const [tokens, setTokens] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const words = text.split(' ').map((w, k, all) => (k < all.length - 1 ? w + ' ' : w));
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    setOut('');
    setTokens(0);
    setDone(false);
    const next = () => {
      if (i >= words.length) return setDone(true);
      const n = pace === 'slow' ? 1 : 1 + Math.floor(Math.random() * 3);
      const chunk = words.slice(i, i + n).join('');
      i += n;
      setOut((t) => t + chunk);
      setTokens((c) => c + n);
      const gap = pace === 'steady' ? 70 : pace === 'slow' ? 260 : Math.random() < 0.15 ? 600 : 40 + Math.random() * 60;
      timer = setTimeout(next, gap);
    };
    timer = setTimeout(next, firstTokenMs);
    return () => clearTimeout(timer);
  }, [text, pace, run, firstTokenMs]);
  return { text: out, tokens, done };
}

function TokenDemo() {
  const [pace, setPace] = useState<Pace>('bursty');
  const [run, setRun] = useState(0);
  const s = useStreamedText(REPLY, pace, run);
  return (
    <div className="demo demo-stretch">
      <div className="chat">
        <div className="bubble bubble-user">How did the fleet do this week?</div>
        <div className="bubble bubble-ai">
          <TokenOrb tokens={s.tokens} done={s.done} size={20} />
          <span>{s.text || <span className="muted-text">Thinking…</span>}</span>
        </div>
      </div>
      <div className="actions">
        <Segmented label="Streaming pace" options={['bursty', 'steady', 'slow'] as const} value={pace} onChange={setPace} />
        <button type="button" className="btn" onClick={() => setRun((r) => r + 1)}>
          Replay
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------- ToolOrb

const AGENT_PLAN: Array<{ at: number; id: string; label?: string; status: ToolCall['status'] }> = [
  { at: 300, id: 'search', label: 'web_search', status: 'running' },
  { at: 900, id: 'files', label: 'read_file', status: 'running' },
  { at: 1500, id: 'calc', label: 'calculator', status: 'running' },
  { at: 2600, id: 'search', status: 'done' },
  { at: 3000, id: 'calc', status: 'error' },
  { at: 3300, id: 'code', label: 'run_code', status: 'running' },
  { at: 4200, id: 'files', status: 'done' },
  { at: 5600, id: 'code', status: 'done' },
];

export function applyTool(list: ToolCall[], step: { id: string; label?: string; status: ToolCall['status'] }): ToolCall[] {
  const found = list.find((t) => t.id === step.id);
  if (found) return list.map((t) => (t.id === step.id ? { ...t, status: step.status } : t));
  return [...list, { id: step.id, label: step.label, status: step.status }];
}

function ToolDemo() {
  const [tools, setTools] = useState<ToolCall[]>([]);
  const [run, setRun] = useState(0);
  useTimeline((at) => {
    setTools([]);
    AGENT_PLAN.forEach((step) => at(step.at, () => setTools((list) => applyTool(list, step))));
  }, [run]);

  return (
    <div className="demo">
      <ToolOrb tools={tools} size={220} />
      <div className="actions">
        <button type="button" className="btn" onClick={() => setRun((r) => r + 1)}>
          Run the agent again
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- SearchOrb

export const FOUND: SearchSource[] = [
  { id: '1', domain: 'wikipedia.org', score: 0.9 },
  { id: '2', domain: 'reuters.com', score: 0.7 },
  { id: '3', domain: 'arxiv.org', score: 0.95 },
  { id: '4', domain: 'github.com', score: 0.5 },
  { id: '5', domain: 'nature.com', score: 0.85 },
  { id: '6', domain: 'bbc.co.uk', score: 0.4 },
  { id: '7', domain: 'stackoverflow.com', score: 0.6 },
  { id: '8', domain: 'mit.edu', score: 0.75 },
  { id: '9', domain: 'who.int', score: 0.3 },
  { id: '10', domain: 'nytimes.com', score: 0.55 },
];

function SearchDemo() {
  const [phase, setPhase] = useState<SearchPhase>('idle');
  const [sources, setSources] = useState<SearchSource[]>([]);
  const [run, setRun] = useState<{ n: number; empty: boolean }>({ n: 0, empty: false });

  useTimeline((at) => {
    setSources([]);
    setPhase('searching');
    if (run.empty) return at(2400, () => setPhase('empty'));
    let ms = 500;
    FOUND.forEach((src) => {
      ms += 220 + Math.random() * 260;
      at(ms, () => setSources((list) => [...list, src]));
    });
    at(ms + 900, () => setPhase('ranking'));
    at(ms + 2500, () => setPhase('synthesizing'));
    at(ms + 5000, () => setPhase('done'));
  }, [run]);

  return (
    <div className="demo">
      <SearchOrb phase={phase} sources={sources} size={300} />
      <div className="actions">
        <button type="button" className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, empty: false }))}>
          Search again
        </button>
        <button type="button" className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, empty: true }))}>
          Search with no results
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- IngestOrb

const SAMPLE_FILES = ['report.pdf', 'photo.png', 'walkthrough.mp4', 'call.mp3'];

function IngestDemo() {
  const [name, setName] = useState(SAMPLE_FILES[0]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<IngestStatus>('uploading');
  const [run, setRun] = useState<{ n: number; fail: boolean }>({ n: 0, fail: false });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProgress(0);
    setStatus('uploading');
    let p = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      // uneven chunks, like a real network
      p = Math.min(1, p + 0.03 + Math.random() * 0.07);
      if (run.fail && p > 0.55) return setStatus('error');
      setProgress(p);
      if (p < 1) timer = setTimeout(step, 90 + Math.random() * 160);
      else {
        setStatus('reading');
        timer = setTimeout(() => setStatus('done'), 1800);
      }
    };
    timer = setTimeout(step, 400);
    return () => clearTimeout(timer);
  }, [name, run]);

  const options = SAMPLE_FILES.includes(name) ? SAMPLE_FILES : [...SAMPLE_FILES, name];
  return (
    <div className="demo">
      <Segmented label="Sample file" options={options} value={name} onChange={setName} render={(f) => f} />
      <div className="fluid-orb">
        <IngestOrb name={name} progress={progress} status={status} width={380} height={220} />
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, fail: false }))}>
          Upload again
        </button>
        <button type="button" className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, fail: true }))}>
          Simulate a failure
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Choose a file…
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setName(f.name);
              setRun((r) => ({ n: r.n + 1, fail: false }));
            }
            e.target.value = '';
          }}
        />
      </div>
      <p className="hint">Picking a file only uses its name to choose the card type. Nothing is uploaded.</p>
    </div>
  );
}

// ------------------------------------------------------------------ ReasoningOrb

export const THOUGHTS = [
  'Reading the question',
  'Recalling fleet data',
  'Comparing fuel costs',
  'Checking service dates',
  'Estimating savings',
  'Double-checking the maths',
  'Weighing two options',
  'Looking for edge cases',
  'Re-reading the constraints',
  'Simplifying the plan',
  'Drafting the answer',
  'Polishing the wording',
];

function ReasoningDemo() {
  const [steps, setSteps] = useState<ReasoningStep[]>([]);
  const [thinking, setThinking] = useState(true);
  const [budget, setBudget] = useState(0);
  const [run, setRun] = useState<{ n: number; long: boolean }>({ n: 0, long: false });

  useTimeline((at) => {
    const total = run.long ? 12 : 7;
    const finalBudget = run.long ? 0.94 : 0.62;
    setSteps([]);
    setThinking(true);
    setBudget(0);
    let ms = 300;
    for (let k = 0; k < total; k++) {
      ms += 650 + Math.random() * 500;
      const label = run.long ? THOUGHTS[k] : THOUGHTS[[0, 1, 2, 3, 4, 5, 10][k]];
      at(ms, () => {
        setSteps((list) => [...list, { id: `${run.n}-${k}`, label }]);
        setBudget(((k + 1) / total) * finalBudget);
      });
    }
    at(ms + 1200, () => setThinking(false));
  }, [run]);

  return (
    <div className="demo">
      <ReasoningOrb steps={steps} thinking={thinking} budget={budget} size={300} />
      <div className="actions">
        <button type="button" className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, long: false }))}>
          Reason again
        </button>
        <button type="button" className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, long: true }))}>
          Long run, near the budget
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- VisionOrb

function VisionDemo() {
  const scenes = useMemo(() => ({ sunset: sceneImage('sunset'), lake: sceneImage('lake') }), []);
  const [scene, setScene] = useState<Scene | 'custom'>('sunset');
  const [custom, setCustom] = useState<string | null>(null);
  const [status, setStatus] = useState<VisionStatus>('loading');
  const [run, setRun] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const src = scene === 'custom' ? custom : scenes[scene];

  useTimeline((at) => {
    setStatus('loading');
    at(600, () => setStatus('scanning'));
    at(4000, () => setStatus('done'));
  }, [src, run]);
  useEffect(() => () => void (custom && URL.revokeObjectURL(custom)), [custom]);

  const options: Array<Scene | 'custom'> = custom ? ['sunset', 'lake', 'custom'] : ['sunset', 'lake'];
  return (
    <div className="demo">
      <Segmented
        label="Sample image"
        options={options}
        value={scene}
        onChange={setScene}
        render={(sc) => (sc === 'sunset' ? 'Sunset' : sc === 'lake' ? 'Lake at night' : 'Your image')}
      />
      <VisionOrb src={src} status={status} focus={scene === 'custom' ? [] : SCENE_FOCUS[scene]} size={320} />
      <div className="actions">
        <button type="button" className="btn" onClick={() => setRun((r) => r + 1)}>
          Scan again
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Choose an image…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setCustom(URL.createObjectURL(f));
              setScene('custom');
            }
            e.target.value = '';
          }}
        />
      </div>
      <p className="hint">Your image stays in the browser. It is never uploaded.</p>
    </div>
  );
}

// ----------------------------------------------------------------------- ReelOrb

function ReelDemo() {
  const sample = useMemo(() => reelFrames(12), []);
  const [frames, setFrames] = useState<string[]>(sample);
  const [status, setStatus] = useState<ReelStatus>('loading');
  const [progress, setProgress] = useState(0);
  const [run, setRun] = useState(0);
  const [failed, setFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (failed) return;
    setStatus('loading');
    setProgress(0);
    let p = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      p = Math.min(1, p + 0.012 + Math.random() * 0.01);
      setProgress(p);
      if (p < 1) timer = setTimeout(step, 70);
      else timer = setTimeout(() => setStatus('done'), 300);
    };
    timer = setTimeout(() => {
      setStatus('analyzing');
      step();
    }, 700);
    return () => clearTimeout(timer);
  }, [frames, run, failed]);

  return (
    <div className="demo">
      <div className="fluid-orb">
        <ReelOrb frames={frames} progress={progress} status={status} width={460} height={270} />
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setFailed(false);
            setRun((r) => r + 1);
          }}
        >
          Watch again
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Choose a video…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setStatus('loading');
            try {
              const next = await captureFrames(f, 12);
              setFailed(false);
              setFrames(next);
            } catch {
              setFailed(true);
              setStatus('error');
            }
          }}
        />
      </div>
      <p className="hint" role="status">
        {failed ? 'That video could not be read. Try an MP4 or WebM file.' : 'Frames from your video are captured in the browser with captureFrames(). Nothing is uploaded.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------- MascotOrb

function MascotDemo() {
  const ref = useRef<MascotOrbRef>(null);
  return (
    <div className="demo">
      <MascotOrb ref={ref} size={240} />
      <p className="hint">Press the bubble</p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => ref.current?.blink()}>
          Blink
        </button>
        <button type="button" className="btn" onClick={() => ref.current?.bounce()}>
          Bounce
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------ GazeOrb

function GazeDemo() {
  const ref = useRef<GazeOrbRef>(null);
  return (
    <div className="demo demo-black">
      <GazeOrb ref={ref} size={220} />
      <p className="hint">Move your pointer anywhere on the page</p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => ref.current?.blink()}>
          Blink
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------- AskOrb

function AskDemo() {
  return (
    <div className="demo demo-ask">
      <AskOrb style={{ height: '100%' }} />
    </div>
  );
}

// -------------------------------------------------------------------------- index

export const DEMOS: Record<string, () => ReactNode> = {
  'assistant-orb': AssistantDemo,
  'voice-orb': VoiceDemo,
  'status-orb': StatusDemo,
  'token-orb': TokenDemo,
  'tool-orb': ToolDemo,
  'ask-orb': AskDemo,
  'mascot-orb': MascotDemo,
  'gaze-orb': GazeDemo,
  'search-orb': SearchDemo,
  'ingest-orb': IngestDemo,
  'reasoning-orb': ReasoningDemo,
  'vision-orb': VisionDemo,
  'reel-orb': ReelDemo,
};

// ------------------------------------------------------------------- gallery thumbs

function TokenThumb({ size }: { size: number }) {
  const [tokens, setTokens] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setTokens((n) => n + 1 + Math.floor(Math.random() * 3));
      timer = setTimeout(tick, Math.random() < 0.15 ? 600 : 50 + Math.random() * 80);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return <TokenOrb tokens={tokens} size={size} label={null} />;
}

/** AskOrb's stage orb on its own, stepping through the stages. */
function StageThumb({ size }: { size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const orb = createStageOrb(canvas, size);
    const stages: AgentStage[] = ['thinking', 'searching', 'analyzing', 'composing'];
    let i = 0;
    const id = setInterval(() => orb.setStage(stages[++i % stages.length]), 1800);
    return () => {
      clearInterval(id);
      orb.destroy();
    };
  }, [size]);
  return <canvas ref={ref} aria-hidden="true" style={{ display: 'block', width: size, height: size }} />;
}

const THUMB_TOOLS: ToolCall[] = [
  { id: 'search', label: 'web_search', status: 'done' },
  { id: 'files', label: 'read_file', status: 'running' },
  { id: 'code', label: 'run_code', status: 'running' },
];
const THUMB_STEPS: ReasoningStep[] = THOUGHTS.slice(0, 6).map((label, i) => ({ id: String(i), label }));

function VisionThumb({ size }: { size: number }) {
  const src = useMemo(() => sceneImage('sunset'), []);
  return <VisionOrb src={src} status="done" focus={SCENE_FOCUS.sunset} size={size} showCaption={false} />;
}

function ReelThumb({ width }: { width: number }) {
  const frames = useMemo(() => reelFrames(10), []);
  const [progress, setProgress] = useState(0.1);
  useEffect(() => {
    const id = setInterval(() => setProgress((p) => (p >= 1 ? 0 : p + 0.01)), 80);
    return () => clearInterval(id);
  }, []);
  return <ReelOrb frames={frames} progress={progress} status="analyzing" width={width} height={Math.round(width * 0.6)} showCaption={false} />;
}

/** Small decorative previews used in lists; hidden from assistive tech by the caller. */
export const THUMBS: Record<string, (props: { size: number }) => ReactNode> = {
  'assistant-orb': ({ size }) => <AssistantOrb state="listening" size={size} getLevel={fakeVoice} label={null} />,
  'voice-orb': ({ size }) => <VoiceOrb size={size} getLevel={fakeVoice} label={null} />,
  'status-orb': ({ size }) => <StatusOrb variant="reasoning · twins" size={Math.round(size * 0.6)} label={null} />,
  'token-orb': ({ size }) => <TokenThumb size={Math.round(size * 0.45)} />,
  'tool-orb': ({ size }) => <ToolOrb tools={THUMB_TOOLS} size={size} showLabels={false} />,
  'ask-orb': ({ size }) => <StageThumb size={Math.round(size * 0.8)} />,
  'mascot-orb': ({ size }) => <MascotOrb size={size} label={null} />,
  'gaze-orb': ({ size }) => <GazeOrb size={Math.round(size * 0.8)} label={null} />,
  'search-orb': ({ size }) => <SearchOrb phase="ranking" sources={FOUND.slice(0, 7)} size={size} showCaption={false} />,
  'ingest-orb': ({ size }) => <IngestOrb name="report.pdf" progress={0.55} status="uploading" width={Math.round(size * 1.5)} height={size} showCaption={false} />,
  'reasoning-orb': ({ size }) => <ReasoningOrb steps={THUMB_STEPS} budget={0.45} size={size} showCaption={false} />,
  'vision-orb': ({ size }) => <VisionThumb size={size} />,
  'reel-orb': ({ size }) => <ReelThumb width={Math.round(size * 1.5)} />,
};
