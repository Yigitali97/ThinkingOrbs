// Ask and answer example: AskOrb wired to an agent that reports its stages.

import { useState } from 'react';
import { AskHandler, AskOrb } from '../../src/orbs';
import { Segmented } from '../site/ui';

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(id), reject(new DOMException('Aborted', 'AbortError'))), { once: true });
  });

/** Stands in for your agent: reports each stage, then answers with React content. */
export const exampleAgent: AskHandler = async (question, report, signal) => {
  await wait(900, signal);
  report('searching');
  await wait(1400, signal);
  report('analyzing');
  await wait(1200, signal);
  report('composing');
  await wait(900, signal);
  return (
    <div>
      <p style={{ margin: '0 0 8px' }}>
        You asked: <q>{question}</q>
      </p>
      <p style={{ margin: 0 }}>
        This answer came from a stand-in agent. Replace <code>exampleAgent</code> with a call to your model and keep the <code>report()</code> calls where
        your agent changes stage.
      </p>
    </div>
  );
};

export const failingAgent: AskHandler = async (_q, report, signal) => {
  await wait(1400, signal);
  report('searching');
  await wait(1200, signal);
  throw new Error('The search service did not respond. Try again in a moment.');
};

export function AskFlow() {
  const [outcome, setOutcome] = useState<'answer' | 'error'>('answer');
  return (
    <div className="ask-flow">
      <Segmented
        label="Agent outcome"
        options={['answer', 'error'] as const}
        value={outcome}
        onChange={setOutcome}
        render={(o) => (o === 'answer' ? 'Answers' : 'Fails while searching')}
      />
      <div className="demo-ask">
        <AskOrb key={outcome} style={{ height: '100%' }} onAsk={outcome === 'answer' ? exampleAgent : failingAgent} />
      </div>
    </div>
  );
}
