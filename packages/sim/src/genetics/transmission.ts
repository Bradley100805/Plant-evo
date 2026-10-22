/**
 * Building blocks for passing genomes from parents to offspring: recombination and mutation.
 * Shared by the Wright–Fisher engine (`reproduction.ts`) and the spatial world (`world/`).
 */
import type { Rng } from '../rng/index.ts';
import type { AlleleTable } from './alleles.ts';
import type { MutationModel } from './mutation.ts';

/** Per-locus mutation probabilities, per transmitted genome copy, per generation. */
export interface MutationSchedule {
  readonly rates: Float64Array;
  /** Largest entry of `rates`; mutation candidates are drawn at this rate and thinned. */
  readonly max: number;
}

export function uniformSchedule(loci: number, rate: number): MutationSchedule {
  return { rates: new Float64Array(loci).fill(rate), max: rate };
}

export function scheduleFromRates(rates: ArrayLike<number>): MutationSchedule {
  const copy = Float64Array.from(rates);
  let max = 0;
  for (const r of copy) {
    if (!(r >= 0 && r <= 1)) throw new RangeError(`mutation rates must be in [0, 1], got ${r}`);
    max = Math.max(max, r);
  }
  return { rates: copy, max };
}

/**
 * Writes one recombinant genome copy built from source copies at offsets `a` and `b`: meiosis
 * in a diploid parent, or gamete fusion followed by immediate meiosis in a haploid life cycle.
 * `crossover[l]` is the probability of switching source copy between locus l − 1 and l.
 */
export function recombineCopy(
  src: Uint32Array,
  a: number,
  b: number,
  dst: Uint32Array,
  out: number,
  loci: number,
  crossover: Float64Array,
  rng: Rng,
): void {
  let from = rng.float() < 0.5 ? a : b;
  dst[out] = src[from];
  for (let l = 1; l < loci; l++) {
    const r = crossover[l];
    if (r > 0 && rng.float() < r) from = from === a ? b : a;
    dst[out + l] = src[from + l];
  }
}

/**
 * Applies mutations to one transmitted genome copy. Candidate loci are found by geometric skips
 * at the schedule's maximum rate and accepted with probability rate/max (thinning), which is
 * exact for per-locus rates and costs nothing extra when all rates are equal.
 * Returns the number of mutations made.
 */
export function mutateCopy(
  alleles: AlleleTable,
  model: MutationModel,
  schedule: MutationSchedule,
  genomes: Uint32Array,
  offset: number,
  loci: number,
  rng: Rng,
  birthGeneration: number,
): number {
  const mu = schedule.max;
  if (mu <= 0) return 0;
  const rates = schedule.rates;
  let count = 0;
  for (let l = rng.geometric(mu); l < loci; l += 1 + rng.geometric(mu)) {
    const r = rates[l];
    if (r < mu && rng.float() * mu >= r) continue;
    const parent = genomes[offset + l];
    const value = model.mutate(alleles.value(parent), l, rng);
    genomes[offset + l] = alleles.add(value, l, parent, birthGeneration);
    count++;
  }
  return count;
}

/** Crossover probabilities from one rate for every interval, or one rate per interval. */
export function crossoverRates(
  recombination: number | readonly number[],
  loci: number,
): Float64Array {
  const rates = new Float64Array(loci);
  if (typeof recombination === 'number') {
    assertRecombination(recombination);
    rates.fill(recombination, 1);
    return rates;
  }
  if (recombination.length !== loci - 1) {
    throw new RangeError(
      `recombination needs ${loci - 1} interval rates, got ${recombination.length}`,
    );
  }
  recombination.forEach((r, i) => {
    assertRecombination(r);
    rates[i + 1] = r;
  });
  return rates;
}

function assertRecombination(r: number): void {
  if (!(r >= 0 && r <= 0.5)) {
    throw new RangeError(`recombination rates must be in [0, 0.5], got ${r}`);
  }
}
