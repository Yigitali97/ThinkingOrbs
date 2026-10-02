import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useMicrophone, VoiceOrb } from '../src/voice-orb';
import './voice.css';

// Open with ?simulate to preview the reaction without a microphone.
const simulate = new URLSearchParams(location.search).has('simulate');
const fakeVoice = () => {
  const t = performance.now() / 1000;
  const syllables = Math.max(0, Math.sin(t * 9) * Math.sin(t * 2.3 + 1));
  const phrase = Math.sin(t * 0.7) > -0.3 ? 1 : 0;
  return syllables * phrase * 0.9;
};

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
    </svg>
  );
}

function VoiceDemo() {
  const mic = useMicrophone();
  return (
    <main className="voice">
      <div className="stage">
        <VoiceOrb size={440} stream={mic.stream} getLevel={simulate ? fakeVoice : undefined} />
      </div>
      <button className="record" onClick={mic.toggle} aria-pressed={mic.recording} disabled={mic.pending}>
        <MicIcon />
        {mic.pending ? 'Waiting for microphone…' : mic.recording ? 'Stop Recording' : 'Start Recording'}
      </button>
      <p className="hint">
        {mic.error ?? 'Click the button to enable voice control. Speak to see the orb respond to your voice with subtle movements.'}
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VoiceDemo />
  </StrictMode>
);
