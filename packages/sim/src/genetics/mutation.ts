import type { Rng } from '../rng/index.ts';

/**
 * Decides the additive value of a new mutant allele. Every mutation creates a new allele id
 * (infinite-alleles identity) even when its value equals its parent's.
 */
export interface MutationModel {
  readonly name: string;
  mutate(parentValue: number, locus: number, rng: Rng): number;
}

/** New allele with the same value: tracks identity by descent without changing phenotype. */
export const neutralRelabel: MutationModel = {
  name: 'neutral-relabel',
  mutate: (parentValue) => parentValue,
};

/** Two allelic states; each mutation switches to the other one. */
export function toggle(a = 0, b = 1): MutationModel {
  return { name: `toggle(${a},${b})`, mutate: (parentValue) => (parentValue === a ? b : a) };
}

/** Every mutation produces `target`, with no back mutation (e.g. loss-of-function alleles). */
export function oneWay(target = 1): MutationModel {
  return { name: `one-way(${target})`, mutate: () => target };
}

/**
 * Continuum-of-alleles model (Crow & Kimura 1964; Lande 1975): the mutant's value is its
 * parent's value plus a normal deviate with standard deviation `sd`.
 */
export function gaussianIncrement(sd: number): MutationModel {
  return {
    name: `gaussian(${sd})`,
    mutate: (parentValue, _locus, rng) => parentValue + rng.normal(0, sd),
  };
}
