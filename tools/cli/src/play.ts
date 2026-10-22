import { type ExperimentResult, Game, type ProgressFn, Rng, TRAIT_IDS } from '@plant-evo/sim';

export const STRATEGIES = ['planned', 'random', 'pure', 'none'] as const;
export type Strategy = (typeof STRATEGIES)[number];

/** Traits in the order a player who knows the history of land plants would pursue them. */
const PLAN: [trait: (typeof TRAIT_IDS)[number], target: number][] = [
  ['desiccationTolerance', 0.6],
  ['sporophyte', 0.6],
  ['sporeWall', 0.5],
  ['cuticle', 0.4],
  ['vascular', 0.5],
  ['stature', 0.5],
  ['rooting', 0.4],
  ['stomata', 0.3],
  ['branching', 0.3],
];

/** Chooses an offer for the current epoch according to a scripted strategy. */
export function chooseOffer(game: Game, strategy: Strategy, rng: Rng): number | null {
  switch (strategy) {
    case 'none':
    case 'pure':
      return null;
    case 'random':
      return game.offers.length > 0 ? rng.int(game.offers.length) : null;
    case 'planned': {
      const means = game.traitMeans();
      for (const [trait, target] of PLAN) {
        if (means[TRAIT_IDS.indexOf(trait)] >= target) continue;
        const offer = game.offers.find((o) =>
          o.effects.some((e) => e.trait === trait && e.to > e.from),
        );
        if (offer !== undefined) return offer.index;
      }
      return null;
    }
  }
}

/** Plays a whole chapter headlessly and tabulates each epoch. */
export function playChapter(
  scenario: string,
  seed: string,
  strategy: Strategy,
  onProgress?: ProgressFn,
): ExperimentResult {
  const game = Game.create(scenario, seed, { pure: strategy === 'pure' });
  const rng = new Rng(`${seed}/strategy`);
  const rows: number[][] = [];
  const epochs = game.scenario.epochs.length;
  while (game.phase === 'draft') {
    const report = game.runEpoch(chooseOffer(game, strategy, rng));
    const last = report.series[report.series.length - 1];
    rows.push([
      report.epochIndex,
      report.ma,
      report.chosen === null ? -1 : report.chosen.locus,
      report.chosen === null ? 0 : report.chosen.delta,
      report.variantFrequency,
      last?.population ?? 0,
      ...report.zones.map((z) => z.reproduced),
      last?.sporophyteHeight ?? 0,
      ...report.traitEnd,
      report.goalsAchieved.length,
    ]);
    onProgress?.(rows.length / epochs);
  }
  const achieved = Object.keys(game.achieved).length;
  return {
    table: {
      columns: [
        'epoch',
        'ma',
        'chosen_locus',
        'chosen_delta',
        'variant_frequency',
        'population',
        ...['water', 'shallows', 'margin', 'damp', 'dry'].map((z) => `reproduced_${z}`),
        'sporophyte_height_m',
        ...TRAIT_IDS.map((t) => `trait_${t}`),
        'goals_achieved',
      ],
      rows,
    },
    summary: {
      epochs: rows.length,
      goals_achieved: achieved,
      goals_total: game.scenario.goals.length,
      extinct: game.phase === 'extinct' ? 1 : 0,
    },
  };
}
