import { ReactNode, StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AskHandler,
  AskOrb,
  GazeOrb,
  GazeOrbRef,
  MascotOrb,
  MascotOrbRef,
  STATUS_VARIANTS,
  StatusOrb,
  useMicrophone,
  VoiceOrb,
} from '../src/orbs';
import './demo.css';

const SECTIONS = [
  { id: 'status', name: 'StatusOrb' },
  { id: 'gaze', name: 'GazeOrb' },
  { id: 'mascot', name: 'MascotOrb' },
  { id: 'voice', name: 'VoiceOrb' },
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
        <p>Animated presence for AI interfaces — five React components, no dependencies beyond React.</p>
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
        id="ask"
        name="AskOrb"
        blurb="The whole flow: prompt bar → thinking orb with live stages → answer card. Drive the stages from your agent."
        code={`<AskOrb onAsk={async (question, report, signal) => {\n  report('searching');\n  …\n  return answer;\n}} />`}
      >
        <AskDemo />
      </Section>

      <footer className="footer">
        <code>{`import { StatusOrb, GazeOrb, MascotOrb, VoiceOrb, AskOrb } from './orbs';`}</code>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
