import type { Population } from './population.ts';

export type AllelePredicate = (value: number, id: number) => boolean;

/** Fraction of genome copies at `locus` whose allele satisfies `predicate`. */
export function alleleFrequency(
  pop: Population,
  locus: number,
  predicate: AllelePredicate,
): number {
  const genomes = pop.genomes;
  const values = pop.alleles.values;
  let hits = 0;
  for (let copy = 0; copy < pop.copies; copy++) {
    const id = genomes[copy * pop.loci + locus];
    if (predicate(values[id], id)) hits++;
  }
  return hits / pop.copies;
}

/** Frequency of copies carrying exactly `value` at `locus`. */
export function valueFrequency(pop: Population, locus: number, value: number): number {
  return alleleFrequency(pop, locus, (v) => v === value);
}

/** Frequency of `allele` together with every allele descended from it by mutation. */
export function lineageFrequency(pop: Population, allele: number): number {
  const mask = pop.alleles.descendantMask(allele);
  return alleleFrequency(pop, pop.alleles.locus(allele), (_v, id) => mask[id] === 1);
}

/**
 * Gene diversity (expected heterozygosity) 1 - Σ pᵢ² at `locus`, with alleles told apart by
 * value (identity in state) or by id (identity by descent).
 */
export function geneDiversity(
  pop: Population,
  locus: number,
  by: 'value' | 'identity' = 'value',
): number {
  const counts = new Map<number, number>();
  const genomes = pop.genomes;
  const values = pop.alleles.values;
  for (let copy = 0; copy < pop.copies; copy++) {
    const id = genomes[copy * pop.loci + locus];
    const key = by === 'value' ? values[id] : id;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let sumSq = 0;
  for (const n of counts.values()) sumSq += (n / pop.copies) ** 2;
  return 1 - sumSq;
}

/** Mean gene diversity across all loci. */
export function meanGeneDiversity(pop: Population, by: 'value' | 'identity' = 'value'): number {
  let sum = 0;
  for (let l = 0; l < pop.loci; l++) sum += geneDiversity(pop, l, by);
  return sum / pop.loci;
}

/** Counts of diploid individuals carrying 0, 1 and 2 copies that satisfy `predicate`. */
export function genotypeCounts(
  pop: Population,
  locus: number,
  predicate: AllelePredicate,
): [number, number, number] {
  if (pop.ploidy !== 2) throw new Error('genotypeCounts needs a diploid population');
  const counts: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < pop.size; i++) {
    let k = 0;
    for (let c = 0; c < 2; c++) {
      const id = pop.alleleAt(i, c, locus);
      if (predicate(pop.alleles.value(id), id)) k++;
    }
    counts[k]++;
  }
  return counts;
}

/** Number of distinct allele ids present at `locus`. */
export function alleleCount(pop: Population, locus: number): number {
  const seen = new Set<number>();
  for (let copy = 0; copy < pop.copies; copy++) seen.add(pop.genomes[copy * pop.loci + locus]);
  return seen.size;
}

export interface Moments {
  mean: number;
  /** Population variance (divides by n). */
  variance: number;
}

export function moments(xs: ArrayLike<number>): Moments {
  let mean = 0;
  for (let i = 0; i < xs.length; i++) mean += xs[i];
  mean /= xs.length;
  let variance = 0;
  for (let i = 0; i < xs.length; i++) variance += (xs[i] - mean) ** 2;
  return { mean, variance: variance / xs.length };
}

/** Fitness-weighted mean of `xs` (e.g. the mean phenotype of the selected parents). */
export function weightedMean(xs: ArrayLike<number>, weights: ArrayLike<number>): number {
  let sum = 0;
  let total = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i] * weights[i];
    total += weights[i];
  }
  return sum / total;
}
