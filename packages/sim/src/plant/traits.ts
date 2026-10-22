/**
 * Plant traits and the genetic architecture that produces them.
 * Specification: docs/science/03-plant-physiology.md §2.
 *
 * Each trait is a value in (0, 1) obtained as logistic(base + liability). The liability sums
 * additive allele values from the trait's own loci and, scaled by a loading, from shared
 * "developmental module" loci, which create pleiotropy (one mutation shifting several traits).
 */

export const TRAIT_IDS = [
  'desiccationTolerance',
  'cuticle',
  'stomata',
  'sporeWall',
  'sporophyte',
  'stature',
  'vascular',
  'rooting',
  'branching',
  'asexual',
] as const;

export type TraitId = (typeof TRAIT_IDS)[number];

/** Index of each trait in trait vectors (Float64Array of length TRAIT_COUNT). */
export const T = Object.fromEntries(TRAIT_IDS.map((id, i) => [id, i])) as Record<TraitId, number>;
export const TRAIT_COUNT = TRAIT_IDS.length;

export interface TraitInfo {
  id: TraitId;
  label: string;
  /** Which generation of the life cycle expresses the trait. */
  expressedIn: 'gametophyte' | 'sporophyte' | 'both';
  summary: string;
}

export const TRAIT_INFO: Record<TraitId, TraitInfo> = {
  desiccationTolerance: {
    id: 'desiccationTolerance',
    label: 'Desiccation tolerance',
    expressedIn: 'both',
    summary:
      'Cells survive drying out and recover when rewetted. Protects against drought, but the protective machinery slows growth.',
  },
  cuticle: {
    id: 'cuticle',
    label: 'Waxy cuticle',
    expressedIn: 'both',
    summary:
      'A waxy layer that slows water loss. It also blocks carbon dioxide, so on its own it trades growth for staying hydrated.',
  },
  stomata: {
    id: 'stomata',
    label: 'Stomata',
    expressedIn: 'sporophyte',
    summary:
      'Pores that open to let carbon dioxide in and close when water runs short. Only useful once a cuticle seals the rest of the surface.',
  },
  sporeWall: {
    id: 'sporeWall',
    label: 'Sporopollenin spore wall',
    expressedIn: 'sporophyte',
    summary:
      'A tough wall that lets spores survive drying, UV and travel through air. Each walled spore costs more to make.',
  },
  sporophyte: {
    id: 'sporophyte',
    label: 'Sporophyte (embryo) development',
    expressedIn: 'sporophyte',
    summary:
      'The fertilized egg grows into a multicellular body before meiosis, multiplying the spores made from each rare fertilization.',
  },
  stature: {
    id: 'stature',
    label: 'Upright growth',
    expressedIn: 'sporophyte',
    summary:
      'Investment in upright axes. Taller plants catch more light and release spores higher into the wind, but tall tissue dries out unless water is piped up to it.',
  },
  vascular: {
    id: 'vascular',
    label: 'Water-conducting tissue',
    expressedIn: 'sporophyte',
    summary:
      'Lignified tubes (tracheids) that move water up the plant and stiffen it. Costly to build.',
  },
  rooting: {
    id: 'rooting',
    label: 'Rhizoids and rooting axes',
    expressedIn: 'both',
    summary:
      'Below-ground structures that reach water in the soil. Carbon spent below ground is not photosynthesising.',
  },
  branching: {
    id: 'branching',
    label: 'Branching',
    expressedIn: 'sporophyte',
    summary:
      'Repeated forking of the sporophyte gives more tips that each carry a sporangium, so more spores per plant.',
  },
  asexual: {
    id: 'asexual',
    label: 'Asexual propagules',
    expressedIn: 'gametophyte',
    summary:
      'Fragments and gemmae that clone the parent. Cheap and quick, but unwalled: they only survive in water or on wet ground.',
  },
};

/** A developmental or biochemical module whose genes affect several traits at once. */
export interface ModuleDef {
  id: string;
  label: string;
  loadings: Partial<Record<TraitId, number>>;
}

export const MODULES: readonly ModuleDef[] = [
  {
    // Lignin and sporopollenin both draw on phenylpropanoid metabolism (Weng & Chapple 2010).
    // Lignified walls both conduct water and stiffen axes, so the module also supports stature.
    id: 'phenylpropanoid',
    label: 'Phenylpropanoid metabolism',
    loadings: { vascular: 0.6, sporeWall: 0.4, stature: 0.4 },
  },
  {
    // Cutin and the spore-wall's aliphatic components are both lipid polyesters.
    id: 'lipidPolyester',
    label: 'Lipid polyester synthesis',
    loadings: { cuticle: 0.6, sporeWall: 0.4 },
  },
];

export interface GenomeArchitecture {
  readonly traits: readonly TraitId[];
  readonly lociPerTrait: number;
  readonly modules: readonly ModuleDef[];
  readonly loci: number;
  /** For each locus: trait index (≥ 0) or −(module index + 1) for module loci. */
  readonly locusOwner: Int16Array;
  /** CSR-style contributions: for trait t, entries contribStart[t]..contribStart[t+1]. */
  readonly contribStart: Int32Array;
  readonly contribLocus: Int32Array;
  readonly contribWeight: Float64Array;
}

export function createArchitecture(lociPerTrait = 4, modules = MODULES): GenomeArchitecture {
  const traitLoci = TRAIT_COUNT * lociPerTrait;
  const loci = traitLoci + modules.length;
  const locusOwner = new Int16Array(loci);
  for (let t = 0; t < TRAIT_COUNT; t++) {
    for (let k = 0; k < lociPerTrait; k++) locusOwner[t * lociPerTrait + k] = t;
  }
  modules.forEach((_, m) => (locusOwner[traitLoci + m] = -(m + 1)));

  const entries: { locus: number; weight: number }[][] = TRAIT_IDS.map((_, t) =>
    Array.from({ length: lociPerTrait }, (_, k) => ({ locus: t * lociPerTrait + k, weight: 1 })),
  );
  modules.forEach((module, m) => {
    for (const [trait, weight] of Object.entries(module.loadings)) {
      entries[T[trait as TraitId]].push({ locus: traitLoci + m, weight: weight ?? 0 });
    }
  });
  const contribStart = new Int32Array(TRAIT_COUNT + 1);
  entries.forEach((list, t) => (contribStart[t + 1] = contribStart[t] + list.length));
  const flat = entries.flat();
  return {
    traits: TRAIT_IDS,
    lociPerTrait,
    modules,
    loci,
    locusOwner,
    contribStart,
    contribLocus: Int32Array.from(flat.map((e) => e.locus)),
    contribWeight: Float64Array.from(flat.map((e) => e.weight)),
  };
}

/** Human-readable name of a locus, e.g. "cuticle 2" or "Phenylpropanoid metabolism". */
export function locusLabel(arch: GenomeArchitecture, locus: number): string {
  const owner = arch.locusOwner[locus];
  if (owner >= 0)
    return `${TRAIT_INFO[arch.traits[owner]].label} ${(locus % arch.lociPerTrait) + 1}`;
  return arch.modules[-owner - 1].label;
}

/**
 * Trait liabilities (the genetic part, before the logistic) of one individual.
 * Diploid: sum over both copies. Haploid (`copy1 < 0`): twice the single copy, so a haploid
 * carrying an allele expresses the same value as a diploid homozygous for it.
 */
export function liabilities(
  arch: GenomeArchitecture,
  genomes: Uint32Array,
  copy0: number,
  copy1: number,
  alleleValues: Float64Array,
  out: Float64Array,
): Float64Array {
  for (let t = 0; t < TRAIT_COUNT; t++) {
    let sum = 0;
    for (let c = arch.contribStart[t]; c < arch.contribStart[t + 1]; c++) {
      const l = arch.contribLocus[c];
      const v0 = alleleValues[genomes[copy0 + l]];
      const v = copy1 < 0 ? 2 * v0 : v0 + alleleValues[genomes[copy1 + l]];
      sum += arch.contribWeight[c] * v;
    }
    out[t] = sum;
  }
  return out;
}

export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function logit(p: number): number {
  return Math.log(p / (1 - p));
}

/** Trait values in (0, 1) from baseline logits plus liabilities. */
export function phenotype(
  bases: Float64Array,
  liability: Float64Array,
  out: Float64Array,
): Float64Array {
  for (let t = 0; t < TRAIT_COUNT; t++) out[t] = logistic(bases[t] + liability[t]);
  return out;
}

/** Baseline logits from ancestral trait values in (0, 1). */
export function basesFromTraits(ancestral: Record<TraitId, number>): Float64Array {
  return Float64Array.from(TRAIT_IDS, (id) => logit(ancestral[id]));
}
