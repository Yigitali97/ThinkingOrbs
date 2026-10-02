/*
 * Vision Orb engine — an image seen through a turning dot sphere: each dot
 * takes the colour of the picture behind it. Scanning sweeps a line down that
 * reveals the colours; done keeps full colour and pulses focus points
 * (e.g. detected objects) at their image positions.
 */

import { clamp, DotSphere, loop, reducedMotion, sizeCanvas, TAU } from '../shared/dots';

export type VisionStatus = 'loading' | 'scanning' | 'done' | 'error';

export interface VisionFocus {
  /** 0..1 position in the image (left → right). */
  x: number;
  /** 0..1 position in the image (top → bottom). */
  y: number;
  label?: string;
}

export interface VisionOrbOptions {
  size?: number;
  /** Image URL (same-origin, CORS-enabled, data: or blob:). */
  src?: string | null;
  status?: VisionStatus;
  focus?: VisionFocus[];
}

export interface VisionOrbHandle {
  update(opts: VisionOrbOptions): void;
  destroy(): void;
}

const TEX = 56; // sampled texture resolution
const SCAN = 1.7; // s per sweep
const GREY = [150, 150, 160];

export function createVisionOrb(canvas: HTMLCanvasElement, opts: VisionOrbOptions = {}): VisionOrbHandle {
  const maybe = canvas.getContext('2d');
  if (!maybe) throw new Error('VisionOrb: 2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybe;
  const o = { size: 300, src: null as string | null, status: 'loading' as VisionStatus, focus: [] as VisionFocus[], ...opts };
  sizeCanvas(canvas, o.size);

  const sphere = new DotSphere(760);
  const slow = reducedMotion();
  let tex: Uint8ClampedArray | null = null;
  let loadedSrc: string | null = null;
  let colorMix = 0; // 0 grey → 1 image colours
  let reveal = 0; // 0..1 how far down the first sweep has revealed
  let scanSince = 0;
  let shownStatus = o.status;
  let rot = 0;
  let now = 0;

  function load(src: string | null) {
    if (src === loadedSrc) return;
    loadedSrc = src;
    tex = null;
    if (!src) return;
    const img = new Image();
    if (!/^(data|blob):/.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (loadedSrc !== src) return;
      const c = document.createElement('canvas');
      c.width = c.height = TEX;
      const g = c.getContext('2d')!;
      // cover-fit a centred square crop
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, TEX, TEX);
      try {
        tex = g.getImageData(0, 0, TEX, TEX).data;
      } catch {
        tex = null; // cross-origin image without CORS: stay grey
      }
    };
    img.src = src;
  }
  load(o.src);

  const stop = loop((dt, t) => {
    now = t;
    if (o.status !== shownStatus) {
      if (o.status === 'scanning') {
        scanSince = t;
        reveal = 0;
      }
      shownStatus = o.status;
    }
    const wantColor = tex && (o.status === 'scanning' || o.status === 'done') ? 1 : o.status === 'error' ? 0 : 0;
    colorMix += (wantColor - colorMix) * (1 - Math.exp(-3 * dt));
    if (o.status === 'scanning') reveal = clamp((t - scanSince) / SCAN, 0, 1);
    if (o.status === 'done') reveal += (1 - reveal) * (1 - Math.exp(-4 * dt));
    rot += dt * (o.status === 'scanning' ? 0.5 : o.status === 'loading' ? 0.35 : 0.18) * (slow ? 0.3 : 1);

    const W = canvas.width;
    const c = W / 2;
    const R = W * 0.38;
    const px = W / o.size;
    ctx.clearRect(0, 0, W, W);

    sphere.project(rot, 0.3, c, c, R);

    // scan line position (screen y in sphere units, -1 top → 1 bottom)
    const sweep = o.status === 'scanning' ? (((t - scanSince) % SCAN) / SCAN) * 2.3 - 1.15 : 9;
    const revealY = reveal * 2.3 - 1.15;

    for (let j = 0; j < sphere.n; j++) {
      const i = sphere.order[j];
      const depth = clamp((sphere.sz[i] + 1) / 2, 0, 1);
      // planar mapping: the dot shows the image pixel behind it
      const ux = (sphere.sx[i] - c) / (R * 1.08);
      const uy = (sphere.sy[i] - c) / (R * 1.08);
      let cr = GREY[0], cg = GREY[1], cb = GREY[2];
      const shown = uy < revealY ? 1 : 0;
      if (tex && colorMix > 0.01 && shown) {
        const tx = clamp(Math.floor(((ux + 1) / 2) * TEX), 0, TEX - 1);
        const ty = clamp(Math.floor(((uy + 1) / 2) * TEX), 0, TEX - 1);
        const k = (ty * TEX + tx) * 4;
        // keep very dark pixels visible as dots
        const lift = (v: number) => 45 + v * 0.85;
        cr += (lift(tex[k]) - cr) * colorMix;
        cg += (lift(tex[k + 1]) - cg) * colorMix;
        cb += (lift(tex[k + 2]) - cb) * colorMix;
      }
      if (o.status === 'error') {
        cr += (240 - cr) * 0.55;
        cg *= 0.6;
        cb *= 0.6;
      }
      // scan band highlight
      const d = (uy - sweep) / 0.07;
      const band = Math.exp(-d * d);
      let alpha = (0.1 + 0.85 * Math.pow(depth, 1.3)) * (o.status === 'loading' ? 0.55 + 0.25 * Math.sin(t * 3 + sphere.phase[i]) : 1);
      if (o.status === 'error' && Math.sin(sphere.phase[i] * 7 + Math.floor(t * 9)) > 0.85) alpha *= 0.2;
      alpha = clamp(alpha + band * 0.5 * depth, 0, 1);
      const w = band * 0.6;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${Math.round(cr + (255 - cr) * w)}, ${Math.round(cg + (255 - cg) * w)}, ${Math.round(cb + (255 - cb) * w)})`;
      ctx.beginPath();
      ctx.arc(sphere.sx[i], sphere.sy[i], R * 0.026 * sphere.sp[i] * (0.55 + 0.55 * depth) * (1 + 0.5 * band), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // the scan line itself
    if (o.status === 'scanning' && Math.abs(sweep) < 1) {
      const y = c + sweep * R * 1.08;
      const half = Math.sqrt(Math.max(0, 1 - sweep * sweep)) * R * 1.12;
      const grad = ctx.createLinearGradient(c - half, 0, c + half, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = px * 1.5;
      ctx.beginPath();
      ctx.moveTo(c - half, y);
      ctx.lineTo(c + half, y);
      ctx.stroke();
    }

    // focus points once done
    if (o.status === 'done' && reveal > 0.9) {
      (o.focus ?? []).forEach((f, k) => {
        const x = c + (f.x * 2 - 1) * R * 1.08;
        const y = c + (f.y * 2 - 1) * R * 1.08;
        const pulse = ((now * 0.8 + k * 0.33) % 1);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * (1 - pulse)})`;
        ctx.lineWidth = px * 1.4;
        ctx.beginPath();
        ctx.arc(x, y, px * (6 + 16 * pulse), 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, px * 3.2, 0, TAU);
        ctx.fill();
        if (f.label) {
          ctx.font = `600 ${Math.round(px * 11)}px Inter, -apple-system, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const tw = ctx.measureText(f.label).width + px * 12;
          ctx.fillStyle = 'rgba(10, 10, 12, 0.75)';
          ctx.fillRect(x - tw / 2, y + px * 9, tw, px * 17);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(f.label, x, y + px * 12);
        }
      });
    }
  });

  return {
    update(next) {
      const sizeChanged = next.size != null && next.size !== o.size;
      Object.assign(o, next);
      if (sizeChanged) sizeCanvas(canvas, o.size);
      if ('src' in next) load(o.src ?? null);
    },
    destroy: stop,
  };
}
