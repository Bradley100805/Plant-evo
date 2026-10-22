import { describe, expect, it } from 'vitest';
import { createArchitecture, MODULES, T, type TraitId } from '../plant/traits.ts';
import { buildEnvironment, type EnvironmentSpec, Landscape, ZONES } from './landscape.ts';
import { sporeDormancySurvival, World } from './world.ts';

const ancestral: Record<TraitId, number> = {
  desiccationTolerance: 0.2,
  cuticle: 0.03,
  stomata: 0.01,
  sporeWall: 0.3,
  sporophyte: 0.02,
  stature: 0.02,
  vascular: 0.01,
  rooting: 0.05,
  branching: 0.02,
  asexual: 0.6,
};

const ordovician: EnvironmentSpec = {
  co2: 2800,
  o2: 16,
  meanTempC: 24,
  tempSeasonality: 2,
  par: 1000,
  rainWet: [0.35, 0.05],
  vpd: [0.7, 1.8],
  soilMoisture: [0.6, 0.1],
  lakeLevel: 0,
  lakeSeasonality: 0.25,
};

function makeWorld(
  seed: string,
  options: Partial<ConstructorParameters<typeof Landscape>[0]> = {},
) {
  const landscape = new Landscape({ width: 24, height: 12, shoreColumn: 8, ...options });
  return new World({ landscape, ancestral, mutationRate: 3e-4, mutationSd: 0.12, seed });
}

describe('landscape', () => {
  it('rises from open water to dry ground', () => {
    const landscape = new Landscape();
    const env = buildEnvironment(landscape, ordovician);
    const counts = ZONES.map((_, z) => env.zone.filter((v) => v === z).length);
    counts.forEach((n) => expect(n).toBeGreaterThan(0));
    expect(env.zone[0]).toBe(0);
    expect(env.zone[landscape.width - 1]).toBe(4);
    // The lake is higher in the wet season than in the dry season.
    const shore = 14;
    expect(env.depth[shore * 12 + 2]).toBeGreaterThanOrEqual(env.depth[shore * 12 + 8]);
  });
});

describe('world', () => {
  it('is reproducible from its seed and from a snapshot', () => {
    const run = (world: World, years: number) => {
      const env = buildEnvironment(world.landscape, ordovician);
      const out: number[] = [];
      for (let y = 0; y < years; y++) out.push(world.stepYear(env).population);
      return out;
    };
    const a = makeWorld('repro');
    const b = makeWorld('repro');
    const env = buildEnvironment(a.landscape, ordovician);
    a.seed((c) => env.zone[c] <= 1);
    b.seed((c) => env.zone[c] <= 1);
    expect(run(a, 10)).toEqual(run(b, 10));

    const saved = a.snapshot();
    const continued = run(a, 5);
    const restored = World.restore(saved, a.landscape);
    expect(run(restored, 5)).toEqual(continued);
  });

  it('keeps the ancestral alga in the water and loses it on dry ground', () => {
    const world = makeWorld('alga');
    const env = buildEnvironment(world.landscape, ordovician);
    world.seed((c) => env.zone[c] <= 1);
    let report = world.stepYear(env);
    for (let y = 0; y < 30; y++) report = world.stepYear(env);
    const [water, , , , dryGround] = report.zones;
    expect(water.reproduced / water.cells).toBeGreaterThan(0.5);
    expect(dryGround.reproduced).toBe(0);
  });

  it('cannot fertilise without surface water', () => {
    const world = makeWorld('dry', { slope: 0, relief: 0 });
    const parched: EnvironmentSpec = {
      ...ordovician,
      rainWet: [0, 0],
      lakeLevel: -2,
      lakeSeasonality: 0,
      soilMoisture: [0, 0],
    };
    const env = buildEnvironment(world.landscape, parched);
    world.seed(() => true);
    const report = world.stepYear(env);
    expect(report.zones.reduce((n, z) => n + z.fertilised, 0)).toBe(0);
  });

  it('counts carriers of pinned lineages at every pinned locus', () => {
    const world = makeWorld('pins');
    world.seed(() => true);
    const loci = world.arch.lociPerTrait;
    world.pin('a', world.introduceVariant(T.cuticle * loci, 1, 40));
    world.pin('b', world.introduceVariant(T.stomata * loci, 1, 40));
    const a = world.carrierFrequency(['a']);
    const b = world.carrierFrequency(['b']);
    const both = world.carrierFrequency(['a', 'b']);
    expect(both).toBeGreaterThan(Math.max(a, b));
    expect(both).toBeLessThanOrEqual(a + b + 1e-12);
  });

  it('keeps a custom genome architecture through a snapshot', () => {
    const landscape = new Landscape({ width: 24, height: 12, shoreColumn: 8 });
    const modules = [{ id: 'test', label: 'Test module', loadings: { stature: 0.9 } }];
    const arch = createArchitecture(3, modules);
    const world = new World({
      landscape,
      ancestral,
      mutationRate: 3e-4,
      mutationSd: 0.12,
      seed: 'arch',
      arch,
    });
    world.seed(() => true);
    world.introduceVariant(arch.loci - 1, 2, 100);
    const restored = World.restore(world.snapshot(), landscape);
    expect(restored.arch.loci).toBe(arch.loci);
    expect(restored.arch.modules).toEqual(modules);
    expect(restored.arch.modules).not.toEqual(MODULES);
    const traits = new Float64Array(10);
    const restoredTraits = new Float64Array(10);
    for (let c = 0; c < world.cells; c++) {
      world.inheritedTraits(c, traits);
      restored.inheritedTraits(c, restoredTraits);
      expect(Array.from(restoredTraits)).toEqual(Array.from(traits));
    }
  });

  it('spore walls improve dry-season survival', () => {
    expect(sporeDormancySurvival(0.9)).toBeGreaterThan(5 * sporeDormancySurvival(0.2));
  });
});

describe('emergent selection on the cuticle (Phase 2 exit check)', () => {
  /** Mean change in frequency of a cuticle variant over 40 years, over several seeds. */
  function cuticleChange(spec: EnvironmentSpec): number {
    let change = 0;
    const seeds = ['a', 'b', 'c', 'd', 'e'];
    for (const seed of seeds) {
      const world = makeWorld(`cuticle-${seed}`, { slope: 0, relief: 0 });
      const env = buildEnvironment(world.landscape, spec);
      world.seed(() => true);
      const id = world.introduceVariant(T.cuticle * world.arch.lociPerTrait, 1.5, 60);
      world.pin('cuticle', id);
      // Desiccation tolerance lets the founders persist on damp ground in both settings.
      const dt = world.introduceVariant(T.desiccationTolerance * world.arch.lociPerTrait, 1.5, 288);
      world.pin('dt', dt);
      const start = world.carrierFrequency(['cuticle']);
      for (let y = 0; y < 40; y++) world.stepYear(env);
      change += world.carrierFrequency(['cuticle']) - start;
    }
    return change / seeds.length;
  }

  it('spreads where the ground dries and declines where it is permanently under water', () => {
    const drying: EnvironmentSpec = { ...ordovician, lakeLevel: -0.25, lakeSeasonality: 0.1 };
    const flooded: EnvironmentSpec = { ...ordovician, lakeLevel: 0.6, lakeSeasonality: 0 };
    expect(cuticleChange(drying)).toBeGreaterThan(0.1);
    expect(cuticleChange(flooded)).toBeLessThan(0);
  });
});
