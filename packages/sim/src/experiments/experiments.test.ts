import { describe, expect, it } from 'vitest';
import { tableToCsv } from './csv.ts';
import {
  driftExperiment,
  mutationSelectionExperiment,
  sweepExperiment,
  truncationExperiment,
} from './experiments.ts';

describe('experiments', () => {
  it('drift: one row per replicate-generation, ending fixed, lost or segregating', () => {
    const progress: number[] = [];
    const result = driftExperiment(
      { seed: 'x', size: 20, ploidy: 2, generations: 50, replicates: 4, p0: 0.5 },
      (f) => progress.push(f),
    );
    expect(result.table.columns).toEqual([
      'replicate',
      'generation',
      'frequency',
      'gene_diversity',
    ]);
    expect(result.table.rows).toHaveLength(4 * 51);
    expect(result.table.rows[0]).toEqual([0, 0, 0.5, 0.5]);
    const { fixed, lost, segregating } = result.summary;
    expect(fixed + lost + segregating).toBe(4);
    expect(progress.at(-1)).toBe(1);
  });

  it('sweep: follows a single introduced mutant to fixation or loss', () => {
    const result = sweepExperiment({
      seed: 'y',
      size: 50,
      ploidy: 2,
      s: 0.1,
      h: 0.5,
      replicates: 30,
      maxGenerations: 2000,
    });
    expect(result.table.rows[0]).toEqual([0, 0, 0.01]);
    expect(result.summary.unresolved).toBe(0);
    expect(result.summary.expected_fixation_probability).toBeGreaterThan(0.01);
  });

  it('is reproducible from its seed', () => {
    const run = () =>
      sweepExperiment({
        seed: 7,
        size: 30,
        ploidy: 1,
        s: 0.05,
        h: 0.5,
        replicates: 5,
        maxGenerations: 500,
      });
    expect(run()).toEqual(run());
  });

  it('mutation-selection: deleterious alleles accumulate from zero', () => {
    const result = mutationSelectionExperiment({
      seed: 'z',
      size: 200,
      loci: 5,
      mu: 0.01,
      s: 0.2,
      h: 0.5,
      generations: 50,
    });
    expect(result.table.rows).toHaveLength(50);
    expect(result.summary.mean_q_second_half).toBeGreaterThan(0);
    expect(result.summary.expected_q).toBeCloseTo(0.1, 12);
  });

  it('truncation: selecting the top fraction raises the mean', () => {
    const result = truncationExperiment({
      seed: 'w',
      size: 500,
      loci: 20,
      effect: 0.1,
      environmentalVariance: 0.2,
      fraction: 0.2,
      generations: 5,
    });
    expect(result.table.rows).toHaveLength(5);
    expect(result.summary.total_response).toBeGreaterThan(0.5);
  });
});

describe('tableToCsv', () => {
  it('writes a header, rows, and empty fields for NaN', () => {
    expect(
      tableToCsv({
        columns: ['a', 'b,c'],
        rows: [
          [1, 0.5],
          [2, NaN],
        ],
      }),
    ).toBe('a,"b,c"\n1,0.5\n2,\n');
  });
});
