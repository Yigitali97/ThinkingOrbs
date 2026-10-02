/*
 * Thinking Orbs engine — framework-free canvas renderer for animated
 * dot-sphere status indicators. All orbs share one requestAnimationFrame loop
 * and orbs scrolled out of view are skipped.
 */

export const ORB_VARIANTS = [
  'base',
  'working',
  'working · gyro',
  'reasoning',
  'reasoning · twins',
  'searching',
  'searching · lighthouse',
  'background',
  'background · spiral',
  'retrying',
  'retrying · surge',
  'compacting',
  'compacting · squeeze',
  'compacting · fuse',
  'waiting',
] as const;

export type OrbVariant = (typeof ORB_VARIANTS)[number];

export interface OrbOptions {
  variant?: OrbVariant;
  /** CSS pixel width/height of the canvas. */
  size?: number;
  /** Dot color, any canvas fillStyle. */
  color?: string;
  /** Freeze the animation on the current frame. */
  paused?: boolean;
}

export interface OrbHandle {
  setVariant(variant: OrbVariant): void;
  setSize(size: number): void;
  setColor(color: string): void;
  setPaused(paused: boolean): void;
  destroy(): void;
}

type Vec3 = [number, number, number];

interface Light {
  dir: Vec3;
  sigma: number;
  gain: number;
}

interface FrameParams {
  /** rotation about the orb's own axis */
  rot?: number;
  /** extra rotation proportional to latitude */
  twist?: number;
  /** 0..1 pull of each dot toward the nearest meridian column */
  quant?: number;
  /** overall size multiplier */
  scale?: number;
  /** brightness of un-highlighted dots */
  dim?: number;
  /** gaussian highlights in view space */
  lights?: Light[];
  /** view-space direction of a hard-edged lighthouse beam */
  beam?: Vec3;
  /** y position of a sweeping band */
  wave?: number | null;
  compact?: { wallX: number | null; fuse: boolean };
}

interface SpherePoint {
  y: number;
  lon: number;
}

interface VariantDef {
  points: () => SpherePoint[];
  /** dot radius relative to the sphere radius */
  dot?: number;
  shimmer?: boolean;
  frame: (t: number) => FrameParams;
}

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const sineInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

// ------------------------------------------------------------------ geometry

function fibonacciSphere(n: number): SpherePoint[] {
  const pts: SpherePoint[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({ y: 1 - (2 * (i + 0.5)) / n, lon: i * GOLDEN });
  }
  return pts;
}

// Dots laid out on helical strands running pole to pole.
function spiralStrands(strands: number, perStrand: number, turns: number): SpherePoint[] {
  const pts: SpherePoint[] = [];
  for (let s = 0; s < strands; s++) {
    for (let j = 0; j < perStrand; j++) {
      const v = (j + 0.5) / perStrand;
      pts.push({ y: Math.cos(Math.PI * v), lon: (s * TAU) / strands + turns * TAU * v });
    }
  }
  return pts;
}

// Smooth wandering direction on the front hemisphere (view space).
function wander(t: number, seed: number, spread: number): Vec3 {
  const x = spread * (0.62 * Math.sin(t * 0.93 + seed) + 0.38 * Math.sin(t * 2.07 + seed * 2.3));
  const y = spread * (0.58 * Math.sin(t * 1.13 + seed * 1.7 + 1) + 0.42 * Math.sin(t * 1.87 + seed * 0.7));
  return [x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))];
}

// A spark with a short fading tail.
function sparkTrail(t: number, seed: number, speed: number, spread: number, sigma: number): Light[] {
  const gains = [1, 0.82, 0.62, 0.42];
  return gains.map((gain, k) => ({ dir: wander((t - k * 0.15) * speed, seed, spread), sigma, gain }));
}

// --------------------------------------------------------- rotation profiles

const BASE_SPEED = 0.45; // rad/s
const DOTS = 230;

// Rotate forward, snap back a little, pause — then try again.
function retryAngle(t: number): number {
  const C = 1.6, fwd = 1.22, back = 0.16, v = 0.65, backAmt = 0.38;
  const net = v * fwd - backAmt;
  const n = Math.floor(t / C), tau = t - n * C;
  let a: number;
  if (tau < fwd) a = v * tau;
  else if (tau < fwd + back) a = v * fwd - backAmt * easeInOut((tau - fwd) / back);
  else a = net;
  return n * net + a;
}

// Sudden spin kick that decays to a near stop.
function surgeAngle(t: number): number {
  const C = 2.6, v0 = 2.1, k = 2.3;
  const per = (v0 / k) * (1 - Math.exp(-k * C));
  const n = Math.floor(t / C), tau = t - n * C;
  return n * per + (v0 / k) * (1 - Math.exp(-k * tau));
}

// Compacting cycle: spring in → wall sweeps, shrinking what it passes → hold small.
const COMPACT = { C: 3.0, small: 0.7, band: 0.38 };
function compactState(t: number): { scale: number; wallX: number | null } {
  const { C, small, band } = COMPACT;
  const tau = t % C;
  if (tau < 0.6) return { scale: 1 - (1 - small) * Math.exp(-tau * 8) * Math.cos(tau * 13), wallX: null };
  if (tau < 2.6) return { scale: 1, wallX: lerp(-1.05, 1.05 + band, sineInOut((tau - 0.6) / 2.0)) };
  return { scale: 1, wallX: 99 }; // everything already compacted
}

// ------------------------------------------------------------------ variants

const VARIANTS: Record<OrbVariant, VariantDef> = {
  base: {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => ({ rot: t * BASE_SPEED }),
  },
  working: {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => {
      const p = (t % 1.7) / 1.7;
      return { rot: t * BASE_SPEED, wave: p < 0.5 ? lerp(1.3, -1.3, sineInOut(p / 0.5)) : null };
    },
  },
  'working · gyro': {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => ({ rot: t * BASE_SPEED, twist: 1.5 * Math.sin((t * TAU) / 3.2) }),
  },
  reasoning: {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => ({ rot: t * BASE_SPEED * 0.6, dim: 0.6, lights: sparkTrail(t, 0.3, 1.0, 0.62, 0.125) }),
  },
  'reasoning · twins': {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => ({
      rot: t * BASE_SPEED * 0.6,
      dim: 0.6,
      lights: sparkTrail(t, 0.3, 1.0, 0.62, 0.125).concat(sparkTrail(t, 3.9, 1.15, 0.62, 0.125)),
    }),
  },
  searching: {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => ({ rot: t * BASE_SPEED * 0.6, dim: 0.5, lights: [{ dir: wander(t * 0.8, 1.2, 0.66), sigma: 0.22, gain: 1 }] }),
  },
  'searching · lighthouse': {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => {
      const th = (t * TAU) / 2.8;
      return { rot: t * BASE_SPEED * 0.5, dim: 0.42, beam: [Math.sin(th), 0.28, Math.cos(th)] };
    },
  },
  background: {
    points: () => fibonacciSphere(64),
    dot: 0.078,
    frame: (t) => ({ rot: t * BASE_SPEED * 0.45 }),
  },
  'background · spiral': {
    points: () => spiralStrands(9, 34, 0.42),
    dot: 0.044,
    frame: (t) => ({ rot: t * BASE_SPEED * 0.45 }),
  },
  retrying: {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => ({ rot: retryAngle(t) }),
  },
  'retrying · surge': {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => ({ rot: surgeAngle(t), scale: 1 + 0.045 * Math.exp(-(t % 2.6) * 7) }),
  },
  compacting: {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => {
      const s = compactState(t);
      return { rot: t * BASE_SPEED, scale: s.scale, compact: { wallX: s.wallX, fuse: false } };
    },
  },
  'compacting · squeeze': {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => {
      const s = Math.sin((t * TAU) / 3.6);
      return { rot: t * BASE_SPEED, twist: 1.25 * s, quant: 0.9 * smoothstep(0.15, 0.85, Math.abs(s)) };
    },
  },
  'compacting · fuse': {
    points: () => fibonacciSphere(DOTS),
    frame: (t) => {
      const s = compactState(t);
      return { rot: t * BASE_SPEED, scale: s.scale, compact: { wallX: s.wallX, fuse: true } };
    },
  },
  waiting: {
    points: () => fibonacciSphere(DOTS),
    shimmer: true,
    frame: (t) => {
      const a = t * 1.35;
      const rho = 0.55 + 0.35 * Math.sin(t * 0.55 + 0.8);
      const dir: Vec3 = [rho * Math.cos(a), rho * Math.sin(a), Math.sqrt(1 - rho * rho)];
      return { rot: t * BASE_SPEED * 0.6, dim: 0.5, lights: [{ dir, sigma: 0.25, gain: 1 }] };
    },
  },
};

// ----------------------------------------------------------------------- orb

const TILT_X = 0.38; // lean the axis toward the viewer
const TILT_Z = -0.32; // and slightly to the right
const cX = Math.cos(TILT_X), sX = Math.sin(TILT_X);
const cZ = Math.cos(TILT_Z), sZ = Math.sin(TILT_Z);
const Q_STEP = TAU / 14;
const STILL_FRAME_TIME = 1.2;

class Orb {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  size = 72;
  color = '#ffffff';
  paused = false;
  visible = true;
  /** last animation time drawn, so a paused orb can be redrawn in place */
  lastTime = STILL_FRAME_TIME;

  private variant!: VariantDef;
  private n = 0;
  private y0 = new Float32Array(0);
  private r0 = new Float32Array(0);
  private lon0 = new Float32Array(0);
  private phase = new Float32Array(0);
  private sx = new Float32Array(0);
  private sy = new Float32Array(0);
  private sz = new Float32Array(0);
  private sb = new Float32Array(0);
  private order = new Uint16Array(0);

  constructor(canvas: HTMLCanvasElement, opts: OrbOptions) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('ThinkingOrbs: 2D canvas context unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    if (opts.size) this.size = opts.size;
    if (opts.color) this.color = opts.color;
    this.paused = !!opts.paused;
    this.resize();
    this.setVariant(opts.variant || 'base');
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(this.size * dpr);
    this.canvas.height = Math.round(this.size * dpr);
    this.canvas.style.width = this.size + 'px';
    this.canvas.style.height = this.size + 'px';
  }

  setVariant(name: OrbVariant) {
    const v = VARIANTS[name];
    if (!v) throw new Error('ThinkingOrbs: unknown variant ' + name);
    this.variant = v;
    const pts = v.points();
    const n = pts.length;
    this.n = n;
    this.y0 = new Float32Array(n);
    this.r0 = new Float32Array(n);
    this.lon0 = new Float32Array(n);
    this.phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.y0[i] = pts[i].y;
      this.r0[i] = Math.sqrt(Math.max(0, 1 - pts[i].y * pts[i].y));
      this.lon0[i] = pts[i].lon;
      this.phase[i] = (Math.sin(i * 12.9898) * 43758.5453) % TAU;
    }
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    this.sz = new Float32Array(n);
    this.sb = new Float32Array(n);
    this.order = new Uint16Array(n);
    for (let i = 0; i < n; i++) this.order[i] = i;
  }

  draw(t: number) {
    this.lastTime = t;
    const v = this.variant;
    const f = v.frame(t);
    const rot = f.rot || 0, twist = f.twist || 0, quant = f.quant || 0;
    const scale = f.scale || 1, dim = f.dim == null ? 1 : f.dim;
    const { lights, beam, wave, compact } = f;

    let bx = 0, by = 0, bz = 0;
    if (beam) {
      const l = Math.hypot(beam[0], beam[1], beam[2]);
      bx = beam[0] / l; by = beam[1] / l; bz = beam[2] / l;
    }

    const { sx, sy, sz, sb } = this;
    for (let i = 0; i < this.n; i++) {
      const ly = this.y0[i], lr = this.r0[i];
      let lon = this.lon0[i];
      if (quant) {
        const target = Math.round(lon / Q_STEP) * Q_STEP;
        lon += (target - lon) * quant;
      }
      lon += rot + twist * ly;
      const lx = lr * Math.cos(lon), lz = lr * Math.sin(lon);

      // local → view: tilt around X, then around Z
      const y1 = ly * cX - lz * sX;
      const z1 = ly * sX + lz * cX;
      let x = lx * cZ - y1 * sZ;
      let y = lx * sZ + y1 * cZ;
      let z = z1;

      // highlights are computed on the undeformed unit sphere
      let b = 0;
      if (lights) {
        for (let k = 0; k < lights.length; k++) {
          const L = lights[k];
          const dx = x - L.dir[0], dy = y - L.dir[1], dz = z - L.dir[2];
          const g = L.gain * Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * L.sigma * L.sigma));
          if (g > b) b = g;
        }
        if (v.shimmer && b > 0.05) b *= 0.82 + 0.18 * Math.sin(t * 17 + this.phase[i]);
      }
      if (beam) b = Math.max(b, smoothstep(0.42, 0.62, x * bx + y * by + z * bz));
      if (wave != null) {
        const d = y + 0.22 * x - wave;
        const g = Math.exp(-(d * d) / (2 * 0.16 * 0.16));
        const bulge = 1 + 0.11 * g;
        x *= bulge; y *= bulge; z *= bulge;
        b = Math.max(b, g);
      }
      if (compact && compact.wallX != null) {
        const wallX = compact.wallX;
        const u = clamp((wallX - x) / COMPACT.band, 0, 1);
        if (u > 0) {
          const e = easeOut(u);
          const s = COMPACT.small;
          const nx = lerp(wallX, x * s, e);
          y = lerp(y, y * s, e);
          z = lerp(z, z * s, e);
          x = nx;
          if (compact.fuse) b = Math.max(b, Math.pow(1 - u, 0.6));
        }
      }

      sx[i] = x * scale;
      sy[i] = y * scale;
      sz[i] = z;
      sb[i] = b;
    }

    // painter's order: back to front
    const order = this.order;
    order.sort((a, c) => sz[a] - sz[c]);

    const ctx = this.ctx;
    const W = this.canvas.width;
    const c = W / 2;
    const R = W * 0.4;
    const rd = R * (v.dot || 0.052);
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = this.color;
    for (let j = 0; j < this.n; j++) {
      const i = order[j];
      const depth = clamp((sz[i] + 1) / 2, 0, 1);
      const b = sb[i];
      const a0 = (0.06 + 0.86 * Math.pow(depth, 1.6)) * dim;
      const alpha = a0 + (0.4 + 0.6 * depth - a0) * b;
      if (alpha < 0.01) continue;
      const r = rd * (0.42 + 0.58 * depth) * (1 + 0.9 * b);
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.beginPath();
      ctx.arc(c + sx[i] * R, c - sy[i] * R, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------- runtime

const live = new Set<Orb>();
let raf = 0;
let startTime = 0;
let observer: IntersectionObserver | null = null;
const observed = new WeakMap<Element, Orb>();

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function tick(now: number) {
  const t = (now - startTime) / 1000;
  live.forEach((o) => {
    if (o.visible && !o.paused) o.draw(t);
  });
  raf = live.size ? requestAnimationFrame(tick) : 0;
}

function ensureLoop() {
  if (!raf && live.size) {
    if (!startTime) startTime = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

function getObserver(): IntersectionObserver | null {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const orb = observed.get(e.target);
      if (orb) orb.visible = e.isIntersecting;
    }
  });
  return observer;
}

/** Mount an orb onto a canvas. Call `destroy()` when done. */
export function createOrb(canvas: HTMLCanvasElement, opts: OrbOptions = {}): OrbHandle {
  const orb = new Orb(canvas, opts);
  const still = prefersReducedMotion();
  orb.draw(STILL_FRAME_TIME);

  const io = getObserver();
  if (io) {
    observed.set(canvas, orb);
    io.observe(canvas);
  }
  if (!still) {
    live.add(orb);
    ensureLoop();
  }

  return {
    setVariant(variant) {
      orb.setVariant(variant);
      orb.draw(orb.lastTime);
    },
    setSize(size) {
      orb.size = size;
      orb.resize();
      orb.draw(orb.lastTime);
    },
    setColor(color) {
      orb.color = color;
      orb.draw(orb.lastTime);
    },
    setPaused(paused) {
      orb.paused = paused;
    },
    destroy() {
      live.delete(orb);
      io?.unobserve(canvas);
      observed.delete(canvas);
    },
  };
}
