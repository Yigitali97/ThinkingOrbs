/*
 * Assistant Orb engine — a sphere of dots whose color and motion follow a
 * voice assistant's state: idle (grey), listening (blue), thinking (orange),
 * speaking (green). Audio from a stream or a level callback drives the dots.
 */

import { StreamAnalyser } from '../shared/audio';

export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface AssistantOrbOptions {
  /** CSS pixel width/height of the canvas. */
  size?: number;
  state?: AssistantState;
  /** Audio to react to (mic while listening, TTS while speaking). */
  stream?: MediaStream | null;
  /** Alternative to `stream`: polled every frame, return 0..1. */
  getLevel?: () => number;
  /** Override the color of any state (hex). */
  colors?: Partial<Record<AssistantState, string>>;
}

export interface AssistantOrbHandle {
  update(opts: AssistantOrbOptions): void;
  destroy(): void;
}

export const ASSISTANT_COLORS: Record<AssistantState, string> = {
  idle: '#9a9aa3',
  listening: '#3b8bff',
  thinking: '#ff9a2e',
  speaking: '#34d399',
};

interface Mix {
  spin: number;
  listen: number;
  think: number;
  speak: number;
  glow: number;
}

const MIX: Record<AssistantState, Mix> = {
  idle: { spin: 0.22, listen: 0, think: 0, speak: 0, glow: 0.35 },
  listening: { spin: 0.35, listen: 1, think: 0, speak: 0, glow: 0.8 },
  thinking: { spin: 1.1, listen: 0, think: 1, speak: 0, glow: 0.8 },
  speaking: { spin: 0.45, listen: 0, think: 0, speak: 1, glow: 1 },
};

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const DOTS = 420;
const TILT = 0.35;
const FOCAL = 3.4;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((ch) => ch + ch).join('') : m;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Stand-in voice when speaking without any audio source.
function syntheticVoice(t: number) {
  const syllables = Math.max(0, Math.sin(t * 8.5) * Math.sin(t * 2.1 + 1));
  const phrase = Math.sin(t * 0.8) > -0.4 ? 1 : 0.1;
  return clamp(syllables * phrase * 1.1, 0, 1);
}

export function createAssistantOrb(canvas: HTMLCanvasElement, opts: AssistantOrbOptions = {}): AssistantOrbHandle {
  const maybe = canvas.getContext('2d');
  if (!maybe) throw new Error('AssistantOrb: 2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybe;

  const o: AssistantOrbOptions & { size: number; state: AssistantState } = { size: 320, state: 'idle', ...opts };
  const colorOf = (s: AssistantState) => hexToRgb(o.colors?.[s] ?? ASSISTANT_COLORS[s]);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(o.size * dpr);
    canvas.height = Math.round(o.size * dpr);
    canvas.style.width = o.size + 'px';
    canvas.style.height = o.size + 'px';
  }
  resize();

  // Fibonacci sphere
  const px0 = new Float32Array(DOTS), py0 = new Float32Array(DOTS), pz0 = new Float32Array(DOTS), phase = new Float32Array(DOTS);
  for (let i = 0; i < DOTS; i++) {
    const y = 1 - (2 * (i + 0.5)) / DOTS;
    const r = Math.sqrt(1 - y * y);
    px0[i] = Math.cos(i * GOLDEN) * r;
    py0[i] = y;
    pz0[i] = Math.sin(i * GOLDEN) * r;
    phase[i] = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * TAU;
  }
  const sx = new Float32Array(DOTS), sy = new Float32Array(DOTS), sz = new Float32Array(DOTS);
  const sp = new Float32Array(DOTS), sb = new Float32Array(DOTS);
  const order = new Uint16Array(DOTS);
  for (let i = 0; i < DOTS; i++) order[i] = i;

  let analyser: StreamAnalyser | null = null;
  let analysed: MediaStream | null = null;
  function syncStream() {
    const s = o.stream || null;
    if (s === analysed) return;
    analyser?.close();
    analyser = s ? new StreamAnalyser(s) : null;
    analysed = s;
  }
  syncStream();

  const reduceMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const mix: Mix = { ...MIX[o.state] };
  const rgb = colorOf(o.state).map(Number) as [number, number, number];
  let level = 0;
  let rot = 0;
  const cT = Math.cos(TILT), sT = Math.sin(TILT);

  let raf = 0;
  let last = performance.now();
  const start = last;

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - start) / 1000;

    // ease color and motion toward the current state
    const k = 1 - Math.exp(-4 * dt);
    const target = MIX[o.state];
    (Object.keys(mix) as Array<keyof Mix>).forEach((key) => (mix[key] += (target[key] - mix[key]) * k));
    const tc = colorOf(o.state);
    for (let i = 0; i < 3; i++) rgb[i] += (tc[i] - rgb[i]) * k;

    // audio level
    let raw = 0;
    if (analyser) raw = analyser.read().level;
    else if (o.getLevel) raw = clamp(o.getLevel(), 0, 1);
    else if (o.state === 'speaking') raw = syntheticVoice(t);
    level += (raw - level) * (1 - Math.exp(-(raw > level ? 16 : 5) * dt));

    rot += dt * mix.spin * (reduceMotion ? 0.25 : 1);
    draw(t);
    raf = requestAnimationFrame(frame);
  }

  function draw(t: number) {
    const W = canvas.width;
    const c = W / 2;
    const R = W * 0.36;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const breathe = 0.015 * Math.sin(t * 1.4);
    // thinking: a band sweeping down the sphere
    const band = 1.25 - 2.5 * ((t % 1.3) / 1.3);

    for (let i = 0; i < DOTS; i++) {
      // spin around the local axis, then tilt toward the viewer
      const lx = px0[i] * cr - pz0[i] * sr;
      const lz = px0[i] * sr + pz0[i] * cr;
      const ly = py0[i];
      let x = lx;
      let y = ly * cT - lz * sT;
      let z = ly * sT + lz * cT;

      const front = (z + 1) / 2;
      let disp = breathe;
      let boost = 0;

      if (mix.listen > 0.01) {
        // dots shiver outward with the voice, strongest facing the user
        const n = 0.5 + 0.5 * Math.sin(phase[i] + t * 7);
        disp += mix.listen * level * 0.11 * n * (0.35 + 0.65 * front);
        boost = Math.max(boost, mix.listen * level * 0.7 * n * front);
      }
      if (mix.think > 0.01) {
        const d = (ly - band) / 0.16;
        const g = Math.exp(-d * d);
        disp += mix.think * 0.05 * g;
        boost = Math.max(boost, mix.think * g);
      }
      if (mix.speak > 0.01) {
        // waves rolling out from the point facing the user
        const away = Math.acos(clamp(z, -1, 1));
        const ripple = 0.5 + 0.5 * Math.sin(away * 6 - t * 9);
        disp += mix.speak * level * (0.05 + 0.13 * ripple);
        boost = Math.max(boost, mix.speak * level * ripple);
      }

      const s = 1 + disp;
      x *= s;
      y *= s;
      z *= s;
      const p = FOCAL / (FOCAL - z);
      sx[i] = c + x * p * R;
      sy[i] = c - y * p * R;
      sz[i] = z;
      sp[i] = p;
      sb[i] = clamp(boost, 0, 1);
    }
    order.sort((a, b) => sz[a] - sz[b]);

    ctx.clearRect(0, 0, W, W);

    // soft halo in the state color
    const [r, g, b] = rgb.map((v) => Math.round(v));
    const halo = ctx.createRadialGradient(c, c, R * 0.2, c, c, R * 1.45);
    const ha = (0.1 + 0.18 * level) * mix.glow;
    halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${ha})`);
    halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, W);

    const rd = R * 0.024;
    for (let j = 0; j < DOTS; j++) {
      const i = order[j];
      const depth = clamp((sz[i] + 1) / 2, 0, 1);
      const bo = sb[i];
      const alpha = clamp(0.08 + 0.8 * Math.pow(depth, 1.5) + 0.35 * bo * depth, 0, 1);
      const rad = rd * sp[i] * (0.5 + 0.6 * depth) * (1 + 0.55 * bo);
      // boosted dots run hotter, toward white
      const w = 0.45 * bo;
      ctx.fillStyle = `rgb(${Math.round(r + (255 - r) * w)}, ${Math.round(g + (255 - g) * w)}, ${Math.round(b + (255 - b) * w)})`;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], rad, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  frame(performance.now());

  return {
    update(next) {
      const sizeChanged = next.size != null && next.size !== o.size;
      Object.assign(o, next);
      if (sizeChanged) resize();
      syncStream();
    },
    destroy() {
      cancelAnimationFrame(raf);
      analyser?.close();
      analyser = null;
    },
  };
}
