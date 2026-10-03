// All the examples on one page. Loaded on demand: they are the heaviest part
// of the site. Each example mounts only once it comes near the screen, so the
// page starts light and an example starts running when you get to it.

import { CSSProperties, ReactNode, useLayoutEffect, useRef } from 'react';
import { ChatApp } from '../../chat-app/ChatApp';
import { AgentRun } from '../../examples/AgentRun';
import { AskFlow } from '../../examples/AskFlow';
import { VoiceAssistant } from '../../voice-assistant/VoiceAssistant';
import { href, Link, useLocation } from '../router';
import { Prop } from '../docs';
import { COMPONENTS, ExampleMeta, EXAMPLES, SITE_LINKS } from '../routes';
import { MountWhenNear, useActiveSection, useKeepActiveInView } from '../sections';
import { CodeBlock, Disclosure } from '../ui';
import { PropsTable } from './Components';

const slugFor = (name: string) => COMPONENTS.find((c) => c.name === name)?.slug;

interface Detail {
  render: () => ReactNode;
  /** the example component's own props, when it has any */
  props?: Prop[];
  /** space kept for the example before it mounts, so the page doesn't jump */
  height: number;
  folder: string;
  code: string;
  notes: string[];
}

const DETAILS: Record<string, Detail> = {
  'chat-app': {
    render: () => <ChatApp />,
    props: [
      {
        name: 'agent',
        type: '(input, emit, signal) => Promise<void>',
        def: 'demo agent',
        about: 'Your model. input is { text, attachments }; call emit(event) as it works; signal aborts when the user stops the reply.',
      },
    ],
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
    props: [
      {
        name: 'respond',
        type: '(text, signal) => Promise<Reply>',
        def: 'local demo brain',
        about: 'Your model. Return the reply text, or { text, end: true } to end the conversation after speaking.',
      },
    ],
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

      <MountWhenNear height={d.height} className="example-live">{d.render()}</MountWhenNear>

      <Disclosure label={d.props ? 'Usage and props' : 'Usage'}>
        <CodeBlock code={d.code} title={d.folder} />
        {d.props && (
          <>
            <h3 id={`${meta.slug}-props`}>Props</h3>
            <PropsTable props={d.props} labelledBy={`${meta.slug}-props`} />
          </>
        )}
        <h3>Good to know</h3>
        <ul className="notes">
          {d.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}

const IDS = EXAMPLES.map((e) => e.slug);

function Sidebar({ active }: { active: string }) {
  const nav = useRef<HTMLElement>(null);
  useKeepActiveInView(nav, active);
  return (
    <nav ref={nav} className="sidebar sidebar-examples" aria-label="Examples">
      <div className="sidebar-group">
        <h2>Examples</h2>
        <ul>
          {EXAMPLES.map((e) => (
            <li key={e.slug}>
              <Link to={`/examples#${e.slug}`} style={{ '--tint': e.tint } as CSSProperties} aria-current={e.slug === active ? 'location' : undefined}>
                {e.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export function ExamplesPage() {
  const { hash } = useLocation();
  const active = useActiveSection(IDS);
  // this page loads after the router has tried to scroll, so honour #anchors here too
  useLayoutEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page page-docs page-sections page-examples">
      <Sidebar active={active} />
      <div className="doc">
        <header className="page-head">
          <h1>Examples</h1>
          <p className="lede">Complete samples built from the orbs. Each one lives in its own folder under demo/, so you can copy it and plug in your model.</p>
        </header>
        {EXAMPLES.map((e) => (
          <ExampleSection key={e.slug} meta={e} />
        ))}
        <section className="sites" aria-labelledby="full-sites-title">
          <h2 id="full-sites-title">Full sites</h2>
          <p>Whole products built on the orbs. They open as their own site, outside these docs.</p>
          <ul className="site-cards">
            {SITE_LINKS.map((l) => (
              <li key={l.name}>
                <a className="site-card" href={href(l.href)} style={{ '--tint': l.tint } as CSSProperties}>
                  <strong>{l.name}</strong>
                  <span>{l.summary}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
