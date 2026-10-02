// Loaded on demand: the examples are the heaviest part of the site.

import { ReactNode } from 'react';
import { ChatApp } from '../../chat-app/ChatApp';
import { AgentRun } from '../../examples/AgentRun';
import { AskFlow } from '../../examples/AskFlow';
import { VoiceAssistant } from '../../voice-assistant/VoiceAssistant';
import { Link } from '../router';
import { ExampleMeta, EXAMPLES } from '../routes';
import { CodeBlock } from '../ui';
import { slugFor } from './Examples';

interface Detail {
  render: () => ReactNode;
  folder: string;
  code: string;
  notes: string[];
}

const DETAILS: Record<string, Detail> = {
  'chat-app': {
    render: () => <ChatApp />,
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

export function ExamplePage({ meta }: { meta: ExampleMeta }) {
  const d = DETAILS[meta.slug];
  const i = EXAMPLES.indexOf(meta);
  const next = EXAMPLES[(i + 1) % EXAMPLES.length];
  return (
    <div className="page">
      <header className="page-head">
        <p className="crumb">
          <Link to="/examples">Examples</Link>
        </p>
        <h1>{meta.name}</h1>
        <p className="lede">{meta.summary}</p>
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

      <section className="example-live" aria-label={`${meta.name}, live`}>
        {d.render()}
      </section>

      <div className="example-detail">
        <section aria-labelledby="ex-how">
          <h2 id="ex-how">Use it in your app</h2>
          <CodeBlock code={d.code} title={d.folder} />
        </section>
        <section aria-labelledby="ex-notes">
          <h2 id="ex-notes">Good to know</h2>
          <ul className="notes">
            {d.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      </div>

      <nav className="pager" aria-label="More examples">
        <span />
        <Link to={`/examples/${next.slug}`} className="pager-next">
          <span>Next example</span>
          {next.name}
        </Link>
      </nav>
    </div>
  );
}
