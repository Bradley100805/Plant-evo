import type { Rng } from '../rng/index.ts';
import type { FitnessModel } from './fitness.ts';
import type { Population } from './population.ts';
import { AliasSampler } from './sampling.ts';
import { mutateCopy, recombineCopy } from './transmission.ts';

export interface GenerationReport {
  /** Generation number after the step. */
  generation: number;
  meanFitness: number;
  /** New mutant alleles created this step. */
  mutations: number;
  /** True when no individual had positive fitness; the population is left unchanged. */
  extinct: boolean;
}

const samplers = new WeakMap<Population, AliasSampler>();

/**
 * Advances one non-overlapping (Wright–Fisher) generation:
 * fitness → parent sampling in proportion to fitness → meiosis with recombination → mutation.
 *
 * Every offspring draws its parent(s) independently with replacement, so with uniform fitness
 * each gene copy in the next generation is a uniform draw from the current 2N (or N) copies.
 */
export function stepGeneration(pop: Population, fitness: FitnessModel): GenerationReport {
  fitness.evaluate(pop, pop.fitness, pop.rng.fitness);

  let sampler = samplers.get(pop);
  if (sampler === undefined) {
    sampler = new AliasSampler(pop.size);
    samplers.set(pop, sampler);
  }
  const total = sampler.build(pop.fitness);
  if (total <= 0) {
    return { generation: pop.generation, meanFitness: 0, mutations: 0, extinct: true };
  }

  const rng = pop.rng.reproduction;
  const src = pop.genomes;
  const dst = pop.nextGenomes;
  const L = pop.loci;
  const sexual = pop.reproduction === 'sexual';
  let mutations = 0;

  for (let child = 0; child < pop.size; child++) {
    const mother = sampler.sample(rng);
    const childOffset = pop.copyOffset(child, 0);

    if (!sexual) {
      dst.set(src.subarray(pop.copyOffset(mother, 0), pop.copyOffset(mother + 1, 0)), childOffset);
    } else {
      const father = pickMate(pop, sampler, total, mother, rng);
      if (pop.ploidy === 1) {
        recombineCopy(
          src,
          pop.copyOffset(mother, 0),
          pop.copyOffset(father, 0),
          dst,
          childOffset,
          L,
          pop.crossover,
          rng,
        );
      } else {
        recombineCopy(
          src,
          pop.copyOffset(mother, 0),
          pop.copyOffset(mother, 1),
          dst,
          childOffset,
          L,
          pop.crossover,
          rng,
        );
        recombineCopy(
          src,
          pop.copyOffset(father, 0),
          pop.copyOffset(father, 1),
          dst,
          childOffset + L,
          L,
          pop.crossover,
          rng,
        );
      }
    }

    for (let c = 0; c < pop.ploidy; c++) mutations += mutate(pop, dst, childOffset + c * L);
  }

  pop.commitNextGeneration();
  return { generation: pop.generation, meanFitness: total / pop.size, mutations, extinct: false };
}

export type StopCondition = (pop: Population, report: GenerationReport) => boolean;

/** Runs until `stop` returns true, the population goes extinct, or `maxGenerations` pass. */
export function runGenerations(
  pop: Population,
  fitness: FitnessModel,
  maxGenerations: number,
  stop?: StopCondition,
): GenerationReport {
  let report: GenerationReport = {
    generation: pop.generation,
    meanFitness: NaN,
    mutations: 0,
    extinct: false,
  };
  for (let g = 0; g < maxGenerations; g++) {
    report = stepGeneration(pop, fitness);
    if (report.extinct || stop?.(pop, report)) break;
  }
  return report;
}

function pickMate(
  pop: Population,
  sampler: AliasSampler,
  total: number,
  mother: number,
  rng: Rng,
): number {
  const selfing = pop.selfingRate;
  if (selfing === undefined) return sampler.sample(rng);
  if (rng.float() < selfing) return mother;
  // Outcrossing: draw from the fitness distribution without the mother. Redrawing is fast when
  // she holds a modest share of the total; if that keeps failing (she dominates), draw exactly
  // from the others. Both steps sample the same conditional distribution.
  for (let attempt = 0; attempt < 64; attempt++) {
    const father = sampler.sample(rng);
    if (father !== mother) return father;
  }
  const weights = pop.fitness;
  const others = total - weights[mother];
  // Self only when no other individual can reproduce.
  if (!(others > 0)) return mother;
  let r = rng.float() * others;
  let last = mother;
  for (let i = 0; i < weights.length; i++) {
    if (i === mother || weights[i] <= 0) continue;
    last = i;
    r -= weights[i];
    if (r < 0) return i;
  }
  return last;
}

/** Applies mutations to one transmitted genome copy. */
function mutate(pop: Population, genomes: Uint32Array, offset: number): number {
  return mutateCopy(
    pop.alleles,
    pop.mutation,
    pop.mutationSchedule,
    genomes,
    offset,
    pop.loci,
    pop.rng.mutation,
    pop.generation + 1,
  );
}
