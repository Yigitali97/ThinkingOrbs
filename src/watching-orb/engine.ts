/*
 * Watching Orb engine — a ball whose eyes live on its surface and turn
 * toward the pointer in 3D, with occasional blinks. Framework-free.
 */

export interface WatchingOrbOptions {
  /** CSS pixel width/height of the canvas. */
  size?: number;
  ballColor?: string;
  eyeColor?: string;
  /** Hairline around the ball; pass 'transparent' to hide. */
  outlineColor?: string;
  /** Blink at random intervals. */
  blinking?: boolean;
}

export interface WatchingOrbHandle {
  update(opts: WatchingOrbOptions): void;
  /** Blink now. */
  blink(): void;
  destroy(): void;
}

type Vec3 = [number, number, number];

// Proportions measured from the reference, in units of the ball radius.
const EYE_W = 0.11;
const EYE_H = 0.385;
const EYE_SPREAD = 0.33; // tangent-plane offset of each eye from the face center
const MAX_TURN = (62 * Math.PI) / 180; // how far the face can turn toward the rim
const REACH = 1.5; // pointer distance (in radii) at which the face is fully turned
const FOLLOW = 13; // gaze smoothing rate, 1/s
const PARALLAX = 0.012; // ball nudges toward the pointer
const PAD = 0.03; // canvas padding so the nudge never clips

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Capsule outline in the face's tangent plane, centered on (0, 0).
function capsule(w: number, h: number, steps = 14): Array<[number, number]> {
  const r = w / 2;
  const half = Math.max(0, h / 2 - r);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const a = (Math.PI * i) / steps; // top cap, right → left
    pts.push([r * Math.cos(a), half + r * Math.sin(a)]);
  }
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (Math.PI * i) / steps; // bottom cap, left → right
    pts.push([r * Math.cos(a), -half + r * Math.sin(a)]);
  }
  return pts;
}

// Blink envelope: quick close, brief hold, slightly slower open. 1 = open.
function blinkOpenness(elapsed: number): number {
  const close = 0.07, hold = 0.04, open = 0.11;
  if (elapsed < 0) return 1;
  if (elapsed < close) return 1 - elapsed / close;
  if (elapsed < close + hold) return 0;
  if (elapsed < close + hold + open) {
    const t = (elapsed - close - hold) / open;
    return t * t * (3 - 2 * t);
  }
  return 1;
}

export function createWatchingOrb(canvas: HTMLCanvasElement, opts: WatchingOrbOptions = {}): WatchingOrbHandle {
  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) throw new Error('WatchingOrb: 2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const o = {
    size: 240,
    ballColor: '#f2f2f2',
    eyeColor: '#0e0e0e',
    outlineColor: 'rgba(0, 0, 0, 0.35)',
    blinking: true,
    ...opts,
  };

  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(o.size * dpr);
    canvas.height = Math.round(o.size * dpr);
    canvas.style.width = o.size + 'px';
    canvas.style.height = o.size + 'px';
  }
  resize();

  // gaze state
  let target: Vec3 = [0, 0, 1];
  let face: Vec3 = [0, 0, 1];
  let pointer: { x: number; y: number } | null = null;

  // blink state
  let blinkStart = -1;
  let nextBlink = 0;
  const now = () => performance.now() / 1000;
  const scheduleBlink = (from: number) => {
    nextBlink = from + 2.5 + Math.random() * 4;
  };
  scheduleBlink(now());

  function aimAtPointer() {
    if (!pointer) {
      target = [0, 0, 1];
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const R = (rect.width / 2) * (1 - PAD);
    // pointer offset in ball radii, y up
    const dx = (pointer.x - (rect.left + rect.width / 2)) / R;
    const dy = -(pointer.y - (rect.top + rect.height / 2)) / R;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) {
      target = [0, 0, 1];
      return;
    }
    const turn = MAX_TURN * Math.pow(clamp(dist / REACH, 0, 1), 1.3);
    const s = Math.sin(turn);
    target = [(dx / dist) * s, (dy / dist) * s, Math.cos(turn)];
  }

  function onPointerMove(e: PointerEvent) {
    pointer = { x: e.clientX, y: e.clientY };
  }
  function onPointerLeave() {
    pointer = null;
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerLeave);

  function drawEye(F: Vec3, Rt: Vec3, U: Vec3, offset: number, openness: number, cx: number, cy: number, R: number) {
    const h = lerp(EYE_W, EYE_H, openness);
    const outline = capsule(EYE_W, h);
    ctx.beginPath();
    for (let i = 0; i < outline.length; i++) {
      const u = outline[i][0] + offset, v = outline[i][1];
      // tangent-plane point → sphere surface
      let p = normalize([F[0] + u * Rt[0] + v * U[0], F[1] + u * Rt[1] + v * U[1], F[2] + u * Rt[2] + v * U[2]]);
      if (p[2] < 0) {
        // wrapped behind the rim: pin it to the silhouette
        const l = Math.hypot(p[0], p[1]) || 1;
        p = [p[0] / l, p[1] / l, 0];
      }
      const x = cx + p[0] * R, y = cy - p[1] * R;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function draw(openness: number) {
    const W = canvas.width;
    const R = (W / 2) * (1 - PAD);
    const cx = W / 2 + face[0] * PARALLAX * R;
    const cy = W / 2 - face[1] * PARALLAX * R;

    ctx.clearRect(0, 0, W, W);

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = o.ballColor;
    ctx.fill();

    // face basis: forward, upright "up" (no roll), right
    const F = face;
    const worldUp: Vec3 = [0, 1, 0];
    const d = worldUp[0] * F[0] + worldUp[1] * F[1] + worldUp[2] * F[2];
    const U = normalize([worldUp[0] - d * F[0], worldUp[1] - d * F[1], worldUp[2] - d * F[2]]);
    const Rt = cross(U, F);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = o.eyeColor;
    drawEye(F, Rt, U, -EYE_SPREAD, openness, cx, cy, R);
    drawEye(F, Rt, U, EYE_SPREAD, openness, cx, cy, R);
    ctx.restore();

    if (o.outlineColor !== 'transparent') {
      ctx.beginPath();
      ctx.arc(cx, cy, R - 0.5 * dpr, 0, Math.PI * 2);
      ctx.lineWidth = dpr;
      ctx.strokeStyle = o.outlineColor;
      ctx.stroke();
    }
  }

  let raf = 0;
  let last = now();
  let lastDrawn = '';
  function tick() {
    const t = now();
    const dt = Math.min(0.05, t - last);
    last = t;

    aimAtPointer();
    const k = 1 - Math.exp(-FOLLOW * dt);
    face = normalize([lerp(face[0], target[0], k), lerp(face[1], target[1], k), lerp(face[2], target[2], k)]);

    if (o.blinking && blinkStart < 0 && t >= nextBlink) blinkStart = t;
    let openness = 1;
    if (blinkStart >= 0) {
      openness = blinkOpenness(t - blinkStart);
      if (t - blinkStart > 0.3) {
        blinkStart = -1;
        // now and then, a quick double blink
        nextBlink = Math.random() < 0.2 ? t + 0.12 : t + 2.5 + Math.random() * 4;
      }
    }

    // skip redraws while nothing visibly changes
    const key = face.map((c) => c.toFixed(4)).join() + openness.toFixed(3);
    if (key !== lastDrawn) {
      draw(openness);
      lastDrawn = key;
    }
    raf = requestAnimationFrame(tick);
  }
  draw(1);
  raf = requestAnimationFrame(tick);

  return {
    update(next) {
      const sizeChanged = next.size != null && next.size !== o.size;
      Object.assign(o, next);
      if (sizeChanged) resize();
      lastDrawn = '';
    },
    blink() {
      if (blinkStart < 0) blinkStart = now();
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
    },
  };
}
