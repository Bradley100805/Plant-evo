import type { Rng } from '../rng/index.ts';
import type { Population } from './population.ts';
import { geneticValues } from './traits.ts';

/**
 * Assigns each individual a relative fitness (expected share of offspring).
 *
 * Phase 1 placeholder: from Phase 2 on, fitness emerges from simulated growth, survival and
 * reproduction instead of being specified directly. These models remain for validation against
 * population-genetics theory.
 */
export interface FitnessModel {
  readonly name: string;
  evaluate(pop: Population, out: Float64Array, rng: Rng): void;
}

export type MutantTest = (alleleValue: number) => boolean;
const nonZero: MutantTest = (v) => v !== 0;

/** Every individual has fitness 1: pure drift. */
export const neutral: FitnessModel = {
  name: 'neutral',
  evaluate: (_pop, out) => {
    out.fill(1);
  },
};

export interface LocusSelectionOptions {
  /** Selection coefficient of the mutant homozygote (diploid) or mutant (haploid). */
  s: number;
  /** Dominance coefficient: heterozygote fitness is 1 + h·s. Default 0.5 (additive). */
  h?: number;
  /** Which allele values count as "mutant". Default: any non-zero value. */
  isMutant?: MutantTest;
}

/**
 * Viability selection on one biallelic locus. Diploid fitness by mutant copy count 0/1/2 is
 * 1, 1 + h·s, 1 + s; haploid fitness is 1 or 1 + s.
 */
export function singleLocusSelection(locus: number, options: LocusSelectionOptions): FitnessModel {
  const fitnessByCount = genotypeFitness(options);
  const isMutant = options.isMutant ?? nonZero;
  return {
    name: `single-locus(l=${locus}, s=${options.s}, h=${options.h ?? 0.5})`,
    evaluate(pop, out) {
      const values = pop.alleles.values;
      for (let i = 0; i < pop.size; i++) {
        let k = 0;
        for (let c = 0; c < pop.ploidy; c++) {
          if (isMutant(values[pop.genomes[pop.copyOffset(i, c) + locus]])) k++;
        }
        out[i] = pop.ploidy === 1 ? fitnessByCount[2 * k] : fitnessByCount[k];
      }
    },
  };
}

/** Independent selection at every locus, combined multiplicatively. */
export function multiplicativeSelection(options: LocusSelectionOptions): FitnessModel {
  const fitnessByCount = genotypeFitness(options);
  const isMutant = options.isMutant ?? nonZero;
  return {
    name: `multiplicative(s=${options.s}, h=${options.h ?? 0.5})`,
    evaluate(pop, out) {
      const values = pop.alleles.values;
      const genomes = pop.genomes;
      for (let i = 0; i < pop.size; i++) {
        let w = 1;
        for (let l = 0; l < pop.loci; l++) {
          let k = 0;
          for (let c = 0; c < pop.ploidy; c++) {
            if (isMutant(values[genomes[pop.copyOffset(i, c) + l]])) k++;
          }
          w *= pop.ploidy === 1 ? fitnessByCount[2 * k] : fitnessByCount[k];
        }
        out[i] = w;
      }
    },
  };
}

function genotypeFitness({ s, h = 0.5 }: LocusSelectionOptions): [number, number, number] {
  return [1, Math.max(0, 1 + h * s), Math.max(0, 1 + s)];
}

/** Maps phenotypes to fitness for a whole population at once (so it can rank individuals). */
export type PhenotypeSelection = (phenotypes: Float64Array, out: Float64Array) => void;

export interface TraitSelectionOptions {
  /** Loci contributing additively to the trait. Default: all. */
  loci?: readonly number[];
  /** Variance of the non-heritable (environmental) component, drawn fresh every generation. */
  environmentalVariance: number;
  selection: PhenotypeSelection;
}

/**
 * Selection on a quantitative trait z = G + E, where G is the additive genetic value and
 * E ~ Normal(0, Ve). Keeps the latest genetic values and phenotypes for analysis.
 */
export class TraitSelection implements FitnessModel {
  readonly name = 'trait-selection';
  genetic = new Float64Array(0);
  phenotypes = new Float64Array(0);

  constructor(private readonly options: TraitSelectionOptions) {
    if (!(options.environmentalVariance >= 0)) {
      throw new RangeError('environmentalVariance must be >= 0');
    }
  }

  evaluate(pop: Population, out: Float64Array, rng: Rng): void {
    if (this.genetic.length !== pop.size) {
      this.genetic = new Float64Array(pop.size);
      this.phenotypes = new Float64Array(pop.size);
    }
    geneticValues(pop, this.options.loci, this.genetic);
    const sd = Math.sqrt(this.options.environmentalVariance);
    for (let i = 0; i < pop.size; i++) {
      this.phenotypes[i] = this.genetic[i] + (sd > 0 ? rng.normal(0, sd) : 0);
    }
    this.options.selection(this.phenotypes, out);
  }
}

/** Applies `fitnessOf` to each phenotype independently. */
export function perIndividual(fitnessOf: (z: number) => number): PhenotypeSelection {
  return (phenotypes, out) => {
    for (let i = 0; i < phenotypes.length; i++) out[i] = fitnessOf(phenotypes[i]);
  };
}

/** Gaussian stabilizing selection: w(z) = exp(-(z - optimum)² / (2·width²)). */
export function gaussianStabilizing(optimum: number, width: number): PhenotypeSelection {
  return perIndividual((z) => Math.exp(-((z - optimum) ** 2) / (2 * width * width)));
}

/** Directional selection: w(z) = exp(beta·z). */
export function exponentialDirectional(beta: number): PhenotypeSelection {
  return perIndividual((z) => Math.exp(beta * z));
}

/** Truncation selection: only the top `fraction` of phenotypes reproduce, all equally. */
export function truncationTopFraction(fraction: number): PhenotypeSelection {
  if (!(fraction > 0 && fraction <= 1)) throw new RangeError('fraction must be in (0, 1]');
  return (phenotypes, out) => {
    const keep = Math.max(1, Math.round(fraction * phenotypes.length));
    const order = Array.from(phenotypes.keys()).sort((a, b) => phenotypes[b] - phenotypes[a]);
    out.fill(0);
    for (let r = 0; r < keep; r++) out[order[r]] = 1;
  };
}
