import type { DriftOptions, ExperimentResult, SweepOptions } from '@plant-evo/sim';

/** Experiments the Lab can ask the simulation worker to run. */
export type ExperimentRequest =
  { kind: 'drift'; options: DriftOptions } | { kind: 'sweep'; options: SweepOptions };

export type WorkerMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'result'; result: ExperimentResult; elapsedMs: number }
  | { type: 'error'; message: string };
