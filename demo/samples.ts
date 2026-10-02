// Procedurally drawn sample media so the demos work offline, with no external requests.

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function hills(g: CanvasRenderingContext2D, w: number, h: number, base: number, amp: number, color: string, seed: number) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += w / 40) {
    const y = h * base - amp * h * (0.5 + 0.5 * Math.sin(x / w * 7 + seed) * Math.cos(x / w * 3.1 + seed * 2));
    g.lineTo(x, y);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();
}

export type Scene = 'sunset' | 'lake';

export const SCENE_FOCUS: Record<Scene, Array<{ x: number; y: number; label: string }>> = {
  sunset: [
    { x: 0.66, y: 0.38, label: 'sun' },
    { x: 0.28, y: 0.74, label: 'mountains' },
  ],
  lake: [
    { x: 0.72, y: 0.22, label: 'moon' },
    { x: 0.5, y: 0.76, label: 'lake' },
    { x: 0.18, y: 0.5, label: 'trees' },
  ],
};

export function sceneImage(scene: Scene, size = 256): string {
  const { c, g } = canvas(size, size);
  if (scene === 'sunset') {
    const sky = g.createLinearGradient(0, 0, 0, size);
    sky.addColorStop(0, '#1e1b4b');
    sky.addColorStop(0.45, '#c2410c');
    sky.addColorStop(0.7, '#fb923c');
    g.fillStyle = sky;
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#fde047';
    g.beginPath();
    g.arc(size * 0.66, size * 0.38, size * 0.11, 0, Math.PI * 2);
    g.fill();
    hills(g, size, size, 0.72, 0.16, '#4c1d95', 1);
    hills(g, size, size, 0.86, 0.1, '#1e1033', 3);
  } else {
    const sky = g.createLinearGradient(0, 0, 0, size * 0.6);
    sky.addColorStop(0, '#0b1d3a');
    sky.addColorStop(1, '#1e3a8a');
    g.fillStyle = sky;
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#f1f5f9';
    g.beginPath();
    g.arc(size * 0.72, size * 0.22, size * 0.07, 0, Math.PI * 2);
    g.fill();
    const lake = g.createLinearGradient(0, size * 0.62, 0, size);
    lake.addColorStop(0, '#38bdf8');
    lake.addColorStop(1, '#0c4a6e');
    g.fillStyle = lake;
    g.fillRect(0, size * 0.62, size, size * 0.38);
    // trees
    for (let k = 0; k < 9; k++) {
      const x = size * (0.04 + k * 0.05), top = size * (0.36 + (k % 3) * 0.04);
      g.fillStyle = k % 2 ? '#166534' : '#15803d';
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x - size * 0.05, size * 0.64);
      g.lineTo(x + size * 0.05, size * 0.64);
      g.closePath();
      g.fill();
    }
    hills(g, size, size, 0.64, 0.06, '#14532d', 5);
  }
  return c.toDataURL('image/png');
}

/** A short "day passing" clip: the sun crosses the sky as morning turns to night. */
export function reelFrames(count = 12, w = 192, h = 112): string[] {
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const { c, g } = canvas(w, h);
    const sky = g.createLinearGradient(0, 0, 0, h);
    const top = `hsl(${215 - 200 * t}, ${60 + 20 * t}%, ${55 - 40 * t}%)`;
    const bottom = `hsl(${200 - 175 * t}, 85%, ${70 - 25 * t}%)`;
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const sx = w * (0.12 + 0.76 * t), sy = h * (0.75 - Math.sin(Math.PI * t) * 0.55);
    g.fillStyle = t < 0.85 ? '#fde68a' : '#e2e8f0';
    g.beginPath();
    g.arc(sx, sy, h * 0.1, 0, Math.PI * 2);
    g.fill();
    hills(g, w, h, 0.8, 0.18, `hsl(${150 - 120 * t}, 35%, ${30 - 18 * t}%)`, 2);
    frames.push(c.toDataURL('image/jpeg', 0.8));
  }
  return frames;
}
