import { describe, expect, it } from 'vitest';
import { Rng } from '../rng/index.ts';
import { AlleleTable, NO_PARENT } from './alleles.ts';
import { neutralRelabel } from './mutation.ts';
import { crossoverRates, mutateCopy, recombineCopy, scheduleFromRates } from './transmission.ts';

describe('mutateCopy', () => {
  it('mutates each locus at its own rate', () => {
    const rates = [0.2, 0, 0.05, 0.2, 0.01];
    const loci = rates.length;
    const schedule = scheduleFromRates(rates);
    const alleles = new AlleleTable();
    const founders = rates.map((_, l) => alleles.add(0, l, NO_PARENT, 0));
    const rng = new Rng('per-locus');
    const counts = new Array<number>(loci).fill(0);
    const trials = 20_000;
    const genome = new Uint32Array(loci);
    for (let t = 0; t < trials; t++) {
      genome.set(founders);
      mutateCopy(alleles, neutralRelabel, schedule, genome, 0, loci, rng, 1);
      for (let l = 0; l < loci; l++) if (genome[l] !== founders[l]) counts[l]++;
    }
    rates.forEach((r, l) => {
      const se = Math.sqrt((r * (1 - r)) / trials);
      expect(Math.abs(counts[l] / trials - r)).toBeLessThanOrEqual(4 * se + 1e-9);
    });
    expect(counts[1]).toBe(0);
  });

  it('rejects invalid rates', () => {
    expect(() => scheduleFromRates([0.1, 1.5])).toThrow(RangeError);
  });
});

describe('recombineCopy', () => {
  it('takes whole copies when there is no crossover and mixes freely at r = 0.5', () => {
    const loci = 8;
    const src = new Uint32Array([...new Array(loci).fill(1), ...new Array(loci).fill(2)]);
    const dst = new Uint32Array(loci);
    const rng = new Rng('recombine');
    recombineCopy(src, 0, loci, dst, 0, loci, crossoverRates(0, loci), rng);
    expect(new Set(dst).size).toBe(1);
    let mixed = 0;
    for (let t = 0; t < 200; t++) {
      recombineCopy(src, 0, loci, dst, 0, loci, crossoverRates(0.5, loci), rng);
      if (new Set(dst).size === 2) mixed++;
    }
    // P(all 8 loci from one copy) = 2 · 0.5^8 ≈ 0.8%.
    expect(mixed).toBeGreaterThan(180);
  });
});
