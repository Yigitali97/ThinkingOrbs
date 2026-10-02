/*
 * Reasoning Orb engine — a slowly turning constellation inside a faint dot
 * shell. Every reasoning step adds a node that grows out from the centre and
 * links to the previous step and to its nearest earlier neighbour. A pulse runs
 * along the newest link; an outer arc fills with the thinking budget.
 */

import { clamp, DotSphere, hexToRgb, loop, reducedMotion, RGB, sizeCanvas, TAU } from '../shared/dots';

export interface ReasoningStep {
  id: string;
  label?: string;
}

export interface ReasoningOrbOptions {
  size?: number;
  steps?: ReasoningStep[];
  /** Still reasoning (orange) vs finished (green). */
  thinking?: boolean;
  /** 0..1 share of the thinking budget used; omit to hide the arc. */
  budget?: number;
}

export interface ReasoningOrbHandle {
  update(opts: ReasoningOrbOptions): void;
  destroy(): void;
}

export const REASONING_COLORS = { thinking: '#ff9a2e', done: '#34d399', over: '#f05252' };

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const SLOTS = 22; // nodes per shell before the next shell starts
const GROW = 0.7; // s

interface Node {
  k: number;
  born: number;
  base: { x: number; y: number; z: number };
  links: number[]; // earlier node indices
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function slot(k: number) {
  const shell = Math.floor(k / SLOTS);
  // stride through the slots (7 is coprime with 22) so consecutive steps spread out
  const j = ((k % SLOTS) * 7 + shell * 3) % SLOTS;
  const y = 1 - (2 * (j + 0.5)) / SLOTS;
  const r = Math.sqrt(1 - y * y);
  const a = j * GOLDEN + shell * 1.3;
  const rad = 0.78 - 0.2 * Math.min(shell, 2); // later shells sit further in
  return { x: Math.cos(a) * r * rad, y: y * rad, z: Math.sin(a) * r * rad };
}

export function createReasoningOrb(canvas: HTMLCanvasElement, opts: ReasoningOrbOptions = {}): ReasoningOrbHandle {
  const maybe = canvas.getContext('2d');
  if (!maybe) throw new Error('ReasoningOrb: 2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybe;
  const o = { size: 280, steps: [] as ReasoningStep[], thinking: true, budget: undefined as number | undefined, ...opts };
  sizeCanvas(canvas, o.size);

  const shell = new DotSphere(150);
  const slow = reducedMotion();
  const nodes: Node[] = [];
  const ids = new Map<string, number>();
  let now = 0;
  let rot = 0;
  let doneMix = o.thinking ? 0 : 1;
  const rgb: RGB = hexToRgb(o.thinking ? REASONING_COLORS.thinking : REASONING_COLORS.done);

  function sync(steps: ReasoningStep[]) {
    if (steps.length < nodes.length || steps.some((s, i) => i < nodes.length && ids.get(s.id) !== i)) {
      // a different chain of thought: start over
      nodes.length = 0;
      ids.clear();
    }
    for (let k = nodes.length; k < steps.length; k++) {
      const base = slot(k);
      const links: number[] = [];
      if (k > 0) links.push(k - 1);
      if (k > 2) {
        // also link to the nearest earlier step (not the previous one)
        let best = -1, bestD = Infinity;
        for (let j = 0; j < k - 1; j++) {
          const b = nodes[j].base;
          const d = (b.x - base.x) ** 2 + (b.y - base.y) ** 2 + (b.z - base.z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
        if (best >= 0) links.push(best);
      }
      nodes.push({ k, born: now, base, links });
      ids.set(steps[k].id, k);
    }
  }
  sync(o.steps);
  // nodes present at mount appear already grown
  for (const n of nodes) n.born = -GROW;

  const stop = loop((dt, t) => {
    now = t;
    doneMix += ((o.thinking ? 0 : 1) - doneMix) * (1 - Math.exp(-4 * dt));
    const over = o.budget != null && o.budget > 0.85 && o.thinking;
    const target = hexToRgb(!o.thinking ? REASONING_COLORS.done : REASONING_COLORS.thinking);
    for (let i = 0; i < 3; i++) rgb[i] += (target[i] - rgb[i]) * (1 - Math.exp(-4 * dt));
    rot += dt * (o.thinking ? 0.35 : 0.12) * (slow ? 0.3 : 1);

    const W = canvas.width;
    const c = W / 2;
    const R = W * 0.36;
    const px = W / o.size;
    const [r, g, b] = rgb.map((v) => Math.round(v));
    ctx.clearRect(0, 0, W, W);

    // halo
    const halo = ctx.createRadialGradient(c, c, R * 0.1, c, c, R * 1.4);
    halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.07 + Math.min(nodes.length, 20) * 0.004})`);
    halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, W);

    // faint shell
    shell.project(rot * 0.6, 0.35, c, c, R);
    shell.draw(ctx, [r, g, b], R * 0.022, 0.22);

    // node positions (rotate around Y, tilt toward the viewer)
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const cT = Math.cos(0.35), sT = Math.sin(0.35);
    const pos = nodes.map((n) => {
      const grow = easeOut(clamp((t - n.born) / GROW, 0, 1));
      const bx = n.base.x * grow, by = n.base.y * grow, bz = n.base.z * grow;
      const x = bx * cr - bz * sr;
      const z0 = bx * sr + bz * cr;
      const y = by * cT - z0 * sT;
      const z = by * sT + z0 * cT;
      const p = 3.4 / (3.4 - z);
      return { x: c + x * p * R, y: c - y * p * R, z, p, grow };
    });

    // links
    ctx.lineCap = 'round';
    nodes.forEach((n, k) => {
      for (const j of n.links) {
        const a = pos[j], q = pos[k];
        const depth = clamp(((a.z + q.z) / 2 + 1) / 2, 0.2, 1);
        ctx.globalAlpha = (0.18 + 0.5 * depth) * q.grow * (j === k - 1 ? 1 : 0.6);
        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.lineWidth = px * (j === k - 1 ? 1.4 : 0.9);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    });

    // pulse travelling along the newest link while thinking
    const last = nodes.length - 1;
    if (o.thinking && last > 0) {
      const a = pos[last - 1], q = pos[last];
      for (let k = 0; k < 3; k++) {
        const u = ((t * 1.1 + k / 3) % 1);
        const x = a.x + (q.x - a.x) * u, y = a.y + (q.y - a.y) * u;
        ctx.globalAlpha = 0.9 * Math.sin(Math.PI * u);
        ctx.fillStyle = '#fff3e0';
        ctx.beginPath();
        ctx.arc(x, y, px * 2.2, 0, TAU);
        ctx.fill();
      }
    }

    // nodes, back to front
    const order = pos.map((_, i) => i).sort((i, j) => pos[i].z - pos[j].z);
    for (const i of order) {
      const q = pos[i];
      const depth = clamp((q.z + 1) / 2, 0.15, 1);
      const active = o.thinking && i === last;
      const fresh = clamp(1 - (t - nodes[i].born) / 1.2, 0, 1);
      const rad = px * (3.2 + 1.6 * depth) * q.p * (active ? 1.35 + 0.15 * Math.sin(t * 6) : 1);
      if (active || fresh > 0) {
        const glowR = rad * (active ? 5 : 3 + 4 * fresh);
        const gg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, glowR);
        gg.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${active ? 0.45 : 0.4 * fresh})`);
        gg.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = gg;
        ctx.fillRect(q.x - glowR, q.y - glowR, glowR * 2, glowR * 2);
      }
      const w = active ? 0.55 : 0.2 * fresh + 0.15;
      ctx.globalAlpha = (0.35 + 0.65 * depth) * q.grow;
      ctx.fillStyle = `rgb(${Math.round(r + (255 - r) * w)}, ${Math.round(g + (255 - g) * w)}, ${Math.round(b + (255 - b) * w)})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, rad, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // thinking budget arc
    if (o.budget != null) {
      const rr = R * 1.28;
      const used = clamp(o.budget, 0, 1);
      ctx.lineWidth = px * 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.beginPath();
      ctx.arc(c, c, rr, 0, TAU);
      ctx.stroke();
      const arcRgb = over ? hexToRgb(REASONING_COLORS.over) : [r, g, b];
      ctx.strokeStyle = `rgba(${arcRgb[0]}, ${arcRgb[1]}, ${arcRgb[2]}, ${0.85 - 0.45 * doneMix})`;
      ctx.lineWidth = px * 2.4;
      ctx.beginPath();
      ctx.arc(c, c, rr, -Math.PI / 2, -Math.PI / 2 + used * TAU);
      ctx.stroke();
      // head of the arc
      if (used > 0 && used < 1) {
        const a = -Math.PI / 2 + used * TAU;
        ctx.fillStyle = `rgb(${arcRgb[0]}, ${arcRgb[1]}, ${arcRgb[2]})`;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * rr, c + Math.sin(a) * rr, px * 3, 0, TAU);
        ctx.fill();
      }
    }
  });

  return {
    update(next) {
      const sizeChanged = next.size != null && next.size !== o.size;
      Object.assign(o, next);
      if (sizeChanged) sizeCanvas(canvas, o.size);
      if (next.steps) sync(next.steps);
    },
    destroy: stop,
  };
}
