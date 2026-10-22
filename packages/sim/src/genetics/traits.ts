import type { Population } from './population.ts';

/**
 * Additive genetic value of each individual: the sum of allele values over the given loci
 * (default: all) and over every genome copy.
 */
export function geneticValues(
  pop: Population,
  loci?: readonly number[],
  out = new Float64Array(pop.size),
): Float64Array {
  const genomes = pop.genomes;
  const values = pop.alleles.values;
  const L = pop.loci;
  for (let i = 0; i < pop.size; i++) {
    let g = 0;
    for (let c = 0; c < pop.ploidy; c++) {
      const offset = pop.copyOffset(i, c);
      if (loci === undefined) {
        for (let l = 0; l < L; l++) g += values[genomes[offset + l]];
      } else {
        for (const l of loci) g += values[genomes[offset + l]];
      }
    }
    out[i] = g;
  }
  return out;
}
