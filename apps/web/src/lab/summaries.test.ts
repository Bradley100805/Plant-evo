import { describe, expect, it } from 'vitest';
import { outcomeOf, summarize, trajectoriesFrom, valueAt } from './summaries.ts';

const table = {
  columns: ['replicate', 'generation', 'frequency'],
  rows: [
    [0, 0, 0.5],
    [0, 1, 1],
    [1, 0, 0.5],
    [1, 1, 0.25],
    [1, 2, 0],
    [2, 0, 0.5],
    [2, 1, 0.5],
    [2, 2, 0.75],
  ],
};

describe('trajectoriesFrom', () => {
  it('groups rows by replicate in generation order', () => {
    expect(trajectoriesFrom(table)).toEqual([
      { replicate: 0, values: [0.5, 1] },
      { replicate: 1, values: [0.5, 0.25, 0] },
      { replicate: 2, values: [0.5, 0.5, 0.75] },
    ]);
  });

  it('rejects tables without the needed columns', () => {
    expect(() => trajectoriesFrom({ columns: ['a'], rows: [] })).toThrow();
  });
});

describe('summarize', () => {
  it('holds ended trajectories at their final value', () => {
    const [first] = trajectoriesFrom(table);
    expect(valueAt(first, 5)).toBe(1);
    const summary = summarize(trajectoriesFrom(table));
    expect(summary).toHaveLength(3);
    expect(summary[2]).toEqual({
      generation: 2,
      meanFrequency: (1 + 0 + 0.75) / 3,
      meanDiversity: (2 * 0.75 * 0.25) / 3,
      fixed: 1,
      lost: 1,
      segregating: 1,
    });
  });

  it('classifies outcomes by the final frequency', () => {
    expect(trajectoriesFrom(table).map(outcomeOf)).toEqual(['fixed', 'lost', 'segregating']);
  });
});
