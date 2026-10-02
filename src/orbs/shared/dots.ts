/** Shared helpers for the dot-sphere orbs: geometry, projection and drawing. */

export type RGB = [number, number, number];

export const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function hexToRgb(hex: string): RGB {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((ch) => ch + ch).join('') : m;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Size a canvas for crisp drawing; returns the device-pixel ratio used. */
export function sizeCanvas(canvas: HTMLCanvasElement, size: number, maxDpr = 2.5) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  return dpr;
}

/** Size a non-square canvas; returns the device-pixel ratio used. */
export function sizeCanvasRect(canvas: HTMLCanvasElement, width: number, height: number, maxDpr = 2.5) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  return dpr;
}

/** requestAnimationFrame loop with a clamped delta; returns a stop function. */
export function loop(frame: (dt: number, t: number) => void) {
  let raf = 0;
  const start = performance.now();
  let last = start;
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt, (now - start) / 1000);
    raf = requestAnimationFrame(tick);
  };
  tick(performance.now());
  return () => cancelAnimationFrame(raf);
}

/**
 * A Fibonacci sphere of dots. Call `project` each frame (optionally pushing
 * dots in/out with `disp`), then `draw`.
 */
export class DotSphere {
  readonly n: number;
  readonly x0: Float32Array;
  readonly y0: Float32Array;
  readonly z0: Float32Array;
  /** stable per-dot random phase, 0..TAU */
  readonly phase: Float32Array;
  readonly sx: Float32Array;
  readonly sy: Float32Array;
  readonly sz: Float32Array;
  readonly sp: Float32Array;
  /** per-dot highlight 0..1, written by the caller */
  readonly boost: Float32Array;
  /** dot indices sorted back to front after `project` */
  readonly order: Uint16Array;

  constructor(n: number) {
    this.n = n;
    this.x0 = new Float32Array(n);
    this.y0 = new Float32Array(n);
    this.z0 = new Float32Array(n);
    this.phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      this.x0[i] = Math.cos(i * GOLDEN) * r;
      this.y0[i] = y;
      this.z0[i] = Math.sin(i * GOLDEN) * r;
      this.phase[i] = (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1 * TAU;
    }
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    this.sz = new Float32Array(n);
    this.sp = new Float32Array(n);
    this.boost = new Float32Array(n);
    this.order = new Uint16Array(n);
    for (let i = 0; i < n; i++) this.order[i] = i;
  }

  /** Rotate by `rot` around the axis, tilt toward the viewer, project to screen. */
  project(rot: number, tilt: number, cx: number, cy: number, R: number, disp?: (i: number, z: number) => number) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const cT = Math.cos(tilt), sT = Math.sin(tilt);
    const focal = 3.4;
    for (let i = 0; i < this.n; i++) {
      const lx = this.x0[i] * cr - this.z0[i] * sr;
      const lz = this.x0[i] * sr + this.z0[i] * cr;
      const ly = this.y0[i];
      const y = ly * cT - lz * sT;
      const z = ly * sT + lz * cT;
      const s = disp ? 1 + disp(i, z) : 1;
      const p = focal / (focal - z * s);
      this.sx[i] = cx + lx * s * p * R;
      this.sy[i] = cy - y * s * p * R;
      this.sz[i] = z * s;
      this.sp[i] = p;
    }
    const sz = this.sz;
    this.order.sort((a, b) => sz[a] - sz[b]);
  }

  /** Draw back to front; boosted dots grow and run hotter toward white. */
  draw(ctx: CanvasRenderingContext2D, rgb: RGB, dotR: number, dim = 1) {
    const [r, g, b] = rgb;
    for (let j = 0; j < this.n; j++) {
      const i = this.order[j];
      const depth = clamp((this.sz[i] + 1) / 2, 0, 1);
      const bo = clamp(this.boost[i], 0, 1);
      const alpha = clamp((0.08 + 0.8 * Math.pow(depth, 1.5) + 0.4 * bo * depth) * dim, 0, 1);
      if (alpha < 0.01) continue;
      const w = 0.5 * bo;
      ctx.fillStyle = `rgb(${Math.round(r + (255 - r) * w)}, ${Math.round(g + (255 - g) * w)}, ${Math.round(b + (255 - b) * w)})`;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(this.sx[i], this.sy[i], dotR * this.sp[i] * (0.5 + 0.6 * depth) * (1 + 0.6 * bo), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
