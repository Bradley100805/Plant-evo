import { describe, expect, it } from 'vitest';
import {
  driftVariance,
  fixationProbability,
  heterozygosityAfter,
  infiniteAllelesDiversity,
  mutationSelectionBalance,
} from './theory.ts';

describe('fixationProbability', () => {
  it('equals p for neutral alleles and handles the boundaries', () => {
    expect(fixationProbability({ p: 0.3, size: 100, ploidy: 2, s: 0 })).toBe(0.3);
    expect(fixationProbability({ p: 0, size: 100, ploidy: 2, s: 0.1 })).toBe(0);
    expect(fixationProbability({ p: 1, size: 100, ploidy: 2, s: -0.1 })).toBe(1);
  });

  it('gives Haldane’s ≈ 2·(allelic advantage) for a new additive mutant in a large population', () => {
    // Genotypes 1, 1.01, 1.02: allelic advantage 0.01, so u ≈ 0.02.
    const u = fixationProbability({ p: 1 / 20_000, size: 10_000, ploidy: 2, s: 0.02 });
    expect(u).toBeCloseTo(0.02, 3);
  });

  it('matches the closed form for known parameter values', () => {
    // (1 − e^(−0.04)) / (1 − e^(−8))
    expect(fixationProbability({ p: 0.005, size: 100, ploidy: 2, s: 0.04 })).toBeCloseTo(
      0.039224,
      5,
    );
    // Haploid: (1 − e^(−0.1)) / (1 − e^(−20))
    expect(fixationProbability({ p: 0.005, size: 200, ploidy: 1, s: 0.05 })).toBeCloseTo(
      0.095163,
      5,
    );
  });

  it('agrees between the numerical and closed-form paths at h = 0.5', () => {
    const closed = fixationProbability({ p: 0.05, size: 80, ploidy: 2, s: 0.03, h: 0.5 });
    const numeric = fixationProbability({ p: 0.05, size: 80, ploidy: 2, s: 0.03, h: 0.5000001 });
    expect(numeric).toBeCloseTo(closed, 5);
  });

  it('makes recessive beneficial mutants fix less often than dominant ones', () => {
    const base = { p: 0.005, size: 100, ploidy: 2 as const, s: 0.05 };
    const recessive = fixationProbability({ ...base, h: 0 });
    const additive = fixationProbability({ ...base, h: 0.5 });
    const dominant = fixationProbability({ ...base, h: 1 });
    expect(recessive).toBeLessThan(additive);
    expect(additive).toBeLessThan(dominant);
    expect(recessive).toBeGreaterThan(base.p);
  });

  it('stays finite for strong selection in large populations', () => {
    const u = fixationProbability({ p: 0.1, size: 100_000, ploidy: 2, s: -0.2, h: 0.2 });
    expect(Number.isFinite(u)).toBe(true);
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1e-10);
  });
});

describe('other expectations', () => {
  it('computes drift and equilibrium quantities', () => {
    expect(heterozygosityAfter(0.5, 100, 0)).toBe(0.5);
    expect(heterozygosityAfter(0.5, 100, 60)).toBeCloseTo(0.5 * 0.99 ** 60, 12);
    expect(driftVariance(0.3, 400)).toBeCloseTo(0.000525, 12);
    expect(mutationSelectionBalance(0.001, 0.1, 0.5)).toBeCloseTo(0.02, 12);
    expect(mutationSelectionBalance(0.001, 0.1, 0)).toBeCloseTo(0.1, 12);
    // θ = 4Nμ = 1 → H ≈ 0.5 (exact recursion: 0.5009).
    expect(infiniteAllelesDiversity(200, 0.0025)).toBeCloseTo(0.5009, 4);
  });
});
