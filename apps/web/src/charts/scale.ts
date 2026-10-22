/** Linear map from a data domain to a pixel range. */
export function linear(
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
): (x: number) => number {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (x) => r0 + (x - d0) * k;
}

/** Round tick values (1, 2, 2.5 or 5 × 10^n steps) covering [min, max]. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!(max > min)) return [min];
  const rough = (max - min) / Math.max(1, target);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}

/** Compact tick label: 1,500 → 1.5K. */
export function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${Number((value / 1000).toPrecision(3))}K`;
  return String(Number(value.toPrecision(4)));
}
