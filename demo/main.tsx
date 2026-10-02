import { ReactNode, StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AskHandler,
  AskOrb,
  GazeOrb,
  GazeOrbRef,
  ASSISTANT_COLORS,
  AssistantOrb,
  AssistantState,
  MascotOrb,
  MascotOrbRef,
  SearchOrb,
  SearchPhase,
  SearchSource,
  STATUS_VARIANTS,
  StatusOrb,
  TokenOrb,
  ToolCall,
  ToolOrb,
  useMicrophone,
  VoiceOrb,
} from '../src/orbs';
import './demo.css';

const SECTIONS = [
  { id: 'status', name: 'StatusOrb' },
  { id: 'gaze', name: 'GazeOrb' },
  { id: 'mascot', name: 'MascotOrb' },
  { id: 'voice', name: 'VoiceOrb' },
  { id: 'assistant', name: 'AssistantOrb' },
  { id: 'token', name: 'TokenOrb' },
  { id: 'tool', name: 'ToolOrb' },
  { id: 'search', name: 'SearchOrb' },
  { id: 'ask', name: 'AskOrb' },
];

function Section({ id, name, blurb, code, children }: { id: string; name: string; blurb: string; code: string; children: ReactNode }) {
  return (
    <section id={id} className="section">
      <header className="section-head">
        <h2>{name}</h2>
        <p>{blurb}</p>
      </header>
      {children}
      <pre className="code">
        <code>{code}</code>
      </pre>
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
        <p>Animated presence for AI interfaces — nine React components, no dependencies beyond React.</p>
        <nav className="nav">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.name}
            </a>
          ))}
        </nav>
      </header>

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
        id="ask"
        name="AskOrb"
        blurb="The whole flow: prompt bar → thinking orb with live stages → answer card. Drive the stages from your agent."
        code={`<AskOrb onAsk={async (question, report, signal) => {\n  report('searching');\n  …\n  return answer;\n}} />`}
      >
        <AskDemo />
      </Section>

      <footer className="footer">
        <code>{`import { StatusOrb, GazeOrb, MascotOrb, VoiceOrb, AssistantOrb, TokenOrb, ToolOrb, SearchOrb, AskOrb } from './orbs';`}</code>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
