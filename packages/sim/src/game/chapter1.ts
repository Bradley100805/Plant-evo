/**
 * Chapter 1, "Leaving the Water": Middle Ordovician to Early Devonian (470–405 Ma).
 * Environmental values: docs/science/07-early-earth-environments.md. Fossil dates:
 * docs/science/02-innovations-timeline.md.
 */
import type { EnvironmentSpec } from '../world/landscape.ts';
import type { Epoch, Scenario } from './scenario.ts';

const base: EnvironmentSpec = {
  co2: 3000,
  o2: 14,
  meanTempC: 25,
  tempSeasonality: 2,
  par: 1000,
  rainWet: [0.35, 0.05],
  vpd: [0.7, 1.8],
  soilMoisture: [0.6, 0.1],
  lakeLevel: 0,
  lakeSeasonality: 0.25,
};

function env(changes: Partial<EnvironmentSpec>): EnvironmentSpec {
  return { ...base, ...changes };
}

const epochs: Epoch[] = [
  {
    ma: 470,
    period: 'Middle Ordovician (Dapingian)',
    title: 'A bare land',
    description:
      'The seas are filling with life, but the land is bare rock, mud and microbial crusts. Your lineage is a freshwater green alga in a shallow pond: haploid for nearly all of its life, its only diploid cell is the zygote, which divides by meiosis straight away.',
    environment: env({}),
    fossilRecord:
      'The oldest spores of land plants (cryptospores), from Argentina, are about 473–471 million years old.',
  },
  {
    ma: 465,
    period: 'Middle Ordovician (Darriwilian)',
    title: 'Spores in the wind',
    description:
      'Carbon dioxide is several times today’s level, so CO₂ is plentiful for anything that can reach the air. The cost is water: anything out of the pond dries in hours.',
    environment: env({ co2: 3000, o2: 14 }),
    fossilRecord:
      'Cryptospores appear on several continents by the late Middle Ordovician (about 463–461 million years ago).',
  },
  {
    ma: 460,
    period: 'Late Ordovician (Sandbian)',
    title: 'Life at the margin',
    description:
      'The pond rises and falls with the seasons. Its margins are flooded for part of the year and exposed to the dry season for the rest.',
    environment: env({ co2: 2900, o2: 15, meanTempC: 24 }),
  },
  {
    ma: 455,
    period: 'Late Ordovician (Katian)',
    title: 'Cooling',
    description: 'Global climate begins to cool as carbon dioxide slowly falls.',
    environment: env({ co2: 2700, o2: 15, meanTempC: 23 }),
  },
  {
    ma: 450,
    period: 'Late Ordovician (Katian)',
    title: 'Ice in the south',
    description:
      'Ice begins to build up on Gondwana near the South Pole. Your pond is far from the ice, but the climate is changing.',
    environment: env({ co2: 2500, o2: 15, meanTempC: 22 }),
  },
  {
    ma: 445,
    period: 'Late Ordovician (Hirnantian)',
    title: 'The Hirnantian glaciation',
    description:
      'Ice sheets spread across Gondwana and sea level falls by tens of metres. Seas cool sharply and one of the largest mass extinctions in Earth’s history strikes marine life. At your pond the air is cooler and drier, rain is scarcer and the water stands lower.',
    environment: env({
      co2: 2000,
      o2: 15,
      meanTempC: 17,
      rainWet: [0.25, 0.03],
      vpd: [0.6, 1.4],
      soilMoisture: [0.45, 0.06],
      lakeLevel: -0.2,
    }),
    fossilRecord:
      'The Late Ordovician mass extinction (about 445–443 million years ago) removed a large share of marine species. Spores show land plants came through it.',
  },
  {
    ma: 440,
    period: 'Early Silurian (Llandovery)',
    title: 'The thaw',
    description: 'The ice melts, seas rise and warmth returns.',
    environment: env({ co2: 2400, o2: 16, meanTempC: 22 }),
  },
  {
    ma: 435,
    period: 'Early Silurian (Llandovery)',
    title: 'Greening shores',
    description:
      'Shores and wet lowlands are increasingly covered in low plants and crusts, and land-plant spores are common in the fossil record.',
    environment: env({ co2: 2400, o2: 16, meanTempC: 23 }),
  },
  {
    ma: 430,
    period: 'Middle Silurian (Wenlock)',
    title: 'Standing up',
    description:
      'Upright sporophytes lift their spores into the wind. Holding tissue up in dry air needs a way to pipe water to it.',
    environment: env({ co2: 2300, o2: 17, meanTempC: 24 }),
    fossilRecord:
      'Cooksonia, the oldest widely accepted vascular-plant macrofossil (about 430 million years ago), was a few centimetres tall: leafless forking stems tipped with sporangia. The earliest charcoal, from about the same time, means oxygen had reached at least ~16%.',
  },
  {
    ma: 425,
    period: 'Late Silurian (Ludlow)',
    title: 'Pores and pipes',
    description:
      'Carbon dioxide keeps falling. Plants that seal their surfaces against water loss must open pores to let it in.',
    environment: env({ co2: 2200, o2: 18, meanTempC: 25 }),
  },
  {
    ma: 420,
    period: 'Late Silurian (Pridoli)',
    title: 'Low green patches',
    description: 'Wet lowlands carry ankle-high patches of small vascular plants.',
    environment: env({ co2: 2100, o2: 18, meanTempC: 25 }),
    fossilRecord: 'Fossil cuticles with stomata are known from the Silurian.',
  },
  {
    ma: 415,
    period: 'Early Devonian (Lochkovian)',
    title: 'Spreading inland',
    description: 'Vascular plants with roots of a kind begin to spread away from permanent water.',
    environment: env({ co2: 2000, o2: 19, meanTempC: 25 }),
  },
  {
    ma: 410,
    period: 'Early Devonian (Pragian)',
    title: 'The Rhynie world',
    description:
      'The last epoch of this chapter. Can your lineage hold the dry ground before the Devonian forests begin?',
    environment: env({ co2: 1900, o2: 19, meanTempC: 25 }),
    fossilRecord:
      'The Rhynie chert (about 407–411 million years old) preserves a whole early land ecosystem: plants with stomata, water-conducting cells and creeping rhizomes, living with arbuscular mycorrhizal fungi. Wood first appears in small plants 407–397 million years ago.',
  },
];

export const LEAVING_THE_WATER: Scenario = {
  id: 'leaving-the-water',
  title: 'Leaving the Water',
  subtitle: 'Chapter 1 · Middle Ordovician to Early Devonian, 470–405 million years ago',
  intro: [
    'You follow a lineage of freshwater green algae living in a shallow pond. Its relatives will one day become every land plant on Earth, but nothing about that is certain.',
    'You cannot design your plant. At the start of each epoch, a few random mutations appear. You choose which one to follow, and then natural selection and chance decide whether it spreads.',
    'Each epoch simulates 100 generations of a living population. The real epochs lasted millions of years, so time is compressed and mutations arise more often than in nature.',
  ],
  landscape: {},
  ancestral: {
    desiccationTolerance: 0.2,
    cuticle: 0.03,
    stomata: 0.02,
    sporeWall: 0.3,
    sporophyte: 0.02,
    stature: 0.04,
    vascular: 0.03,
    rooting: 0.05,
    branching: 0.03,
    asexual: 0.6,
  },
  mutationRate: 3e-4,
  mutationSd: 0.12,
  generationsPerEpoch: 100,
  burnIn: 40,
  startZones: [0, 1],
  epochs,
  draft: {
    offers: 4,
    effectMean: 1.5,
    effectSd: 0.4,
    origins: 6,
    originWindow: 0.6,
    moduleWeight: 3,
  },
  goals: [
    {
      id: 'shore',
      title: 'Out of the water',
      description: 'Plants reproduce in at least a quarter of the damp ground above the waterline.',
      metric: { kind: 'zoneReproduction', zone: 3, fraction: 0.25 },
      realHistory:
        'Land-plant spores appear about 473–471 million years ago, so plants were living on land by then.',
    },
    {
      id: 'embryo',
      title: 'A generation of its own',
      description: 'The zygote grows into a multicellular sporophyte (trait at least 0.5).',
      metric: { kind: 'traitMean', trait: 'sporophyte', value: 0.5 },
      realHistory:
        'Every land plant has a multicellular sporophyte that starts as an embryo on its gametophyte. Their closest algal relatives do not.',
    },
    {
      id: 'stomata',
      title: 'Pores that close',
      description: 'Sporophytes carry working stomata (trait at least 0.3).',
      metric: { kind: 'traitMean', trait: 'stomata', value: 0.3 },
      realHistory: 'Stomata are found on fossil cuticles from the Silurian onwards.',
    },
    {
      id: 'upright',
      title: 'Standing up',
      description: 'Across the whole population, sporophytes reach an average height of 2 cm.',
      metric: { kind: 'sporophyteHeight', metres: 0.02 },
      realHistory:
        'Cooksonia sporophytes, a few centimetres tall, lived about 430 million years ago.',
    },
    {
      id: 'dryland',
      title: 'Conquer dry ground',
      description: 'On the dry ground, sporophytes stand at least 3 cm tall on average.',
      metric: { kind: 'zoneHeight', zone: 4, metres: 0.03 },
      realHistory:
        'By the Early Devonian, vascular plants with cuticles, stomata and rooting rhizomes had spread well away from permanent water.',
    },
    {
      id: 'glaciation',
      title: 'Survive the ice age',
      description: 'Your lineage is still alive after the Hirnantian glaciation.',
      metric: { kind: 'survive', epoch: 5 },
      realHistory:
        'Land plants came through the Late Ordovician glaciation and mass extinction: their spores continue unbroken into the Silurian.',
    },
  ],
};

export const SCENARIOS: Record<string, Scenario> = {
  [LEAVING_THE_WATER.id]: LEAVING_THE_WATER,
};
