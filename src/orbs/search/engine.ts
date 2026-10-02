/*
 * Search Orb engine — a dot-sphere core that gathers sources. While
 * searching, radar pings pulse out and each new source flies in from the edge
 * into orbit; ranking compares them (better scores orbit closer); synthesizing
 * pulls them into the core one by one, best first.
 */

import { clamp, DotSphere, hexToRgb, loop, reducedMotion, RGB, sizeCanvas, TAU } from '../shared/dots';

export type SearchPhase = 'idle' | 'searching' | 'ranking' | 'synthesizing' | 'done' | 'empty';

export interface SearchSource {
  id: string;
  /** e.g. "nytimes.com" — its first letter becomes the badge when there's no icon. */
  domain?: string;
  /** Favicon / logo URL, drawn in a circle once loaded. */
  icon?: string;
  /** 0..1 relevance; higher scores orbit closer and are absorbed first. */
  score?: number;
}

export interface SearchOrbOptions {
  size?: number;
  phase?: SearchPhase;
  sources?: SearchSource[];
}

export interface SearchOrbHandle {
  update(opts: SearchOrbOptions): void;
  destroy(): void;
}

export const SEARCH_COLORS: Record<SearchPhase, string> = {
  idle: '#9a9aa3',
  searching: '#a78bfa',
  ranking: '#a78bfa',
  synthesizing: '#c4b5fd',
  done: '#34d399',
  empty: '#6b6b75',
};

type SrcState = 'flying' | 'orbit' | 'absorbing';

interface Src {
  id: string;
  domain?: string;
  img?: HTMLImageElement;
  imgReady: boolean;
  score: number;
  slot: number; // orbit angle offset
  lift: number; // vertical offset for a 3D cloud
  radius: number; // current orbit radius (eases toward its rank radius)
  state: SrcState;
  since: number;
  from: { x: number; y: number }; // where it flew in from (screen, unit = core radius)
  absorbFrom?: { x: number; y: number; z: number };
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const FLY = 0.9; // s
const ABSORB = 0.5; // s
const ABSORB_GAP = 0.2; // s between absorptions

export function createSearchOrb(canvas: HTMLCanvasElement, opts: SearchOrbOptions = {}): SearchOrbHandle {
  const maybe = canvas.getContext('2d');
  if (!maybe) throw new Error('SearchOrb: 2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybe;
  const o = { size: 260, phase: 'idle' as SearchPhase, sources: [] as SearchSource[], ...opts };
  sizeCanvas(canvas, o.size);

  const core = new DotSphere(200);
  const slow = reducedMotion();
  const srcs = new Map<string, Src>();
  let arrivals = 0;
  let now = 0;
  let rot = 0;
  let flash = 0;
  let absorbed = 0; // count pulled in during this synthesis
  let nextAbsorb = 0;
  let emptySince = -1;
  let phaseSince = 0;
  let shownPhase = o.phase;
  const rgb: RGB = hexToRgb(SEARCH_COLORS[o.phase]);

  function sync(list: SearchSource[]) {
    if (list.length === 0) {
      // a fresh search: clear instantly rather than animating
      srcs.clear();
      arrivals = 0;
      return;
    }
    const ids = new Set(list.map((s) => s.id));
    for (const s of list) {
      const existing = srcs.get(s.id);
      if (existing) {
        if (s.score != null) existing.score = s.score;
        continue;
      }
      const k = arrivals++;
      const edge = Math.random() * TAU;
      const src: Src = {
        id: s.id,
        domain: s.domain,
        imgReady: false,
        score: s.score ?? 0.5,
        slot: k * GOLDEN * 2.3,
        lift: ((k * 0.618) % 1) * 2 - 1,
        radius: 2.4,
        state: 'flying',
        since: now,
        from: { x: Math.cos(edge) * 3.4, y: Math.sin(edge) * 3.4 },
      };
      if (s.icon) {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => (src.imgReady = true);
        img.src = s.icon;
        src.img = img;
      }
      srcs.set(s.id, src);
    }
    // sources dropped from the list fade out by being absorbed
    for (const src of srcs.values()) if (!ids.has(src.id) && src.state !== 'absorbing') startAbsorb(src);
  }

  function rankRadius(src: Src) {
    return 2.35 - 0.85 * clamp(src.score, 0, 1);
  }

  // 3D position on the orbit cloud, in core radii
  function orbitPos(src: Src, t: number) {
    const a = src.slot + t * 0.35 * (slow ? 0.3 : 1);
    const r = src.radius;
    const x = Math.cos(a) * r;
    const zf = Math.sin(a) * r;
    const y = src.lift * 0.45 + zf * -0.32; // ring tilted toward the viewer
    const z = zf * 0.95;
    return { x, y, z };
  }

  const project = (p: { x: number; y: number; z: number }) => {
    const persp = 3.6 / (3.6 - p.z * 0.45);
    return { x: p.x * persp, y: p.y * persp, persp };
  };

  function startAbsorb(src: Src) {
    const p = src.state === 'flying' ? { x: 0, y: 0, z: 0 } : orbitPos(src, now);
    src.absorbFrom = p;
    src.state = 'absorbing';
    src.since = now;
  }

  sync(o.sources);

  const stop = loop((dt, t) => {
    now = t;
    if (o.phase !== shownPhase) {
      shownPhase = o.phase;
      phaseSince = t;
      if (o.phase === 'synthesizing') {
        absorbed = 0;
        nextAbsorb = t + 0.15;
      }
      if (o.phase === 'empty') emptySince = t;
    }
    const target = hexToRgb(SEARCH_COLORS[o.phase]);
    for (let i = 0; i < 3; i++) rgb[i] += (target[i] - rgb[i]) * (1 - Math.exp(-4 * dt));
    flash *= Math.exp(-4 * dt);

    const busy = o.phase === 'searching' || o.phase === 'ranking' || o.phase === 'synthesizing';
    rot += dt * (busy ? 0.9 : o.phase === 'empty' ? 0.08 : 0.25) * (slow ? 0.3 : 1);

    // synthesis (or jumping straight to done): pull the best remaining source in, one at a time
    if ((o.phase === 'synthesizing' || o.phase === 'done') && t >= nextAbsorb) {
      const waiting = [...srcs.values()].filter((s) => s.state === 'orbit').sort((a, b) => b.score - a.score);
      if (waiting[0]) {
        startAbsorb(waiting[0]);
        nextAbsorb = t + (o.phase === 'done' ? ABSORB_GAP / 2 : ABSORB_GAP);
      }
    }

    const W = canvas.width;
    const c = W / 2;
    const Rc = W * 0.15;
    const px = W / o.size;

    ctx.clearRect(0, 0, W, W);
    const [r, g, b] = rgb.map((v) => Math.round(v));

    // halo
    const settled = o.phase === 'synthesizing' || o.phase === 'done' ? Math.min(1, absorbed / Math.max(1, srcs.size + absorbed)) : 0;
    const glow = ctx.createRadialGradient(c, c, Rc * 0.4, c, c, Rc * 3.2);
    glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.16 + 0.2 * flash + 0.12 * settled})`);
    glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, W);

    // radar pings while searching; one wide sweep for an empty result
    const ping = (age: number, span: number, alpha: number) => {
      if (age < 0 || age > span) return;
      const e = age / span;
      ctx.beginPath();
      ctx.arc(c, c, Rc * (1.05 + 2.1 * easeOut(e)), 0, TAU);
      ctx.lineWidth = px * 1.4;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * (1 - e)})`;
      ctx.stroke();
    };
    if (o.phase === 'searching') {
      const period = 1.4;
      const base = Math.floor((t - phaseSince) / period);
      for (let k = 0; k < 2; k++) ping(t - phaseSince - (base - k) * period, period * 1.4, 0.55);
    }
    if (o.phase === 'empty' && emptySince >= 0) ping(t - emptySince, 1.6, 0.7);

    // sources: compute screen positions
    const items: Array<{ src: Src; x: number; y: number; z: number; s: number; a: number; hi: number }> = [];
    const order = [...srcs.values()];
    const rankingIndex = o.phase === 'ranking' && order.length ? Math.floor((t - phaseSince) * 7) % order.length : -1;
    order.forEach((src, idx) => {
      const age = t - src.since;
      if (o.phase === 'ranking' || o.phase === 'synthesizing') src.radius += (rankRadius(src) - src.radius) * (1 - Math.exp(-3 * dt));
      else src.radius += (2.2 - src.radius) * (1 - Math.exp(-3 * dt));

      if (src.state === 'flying') {
        const u = clamp(age / FLY, 0, 1);
        const e = easeOut(u);
        const dest = project(orbitPos(src, t));
        // curve in, bending to the side
        const bend = Math.sin(Math.PI * u) * 0.6;
        const dx = dest.x - src.from.x, dy = dest.y - src.from.y;
        const x = src.from.x + dx * e - dy * bend * 0.25;
        const y = src.from.y + dy * e + dx * bend * 0.25;
        items.push({ src, x, y, z: 0.5, s: dest.persp * (0.7 + 0.3 * e), a: clamp(u * 2.2, 0, 1), hi: 1 - e });
        if (u >= 1) src.state = 'orbit';
      } else if (src.state === 'orbit') {
        const p = orbitPos(src, t);
        const q = project(p);
        items.push({ src, x: q.x, y: q.y, z: p.z, s: q.persp, a: 1, hi: idx === rankingIndex ? 1 : 0 });
      } else {
        const u = clamp(age / ABSORB, 0, 1);
        const e = easeIn(u);
        const f = src.absorbFrom!;
        const q = project({ x: f.x * (1 - e), y: f.y * (1 - e), z: f.z * (1 - e) });
        items.push({ src, x: q.x, y: q.y, z: f.z * (1 - e), s: q.persp * (1 - 0.6 * e), a: 1 - 0.3 * e, hi: e });
        if (u >= 1) {
          srcs.delete(src.id);
          absorbed++;
          flash = 1;
        }
      }
    });

    const drawSource = (it: (typeof items)[number]) => {
      const sx = c + it.x * Rc, sy = c - it.y * Rc;
      const depth = clamp((it.z / 2.4 + 1) / 2, 0.35, 1);
      const rad = px * 9.5 * it.s * (1 + 0.3 * it.hi);
      const alpha = it.a * depth;
      // glow
      const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad * 2.6);
      halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.35 * alpha * (0.6 + 0.4 * it.hi)})`);
      halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(sx - rad * 2.6, sy - rad * 2.6, rad * 5.2, rad * 5.2);

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, TAU);
      if (it.src.img && it.src.imgReady) {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.drawImage(it.src.img, sx - rad * 0.8, sy - rad * 0.8, rad * 1.6, rad * 1.6);
        ctx.restore();
      } else {
        ctx.fillStyle = `rgb(${Math.round(30 + r * 0.2)}, ${Math.round(28 + g * 0.18)}, ${Math.round(40 + b * 0.22)})`;
        ctx.fill();
        ctx.lineWidth = px * 1.2;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.9})`;
        ctx.stroke();
        const letter = (it.src.domain ?? '').replace(/^www\./, '').charAt(0).toUpperCase();
        if (letter && rad > px * 4.5) {
          ctx.fillStyle = '#ece9ff';
          ctx.font = `600 ${Math.round(rad * 1.05)}px Inter, -apple-system, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(letter, sx, sy + rad * 0.05);
        }
      }
      ctx.globalAlpha = 1;
    };

    // back sources, core, front sources
    items.sort((a, b) => a.z - b.z);
    for (const it of items) if (it.z < 0) drawSource(it);

    const dim = o.phase === 'empty' ? 0.45 : o.phase === 'idle' ? 0.7 : 0.85;
    const coreScale = (o.phase === 'empty' ? 0.88 : 1) * (1 + 0.08 * flash + 0.06 * settled);
    for (let i = 0; i < core.n; i++) core.boost[i] = Math.max(core.boost[i] * Math.exp(-4 * dt), flash * 0.7 * (0.5 + 0.5 * Math.sin(core.phase[i] * 3)));
    core.project(rot, 0.4, c, c, Rc * coreScale);
    core.draw(ctx, [r, g, b], Rc * 0.05, dim + 0.15 * settled);

    for (const it of items) if (it.z >= 0) drawSource(it);
  });

  return {
    update(next) {
      const sizeChanged = next.size != null && next.size !== o.size;
      Object.assign(o, next);
      if (sizeChanged) sizeCanvas(canvas, o.size);
      if (next.sources) sync(next.sources);
    },
    destroy: stop,
  };
}
