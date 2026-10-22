import { describe, expect, it } from 'vitest';
import { LEAVING_THE_WATER, SCENARIOS } from './chapter1.ts';
import { Game } from './game.ts';
import type { Scenario } from './scenario.ts';

/** A small, fast version of chapter 1 for tests: two short epochs on a small landscape. */
const QUICK: Scenario = {
  ...LEAVING_THE_WATER,
  id: 'quick-test',
  landscape: { width: 20, height: 8, shoreColumn: 6 },
  generationsPerEpoch: 12,
  burnIn: 5,
  epochs: LEAVING_THE_WATER.epochs.slice(0, 2),
  draft: { ...LEAVING_THE_WATER.draft, origins: 3 },
};
SCENARIOS[QUICK.id] = QUICK;

describe('Game', () => {
  it('starts in the draft phase with distinct, deterministic offers', () => {
    const a = Game.create(QUICK.id, 'seed-1');
    const b = Game.create(QUICK.id, 'seed-1');
    expect(a.phase).toBe('draft');
    expect(a.offers).toHaveLength(QUICK.draft.offers);
    expect(a.offers).toEqual(b.offers);
    const genes = new Set(a.offers.map((o) => o.gene.replace(/ \d+$/, '')));
    expect(genes.size).toBe(a.offers.length);
    for (const offer of a.offers) {
      expect(offer.effects.length).toBeGreaterThan(0);
      for (const e of offer.effects) {
        expect(e.from).toBeGreaterThan(0);
        expect(e.to).toBeLessThan(1);
        expect(Math.sign(e.to - e.from)).toBe(Math.sign(offer.delta));
      }
    }
  });

  it('runs epochs, introduces the chosen mutation several times, and completes', () => {
    const game = Game.create(QUICK.id, 'seed-2');
    const progress: number[] = [];
    const first = game.runEpoch(0, (f) => progress.push(f));
    expect(first.series).toHaveLength(QUICK.generationsPerEpoch);
    expect(first.origins).toBe(QUICK.draft.origins);
    expect(first.chosen?.gene).toBeDefined();
    expect(['lost', 'rare', 'spreading', 'fixed']).toContain(first.fate);
    expect(first.zones).toHaveLength(5);
    expect(progress.at(-1)).toBe(1);
    expect(game.epochIndex).toBe(1);

    const second = game.runEpoch(null);
    expect(second.fate).toBe('none');
    expect(second.origins).toBe(0);
    expect(game.phase).toBe('complete');
    expect(() => game.runEpoch(null)).toThrow();
  });

  it('continues identically after a save and load', () => {
    const game = Game.create(QUICK.id, 'seed-3');
    game.runEpoch(1);
    const saved = JSON.parse(JSON.stringify(game.snapshot(), replacer), reviver);
    const continued = game.runEpoch(2);
    const restored = Game.restore(saved);
    expect(restored.offers).toEqual(saved.offers);
    const replayed = restored.runEpoch(2);
    expect(replayed.series.map((p) => p.population)).toEqual(
      continued.series.map((p) => p.population),
    );
    expect(replayed.variantFrequency).toBe(continued.variantFrequency);
  });

  it('lets nature choose in Pure mode', () => {
    const game = Game.create(QUICK.id, 'seed-4', { pure: true });
    const expected = game.natureChoice();
    const report = game.runEpoch(0);
    expect(report.chosen?.index ?? null).toBe(expected);
  });

  it('reports progress for every goal and records achievements once', () => {
    const game = Game.create(QUICK.id, 'seed-5');
    game.runEpoch(0);
    const statuses = game.goalStatuses();
    expect(statuses.map((s) => s.goal.id)).toEqual(QUICK.goals.map((g) => g.id));
    for (const s of statuses) expect(s.progress).toBeGreaterThanOrEqual(0);
    for (const [id, epoch] of Object.entries(game.achieved)) {
      expect(statuses.find((s) => s.goal.id === id)?.achievedIn).toBe(epoch);
    }
  });
});

/** JSON round trip for snapshots with typed arrays (as a save file would do). */
function replacer(_key: string, value: unknown) {
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return { __typed: value.constructor.name, data: Array.from(value as unknown as number[]) };
  }
  return value;
}

function reviver(_key: string, value: unknown) {
  if (value !== null && typeof value === 'object' && '__typed' in value) {
    const { __typed, data } = value as { __typed: string; data: number[] };
    const ctor = { Float64Array, Int32Array, Uint32Array, Uint8Array, Int8Array }[__typed];
    if (ctor !== undefined) return ctor.from(data);
  }
  return value;
}
