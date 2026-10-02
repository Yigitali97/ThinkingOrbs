'use client';

import { CSSProperties, FormEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AgentStage, createStageOrb, StageOrbHandle } from './orb';
import './ask-orb.css';

export type { AgentStage };

/**
 * Answer a question. Call `report(stage)` as your agent moves between stages;
 * each stage stays on screen at least `minStageMs`. Resolve with the answer,
 * or reject to show an error card. `signal` aborts on unmount.
 */
export type AskHandler = (
  question: string,
  report: (stage: AgentStage) => void,
  signal: AbortSignal
) => Promise<ReactNode>;

export interface AskOrbProps {
  /** Your agent. Omit to play a demo sequence. */
  onAsk?: AskHandler;
  placeholder?: string;
  /** Minimum time each stage label stays visible. */
  minStageMs?: number;
  /** Small caps label above the answer. */
  answerLabel?: string;
  className?: string;
  style?: CSSProperties;
}

type Phase = 'idle' | 'collapsing' | 'flying' | 'working' | 'done' | 'failed' | 'solid' | 'answer';

const LABELS: Record<AgentStage, string> = {
  thinking: 'Thinking',
  searching: 'Searching',
  analyzing: 'Analyzing',
  composing: 'Composing',
};

const ORB_SIZE = 180;
const SOLID = 140;
const TRAVELER = 56;
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

// Wait for an animation, but never longer than its duration: background tabs pause
// animations, and the flow should keep going (it just skips the visuals).
function settle(a: Animation | undefined, ms: number) {
  if (!a) return Promise.resolve();
  return Promise.race([a.finished.then(() => undefined), new Promise<void>((r) => setTimeout(r, ms + 120))]);
}

const demoAsk: AskHandler = async (_question, report, signal) => {
  await sleep(1900, signal);
  report('searching');
  await sleep(1300, signal);
  report('analyzing');
  await sleep(1200, signal);
  report('composing');
  await sleep(1000, signal);
  return 'The answer goes here';
};

function Spark() {
  return (
    <svg className="ao-spark" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6L10 3.5z" />
      <path d="M17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

const Blobs = () => (
  <>
    <span className="ao-blob" />
    <span className="ao-blob" />
    <span className="ao-blob" />
    <span className="ao-blob" />
  </>
);

export function AskOrb({
  onAsk,
  placeholder = 'Ask anything...',
  minStageMs = 1100,
  answerLabel = 'Answer',
  className,
  style,
}: AskOrbProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [stage, setStage] = useState<AgentStage>('thinking');
  const [value, setValue] = useState('');
  const [answer, setAnswer] = useState<{ content: ReactNode; error: boolean } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [traveling, setTraveling] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLFormElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const travelerRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const orbWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const solidRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<StageOrbHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onAskRef = useRef(onAsk);
  onAskRef.current = onAsk;

  const orbVisible = phase === 'working' || phase === 'done' || phase === 'failed' || phase === 'solid';

  // The canvas orb lives only while it is on screen; layout effects run inside flushSync.
  useLayoutEffect(() => {
    if (!orbVisible || !canvasRef.current) return;
    const orb = createStageOrb(canvasRef.current, ORB_SIZE);
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
  }, [orbVisible]);
  useLayoutEffect(() => orbRef.current?.setStage(stage), [stage, orbVisible]);
  useLayoutEffect(() => orbRef.current?.setDone(phase === 'done' || phase === 'solid'), [phase]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  async function run(question: string) {
    const ctl = new AbortController();
    abortRef.current = ctl;
    const { signal } = ctl;
    const quick = reduceMotion();
    const d = (ms: number) => (quick ? 1 : ms);

    try {
      const root = rootRef.current!.getBoundingClientRect();
      const bar = barRef.current!;
      const barRect = bar.getBoundingClientRect();
      const h = barRect.height;

      // 1. the bar folds into a small sphere
      flushSync(() => setPhase('collapsing'));
      rowRef.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d(140), fill: 'forwards' });
      await settle(bar.animate([{ width: `${barRect.width}px` }, { width: `${h}px` }], { duration: d(380), easing: EASE, fill: 'forwards' }), d(380));

      // 2. …and flies up to where the orb will be
      const from = { x: barRect.left + barRect.width / 2 - root.left, y: barRect.top + h / 2 - root.top };
      flushSync(() => {
        setTraveling(true);
        setPhase('flying');
      });
      const slot = slotRef.current!.getBoundingClientRect();
      const to = { x: slot.left - root.left, y: slot.top - root.top };
      const place = (p: { x: number; y: number }, s: number) =>
        `translate(${p.x - TRAVELER / 2}px, ${p.y - TRAVELER / 2}px) scale(${s})`;
      trailRef.current?.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.35 }, { opacity: 0 }], { duration: d(650) });
      await settle(
        travelerRef.current!.animate(
          [{ transform: place(from, h / TRAVELER) }, { transform: place(to, 100 / TRAVELER) }],
          { duration: d(650), easing: 'cubic-bezier(0.5, 0, 0.15, 1)', fill: 'forwards' }
        ),
        d(650)
      );

      // 3. the dark sphere dissolves into the dot orb
      flushSync(() => {
        setStage('thinking');
        setPhase('working');
      });
      orbWrapRef.current!.animate(
        [
          { opacity: 0, transform: 'translate(-50%, -50%) scale(0.6)' },
          { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        ],
        { duration: d(500), easing: EASE_OUT }
      );
      void settle(travelerRef.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d(260), fill: 'forwards' }), d(260)).then(() =>
        setTraveling(false)
      );

      // 4. stages, each held for at least minStageMs
      let shownAt = performance.now();
      let chain = Promise.resolve();
      let finished = false;
      const report = (next: AgentStage) => {
        if (finished) return;
        chain = chain.then(async () => {
          const wait = shownAt + minStageMs - performance.now();
          if (wait > 0) await sleep(wait, signal);
          setStage(next);
          shownAt = performance.now();
        });
      };
      let content: ReactNode;
      let failed = false;
      try {
        content = await (onAskRef.current ?? demoAsk)(question, report, signal);
      } catch (e) {
        if (signal.aborted) throw e;
        failed = true;
        content = e instanceof Error ? e.message : String(e ?? 'Something went wrong.');
      }
      finished = true;
      await chain;
      const rest = shownAt + minStageMs - performance.now();
      if (rest > 0) await sleep(rest, signal);

      flushSync(() => setAnswer({ content, error: failed }));

      if (!failed) {
        // 5. done: dots wash green, then become a solid green sphere
        flushSync(() => setPhase('done'));
        await sleep(d(1100), signal);
        flushSync(() => setPhase('solid'));
        orbWrapRef.current!.animate(
          [
            { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
            { opacity: 0, transform: 'translate(-50%, -50%) scale(1.2)' },
          ],
          { duration: d(450), easing: EASE_OUT, fill: 'forwards' }
        );
        await settle(
          solidRef.current!.animate(
            [
              { opacity: 0, transform: 'scale(0.6)' },
              { opacity: 1, transform: 'scale(1)' },
            ],
            { duration: d(480), easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.15)', fill: 'forwards' }
          ),
          d(480)
        );
        await sleep(d(420), signal);
      } else {
        flushSync(() => setPhase('failed'));
        await sleep(d(900), signal);
      }

      // 6. the sphere stretches into the answer card
      flushSync(() => setPhase('answer'));
      const card = cardRef.current!;
      const { width, height } = card.getBoundingClientRect();
      const t = d(700);
      card.animate(
        [
          { width: `${SOLID}px`, height: `${SOLID}px`, minWidth: '0px', borderRadius: `${SOLID / 2}px` },
          { width: `${Math.max(SOLID, width * 0.5)}px`, height: `${Math.min(SOLID, height)}px`, minWidth: '0px', borderRadius: `${SOLID / 2}px`, offset: 0.4 },
          { width: `${width}px`, height: `${height}px`, minWidth: '0px', borderRadius: '22px' },
        ],
        { duration: t, easing: EASE }
      );
      if (!failed) {
        fillRef.current!.animate([{ opacity: 1 }, { opacity: 0.85, offset: 0.2 }, { opacity: 0 }], { duration: t * 0.7, easing: 'ease-out' });
      }
      await settle(bodyRef.current!.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: t + d(250) }), t + d(250));
      await sleep(d(700), signal);
      setShowNew(true);
    } catch (e) {
      if (signal.aborted) return;
      // something unexpected (e.g. unmounted mid-way): fall back to the prompt
      setPhase('idle');
      setTraveling(false);
      console.error('AskOrb:', e);
    }
  }

  async function reset() {
    setShowNew(false);
    const quick = reduceMotion();
    await settle(
      answerRef.current?.animate(
        [
          { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
          { opacity: 0, transform: 'translate(-50%, -50%) scale(0.96)' },
        ],
        { duration: quick ? 1 : 260, fill: 'forwards' }
      ),
      quick ? 1 : 260
    );
    flushSync(() => {
      setAnswer(null);
      setValue('');
      setPhase('idle');
    });
    dockRef.current?.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 28px)' },
        { opacity: 1, transform: 'translate(-50%, 0)' },
      ],
      { duration: quick ? 1 : 480, easing: EASE_OUT }
    );
    inputRef.current?.focus();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q || phase !== 'idle') return;
    void run(q);
  }

  const status =
    phase === 'working' ? `${LABELS[stage]}…` : phase === 'done' ? 'Done' : phase === 'failed' ? 'Failed' : '';

  return (
    <div ref={rootRef} className={['ao', className].filter(Boolean).join(' ')} style={style}>
      <div className="ao-bg" />

      <div ref={slotRef} className="ao-slot">
        {orbVisible && (
          <div ref={orbWrapRef} className="ao-orb">
            <canvas ref={canvasRef} aria-hidden="true" />
          </div>
        )}
        {(phase === 'working' || phase === 'done' || phase === 'failed') && (
          <div className="ao-label" data-done={phase === 'done'} style={phase === 'failed' ? { color: 'var(--ao-red)' } : undefined}>
            {phase === 'working' ? LABELS[stage] : phase === 'done' ? 'Done' : 'Failed'}
            {phase === 'working' && (
              <span className="ao-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
        )}
        {phase === 'solid' && <div ref={solidRef} className="ao-solid" />}
        {phase === 'answer' && answer && (
          <div ref={answerRef} className="ao-answer">
            <div ref={cardRef} className="ao-card" data-error={answer.error}>
              {!answer.error && <div ref={fillRef} className="ao-card-fill" />}
              <div ref={bodyRef} className="ao-card-body">
                <div className="ao-kicker">{answer.error ? 'Error' : answerLabel}</div>
                <div className="ao-text">{answer.content}</div>
              </div>
            </div>
            <button type="button" className="ao-new" data-show={showNew} tabIndex={showNew ? 0 : -1} onClick={reset}>
              New question
            </button>
          </div>
        )}
      </div>

      {traveling && (
        <div ref={travelerRef} className="ao-traveler">
          <div ref={trailRef} className="ao-trail" style={{ opacity: 0 }} />
        </div>
      )}

      {(phase === 'idle' || phase === 'collapsing') && (
        <form ref={dockRef} className="ao-dock" onSubmit={submit}>
          <div ref={barRef} className="ao-bar">
            <div className="ao-bar-inner">
              <div className="ao-blobs">
                <Blobs />
              </div>
              <div ref={rowRef} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, height: '100%' }}>
                <Spark />
                <input
                  ref={inputRef}
                  className="ao-input"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder}
                  aria-label={placeholder}
                  autoComplete="off"
                />
                <button type="submit" className="ao-send" data-ready={!!value.trim()} disabled={!value.trim()} aria-label="Send">
                  <Arrow />
                </button>
              </div>
            </div>
          </div>
          <div className="ao-spill" aria-hidden="true">
            <Blobs />
          </div>
        </form>
      )}

      <div className="ao-sr" aria-live="polite">
        {phase === 'answer' && answer && typeof answer.content === 'string' ? answer.content : status}
      </div>
    </div>
  );
}

export default AskOrb;
