import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AskHandler, AskOrb } from '../src/ask-orb';

// Without onAsk, AskOrb plays its built-in demo sequence.
// Open with ?fail to preview the error path.
const fail = new URLSearchParams(location.search).has('fail');
const failingAgent: AskHandler = async (_q, report, signal) => {
  await new Promise((r) => setTimeout(r, 1500));
  if (signal.aborted) return null;
  report('searching');
  await new Promise((r) => setTimeout(r, 1200));
  throw new Error('The search service did not respond. Please try again.');
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AskOrb style={{ height: '100vh' }} onAsk={fail ? failingAgent : undefined} />
  </StrictMode>
);
