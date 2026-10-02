import { CSSProperties, ReactNode, useEffect, useState } from 'react';
import { AssistantOrb, ReasoningOrb, SearchOrb, ToolCall, ToolOrb } from '../../../src/orbs';
import { fakeVoice, FOUND, THOUGHTS } from '../demos';
import { Link } from '../router';
import { COMPONENTS, EXAMPLES } from '../routes';
import { CodeBlock, usePrefersReducedMotion } from '../ui';

const HERO_TOOLS: ToolCall[] = [
  { id: 'weather', label: 'weather.forecast', status: 'done' },
  { id: 'hotels', label: 'hotels.search', status: 'running' },
  { id: 'fx', label: 'currency.convert', status: 'running' },
];
const HERO_STEPS = THOUGHTS.slice(0, 7).map((label, i) => ({ id: String(i), label }));

const MOMENTS: Array<{ key: string; label: string; orb: string; tint: string; render: () => ReactNode }> = [
  { key: 'listening', label: 'Listening', orb: 'AssistantOrb', tint: '#3b8bff', render: () => <AssistantOrb state="listening" size={300} getLevel={fakeVoice} /> },
  { key: 'thinking', label: 'Thinking', orb: 'ReasoningOrb', tint: '#ff9a2e', render: () => <ReasoningOrb steps={HERO_STEPS} budget={0.42} size={300} showCaption={false} /> },
  { key: 'searching', label: 'Searching', orb: 'SearchOrb', tint: '#a78bfa', render: () => <SearchOrb phase="ranking" sources={FOUND} size={300} showCaption={false} /> },
  { key: 'tools', label: 'Using tools', orb: 'ToolOrb', tint: '#38bdf8', render: () => <ToolOrb tools={HERO_TOOLS} size={260} showLabels={false} /> },
  { key: 'speaking', label: 'Speaking', orb: 'AssistantOrb', tint: '#34d399', render: () => <AssistantOrb state="speaking" size={300} /> },
];

function HeroStage() {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || reduced) return;
    const id = setInterval(() => setI((n) => (n + 1) % MOMENTS.length), 4200);
    return () => clearInterval(id);
  }, [auto, reduced]);
  const m = MOMENTS[i];
  const slug = COMPONENTS.find((c) => c.name === m.orb)!.slug;

  return (
    <div className="hero-stage" style={{ '--tint': m.tint } as CSSProperties}>
      <div className="hero-orb" key={m.key}>
        {m.render()}
      </div>
      <p className="hero-caption" aria-live="polite">
        <span className="hero-caption-state">{m.label}</span>
        <Link to={`/components/${slug}`}>{m.orb}</Link>
      </p>
      <div className="hero-moments" role="group" aria-label="Show a moment">
        {MOMENTS.map((x, k) => (
          <button
            key={x.key}
            type="button"
            aria-pressed={k === i}
            style={{ '--dot': x.tint } as CSSProperties}
            onClick={() => {
              setI(k);
              setAuto(false);
            }}
          >
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const SITUATIONS: Array<{ situation: string; slugs: string[]; driver: string }> = [
  { situation: 'A voice assistant conversation', slugs: ['assistant-orb'], driver: 'state and audio' },
  { situation: 'Voice level while recording', slugs: ['voice-orb'], driver: 'audio' },
  { situation: 'A small "working" indicator', slugs: ['status-orb'], driver: 'one of 15 variants' },
  { situation: 'A streaming chat reply', slugs: ['token-orb'], driver: 'streamed tokens' },
  { situation: 'An agent calling tools', slugs: ['tool-orb'], driver: 'the list of tool calls' },
  { situation: 'A complete ask-to-answer flow', slugs: ['ask-orb'], driver: "your agent's stages" },
  { situation: 'A persona or mascot', slugs: ['mascot-orb', 'gaze-orb'], driver: 'pointer and clicks' },
  { situation: 'AI search', slugs: ['search-orb'], driver: 'phase and the sources found' },
  { situation: 'A file upload', slugs: ['ingest-orb'], driver: 'upload progress' },
  { situation: 'Deep reasoning', slugs: ['reasoning-orb'], driver: 'reasoning steps and budget' },
  { situation: 'Understanding an image', slugs: ['vision-orb'], driver: 'the image and focus points' },
  { situation: 'Understanding a video', slugs: ['reel-orb'], driver: 'video frames and progress' },
];

const QUICKSTART = `// 1. Copy src/orbs/ into your app (or only the orbs you need, plus shared/)
// 2. Import from the folder's entry point
import { StatusOrb, TokenOrb, SearchOrb } from './orbs';

<StatusOrb variant="reasoning" size={24} />
<TokenOrb tokens={tokenCount} done={!streaming} />
<SearchOrb phase="searching" sources={sources} />`;

export function Home() {
  return (
    <div className="page page-home">
      <section className="hero">
        <div className="hero-copy">
          <h1>Show what your AI is doing.</h1>
          <p className="lede">
            Thirteen animated React components for AI interfaces. Each orb is drawn on a canvas and moves with real data: the audio level, streamed tokens,
            tool calls, sources, upload progress and reasoning steps.
          </p>
          <div className="actions actions-start">
            <Link to="/components" className="btn btn-primary">
              Browse components
            </Link>
            <Link to="/playground" className="btn">
              Open the playground
            </Link>
          </div>
          <p className="fine">React 17+ and TypeScript. No dependencies beyond React. Works with Vite, Create React App and Next.js.</p>
        </div>
        <HeroStage />
      </section>

      <section className="home-section" aria-labelledby="h-situations">
        <h2 id="h-situations">Pick an orb by situation</h2>
        <ul className="situations">
          {SITUATIONS.map((s) => (
            <li key={s.situation}>
              <span className="situation">{s.situation}</span>
              <span className="situation-orbs">
                {s.slugs.map((slug) => {
                  const meta = COMPONENTS.find((c) => c.slug === slug)!;
                  return (
                    <Link key={slug} to={`/components/${slug}`} className="situation-orb">
                      <span className="swatch" style={{ background: meta.tint }} aria-hidden="true" />
                      <span>{meta.name}</span>
                    </Link>
                  );
                })}
              </span>
              <span className="situation-driver">Moves with {s.driver}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-section" aria-labelledby="h-examples">
        <h2 id="h-examples">See them working together</h2>
        <div className="example-list">
          {EXAMPLES.map((e) => (
            <Link key={e.slug} to={`/examples/${e.slug}`} className="example-card" style={{ '--tint': e.tint } as CSSProperties}>
              <h3>{e.name}</h3>
              <p>{e.summary}</p>
              <span className="uses">{e.uses.slice(0, 4).join(', ') + (e.uses.length > 4 ? ` and ${e.uses.length - 4} more` : '')}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section" aria-labelledby="h-start">
        <h2 id="h-start">Get started</h2>
        <p className="section-lede">
          There is no package to install. Copy the <code>src/orbs/</code> folder into your project and import from it. Two orbs, AskOrb and ToolOrb, import a
          stylesheet of their own; Vite, Create React App and the Next.js App Router handle that as-is.
        </p>
        <CodeBlock code={QUICKSTART} title="App.tsx" />
      </section>
    </div>
  );
}
