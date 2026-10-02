/*
 * Ingest Orb engine — a file card made of dots on the left and a dot sphere
 * on the right. As `progress` rises, dots peel off the card (top first) and
 * arc into the sphere. Then the sphere reads (scan band), and turns green when
 * done; on error the remaining card dots turn red and the card shakes.
 */

import { clamp, DotSphere, hexToRgb, loop, reducedMotion, RGB, sizeCanvasRect, TAU } from '../shared/dots';

export type IngestStatus = 'uploading' | 'reading' | 'done' | 'error';
export type IngestKind = 'file' | 'pdf' | 'doc' | 'sheet' | 'image' | 'video' | 'audio' | 'code';

export interface IngestOrbOptions {
  width?: number;
  height?: number;
  /** 0..1 — how much of the file has been taken in. */
  progress?: number;
  status?: IngestStatus;
  kind?: IngestKind;
  /** Badge text on the card, e.g. "PDF" (defaults from `kind`). */
  badge?: string;
}

export interface IngestOrbHandle {
  update(opts: IngestOrbOptions): void;
  destroy(): void;
}

export const KIND_COLORS: Record<IngestKind, string> = {
  file: '#94a3b8',
  pdf: '#f87171',
  doc: '#60a5fa',
  sheet: '#4ade80',
  image: '#f472b6',
  video: '#fb923c',
  audio: '#a78bfa',
  code: '#facc15',
};
const KIND_BADGE: Record<IngestKind, string> = {
  file: 'FILE',
  pdf: 'PDF',
  doc: 'DOC',
  sheet: 'XLS',
  image: 'IMG',
  video: 'MP4',
  audio: 'MP3',
  code: '</>',
};
const STATUS_COLORS: Record<IngestStatus, string> = {
  uploading: '#2dd4bf',
  reading: '#2dd4bf',
  done: '#34d399',
  error: '#f05252',
};

const COLS = 11;
const ROWS = 14;
const FLIGHT = 0.8; // s

interface Particle {
  u: number; // position within the card, 0..1
  v: number;
  release: number; // progress at which it leaves
  state: 0 | 1 | 2; // on card · flying · absorbed
  since: number;
  target: number; // sphere dot it lands on
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createIngestOrb(canvas: HTMLCanvasElement, opts: IngestOrbOptions = {}): IngestOrbHandle {
  const maybe = canvas.getContext('2d');
  if (!maybe) throw new Error('IngestOrb: 2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybe;
  const o = { width: 360, height: 220, progress: 0, status: 'uploading' as IngestStatus, kind: 'file' as IngestKind, ...opts };
  sizeCanvasRect(canvas, o.width, o.height);

  const sphere = new DotSphere(220);
  const slow = reducedMotion();
  const particles: Particle[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const u = (col + 0.5) / COLS, v = (row + 0.5) / ROWS;
      if (u > 0.7 && v < 0.22 && u - 0.7 > v * 1.36) continue; // folded corner
      particles.push({ u, v, release: 0.04 + 0.86 * v + 0.1 * Math.random(), state: 0, since: 0, target: 0 });
    }
  }

  const rgb: RGB = hexToRgb(STATUS_COLORS[o.status]);
  let rot = 0;
  let shake = 0;
  let shownStatus = o.status;

  const stop = loop((dt, t) => {
    if (o.status !== shownStatus) {
      if (o.status === 'error') shake = 1;
      shownStatus = o.status;
    }
    shake *= Math.exp(-3 * dt);
    const target = hexToRgb(STATUS_COLORS[o.status]);
    for (let i = 0; i < 3; i++) rgb[i] += (target[i] - rgb[i]) * (1 - Math.exp(-4 * dt));
    for (let i = 0; i < sphere.n; i++) sphere.boost[i] *= Math.exp(-3 * dt);

    const progress = o.status === 'reading' || o.status === 'done' ? 1 : clamp(o.progress, 0, 1);
    const W = canvas.width, H = canvas.height;
    const px = W / o.width;

    // card geometry
    const cw = H * 0.42, ch = H * 0.56;
    const cx0 = W * 0.24 - cw / 2 + shake * Math.sin(t * 60) * px * 5, cy0 = H * 0.5 - ch / 2;
    // sphere geometry
    const scx = W * 0.7, scy = H * 0.5, sR = H * 0.3;

    // sphere: reading scans, done glows; more absorbed → brighter
    let absorbed = 0;
    for (const p of particles) if (p.state === 2) absorbed++;
    const fill = absorbed / particles.length;
    const busy = o.status === 'reading' ? 1 : o.status === 'uploading' ? 0.5 : 0.15;
    rot += dt * (0.25 + 0.9 * busy) * (slow ? 0.3 : 1);
    if (o.status === 'reading') {
      const band = 1.2 - 2.4 * ((t % 1.2) / 1.2);
      for (let i = 0; i < sphere.n; i++) {
        const d = (sphere.y0[i] - band) / 0.14;
        sphere.boost[i] = Math.max(sphere.boost[i], Math.exp(-d * d));
      }
    }
    sphere.project(rot, 0.38, scx, scy, sR * (1 + 0.04 * fill));

    // particles
    const kindRgb = hexToRgb(KIND_COLORS[o.kind]);
    const cardDot = (p: Particle) => ({ x: cx0 + p.u * cw, y: cy0 + p.v * ch });
    ctx.clearRect(0, 0, W, H);

    // halo behind the sphere
    const [r, g, b] = rgb.map((v) => Math.round(v));
    const halo = ctx.createRadialGradient(scx, scy, sR * 0.3, scx, scy, sR * 1.8);
    halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.08 + 0.14 * fill})`);
    halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // card outline fades as it empties
    const remaining = particles.filter((p) => p.state === 0).length / particles.length;
    if (remaining > 0.01) {
      const fold = cw * 0.3, rr = px * 8;
      ctx.beginPath();
      ctx.moveTo(cx0 + rr, cy0);
      ctx.lineTo(cx0 + cw - fold, cy0);
      ctx.lineTo(cx0 + cw, cy0 + fold);
      ctx.lineTo(cx0 + cw, cy0 + ch - rr);
      ctx.quadraticCurveTo(cx0 + cw, cy0 + ch, cx0 + cw - rr, cy0 + ch);
      ctx.lineTo(cx0 + rr, cy0 + ch);
      ctx.quadraticCurveTo(cx0, cy0 + ch, cx0, cy0 + ch - rr);
      ctx.lineTo(cx0, cy0 + rr);
      ctx.quadraticCurveTo(cx0, cy0, cx0 + rr, cy0);
      ctx.closePath();
      ctx.globalAlpha = 0.25 + 0.75 * remaining;
      ctx.fillStyle = '#141419';
      ctx.fill();
      ctx.lineWidth = px * 1.2;
      ctx.strokeStyle = o.status === 'error' ? 'rgba(240, 82, 82, 0.6)' : 'rgba(255, 255, 255, 0.14)';
      ctx.stroke();
      // folded corner
      ctx.beginPath();
      ctx.moveTo(cx0 + cw - fold, cy0);
      ctx.lineTo(cx0 + cw - fold, cy0 + fold);
      ctx.lineTo(cx0 + cw, cy0 + fold);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const dot = px * 2.9;
    const errRgb: RGB = [240, 82, 82];
    for (const p of particles) {
      if (p.state === 0 && progress >= p.release && o.status !== 'error') {
        p.state = 1;
        p.since = t;
        p.target = (Math.random() * sphere.n) | 0;
      } else if (p.state !== 0 && progress < p.release - 0.02) {
        p.state = 0; // progress went back (new file): re-form the card
      }
      if (p.state === 0) {
        const q = cardDot(p);
        const pr = o.status === 'error' ? errRgb : kindRgb;
        ctx.globalAlpha = 0.55 + 0.35 * (1 - p.v);
        ctx.fillStyle = `rgb(${pr[0]}, ${pr[1]}, ${pr[2]})`;
        ctx.fillRect(q.x - dot / 2, q.y - dot / 2, dot, dot);
      } else if (p.state === 1) {
        const u = clamp((t - p.since) / FLIGHT, 0, 1);
        const e = easeInOut(u);
        const a = cardDot(p);
        const bx = sphere.sx[p.target], by = sphere.sy[p.target];
        // arc over the gap
        const mx = (a.x + bx) / 2, my = Math.min(a.y, by) - H * 0.22;
        const x = (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * mx + e * e * bx;
        const y = (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * my + e * e * by;
        const mixK = e;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = `rgb(${Math.round(kindRgb[0] + (r - kindRgb[0]) * mixK)}, ${Math.round(kindRgb[1] + (g - kindRgb[1]) * mixK)}, ${Math.round(kindRgb[2] + (b - kindRgb[2]) * mixK)})`;
        ctx.beginPath();
        ctx.arc(x, y, dot * (0.9 + 0.4 * Math.sin(Math.PI * u)), 0, TAU);
        ctx.fill();
        if (u >= 1) {
          p.state = 2;
          sphere.boost[p.target] = 1;
        }
      }
    }
    ctx.globalAlpha = 1;

    // badge on the card
    if (remaining > 0.05) {
      const label = o.badge ?? KIND_BADGE[o.kind];
      ctx.globalAlpha = Math.min(1, remaining * 1.6);
      ctx.fillStyle = o.status === 'error' ? '#f05252' : `rgb(${kindRgb[0]}, ${kindRgb[1]}, ${kindRgb[2]})`;
      const bw = cw * 0.62, bh = ch * 0.17;
      const bx = cx0 + (cw - bw) / 2, by = cy0 + ch * 0.66;
      const br = px * 4;
      ctx.beginPath();
      ctx.moveTo(bx + br, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, br);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, br);
      ctx.arcTo(bx, by + bh, bx, by, br);
      ctx.arcTo(bx, by, bx + bw, by, br);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0b0b0d';
      ctx.font = `700 ${Math.round(bh * 0.6)}px Inter, -apple-system, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.slice(0, 4).toUpperCase(), bx + bw / 2, by + bh / 2 + px * 0.5);
      ctx.globalAlpha = 1;
    }

    sphere.draw(ctx, [r, g, b], sR * 0.045, 0.5 + 0.45 * fill + (o.status === 'done' ? 0.1 : 0));
  });

  return {
    update(next) {
      const sized = (next.width != null && next.width !== o.width) || (next.height != null && next.height !== o.height);
      Object.assign(o, next);
      if (sized) sizeCanvasRect(canvas, o.width, o.height);
    },
    destroy: stop,
  };
}
