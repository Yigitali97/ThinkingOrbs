import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ORB_VARIANTS, ThinkingOrb } from '../src/thinking-orbs';
import './demo.css';

function Gallery() {
  return (
    <main className="grid">
      {ORB_VARIANTS.map((variant) => (
        <figure key={variant}>
          <ThinkingOrb variant={variant} size={72} label={null} />
          <figcaption>{variant}</figcaption>
        </figure>
      ))}
    </main>
  );
}

// One orb switching state in place — how it would follow an agent's status.
function LiveStatus() {
  const flow = ['working', 'reasoning', 'searching', 'compacting', 'retrying', 'waiting'] as const;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % flow.length), 3200);
    return () => clearInterval(id);
  }, [flow.length]);

  return (
    <div className="status">
      <ThinkingOrb variant={flow[i]} size={22} label={null} />
      <span>{flow[i]}…</span>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <nav className="nav"><a href="/watching.html">Watching</a><a href="/bubble.html">Bubble</a><a href="/voice.html">Voice</a><a href="/ask.html">Ask</a></nav>
    <LiveStatus />
    <Gallery />
  </StrictMode>
);
