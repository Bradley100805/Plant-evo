import type { TraitId } from '../plant/traits.ts';
import type { EnvironmentSpec, LandscapeOptions } from '../world/landscape.ts';

export interface Epoch {
  /** Age at the start of the epoch, millions of years ago. */
  ma: number;
  /** Geological period and stage. */
  period: string;
  title: string;
  /** What is happening on Earth, shown when the epoch starts. */
  description: string;
  environment: EnvironmentSpec;
  /** What the fossil record shows around this time (for comparison with the player's history). */
  fossilRecord?: string;
}

export type GoalMetric =
  | { kind: 'zoneReproduction'; zone: number; fraction: number }
  | { kind: 'traitMean'; trait: TraitId; value: number }
  | { kind: 'sporophyteHeight'; metres: number }
  | { kind: 'zoneHeight'; zone: number; metres: number }
  | { kind: 'survive'; epoch: number };

export interface Goal {
  id: string;
  title: string;
  description: string;
  metric: GoalMetric;
  /** What real plants did, for the end-of-chapter comparison. */
  realHistory: string;
}

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  intro: string[];
  landscape: Partial<LandscapeOptions>;
  ancestral: Record<TraitId, number>;
  /** Background mutation: rate per locus per genome copy per generation, and effect size SD. */
  mutationRate: number;
  mutationSd: number;
  generationsPerEpoch: number;
  /** Years run before the first epoch so the population settles and gains standing variation. */
  burnIn: number;
  /** Where founders start (zone indices). */
  startZones: number[];
  epochs: Epoch[];
  goals: Goal[];
  draft: DraftSettings;
}

export interface DraftSettings {
  /** Variants offered each epoch. */
  offers: number;
  /** Mean and SD of the magnitude of a drafted variant's effect (liability units per copy). */
  effectMean: number;
  effectSd: number;
  /** How many independent times the chosen mutation arises during an epoch. */
  origins: number;
  /** Fraction of the epoch over which the origins are spread. */
  originWindow: number;
  /** Relative chance of offering a module (master regulator) gene versus a single-trait gene. */
  moduleWeight: number;
}
