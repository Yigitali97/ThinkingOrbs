/*
 * Bubble Orb engine — a glossy blue bubble with glowing pill eyes that
 * blink (left eye leading), glance toward the pointer, and wobble like
 * jelly when pressed. Framework-free canvas renderer.
 */

export interface BubbleOrbOptions {
  /** CSS pixel width/height of the canvas (the bubble fills ~70%, the rest is glow). */
  size?: number;
  /** Main body tint. */
  color?: string;
  /** Blink at random intervals. */
  blinking?: boolean;
  /** Jelly bounce when pressed. */
  bouncy?: boolean;
}

export interface BubbleOrbHandle {
  update(opts: BubbleOrbOptions): void;
  blink(): void;
  /** Trigger the jelly bounce. */
  bounce(strength?: number): void;
  destroy(): void;
}

// Proportions measured from the reference, in units of the bubble radius.
const BODY = 0.35; // bubble radius as a fraction of canvas size
const EYE_W = 0.24;
const EYE_H = 0.44;
const EYE_CLOSED_H = 0.035;
const EYE_X = 0.34;
const EYE_Y = -0.09; // above center (screen y down → negative is up)
const LOOK = 0.06; // how far the eyes glance toward the pointer
const LEAD = 0.05; // left eye closes this much earlier than the right, s

// Jelly springs
const STIFFNESS = 420;
const DAMPING = 11;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function parseHex(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;
const WHITE: [number, number, number] = [255, 255, 255];
const INK: [number, number, number] = [16, 40, 90];

// Blink envelope: close fast, hold, open a touch slower. 1 = open.
function eyeOpenness(elapsed: number): number {
  const close = 0.08, hold = 0.16, open = 0.11;
  if (elapsed < 0) return 1;
  if (elapsed < close) return 1 - elapsed / close;
  if (elapsed < close + hold) return 0;
  if (elapsed < close + hold + open) {
    const t = (elapsed - close - hold) / open;
    return t * t * (3 - 2 * t);
  }
  return 1;
}

let grainCanvas: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

function pill(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  const r = Math.min(w, h) / 2;
  const x = cx - w / 2, y = cy - h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

export function createBubbleOrb(canvas: HTMLCanvasElement, opts: BubbleOrbOptions = {}): BubbleOrbHandle {
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) throw new Error('BubbleOrb: 2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const o = { size: 240, color: '#5f9ae6', blinking: true, bouncy: true, ...opts };
  let tint = parseHex(o.color);

  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(o.size * dpr);
    canvas.height = Math.round(o.size * dpr);
    canvas.style.width = o.size + 'px';
    canvas.style.height = o.size + 'px';
  }
  resize();

  const now = () => performance.now() / 1000;

  // jelly: deviation from scale 1 on each axis
  let sx = 0, sy = 0, vx = 0, vy = 0;

  // blink
  let blinkStart = -1;
  let nextBlink = now() + 1.5 + Math.random() * 2;

  // glance
  let pointer: { x: number; y: number } | null = null;
  let lookX = 0, lookY = 0;

  function onMove(e: PointerEvent) {
    pointer = { x: e.clientX, y: e.clientY };
  }
  function onLeave() {
    pointer = null;
  }
  function hitsBody(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const R = rect.width * BODY;
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    return dx * dx + dy * dy <= R * R;
  }
  function onDown(e: PointerEvent) {
    if (o.bouncy && hitsBody(e)) bounce(1);
  }
  function onHover(e: PointerEvent) {
    canvas.style.cursor = o.bouncy && hitsBody(e) ? 'pointer' : '';
  }
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onHover);

  function bounce(strength = 1) {
    // taller than wide, like the reference
    vy += 6.6 * strength;
    vx += 3.1 * strength;
  }

  function draw(t: number) {
    const W = canvas.width;
    const c = W / 2;
    const R = W * BODY;

    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.translate(c, c);
    ctx.scale(1 + sx, 1 + sy);

    // outer glow + body
    const base = ctx.createRadialGradient(-0.22 * R, -0.32 * R, 0, -0.1 * R, -0.12 * R, 1.25 * R);
    base.addColorStop(0, mix(tint, WHITE, 0.42));
    base.addColorStop(0.55, mix(tint, WHITE, 0.04));
    base.addColorStop(1, mix(tint, INK, 0.28));
    ctx.save();
    ctx.shadowColor = `rgba(${tint[0]}, ${tint[1]}, 255, 0.45)`;
    ctx.shadowBlur = 0.24 * R;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();

    // soft specular highlight, top-left
    const spec = ctx.createRadialGradient(-0.38 * R, -0.52 * R, 0, -0.38 * R, -0.52 * R, 0.85 * R);
    spec.addColorStop(0, 'rgba(240, 246, 255, 0.55)');
    spec.addColorStop(1, 'rgba(240, 246, 255, 0)');
    ctx.fillStyle = spec;
    ctx.fillRect(-R, -R, 2 * R, 2 * R);

    // rim light
    const rim = ctx.createRadialGradient(0, 0, 0.78 * R, 0, 0, R);
    rim.addColorStop(0, 'rgba(210, 230, 255, 0)');
    rim.addColorStop(0.85, 'rgba(210, 230, 255, 0.28)');
    rim.addColorStop(1, 'rgba(225, 238, 255, 0.75)');
    ctx.fillStyle = rim;
    ctx.fillRect(-R, -R, 2 * R, 2 * R);

    // fine grain
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    const pattern = ctx.createPattern(grain(), 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(-R, -R, 2 * R, 2 * R);
    }
    ctx.restore();

    // eyes
    const lx = lookX * LOOK * R, ly = lookY * LOOK * R;
    const open = (lead: number) => (blinkStart < 0 ? 1 : eyeOpenness(t - blinkStart - lead));
    const eyeGrad = ctx.createLinearGradient(0, (EYE_Y - EYE_H / 2) * R, 0, (EYE_Y + EYE_H / 2) * R);
    eyeGrad.addColorStop(0, '#ffffff');
    eyeGrad.addColorStop(1, '#dbe9fd');
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.65)';
    ctx.shadowBlur = 0.09 * R;
    ctx.fillStyle = eyeGrad;
    [
      { x: -EYE_X, lead: 0 },
      { x: EYE_X, lead: LEAD },
    ].forEach((eye) => {
      const h = EYE_CLOSED_H + (EYE_H - EYE_CLOSED_H) * open(eye.lead);
      pill(ctx, eye.x * R + lx, EYE_Y * R + ly, EYE_W * R, h * R);
      ctx.fill();
    });
    ctx.restore();

    ctx.restore();
  }

  let raf = 0;
  let last = now();
  function tick() {
    const t = now();
    const dt = Math.min(0.033, t - last);
    last = t;

    // jelly springs (semi-implicit Euler)
    vx += (-STIFFNESS * sx - DAMPING * vx) * dt;
    vy += (-STIFFNESS * sy - DAMPING * vy) * dt;
    sx = clamp(sx + vx * dt, -0.4, 0.5);
    sy = clamp(sy + vy * dt, -0.4, 0.5);

    // glance
    let tx = 0, ty = 0;
    if (pointer) {
      const rect = canvas.getBoundingClientRect();
      const R = rect.width * BODY;
      const dx = (pointer.x - (rect.left + rect.width / 2)) / (R * 3);
      const dy = (pointer.y - (rect.top + rect.height / 2)) / (R * 3);
      const l = Math.hypot(dx, dy);
      const k = l > 1 ? 1 / l : 1;
      tx = dx * k;
      ty = dy * k;
    }
    const f = 1 - Math.exp(-8 * dt);
    lookX += (tx - lookX) * f;
    lookY += (ty - lookY) * f;

    // blinks
    if (o.blinking && blinkStart < 0 && t >= nextBlink) blinkStart = t;
    if (blinkStart >= 0 && t - blinkStart > 0.5) {
      blinkStart = -1;
      nextBlink = t + 2.8 + Math.random() * 3.2;
    }

    draw(t);
    raf = requestAnimationFrame(tick);
  }
  draw(now());
  raf = requestAnimationFrame(tick);

  return {
    update(next) {
      const sizeChanged = next.size != null && next.size !== o.size;
      Object.assign(o, next);
      tint = parseHex(o.color);
      if (sizeChanged) resize();
    },
    blink() {
      if (blinkStart < 0) blinkStart = now();
    },
    bounce,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onHover);
    },
  };
}
