import type { Table } from '@plant-evo/sim';

/** One replicate's allele frequency by generation (index = generation). */
export interface Trajectory {
  replicate: number;
  values: number[];
}

/** Splits a tidy `replicate, generation, frequency, ...` table into per-replicate series. */
export function trajectoriesFrom(table: Table, valueColumn = 'frequency'): Trajectory[] {
  const rIdx = table.columns.indexOf('replicate');
  const gIdx = table.columns.indexOf('generation');
  const vIdx = table.columns.indexOf(valueColumn);
  if (rIdx < 0 || gIdx < 0 || vIdx < 0) {
    throw new Error(`Table needs replicate, generation and ${valueColumn} columns`);
  }
  const byReplicate = new Map<number, number[]>();
  for (const row of table.rows) {
    let values = byReplicate.get(row[rIdx]);
    if (values === undefined) {
      values = [];
      byReplicate.set(row[rIdx], values);
    }
    values[row[gIdx]] = row[vIdx];
  }
  return [...byReplicate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([replicate, values]) => ({ replicate, values }));
}

/** Frequency at `generation`, holding the last value once a trajectory has ended. */
export function valueAt(trajectory: Trajectory, generation: number): number {
  const { values } = trajectory;
  return values[Math.min(generation, values.length - 1)];
}

export interface GenerationSummary {
  generation: number;
  meanFrequency: number;
  /** Mean gene diversity 2p(1 − p) across replicates. */
  meanDiversity: number;
  fixed: number;
  lost: number;
  segregating: number;
}

/** Per-generation summary across replicates, from generation 0 to the longest trajectory. */
export function summarize(trajectories: readonly Trajectory[]): GenerationSummary[] {
  const last = Math.max(0, ...trajectories.map((t) => t.values.length - 1));
  const summaries: GenerationSummary[] = [];
  for (let g = 0; g <= last; g++) {
    let sum = 0;
    let diversity = 0;
    let fixed = 0;
    let lost = 0;
    for (const t of trajectories) {
      const p = valueAt(t, g);
      sum += p;
      diversity += 2 * p * (1 - p);
      if (p === 1) fixed++;
      else if (p === 0) lost++;
    }
    const n = trajectories.length;
    summaries.push({
      generation: g,
      meanFrequency: n > 0 ? sum / n : NaN,
      meanDiversity: n > 0 ? diversity / n : NaN,
      fixed,
      lost,
      segregating: n - fixed - lost,
    });
  }
  return summaries;
}

export type Outcome = 'fixed' | 'lost' | 'segregating';

export function outcomeOf(trajectory: Trajectory): Outcome {
  const final = trajectory.values[trajectory.values.length - 1];
  return final === 1 ? 'fixed' : final === 0 ? 'lost' : 'segregating';
}
