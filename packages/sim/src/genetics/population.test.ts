import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NO_PARENT } from './alleles.ts';
import { neutral, singleLocusSelection, TraitSelection, truncationTopFraction } from './fitness.ts';
import { gaussianIncrement, neutralRelabel, oneWay } from './mutation.ts';
import {
  introduceAllele,
  Population,
  type PopulationConfig,
  seedAlleleFrequency,
} from './population.ts';
import { runGenerations, stepGeneration } from './reproduction.ts';
import { genotypeCounts, lineageFrequency, valueFrequency } from './stats.ts';
import { geneticValues } from './traits.ts';

function checksum(pop: Population): number {
  let h = 0;
  for (let i = 0; i < pop.genomes.length; i++) {
    h = (Math.imul(h, 31) + Math.round(pop.alleles.value(pop.genomes[i]) * 1e6)) | 0;
  }
  return h >>> 0;
}

describe('Population', () => {
  it('starts monomorphic for one founder allele per locus', () => {
    const pop = new Population({ size: 4, ploidy: 2, loci: 3, founderValue: 1.5 }, 's');
    expect(pop.copies).toBe(8);
    expect(pop.alleles.count).toBe(3);
    for (let l = 0; l < 3; l++) {
      expect(valueFrequency(pop, l, 1.5)).toBe(1);
      expect(pop.alleles.locus(pop.alleleAt(3, 1, l))).toBe(l);
    }
  });

  it('rejects invalid configuration', () => {
    const base: PopulationConfig = { size: 10, ploidy: 2, loci: 2 };
    expect(() => new Population({ ...base, size: 0 }, 1)).toThrow(RangeError);
    expect(() => new Population({ ...base, size: 2.5 }, 1)).toThrow(RangeError);
    expect(() => new Population({ ...base, ploidy: 3 as 2 }, 1)).toThrow(RangeError);
    expect(() => new Population({ ...base, mutationRate: 2 }, 1)).toThrow(RangeError);
    expect(() => new Population({ ...base, recombination: 0.7 }, 1)).toThrow(RangeError);
    expect(() => new Population({ ...base, recombination: [0.1, 0.2] }, 1)).toThrow(RangeError);
    expect(() => new Population({ ...base, selfingRate: -0.1 }, 1)).toThrow(RangeError);
  });

  it('seeds an exact starting frequency', () => {
    const pop = new Population({ size: 50, ploidy: 2, loci: 1 }, 'seed');
    seedAlleleFrequency(pop, { locus: 0, value: 1, frequency: 0.3 });
    expect(valueFrequency(pop, 0, 1)).toBe(0.3);
  });

  it('introduces a single mutant whose parent is the allele it replaced', () => {
    const pop = new Population({ size: 20, ploidy: 2, loci: 2 }, 'intro');
    const id = introduceAllele(pop, { locus: 1, value: 0.25 });
    expect(valueFrequency(pop, 1, 0.25)).toBe(1 / 40);
    expect(pop.alleles.parent(id)).toBe(1);
    const group = introduceAllele(pop, { locus: 1, value: 0.5, copies: 4 });
    expect(pop.alleles.parent(group)).toBe(NO_PARENT);
    expect(() => pop.setAllele(0, 0, 0, id)).toThrow(RangeError);
  });

  it('is reproducible from its seed', () => {
    const run = (seed: string) => {
      const pop = new Population(
        { size: 40, ploidy: 2, loci: 10, mutationRate: 0.01, mutation: gaussianIncrement(0.1) },
        seed,
      );
      runGenerations(pop, neutral, 30);
      return checksum(pop);
    };
    expect(run('golden')).toBe(run('golden'));
    expect(run('golden')).not.toBe(run('other'));
    // Golden value: changes only when the order or meaning of random draws changes. If that is
    // intended, update it with `vitest -u` and note it in the changelog (old saves won't replay).
    expect(run('golden')).toMatchInlineSnapshot(`1773202560`);
  });
});

describe('stepGeneration', () => {
  it('keeps the population size and advances the generation counter', () => {
    const pop = new Population({ size: 25, ploidy: 2, loci: 4, mutationRate: 0.05 }, 'size');
    const report = stepGeneration(pop, neutral);
    expect(report).toMatchObject({ generation: 1, meanFitness: 1, extinct: false });
    expect(pop.genomes.length).toBe(25 * 2 * 4);
  });

  it('reports extinction and leaves the population unchanged when nobody can reproduce', () => {
    const pop = new Population({ size: 10, ploidy: 2, loci: 1 }, 'extinct');
    const before = pop.genomes.slice();
    const report = stepGeneration(pop, { name: 'lethal', evaluate: (_p, out) => out.fill(0) });
    expect(report.extinct).toBe(true);
    expect(pop.generation).toBe(0);
    expect(pop.genomes).toEqual(before);
  });

  it('copies a parent exactly under clonal reproduction without mutation', () => {
    const pop = new Population({ size: 30, ploidy: 2, loci: 5, reproduction: 'clonal' }, 'clone');
    for (let l = 0; l < 5; l++) seedAlleleFrequency(pop, { locus: l, value: 1, frequency: 0.5 });
    const parents = new Set<string>();
    for (let i = 0; i < pop.size; i++)
      parents.add(pop.genomes.slice(pop.copyOffset(i, 0), pop.copyOffset(i + 1, 0)).join());
    stepGeneration(pop, neutral);
    for (let i = 0; i < pop.size; i++) {
      expect(
        parents.has(pop.genomes.slice(pop.copyOffset(i, 0), pop.copyOffset(i + 1, 0)).join()),
      ).toBe(true);
    }
  });

  it('transmits whole parental copies when loci are fully linked', () => {
    const pop = new Population({ size: 30, ploidy: 2, loci: 6, recombination: 0 }, 'linked');
    for (let l = 0; l < 6; l++) seedAlleleFrequency(pop, { locus: l, value: 1, frequency: 0.5 });
    const haplotypes = new Set<string>();
    for (let c = 0; c < pop.copies; c++) haplotypes.add(pop.genomes.slice(c * 6, c * 6 + 6).join());
    stepGeneration(pop, neutral);
    for (let c = 0; c < pop.copies; c++) {
      expect(haplotypes.has(pop.genomes.slice(c * 6, c * 6 + 6).join())).toBe(true);
    }
  });

  it('halves heterozygosity each generation under complete selfing', () => {
    const pop = new Population({ size: 4000, ploidy: 2, loci: 1, selfingRate: 1 }, 'selfing');
    const het = pop.alleles.add(1, 0, NO_PARENT, 0);
    for (let i = 0; i < pop.size; i++) pop.setAllele(i, 1, 0, het);
    const heterozygosity = () => genotypeCounts(pop, 0, (v) => v === 1)[1] / pop.size;
    expect(heterozygosity()).toBe(1);
    stepGeneration(pop, neutral);
    expect(heterozygosity()).toBeCloseTo(0.5, 1);
    stepGeneration(pop, neutral);
    expect(heterozygosity()).toBeCloseTo(0.25, 1);
  });

  it('creates about 2·N·L·μ mutations per diploid generation', () => {
    const pop = new Population({ size: 500, ploidy: 2, loci: 40, mutationRate: 0.002 }, 'mut');
    let total = 0;
    for (let g = 0; g < 20; g++) total += stepGeneration(pop, neutral).mutations;
    const expected = 20 * 2 * 500 * 40 * 0.002;
    expect(Math.abs(total - expected)).toBeLessThan(4 * Math.sqrt(expected));
  });

  it('keeps the genealogy independent of the mutation rate', () => {
    const trajectory = (mutationRate: number) => {
      const pop = new Population(
        { size: 60, ploidy: 2, loci: 3, mutationRate, mutation: neutralRelabel },
        'genealogy',
      );
      seedAlleleFrequency(pop, { locus: 1, value: 1, frequency: 0.3 });
      const freqs: number[] = [];
      for (let g = 0; g < 30; g++) {
        stepGeneration(pop, neutral);
        freqs.push(valueFrequency(pop, 1, 1));
      }
      return freqs;
    };
    expect(trajectory(0.05)).toEqual(trajectory(0));
  });

  it('compacts the allele table while keeping pinned lineages intact', () => {
    const pop = new Population(
      { size: 50, ploidy: 2, loci: 20, mutationRate: 0.05, mutation: gaussianIncrement(0.1) },
      'compact',
    );
    const tracked = introduceAllele(pop, { locus: 3, value: 10, copies: 40 });
    pop.pin('draft', tracked);
    let maxCount = 0;
    for (let g = 0; g < 200; g++) {
      stepGeneration(pop, singleLocusSelection(3, { s: 0.5, isMutant: (v) => v > 5 }));
      maxCount = Math.max(maxCount, pop.alleles.count);
      const before = lineageFrequency(pop, pop.pinned('draft')!);
      pop.compactAlleles();
      expect(lineageFrequency(pop, pop.pinned('draft')!)).toBe(before);
    }
    expect(maxCount).toBeLessThan(2 * pop.genomes.length + 4096 + 2 * 50 * 20);
    expect(pop.alleles.value(pop.pinned('draft')!)).toBe(10);
  });

  it('only stores valid allele ids at the right loci (property)', () => {
    fc.assert(
      fc.property(
        fc.record({
          size: fc.integer({ min: 1, max: 30 }),
          ploidy: fc.constantFrom<1 | 2>(1, 2),
          loci: fc.integer({ min: 1, max: 8 }),
          mutationRate: fc.double({ min: 0, max: 0.3, noNaN: true }),
          recombination: fc.double({ min: 0, max: 0.5, noNaN: true }),
          reproduction: fc.constantFrom<'sexual' | 'clonal'>('sexual', 'clonal'),
          selfingRate: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
          generations: fc.integer({ min: 1, max: 15 }),
          seed: fc.integer(),
        }),
        ({ generations, seed, ...config }) => {
          const pop = new Population({ ...config, mutation: oneWay(1) }, seed);
          runGenerations(pop, singleLocusSelection(0, { s: -0.5 }), generations);
          pop.compactAlleles();
          for (let copy = 0; copy < pop.copies; copy++) {
            for (let l = 0; l < pop.loci; l++) {
              const id = pop.genomes[copy * pop.loci + l];
              if (id >= pop.alleles.count || pop.alleles.locus(id) !== l) return false;
            }
          }
          const p = valueFrequency(pop, 0, 1);
          return p >= 0 && p <= 1;
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('trait selection', () => {
  it('sums allele values over copies and loci', () => {
    const pop = new Population({ size: 3, ploidy: 2, loci: 2 }, 'g');
    const a = pop.alleles.add(1, 0, NO_PARENT, 0);
    const b = pop.alleles.add(0.5, 1, NO_PARENT, 0);
    pop.setAllele(0, 0, 0, a);
    pop.setAllele(0, 1, 0, a);
    pop.setAllele(1, 0, 1, b);
    expect(Array.from(geneticValues(pop))).toEqual([2, 0.5, 0]);
    expect(Array.from(geneticValues(pop, [1]))).toEqual([0, 0.5, 0]);
  });

  it('lets only the top fraction reproduce under truncation selection', () => {
    const select = truncationTopFraction(0.25);
    const out = new Float64Array(8);
    select(new Float64Array([5, 1, 7, 3, 2, 8, 0, 4]), out);
    expect(Array.from(out)).toEqual([0, 0, 1, 0, 0, 1, 0, 0]);
    expect(() => truncationTopFraction(0)).toThrow(RangeError);
  });

  it('records genetic values and noisy phenotypes', () => {
    const pop = new Population({ size: 2000, ploidy: 2, loci: 1 }, 'pheno');
    const model = new TraitSelection({
      environmentalVariance: 4,
      selection: (_z, out) => out.fill(1),
    });
    model.evaluate(pop, pop.fitness, pop.rng.fitness);
    const residual = model.phenotypes.map((z, i) => z - model.genetic[i]);
    const variance = residual.reduce((acc, e) => acc + e * e, 0) / residual.length;
    expect(variance).toBeGreaterThan(3.5);
    expect(variance).toBeLessThan(4.5);
  });
});
