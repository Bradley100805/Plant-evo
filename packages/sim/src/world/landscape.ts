/**
 * A pond-margin landscape and its monthly environment.
 * Specification: docs/science/05-spatial-ecology.md §1–§2.
 *
 * The landscape is a grid of square cells rising from open water (x = 0) to dry ground
 * (x = width − 1), with gentle random relief so the shoreline is irregular. The year has a wet
 * season (months 0–5) and a dry season (months 6–11): the lake rises and falls, rain wets
 * surfaces, and the water table follows the lake level.
 */
import type { MonthClimate, SiteMonth } from '../plant/physiology.ts';
import { Rng, type Seed } from '../rng/index.ts';

export const MONTHS = 12;

export interface LandscapeOptions {
  width: number;
  height: number;
  /** Side of a cell, m. */
  cellSize: number;
  /** Column where the ground meets the mean lake level. */
  shoreColumn: number;
  /** Rise in ground elevation per column, m. */
  slope: number;
  /** Amplitude of random relief, m. */
  relief: number;
  seed: Seed;
}

export const DEFAULT_LANDSCAPE: LandscapeOptions = {
  width: 48,
  height: 24,
  cellSize: 0.1,
  shoreColumn: 14,
  slope: 0.055,
  relief: 0.12,
  seed: 'landscape',
};

export class Landscape {
  readonly width: number;
  readonly height: number;
  readonly cells: number;
  readonly cellSize: number;
  readonly cellArea: number;
  /** Ground elevation relative to the baseline mean lake level, m. */
  readonly elevation: Float64Array;
  readonly options: LandscapeOptions;

  constructor(options: Partial<LandscapeOptions> = {}) {
    const o = { ...DEFAULT_LANDSCAPE, ...options };
    this.options = o;
    this.width = o.width;
    this.height = o.height;
    this.cells = o.width * o.height;
    this.cellSize = o.cellSize;
    this.cellArea = o.cellSize * o.cellSize;
    this.elevation = new Float64Array(this.cells);
    const noise = smoothNoise(o.width, o.height, new Rng(o.seed).fork('relief'));
    for (let y = 0; y < o.height; y++) {
      for (let x = 0; x < o.width; x++) {
        const i = y * o.width + x;
        this.elevation[i] = o.slope * (x - o.shoreColumn) + o.relief * noise[i];
      }
    }
  }

  x(cell: number): number {
    return cell % this.width;
  }

  y(cell: number): number {
    return (cell / this.width) | 0;
  }
}

/** Value noise in [−1, 1] from three octaves of bilinearly interpolated random grids. */
function smoothNoise(width: number, height: number, rng: Rng): Float64Array {
  const out = new Float64Array(width * height);
  let amplitude = 1;
  let total = 0;
  for (const spacing of [12, 6, 3]) {
    const gw = Math.ceil(width / spacing) + 2;
    const gh = Math.ceil(height / spacing) + 2;
    const grid = Float64Array.from({ length: gw * gh }, () => 2 * rng.float() - 1);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const fx = x / spacing;
        const fy = y / spacing;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(fx - x0);
        const ty = smooth(fy - y0);
        const g = (gx: number, gy: number) => grid[gy * gw + gx];
        const top = g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx;
        const bottom = g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx;
        out[y * width + x] += amplitude * (top * (1 - ty) + bottom * ty);
      }
    }
    total += amplitude;
    amplitude /= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Global conditions for an epoch. Specification: docs/science/07-early-earth-environments.md. */
export interface EnvironmentSpec {
  /** Atmospheric CO₂, ppm. */
  co2: number;
  /** Atmospheric O₂, % by volume. */
  o2: number;
  /** Mean air temperature at the site, °C. */
  meanTempC: number;
  /** Half the difference between the warmest and coolest month, °C. */
  tempSeasonality: number;
  /** Mean daytime PAR in the dry season, µmol m⁻² s⁻¹ (the wet season is cloudier). */
  par: number;
  /** Fraction of daylight with surfaces wet from rain or dew, in the wettest and driest months. */
  rainWet: [wet: number, dry: number];
  /** Vapour pressure deficit in the wettest and driest months, kPa. */
  vpd: [wet: number, dry: number];
  /** Topsoil moisture (0–1) in the wettest and driest months. */
  soilMoisture: [wet: number, dry: number];
  /** Mean lake level relative to the baseline, m (negative = lower). */
  lakeLevel: number;
  /** Rise above (and fall below) the mean lake level at the peak of the wet (dry) season, m. */
  lakeSeasonality: number;
}

export const ZONES = ['open water', 'shallows', 'margin', 'damp ground', 'dry ground'] as const;
export type Zone = (typeof ZONES)[number];
export const ZONE_COUNT = ZONES.length;

/** Monthly environment of every cell, derived from the landscape and an epoch's conditions. */
export interface Environment {
  spec: EnvironmentSpec;
  climate: MonthClimate[];
  /** Per cell and month (index cell * 12 + month). */
  depth: Float64Array;
  surfaceWet: Float64Array;
  waterTableDepth: Float64Array;
  soilMoisture: Float64Array;
  /** Zone index of each cell. */
  zone: Uint8Array;
  /** Fraction of dry-season months each cell is emergent (exposed to drying). */
  dryExposure: Float64Array;
}

/** Seasonal weight: 1 at the peak of the wet season (month 2.5), 0 at the peak of the dry season. */
export function wetness(month: number): number {
  return 0.5 + 0.5 * Math.cos((2 * Math.PI * (month - 2.5)) / MONTHS);
}

function mix([wet, dry]: [number, number], w: number): number {
  return dry + (wet - dry) * w;
}

/** Height above the water table over which the ground surface stays moist, m. */
const SURFACE_FRINGE = 0.15;

export function buildEnvironment(landscape: Landscape, spec: EnvironmentSpec): Environment {
  const n = landscape.cells;
  const climate: MonthClimate[] = [];
  const lake: number[] = [];
  for (let m = 0; m < MONTHS; m++) {
    const w = wetness(m);
    climate.push({
      tempC: spec.meanTempC + spec.tempSeasonality * (2 * w - 1),
      par: spec.par * (1 - 0.25 * w),
      dayHours: 12,
      vpd: mix(spec.vpd, w),
      rainWet: mix(spec.rainWet, w),
    });
    lake.push(spec.lakeLevel + spec.lakeSeasonality * (2 * w - 1));
  }

  const depth = new Float64Array(n * MONTHS);
  const surfaceWet = new Float64Array(n * MONTHS);
  const waterTableDepth = new Float64Array(n * MONTHS);
  const soilMoisture = new Float64Array(n * MONTHS);
  const zone = new Uint8Array(n);
  const dryExposure = new Float64Array(n);

  for (let c = 0; c < n; c++) {
    const z = landscape.elevation[c];
    let submergedMonths = 0;
    let minTableDepth = Infinity;
    let exposedDry = 0;
    for (let m = 0; m < MONTHS; m++) {
      const k = c * MONTHS + m;
      const d = lake[m] - z;
      const w = wetness(m);
      if (d > 0) {
        depth[k] = d;
        surfaceWet[k] = 1;
        waterTableDepth[k] = 0;
        soilMoisture[k] = 1;
        submergedMonths++;
      } else {
        const table = -d;
        depth[k] = 0;
        waterTableDepth[k] = table;
        surfaceWet[k] = Math.min(1, 0.8 * climate[m].rainWet + Math.exp(-table / SURFACE_FRINGE));
        soilMoisture[k] = mix(spec.soilMoisture, w);
        minTableDepth = Math.min(minTableDepth, table);
        if (m >= 6) exposedDry++;
      }
    }
    dryExposure[c] = exposedDry / 6;
    zone[c] =
      submergedMonths === MONTHS
        ? 0
        : submergedMonths >= 6
          ? 1
          : submergedMonths >= 1
            ? 2
            : minTableDepth < 0.4
              ? 3
              : 4;
  }
  return { spec, climate, depth, surfaceWet, waterTableDepth, soilMoisture, zone, dryExposure };
}

/** The site conditions of one cell in one month (allocation-free view for the physiology). */
export function siteAt(env: Environment, cell: number, month: number, out: SiteMonth): SiteMonth {
  const k = cell * MONTHS + month;
  out.depth = env.depth[k];
  out.surfaceWet = env.surfaceWet[k];
  out.waterTableDepth = env.waterTableDepth[k];
  out.soilMoisture = env.soilMoisture[k];
  return out;
}
