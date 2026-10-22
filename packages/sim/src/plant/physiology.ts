/**
 * Monthly water and carbon balance of a plant body (gametophyte or sporophyte).
 * Specification: docs/science/03-plant-physiology.md §4–§6.
 *
 * The central idea: a plant body exchanges CO₂ and water vapour through the same surfaces.
 * A cuticle cuts both, so on its own it buys hydration at the price of photosynthesis. Stomata
 * only help once a cuticle has sealed the rest of the surface, because only then can closing
 * pores actually stop water loss. Internal water transport (vascular tissue + rooting) keeps
 * tissue above the wet ground hydrated. None of these dependencies is hard-coded; they follow
 * from the flux equations below.
 */
import { assimilate, DEFAULT_LEAF, type LeafTraits, leafRates } from './photosynthesis.ts';
import { T } from './traits.ts';

export const PHYS = {
  /** Water-vapour conductance of a wet, uncutinised surface (boundary-layer limited), mol m⁻² s⁻¹. */
  boundaryLayerConductance: 0.8,
  /** Minimum (cuticular) conductance of a well-developed cuticle, mol m⁻² s⁻¹. */
  minCuticularConductance: 0.003,
  /** Maximum stomatal conductance to water vapour at stomata trait = 1, mol m⁻² s⁻¹. */
  maxStomatalConductance: 0.4,
  /** Effective CO₂ conductance through the unstirred water layer of a submerged body. */
  aquaticConductance: 0.004,
  /** Attenuation of PAR in pond water, m⁻¹. */
  waterAttenuation: 0.8,
  /**
   * Water supplied to tissue lying on a saturated substrate, mol H₂O m⁻² s⁻¹. Set near the
   * evaporation rate of free water at a high vapour pressure deficit, so a thin thallus on wet
   * mud stays hydrated.
   */
  contactSupply: 0.012,
  /** Height over which contact with the wet substrate is lost (e-folding), m. */
  contactHeight: 0.01,
  /** Height of moist soil above the water table (capillary fringe), m. */
  capillaryFringe: 0.3,
  /** Monthly death hazard for fully desiccation-sensitive tissue that is dry all month. */
  desiccationHazard: 4,
  /** Fractional loss of photosynthetic capacity at full desiccation tolerance (cost of tolerance). */
  toleranceGrowthCost: 0.3,
  /** Ratio of diffusivities of water vapour and CO₂ in air (stomatal pathway). */
  vapourToCo2: 1.6,
  /**
   * Water-vapour to CO₂ conductance ratio of a fully developed cuticle: CO₂ crosses the cuticle
   * at only ~5.7% of the water-vapour conductance (Boyer, Wong & Farquhar 1997).
   */
  cuticleVapourToCo2: 17.5,
  /** Atmospheric pressure, kPa. */
  pressure: 101.325,
  /** Fraction of the clear-day potential realised over a month (cloud, low sun angles, variability). */
  fieldEfficiency: 0.5,
  daysPerMonth: 30.4,
} as const;

export interface Atmosphere {
  /** CO₂, µmol mol⁻¹ (ppm). */
  co2: number;
  /** O₂, mmol mol⁻¹ (210 = 21%). */
  o2: number;
}

export interface MonthClimate {
  tempC: number;
  /** Mean PAR during daylight above any canopy or water, µmol m⁻² s⁻¹. */
  par: number;
  dayHours: number;
  /** Vapour pressure deficit, kPa. */
  vpd: number;
  /** Fraction of daylight during which surfaces are wet from rain or dew. */
  rainWet: number;
}

export interface SiteMonth {
  /** Water depth above the ground surface, m (0 when emergent). */
  depth: number;
  /** Fraction of time the ground surface is wet (capillary rise, seepage, puddles). */
  surfaceWet: number;
  /** Depth of the water table below the surface, m (0 when submerged). */
  waterTableDepth: number;
  /** Topsoil moisture available to any absorbing structure, 0–1. */
  soilMoisture: number;
}

/** Physiological description of one plant body in one month. */
export interface Body {
  height: number;
  /** Tissue mass per unit photosynthetic area, g m⁻². */
  lma: number;
  /** Fraction of biomass that is photosynthetic tissue. */
  photoFraction: number;
  /** Non-stomatal surface conductance to water vapour, mol m⁻² s⁻¹. */
  gSurface: number;
  /** Non-stomatal surface conductance to CO₂, mol m⁻² s⁻¹. */
  gSurfaceCo2: number;
  /** Maximum stomatal conductance to water vapour, mol m⁻² s⁻¹. */
  gStomata: number;
  rootDepth: number;
  /** Internal water-supply capacity per unit photosynthetic area at full soil access, mol m⁻² s⁻¹. */
  kInternal: number;
  leaf: LeafTraits;
  desiccationTolerance: number;
}

/** Surface conductance to water vapour, interpolated geometrically from a wet surface to a full cuticle. */
export function surfaceConductance(cuticle: number): number {
  return PHYS.boundaryLayerConductance ** (1 - cuticle) * PHYS.minCuticularConductance ** cuticle;
}

/** Surface conductance to CO₂: a cuticle is a much stronger barrier to CO₂ than to water vapour. */
export function surfaceConductanceCo2(cuticle: number): number {
  const ratio = PHYS.vapourToCo2 ** (1 - cuticle) * PHYS.cuticleVapourToCo2 ** cuticle;
  return surfaceConductance(cuticle) / ratio;
}

function leafFor(desiccationTolerance: number): LeafTraits {
  return {
    ...DEFAULT_LEAF,
    vcmax25: DEFAULT_LEAF.vcmax25 * (1 - PHYS.toleranceGrowthCost * desiccationTolerance),
  };
}

/**
 * Strength of cuticle expression in the gametophyte relative to the sporophyte. Bryophyte
 * gametophytes are covered by much thinner cuticles than sporophytes and depend mostly on
 * external water.
 */
export const GAMETOPHYTE_CUTICLE_EXPRESSION = 0.5;

/** The haploid gametophyte: a prostrate thallus without stomata or vascular tissue. */
export function gametophyteBody(traits: Float64Array): Body {
  const c = GAMETOPHYTE_CUTICLE_EXPRESSION * traits[T.cuticle];
  const r = traits[T.rooting];
  const dt = traits[T.desiccationTolerance];
  return {
    height: 0.002,
    lma: 15 + 20 * c,
    photoFraction: 0.9 - 0.3 * r,
    gSurface: surfaceConductance(c),
    gSurfaceCo2: surfaceConductanceCo2(c),
    gStomata: 0,
    rootDepth: 0.002 + 0.02 * r,
    kInternal: 0.0002 + 0.001 * r,
    leaf: leafFor(dt),
    desiccationTolerance: dt,
  };
}

/** Maximum height of the sporophyte's upright axes, m. */
export function maxSporophyteHeight(traits: Float64Array): number {
  return 0.003 + traits[T.stature] * (0.03 + 0.5 * traits[T.vascular]);
}

/** Sporophyte height for a given biomass (grows towards its genetic maximum). */
export function sporophyteHeight(traits: Float64Array, biomass: number): number {
  const hMax = maxSporophyteHeight(traits);
  return (hMax * biomass) / (biomass + 2 * hMax);
}

/** The diploid sporophyte: upright axes that may carry stomata, tracheids and rooting axes. */
export function sporophyteBody(traits: Float64Array, biomass: number): Body {
  const c = traits[T.cuticle];
  const s = traits[T.stomata];
  const v = traits[T.vascular];
  const h = traits[T.stature];
  const r = traits[T.rooting];
  const b = traits[T.branching];
  const dt = traits[T.desiccationTolerance];
  const height = sporophyteHeight(traits, biomass);
  return {
    height,
    lma: 20 + 20 * c + 2 * s + 60 * v * h,
    photoFraction: Math.max(0.2, 0.85 - 0.4 * r - 0.25 * v * h - 0.05 * b),
    gSurface: surfaceConductance(c),
    gSurfaceCo2: surfaceConductanceCo2(c),
    gStomata: PHYS.maxStomatalConductance * s,
    rootDepth: 0.003 + 0.3 * r * (0.2 + 0.8 * v),
    kInternal: ((0.0002 + 0.008 * v) * (0.25 + 0.75 * r)) / (1 + height / (0.01 + 0.5 * v)),
    leaf: leafFor(dt),
    desiccationTolerance: dt,
  };
}

export interface MonthBalance {
  /** Net carbon of one unshaded m² of tissue over the month (day gain − night respiration), µmol. */
  carbonPerArea: number;
  /** Net daytime assimilation per m² of sunlit tissue over the month, µmol. */
  dayCarbon: number;
  /** Respiration per m² of shaded tissue during daylight over the month, µmol. */
  shadedDayRespiration: number;
  /** Night respiration per m² of tissue over the month, µmol. */
  nightRespiration: number;
  /** Fraction of the month the tissue was hydrated and metabolically active. */
  hydration: number;
  /** Probability of surviving the month's desiccation. */
  survival: number;
  /** Mean net assimilation while hydrated in daylight, µmol m⁻² s⁻¹. */
  assimilation: number;
  /** Water supply divided by the demand of a fully open body (≥ 1: never water-limited). */
  supplyRatio: number;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * One month of gas exchange for a body at a site. `par` is the light reaching the body (after
 * shading by neighbours, before any water column). `extraSupply` adds water from another body,
 * e.g. a dependent sporophyte drawing on its gametophyte.
 */
export function monthBalance(
  body: Body,
  climate: MonthClimate,
  site: SiteMonth,
  atm: Atmosphere,
  par: number,
  extraSupply = 0,
): MonthBalance {
  const rates = leafRates(body.leaf, climate.tempC, atm.o2);
  const daySeconds = climate.dayHours * 3600;
  const nightSeconds = (24 - climate.dayHours) * 3600;
  const scale = PHYS.fieldEfficiency * PHYS.daysPerMonth;

  if (site.depth > 0) {
    // Submerged: always hydrated, but CO₂ must diffuse through water and light is attenuated.
    // The unstirred water layer and the plant surface act as resistances in series.
    const gTissue = body.gSurfaceCo2 + body.gStomata / PHYS.vapourToCo2;
    const gc = 1 / (1 / PHYS.aquaticConductance + 1 / gTissue);
    const light = par * Math.exp(-PHYS.waterAttenuation * site.depth);
    const a = assimilate(gc, atm.co2, light, rates, body.leaf).a;
    return withCarbon(a, 1, rates.rd, daySeconds, nightSeconds, scale, {
      survival: 1,
      supplyRatio: Infinity,
    });
  }

  // Emergent: water supply from the wet substrate (contact) and from the soil (internal).
  const contact =
    PHYS.contactSupply * site.surfaceWet * Math.exp(-body.height / PHYS.contactHeight);
  const soilAccess = Math.max(
    site.soilMoisture,
    clamp01(1 - (site.waterTableDepth - body.rootDepth) / PHYS.capillaryFringe),
  );
  const supply = contact + body.kInternal * soilAccess + extraSupply;

  const vpdFraction = climate.vpd / PHYS.pressure;
  const surfaceDemand = body.gSurface * vpdFraction;
  // Stomata open only as far as the supply left after unavoidable surface losses allows.
  const gsDry =
    vpdFraction > 0
      ? Math.min(body.gStomata, Math.max(0, (supply - surfaceDemand) / vpdFraction))
      : body.gStomata;
  const dryDemand = (body.gSurface + gsDry) * vpdFraction;
  const hydratedWhileDry = dryDemand <= supply ? 1 : supply / dryDemand;
  const wet = clamp01(climate.rainWet);
  const hydration = wet + (1 - wet) * hydratedWhileDry;

  const aWet = assimilate(
    body.gSurfaceCo2 + body.gStomata / PHYS.vapourToCo2,
    atm.co2,
    par,
    rates,
    body.leaf,
  ).a;
  const aDry = assimilate(
    body.gSurfaceCo2 + gsDry / PHYS.vapourToCo2,
    atm.co2,
    par,
    rates,
    body.leaf,
  ).a;
  const meanA = wet * aWet + (1 - wet) * hydratedWhileDry * aDry;

  const dryFraction = 1 - hydration;
  const sensitivity = (1 - body.desiccationTolerance) ** 2;
  const openDemand = (body.gSurface + body.gStomata) * vpdFraction;
  return withCarbon(
    hydration > 0 ? meanA / hydration : 0,
    hydration,
    rates.rd,
    daySeconds,
    nightSeconds,
    scale,
    {
      survival: Math.exp(-PHYS.desiccationHazard * dryFraction * sensitivity),
      supplyRatio: openDemand > 0 ? supply / openDemand : Infinity,
    },
  );
}

function withCarbon(
  assimilation: number,
  hydration: number,
  rd: number,
  daySeconds: number,
  nightSeconds: number,
  scale: number,
  rest: { survival: number; supplyRatio: number },
): MonthBalance {
  const dayCarbon = scale * assimilation * hydration * daySeconds;
  const nightRespiration = scale * rd * hydration * nightSeconds;
  return {
    carbonPerArea: dayCarbon - nightRespiration,
    dayCarbon,
    shadedDayRespiration: scale * rd * hydration * daySeconds,
    nightRespiration,
    hydration,
    assimilation,
    ...rest,
  };
}

/** Grams of new biomass per µmol of CO₂ fixed (45% carbon, 75% construction efficiency). */
export const GRAMS_PER_UMOL = (12e-6 / 0.45) * 0.75;

/** Light-extinction coefficient for plant tissue (Monsi & Saeki 1953). */
export const CANOPY_K = 0.7;

/**
 * Largest photosynthetic area index a body keeps. Tissue shaded below its light compensation
 * point is shed, so real canopies and moss mats stay at area indices of roughly 3–8.
 */
export const MAX_AREA_INDEX = 4;

/** Biomass (g) at which a body reaches {@link MAX_AREA_INDEX} over `area` m². */
export function maxBiomass(body: Body, area: number): number {
  return (MAX_AREA_INDEX * body.lma * area) / body.photoFraction;
}

/** Photosynthetic area index of a body of `biomass` grams spread over `area` m². */
export function areaIndex(body: Body, biomass: number, area: number): number {
  return (biomass * body.photoFraction) / body.lma / area;
}

/**
 * Biomass change (g) over the month for `biomass` grams spread over `area` m². Photosynthesis
 * follows the big-leaf approximation (sunlit area = area·(1 − e^(−k·PAI))/k); every m² of tissue
 * respires, so self-shading caps the standing biomass. 3% of biomass turns over each month.
 */
export function biomassChange(
  body: Body,
  balance: MonthBalance,
  biomass: number,
  area: number,
): number {
  const pai = areaIndex(body, biomass, area);
  const totalArea = pai * area;
  const sunlit = Math.min(totalArea, (area * (1 - Math.exp(-CANOPY_K * pai))) / CANOPY_K);
  const carbon =
    balance.dayCarbon * sunlit -
    balance.shadedDayRespiration * (totalArea - sunlit) -
    balance.nightRespiration * totalArea;
  return carbon * GRAMS_PER_UMOL - 0.03 * biomass;
}
