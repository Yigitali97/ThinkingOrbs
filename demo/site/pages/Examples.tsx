// All the examples on one page. Loaded on demand: they are the heaviest part
// of the site. Each example mounts only once it comes near the screen, so the
// page starts light and an example starts running when you get to it.

import { CSSProperties, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChatApp } from '../../chat-app/ChatApp';
import { AgentRun } from '../../examples/AgentRun';
import { AskFlow } from '../../examples/AskFlow';
import { VoiceAssistant } from '../../voice-assistant/VoiceAssistant';
import { Link, useLocation } from '../router';
import { COMPONENTS, ExampleMeta, EXAMPLES } from '../routes';
import { CodeBlock } from '../ui';

const slugFor = (name: string) => COMPONENTS.find((c) => c.name === name)?.slug;

interface Detail {
  render: () => ReactNode;
  /** space kept for the example before it mounts, so the page doesn't jump */
  height: number;
  folder: string;
  code: string;
  notes: string[];
}

const DETAILS: Record<string, Detail> = {
  'chat-app': {
    render: () => <ChatApp />,
    height: 780,
    folder: 'demo/chat-app/',
    code: `// Copy demo/chat-app/, then map your model's stream onto agent events
<ChatApp
  agent={async ({ text, attachments }, emit, signal) => {
    emit({ type: 'thinking', label: 'Planning', budget: 0.2 });                   // ReasoningOrb
    emit({ type: 'search', phase: 'searching', sources: [] });                     // SearchOrb
    emit({ type: 'tool', id: 'calc', label: 'calculator', status: 'running' });   // ToolOrb
    emit({ type: 'ingest', name: 'report.pdf', progress: 1, status: 'reading' }); // IngestOrb
    emit({ type: 'vision', status: 'scanning', src: imageUrl });                  // VisionOrb
    emit({ type: 'reel', frames, progress: 0.5, status: 'analyzing' });           // ReelOrb
    emit({ type: 'text', delta: 'Here is what I found…' });                       // TokenOrb
  }}
/>`,
    notes: [
      'Use the hints under the message box to try each use case. The file, image and video ones come with built-in samples.',
      'The demo agent does real maths, budgets, file statistics and image and video colour analysis. Its web search is simulated, and it says so.',
      'The event protocol is in agent.ts; the activity timeline that turns events into what you see is in activity.ts and has its own tests.',
    ],
  },
  'voice-assistant': {
    render: () => <VoiceAssistant />,
    height: 620,
    folder: 'demo/voice-assistant/',
    code: `// Copy demo/voice-assistant/, then plug in your model
<VoiceAssistant respond={(text, signal) => callYourModel(text, { signal })} />`,
    notes: [
      'Tap the orb to start. Tap it again, or press Space, to interrupt while it speaks.',
      'Speech recognition works in Chrome, Edge and Safari. In other browsers the sample still answers typed messages aloud.',
      'Captions highlight each word as it is spoken.',
    ],
  },
  'agent-run': {
    render: () => <AgentRun />,
    height: 680,
    folder: 'demo/examples/',
    code: `// Show one orb per stage, then leave a one-line summary behind
{stage === 'thinking' && <ReasoningOrb steps={steps} budget={budget} />}
{stage === 'searching' && <SearchOrb phase={phase} sources={sources} />}
{stage === 'tools' && <ToolOrb tools={tools} />}
{answer && <TokenOrb tokens={tokens} done={stage === 'done'} />}`,
    notes: [
      'The run is a list of timed events (agentScript.ts). In your app those events come from the model stream instead.',
      'Only the orb for the current stage is mounted, so only one animation loop runs at a time.',
      'The header uses StatusOrb to name the current activity in a single line.',
    ],
  },
  'ask-flow': {
    render: () => <AskFlow />,
    height: 670,
    folder: 'demo/examples/',
    code: `<AskOrb
  style={{ height: '100vh' }}
  onAsk={async (question, report, signal) => {
    report('searching');
    const docs = await search(question, { signal });
    report('analyzing');
    report('composing');
    return await answer(docs); // a string or any React content
  }}
/>`,
    notes: [
      'Type a question and press Enter. Each stage stays on screen for at least minStageMs.',
      'Switch to "Fails while searching" to see the error card. Whatever your handler throws becomes its message.',
      'The handler receives an AbortSignal that fires if AskOrb unmounts mid-answer.',
    ],
  },
};

/** Mounts its children the first time they come near the screen, then keeps them. */
function MountWhenNear({ height, children }: { height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return setNear(true);
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNear(true);
        io.disconnect();
      }
    }, { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="example-live" style={{ minHeight: height }} data-mounted={near ? 'yes' : 'no'}>
      {near ? children : null}
    </div>
  );
}

function ExampleSection({ meta }: { meta: ExampleMeta }) {
  const d = DETAILS[meta.slug];
  return (
    <section id={meta.slug} className="example" aria-labelledby={`${meta.slug}-title`} style={{ '--tint': meta.tint } as CSSProperties}>
      <header className="example-head">
        <h2 id={`${meta.slug}-title`}>{meta.name}</h2>
        <p>{meta.summary}</p>
        <p className="uses-links">
          Uses{' '}
          {meta.uses.map((name, k) => (
            <span key={name}>
              <Link to={`/components/${slugFor(name)}`}>{name}</Link>
              {k < meta.uses.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      </header>

      <MountWhenNear height={d.height}>{d.render()}</MountWhenNear>

      <div className="example-detail">
        <div>
          <h3>Use it in your app</h3>
          <CodeBlock code={d.code} title={d.folder} />
        </div>
        <div>
          <h3>Good to know</h3>
          <ul className="notes">
            {d.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function ExamplesPage() {
  const { hash } = useLocation();
  // this page loads after the router has tried to scroll, so honour #anchors here too
  useLayoutEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Examples</h1>
        <p className="lede">Complete samples built from the orbs. Each one lives in its own folder under demo/, so you can copy it and plug in your model.</p>
        <nav className="toc" aria-label="Examples on this page">
          {EXAMPLES.map((e) => (
            <Link key={e.slug} to={`/examples#${e.slug}`} style={{ '--tint': e.tint } as CSSProperties}>
              {e.name}
            </Link>
          ))}
        </nav>
      </header>
      {EXAMPLES.map((e) => (
        <ExampleSection key={e.slug} meta={e} />
      ))}
    </div>
  );
}
