/*
 * Reel Orb engine — video frames orbiting a dot-sphere core like a film strip.
 * The strip turns so the frame being analysed comes to the front, where it
 * glows and beams into the core; analysed frames keep a tinted border.
 */

import { clamp, DotSphere, hexToRgb, loop, reducedMotion, RGB, sizeCanvasRect, TAU } from '../shared/dots';

export type ReelStatus = 'loading' | 'analyzing' | 'done' | 'error';

export interface ReelOrbOptions {
  width?: number;
  height?: number;
  /** Thumbnail URLs, one per frame (see `captureFrames`). */
  frames?: string[];
  /** Frame count when you have no thumbnails yet. */
  count?: number;
  /** 0..1 — how far through the video the analysis is. */
  progress?: number;
  status?: ReelStatus;
}

export interface ReelOrbHandle {
  update(opts: ReelOrbOptions): void;
  destroy(): void;
}

export const REEL_COLORS: Record<ReelStatus, string> = {
  loading: '#9a9aa3',
  analyzing: '#fb923c',
  done: '#34d399',
  error: '#f05252',
};

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createReelOrb(canvas: HTMLCanvasElement, opts: ReelOrbOptions = {}): ReelOrbHandle {
  const maybe = canvas.getContext('2d');
  if (!maybe) throw new Error('ReelOrb: 2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybe;
  const o = { width: 420, height: 260, frames: [] as string[], count: 12, progress: 0, status: 'loading' as ReelStatus, ...opts };
  sizeCanvasRect(canvas, o.width, o.height);

  const core = new DotSphere(170);
  const slow = reducedMotion();
  let images: Array<HTMLImageElement | null> = [];
  let loadedKey = '';
  let spin = 0; // strip rotation (radians)
  let spinV = 0;
  let rot = 0;
  let lastActive = -1;
  let flash = 0;
  const rgb: RGB = hexToRgb(REEL_COLORS[o.status]);

  function loadFrames(frames: string[]) {
    const key = frames.join('|');
    if (key === loadedKey) return;
    loadedKey = key;
    images = frames.map((src) => {
      const img = new Image();
      if (!/^(data|blob):/.test(src)) img.crossOrigin = 'anonymous';
      img.src = src;
      return img;
    });
  }
  loadFrames(o.frames);

  const stop = loop((dt, t) => {
    const n = Math.max(1, o.frames.length || o.count);
    const target = hexToRgb(REEL_COLORS[o.status]);
    for (let i = 0; i < 3; i++) rgb[i] += (target[i] - rgb[i]) * (1 - Math.exp(-4 * dt));
    flash *= Math.exp(-5 * dt);

    const progress = o.status === 'done' ? 1 : clamp(o.progress, 0, 1);
    const active = o.status === 'analyzing' ? Math.min(n - 1, Math.floor(progress * n)) : -1;
    if (active !== lastActive && active >= 0) flash = 1;
    lastActive = active;

    // turn the strip so the active frame sits at the front; drift when idle/done
    if (active >= 0) {
      let want = -(active / n) * TAU;
      while (want - spin > Math.PI) want -= TAU;
      while (want - spin < -Math.PI) want += TAU;
      spinV += ((want - spin) * 60 - spinV * 13) * dt;
      spin += spinV * dt;
    } else {
      spinV *= Math.exp(-4 * dt);
      spin += dt * 0.18 * (slow ? 0.3 : 1);
    }
    rot += dt * (o.status === 'analyzing' ? 0.8 : 0.25) * (slow ? 0.3 : 1);

    const W = canvas.width, H = canvas.height;
    const px = W / o.width;
    const cx = W / 2, cy = H * 0.5;
    const Rx = W * 0.36, Rz = H * 0.3; // ellipse radii of the strip (tilted ring)
    const [r, g, b] = rgb.map((v) => Math.round(v));
    ctx.clearRect(0, 0, W, H);

    // halo
    const halo = ctx.createRadialGradient(cx, cy, H * 0.05, cx, cy, H * 0.5);
    halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.14 + 0.12 * flash})`);
    halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    const tiles = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * TAU + spin;
      const depth = Math.cos(a); // 1 = front
      return { i, x: cx + Math.sin(a) * Rx, y: cy + depth * Rz, depth, scale: 0.6 + 0.4 * ((depth + 1) / 2) };
    });
    tiles.sort((a, b) => a.depth - b.depth);

    const drawTile = (tile: (typeof tiles)[number]) => {
      const isActive = tile.i === active;
      const analysed = o.status === 'done' || (active >= 0 && tile.i < active);
      const k = tile.scale * (isActive ? 1.18 + 0.04 * flash : 1);
      const tw = W * 0.15 * k, th = tw * 0.66;
      const x = tile.x - tw / 2, y = tile.y - th / 2;
      const alpha = clamp(0.22 + 0.78 * ((tile.depth + 1) / 2), 0, 1) * (o.status === 'loading' ? 0.6 : 1);
      ctx.globalAlpha = alpha * (analysed || isActive || o.status !== 'analyzing' ? 1 : 0.55);

      if (isActive) {
        const gl = ctx.createRadialGradient(tile.x, tile.y, 0, tile.x, tile.y, tw);
        gl.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.45)`);
        gl.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = gl;
        ctx.fillRect(tile.x - tw, tile.y - tw, tw * 2, tw * 2);
      }

      // film frame
      roundRect(ctx, x, y, tw, th, px * 4 * k);
      ctx.fillStyle = '#0c0c0e';
      ctx.fill();
      const pad = th * 0.16;
      const img = images[tile.i];
      ctx.save();
      roundRect(ctx, x + px * 2, y + pad, tw - px * 4, th - pad * 2, px * 2 * k);
      ctx.clip();
      if (img && img.complete && img.naturalWidth) {
        const ir = img.naturalWidth / img.naturalHeight, fr = (tw - px * 4) / (th - pad * 2);
        let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
        if (ir > fr) {
          sw = sh * fr;
          sx = (img.naturalWidth - sw) / 2;
        } else {
          sh = sw / fr;
          sy = (img.naturalHeight - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, x + px * 2, y + pad, tw - px * 4, th - pad * 2);
      } else {
        const ph = ctx.createLinearGradient(x, y, x + tw, y + th);
        ph.addColorStop(0, '#26262c');
        ph.addColorStop(1, '#17171b');
        ctx.fillStyle = ph;
        ctx.fillRect(x, y, tw, th);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = `600 ${Math.round(th * 0.22)}px Inter, -apple-system, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(tile.i + 1), tile.x, tile.y);
      }
      ctx.restore();

      // sprocket holes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      const holes = 6, hw = tw / (holes * 2.2), hh = pad * 0.42;
      for (let h = 0; h < holes; h++) {
        const hx = x + tw * ((h + 0.5) / holes) - hw / 2;
        ctx.fillRect(hx, y + (pad - hh) / 2, hw, hh);
        ctx.fillRect(hx, y + th - pad + (pad - hh) / 2, hw, hh);
      }

      // border: active glows, analysed keeps a tint
      roundRect(ctx, x, y, tw, th, px * 4 * k);
      ctx.lineWidth = px * (isActive ? 2 : 1.2);
      ctx.strokeStyle = isActive
        ? `rgba(${r}, ${g}, ${b}, 1)`
        : analysed
          ? `rgba(${r}, ${g}, ${b}, 0.6)`
          : 'rgba(255, 255, 255, 0.12)';
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    // back tiles, core (+ beam), front tiles
    for (const tile of tiles) if (tile.depth < 0) drawTile(tile);

    const Rc = H * 0.2;
    for (let i = 0; i < core.n; i++) core.boost[i] = Math.max(core.boost[i] * Math.exp(-4 * dt), flash * 0.6 * (0.5 + 0.5 * Math.sin(core.phase[i] * 4)));
    core.project(rot, 0.35, cx, cy, Rc * (1 + 0.05 * flash));
    core.draw(ctx, [r, g, b], Rc * 0.05, o.status === 'loading' ? 0.5 : 0.85);

    const front = tiles.find((tl) => tl.i === active);
    if (front) {
      // beam from the active frame into the core
      const grad = ctx.createLinearGradient(front.x, front.y, cx, cy);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.7)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = px * 2;
      ctx.beginPath();
      ctx.moveTo(front.x, front.y);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      for (let k = 0; k < 3; k++) {
        const u = easeInOut((t * 1.4 + k / 3) % 1);
        ctx.globalAlpha = Math.sin(Math.PI * u);
        ctx.fillStyle = '#fff4e6';
        ctx.beginPath();
        ctx.arc(front.x + (cx - front.x) * u, front.y + (cy - front.y) * u, px * 2, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    for (const tile of tiles) if (tile.depth >= 0) drawTile(tile);
  });

  return {
    update(next) {
      const sized = (next.width != null && next.width !== o.width) || (next.height != null && next.height !== o.height);
      Object.assign(o, next);
      if (sized) sizeCanvasRect(canvas, o.width, o.height);
      if (next.frames) loadFrames(next.frames);
    },
    destroy: stop,
  };
}
