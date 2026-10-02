import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BubbleOrb } from '../src/bubble-orb';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0b0d' }}>
      <BubbleOrb size={260} />
    </div>
  </StrictMode>
);
