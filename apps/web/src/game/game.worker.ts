// Owns the running game so the simulation never blocks the UI.
import { Game, MONTHS, TRAIT_COUNT } from '@plant-evo/sim';
import type { GameMessage, GameRequest, GameView, MapView } from './protocol.ts';

const scope = self as unknown as {
  postMessage(message: GameMessage): void;
  onmessage: ((event: MessageEvent<GameRequest>) => void) | null;
};

let game: Game | null = null;

function post(message: GameMessage): void {
  scope.postMessage(message);
}

function mapView(g: Game): MapView {
  const world = g.world;
  const landscape = world.landscape;
  const env = g.environment;
  const n = world.cells;
  const traits = new Float32Array(n * TRAIT_COUNT).fill(NaN);
  const scratch = new Float64Array(TRAIT_COUNT);
  const wetDepth = new Float32Array(n);
  for (let c = 0; c < n; c++) {
    let depth = 0;
    for (let m = 0; m < MONTHS; m++) depth = Math.max(depth, env.depth[c * MONTHS + m]);
    wetDepth[c] = depth;
    if (world.occupied[c] === 0) continue;
    world.inheritedTraits(c, scratch);
    traits.set(scratch, c * TRAIT_COUNT);
  }
  return {
    width: landscape.width,
    height: landscape.height,
    cellSize: landscape.cellSize,
    zone: env.zone.slice(),
    elevation: Float32Array.from(landscape.elevation),
    wetDepth,
    occupied: world.occupied.slice(),
    reproduced: world.lastReproduced.slice(),
    sporophyteHeight: Float32Array.from(world.sMaxHeight),
    traits,
  };
}

function view(g: Game): GameView {
  const last = g.reports[g.reports.length - 1];
  const recent = last?.series.slice(-10) ?? [];
  const height = recent.reduce((s, p) => s + p.sporophyteHeight, 0) / (recent.length || 1);
  let aquatic = 0;
  let total = 0;
  for (let c = 0; c < g.world.cells; c++) {
    if (g.world.occupied[c] === 0) continue;
    total++;
    if (g.environment.zone[c] <= 1) aquatic++;
  }
  return {
    scenarioId: g.scenario.id,
    title: g.scenario.title,
    subtitle: g.scenario.subtitle,
    intro: g.scenario.intro,
    seed: g.seed,
    pure: g.pure,
    phase: g.phase,
    epochIndex: g.epochIndex,
    epochs: g.scenario.epochs.map((e) => ({
      ma: e.ma,
      period: e.period,
      title: e.title,
      description: e.description,
      fossilRecord: e.fossilRecord ?? null,
      co2: e.environment.co2,
      o2: e.environment.o2,
      tempC: e.environment.meanTempC,
    })),
    generationsPerEpoch: g.scenario.generationsPerEpoch,
    offers: g.phase === 'draft' ? g.offers : [],
    natureChoice: g.pure && g.phase === 'draft' ? g.natureChoice() : null,
    goals: g.goalStatuses().map((s) => ({
      id: s.goal.id,
      title: s.goal.title,
      description: s.goal.description,
      realHistory: s.goal.realHistory,
      progress: s.achievedIn !== null ? 1 : Math.max(0, Math.min(1, s.progress)),
      achievedIn: s.achievedIn,
    })),
    traitMeans: g.traitMeans(),
    sporophyteHeight: height,
    aquatic: total > 0 && aquatic / total > 0.6,
    reports: g.reports,
    map: mapView(g),
  };
}

scope.onmessage = (event: MessageEvent<GameRequest>) => {
  const request = event.data;
  try {
    switch (request.type) {
      case 'new':
        game = Game.create(request.scenario, request.seed, { pure: request.pure });
        break;
      case 'load':
        game = Game.restore(request.snapshot);
        break;
      case 'run': {
        if (game === null) throw new Error('No game in progress');
        let reported = 0;
        game.runEpoch(request.choice, (fraction) => {
          if (fraction - reported >= 0.02 || fraction === 1) {
            reported = fraction;
            post({ type: 'progress', fraction });
          }
        });
        break;
      }
      case 'save':
        if (game === null) throw new Error('No game in progress');
        post({ type: 'snapshot', snapshot: game.snapshot() });
        return;
    }
    post({ type: 'state', view: view(game) });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
