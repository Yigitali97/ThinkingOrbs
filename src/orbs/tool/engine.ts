/*
 * Tool Orb engine — a dot-sphere core with one satellite per tool call.
 * Running tools orbit on their own tilted paths; a finished tool spirals in
 * and docks with a flash; a failed one turns red and drifts away.
 */

import { clamp, DotSphere, hexToRgb, loop, reducedMotion, RGB, sizeCanvas, TAU } from '../shared/dots';

export type ToolStatus = 'running' | 'done' | 'error';

export interface ToolCall {
  id: string;
  label?: string;
  status: ToolStatus;
  /** Satellite color (hex); assigned from a palette when omitted. */
  color?: string;
}

export interface ToolOrbOptions {
  size?: number;
  tools?: ToolCall[];
}

export interface ToolOrbHandle {
  update(opts: ToolOrbOptions): void;
  destroy(): void;
}

export const TOOL_COLORS = ['#38bdf8', '#a78bfa', '#fbbf24', '#f472b6', '#4ade80', '#fb923c'];
const ERROR: RGB = [240, 82, 82];
const CORE: RGB = [223, 227, 236];

type Phase = 'enter' | 'orbit' | 'dock' | 'fail';

interface Satellite {
  id: string;
  rgb: RGB;
  radius: number; // orbit radius in core radii
  inc: number; // orbit inclination
  node: number; // orbit orientation
  speed: number;
  angle: number;
  phase: Phase;
  since: number;
  trail: Array<{ x: number; y: number; z: number }>;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;

export function createToolOrb(canvas: HTMLCanvasElement, opts: ToolOrbOptions = {}): ToolOrbHandle {
  const maybe = canvas.getContext('2d');
  if (!maybe) throw new Error('ToolOrb: 2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybe;
  const o = { size: 200, tools: [] as ToolCall[], ...opts };
  sizeCanvas(canvas, o.size);

  const core = new DotSphere(170);
  const slow = reducedMotion();
  const sats = new Map<string, Satellite>();
  let created = 0;
  let flash = 0;
  let flashRgb: RGB = [255, 255, 255];
  let rot = 0;
  let now = 0;

  function sync(tools: ToolCall[]) {
    const ids = new Set(tools.map((tool) => tool.id));
    for (const tool of tools) {
      let s = sats.get(tool.id);
      if (!s && tool.status === 'running') {
        const k = created++;
        s = {
          id: tool.id,
          rgb: hexToRgb(tool.color ?? TOOL_COLORS[k % TOOL_COLORS.length]),
          radius: 1.55 + 0.22 * (k % 3),
          inc: 0.5 + ((k * 0.73) % 1) * 0.9,
          node: (k * 2.39996) % TAU,
          speed: (1.5 + ((k * 0.37) % 1)) * (k % 2 ? -1 : 1),
          angle: Math.random() * TAU,
          phase: 'enter',
          since: now,
          trail: [],
        };
        sats.set(tool.id, s);
      }
      if (!s) continue;
      if (tool.status === 'done' && (s.phase === 'enter' || s.phase === 'orbit')) {
        s.phase = 'dock';
        s.since = now;
      }
      if (tool.status === 'error' && s.phase !== 'fail') {
        s.phase = 'fail';
        s.since = now;
      }
    }
    // tools removed while still running dock quietly
    for (const s of sats.values()) {
      if (!ids.has(s.id) && (s.phase === 'enter' || s.phase === 'orbit')) {
        s.phase = 'dock';
        s.since = now;
      }
    }
  }
  sync(o.tools);

  // a satellite's 3D position on its tilted orbit, in core radii
  function position(s: Satellite, r: number, a: number) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const ci = Math.cos(s.inc), si = Math.sin(s.inc);
    const y1 = -z * si, z1 = z * ci;
    const cn = Math.cos(s.node), sn = Math.sin(s.node);
    return { x: x * cn - y1 * sn, y: x * sn + y1 * cn, z: z1 };
  }

  const stop = loop((dt, t) => {
    now = t;
    const running = [...sats.values()].filter((s) => s.phase === 'enter' || s.phase === 'orbit').length;
    rot += dt * (0.3 + 0.35 * Math.min(running, 4)) * (slow ? 0.3 : 1);
    flash *= Math.exp(-3 * dt);

    const W = canvas.width;
    const c = W / 2;
    const Rc = W * 0.19;
    const px = W / o.size;

    // advance satellites
    const drawn: Array<{ x: number; y: number; z: number; rgb: RGB; alpha: number; size: number; trail: Satellite['trail'] }> = [];
    for (const s of [...sats.values()]) {
      const age = t - s.since;
      let r = s.radius, alpha = 1, rgb = s.rgb, size = 1;
      if (s.phase === 'enter') {
        const e = easeOut(clamp(age / 0.55, 0, 1));
        r = 0.6 + (s.radius - 0.6) * e;
        alpha = e;
        if (age >= 0.55) s.phase = 'orbit';
      } else if (s.phase === 'dock') {
        const e = easeIn(clamp(age / 0.65, 0, 1));
        r = s.radius + (0.7 - s.radius) * e;
        size = 1 + 0.6 * e;
        if (age >= 0.65) {
          flash = 1;
          flashRgb = s.rgb;
          sats.delete(s.id);
          continue;
        }
      } else if (s.phase === 'fail') {
        const e = clamp(age / 0.9, 0, 1);
        r = s.radius + 0.9 * easeOut(e);
        alpha = 1 - e;
        rgb = [s.rgb[0] + (ERROR[0] - s.rgb[0]) * Math.min(1, e * 3), s.rgb[1] + (ERROR[1] - s.rgb[1]) * Math.min(1, e * 3), s.rgb[2] + (ERROR[2] - s.rgb[2]) * Math.min(1, e * 3)];
        if (e >= 1) {
          sats.delete(s.id);
          continue;
        }
      }
      const spin = s.phase === 'dock' ? 2.6 : s.phase === 'fail' ? 0.4 : 1;
      s.angle += dt * s.speed * spin * (slow ? 0.3 : 1);
      const p = position(s, r, s.angle);
      s.trail.unshift(p);
      if (s.trail.length > 9) s.trail.pop();
      drawn.push({ ...p, rgb, alpha, size, trail: s.trail });
    }

    ctx.clearRect(0, 0, W, W);

    const satellite = (d: (typeof drawn)[number]) => {
      const [r, g, b] = d.rgb.map((v) => Math.round(v));
      for (let k = d.trail.length - 1; k >= 0; k--) {
        const q = d.trail[k];
        const persp = 3.4 / (3.4 - q.z * 0.6);
        const depth = clamp((q.z / 2.2 + 1) / 2, 0.25, 1);
        ctx.globalAlpha = d.alpha * depth * (k === 0 ? 1 : 0.35 * (1 - k / d.trail.length));
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath();
        ctx.arc(c + q.x * Rc * persp, c - q.y * Rc * persp, px * (k === 0 ? 4.2 : 2.6) * d.size * persp, 0, TAU);
        ctx.fill();
      }
      // glow around the head
      const q = d.trail[0];
      const persp = 3.4 / (3.4 - q.z * 0.6);
      const gx = c + q.x * Rc * persp, gy = c - q.y * Rc * persp;
      const halo = ctx.createRadialGradient(gx, gy, 0, gx, gy, px * 14 * d.size);
      halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.35 * d.alpha})`);
      halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = halo;
      ctx.fillRect(gx - px * 14 * d.size, gy - px * 14 * d.size, px * 28 * d.size, px * 28 * d.size);
    };

    // satellites behind the core first
    for (const d of drawn) if (d.z < 0) satellite(d);

    // core: brighter and busier with more tools running, flashes on dock
    for (let i = 0; i < core.n; i++) core.boost[i] = flash * (0.6 + 0.4 * Math.sin(core.phase[i] + t * 8));
    core.project(rot, 0.38, c, c, Rc * (1 + 0.06 * flash));
    const tint: RGB = [
      Math.round(CORE[0] + (flashRgb[0] - CORE[0]) * flash * 0.7),
      Math.round(CORE[1] + (flashRgb[1] - CORE[1]) * flash * 0.7),
      Math.round(CORE[2] + (flashRgb[2] - CORE[2]) * flash * 0.7),
    ];
    core.draw(ctx, tint, Rc * 0.045, 0.7 + 0.08 * Math.min(running, 4));

    for (const d of drawn) if (d.z >= 0) satellite(d);
    ctx.globalAlpha = 1;
  });

  return {
    update(next) {
      const sizeChanged = next.size != null && next.size !== o.size;
      Object.assign(o, next);
      if (sizeChanged) sizeCanvas(canvas, o.size);
      if (next.tools) sync(next.tools);
    },
    destroy: stop,
  };
}
