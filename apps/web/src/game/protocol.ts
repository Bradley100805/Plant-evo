import type { EpochReport, GameSnapshot, Phase, VariantOffer } from '@plant-evo/sim';

/** Requests from the UI to the game worker. */
export type GameRequest =
  | { type: 'new'; scenario: string; seed: string; pure: boolean }
  | { type: 'run'; choice: number | null }
  | { type: 'load'; snapshot: GameSnapshot }
  | { type: 'save' };

export interface EpochView {
  ma: number;
  period: string;
  title: string;
  description: string;
  fossilRecord: string | null;
  co2: number;
  o2: number;
  tempC: number;
}

export interface GoalView {
  id: string;
  title: string;
  description: string;
  realHistory: string;
  progress: number;
  achievedIn: number | null;
}

/** Per-cell data for the landscape map. Typed arrays are copied to the UI. */
export interface MapView {
  width: number;
  height: number;
  cellSize: number;
  zone: Uint8Array;
  /** Elevation relative to the mean lake level, m. */
  elevation: Float32Array;
  /** Lake depth in the wettest month (0 if emergent), m. */
  wetDepth: Float32Array;
  occupied: Uint8Array;
  reproduced: Uint8Array;
  /** Tallest sporophyte height reached last year, m. */
  sporophyteHeight: Float32Array;
  /** Inherited trait values of each occupant, cell * traitCount + trait (NaN if empty). */
  traits: Float32Array;
}

export interface GameView {
  scenarioId: string;
  title: string;
  subtitle: string;
  intro: string[];
  seed: string;
  pure: boolean;
  phase: Phase;
  epochIndex: number;
  epochs: EpochView[];
  generationsPerEpoch: number;
  offers: VariantOffer[];
  natureChoice: number | null;
  goals: GoalView[];
  traitMeans: number[];
  /** Mean sporophyte height over the last years of the latest epoch, m. */
  sporophyteHeight: number;
  /** Most of the population lives under water (draw the aquatic form). */
  aquatic: boolean;
  reports: EpochReport[];
  map: MapView;
}

/** Messages from the game worker to the UI. */
export type GameMessage =
  | { type: 'state'; view: GameView }
  | { type: 'progress'; fraction: number }
  | { type: 'snapshot'; snapshot: GameSnapshot }
  | { type: 'error'; message: string };
