/**
 * The Lineage mode game loop: epochs, the Mutation Draft, goals and reports.
 * Design: docs/PLAN.md §3 and §6; ADR 0004 (Mutation Draft).
 *
 * Each epoch:
 *   1. A few random mutations are offered (the Mutation Draft). The player picks one, or none.
 *   2. The chosen mutation arises several independent times during the epoch, in random
 *      individuals, as real recurrent mutations do. Each origin starts as a single copy, so most
 *      are lost by chance even when the variant is beneficial.
 *   3. The world runs for the epoch's generations in that epoch's environment.
 *   4. A report records what happened: the variant's fate, population by zone, causes of death,
 *      trait change and goals reached.
 */
import {
  locusLabel,
  logistic,
  logit,
  T,
  TRAIT_COUNT,
  TRAIT_IDS,
  type TraitId,
} from '../plant/traits.ts';
import { Rng } from '../rng/index.ts';
import { buildEnvironment, type Environment, Landscape, ZONE_COUNT } from '../world/landscape.ts';
import { World, type WorldSnapshot, type YearReport } from '../world/world.ts';
import { SCENARIOS } from './chapter1.ts';
import type { Goal, Scenario } from './scenario.ts';

export interface TraitEffect {
  trait: TraitId;
  /** Current population mean. */
  from: number;
  /** Expected value in an individual carrying the variant (haploid or homozygous). */
  to: number;
}

export interface VariantOffer {
  index: number;
  locus: number;
  /** Allele value (additive liability per copy). */
  value: number;
  /** Change relative to the locus's current mean allele value. */
  delta: number;
  gene: string;
  effects: TraitEffect[];
}

export interface GenerationPoint {
  generation: number;
  population: number;
  /** Individuals that reproduced, per zone. */
  reproduced: number[];
  variantFrequency: number;
  traitMeans: number[];
  sporophyteHeight: number;
  fertilisationRate: number;
}

export interface ZoneSummary {
  cells: number;
  /** Means over the last years of the epoch. */
  established: number;
  survived: number;
  fertilised: number;
  reproduced: number;
  sporesPerReproducer: number;
  /** Mean sporophyte height, m. */
  sporophyteHeight: number;
  /** Deaths by cause (DEATH_CAUSES order), summed over the last years of the epoch. */
  deaths: number[];
}

export type VariantFate = 'none' | 'lost' | 'rare' | 'spreading' | 'fixed';

export interface EpochReport {
  epochIndex: number;
  ma: number;
  title: string;
  chosen: VariantOffer | null;
  origins: number;
  fate: VariantFate;
  variantFrequency: number;
  series: GenerationPoint[];
  zones: ZoneSummary[];
  traitStart: number[];
  traitEnd: number[];
  goalsAchieved: string[];
  extinct: boolean;
}

export type Phase = 'draft' | 'complete' | 'extinct';

export interface GoalStatus {
  goal: Goal;
  /** 0–1 progress towards the goal's threshold. */
  progress: number;
  /** Epoch index in which it was achieved, or null. */
  achievedIn: number | null;
}

export interface GameSnapshot {
  version: 1;
  scenarioId: string;
  seed: string;
  pure: boolean;
  epochIndex: number;
  phase: Phase;
  offers: VariantOffer[];
  reports: EpochReport[];
  achieved: Record<string, number>;
  world: WorldSnapshot;
}

export interface NewGameOptions {
  /**
   * Pure mode: the player does not choose. Each epoch nature picks one of the offered
   * mutations (or none) at random, as unguided evolution would.
   */
  pure?: boolean;
}

/** Years at the end of an epoch averaged for zone summaries and goals. */
const SUMMARY_YEARS = 10;

export class Game {
  readonly scenario: Scenario;
  readonly seed: string;
  readonly pure: boolean;
  readonly landscape: Landscape;
  world: World;
  epochIndex = 0;
  phase: Phase = 'draft';
  offers: VariantOffer[] = [];
  readonly reports: EpochReport[] = [];
  readonly achieved: Record<string, number> = {};
  private readonly environments: Environment[];

  private constructor(scenario: Scenario, seed: string, pure: boolean, world?: World) {
    this.scenario = scenario;
    this.seed = seed;
    this.pure = pure;
    this.landscape = new Landscape({ ...scenario.landscape, seed: `${seed}/landscape` });
    this.environments = scenario.epochs.map((e) => buildEnvironment(this.landscape, e.environment));
    this.world =
      world ??
      new World({
        landscape: this.landscape,
        ancestral: scenario.ancestral,
        mutationRate: scenario.mutationRate,
        mutationSd: scenario.mutationSd,
        seed: `${seed}/world`,
      });
  }

  static create(scenarioId: string, seed: string, options: NewGameOptions = {}): Game {
    const scenario = SCENARIOS[scenarioId];
    if (scenario === undefined) throw new Error(`Unknown scenario "${scenarioId}"`);
    if (scenario.epochs.length === 0) throw new Error('A scenario needs at least one epoch');
    const game = new Game(scenario, seed, options.pure ?? false);
    const env = game.environments[0];
    game.world.seed((c) => scenario.startZones.includes(env.zone[c]));
    for (let y = 0; y < scenario.burnIn; y++) game.world.stepYear(env);
    game.offers = game.makeOffers();
    return game;
  }

  get epoch() {
    return this.scenario.epochs[Math.min(this.epochIndex, this.scenario.epochs.length - 1)];
  }

  get environment(): Environment {
    return this.environments[Math.min(this.epochIndex, this.environments.length - 1)];
  }

  /** Current population mean of each inherited trait. */
  traitMeans(): number[] {
    const sums = new Float64Array(TRAIT_COUNT);
    const traits = new Float64Array(TRAIT_COUNT);
    let n = 0;
    for (let c = 0; c < this.world.cells; c++) {
      if (this.world.occupied[c] === 0) continue;
      this.world.inheritedTraits(c, traits);
      for (let t = 0; t < TRAIT_COUNT; t++) sums[t] += traits[t];
      n++;
    }
    return Array.from(sums, (s) => (n > 0 ? s / n : NaN));
  }

  /** Random variants for this epoch's draft (deterministic for a given seed and epoch). */
  private makeOffers(): VariantOffer[] {
    const { draft } = this.scenario;
    const arch = this.world.arch;
    const rng = new Rng(`${this.seed}/draft/${this.epochIndex}`);
    const means = this.traitMeans();
    // Module genes are master regulators with effects on several traits; they are offered
    // more often than any single trait gene so that pleiotropic innovations come up.
    const weights = Float64Array.from({ length: arch.loci }, (_, l) =>
      arch.locusOwner[l] < 0 ? draft.moduleWeight : 1,
    );
    const offers: VariantOffer[] = [];
    const usedOwners = new Set<number>();
    let guard = 0;
    while (offers.length < draft.offers && guard++ < 200) {
      const locus = weightedPick(weights, rng);
      const owner = arch.locusOwner[locus];
      if (usedOwners.has(owner)) continue;
      usedOwners.add(owner);
      const magnitude = Math.abs(rng.normal(draft.effectMean, draft.effectSd));
      // Effects show in the direction a trait has room to move: a gene for a trait that is
      // almost absent can only visibly increase it, one that is near its maximum can only
      // visibly decrease it.
      const level = owner >= 0 ? clampTrait(means[owner]) : 0.5;
      const delta = rng.float() < 1 - level ? magnitude : -magnitude;
      const value = this.meanAlleleValue(locus) + delta;
      offers.push({
        index: offers.length,
        locus,
        value,
        delta,
        gene: locusLabel(arch, locus),
        effects: this.effectsOf(locus, delta, means),
      });
    }
    return offers;
  }

  private meanAlleleValue(locus: number): number {
    let sum = 0;
    let n = 0;
    const genomes = this.world.genomeView;
    const loci = this.world.loci;
    for (let c = 0; c < this.world.cells; c++) {
      if (this.world.occupied[c] === 0) continue;
      sum += this.world.alleles.value(genomes[c * 2 * loci + locus]);
      n++;
    }
    return n > 0 ? sum / n : 0;
  }

  private effectsOf(locus: number, delta: number, means: number[]): TraitEffect[] {
    const arch = this.world.arch;
    const effects: TraitEffect[] = [];
    for (let t = 0; t < TRAIT_COUNT; t++) {
      for (let k = arch.contribStart[t]; k < arch.contribStart[t + 1]; k++) {
        if (arch.contribLocus[k] !== locus) continue;
        const from = clampTrait(means[t]);
        // Haploid expression doubles a single copy's effect (as does diploid homozygosity).
        const to = logistic(logit(from) + 2 * arch.contribWeight[k] * delta);
        effects.push({ trait: TRAIT_IDS[t], from, to });
      }
    }
    return effects;
  }

  /** In Pure mode, the offer nature picks this epoch (deterministic), or null for none. */
  natureChoice(): number | null {
    const rng = new Rng(`${this.seed}/nature/${this.epochIndex}`);
    const pick = rng.int(this.offers.length + 1);
    return pick < this.offers.length ? pick : null;
  }

  /**
   * Runs the current epoch with the chosen offer (index) or none (null). In Pure mode the
   * argument is ignored and nature's pick is used.
   */
  runEpoch(choice: number | null, onProgress?: (fraction: number) => void): EpochReport {
    if (this.phase !== 'draft') throw new Error(`Cannot run an epoch in phase "${this.phase}"`);
    if (this.pure) choice = this.natureChoice();
    const chosen = choice === null ? null : (this.offers[choice] ?? null);
    if (choice !== null && chosen === null) throw new Error(`No offer ${choice}`);
    const env = this.environment;
    const generations = this.scenario.generationsPerEpoch;
    const { origins, originWindow } = this.scenario.draft;
    const originAt = new Map<number, number>();
    if (chosen !== null) {
      for (let i = 0; i < origins; i++) {
        originAt.set(Math.floor((i * originWindow * generations) / origins), i);
      }
    }
    const pinNames: string[] = [];
    const traitStart = this.traitMeans();
    const series: GenerationPoint[] = [];
    const recent: YearReport[] = [];
    let extinct = false;

    for (let g = 0; g < generations; g++) {
      const origin = originAt.get(g);
      if (chosen !== null && origin !== undefined) {
        const id = this.world.introduceVariant(chosen.locus, chosen.value);
        if (id >= 0) {
          const name = `e${this.epochIndex}o${origin}`;
          this.world.pin(name, id);
          pinNames.push(name);
        }
      }
      const report = this.world.stepYear(env);
      // Genetic measures describe the new generation (after dispersal); reproduction, height
      // and fertilisation describe the year that produced it. If the lineage just died out,
      // keep the traits of its last living generation.
      const population = this.world.population;
      series.push({
        generation: this.world.generation,
        population,
        reproduced: report.zones.map((z) => z.reproduced),
        variantFrequency: chosen === null ? 0 : this.world.carrierFrequency(pinNames),
        traitMeans: population > 0 ? this.traitMeans() : report.traitMeans,
        sporophyteHeight: report.sporophyteHeight,
        fertilisationRate: report.fertilisationRate,
      });
      recent.push(report);
      if (recent.length > SUMMARY_YEARS) recent.shift();
      onProgress?.((g + 1) / generations);
      if (this.world.population === 0) {
        extinct = true;
        break;
      }
    }

    const zones = summariseZones(recent);
    const traitEnd = extinct ? series[series.length - 1].traitMeans : this.traitMeans();
    const frequency = series.length > 0 ? series[series.length - 1].variantFrequency : 0;
    const report: EpochReport = {
      epochIndex: this.epochIndex,
      ma: this.epoch.ma,
      title: this.epoch.title,
      chosen,
      origins: pinNames.length,
      fate: chosen === null ? 'none' : fateOf(frequency),
      variantFrequency: frequency,
      series,
      zones,
      traitStart,
      traitEnd,
      goalsAchieved: [],
      extinct,
    };
    for (const status of this.goalStatuses(report)) {
      if (status.achievedIn === null && status.progress >= 1) {
        this.achieved[status.goal.id] = this.epochIndex;
        report.goalsAchieved.push(status.goal.id);
      }
    }
    this.reports.push(report);
    this.epochIndex++;
    if (extinct) this.phase = 'extinct';
    else if (this.epochIndex >= this.scenario.epochs.length) this.phase = 'complete';
    else this.offers = this.makeOffers();
    return report;
  }

  /** Progress of every goal, judged on `report` (default: the latest epoch). */
  goalStatuses(report = this.reports[this.reports.length - 1]): GoalStatus[] {
    return this.scenario.goals.map((goal) => ({
      goal,
      progress: report === undefined ? 0 : goalProgress(goal, report),
      achievedIn: this.achieved[goal.id] ?? null,
    }));
  }

  snapshot(): GameSnapshot {
    return {
      version: 1,
      scenarioId: this.scenario.id,
      seed: this.seed,
      pure: this.pure,
      epochIndex: this.epochIndex,
      phase: this.phase,
      offers: this.offers,
      reports: this.reports,
      achieved: { ...this.achieved },
      world: this.world.snapshot(),
    };
  }

  static restore(snapshot: GameSnapshot): Game {
    const scenario = SCENARIOS[snapshot.scenarioId];
    if (scenario === undefined) throw new Error(`Unknown scenario "${snapshot.scenarioId}"`);
    const landscape = new Landscape({ ...scenario.landscape, seed: `${snapshot.seed}/landscape` });
    const world = World.restore(snapshot.world, landscape);
    const game = new Game(scenario, snapshot.seed, snapshot.pure, world);
    game.epochIndex = snapshot.epochIndex;
    game.phase = snapshot.phase;
    game.offers = snapshot.offers;
    game.reports.push(...snapshot.reports);
    Object.assign(game.achieved, snapshot.achieved);
    return game;
  }
}

function weightedPick(weights: Float64Array, rng: Rng): number {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng.float() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function clampTrait(x: number): number {
  return Math.min(1 - 1e-6, Math.max(1e-6, Number.isFinite(x) ? x : 0.5));
}

function fateOf(frequency: number): VariantFate {
  if (frequency === 0) return 'lost';
  if (frequency < 0.05) return 'rare';
  if (frequency < 0.95) return 'spreading';
  return 'fixed';
}

function summariseZones(years: YearReport[]): ZoneSummary[] {
  return Array.from({ length: ZONE_COUNT }, (_, z) => {
    const n = years.length || 1;
    const mean = (f: (y: YearReport) => number) => years.reduce((s, y) => s + f(y), 0) / n;
    const reproduced = mean((y) => y.zones[z].reproduced);
    const spores = mean((y) => y.zones[z].spores);
    return {
      cells: years[0]?.zones[z].cells ?? 0,
      established: mean((y) => y.zones[z].established),
      survived: mean((y) => y.zones[z].survived),
      fertilised: mean((y) => y.zones[z].fertilised),
      reproduced,
      sporesPerReproducer: reproduced > 0 ? spores / reproduced : 0,
      sporophyteHeight: mean((y) => y.zones[z].sporophyteHeight),
      deaths: [0, 1, 2, 3].map((k) => years.reduce((s, y) => s + y.zones[z].deaths[k], 0)),
    };
  });
}

function goalProgress(goal: Goal, report: EpochReport): number {
  const m = goal.metric;
  switch (m.kind) {
    case 'zoneReproduction': {
      const zone = report.zones[m.zone];
      return zone.cells > 0 ? zone.reproduced / zone.cells / m.fraction : 0;
    }
    case 'traitMean':
      return report.traitEnd[T[m.trait]] / m.value;
    case 'sporophyteHeight': {
      const recent = report.series.slice(-SUMMARY_YEARS);
      const h = recent.reduce((s, p) => s + p.sporophyteHeight, 0) / (recent.length || 1);
      return h / m.metres;
    }
    case 'zoneHeight':
      return report.zones[m.zone].sporophyteHeight / m.metres;
    case 'survive':
      // Judged at the end of the reported epoch, counting that epoch as survived.
      return report.extinct ? 0 : Math.min(1, (report.epochIndex + 1) / (m.epoch + 1));
  }
}
