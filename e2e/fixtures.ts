import { expect, Locator, Page, test as base } from '@playwright/test';

export { expect };

/**
 * Every test fails if the page logs an error or throws, or if a request to our
 * own server fails. Third-party noise can be allowed per test with `allowErrors`.
 */
export const test = base.extend<{ errors: string[]; allowErrors: RegExp[] }>({
  allowErrors: [[], { option: true }],
  errors: [
    async ({ page, allowErrors }, use, testInfo) => {
      const errors: string[] = [];
      const allowed = (msg: string) => allowErrors.some((re) => re.test(msg));
      page.on('console', (m) => {
        if (m.type() === 'error' && !allowed(m.text())) errors.push(`console: ${m.text()}`);
      });
      page.on('pageerror', (e) => {
        if (!allowed(e.message)) errors.push(`pageerror: ${e.message}`);
      });
      page.on('response', (r) => {
        const url = new URL(r.url());
        if (url.hostname === 'localhost' && r.status() >= 400 && !allowed(r.url())) errors.push(`HTTP ${r.status()}: ${url.pathname}`);
      });
      await use(errors);
      if (testInfo.status === testInfo.expectedStatus) expect(errors, 'errors on the page').toEqual([]);
    },
    { auto: true },
  ],
});

export interface Pixels {
  /** share of pixels that are clearly lit (not background) */
  lit: number;
  /** mean colour of the lit pixels */
  mean: [number, number, number];
  /** 24×24 grid of brightness, for comparing frames */
  grid: number[];
}

/**
 * Read what an element looks like on screen. Uses a real screenshot, so it
 * works the same for 2D canvases, WebGL canvases and composited DOM.
 */
export async function pixels(target: Locator): Promise<Pixels> {
  const png = await target.screenshot({ animations: 'allow' });
  return target.page().evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
    const N = 24;
    const grid = new Array(N * N).fill(0);
    const counts = new Array(N * N).fill(0);
    let lit = 0;
    let r = 0, gg = 0, b = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const k = (y * width + x) * 4;
        const R = data[k], G = data[k + 1], B = data[k + 2];
        const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        const cell = Math.min(N - 1, Math.floor((y / height) * N)) * N + Math.min(N - 1, Math.floor((x / width) * N));
        grid[cell] += lum;
        counts[cell]++;
        if (Math.max(R, G, B) > 45) {
          lit++;
          r += R;
          gg += G;
          b += B;
        }
      }
    }
    return {
      lit: lit / (width * height),
      mean: (lit ? [r / lit, gg / lit, b / lit] : [0, 0, 0]) as [number, number, number],
      grid: grid.map((v, i) => (counts[i] ? v / counts[i] : 0)),
    };
  }, png.toString('base64'));
}

/** Like `pixels`, for several elements inside `container`, from a single screenshot. */
export async function pixelsOfEach(container: Locator, targets: Locator): Promise<Pixels[]> {
  const origin = await container.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
  const boxes = await targets.evaluateAll(
    (els, o) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left - o.x, y: r.top - o.y, w: r.width, h: r.height };
      }),
    origin
  );
  const png = await container.screenshot({ animations: 'allow' });
  return container.page().evaluate(
    async ({ b64, boxes }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const dpr = window.devicePixelRatio || 1;
      const N = 24;
      return boxes.map((b) => {
        const w = Math.max(1, Math.round(b.w * dpr));
        const h = Math.max(1, Math.round(b.h * dpr));
        const { data } = g.getImageData(Math.round(b.x * dpr), Math.round(b.y * dpr), w, h);
        const grid = new Array(N * N).fill(0);
        const counts = new Array(N * N).fill(0);
        let lit = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const k = (y * w + x) * 4;
            const cell = Math.min(N - 1, Math.floor((y / h) * N)) * N + Math.min(N - 1, Math.floor((x / w) * N));
            grid[cell] += 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
            counts[cell]++;
            if (Math.max(data[k], data[k + 1], data[k + 2]) > 45) lit++;
          }
        }
        return { lit: lit / (w * h), mean: [0, 0, 0] as [number, number, number], grid: grid.map((v, i) => (counts[i] ? v / counts[i] : 0)) };
      });
    },
    { b64: png.toString('base64'), boxes }
  );
}

/** Mean brightness change between two frames, 0..255. */
export function frameDiff(a: Pixels, b: Pixels) {
  let d = 0;
  for (let i = 0; i < a.grid.length; i++) d += Math.abs(a.grid[i] - b.grid[i]);
  return d / a.grid.length;
}

/** Assert the element draws something and keeps moving. */
export async function expectAnimating(target: Locator, { minLit = 0.004, minDiff = 0.15, gap = 450 } = {}) {
  await expect(target).toBeVisible();
  // orbs fade in when they mount or change state, so give it a moment to appear
  await expect.poll(async () => (await pixels(target)).lit, { message: 'orb should draw something', timeout: 10_000 }).toBeGreaterThan(minLit);
  const a = await pixels(target);
  await target.page().waitForTimeout(gap);
  const b = await pixels(target);
  expect(frameDiff(a, b), 'orb should be animating').toBeGreaterThan(minDiff);
  return b;
}

/**
 * Give the page a microphone. Headless Chromium can't open a real capture
 * device on every OS, so getUserMedia returns a live MediaStream from a Web
 * Audio oscillator instead; useMicrophone and the orbs' audio analysis run on
 * it unchanged. `deny` makes the permission request fail instead.
 */
export async function fakeMicrophone(page: Page, { deny = false } = {}) {
  await page.addInitScript((deny) => {
    const md = navigator.mediaDevices;
    if (!md) return;
    md.getUserMedia = async () => {
      if (deny) throw new DOMException('Permission denied', 'NotAllowedError');
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // a warbling tone with a syllable-like envelope, so the level moves
      osc.frequency.value = 220;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 3;
      lfo.connect(gain.gain);
      osc.connect(gain);
      const out = ctx.createMediaStreamDestination();
      gain.connect(out);
      osc.start();
      lfo.start();
      return out.stream;
    };
  }, deny);
}

