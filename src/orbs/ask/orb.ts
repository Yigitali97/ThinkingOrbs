/*
 * Stage orb — a sphere of dots laid out on latitude rings, seen from slightly
 * above. Each agent stage lights it differently; `done` washes it green.
 */

export type AgentStage = 'thinking' | 'searching' | 'analyzing' | 'composing';

export interface StageOrbHandle {
  setStage(stage: AgentStage): void;
  /** Wash the dots green (true) or back to white (false). */
  setDone(done: boolean): void;
  destroy(): void;
}

const TAU = Math.PI * 2;
const RINGS = 14;
// rings stop short of the north pole, so the top reads as a flat rim like the reference
const LAT_MIN = (-84 * Math.PI) / 180;
const LAT_MAX = (60 * Math.PI) / 180;
const PER_RING = 34;
const TILT = 0.42; // view from above
const SPIN = 0.32; // rad/s
const FOCAL = 3.6; // mild perspective
const WHITE: [number, number, number] = [236, 236, 238];
const GREEN: [number, number, number] = [52, 211, 153];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

interface Dot {
  y: number; // local latitude height
  r: number; // ring radius
  lon: number;
}

function rings(): Dot[] {
  const dots: Dot[] = [];
  for (let i = 0; i < RINGS; i++) {
    const lat = LAT_MIN + ((LAT_MAX - LAT_MIN) * i) / (RINGS - 1);
    const y = Math.sin(lat), r = Math.cos(lat);
    const n = Math.max(6, Math.round(PER_RING * r));
    const offset = (i % 2) * (Math.PI / n); // stagger rings
    for (let k = 0; k < n; k++) dots.push({ y, r, lon: (k / n) * TAU + offset });
  }
  return dots;
}

function wander(t: number): [number, number, number] {
  const x = 0.55 * Math.sin(t * 0.9 + 0.4) + 0.12 * Math.sin(t * 2.1);
  const y = 0.45 * Math.sin(t * 1.25 + 1.1) + 0.1 * Math.sin(t * 1.9 + 2);
  return [x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))];
}

// Brightness boost (0..1) for a dot under the current stage.
function boost(stage: AgentStage, t: number, ly: number, lon: number, vx: number, vy: number, vz: number): number {
  switch (stage) {
    case 'thinking': {
      const yc = 1.15 - 2.3 * ((t % 1.05) / 1.05);
      const d = (ly - yc) / 0.13;
      return Math.exp(-d * d);
    }
    case 'searching': {
      const L = wander(t * 0.9);
      const dx = vx - L[0], dy = vy - L[1], dz = vz - L[2];
      return Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * 0.3 * 0.3));
    }
    case 'analyzing': {
      // slower, sharper scan line with a soft tail above it
      const yc = 1.1 - 2.2 * ((t % 1.4) / 1.4);
      const d = ly - yc;
      return d >= 0 ? Math.exp(-d / 0.16) : Math.exp(-(d * d) / (2 * 0.04 * 0.04));
    }
    case 'composing': {
      const yc = 1.15 - 2.3 * ((t % 1.25) / 1.25);
      const d = (ly - yc) / 0.2;
      const column = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.cos(lon * 6), 2);
      return Math.exp(-d * d) * column;
    }
  }
}

export function createStageOrb(canvas: HTMLCanvasElement, size: number): StageOrbHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('StageOrb: 2D canvas context unavailable');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';

  const dots = rings();
  const n = dots.length;
  const sx = new Float32Array(n), sy = new Float32Array(n), sz = new Float32Array(n);
  const sr = new Float32Array(n), sb = new Float32Array(n), sc = new Float32Array(n);
  const order = new Uint16Array(n);
  for (let i = 0; i < n; i++) order[i] = i;

  let stage: AgentStage = 'thinking';
  let stageSince = performance.now() / 1000;
  let doneTarget = 0;
  let doneMix = 0;
  const cT = Math.cos(TILT), sT = Math.sin(TILT);

  let raf = 0;
  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    const st = t - stageSince;
    doneMix += (doneTarget - doneMix) * (1 - Math.exp(-5 * dt));
    const rot = t * SPIN;

    for (let i = 0; i < n; i++) {
      const d = dots[i];
      const lon = d.lon + rot;
      const lx = d.r * Math.cos(lon), lz = d.r * Math.sin(lon), ly = d.y;
      // tilt the top toward the viewer
      const vy = ly * cT - lz * sT;
      const vz = ly * sT + lz * cT;
      const vx = lx;
      const p = FOCAL / (FOCAL - vz);
      sx[i] = vx * p;
      sy[i] = vy * p;
      sz[i] = vz;
      sr[i] = p;
      // fade the stage highlight out while turning green
      sb[i] = boost(stage, st, ly, d.lon + rot, vx, vy, vz) * (1 - doneMix);
      // green washes in from the top down
      sc[i] = clamp(doneMix * 1.8 - (1 - ly) * 0.4, 0, 1);
    }
    order.sort((a, b) => sz[a] - sz[b]);

    const W = canvas.width;
    const c = W / 2;
    const R = W * 0.4;
    const rd = R * 0.031;
    ctx!.clearRect(0, 0, W, W);
    for (let j = 0; j < n; j++) {
      const i = order[j];
      const depth = clamp((sz[i] + 1) / 2, 0, 1);
      const b = sb[i];
      const base = (0.14 + 0.56 * Math.pow(depth, 1.4)) * (1 - 0.22 * (1 - doneMix));
      const alpha = clamp(base + (0.35 + 0.65 * depth - base) * b + doneMix * 0.35 * depth, 0, 1);
      const r = rd * sr[i] * (0.55 + 0.6 * depth) * (1 + 0.85 * b);
      const k = sc[i];
      ctx!.fillStyle = `rgb(${Math.round(WHITE[0] + (GREEN[0] - WHITE[0]) * k)}, ${Math.round(WHITE[1] + (GREEN[1] - WHITE[1]) * k)}, ${Math.round(WHITE[2] + (GREEN[2] - WHITE[2]) * k)})`;
      ctx!.globalAlpha = alpha;
      ctx!.beginPath();
      ctx!.arc(c + sx[i] * R, c - sy[i] * R, r, 0, TAU);
      ctx!.fill();
    }
    ctx!.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  frame(performance.now());

  return {
    setStage(next) {
      if (next === stage) return;
      stage = next;
      stageSince = performance.now() / 1000;
    },
    setDone(done) {
      doneTarget = done ? 1 : 0;
    },
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}
