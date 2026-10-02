import { ReactNode, StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AskHandler,
  captureFrames,
  AskOrb,
  GazeOrb,
  GazeOrbRef,
  IngestOrb,
  IngestStatus,
  ASSISTANT_COLORS,
  AssistantOrb,
  AssistantState,
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
} from '../src/orbs';
import { reelFrames, Scene, SCENE_FOCUS, sceneImage } from './samples';
import { Playground } from './playground/Playground';
import { VoiceAssistant } from './voice-assistant/VoiceAssistant';
import './demo.css';

const SECTIONS = [
  { id: 'playground', name: 'Playground' },
  { id: 'voice-assistant', name: 'Voice assistant' },
  { id: 'status', name: 'StatusOrb' },
  { id: 'gaze', name: 'GazeOrb' },
  { id: 'mascot', name: 'MascotOrb' },
  { id: 'voice', name: 'VoiceOrb' },
  { id: 'assistant', name: 'AssistantOrb' },
  { id: 'token', name: 'TokenOrb' },
  { id: 'tool', name: 'ToolOrb' },
  { id: 'search', name: 'SearchOrb' },
  { id: 'ingest', name: 'IngestOrb' },
  { id: 'reasoning', name: 'ReasoningOrb' },
  { id: 'vision', name: 'VisionOrb' },
  { id: 'reel', name: 'ReelOrb' },
  { id: 'ask', name: 'AskOrb' },
];

function Section({ id, name, blurb, code, children }: { id: string; name: string; blurb: string; code?: string; children: ReactNode }) {
  return (
    <section id={id} className="section">
      <header className="section-head">
        <h2>{name}</h2>
        <p>{blurb}</p>
      </header>
      {children}
      {code && (
        <pre className="code">
          <code>{code}</code>
        </pre>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ StatusOrb

function StatusDemo() {
  const flow = ['working', 'reasoning', 'searching', 'compacting', 'retrying', 'waiting'] as const;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % flow.length), 3200);
    return () => clearInterval(id);
  }, [flow.length]);

  return (
    <div className="panel">
      <div className="status-live">
        <StatusOrb variant={flow[i]} size={22} label={null} />
        <span>{flow[i]}…</span>
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

// -------------------------------------------------------------------- GazeOrb

function GazeDemo() {
  const ref = useRef<GazeOrbRef>(null);
  return (
    <div className="panel panel-center panel-black">
      <GazeOrb ref={ref} size={220} />
      <div className="hint">Move your pointer anywhere on the page</div>
      <div className="actions">
        <button className="btn" onClick={() => ref.current?.blink()}>
          Blink
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ MascotOrb

function MascotDemo() {
  const ref = useRef<MascotOrbRef>(null);
  return (
    <div className="panel panel-center">
      <MascotOrb ref={ref} size={240} />
      <div className="hint">Click the bubble</div>
      <div className="actions">
        <button className="btn" onClick={() => ref.current?.blink()}>
          Blink
        </button>
        <button className="btn" onClick={() => ref.current?.bounce()}>
          Bounce
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- VoiceOrb

const fakeVoice = () => {
  const t = performance.now() / 1000;
  const syllables = Math.max(0, Math.sin(t * 9) * Math.sin(t * 2.3 + 1));
  return syllables * (Math.sin(t * 0.7) > -0.3 ? 0.9 : 0);
};

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
    </svg>
  );
}

function VoiceDemo() {
  const mic = useMicrophone();
  const [simulate, setSimulate] = useState(false);
  return (
    <div className="panel panel-center">
      <div className="voice-stage">
        <VoiceOrb size={380} stream={mic.stream} getLevel={simulate ? fakeVoice : undefined} />
      </div>
      <div className="actions">
        <button className="btn btn-primary" onClick={mic.toggle} aria-pressed={mic.recording} disabled={mic.pending}>
          <MicIcon />
          {mic.pending ? 'Waiting for microphone…' : mic.recording ? 'Stop Recording' : 'Start Recording'}
        </button>
        <button className="btn" aria-pressed={simulate} onClick={() => setSimulate((s) => !s)} disabled={mic.recording}>
          {simulate ? 'Stop simulation' : 'Simulate voice'}
        </button>
      </div>
      <div className="hint" role="status">
        {mic.error ?? 'Speak to see the orb respond to your voice with subtle movements.'}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- AssistantOrb

const ASSISTANT_STATES: AssistantState[] = ['idle', 'connecting', 'listening', 'thinking', 'speaking', 'interrupted', 'muted', 'error'];

function AssistantDemo() {
  const [state, setState] = useState<AssistantState>('idle');
  const mic = useMicrophone();
  return (
    <div className="panel panel-center panel-black">
      <div className="segmented" role="radiogroup" aria-label="Assistant state">
        {ASSISTANT_STATES.map((s) => (
          <button key={s} role="radio" aria-checked={state === s} onClick={() => setState(s)}>
            <span className="swatch" style={{ background: ASSISTANT_COLORS[s] }} />
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <div className="voice-stage">
        <AssistantOrb state={state} size={340} stream={mic.stream} />
      </div>
      <div className="assistant-caption" style={{ color: ASSISTANT_COLORS[state] }} aria-live="polite">
        {state}
      </div>
      <div className="actions">
        <button className="btn" onClick={mic.toggle} aria-pressed={mic.recording} disabled={mic.pending}>
          <MicIcon />
          {mic.pending ? 'Waiting for microphone…' : mic.recording ? 'Microphone on' : 'Use microphone'}
        </button>
      </div>
      <div className="hint" role="status">
        {mic.error ?? 'Without audio, Speaking uses a built-in voice pattern. Turn the mic on to drive Listening with your voice.'}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- TokenOrb

const REPLY =
  'Sure — here is a quick summary. The fleet logged 1,284 trips this week, up 6% on last week. ' +
  'Fuel spend fell 3% thanks to shorter idle times, and two vehicles are due for service on Friday.';
type Pace = 'steady' | 'bursty' | 'slow';

function TokenDemo() {
  const [pace, setPace] = useState<Pace>('bursty');
  const [text, setText] = useState('');
  const [tokens, setTokens] = useState(0);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const words = REPLY.split(' ').map((w, k, all) => (k < all.length - 1 ? w + ' ' : w));
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    setText('');
    setTokens(0);
    setDone(false);
    const next = () => {
      if (i >= words.length) return setDone(true);
      // chunks of 1–3 words, with pauses that depend on the pace
      const n = pace === 'slow' ? 1 : 1 + Math.floor(Math.random() * 3);
      const chunk = words.slice(i, i + n).join('');
      i += n;
      setText((t) => t + chunk);
      setTokens((c) => c + n);
      const gap = pace === 'steady' ? 70 : pace === 'slow' ? 260 : Math.random() < 0.15 ? 600 : 40 + Math.random() * 60;
      timer = setTimeout(next, gap);
    };
    timer = setTimeout(next, 900); // time to first token
    return () => clearTimeout(timer);
  }, [pace, run]);

  return (
    <div className="panel">
      <div className="chat">
        <div className="bubble bubble-user">How did the fleet do this week?</div>
        <div className="bubble bubble-ai">
          <TokenOrb tokens={tokens} done={done} size={20} />
          <span>{text || <span className="muted-text">Thinking…</span>}</span>
        </div>
      </div>
      <div className="actions" style={{ marginTop: 24 }}>
        <div className="segmented" role="radiogroup" aria-label="Streaming pace" style={{ marginBottom: 0 }}>
          {(['bursty', 'steady', 'slow'] as Pace[]).map((p) => (
            <button key={p} role="radio" aria-checked={pace === p} onClick={() => setPace(p)}>
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => setRun((r) => r + 1)}>
          Replay
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- ToolOrb

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

function ToolDemo() {
  const [tools, setTools] = useState<ToolCall[]>([]);
  const [run, setRun] = useState(0);

  useEffect(() => {
    setTools([]);
    const timers = AGENT_PLAN.map((step) =>
      setTimeout(() => {
        setTools((list) => {
          const found = list.find((t) => t.id === step.id);
          if (found) return list.map((t) => (t.id === step.id ? { ...t, status: step.status } : t));
          return [...list, { id: step.id, label: step.label, status: step.status }];
        });
      }, step.at)
    );
    return () => timers.forEach(clearTimeout);
  }, [run]);

  return (
    <div className="panel panel-center">
      <ToolOrb tools={tools} size={220} />
      <div className="actions">
        <button className="btn" onClick={() => setRun((r) => r + 1)}>
          Run agent again
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ SearchOrb

const FOUND: SearchSource[] = [
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

  useEffect(() => {
    setSources([]);
    setPhase('searching');
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (run.empty) {
      at(2400, () => setPhase('empty'));
    } else {
      let ms = 500;
      FOUND.forEach((src) => {
        ms += 220 + Math.random() * 260;
        at(ms, () => setSources((list) => [...list, src]));
      });
      at(ms + 900, () => setPhase('ranking'));
      at(ms + 2500, () => setPhase('synthesizing'));
      at(ms + 5000, () => setPhase('done'));
    }
    return () => timers.forEach(clearTimeout);
  }, [run]);

  return (
    <div className="panel panel-center">
      <SearchOrb phase={phase} sources={sources} size={300} />
      <div className="actions">
        <button className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, empty: false }))}>
          Search again
        </button>
        <button className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, empty: true }))}>
          Search with no results
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ IngestOrb

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

  return (
    <div className="panel panel-center">
      <div className="segmented" role="radiogroup" aria-label="Sample file">
        {SAMPLE_FILES.map((f) => (
          <button key={f} role="radio" aria-checked={name === f} onClick={() => setName(f)}>
            {f}
          </button>
        ))}
      </div>
      <IngestOrb name={name} progress={progress} status={status} width={380} height={220} />
      <div className="actions">
        <button className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, fail: false }))}>
          Upload again
        </button>
        <button className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, fail: true }))}>
          Simulate failure
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
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
      <div className="hint">Picking a file only uses its name to choose the card type — nothing is uploaded.</div>
    </div>
  );
}

// --------------------------------------------------------------- ReasoningOrb

const THOUGHTS = [
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

  useEffect(() => {
    const total = run.long ? 12 : 7;
    const finalBudget = run.long ? 0.94 : 0.62;
    setSteps([]);
    setThinking(true);
    setBudget(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let ms = 300;
    for (let k = 0; k < total; k++) {
      ms += 650 + Math.random() * 500;
      const label = run.long ? THOUGHTS[k] : THOUGHTS[[0, 1, 2, 3, 4, 5, 10][k]];
      timers.push(
        setTimeout(() => {
          setSteps((list) => [...list, { id: `${run.n}-${k}`, label }]);
          setBudget(((k + 1) / total) * finalBudget);
        }, ms)
      );
    }
    timers.push(setTimeout(() => setThinking(false), ms + 1200));
    return () => timers.forEach(clearTimeout);
  }, [run]);

  return (
    <div className="panel panel-center">
      <ReasoningOrb steps={steps} thinking={thinking} budget={budget} size={300} />
      <div className="actions">
        <button className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, long: false }))}>
          Reason again
        </button>
        <button className="btn" onClick={() => setRun((r) => ({ n: r.n + 1, long: true }))}>
          Long run (near budget)
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ VisionOrb

function VisionDemo() {
  const scenes = useMemo(() => ({ sunset: sceneImage('sunset'), lake: sceneImage('lake') }), []);
  const [scene, setScene] = useState<Scene | 'custom'>('sunset');
  const [custom, setCustom] = useState<string | null>(null);
  const [status, setStatus] = useState<VisionStatus>('loading');
  const [run, setRun] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const src = scene === 'custom' ? custom : scenes[scene];

  useEffect(() => {
    setStatus('loading');
    const a = setTimeout(() => setStatus('scanning'), 600);
    const b = setTimeout(() => setStatus('done'), 600 + 3400);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [src, run]);
  useEffect(() => () => void (custom && URL.revokeObjectURL(custom)), [custom]);

  return (
    <div className="panel panel-center">
      <div className="segmented" role="radiogroup" aria-label="Sample image">
        {(['sunset', 'lake'] as Scene[]).map((sc) => (
          <button key={sc} role="radio" aria-checked={scene === sc} onClick={() => setScene(sc)}>
            {sc === 'sunset' ? 'Sunset' : 'Lake at night'}
          </button>
        ))}
        {custom && (
          <button role="radio" aria-checked={scene === 'custom'} onClick={() => setScene('custom')}>
            Your image
          </button>
        )}
      </div>
      <VisionOrb src={src} status={status} focus={scene === 'custom' ? [] : SCENE_FOCUS[scene]} size={320} />
      <div className="actions">
        <button className="btn" onClick={() => setRun((r) => r + 1)}>
          Scan again
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
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
      <div className="hint">Your image stays in the browser — it is never uploaded.</div>
    </div>
  );
}

// -------------------------------------------------------------------- ReelOrb

function ReelDemo() {
  const sample = useMemo(() => reelFrames(12), []);
  const [frames, setFrames] = useState<string[]>(sample);
  const [status, setStatus] = useState<ReelStatus>('loading');
  const [progress, setProgress] = useState(0);
  const [run, setRun] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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
  }, [frames, run]);

  return (
    <div className="panel panel-center">
      <ReelOrb frames={frames} progress={progress} status={status} width={460} height={270} />
      <div className="actions">
        <button className="btn" onClick={() => setRun((r) => r + 1)}>
          Watch again
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
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
              setFrames(await captureFrames(f, 12));
            } catch {
              setStatus('error');
            }
          }}
        />
      </div>
      <div className="hint">Frames from your video are captured in the browser with captureFrames() — nothing is uploaded.</div>
    </div>
  );
}

// --------------------------------------------------------------------- AskOrb

const failingAgent: AskHandler = async (_q, report, signal) => {
  await new Promise((r) => setTimeout(r, 1500));
  if (signal.aborted) return null;
  report('searching');
  await new Promise((r) => setTimeout(r, 1200));
  throw new Error('The search service did not respond. Please try again.');
};

function AskDemo() {
  const [fail, setFail] = useState(false);
  return (
    <>
      <div className="segmented" role="radiogroup" aria-label="Agent outcome">
        <button role="radio" aria-checked={!fail} onClick={() => setFail(false)}>
          Answer
        </button>
        <button role="radio" aria-checked={fail} onClick={() => setFail(true)}>
          Error
        </button>
      </div>
      <div className="panel panel-ask">
        <AskOrb style={{ height: '100%' }} onAsk={fail ? failingAgent : undefined} />
      </div>
    </>
  );
}

// ----------------------------------------------------------------------- page

function App() {
  return (
    <div className="page">
      <header className="hero">
        <StatusOrb variant="reasoning · twins" size={44} label={null} />
        <h1>Orbs</h1>
        <p>Animated presence for AI interfaces — thirteen React components, no dependencies beyond React.</p>
        <nav className="nav">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.name}
            </a>
          ))}
        </nav>
      </header>

      <Section
        id="playground"
        name="Playground"
        blurb="Pick an orb, change any option and see it live. The code underneath updates as you go — copy it straight into your app."
      >
        <Playground />
      </Section>

      <Section
        id="voice-assistant"
        name="Voice assistant sample"
        blurb="A working voice assistant built on AssistantOrb and the browser's own speech recognition and speech synthesis — no backend. Talk to it, interrupt it, mute it."
        code={`// demo/voice-assistant/ — copy the folder, then plug in your model:\n<VoiceAssistant respond={(text, signal) => callYourModel(text, { signal })} />`}
      >
        <VoiceAssistant />
      </Section>

      <Section
        id="status"
        name="StatusOrb"
        blurb="Dot-sphere indicators for what an agent is doing. Fifteen variants; switch them in place as the status changes."
        code={`<StatusOrb variant="reasoning" size={24} />`}
      >
        <StatusDemo />
      </Section>

      <Section
        id="gaze"
        name="GazeOrb"
        blurb="A face on a sphere that turns toward the pointer in 3D and blinks now and then."
        code={`const orb = useRef<GazeOrbRef>(null);\n<GazeOrb ref={orb} size={220} />   // orb.current?.blink()`}
      >
        <GazeDemo />
      </Section>

      <Section
        id="mascot"
        name="MascotOrb"
        blurb="A glossy bubble character with staggered blinks, a glance toward the pointer and a jelly bounce when pressed."
        code={`<MascotOrb ref={mascot} size={240} color="#5f9ae6" />   // mascot.current?.bounce()`}
      >
        <MascotDemo />
      </Section>

      <Section
        id="voice"
        name="VoiceOrb"
        blurb="A glowing ring that breathes with audio — the microphone, a TTS stream, or any level you supply."
        code={`const mic = useMicrophone();\n<VoiceOrb stream={mic.stream} />   // or getLevel={() => level}`}
      >
        <VoiceDemo />
      </Section>

      <Section
        id="assistant"
        name="AssistantOrb"
        blurb="A dot sphere for voice assistants. Each state has its own colour and motion — idle, connecting, listening, thinking, speaking, interrupted, muted, error — and it moves with the audio."
        code={`<AssistantOrb state="listening" stream={mic.stream} />\n// idle · connecting · listening · thinking · speaking · interrupted · muted · error`}
      >
        <AssistantDemo />
      </Section>

      <Section
        id="token"
        name="TokenOrb"
        blurb="A tiny inline orb for chat replies. It pulses with every streamed chunk, so its motion is the real streaming speed — and settles green when the reply is done."
        code={`<TokenOrb tokens={tokenCount} done={!streaming} size={20} />\n// or call ref.current.push(n) for each streamed chunk`}
      >
        <TokenDemo />
      </Section>

      <Section
        id="tool"
        name="ToolOrb"
        blurb="One satellite per tool call. Running tools orbit the core; finished ones spiral in and dock with a flash; failed ones turn red and fall away."
        code={`<ToolOrb tools={[\n  { id: 'search', label: 'web_search', status: 'running' },   // running · done · error\n]} />`}
      >
        <ToolDemo />
      </Section>

      <Section
        id="search"
        name="SearchOrb"
        blurb="For AI search. Each source flies in and joins the orbit; ranking pulls the best ones closer; synthesis absorbs them into the core, best first."
        code={`<SearchOrb phase="searching" sources={[{ id: '1', domain: 'arxiv.org', score: 0.9 }]} />\n// idle · searching · ranking · synthesizing · done · empty`}
      >
        <SearchDemo />
      </Section>

      <Section
        id="ingest"
        name="IngestOrb"
        blurb="For file, image, video and audio uploads. The file card breaks into dots that arc into the sphere as real progress rises, then the sphere reads it."
        code={`<IngestOrb name="report.pdf" progress={0.42} status="uploading" />\n// uploading · reading · done · error — the card type comes from the file name`}
      >
        <IngestDemo />
      </Section>

      <Section
        id="reasoning"
        name="ReasoningOrb"
        blurb="For deep reasoning. Each step adds a node that links to the last one and its nearest earlier thought; the outer arc shows how much of the thinking budget is used."
        code={`<ReasoningOrb steps={[{ id: '1', label: 'Comparing fuel costs' }]} thinking budget={0.4} />`}
      >
        <ReasoningDemo />
      </Section>

      <Section
        id="vision"
        name="VisionOrb"
        blurb="For image understanding. The picture is seen through a turning dot sphere; a scan line reveals its colours, then detected things pulse with labels."
        code={`<VisionOrb src={imageUrl} status="scanning" focus={[{ x: 0.66, y: 0.38, label: 'sun' }]} />\n// loading · scanning · done · error`}
      >
        <VisionDemo />
      </Section>

      <Section
        id="reel"
        name="ReelOrb"
        blurb="For video understanding. Frames orbit like a film strip; the one being watched swings to the front and beams into the core."
        code={`const frames = await captureFrames(videoFile, 12);\n<ReelOrb frames={frames} progress={0.4} status="analyzing" />`}
      >
        <ReelDemo />
      </Section>

      <Section
        id="ask"
        name="AskOrb"
        blurb="The whole flow: prompt bar → thinking orb with live stages → answer card. Drive the stages from your agent."
        code={`<AskOrb onAsk={async (question, report, signal) => {\n  report('searching');\n  …\n  return answer;\n}} />`}
      >
        <AskDemo />
      </Section>

      <footer className="footer">
        <code>{`import { StatusOrb, GazeOrb, MascotOrb, VoiceOrb, AssistantOrb, TokenOrb, ToolOrb, SearchOrb, IngestOrb, ReasoningOrb, VisionOrb, ReelOrb, AskOrb } from './orbs';`}</code>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
