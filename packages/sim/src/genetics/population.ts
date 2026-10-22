import { Rng, type Seed } from '../rng/index.ts';
import { AlleleTable, NO_PARENT } from './alleles.ts';
import { type MutationModel, neutralRelabel } from './mutation.ts';
import { crossoverRates, type MutationSchedule, uniformSchedule } from './transmission.ts';

export type Ploidy = 1 | 2;
export type ReproductionMode = 'sexual' | 'clonal';

export interface PopulationConfig {
  /** Number of individuals. Constant across generations (Wright–Fisher). */
  size: number;
  /** Genome copies per individual: 1 = haploid, 2 = diploid. */
  ploidy: Ploidy;
  /** Loci per genome copy. */
  loci: number;
  /** Mutation probability per locus, per transmitted genome copy, per generation. Default 0. */
  mutationRate?: number;
  /** How a mutant allele's value is drawn. Default: {@link neutralRelabel}. */
  mutation?: MutationModel;
  /**
   * Crossover probability between adjacent loci: one value for every interval, or one per
   * interval (length `loci - 1`). 0.5 means unlinked, 0 means no recombination. Default 0.5.
   */
  recombination?: number | readonly number[];
  /** Default 'sexual'. Clonal offspring copy one parent, with mutation. */
  reproduction?: ReproductionMode;
  /**
   * Probability an offspring is produced by self-fertilization. When omitted, both parents are
   * drawn independently, so selfing happens with probability ~1/N (classic Wright–Fisher).
   */
  selfingRate?: number;
  /** Value of the founder allele at every locus. Default 0. */
  founderValue?: number;
}

/** Independent random streams, so changing one process never reshuffles another. */
export interface PopulationStreams {
  /** Initial conditions (seeding allele frequencies). */
  setup: Rng;
  /** Parent sampling and recombination: the genealogy. */
  reproduction: Rng;
  /** Mutation positions and effects. */
  mutation: Rng;
  /** Stochastic parts of fitness evaluation (e.g. environmental noise on phenotypes). */
  fitness: Rng;
  /** Outside interventions such as player-introduced variants. */
  intervention: Rng;
}

/**
 * A population of individuals whose genomes are arrays of allele ids.
 *
 * Genome layout: `genomes[(individual * ploidy + copy) * loci + locus]`.
 */
export class Population {
  readonly size: number;
  readonly ploidy: Ploidy;
  readonly loci: number;
  readonly mutationRate: number;
  readonly mutationSchedule: MutationSchedule;
  readonly mutation: MutationModel;
  readonly reproduction: ReproductionMode;
  readonly selfingRate: number | undefined;
  /** `crossover[l]` = probability of a crossover between locus l-1 and l (`crossover[0]` unused). */
  readonly crossover: Float64Array;
  readonly alleles = new AlleleTable();
  readonly rng: PopulationStreams;
  /** Fitness of each individual in the most recent generation step. */
  readonly fitness: Float64Array;
  generation = 0;

  private _genomes: Uint32Array;
  private _next: Uint32Array;
  private readonly pins = new Map<string, number>();

  constructor(config: PopulationConfig, seed: Seed) {
    const {
      size,
      ploidy,
      loci,
      mutationRate = 0,
      mutation = neutralRelabel,
      recombination = 0.5,
      reproduction = 'sexual',
      selfingRate,
      founderValue = 0,
    } = config;
    assertInteger('size', size, 1);
    assertInteger('loci', loci, 1);
    if (ploidy !== 1 && ploidy !== 2) throw new RangeError(`ploidy must be 1 or 2, got ${ploidy}`);
    assertProbability('mutationRate', mutationRate);
    if (selfingRate !== undefined) assertProbability('selfingRate', selfingRate);

    this.size = size;
    this.ploidy = ploidy;
    this.loci = loci;
    this.mutationRate = mutationRate;
    this.mutationSchedule = uniformSchedule(loci, mutationRate);
    this.mutation = mutation;
    this.reproduction = reproduction;
    this.selfingRate = selfingRate;
    this.crossover = crossoverRates(recombination, loci);

    const root = new Rng(seed);
    this.rng = {
      setup: root.fork('setup'),
      reproduction: root.fork('reproduction'),
      mutation: root.fork('mutation'),
      fitness: root.fork('fitness'),
      intervention: root.fork('intervention'),
    };

    this.fitness = new Float64Array(size).fill(1);
    this._genomes = new Uint32Array(size * ploidy * loci);
    this._next = new Uint32Array(this._genomes.length);
    for (let locus = 0; locus < loci; locus++) {
      const id = this.alleles.add(founderValue, locus, NO_PARENT, 0);
      for (let copy = 0; copy < size * ploidy; copy++) this._genomes[copy * loci + locus] = id;
    }
  }

  /** Current genomes (see class docs for layout). Replaced, not mutated, each generation. */
  get genomes(): Uint32Array {
    return this._genomes;
  }

  /** Total genome copies in the population (`size * ploidy`). */
  get copies(): number {
    return this.size * this.ploidy;
  }

  /** Offset of the first locus of a genome copy. */
  copyOffset(individual: number, copy: number): number {
    return (individual * this.ploidy + copy) * this.loci;
  }

  alleleAt(individual: number, copy: number, locus: number): number {
    return this._genomes[this.copyOffset(individual, copy) + locus];
  }

  valueAt(individual: number, copy: number, locus: number): number {
    return this.alleles.value(this.alleleAt(individual, copy, locus));
  }

  setAllele(individual: number, copy: number, locus: number, allele: number): void {
    if (this.alleles.locus(allele) !== locus) {
      throw new RangeError(`Allele ${allele} belongs to locus ${this.alleles.locus(allele)}`);
    }
    this._genomes[this.copyOffset(individual, copy) + locus] = allele;
  }

  /**
   * Keeps an allele id (and its ancestry) alive across compaction even if it leaves the
   * population, and keeps the id up to date when compaction renumbers alleles.
   */
  pin(name: string, allele: number): void {
    this.pins.set(name, allele);
  }

  pinned(name: string): number | undefined {
    return this.pins.get(name);
  }

  unpin(name: string): void {
    this.pins.delete(name);
  }

  /** @internal Buffer the reproduction step writes the next generation into. */
  get nextGenomes(): Uint32Array {
    return this._next;
  }

  /** @internal Makes the buffer written by reproduction the current generation. */
  commitNextGeneration(): void {
    const current = this._genomes;
    this._genomes = this._next;
    this._next = current;
    this.generation++;
    if (this.alleles.count > 2 * this._genomes.length + 4096) this.compactAlleles();
  }

  /** Drops alleles no genome or pin refers to (ancestors of live alleles are kept). */
  compactAlleles(): void {
    const live = new Uint8Array(this.alleles.count);
    const genomes = this._genomes;
    for (let i = 0; i < genomes.length; i++) live[genomes[i]] = 1;
    for (const id of this.pins.values()) live[id] = 1;
    const remap = this.alleles.compact(live);
    for (let i = 0; i < genomes.length; i++) genomes[i] = remap[genomes[i]];
    for (const [name, id] of this.pins) this.pins.set(name, remap[id]);
  }
}

export interface IntroduceAlleleOptions {
  locus: number;
  value: number;
  /** Number of distinct genome copies that receive the allele. Default 1. */
  copies?: number;
}

/**
 * Introduces a new allele into randomly chosen genome copies at one locus, e.g. a variant the
 * player picked in the Mutation Draft. With a single copy, the replaced allele is recorded as
 * its parent, as for a spontaneous mutation. Uses the `intervention` stream.
 */
export function introduceAllele(pop: Population, options: IntroduceAlleleOptions): number {
  return placeAllele(pop, options, pop.rng.intervention, pop.generation);
}

/**
 * Sets the starting frequency of a new founder allele at one locus: exactly
 * `round(frequency * copies)` random genome copies carry it. Uses the `setup` stream.
 */
export function seedAlleleFrequency(
  pop: Population,
  options: { locus: number; value: number; frequency: number },
): number {
  assertProbability('frequency', options.frequency);
  const copies = Math.round(options.frequency * pop.copies);
  return placeAllele(pop, { ...options, copies }, pop.rng.setup, 0);
}

function placeAllele(
  pop: Population,
  { locus, value, copies = 1 }: IntroduceAlleleOptions,
  rng: Rng,
  origin: number,
): number {
  assertInteger('locus', locus, 0, pop.loci - 1);
  assertInteger('copies', copies, 0, pop.copies);
  const targets = sampleDistinct(rng, pop.copies, copies);
  const genomes = pop.genomes;
  const parent = copies === 1 ? genomes[targets[0] * pop.loci + locus] : NO_PARENT;
  const id = pop.alleles.add(value, locus, parent, origin);
  for (const copy of targets) genomes[copy * pop.loci + locus] = id;
  return id;
}

/** `k` distinct integers from [0, n) via a partial Fisher–Yates shuffle. */
function sampleDistinct(rng: Rng, n: number, k: number): Int32Array {
  const pool = new Int32Array(n);
  for (let i = 0; i < n; i++) pool[i] = i;
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(n - i);
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.subarray(0, k);
}

function assertProbability(name: string, p: number): void {
  if (!(p >= 0 && p <= 1)) throw new RangeError(`${name} must be in [0, 1], got ${p}`);
}

function assertInteger(name: string, x: number, min: number, max = Infinity): void {
  if (!(Number.isInteger(x) && x >= min && x <= max)) {
    throw new RangeError(`${name} must be an integer in [${min}, ${max}], got ${x}`);
  }
}
