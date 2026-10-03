// Axis ticks for the answer charts: about `count` steps from 0 to a round number at or above the largest value.

const STEPS = [1, 2, 2.5, 5, 10];

/** Ascending ticks from 0; the last is ≥ `max`. Steps are 1, 2, 2.5 or 5 × 10ⁿ. Nothing to scale gives [0, 1]. */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const n = Math.max(1, Math.round(count));
  const raw = max / n;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = STEPS.find((s) => s * power >= raw * (1 - 1e-9))! * power;
  const steps = Math.ceil(max / step - 1e-9);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Array.from({ length: steps + 1 }, (_, i) => Number((i * step).toFixed(decimals)));
}
