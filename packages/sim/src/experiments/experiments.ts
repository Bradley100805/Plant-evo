/**
 * Ready-made population-genetics experiments shared by the CLI, the web Lab and (later)
 * Experiment mode. Each returns a tidy table (one observation per row) plus a summary that
 * puts simulated outcomes next to theoretical expectations.
 */
import {
  fixationProbability,
  heterozygosityAfter,
  mutationSelectionBalance,
} from '../genetics/theory.ts';
import {
  introduceAllele,
  moments,
  multiplicativeSelection,
  neutral,
  oneWay,
  type Ploidy,
  Population,
  seedAlleleFrequency,
  singleLocusSelection,
  stepGeneration,
  TraitSelection,
  truncationTopFraction,
  valueFrequency,
  weightedMean,
  geneticValues,
  alleleFrequency,
} from '../genetics/index.ts';
import type { Seed } from '../rng/index.ts';

export interface Table {
  columns: readonly string[];
  rows: number[][];
}

export interface ExperimentResult {
  table: Table;
  summary: Record<string, number>;
}

/** Called with the fraction of work done (0–1) so long runs can report progress. */
export type ProgressFn = (fraction: number) => void;

export interface DriftOptions {
  seed: Seed;
  size: number;
  ploidy: Ploidy;
  generations: number;
  replicates: number;
  /** Starting frequency of the tracked allele. */
  p0: number;
}

/** Neutral allele-frequency trajectories: genetic drift alone. */
export function driftExperiment(o: DriftOptions, onProgress?: ProgressFn): ExperimentResult {
  const rows: number[][] = [];
  let fixed = 0;
  let lost = 0;
  let finalDiversity = 0;
  for (let r = 0; r < o.replicates; r++) {
    const pop = new Population(
      { size: o.size, ploidy: o.ploidy, loci: 1 },
      `${String(o.seed)}/drift/${r}`,
    );
    seedAlleleFrequency(pop, { locus: 0, value: 1, frequency: o.p0 });
    let p = valueFrequency(pop, 0, 1);
    rows.push([r, 0, p, 2 * p * (1 - p)]);
    for (let g = 1; g <= o.generations; g++) {
      stepGeneration(pop, neutral);
      p = valueFrequency(pop, 0, 1);
      rows.push([r, g, p, 2 * p * (1 - p)]);
    }
    if (p === 1) fixed++;
    if (p === 0) lost++;
    finalDiversity += 2 * p * (1 - p);
    onProgress?.((r + 1) / o.replicates);
  }
  const p0 = rows[0]?.[2] ?? o.p0;
  return {
    table: { columns: ['replicate', 'generation', 'frequency', 'gene_diversity'], rows },
    summary: {
      replicates: o.replicates,
      fixed,
      lost,
      segregating: o.replicates - fixed - lost,
      expected_fixation_probability: p0,
      mean_final_gene_diversity: finalDiversity / o.replicates,
      expected_final_gene_diversity: heterozygosityAfter(
        2 * p0 * (1 - p0),
        o.size * o.ploidy,
        o.generations,
      ),
    },
  };
}

export interface SweepOptions {
  seed: Seed;
  size: number;
  ploidy: Ploidy;
  /** Selection coefficient of the mutant homozygote (or haploid mutant). */
  s: number;
  /** Dominance (diploid only). */
  h: number;
  replicates: number;
  /** Replicates still segregating after this many generations are counted as unresolved. */
  maxGenerations: number;
}

/**
 * The fate of a single new mutant, as in the Mutation Draft: introduce one copy, then follow it
 * until it fixes or is lost.
 */
export function sweepExperiment(o: SweepOptions, onProgress?: ProgressFn): ExperimentResult {
  const rows: number[][] = [];
  const fitness = singleLocusSelection(0, { s: o.s, h: o.h, isMutant: (v) => v === 1 });
  let fixed = 0;
  let lost = 0;
  let fixationTime = 0;
  for (let r = 0; r < o.replicates; r++) {
    const pop = new Population(
      { size: o.size, ploidy: o.ploidy, loci: 1 },
      `${String(o.seed)}/sweep/${r}`,
    );
    introduceAllele(pop, { locus: 0, value: 1 });
    let p = valueFrequency(pop, 0, 1);
    rows.push([r, 0, p]);
    for (let g = 1; g <= o.maxGenerations && p > 0 && p < 1; g++) {
      stepGeneration(pop, fitness);
      p = valueFrequency(pop, 0, 1);
      rows.push([r, g, p]);
    }
    if (p === 1) {
      fixed++;
      fixationTime += pop.generation;
    } else if (p === 0) lost++;
    onProgress?.((r + 1) / o.replicates);
  }
  const p0 = 1 / (o.size * o.ploidy);
  return {
    table: { columns: ['replicate', 'generation', 'frequency'], rows },
    summary: {
      replicates: o.replicates,
      fixed,
      lost,
      unresolved: o.replicates - fixed - lost,
      fixation_rate: fixed / o.replicates,
      expected_fixation_probability: fixationProbability({
        p: p0,
        size: o.size,
        ploidy: o.ploidy,
        s: o.s,
        h: o.h,
      }),
      neutral_fixation_probability: p0,
      mean_fixation_time: fixed > 0 ? fixationTime / fixed : NaN,
    },
  };
}

export interface MutationSelectionOptions {
  seed: Seed;
  size: number;
  loci: number;
  /** Mutation rate to the deleterious allele, per locus per gene copy per generation. */
  mu: number;
  /** Fitness cost of the deleterious homozygote (positive number). */
  s: number;
  h: number;
  generations: number;
}

/** Deleterious mutations arising and being purged: mutation–selection balance. */
export function mutationSelectionExperiment(
  o: MutationSelectionOptions,
  onProgress?: ProgressFn,
): ExperimentResult {
  const pop = new Population(
    { size: o.size, ploidy: 2, loci: o.loci, mutationRate: o.mu, mutation: oneWay(1) },
    `${String(o.seed)}/mutsel`,
  );
  const fitness = multiplicativeSelection({ s: -o.s, h: o.h, isMutant: (v) => v === 1 });
  const rows: number[][] = [];
  const secondHalf: number[] = [];
  for (let g = 1; g <= o.generations; g++) {
    stepGeneration(pop, fitness);
    let q = 0;
    for (let l = 0; l < o.loci; l++) q += alleleFrequency(pop, l, (v) => v === 1);
    q /= o.loci;
    rows.push([g, q]);
    if (g > o.generations / 2) secondHalf.push(q);
    onProgress?.(g / o.generations);
  }
  return {
    table: { columns: ['generation', 'mean_q'], rows },
    summary: {
      expected_q: mutationSelectionBalance(o.mu, o.s, o.h),
      mean_q_second_half: moments(secondHalf).mean,
    },
  };
}

export interface TruncationOptions {
  seed: Seed;
  size: number;
  loci: number;
  /** Additive effect of the "+" allele at each locus (starting frequency 0.5). */
  effect: number;
  environmentalVariance: number;
  /** Fraction of individuals allowed to reproduce each generation. */
  fraction: number;
  generations: number;
}

/** Artificial (truncation) selection on a quantitative trait, compared with R = h²S. */
export function truncationExperiment(
  o: TruncationOptions,
  onProgress?: ProgressFn,
): ExperimentResult {
  const pop = new Population(
    { size: o.size, ploidy: 2, loci: o.loci },
    `${String(o.seed)}/truncation`,
  );
  for (let l = 0; l < o.loci; l++)
    seedAlleleFrequency(pop, { locus: l, value: o.effect, frequency: 0.5 });
  const model = new TraitSelection({
    environmentalVariance: o.environmentalVariance,
    selection: truncationTopFraction(o.fraction),
  });
  const rows: number[][] = [];
  let firstMean = NaN;
  let lastMean = NaN;
  for (let g = 0; g < o.generations; g++) {
    stepGeneration(pop, model);
    const genetic = moments(model.genetic);
    const phenotype = moments(model.phenotypes);
    const S = weightedMean(model.phenotypes, pop.fitness) - phenotype.mean;
    const predicted = phenotype.variance > 0 ? (genetic.variance / phenotype.variance) * S : 0;
    lastMean = moments(geneticValues(pop)).mean;
    if (g === 0) firstMean = genetic.mean;
    rows.push([
      g,
      genetic.mean,
      genetic.variance,
      phenotype.mean,
      phenotype.variance,
      S,
      predicted,
      lastMean - genetic.mean,
    ]);
    onProgress?.((g + 1) / o.generations);
  }
  return {
    table: {
      columns: [
        'generation',
        'mean_genetic',
        'var_genetic',
        'mean_phenotype',
        'var_phenotype',
        'selection_differential',
        'predicted_response',
        'realized_response',
      ],
      rows,
    },
    summary: { total_response: lastMean - firstMean, generations: o.generations },
  };
}
