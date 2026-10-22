/**
 * The spatial, individual-based simulation of a plant lineage on the pond-margin landscape.
 * Specification: docs/science/04-life-cycle.md and docs/science/05-spatial-ecology.md.
 *
 * Every cell holds at most one genetic individual. Each year (one generation):
 *   1. A spore or asexual propagule that won last year's lottery germinates into a haploid
 *      gametophyte. Its traits come from its single genome copy.
 *   2. Month by month the gametophyte photosynthesises, loses or keeps water, may die of
 *      desiccation or starvation, and diverts carbon to asexual propagules.
 *   3. Once mature, in months 1–4 of the wet season, it can be fertilised, but only through a
 *      film of water. The father is a mature gametophyte nearby (or itself). The zygote's
 *      diploid genome is the two copies.
 *   4. The diploid sporophyte grows, nourished by the gametophyte in proportion to the
 *      sporophyte-development trait, and photosynthesises for itself as that trait allows.
 *   5. In months 5 (end of the wet season) and 11 (end of the dry season) sporophytes release
 *      meiotic spores and gametophytes release asexual propagules.
 *   6. Bodies alive at the end of the year may perennate and keep their cell: a sporophyte in
 *      proportion to its independence (sporophyte trait), a gametophyte with a fixed chance,
 *      both subject to random disturbance.
 *   7. Spores disperse locally and, from taller sporophytes, across the whole landscape.
 *      Propagules only move short distances through wet ground. Each free cell is won by one
 *      arrival, drawn in proportion to the viable propagules reaching it.
 *
 * Fitness is never computed directly: it is whatever survives, gets fertilised and disperses.
 */
import { AlleleTable, type AlleleTableState, NO_PARENT } from '../genetics/alleles.ts';
import { gaussianIncrement, type MutationModel } from '../genetics/mutation.ts';
import { AliasSampler } from '../genetics/sampling.ts';
import {
  crossoverRates,
  type MutationSchedule,
  mutateCopy,
  recombineCopy,
  uniformSchedule,
} from '../genetics/transmission.ts';
import {
  areaIndex,
  type Atmosphere,
  biomassChange,
  CANOPY_K,
  gametophyteBody,
  maxBiomass,
  monthBalance,
  type SiteMonth,
  sporophyteBody,
  sporophyteHeight,
} from '../plant/physiology.ts';
import {
  basesFromTraits,
  createArchitecture,
  type GenomeArchitecture,
  liabilities,
  phenotype,
  T,
  TRAIT_COUNT,
  type TraitId,
} from '../plant/traits.ts';
import { Rng, type RngState, type Seed } from '../rng/index.ts';
import { type Environment, type Landscape, MONTHS, siteAt, ZONE_COUNT } from './landscape.ts';

/** Life-cycle constants. Specification: docs/science/04-life-cycle.md. */
export const LIFE = {
  /** Gametophyte biomass right after germination, g. */
  startFromSpore: 1e-5,
  startFromPropagule: 1e-4,
  /** Gametophyte biomass needed to produce gametes, g. */
  matureBiomass: 5e-4,
  zygoteBiomass: 2e-6,
  /** Wet-season months in which mature gametophytes can be fertilised. */
  fertilisationMonths: [1, 2, 3, 4] as readonly number[],
  releaseMonths: [5, 11] as readonly number[],
  /** Spores from the zygote's own meiosis (charophyte-style zygotic meiosis). */
  zygoticMeiospores: 4,
  /** Mass of one spore without and with a full sporopollenin wall, g. */
  sporeMass: 2e-8,
  sporeWallCost: 2,
  /** Mass of one asexual propagule (gemma or fragment), g. */
  propaguleMass: 2e-6,
  /** Probability that one viable arriving propagule founds an individual in an empty cell. */
  establishment: 1e-3,
  sporeRadius: 3,
  sporeScale: 1.5,
  propaguleRadius: 2,
  propaguleScale: 0.8,
  /** Release height (m) at which half of the spores escape the parent's own patch. */
  escapeHeight: 0.005,
  /** Release height (m) at which half of the escaping spores join the landscape-wide spore rain. */
  windHeight: 0.05,
  /** Weight of the gametophyte itself among potential fathers (bisexual gametophytes can self). */
  selfingWeight: 0.5,
  /** Yearly chance that disturbance (floods, erosion, burial) clears a surviving occupant. */
  disturbance: 0.08,
  /** Fraction of biomass a perennating body carries into the next year. */
  carryOver: 0.8,
  /** Chance that a gametophyte alive at the end of the year perennates (before disturbance). */
  gametophytePerennation: 0.6,
  /** Share of a neighbour's canopy that overhangs a cell when fully overtopping it. */
  canopyOverlap: 0.3,
  /** Height advantage (m) at which a neighbour fully overtops a cell. */
  overtopHeight: 0.02,
} as const;

export const DEATH_CAUSES = [
  'gametophyte desiccation',
  'gametophyte starvation',
  'sporophyte desiccation',
  'sporophyte starvation',
] as const;

export interface WorldOptions {
  landscape: Landscape;
  ancestral: Record<TraitId, number>;
  /** Mutation probability per locus per transmitted genome copy per generation. */
  mutationRate: number;
  /** Standard deviation of mutational effects on a trait liability, per copy. */
  mutationSd: number;
  seed: Seed;
  arch?: GenomeArchitecture;
}

export interface ZoneStats {
  cells: number;
  /** Individuals present this year (new arrivals plus perennials). */
  established: number;
  /** Individuals carried over from last year. */
  perennial: number;
  /** Mean of the tallest height reached by each sporophyte in the zone, m (0 if none). */
  sporophyteHeight: number;
  /** Gametophytes alive at the end of the year. */
  survived: number;
  fertilised: number;
  /** Individuals whose sporophyte released spores at least once. */
  reproduced: number;
  spores: number;
  propagules: number;
  deaths: number[];
}

export interface YearReport {
  generation: number;
  population: number;
  extinct: boolean;
  zones: ZoneStats[];
  /** Mean inherited trait values (haploid expression of the maternal genome copy). */
  traitMeans: number[];
  /** Mean of the tallest height each sporophyte reached, m (0 if none). */
  sporophyteHeight: number;
  fertilisationRate: number;
}

export interface WorldSnapshot {
  version: 1;
  options: Omit<WorldOptions, 'landscape' | 'arch'>;
  landscape: Landscape['options'];
  lociPerTrait: number;
  generation: number;
  genomes: Uint32Array;
  occupied: Uint8Array;
  origin: Uint8Array;
  perennateG: Uint8Array;
  perennateS: Uint8Array;
  carryG: Float64Array;
  carryS: Float64Array;
  lastEstablished: Uint8Array;
  lastReproduced: Uint8Array;
  lastHeight: Float64Array;
  alleles: AlleleTableState;
  pins: [string, number][];
  rng: Record<string, RngState>;
}

const SPORE = 0;
const PROPAGULE = 1;

interface KernelOffset {
  dx: number;
  dy: number;
  weight: number;
}

function kernel(radius: number, scale: number): KernelOffset[] {
  const offsets: KernelOffset[] = [];
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > radius + 0.5) continue;
      const weight = Math.exp(-d / scale);
      offsets.push({ dx, dy, weight });
      total += weight;
    }
  }
  for (const o of offsets) o.weight /= total;
  return offsets;
}

const SPORE_KERNEL = kernel(LIFE.sporeRadius, LIFE.sporeScale);
const PROPAGULE_KERNEL = kernel(LIFE.propaguleRadius, LIFE.propaguleScale);

export class World {
  readonly landscape: Landscape;
  readonly arch: GenomeArchitecture;
  readonly options: WorldOptions;
  readonly bases: Float64Array;
  alleles: AlleleTable;
  generation = 0;

  readonly cells: number;
  readonly loci: number;
  private genomes: Uint32Array;
  private next: Uint32Array;
  /** 1 if the cell holds an individual this year. */
  readonly occupied: Uint8Array;
  /** How the occupant arrived: 0 spore, 1 asexual propagule. */
  readonly origin: Uint8Array;
  /** Last completed year, per cell: 1 if an individual established. */
  readonly lastEstablished: Uint8Array;
  /** Last completed year, per cell: 1 if its occupant released spores or propagules. */
  readonly lastReproduced: Uint8Array;

  // Per-year state.
  readonly gTraits: Float64Array;
  readonly sTraits: Float64Array;
  readonly gBiomass: Float64Array;
  readonly sBiomass: Float64Array;
  readonly gAlive: Uint8Array;
  readonly sAlive: Uint8Array;
  readonly fertilised: Uint8Array;
  /** Month of fertilisation (−1 if not fertilised). */
  private readonly fertilisedMonth: Int8Array;
  readonly sHeight: Float64Array;
  readonly sMaxHeight: Float64Array;
  readonly cause: Uint8Array;
  private readonly gHydration: Float64Array;
  private readonly gPai: Float64Array;
  private readonly sPai: Float64Array;
  private readonly propaguleStore: Float64Array;
  private readonly spores: Float64Array; // [cell * 2 + releaseIndex]
  private readonly propagules: Float64Array;
  private readonly releaseHeight: Float64Array;
  private readonly shade: Float64Array;
  /** Set at the end of a year: which bodies perennate, and the biomass they carry. */
  private readonly perennateG: Uint8Array;
  private readonly perennateS: Uint8Array;
  private readonly carryG: Float64Array;
  private readonly carryS: Float64Array;
  /** Sporophyte biomass after its last spore release (or at the start of its life). */
  private readonly sReleaseBase: Float64Array;

  private readonly crossover: Float64Array;
  private readonly schedule: MutationSchedule;
  private readonly mutation: MutationModel;
  readonly rng: {
    life: Rng;
    dispersal: Rng;
    meiosis: Rng;
    mutation: Rng;
    intervention: Rng;
  };
  private readonly pins = new Map<string, number>();
  private readonly site: SiteMonth = {
    depth: 0,
    surfaceWet: 0,
    waterTableDepth: 0,
    soilMoisture: 0,
  };
  private readonly liab = new Float64Array(TRAIT_COUNT);

  constructor(options: WorldOptions) {
    this.options = options;
    this.landscape = options.landscape;
    this.arch = options.arch ?? createArchitecture();
    this.bases = basesFromTraits(options.ancestral);
    this.cells = this.landscape.cells;
    this.loci = this.arch.loci;
    const n = this.cells;
    this.genomes = new Uint32Array(n * 2 * this.loci);
    this.next = new Uint32Array(n * 2 * this.loci);
    this.occupied = new Uint8Array(n);
    this.origin = new Uint8Array(n);
    this.lastEstablished = new Uint8Array(n);
    this.lastReproduced = new Uint8Array(n);
    this.gTraits = new Float64Array(n * TRAIT_COUNT);
    this.sTraits = new Float64Array(n * TRAIT_COUNT);
    this.gBiomass = new Float64Array(n);
    this.sBiomass = new Float64Array(n);
    this.gAlive = new Uint8Array(n);
    this.sAlive = new Uint8Array(n);
    this.fertilised = new Uint8Array(n);
    this.fertilisedMonth = new Int8Array(n);
    this.sHeight = new Float64Array(n);
    this.sMaxHeight = new Float64Array(n);
    this.cause = new Uint8Array(n);
    this.gHydration = new Float64Array(n);
    this.gPai = new Float64Array(n);
    this.sPai = new Float64Array(n);
    this.propaguleStore = new Float64Array(n);
    this.spores = new Float64Array(n * 2);
    this.propagules = new Float64Array(n * 2);
    this.releaseHeight = new Float64Array(n);
    this.shade = new Float64Array(n);
    this.perennateG = new Uint8Array(n);
    this.perennateS = new Uint8Array(n);
    this.carryG = new Float64Array(n);
    this.carryS = new Float64Array(n);
    this.sReleaseBase = new Float64Array(n);

    this.crossover = crossoverRates(0.5, this.loci);
    this.schedule = uniformSchedule(this.loci, options.mutationRate);
    this.mutation = gaussianIncrement(options.mutationSd);
    const root = new Rng(options.seed);
    this.rng = {
      life: root.fork('life'),
      dispersal: root.fork('dispersal'),
      meiosis: root.fork('meiosis'),
      mutation: root.fork('mutation'),
      intervention: root.fork('intervention'),
    };

    this.alleles = new AlleleTable();
    for (let l = 0; l < this.loci; l++) {
      const founder = this.alleles.add(0, l, NO_PARENT, 0);
      for (let copy = 0; copy < 2 * n; copy++) this.genomes[copy * this.loci + l] = founder;
    }
  }

  /** Places founders in every cell for which `where(cell)` is true. */
  seed(where: (cell: number) => boolean): void {
    for (let c = 0; c < this.cells; c++) {
      this.occupied[c] = where(c) ? 1 : 0;
      this.origin[c] = PROPAGULE;
    }
  }

  /** Current genomes, read-only by convention: `[(cell * 2 + copy) * loci + locus]`. */
  get genomeView(): Uint32Array {
    return this.genomes;
  }

  get population(): number {
    let n = 0;
    for (let c = 0; c < this.cells; c++) n += this.occupied[c];
    return n;
  }

  private offset(cell: number, copy: number): number {
    return (cell * 2 + copy) * this.loci;
  }

  /** Inherited trait values of a cell's occupant (haploid expression of its maternal copy). */
  inheritedTraits(cell: number, out = new Float64Array(TRAIT_COUNT)): Float64Array {
    liabilities(this.arch, this.genomes, this.offset(cell, 0), -1, this.alleles.values, this.liab);
    return phenotype(this.bases, this.liab, out);
  }

  /** Runs one year (one generation) in the given environment. */
  stepYear(env: Environment): YearReport {
    const n = this.cells;
    const atm: Atmosphere = { co2: env.spec.co2, o2: env.spec.o2 * 10 };
    const area = this.landscape.cellArea;
    const rng = this.rng.life;
    const zones = Array.from({ length: ZONE_COUNT }, () => emptyZoneStats());
    for (let c = 0; c < n; c++) zones[env.zone[c]].cells++;

    this.beginYear(zones, env);

    for (let m = 0; m < MONTHS; m++) {
      const climate = env.climate[m];
      this.computeShade();
      if (LIFE.fertilisationMonths.includes(m)) this.fertilise(env, m, zones);

      for (let c = 0; c < n; c++) {
        if (this.gAlive[c] === 0 && this.sAlive[c] === 0) continue;
        const site = siteAt(env, c, m, this.site);
        const light = climate.par * Math.exp(-CANOPY_K * this.shade[c]);
        let transfer = 0;

        if (this.gAlive[c] === 1) {
          const traits = this.gTraits.subarray(c * TRAIT_COUNT, (c + 1) * TRAIT_COUNT);
          const body = gametophyteBody(traits);
          // The gametophyte lies beneath its own sporophyte.
          const gLight = light * Math.exp(-CANOPY_K * this.sPai[c]);
          const balance = monthBalance(body, climate, site, atm, gLight);
          this.gHydration[c] = balance.hydration;
          let change = biomassChange(body, balance, this.gBiomass[c], area);
          if (change > 0) {
            const toPropagules = 0.5 * traits[T.asexual] * change;
            this.propaguleStore[c] += toPropagules;
            if (this.sAlive[c] === 1 && m > this.fertilisedMonth[c]) {
              // Nourishing a retained embryo needs a placenta-like interface that develops with it.
              transfer = 0.5 * this.sTraits[c * TRAIT_COUNT + T.sporophyte] ** 2 * change;
            }
            change -= toPropagules + transfer;
          }
          this.gBiomass[c] = Math.min(this.gBiomass[c] + change, maxBiomass(body, area));
          this.gPai[c] = areaIndex(body, this.gBiomass[c], area);
          if (rng.float() >= balance.survival) this.killGametophyte(c, 0, zones, env);
          else if (this.gBiomass[c] < 0.25 * LIFE.startFromSpore)
            this.killGametophyte(c, 1, zones, env);
        }

        if (this.sAlive[c] === 1 && m > this.fertilisedMonth[c]) {
          const traits = this.sTraits.subarray(c * TRAIT_COUNT, (c + 1) * TRAIT_COUNT);
          const k = traits[T.sporophyte];
          const body = sporophyteBody(traits, this.sBiomass[c]);
          const fromGametophyte = this.gAlive[c] === 1 ? (1 - k) * this.gHydration[c] * 0.003 : 0;
          const balance = monthBalance(body, climate, site, atm, light, fromGametophyte);
          // An undeveloped sporophyte (a walled zygote) is metabolically almost inert.
          const own = k * biomassChange(body, balance, this.sBiomass[c], area);
          this.sBiomass[c] = Math.min(this.sBiomass[c] + own + transfer, maxBiomass(body, area));
          this.sHeight[c] = sporophyteHeight(traits, this.sBiomass[c]);
          this.sMaxHeight[c] = Math.max(this.sMaxHeight[c], this.sHeight[c]);
          this.sPai[c] = k * areaIndex(body, this.sBiomass[c], area);
          const survival = 1 - k * (1 - balance.survival);
          if (rng.float() >= survival) this.killSporophyte(c, 2, zones, env);
          else if (this.sBiomass[c] < 0.5 * LIFE.zygoteBiomass)
            this.killSporophyte(c, 3, zones, env);
        }
      }

      const release = LIFE.releaseMonths.indexOf(m);
      if (release >= 0) this.release(release, zones, env);
    }

    const report = this.summarise(zones, env);
    this.decidePerennation();
    for (let c = 0; c < n; c++) {
      this.lastEstablished[c] = this.occupied[c];
      const released =
        this.spores[2 * c] +
        this.spores[2 * c + 1] +
        this.propagules[2 * c] +
        this.propagules[2 * c + 1];
      this.lastReproduced[c] = released > 0 ? 1 : 0;
    }
    this.disperse(env);
    this.generation++;
    if (this.alleles.count > 4 * this.cells * this.loci + 4096) this.compactAlleles();
    return report;
  }

  private beginYear(zones: ZoneStats[], env: Environment): void {
    const out = this.liab;
    for (let c = 0; c < this.cells; c++) {
      const occupied = this.occupied[c] === 1;
      const perennial = occupied && (this.perennateG[c] === 1 || this.perennateS[c] === 1);
      this.cause[c] = 0;
      this.fertilisedMonth[c] = -1;
      if (perennial) {
        this.gAlive[c] = this.perennateG[c];
        this.gBiomass[c] = this.perennateG[c] === 1 ? this.carryG[c] : 0;
        this.sAlive[c] = this.perennateS[c];
        this.fertilised[c] = this.perennateS[c];
        this.sBiomass[c] = this.perennateS[c] === 1 ? this.carryS[c] : 0;
        this.sReleaseBase[c] = this.sBiomass[c];
      } else {
        this.gAlive[c] = occupied ? 1 : 0;
        this.gBiomass[c] = occupied
          ? this.origin[c] === SPORE
            ? LIFE.startFromSpore
            : LIFE.startFromPropagule
          : 0;
        this.sAlive[c] = 0;
        this.fertilised[c] = 0;
        this.sBiomass[c] = 0;
      }
      this.sHeight[c] = 0;
      this.sMaxHeight[c] = 0;
      this.gHydration[c] = 1;
      this.gPai[c] = 0;
      this.sPai[c] = 0;
      this.propaguleStore[c] = 0;
      this.spores[2 * c] = this.spores[2 * c + 1] = 0;
      this.propagules[2 * c] = this.propagules[2 * c + 1] = 0;
      this.releaseHeight[c] = 0;
      if (!occupied) continue;
      zones[env.zone[c]].established++;
      liabilities(this.arch, this.genomes, this.offset(c, 0), -1, this.alleles.values, out);
      phenotype(this.bases, out, this.gTraits.subarray(c * TRAIT_COUNT, (c + 1) * TRAIT_COUNT));
      if (perennial) {
        zones[env.zone[c]].perennial++;
        if (this.perennateS[c] === 1) {
          const traits = this.sTraits.subarray(c * TRAIT_COUNT, (c + 1) * TRAIT_COUNT);
          liabilities(
            this.arch,
            this.genomes,
            this.offset(c, 0),
            this.offset(c, 1),
            this.alleles.values,
            out,
          );
          phenotype(this.bases, out, traits);
          this.sHeight[c] = sporophyteHeight(traits, this.sBiomass[c]);
          this.sPai[c] =
            traits[T.sporophyte] *
            areaIndex(
              sporophyteBody(traits, this.sBiomass[c]),
              this.sBiomass[c],
              this.landscape.cellArea,
            );
        }
      }
    }
  }

  /**
   * Which bodies survive into next year. A sporophyte can perennate in proportion to its
   * independence from the gametophyte. A gametophyte that came through the year alive
   * (which, out of the water, takes desiccation tolerance or homoiohydry) perennates with a
   * fixed chance.
   */
  private decidePerennation(): void {
    const rng = this.rng.life;
    const keep = 1 - LIFE.disturbance;
    for (let c = 0; c < this.cells; c++) {
      this.perennateG[c] = 0;
      this.perennateS[c] = 0;
      if (this.occupied[c] === 0) continue;
      if (this.sAlive[c] === 1) {
        const k = this.sTraits[c * TRAIT_COUNT + T.sporophyte];
        if (rng.float() < k * keep) {
          this.perennateS[c] = 1;
          this.carryS[c] = LIFE.carryOver * this.sBiomass[c];
        }
      }
      if (this.gAlive[c] === 1) {
        if (rng.float() < LIFE.gametophytePerennation * keep) {
          this.perennateG[c] = 1;
          this.carryG[c] = LIFE.carryOver * this.gBiomass[c];
        }
      }
    }
  }

  /** Shading of each cell by taller neighbouring sporophytes (previous month's sizes). */
  private computeShade(): void {
    const { width, height } = this.landscape;
    for (let c = 0; c < this.cells; c++) {
      this.shade[c] = 0;
      if (this.gAlive[c] === 0 && this.sAlive[c] === 0) continue;
      const own = this.sAlive[c] === 1 ? this.sHeight[c] : 0.002;
      const x = c % width;
      const y = (c / width) | 0;
      let shade = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (this.sAlive[j] === 0) continue;
          const hj = this.sHeight[j];
          if (hj <= own) continue;
          // A taller neighbour's canopy leans over this cell, more so the more it overtops it.
          shade += LIFE.canopyOverlap * this.sPai[j] * Math.min(1, (hj - own) / LIFE.overtopHeight);
        }
      }
      this.shade[c] = shade;
    }
  }

  private fertilise(env: Environment, month: number, zones: ZoneStats[]): void {
    const { width, height } = this.landscape;
    const rng = this.rng.life;
    const climate = env.climate[month];
    const candidates: number[] = [];
    const weights: number[] = [];
    const out = this.liab;
    for (let c = 0; c < this.cells; c++) {
      if (this.gAlive[c] === 0 || this.fertilised[c] === 1) continue;
      if (this.gBiomass[c] < LIFE.matureBiomass) continue;
      const k = c * MONTHS + month;
      const submerged = env.depth[k] > 0;
      const film = submerged ? 1 : Math.max(climate.rainWet, env.surfaceWet[k]);
      const radius = submerged ? 2 : 1;
      const x = c % width;
      const y = (c / width) | 0;
      candidates.length = 0;
      weights.length = 0;
      let total = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (this.gAlive[j] === 0 || this.gBiomass[j] < LIFE.matureBiomass) continue;
          const kj = j * MONTHS + month;
          // Sperm swim: the neighbour must be joined to this one by surface water.
          if (j !== c && env.depth[kj] <= 0 && env.surfaceWet[kj] < 0.3) continue;
          const w = j === c ? LIFE.selfingWeight : 1;
          candidates.push(j);
          weights.push(w);
          total += w;
        }
      }
      if (rng.float() >= film * (1 - Math.exp(-total))) continue;
      let pick = rng.float() * total;
      let father = candidates[candidates.length - 1];
      for (let i = 0; i < candidates.length; i++) {
        pick -= weights[i];
        if (pick < 0) {
          father = candidates[i];
          break;
        }
      }
      // The zygote: maternal copy is the gametophyte's genome, paternal copy the father's.
      const dst = this.offset(c, 1);
      const src = this.offset(father, 0);
      this.genomes.copyWithin(dst, src, src + this.loci);
      this.fertilised[c] = 1;
      this.fertilisedMonth[c] = month;
      this.sAlive[c] = 1;
      this.sBiomass[c] = LIFE.zygoteBiomass;
      this.sReleaseBase[c] = LIFE.zygoteBiomass;
      zones[env.zone[c]].fertilised++;
      liabilities(this.arch, this.genomes, this.offset(c, 0), dst, this.alleles.values, out);
      phenotype(this.bases, out, this.sTraits.subarray(c * TRAIT_COUNT, (c + 1) * TRAIT_COUNT));
    }
  }

  private release(index: number, zones: ZoneStats[], env: Environment): void {
    for (let c = 0; c < this.cells; c++) {
      const z = zones[env.zone[c]];
      if (this.sAlive[c] === 1) {
        const traits = this.sTraits.subarray(c * TRAIT_COUNT, (c + 1) * TRAIT_COUNT);
        // A share of the growth made since the last release goes into sporangia; a perennial
        // keeps the rest, so it can build up size over the years.
        const allocation = 0.25 + 0.25 * traits[T.branching];
        const spare = Math.max(0, this.sBiomass[c] - this.sReleaseBase[c]);
        const cost = LIFE.sporeMass * (1 + LIFE.sporeWallCost * traits[T.sporeWall]);
        const count = (index === 0 ? LIFE.zygoticMeiospores : 0) + (allocation * spare) / cost;
        this.sBiomass[c] -= allocation * spare;
        this.sReleaseBase[c] = this.sBiomass[c];
        this.spores[2 * c + index] = count;
        this.releaseHeight[c] = Math.max(this.releaseHeight[c], this.sHeight[c]);
        z.spores += count;
        if (index === 0 || this.spores[2 * c] === 0) z.reproduced++;
      }
      if (this.propaguleStore[c] > 0) {
        const count = this.propaguleStore[c] / LIFE.propaguleMass;
        this.propagules[2 * c + index] = count;
        this.propaguleStore[c] = 0;
        z.propagules += count;
      }
    }
  }

  private killGametophyte(c: number, cause: number, zones: ZoneStats[], env: Environment): void {
    this.gAlive[c] = 0;
    this.gPai[c] = 0;
    this.propaguleStore[c] = 0;
    if (this.cause[c] === 0) this.cause[c] = cause + 1;
    zones[env.zone[c]].deaths[cause]++;
  }

  private killSporophyte(c: number, cause: number, zones: ZoneStats[], env: Environment): void {
    this.sAlive[c] = 0;
    this.sPai[c] = 0;
    if (this.cause[c] === 0) this.cause[c] = cause + 1;
    zones[env.zone[c]].deaths[cause]++;
  }

  /** Spore and propagule dispersal, the establishment lottery and next year's genomes. */
  private disperse(env: Environment): void {
    const n = this.cells;
    const { width, height } = this.landscape;
    const rng = this.rng.dispersal;
    const total = new Float64Array(n);
    const pickParent = new Int32Array(n).fill(-1);
    const pickKind = new Uint8Array(n);
    const germination = new Float64Array(n);
    const propaguleViability = new Float64Array(n);
    for (let c = 0; c < n; c++) {
      const k = c * MONTHS;
      const submerged = env.depth[k] > 0;
      germination[c] = submerged ? 0.8 : env.surfaceWet[k];
      propaguleViability[c] = submerged ? 1 : 0.5 * env.surfaceWet[k] ** 2;
    }

    const offer = (cell: number, parent: number, kind: number, weight: number) => {
      if (!(weight > 0)) return;
      total[cell] += weight;
      if (rng.float() * total[cell] < weight) {
        pickParent[cell] = parent;
        pickKind[cell] = kind;
      }
    };

    const globalWeights = new Float64Array(n);
    let globalTotal = 0;
    for (let p = 0; p < n; p++) {
      const s0 = this.spores[2 * p];
      const s1 = this.spores[2 * p + 1];
      const a0 = this.propagules[2 * p];
      const a1 = this.propagules[2 * p + 1];
      if (s0 + s1 + a0 + a1 === 0) continue;
      const x = p % width;
      const y = (p / width) | 0;
      if (s0 + s1 > 0) {
        const wall = this.sTraits[p * TRAIT_COUNT + T.sporeWall];
        const dormancy = sporeDormancySurvival(wall);
        const h = this.releaseHeight[p];
        // Spores shed at mat level are mostly trapped in the parent's own patch; raising the
        // sporangia lets them escape into moving air. Under water, currents carry them off.
        const submerged = env.depth[p * MONTHS + LIFE.releaseMonths[0]] > 0;
        const escape = submerged ? 1 : h / (h + LIFE.escapeHeight);
        const windborne = escape * (h / (h + LIFE.windHeight));
        const local = escape - windborne;
        const nearby = 0.3 + 0.7 * wall;
        const survive = (c: number) => 1 - env.dryExposure[c] * (1 - dormancy);
        offer(p, p, SPORE, (1 - escape) * nearby * germination[p] * (s1 + s0 * survive(p)));
        for (const o of SPORE_KERNEL) {
          const nx = x + o.dx;
          const ny = y + o.dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const c = ny * width + nx;
          offer(c, p, SPORE, local * o.weight * nearby * germination[c] * (s1 + s0 * survive(c)));
        }
        const airborne = 0.1 + 0.9 * wall;
        globalWeights[p] = windborne * airborne * (s1 + s0 * dormancy);
        globalTotal += globalWeights[p];
      }
      if (a0 + a1 > 0) {
        for (const o of PROPAGULE_KERNEL) {
          const nx = x + o.dx;
          const ny = y + o.dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const c = ny * width + nx;
          const weight = o.weight * propaguleViability[c] * (a1 + a0 * (1 - env.dryExposure[c]));
          offer(c, p, PROPAGULE, weight);
        }
      }
    }

    if (globalTotal > 0) {
      const sampler = new AliasSampler(n);
      sampler.build(globalWeights);
      for (let c = 0; c < n; c++) {
        const weight = (globalTotal / n) * germination[c];
        if (!(weight > 0)) continue;
        total[c] += weight;
        if (rng.float() * total[c] < weight) {
          pickParent[c] = sampler.sample(rng);
          pickKind[c] = SPORE;
        }
      }
    }

    const L = this.loci;
    const birth = this.generation + 1;
    for (let c = 0; c < n; c++) {
      const dst = this.offset(c, 0);
      if (this.perennateG[c] === 1 || this.perennateS[c] === 1) {
        // A perennial keeps its cell (and its genome); arriving propagules find no room.
        this.next.set(this.genomes.subarray(dst, dst + 2 * L), dst);
        this.occupied[c] = 1;
        continue;
      }
      const parent = pickParent[c];
      const established = parent >= 0 && rng.float() < 1 - Math.exp(-LIFE.establishment * total[c]);
      this.occupied[c] = established ? 1 : 0;
      if (!established) {
        // Empty cells hold founder ids (id = locus) so no stale ids survive compaction.
        for (let l = 0; l < L; l++) this.next[dst + l] = this.next[dst + L + l] = l;
        continue;
      }
      if (pickKind[c] === SPORE) {
        recombineCopy(
          this.genomes,
          this.offset(parent, 0),
          this.offset(parent, 1),
          this.next,
          dst,
          L,
          this.crossover,
          this.rng.meiosis,
        );
      } else {
        const src = this.offset(parent, 0);
        this.next.set(this.genomes.subarray(src, src + L), dst);
      }
      mutateCopy(
        this.alleles,
        this.mutation,
        this.schedule,
        this.next,
        dst,
        L,
        this.rng.mutation,
        birth,
      );
      this.next.copyWithin(dst + L, dst, dst + L);
      this.origin[c] = pickKind[c];
    }
    const current = this.genomes;
    this.genomes = this.next;
    this.next = current;
  }

  private summarise(zones: ZoneStats[], env: Environment): YearReport {
    const traitSums = new Float64Array(TRAIT_COUNT);
    const sporophytesByZone = new Float64Array(ZONE_COUNT);
    let population = 0;
    let fertilised = 0;
    let heightSum = 0;
    for (let c = 0; c < this.cells; c++) {
      if (this.occupied[c] === 0) continue;
      population++;
      for (let t = 0; t < TRAIT_COUNT; t++) traitSums[t] += this.gTraits[c * TRAIT_COUNT + t];
      if (this.fertilised[c] === 1) {
        fertilised++;
        heightSum += this.sMaxHeight[c];
        zones[env.zone[c]].sporophyteHeight += this.sMaxHeight[c];
        sporophytesByZone[env.zone[c]]++;
      }
      if (this.gAlive[c] === 1) zones[env.zone[c]].survived++;
    }
    // Averaged over every sporophyte present, including perennials from earlier years.
    zones.forEach((z, i) => {
      z.sporophyteHeight = sporophytesByZone[i] > 0 ? z.sporophyteHeight / sporophytesByZone[i] : 0;
    });
    return {
      generation: this.generation,
      population,
      extinct: population === 0,
      zones,
      traitMeans: Array.from(traitSums, (s) => (population > 0 ? s / population : NaN)),
      sporophyteHeight: fertilised > 0 ? heightSum / fertilised : 0,
      fertilisationRate: population > 0 ? fertilised / population : 0,
    };
  }

  // ---------------------------------------------------------------------------------------
  // Variants introduced from outside (the Mutation Draft)

  /**
   * Gives `count` random individuals a new allele at `locus` (a spontaneous mutation in each
   * one's genome). All copies share one allele id. Returns the id, or −1 if nobody is alive.
   */
  introduceVariant(locus: number, value: number, count = 1): number {
    const occupied: number[] = [];
    for (let c = 0; c < this.cells; c++) if (this.occupied[c] === 1) occupied.push(c);
    if (occupied.length === 0) return -1;
    const rng = this.rng.intervention;
    const k = Math.min(count, occupied.length);
    for (let i = 0; i < k; i++) {
      const j = i + rng.int(occupied.length - i);
      [occupied[i], occupied[j]] = [occupied[j], occupied[i]];
    }
    const first = this.offset(occupied[0], 0) + locus;
    const id = this.alleles.add(
      value,
      locus,
      k === 1 ? this.genomes[first] : NO_PARENT,
      this.generation,
    );
    for (let i = 0; i < k; i++) {
      this.genomes[this.offset(occupied[i], 0) + locus] = id;
      this.genomes[this.offset(occupied[i], 1) + locus] = id;
    }
    return id;
  }

  pin(name: string, allele: number): void {
    this.pins.set(name, allele);
  }

  pinned(name: string): number | undefined {
    return this.pins.get(name);
  }

  /** Fraction of individuals whose maternal copy carries one of the pinned alleles or a descendant. */
  carrierFrequency(names: readonly string[]): number {
    const ids = names.map((name) => this.pins.get(name)).filter((id) => id !== undefined);
    if (ids.length === 0) return 0;
    const mask = new Uint8Array(this.alleles.count);
    for (const id of ids) {
      const m = this.alleles.descendantMask(id);
      for (let i = id; i < m.length; i++) if (m[i] === 1) mask[i] = 1;
    }
    const locus = this.alleles.locus(ids[0]);
    let carriers = 0;
    let population = 0;
    for (let c = 0; c < this.cells; c++) {
      if (this.occupied[c] === 0) continue;
      population++;
      if (mask[this.genomes[this.offset(c, 0) + locus]] === 1) carriers++;
    }
    return population > 0 ? carriers / population : 0;
  }

  compactAlleles(): void {
    const live = new Uint8Array(this.alleles.count);
    for (let c = 0; c < this.cells; c++) {
      if (this.occupied[c] === 0) continue;
      const start = this.offset(c, 0);
      for (let i = start; i < start + 2 * this.loci; i++) live[this.genomes[i]] = 1;
    }
    for (let l = 0; l < this.loci; l++) live[l] = 1; // founders fill empty cells
    for (const id of this.pins.values()) live[id] = 1;
    const remap = this.alleles.compact(live);
    // Founders are the first ids and always kept, so they keep ids 0..loci−1.
    for (let c = 0; c < this.cells; c++) {
      const start = this.offset(c, 0);
      const occupied = this.occupied[c] === 1;
      for (let i = start; i < start + 2 * this.loci; i++) {
        this.genomes[i] = occupied ? remap[this.genomes[i]] : i % this.loci;
      }
    }
    for (const [name, id] of this.pins) this.pins.set(name, remap[id]);
  }

  // ---------------------------------------------------------------------------------------
  // Saving and loading

  snapshot(): WorldSnapshot {
    const { landscape: _l, arch: _a, ...options } = this.options;
    return {
      version: 1,
      options,
      landscape: this.landscape.options,
      lociPerTrait: this.arch.lociPerTrait,
      generation: this.generation,
      genomes: this.genomes.slice(),
      occupied: this.occupied.slice(),
      origin: this.origin.slice(),
      perennateG: this.perennateG.slice(),
      perennateS: this.perennateS.slice(),
      carryG: this.carryG.slice(),
      carryS: this.carryS.slice(),
      lastEstablished: this.lastEstablished.slice(),
      lastReproduced: this.lastReproduced.slice(),
      lastHeight: this.sMaxHeight.slice(),
      alleles: this.alleles.exportState(),
      pins: [...this.pins],
      rng: Object.fromEntries(Object.entries(this.rng).map(([k, r]) => [k, r.getState()])),
    };
  }

  static restore(snapshot: WorldSnapshot, landscape: Landscape): World {
    const world = new World({
      ...snapshot.options,
      landscape,
      arch: createArchitecture(snapshot.lociPerTrait),
    });
    world.generation = snapshot.generation;
    world.genomes.set(snapshot.genomes);
    world.occupied.set(snapshot.occupied);
    world.origin.set(snapshot.origin);
    world.perennateG.set(snapshot.perennateG);
    world.perennateS.set(snapshot.perennateS);
    world.carryG.set(snapshot.carryG);
    world.carryS.set(snapshot.carryS);
    world.lastEstablished.set(snapshot.lastEstablished);
    world.lastReproduced.set(snapshot.lastReproduced);
    world.sMaxHeight.set(snapshot.lastHeight);
    world.alleles = AlleleTable.fromState(snapshot.alleles);
    for (const [name, id] of snapshot.pins) world.pins.set(name, id);
    for (const [key, state] of Object.entries(snapshot.rng)) {
      world.rng[key as keyof World['rng']].setState(state);
    }
    return world;
  }
}

/** Chance a spore survives the dry season in the soil, rising steeply with wall quality. */
export function sporeDormancySurvival(wall: number): number {
  return (0.02 + 0.98 * wall) ** 2;
}

function emptyZoneStats(): ZoneStats {
  return {
    cells: 0,
    established: 0,
    perennial: 0,
    sporophyteHeight: 0,
    survived: 0,
    fertilised: 0,
    reproduced: 0,
    spores: 0,
    propagules: 0,
    deaths: [0, 0, 0, 0],
  };
}
