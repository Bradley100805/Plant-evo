import { describe, expect, it } from 'vitest';
import { Rng } from '../rng/index.ts';
import { AlleleTable, NO_PARENT } from './alleles.ts';
import { AliasSampler } from './sampling.ts';

describe('AlleleTable', () => {
  it('records value, locus, parent and origin, growing as needed', () => {
    const table = new AlleleTable(2);
    const root = table.add(0, 3, NO_PARENT, 0);
    const child = table.add(0.5, 3, root, 7);
    const other = table.add(-1, 4, NO_PARENT, 9);
    expect(table.count).toBe(3);
    expect([
      table.value(child),
      table.locus(child),
      table.parent(child),
      table.origin(child),
    ]).toEqual([0.5, 3, root, 7]);
    expect(table.parent(other)).toBe(NO_PARENT);
  });

  it('flags an allele and all of its descendants', () => {
    const table = new AlleleTable();
    const a = table.add(0, 0, NO_PARENT, 0); // 0
    const b = table.add(1, 0, a, 1); // 1
    const c = table.add(2, 0, b, 2); // 2
    const d = table.add(3, 0, a, 2); // 3
    const e = table.add(4, 0, NO_PARENT, 2); // 4
    expect(Array.from(table.descendantMask(b))).toEqual([0, 1, 1, 0, 0]);
    expect(Array.from(table.descendantMask(a))).toEqual([1, 1, 1, 1, 0]);
    expect(table.descendantMask(e)[e]).toBe(1);
    expect(c + d).toBe(5);
  });

  it('compacts away dead alleles but keeps ancestors of live ones', () => {
    const table = new AlleleTable();
    const root = table.add(0, 0, NO_PARENT, 0); // 0
    table.add(9, 0, root, 1); // 1: dead leaf
    const mid = table.add(1, 0, root, 1); // 2: dead, but ancestor of 3
    const leaf = table.add(2, 0, mid, 2); // 3: live
    const live = new Uint8Array(table.count);
    live[leaf] = 1;
    const remap = table.compact(live);
    expect(Array.from(remap)).toEqual([0, -1, 1, 2]);
    expect(table.count).toBe(3);
    expect(table.value(remap[leaf])).toBe(2);
    expect(table.parent(remap[leaf])).toBe(remap[mid]);
    expect(table.parent(remap[mid])).toBe(remap[root]);
  });
});

describe('AliasSampler', () => {
  it('draws indices in proportion to their weights', () => {
    const weights = new Float64Array([1, 0, 3, 6]);
    const sampler = new AliasSampler(2);
    expect(sampler.build(weights)).toBe(10);
    const rng = new Rng('alias');
    const n = 100_000;
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) counts[sampler.sample(rng)]++;
    expect(counts[1]).toBe(0);
    let chiSquare = 0;
    weights.forEach((w, i) => {
      if (w === 0) return;
      const expected = (n * w) / 10;
      chiSquare += (counts[i] - expected) ** 2 / expected;
    });
    // 2 degrees of freedom: P(chi2 > 13.8) = 0.001.
    expect(chiSquare).toBeLessThan(13.8);
  });

  it('reports a zero total and rejects invalid weights', () => {
    const sampler = new AliasSampler(3);
    expect(sampler.build(new Float64Array([0, 0, 0]))).toBe(0);
    expect(() => sampler.build(new Float64Array([1, -1]))).toThrow(RangeError);
    expect(() => sampler.build(new Float64Array([1, NaN]))).toThrow(RangeError);
  });
});
