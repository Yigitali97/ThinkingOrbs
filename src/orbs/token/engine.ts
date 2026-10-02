/*
 * Token Orb engine — a tiny dot sphere for chat bubbles that pulses with the
 * real streaming rhythm: every chunk lights a few dots and adds energy, so the
 * orb runs fast when tokens pour in and calms when they slow down.
 */

import { clamp, DotSphere, hexToRgb, loop, reducedMotion, RGB, sizeCanvas } from '../shared/dots';

export interface TokenOrbOptions {
  /** CSS pixel width/height (tiny by default, to sit inline with text). */
  size?: number;
  /** Dot color (hex). */
  color?: string;
  /** Color once the reply is complete (hex). */
  doneColor?: string;
  /** The reply has finished streaming. */
  done?: boolean;
}

export interface TokenOrbHandle {
  /** Call for every streamed chunk; `count` = tokens (or characters) in it. */
  push(count?: number): void;
  update(opts: TokenOrbOptions): void;
  destroy(): void;
}

const DOTS = 90;

export function createTokenOrb(canvas: HTMLCanvasElement, opts: TokenOrbOptions = {}): TokenOrbHandle {
  const maybe = canvas.getContext('2d');
  if (!maybe) throw new Error('TokenOrb: 2D canvas context unavailable');
  const ctx: CanvasRenderingContext2D = maybe;
  const o = { size: 22, color: '#d4d4dc', doneColor: '#34d399', done: false, ...opts };
  sizeCanvas(canvas, o.size, 3);

  const sphere = new DotSphere(DOTS);
  const slow = reducedMotion();
  let energy = 0; // 0 idle → 1 pouring
  let received = 0; // tokens seen in total
  let doneMix = o.done ? 1 : 0;
  let rot = 0;
  const rgb: RGB = hexToRgb(o.done ? o.doneColor : o.color);

  function push(count = 1) {
    received += count;
    energy = Math.min(1, energy + 0.12 + 0.04 * Math.min(count, 6));
    // a couple of random dots flare per chunk, like keystrokes
    const sparks = 1 + Math.min(4, Math.round(count / 2));
    for (let k = 0; k < sparks; k++) sphere.boost[(Math.random() * DOTS) | 0] = 1;
  }

  const stop = loop((dt, t) => {
    energy *= Math.exp(-1.6 * dt);
    doneMix += ((o.done ? 1 : 0) - doneMix) * (1 - Math.exp(-5 * dt));
    for (let i = 0; i < DOTS; i++) sphere.boost[i] *= Math.exp(-5 * dt);
    const target = hexToRgb(o.done ? o.doneColor : o.color);
    for (let i = 0; i < 3; i++) rgb[i] += (target[i] - rgb[i]) * (1 - Math.exp(-5 * dt));

    // waiting for the first token: a slow shimmer; streaming: spin with the rate
    const waiting = received === 0 && !o.done;
    rot += dt * (0.5 + 4.5 * energy) * (1 - 0.85 * doneMix) * (slow ? 0.3 : 1);
    if (waiting) for (let i = 0; i < DOTS; i++) sphere.boost[i] = Math.max(sphere.boost[i], 0.35 * Math.max(0, Math.sin(t * 3 + sphere.phase[i] * 2)));

    const W = canvas.width;
    const scale = (1 + 0.1 * energy) * (1 - 0.15 * doneMix);
    ctx.clearRect(0, 0, W, W);
    sphere.project(rot, 0.4, W / 2, W / 2, W * 0.38 * scale);
    sphere.draw(ctx, [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])], W * 0.032, clamp(0.75 + 0.35 * energy, 0, 1));
  });

  return {
    push,
    update(next) {
      const sizeChanged = next.size != null && next.size !== o.size;
      Object.assign(o, next);
      if (sizeChanged) sizeCanvas(canvas, o.size, 3);
    },
    destroy: stop,
  };
}
