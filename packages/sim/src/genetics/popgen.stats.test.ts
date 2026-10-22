/**
 * Statistical validation of the population-genetics engine against analytical theory.
 * Specification: docs/science/01-population-genetics.md (section "Validation").
 *
 * Runs are seeded, so results are deterministic for a given STATS_SEED. CI uses the default
 * seed; the nightly job sets STATS_SEED=random to catch tests that only pass for one seed.
 * STATS_SCALE multiplies replicate counts (default 1).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NO_PARENT } from './alleles.ts';
import {
  type FitnessModel,
  multiplicativeSelection,
  neutral,
  singleLocusSelection,
  TraitSelection,
  truncationTopFraction,
} from './fitness.ts';
import { neutralRelabel, oneWay } from './mutation.ts';
import { Population, type PopulationConfig, seedAlleleFrequency } from './population.ts';
import { runGenerations, stepGeneration } from './reproduction.ts';
import {
  alleleFrequency,
  geneDiversity,
  genotypeCounts,
  meanGeneDiversity,
  moments,
  valueFrequency,
  weightedMean,
} from './stats.ts';
import {
  driftVariance,
  fixationProbability,
  heterozygosityAfter,
  infiniteAllelesDiversity,
  mutationSelectionBalance,
} from './theory.ts';
import { geneticValues } from './traits.ts';

const SEED =
  process.env.STATS_SEED === 'random' ? randomUUID() : (process.env.STATS_SEED ?? 'plant-evo');
const SCALE = Number(process.env.STATS_SCALE ?? '1');
console.info(`popgen stats: STATS_SEED=${SEED} STATS_SCALE=${SCALE}`);

const reps = (n: number) => Math.max(1, Math.round(n * SCALE));
/** Monte Carlo tolerance: z standard errors plus an allowance for diffusion-approximation error. */
const tolerance = (se: number, modelError = 0, z = 4) => z * se + modelError;
const binomialSe = (p: number, n: number) => Math.sqrt((p * (1 - p)) / n);

const isMutant = (v: number) => v === 1;

/** Asserts |observed − expected| < tol and logs the comparison so CI output shows the margin. */
function check(label: string, observed: number, expected: number, tol: number): void {
  const fmt = (x: number) => x.toPrecision(4);
  console.info(
    `${label}: observed ${fmt(observed)}, expected ${fmt(expected)}, |diff| ${fmt(Math.abs(observed - expected))} < ${fmt(tol)}`,
  );
  expect(Math.abs(observed - expected), label).toBeLessThan(tol);
}

/** Fraction of replicates in which the allele with value 1 at locus 0 goes to fixation. */
function fixationRate(
  label: string,
  replicates: number,
  make: (seed: string) => Population,
  fitness: FitnessModel,
): number {
  let fixed = 0;
  for (let r = 0; r < replicates; r++) {
    const pop = make(`${SEED}/${label}/${r}`);
    let p = alleleFrequency(pop, 0, isMutant);
    runGenerations(pop, fitness, 1_000_000, () => {
      p = alleleFrequency(pop, 0, isMutant);
      return p === 0 || p === 1;
    });
    if (p === 1) fixed++;
  }
  return fixed / replicates;
}

function withFrequency(config: PopulationConfig, frequency: number) {
  return (seed: string) => {
    const pop = new Population(config, seed);
    seedAlleleFrequency(pop, { locus: 0, value: 1, frequency });
    return pop;
  };
}

describe('fixation probability', () => {
  it('equals the starting frequency for a neutral allele (diploid)', () => {
    const n = reps(3000);
    const observed = fixationRate(
      'neutral-diploid',
      n,
      withFrequency({ size: 50, ploidy: 2, loci: 1 }, 0.2),
      neutral,
    );
    check('neutral fixation (diploid)', observed, 0.2, tolerance(binomialSe(0.2, n)));
  });

  it('equals the starting frequency for a neutral allele (haploid)', () => {
    const n = reps(3000);
    const observed = fixationRate(
      'neutral-haploid',
      n,
      withFrequency({ size: 100, ploidy: 1, loci: 1 }, 0.1),
      neutral,
    );
    check('neutral fixation (haploid)', observed, 0.1, tolerance(binomialSe(0.1, n)));
  });

  it('matches Kimura for a single new beneficial mutant (diploid, additive)', () => {
    // Genotype fitness 1, 1.02, 1.04: allelic advantage 0.02, 4N·0.02 = 8.
    const N = 100;
    const n = reps(20_000);
    const expected = fixationProbability({ p: 1 / (2 * N), size: N, ploidy: 2, s: 0.04 });
    const observed = fixationRate(
      'beneficial-diploid',
      n,
      withFrequency({ size: N, ploidy: 2, loci: 1 }, 1 / (2 * N)),
      singleLocusSelection(0, { s: 0.04, h: 0.5, isMutant }),
    );
    check(
      'Kimura beneficial (diploid)',
      observed,
      expected,
      tolerance(binomialSe(expected, n), 0.05 * expected),
    );
    // A beneficial mutant is still lost most of the time (learning goal 3).
    expect(observed).toBeLessThan(0.1);
  });

  it('matches Kimura for a beneficial mutant in a haploid population', () => {
    const N = 200;
    const n = reps(10_000);
    const expected = fixationProbability({ p: 1 / N, size: N, ploidy: 1, s: 0.05 });
    const observed = fixationRate(
      'beneficial-haploid',
      n,
      withFrequency({ size: N, ploidy: 1, loci: 1 }, 1 / N),
      singleLocusSelection(0, { s: 0.05, isMutant }),
    );
    check(
      'Kimura beneficial (haploid)',
      observed,
      expected,
      tolerance(binomialSe(expected, n), 0.05 * expected),
    );
  });

  it('matches Kimura for a deleterious allele starting at 10%', () => {
    // Genotype fitness 1, 0.99, 0.98: allelic effect −0.01, 4N·(−0.01) = −2.
    const N = 50;
    const n = reps(5000);
    const expected = fixationProbability({ p: 0.1, size: N, ploidy: 2, s: -0.02 });
    const observed = fixationRate(
      'deleterious-diploid',
      n,
      withFrequency({ size: N, ploidy: 2, loci: 1 }, 0.1),
      singleLocusSelection(0, { s: -0.02, h: 0.5, isMutant }),
    );
    check(
      'Kimura deleterious (diploid)',
      observed,
      expected,
      tolerance(binomialSe(expected, n), 0.05 * expected),
    );
    expect(observed).toBeLessThan(0.1);
  });
});

describe('genetic drift', () => {
  function heterozygosityDecay(ploidy: 1 | 2, N: number) {
    const loci = 100;
    const checkpoints = [10, 30, 60];
    const replicates = reps(40);
    const perReplicate: number[][] = checkpoints.map(() => []);
    for (let r = 0; r < replicates; r++) {
      const pop = new Population({ size: N, ploidy, loci }, `${SEED}/hdecay-${ploidy}/${r}`);
      for (let l = 0; l < loci; l++)
        seedAlleleFrequency(pop, { locus: l, value: 1, frequency: 0.5 });
      let next = 0;
      for (let t = 1; t <= checkpoints[checkpoints.length - 1]; t++) {
        stepGeneration(pop, neutral);
        if (t === checkpoints[next]) perReplicate[next++].push(meanGeneDiversity(pop));
      }
    }
    const geneCopies = ploidy * N;
    return checkpoints.map((t, i) => {
      const { mean, variance } = moments(perReplicate[i]);
      return {
        t,
        mean,
        se: Math.sqrt(variance / replicates),
        expected: heterozygosityAfter(0.5, geneCopies, t),
      };
    });
  }

  it('erodes heterozygosity as H₀(1 − 1/2N)^t in diploids', () => {
    for (const { t, mean, se, expected } of heterozygosityDecay(2, 50)) {
      check(`H decay (diploid) t=${t}`, mean, expected, tolerance(se, 0.005));
    }
  });

  it('erodes heterozygosity as H₀(1 − 1/N)^t in haploids', () => {
    for (const { t, mean, se, expected } of heterozygosityDecay(1, 100)) {
      check(`H decay (haploid) t=${t}`, mean, expected, tolerance(se, 0.005));
    }
  });

  it('changes allele frequency by Δp with variance p(1 − p)/2N per generation', () => {
    const N = 200;
    const loci = 200;
    const p = 0.3;
    const deltas: number[] = [];
    for (let r = 0; r < reps(10); r++) {
      const pop = new Population({ size: N, ploidy: 2, loci }, `${SEED}/deltap/${r}`);
      for (let l = 0; l < loci; l++) seedAlleleFrequency(pop, { locus: l, value: 1, frequency: p });
      stepGeneration(pop, neutral);
      for (let l = 0; l < loci; l++) deltas.push(valueFrequency(pop, l, 1) - p);
    }
    const expected = driftVariance(p, 2 * N);
    const { mean, variance } = moments(deltas);
    check('mean Δp', mean, 0, tolerance(Math.sqrt(expected / deltas.length)));
    check(
      'Var(Δp) / [p(1−p)/2N]',
      variance / expected,
      1,
      tolerance(Math.sqrt(2 / (deltas.length - 1))),
    );
  });
});

describe('random mating', () => {
  it('restores Hardy–Weinberg proportions after one generation', () => {
    const N = 20_000;
    const pop = new Population({ size: N, ploidy: 2, loci: 1 }, `${SEED}/hw`);
    const A = pop.alleles.add(1, 0, NO_PARENT, 0);
    // Start far from equilibrium: 30% AA homozygotes, 70% aa, no heterozygotes.
    for (let i = 0; i < 0.3 * N; i++) {
      pop.setAllele(i, 0, 0, A);
      pop.setAllele(i, 1, 0, A);
    }
    expect(genotypeCounts(pop, 0, isMutant)[1]).toBe(0);

    stepGeneration(pop, neutral);
    const observed = genotypeCounts(pop, 0, isMutant);
    const p = valueFrequency(pop, 0, 1);
    const expected = [(1 - p) ** 2 * N, 2 * p * (1 - p) * N, p ** 2 * N];
    const chiSquare = observed.reduce((acc, o, k) => acc + (o - expected[k]) ** 2 / expected[k], 0);
    // 1 degree of freedom (p estimated): P(chi2 > 15.1) = 1e-4.
    check('Hardy–Weinberg chi-square', chiSquare, 0, 15.1);
  });
});

describe('mutation', () => {
  it('reaches mutation–selection balance q ≈ μ/(h·s) for a partially dominant deleterious allele', () => {
    const mu = 0.001;
    const s = 0.1;
    const h = 0.5;
    const loci = 20;
    const pop = new Population(
      { size: 1000, ploidy: 2, loci, mutationRate: mu, mutation: oneWay(1) },
      `${SEED}/mutsel`,
    );
    const fitness = multiplicativeSelection({ s: -s, h, isMutant });
    runGenerations(pop, fitness, 300);
    const samples: number[] = [];
    for (let g = 0; g < reps(1000); g++) {
      stepGeneration(pop, fitness);
      let q = 0;
      for (let l = 0; l < loci; l++) q += valueFrequency(pop, l, 1);
      samples.push(q / loci);
    }
    const expected = mutationSelectionBalance(mu, s, h);
    check('mutation–selection balance q', moments(samples).mean, expected, 0.12 * expected);
  });

  it('reaches the infinite-alleles equilibrium for neutral mutations', () => {
    const N = 100;
    const mu = 0.0025;
    const loci = 50;
    const pop = new Population(
      { size: N, ploidy: 2, loci, mutationRate: mu, mutation: neutralRelabel },
      `${SEED}/infinite-alleles`,
    );
    runGenerations(pop, neutral, 1000);
    const samples: number[] = [];
    for (let g = 0; g < reps(2000); g++) {
      stepGeneration(pop, neutral);
      if (g % 10 === 0) {
        for (let l = 0; l < loci; l++) samples.push(geneDiversity(pop, l, 'identity'));
      }
    }
    // θ = 4Nμ = 1, so gene diversity ≈ θ/(1 + θ) = 0.5.
    const expected = infiniteAllelesDiversity(2 * N, mu);
    check('infinite-alleles gene diversity', moments(samples).mean, expected, 0.03);
  });
});

describe('quantitative genetics', () => {
  it("responds to truncation selection as the breeder's equation predicts (R = h²S)", () => {
    const N = 5000;
    const loci = 100;
    const pop = new Population({ size: N, ploidy: 2, loci }, `${SEED}/breeder`);
    for (let l = 0; l < loci; l++)
      seedAlleleFrequency(pop, { locus: l, value: 0.1, frequency: 0.5 });
    // Va = Σ 2pq·a² = 100 · 0.5 · 0.01 = 0.5; Ve = 0.5, so h² ≈ 0.5.
    const model = new TraitSelection({
      environmentalVariance: 0.5,
      selection: truncationTopFraction(0.2),
    });

    stepGeneration(pop, model);
    // `model` still holds generation 0's values; pop.fitness marks the selected parents.
    const g0 = moments(model.genetic);
    const p0 = moments(model.phenotypes);
    const S = weightedMean(model.phenotypes, pop.fitness) - p0.mean;
    const predicted = (g0.variance / p0.variance) * S;
    const response = moments(geneticValues(pop)).mean - g0.mean;

    expect(S).toBeGreaterThan(1);
    check("breeder's equation response", response, predicted, 0.05);
  });
});
