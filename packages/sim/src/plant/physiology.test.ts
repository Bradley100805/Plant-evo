import { describe, expect, it } from 'vitest';
import {
  type Atmosphere,
  biomassChange,
  gametophyteBody,
  type MonthClimate,
  monthBalance,
  PHYS,
  type SiteMonth,
  sporophyteBody,
  surfaceConductance,
  surfaceConductanceCo2,
} from './physiology.ts';
import { T, TRAIT_COUNT, type TraitId } from './traits.ts';

function traits(values: Partial<Record<TraitId, number>> = {}): Float64Array {
  const t = new Float64Array(TRAIT_COUNT).fill(0.02);
  for (const [id, v] of Object.entries(values)) t[T[id as TraitId]] = v;
  return t;
}

const climate: MonthClimate = { tempC: 24, par: 900, dayHours: 12, vpd: 1.2, rainWet: 0.1 };
const atm: Atmosphere = { co2: 2500, o2: 170 };
const submerged: SiteMonth = { depth: 0.3, surfaceWet: 1, waterTableDepth: 0, soilMoisture: 1 };
const damp: SiteMonth = { depth: 0, surfaceWet: 0.4, waterTableDepth: 0.4, soilMoisture: 0.4 };
const dry: SiteMonth = { depth: 0, surfaceWet: 0.05, waterTableDepth: 1.5, soilMoisture: 0.1 };

describe('surface conductances', () => {
  it('span a wet surface to a full cuticle, with the cuticle blocking CO2 most', () => {
    expect(surfaceConductance(0)).toBeCloseTo(PHYS.boundaryLayerConductance, 12);
    expect(surfaceConductance(1)).toBeCloseTo(PHYS.minCuticularConductance, 12);
    expect(surfaceConductance(0) / surfaceConductanceCo2(0)).toBeCloseTo(1.6, 9);
    expect(surfaceConductance(1) / surfaceConductanceCo2(1)).toBeCloseTo(17.5, 9);
  });
});

describe('cuticle', () => {
  it('reduces carbon gain under water, where there is no water to save', () => {
    const bare = monthBalance(gametophyteBody(traits()), climate, submerged, atm, 900);
    const waxy = monthBalance(
      gametophyteBody(traits({ cuticle: 0.8 })),
      climate,
      submerged,
      atm,
      900,
    );
    expect(waxy.carbonPerArea).toBeLessThan(0.6 * bare.carbonPerArea);
  });

  it('reduces carbon gain when surfaces are always wet', () => {
    const wet = { ...climate, rainWet: 1 };
    const bare = monthBalance(gametophyteBody(traits()), wet, damp, atm, 900);
    const waxy = monthBalance(gametophyteBody(traits({ cuticle: 0.8 })), wet, damp, atm, 900);
    expect(bare.hydration).toBe(1);
    expect(waxy.carbonPerArea).toBeLessThan(bare.carbonPerArea);
  });

  it('keeps tissue hydrated and alive as the ground dries', () => {
    const bare = monthBalance(gametophyteBody(traits()), climate, dry, atm, 900);
    const waxy = monthBalance(gametophyteBody(traits({ cuticle: 0.7 })), climate, dry, atm, 900);
    expect(waxy.hydration).toBeGreaterThan(bare.hydration + 0.5);
    expect(waxy.survival).toBeGreaterThan(bare.survival + 0.5);
  });
});

describe('stomata', () => {
  it('do little without a cuticle, but restore photosynthesis behind one', () => {
    const run = (cuticle: number, stomata: number) =>
      monthBalance(sporophyteBody(traits({ cuticle, stomata }), 0.05), climate, damp, atm, 900);
    const noCuticle = run(0.02, 0.02);
    const noCuticleStomata = run(0.02, 0.8);
    expect(noCuticleStomata.hydration).toBeCloseTo(noCuticle.hydration, 1);

    const lowCo2 = { co2: 800, o2: 200 };
    const sealed = monthBalance(
      sporophyteBody(traits({ cuticle: 0.8, stomata: 0.02 }), 0.05),
      climate,
      damp,
      lowCo2,
      900,
    );
    const sealedWithPores = monthBalance(
      sporophyteBody(traits({ cuticle: 0.8, stomata: 0.8 }), 0.05),
      climate,
      damp,
      lowCo2,
      900,
    );
    expect(sealedWithPores.hydration).toBeGreaterThan(0.99);
    expect(sealedWithPores.carbonPerArea).toBeGreaterThan(1.5 * sealed.carbonPerArea);
  });
});

describe('water transport', () => {
  it('keeps a tall sporophyte hydrated on dry ground only with vascular tissue and rooting', () => {
    const tall = { cuticle: 0.7, stomata: 0.7, stature: 0.9 };
    const without = monthBalance(sporophyteBody(traits(tall), 0.5), climate, dry, atm, 900);
    const withTransport = monthBalance(
      sporophyteBody(traits({ ...tall, vascular: 0.9, rooting: 0.8 }), 0.5),
      climate,
      dry,
      atm,
      900,
    );
    expect(without.hydration).toBeLessThan(0.8);
    expect(withTransport.hydration).toBeGreaterThan(0.99);
  });

  it('makes vascular sporophytes taller', () => {
    const short = sporophyteBody(traits({ stature: 0.9, vascular: 0.02 }), 1);
    const tall = sporophyteBody(traits({ stature: 0.9, vascular: 0.9 }), 1);
    expect(short.height).toBeLessThan(0.04);
    expect(tall.height).toBeGreaterThan(0.1);
  });
});

describe('desiccation tolerance', () => {
  it('raises survival of drying but lowers photosynthesis', () => {
    const sensitive = monthBalance(gametophyteBody(traits()), climate, dry, atm, 900);
    const tolerant = monthBalance(
      gametophyteBody(traits({ desiccationTolerance: 0.9 })),
      climate,
      dry,
      atm,
      900,
    );
    expect(tolerant.survival).toBeGreaterThan(0.8);
    expect(sensitive.survival).toBeLessThan(0.2);
    expect(tolerant.assimilation).toBeLessThan(sensitive.assimilation);
  });
});

describe('growth', () => {
  it('saturates as the canopy shades itself', () => {
    const body = gametophyteBody(traits());
    const wet: SiteMonth = { depth: 0, surfaceWet: 1, waterTableDepth: 0.05, soilMoisture: 1 };
    const balance = monthBalance(body, climate, wet, atm, 900);
    let biomass = 0.001;
    const history: number[] = [];
    for (let m = 0; m < 24; m++) {
      biomass += biomassChange(body, balance, biomass, 0.01);
      history.push(biomass);
    }
    expect(history[3]).toBeGreaterThan(10 * 0.001);
    expect(Math.abs(history[23] - history[22]) / history[22]).toBeLessThan(0.01);
    expect(history[23]).toBeLessThan(20);
  });

  it('shrinks in darkness', () => {
    const body = gametophyteBody(traits());
    const balance = monthBalance(body, climate, damp, atm, 0);
    expect(biomassChange(body, balance, 1, 0.01)).toBeLessThan(0);
  });
});
