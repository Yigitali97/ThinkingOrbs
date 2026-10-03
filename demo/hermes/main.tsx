// Entry point of the Hermes site: mounts the app with its own stylesheet and the same display font as the docs.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque/standard.css';
import { App } from './App';
import './hermes.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
