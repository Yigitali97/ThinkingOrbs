// Agent run example: one turn from question to answer. Each orb shows up only
// for its stage, then leaves a one-line summary behind.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ReasoningOrb, SearchOrb, StatusOrb, StatusVariant, TokenOrb, ToolOrb } from '../../src/orbs';
import { Segmented, usePrefersReducedMotion } from '../site/ui';
import { advance, buildRun, initialRun, QUESTION, RunState, runLength, Stage } from './agentScript';
import './agent-run.css';

const STATUS: Record<Stage, [StatusVariant, string]> = {
  idle: ['waiting', 'Starting'],
  thinking: ['reasoning', 'Thinking'],
  searching: ['searching', 'Searching the web'],
  tools: ['working · gyro', 'Using tools'],
  writing: ['working', 'Writing the answer'],
  done: ['base', 'Done'],
};

type Speed = '1×' | '2×';

function Check({ ok }: { ok: boolean }) {
  return ok ? (
    <svg role="img" className="ar-icon ar-ok" viewBox="0 0 16 16" aria-label="Done">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg role="img" className="ar-icon ar-warn" viewBox="0 0 16 16" aria-label="Finished with a failure">
      <path d="M8 3.5v5.5M8 12v.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function AgentRun() {
  const events = useMemo(buildRun, []);
  const total = runLength(events);
  const reduced = usePrefersReducedMotion();
  const [run, setRun] = useState(0);
  const [speed, setSpeed] = useState<Speed>('1×');
  const [playing, setPlaying] = useState(true);
  const [state, setState] = useState<RunState>(initialRun);
  const [t, setT] = useState(0);
  const clock = useRef({ t: 0, next: 0, state: initialRun() });

  // restart
  useEffect(() => {
    clock.current = { t: 0, next: 0, state: initialRun() };
    setState(clock.current.state);
    setT(0);
    setPlaying(true);
  }, [run]);

  // tick
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(200, now - last) * (speed === '2×' ? 2 : 1);
      last = now;
      const c = clock.current;
      c.t = Math.min(total, c.t + dt);
      const r = advance(c.state, events, c.next, c.t);
      c.next = r.next;
      if (r.state !== c.state) {
        c.state = r.state;
        setState(r.state);
      }
      setT(c.t);
      if (c.t >= total) setPlaying(false);
    }, 50);
    return () => clearInterval(id);
  }, [playing, speed, events, total, run]);

  const finished = t >= total;
  const [variant, label] = STATUS[state.stage];
  const stageOrb =
    state.stage === 'thinking' ? (
      <ReasoningOrb steps={state.steps} budget={state.budget} size={240} />
    ) : state.stage === 'searching' ? (
      <SearchOrb phase={state.phase} sources={state.sources} size={240} />
    ) : state.stage === 'tools' ? (
      <ToolOrb tools={state.tools} size={200} />
    ) : null;

  return (
    <div className="ar">
      <div className="ar-head">
        <StatusOrb variant={variant} size={20} label={null} paused={state.stage === 'done' && reduced} />
        <span className="ar-head-label" aria-live="polite">
          {label}
        </span>
        <span className="ar-clock" aria-hidden="true">
          {(t / 1000).toFixed(1)}s
        </span>
      </div>

      <div className="ar-body">
        <div className="ar-question">{QUESTION}</div>

        {state.log.length > 0 && (
          <ul className="ar-log" aria-label="Finished steps">
            {state.log.map((l) => (
              <li key={l.stage} className="ar-log-row">
                <Check ok={l.ok} />
                {l.text}
              </li>
            ))}
          </ul>
        )}

        <div className="ar-stage" data-stage={state.stage}>
          {stageOrb && (
            <div key={state.stage} className="ar-stage-orb">
              {stageOrb}
            </div>
          )}
        </div>

        {(state.stage === 'writing' || state.stage === 'done') && (
          <div className="ar-answer">
            <TokenOrb tokens={state.tokens} done={state.stage === 'done'} size={20} />
            <p>{state.text}</p>
          </div>
        )}
      </div>

      <div className="ar-controls">
        <progress className="ar-progress" max={total} value={t} aria-label="Run progress" />
        <div className="actions">
          <button type="button" className="btn" onClick={() => setRun((r) => r + 1)}>
            Run again
          </button>
          <button type="button" className="btn" onClick={() => setPlaying((p) => !p)} disabled={finished} aria-pressed={!playing && !finished}>
            {playing || finished ? 'Pause' : 'Resume'}
          </button>
          <Segmented label="Speed" options={['1×', '2×'] as const} value={speed} onChange={setSpeed} render={(s) => s} />
        </div>
      </div>
    </div>
  );
}
