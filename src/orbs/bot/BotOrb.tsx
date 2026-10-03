// BotOrb — a friendly robot on a glowing pedestal that shows what an assistant is doing.
// SVG plus CSS keyframes keyed on `data-state`; a small JS loop feeds the audio level, blinks and the pointer glance.
'use client';

import * as React from 'react';
import { CSSProperties, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StreamAnalyser } from '../shared/audio';
import { loop, reducedMotion } from '../shared/dots';
import { BotState, botCaption, visorFor } from './state';
import './bot-orb.css';

export interface BotOrbProps {
  /** idle · listening · thinking · speaking · happy · error. */
  state?: BotState;
  /** Width and height in CSS pixels. Below 72 the pedestal hides and the face fills the frame. */
  size?: number;
  /** Loudness 0..1, e.g. from your own meter. `stream` and `getLevel` take precedence. */
  level?: number;
  /** Audio to react to while listening or speaking: the mic, or TTS playback. */
  stream?: MediaStream | null;
  /** Polled every frame while listening or speaking; return 0..1. Doesn't re-render. */
  getLevel?: () => number;
  /** Show the glowing ring pedestal under the bot. */
  pedestal?: boolean;
  /** Accessible name. Pass `null` to hide the bot from assistive tech. */
  label?: string | null;
  className?: string;
  style?: CSSProperties;
}

export interface BotOrbRef {
  /** Hop once, e.g. when a reply lands. */
  bounce(): void;
  /** Blink both eyes. */
  blink(): void;
}

/**
 * The scene is drawn in 0..200; these square crops frame it per layout. Each leaves headroom above the antenna
 * so the happy hop, the float and the listening rings stay inside the frame.
 */
const VIEW_FULL = '-10 -16 220 220';
const VIEW_NO_PEDESTAL = '7 -16 186 186';
const VIEW_COMPACT = '27 -6 146 146';
const COMPACT_BELOW = 72;

const BAR_X = [80, 90, 100, 110, 120];
const BAR_GAIN = [0.55, 0.85, 1, 0.8, 0.6];
const PARTICLES = [0, 1, 2];
const ORBIT_SECONDS = 3.6;

/** The hop, matching `bot-bounce` in the CSS; `lift` is its height in scene units. */
const bounceFrames = (lift: number): Keyframe[] => [
  { transform: 'translateY(0) scale(1, 1)' },
  { transform: 'translateY(2px) scale(1.05, 0.94)', offset: 0.14 },
  { transform: `translateY(-${lift}px) scale(0.98, 1.03)`, offset: 0.42 },
  { transform: 'translateY(1px) scale(1.03, 0.97)', offset: 0.72 },
  { transform: 'translateY(0) scale(1, 1)' },
];

/** A per-instance id for gradient and filter references: React 18's useId, or a mount counter on React 17. */
let mounts = 0;
const useBotId: () => string =
  (React as { useId?: () => string }).useId ?? (() => useRef('r' + (mounts += 1)).current);

/** Milliseconds until the next idle blink: 3–6 s, varied by a counter so each mount is repeatable. */
const blinkDelay = (n: number) => 3000 + ((n * 1597 + 811) % 3001);

export const BotOrb = forwardRef<BotOrbRef, BotOrbProps>(function BotOrb(
  { state = 'idle', size = 160, level, stream = null, getLevel, pedestal = true, label = 'Assistant', className, style },
  ref
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hopRef = useRef<SVGGElement>(null);
  const barRefs = useRef<(SVGRectElement | null)[]>([]);
  const blinkTimer = useRef(0);
  const getLevelRef = useRef(getLevel);
  getLevelRef.current = getLevel;
  const levelRef = useRef(level);
  levelRef.current = level;

  const uid = 'bot' + useBotId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  const compact = size < COMPACT_BELOW;
  const showPedestal = pedestal && !compact;
  const viewBox = compact ? VIEW_COMPACT : showPedestal ? VIEW_FULL : VIEW_NO_PEDESTAL;
  const [vx, vy, vw] = viewBox.split(' ').map(Number);
  const scale = vw / size; // scene units per CSS pixel
  const visor = visorFor(state);
  const levelDriven = state === 'listening' || state === 'speaking';
  const hasSource = !!stream || !!getLevel || level !== undefined;

  const blink = () => {
    const root = rootRef.current;
    if (!root) return;
    root.setAttribute('data-blink', '');
    window.setTimeout(() => root.removeAttribute('data-blink'), 140);
  };

  const bounce = () => {
    const hop = hopRef.current;
    if (!hop || reducedMotion() || typeof hop.animate !== 'function') return;
    const compactNow = rootRef.current?.hasAttribute('data-compact');
    hop.animate(bounceFrames(compactNow ? 5 : 10), { duration: 760, easing: 'cubic-bezier(0.33, 0, 0.3, 1)' });
  };

  useImperativeHandle(ref, () => ({ bounce, blink }), []);

  // idle blinks on a repeatable 3–6 s rhythm
  useEffect(() => {
    if (state !== 'idle' && state !== 'listening') return;
    let n = 0;
    const schedule = () => {
      blinkTimer.current = window.setTimeout(() => {
        blink();
        n += 1;
        schedule();
      }, blinkDelay(n));
    };
    schedule();
    return () => window.clearTimeout(blinkTimer.current);
  }, [state]);

  // eyes glance toward the pointer, at most 3px
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion()) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      const box = root.getBoundingClientRect();
      const dx = x - (box.left + box.width / 2);
      const dy = y - (box.top + box.height * 0.35);
      const dist = Math.hypot(dx, dy) || 1;
      const reach = (Math.min(1, dist / 320) * 3 * scale) / dist;
      root.style.setProperty('--bot-gx', (dx * reach).toFixed(2));
      root.style.setProperty('--bot-gy', (dy * reach).toFixed(2));
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scale]);

  // audio level drives the ear lights while listening and the waveform while speaking
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !levelDriven || !hasSource || reducedMotion()) return;
    let analyser: StreamAnalyser | null = null;
    if (stream) {
      try {
        analyser = new StreamAnalyser(stream);
      } catch {
        analyser = null;
      }
    }
    let lv = 0;
    const stop = loop((_dt, t) => {
      const raw = analyser ? analyser.read().level : getLevelRef.current ? getLevelRef.current() : levelRef.current ?? 0;
      const target = Math.min(1, Math.max(0, raw || 0));
      lv += (target - lv) * (target > lv ? 0.35 : 0.12);
      root.style.setProperty('--bot-lv', lv.toFixed(3));
      barRefs.current.forEach((bar, i) => {
        if (!bar) return;
        const wobble = 0.72 + 0.28 * Math.sin(t * (7 + i * 1.7) + i * 1.3);
        bar.style.transform = `scaleY(${(0.18 + 0.82 * lv * BAR_GAIN[i] * wobble).toFixed(3)})`;
      });
    });
    return () => {
      stop();
      analyser?.close();
      root.style.removeProperty('--bot-lv');
      barRefs.current.forEach((bar) => bar?.style.removeProperty('transform'));
    };
  }, [levelDriven, hasSource, stream]);

  // the wrapper is what pages query; the image is named inside it, and the live caption sits beside the image,
  // because the children of role="img" are presentational and would never be announced
  const image = label === null ? {} : { role: 'img', 'aria-label': label };

  const particle = (i: number) => {
    const offset = (-ORBIT_SECONDS * i) / PARTICLES.length;
    const vars = { '--bot-d': `${offset}s`, '--bot-dy': `${offset - ORBIT_SECONDS / 4}s` } as CSSProperties;
    return (
      <g key={i} className="bot-px" style={vars}>
        <g className="bot-py" style={vars}>
          <circle cx={100} cy={60} r={i === 1 ? 3 : 3.6} className={i === 1 ? 'bot-spark-violet' : 'bot-spark'} />
        </g>
      </g>
    );
  };

  return (
    <div
      ref={rootRef}
      data-bot=""
      data-state={state}
      data-visor={visor}
      data-compact={compact ? '' : undefined}
      data-level={levelDriven && hasSource ? '' : undefined}
      className={['bot', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, ...style }}
      aria-hidden={label === null ? true : undefined}
    >
      <div className="bot-figure" {...image}>
        <svg className="bot-svg" viewBox={viewBox} width={size} height={size} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={id('shell')} x1="0.3" y1="0" x2="0.7" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.45" stopColor="#ece9ff" />
              <stop offset="1" stopColor="#b3a9f6" />
            </linearGradient>
            <linearGradient id={id('body')} x1="0.25" y1="0" x2="0.75" y2="1">
              <stop offset="0" stopColor="#f6f4ff" />
              <stop offset="0.4" stopColor="#cfc8ff" />
              <stop offset="1" stopColor="#6f62e0" />
            </linearGradient>
            <linearGradient id={id('limb')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e4e0ff" />
              <stop offset="1" stopColor="#7d70e6" />
            </linearGradient>
            <radialGradient id={id('rim')} cx="0.5" cy="1" r="0.9">
              <stop offset="0" stopColor="#8b7cff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#8b7cff" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={id('visor')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1a1d4f" />
              <stop offset="1" stopColor="#070923" />
            </linearGradient>
            <linearGradient id={id('gloss')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id={id('aura')} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#6d5cff" stopOpacity="0.5" />
              <stop offset="0.55" stopColor="#4a3fd0" stopOpacity="0.16" />
              <stop offset="1" stopColor="#4a3fd0" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={id('beam')} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#3fd8ff" stopOpacity="0.42" />
              <stop offset="0.6" stopColor="#6f8bff" stopOpacity="0.1" />
              <stop offset="1" stopColor="#8b7cff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id={id('disc')} cx="0.5" cy="0.4" r="0.6">
              <stop offset="0" stopColor="#2a2f78" />
              <stop offset="1" stopColor="#0c0f33" />
            </radialGradient>
            <radialGradient id={id('pool')} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#7ee8ff" stopOpacity="0.9" />
              <stop offset="0.5" stopColor="#3fd8ff" stopOpacity="0.35" />
              <stop offset="1" stopColor="#3fd8ff" stopOpacity="0" />
            </radialGradient>
            <filter id={id('glow')} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={id('halo')} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4.5" />
            </filter>
          </defs>

          <circle className="bot-aura" cx={vx + vw / 2} cy={vy + vw / 2 + (showPedestal ? 4 : 0)} r={vw * 0.48} fill={url('aura')} />

          {showPedestal && (
            <g className="bot-pedestal">
              <path className="bot-beam" d="M 56 182 L 70 96 H 130 L 144 182 Z" fill={url('beam')} />
              <ellipse cx={100} cy={186} rx={76} ry={13} fill="none" stroke="#8b7cff" strokeOpacity={0.35} strokeWidth={1} />
              <ellipse cx={100} cy={184} rx={62} ry={12.5} fill={url('disc')} />
              <ellipse cx={100} cy={184} rx={62} ry={12.5} fill="none" stroke="#3fd8ff" strokeWidth={2} filter={url('glow')} />
              <ellipse className="bot-pool" cx={100} cy={183} rx={40} ry={7} fill={url('pool')} />
              <ellipse cx={100} cy={183} rx={46} ry={8.5} fill="none" stroke="#a99dff" strokeOpacity={0.7} strokeWidth={1} />
              <ellipse className="bot-ring-spin" cx={100} cy={189} rx={70} ry={14} fill="none" stroke="#3fd8ff" strokeOpacity={0.5}
                strokeWidth={1.2} strokeDasharray="3 9" />
              <ellipse className="bot-shadow" cx={100} cy={181} rx={26} ry={4.5} fill="#05061a" opacity={0.55} />
            </g>
          )}

          <g className="bot-float">
            <g className="bot-orbit bot-orbit-back">{PARTICLES.map(particle)}</g>
            <g className="bot-sound">
              <circle cx={100} cy={66} r={52} />
              <circle cx={100} cy={66} r={52} />
            </g>

            <g ref={hopRef} className="bot-hop">
              <g className="bot-shake">
                {/* body */}
                <ellipse cx={59} cy={130} rx={7.5} ry={13} fill={url('limb')} transform="rotate(16 59 130)" />
                <ellipse cx={141} cy={130} rx={7.5} ry={13} fill={url('limb')} transform="rotate(-16 141 130)" />
                <rect x={87} y={100} width={26} height={14} rx={5} fill="#3a3392" />
                <path
                  d="M 74 111 H 126 Q 139 111 137.5 123 L 132 151 Q 129.5 164 116 164 H 84 Q 70.5 164 68 151 L 62.5 123 Q 61 111 74 111 Z"
                  fill={url('body')}
                />
                <path
                  d="M 74 111 H 126 Q 139 111 137.5 123 L 132 151 Q 129.5 164 116 164 H 84 Q 70.5 164 68 151 L 62.5 123 Q 61 111 74 111 Z"
                  fill={url('rim')}
                />
                <path d="M 74 114.5 H 120" stroke="#ffffff" strokeOpacity={0.7} strokeWidth={2} strokeLinecap="round" />
                <rect x={86} y={123} width={28} height={22} rx={8} fill="#1d1a5c" />
                <rect x={86} y={123} width={28} height={22} rx={8} fill="none" stroke="#8b7cff" strokeOpacity={0.6} strokeWidth={1} />
                <path className="bot-mark" d="M 94.5 128.5 V 139.5 M 105.5 128.5 V 139.5 M 94.5 134 Q 100 130.5 105.5 134" fill="none"
                  stroke="#3fd8ff" strokeWidth={2.4} strokeLinecap="round" filter={url('glow')} />

                {/* head */}
                <g className="bot-head">
                  <line x1={100} y1={27} x2={100} y2={15} stroke="#cfc8ff" strokeWidth={3} strokeLinecap="round" />
                  <circle className="bot-antenna" cx={100} cy={12} r={4.4} fill="#3fd8ff" filter={url('glow')} />
                  <circle className="bot-antenna-core" cx={100} cy={12} r={1.8} fill="#e8fbff" />

                  <circle cx={42} cy={67} r={11} fill={url('limb')} />
                  <circle cx={158} cy={67} r={11} fill={url('limb')} />
                  <circle cx={42} cy={67} r={7} fill="#1d1a5c" />
                  <circle cx={158} cy={67} r={7} fill="#1d1a5c" />
                  <circle className="bot-ear-light" cx={42} cy={67} r={4.2} filter={url('glow')} />
                  <circle className="bot-ear-light" cx={158} cy={67} r={4.2} filter={url('glow')} />

                  <rect x={47} y={26} width={106} height={82} rx={38} fill={url('shell')} />
                  <rect x={47} y={26} width={106} height={82} rx={38} fill={url('rim')} />
                  <path d="M 66 33 Q 84 28.5 104 29" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.9} />
                  <rect x={57} y={37} width={86} height={58} rx={27} fill={url('visor')} />
                  <rect x={57} y={37} width={86} height={58} rx={27} fill="none" stroke="#3fd8ff" strokeOpacity={0.22} strokeWidth={1} />
                  <ellipse className="bot-visor-glow" cx={100} cy={70} rx={30} ry={18} fill="#3fd8ff" opacity={0.12} filter={url('halo')} />

                  {/* faces: one shows at a time */}
                  <g className="bot-face bot-face-eyes">
                    <g className="bot-glance">
                      <g className="bot-eyes" filter={url('glow')}>
                        <g className="bot-eyes-open">
                          <rect x={77} y={56} width={13} height={18} rx={6.5} fill="#3fd8ff" />
                          <rect x={110} y={56} width={13} height={18} rx={6.5} fill="#3fd8ff" />
                          <circle cx={86} cy={60.5} r={2.1} fill="#e8fbff" />
                          <circle cx={119} cy={60.5} r={2.1} fill="#e8fbff" />
                        </g>
                        <g className="bot-eyes-happy" fill="none" stroke="#3fd8ff" strokeWidth={3.6} strokeLinecap="round">
                          <path d="M 77 68 Q 83.5 57 90 68" />
                          <path d="M 110 68 Q 116.5 57 123 68" />
                        </g>
                      </g>
                      <path className="bot-smile" d="M 94 80.5 Q 100 85 106 80.5" fill="none" stroke="#3fd8ff" strokeWidth={2.4}
                        strokeLinecap="round" filter={url('glow')} />
                    </g>
                  </g>

                  <g className="bot-face bot-face-arc" filter={url('glow')}>
                    <circle cx={100} cy={66} r={14} fill="none" stroke="#3fd8ff" strokeOpacity={0.18} strokeWidth={3} />
                    <circle className="bot-arc" cx={100} cy={66} r={14} fill="none" stroke="#3fd8ff" strokeWidth={3}
                      strokeLinecap="round" strokeDasharray="26 62" />
                    <circle className="bot-arc-inner" cx={100} cy={66} r={7} fill="none" stroke="#a99dff" strokeWidth={2}
                      strokeLinecap="round" strokeDasharray="10 34" />
                  </g>

                  <g className="bot-face bot-face-wave" filter={url('glow')}>
                    {BAR_X.map((x, i) => (
                      <rect
                        key={x}
                        ref={(el) => {
                          barRefs.current[i] = el;
                        }}
                        className="bot-bar"
                        style={{ '--bot-i': i, '--bot-k': BAR_GAIN[i] } as CSSProperties}
                        x={x - 2.6}
                        y={52}
                        width={5.2}
                        height={28}
                        rx={2.6}
                        fill="#3fd8ff"
                      />
                    ))}
                  </g>

                  <g className="bot-face bot-face-alert" filter={url('glow')}>
                    <rect x={77} y={60} width={13} height={11} rx={5.5} fill="#ffb547" />
                    <rect x={110} y={60} width={13} height={11} rx={5.5} fill="#ffb547" />
                    <path d="M 77 57.5 L 89 53.5 M 123 57.5 L 111 53.5" stroke="#ffb547" strokeWidth={2.4} strokeLinecap="round" />
                    <path d="M 94 83 Q 100 78.5 106 83" fill="none" stroke="#ffb547" strokeWidth={2.4} strokeLinecap="round" />
                  </g>

                  <path className="bot-visor-gloss" d="M 70 47 Q 74 40.5 86 40 H 114 Q 126 40.5 130 47 Q 100 42 70 47 Z"
                    fill={url('gloss')} />
                </g>
              </g>
            </g>

            <g className="bot-orbit bot-orbit-front">{PARTICLES.map(particle)}</g>
          </g>
        </svg>
      </div>
      <span className="bot-caption" aria-live="polite">
        {botCaption(state)}
      </span>
    </div>
  );
});
