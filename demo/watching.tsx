import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WatchingOrb } from '../src/watching-orb';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#000' }}>
      <WatchingOrb size={260} />
    </div>
  </StrictMode>
);
