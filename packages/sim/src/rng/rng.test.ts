import { describe, expect, it } from 'vitest';
import { Rng } from './rng.ts';

function draws(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.nextUint32());
}

describe('Rng', () => {
  it('matches the xoshiro128** reference output for state [1, 2, 3, 4]', () => {
    const rng = Rng.fromState({ key: 0, s: [1, 2, 3, 4], spareNormal: null });
    // Values from the reference C algorithm (computed independently in Python).
    expect(draws(rng, 6)).toEqual([11520, 0, 5927040, 70819200, 2031721883, 1637235492]);
  });

  it('is deterministic for a given seed and differs between seeds', () => {
    expect(draws(new Rng('alpha'), 5)).toEqual(draws(new Rng('alpha'), 5));
    expect(draws(new Rng('alpha'), 5)).not.toEqual(draws(new Rng('beta'), 5));
    expect(draws(new Rng(0), 5)).not.toEqual(draws(new Rng(0x100000000), 5));
  });

  it('derives forks from the seed key, not from how far the parent has advanced', () => {
    const a = new Rng('world');
    const b = new Rng('world');
    draws(b, 100);
    expect(draws(a.fork('genetics'), 5)).toEqual(draws(b.fork('genetics'), 5));
    expect(draws(a.fork('genetics'), 5)).not.toEqual(draws(a.fork('ecology'), 5));
    expect(draws(a.fork(1), 5)).not.toEqual(draws(a.fork(2), 5));
  });

  it('round-trips its state, including the cached normal deviate', () => {
    const rng = new Rng(42);
    rng.normal();
    const saved = rng.getState();
    const expected = [rng.normal(), rng.float(), rng.normal()];
    const restored = Rng.fromState(saved);
    expect([restored.normal(), restored.float(), restored.normal()]).toEqual(expected);
  });

  it('keeps float() in [0, 1) and int(n) in [0, n)', () => {
    const rng = new Rng('bounds');
    for (let i = 0; i < 10_000; i++) {
      const f = rng.float();
      expect(f >= 0 && f < 1).toBe(true);
      const k = rng.int(7);
      expect(Number.isInteger(k) && k >= 0 && k < 7).toBe(true);
    }
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(2.5)).toThrow(RangeError);
  });

  it('produces roughly uniform int(n) counts', () => {
    const rng = new Rng('uniform');
    const n = 10;
    const draws = 100_000;
    const counts = new Array<number>(n).fill(0);
    for (let i = 0; i < draws; i++) counts[rng.int(n)]++;
    const expected = draws / n;
    const chiSquare = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
    // 9 degrees of freedom: P(chi2 > 27.9) = 0.001.
    expect(chiSquare).toBeLessThan(27.9);
  });

  it('produces normal deviates with the requested mean and sd', () => {
    const rng = new Rng('normal');
    const n = 100_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = rng.normal(3, 2);
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(mean).toBeCloseTo(3, 1);
    expect(sd).toBeCloseTo(2, 1);
  });

  it('produces geometric deviates with mean (1 - p) / p', () => {
    const rng = new Rng('geometric');
    const p = 0.05;
    const n = 100_000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += rng.geometric(p);
    expect(sum / n).toBeCloseTo((1 - p) / p, 0);
    expect(rng.geometric(1)).toBe(0);
    expect(rng.geometric(0)).toBe(Infinity);
  });

  it('shuffles into a permutation', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = new Rng('shuffle').shuffle([...items]);
    expect(shuffled).not.toEqual(items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });
});
