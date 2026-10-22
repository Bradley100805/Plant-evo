import type { TraitId } from '@plant-evo/sim';

export type Confidence = 'Established' | 'Well supported' | 'Hypothesis';

export interface CodexEntry {
  id: string;
  title: string;
  kind: 'trait' | 'concept' | 'model';
  body: string[];
  confidence: Confidence;
  sources: string[];
}

/** Codex entries. Claims follow docs/science; confidence labels use the Science Bible's scale. */
export const CODEX: CodexEntry[] = [
  {
    id: 'desiccationTolerance',
    title: 'Desiccation tolerance',
    kind: 'trait',
    body: [
      'Some algae, mosses and liverworts can dry out completely and revive when wetted. They protect their membranes and proteins with sugars and protective proteins, then repair any damage on rehydration.',
      'Tolerance is costly. Desiccation-tolerant organisms are mostly small or slow-growing, which suggests a trade-off between tolerance and growth. In the game, tolerance lowers photosynthetic capacity by up to 30%.',
    ],
    confidence: 'Well supported',
    sources: [
      'Alpert, P. (2006). Constraints of tolerance: why are desiccation-tolerant organisms so small or rare? J. Exp. Biol. 209: 1575–1584.',
    ],
  },
  {
    id: 'cuticle',
    title: 'The cuticle',
    kind: 'trait',
    body: [
      'A waxy layer of cutin and waxes that slows water loss from plant surfaces.',
      'It blocks carbon dioxide even more than water. Measurements on leaves found CO₂ crosses the cuticle at only about 6% of the rate water vapour does. A cuticle on its own therefore trades photosynthesis for staying hydrated.',
      'Under water a cuticle only gets in the way, which is why aquatic plants have thin ones.',
      'Bryophyte gametophytes have much thinner cuticles than sporophytes. In the game, cuticle genes act at half strength in the gametophyte.',
    ],
    confidence: 'Established',
    sources: [
      'Boyer, J. S., Wong, S. C. & Farquhar, G. D. (1997). CO₂ and water vapor exchange across leaf cuticle (epidermis) at various water potentials. Plant Physiol. 114: 185–191.',
      'Kerstiens, G. (1996). Cuticular water permeability and its physiological significance. J. Exp. Bot. 47: 1813–1832.',
    ],
  },
  {
    id: 'stomata',
    title: 'Stomata',
    kind: 'trait',
    body: [
      'Pores in the surface that open to let CO₂ in and close when water runs short. They only make sense behind a cuticle: on a wet, unsealed surface, closing a pore changes nothing.',
      'In the game, stomata open only as far as the plant’s water supply allows. Together with a cuticle and water transport, they let a plant stay hydrated in dry air (homoiohydry).',
      'With CO₂ several times today’s level, enough CO₂ diffuses through a cuticle that stomata add little. Their advantage grows as CO₂ falls. What the first stomata were for is still debated.',
    ],
    confidence: 'Well supported',
    sources: [
      'Edwards, D., Kerp, H. & Hass, H. (1998). Stomata in early land plants. J. Exp. Bot. 49: 255–278.',
    ],
  },
  {
    id: 'sporeWall',
    title: 'Sporopollenin spore walls',
    kind: 'trait',
    body: [
      'Sporopollenin is one of the toughest biological polymers known. Walled spores survive drying, ultraviolet light and travel through air, and they fossilise well. That is why the earliest evidence of land plants is spores (cryptospores about 473–471 million years old).',
      'Some algal relatives of land plants put similar resistant material around their zygotes, which suggests the ability was borrowed from an older life stage.',
    ],
    confidence: 'Established',
    sources: [
      'Rubinstein, C. V. et al. (2010). Early Middle Ordovician evidence for land plants in Argentina. New Phytol. 188: 365–369.',
    ],
  },
  {
    id: 'sporophyte',
    title: 'The sporophyte: an embryo of its own',
    kind: 'trait',
    body: [
      'In the algae closest to land plants, the zygote is the only diploid cell, and it divides by meiosis straight away. Land plants delay that meiosis: the zygote first grows, nourished by its parent, into a multicellular sporophyte. This is the embryo that gives embryophytes their name.',
      'One explanation (the antithetic theory) is that this multiplies the spores made from each fertilisation. On land, where sperm must swim through a film of water, fertilisation is rare, so that matters.',
    ],
    confidence: 'Well supported',
    sources: [
      'Haig, D. (2008). Homologous versus antithetic alternation of generations and the origin of sporophytes. Bot. Rev. 74: 395–418.',
    ],
  },
  {
    id: 'stature',
    title: 'Standing up',
    kind: 'trait',
    body: [
      'Upright axes lift sporangia out of the still air near the ground, so more spores escape the parent’s own patch. They also overtop shorter neighbours and shade them.',
      'Tall tissue loses touch with wet ground, so without a way to pipe water up it dries out. Upright growth pays off together with water-conducting tissue.',
      'Cooksonia, the oldest widely accepted vascular-plant fossil (about 430 million years ago), was only a few centimetres tall.',
    ],
    confidence: 'Well supported',
    sources: [
      'Niklas, K. J. (1997). The Evolutionary Biology of Plants. University of Chicago Press.',
    ],
  },
  {
    id: 'vascular',
    title: 'Water-conducting tissue',
    kind: 'trait',
    body: [
      'Tracheids are dead, hollow cells with walls stiffened by lignin. They carry water up from the ground and also hold the plant up.',
      'Lignin and the spore wall’s sporopollenin both come from phenylpropanoid metabolism. In the game, a gene in that pathway affects vascular tissue, spore walls and upright growth together.',
    ],
    confidence: 'Established',
    sources: [
      'Weng, J.-K. & Chapple, C. (2010). The origin and evolution of lignin biosynthesis. New Phytol. 187: 273–285.',
      'Kenrick, P. & Crane, P. R. (1997). The origin and early evolution of plants on land. Nature 389: 33–39.',
    ],
  },
  {
    id: 'rooting',
    title: 'Rhizoids and rooting axes',
    kind: 'trait',
    body: [
      'Early land plants anchored themselves with hair-like rhizoids. Later, creeping rhizomes grew rooting axes that reached water deeper in the soil. True roots evolved independently in at least two lineages during the Devonian.',
      'Carbon spent below ground does not photosynthesise, so rooting pays only where surface water is scarce.',
    ],
    confidence: 'Well supported',
    sources: [
      'Hetherington, A. J. & Dolan, L. (2018). Stepwise and independent origins of roots among land plants. Nature 561: 235–238.',
    ],
  },
  {
    id: 'branching',
    title: 'Branching',
    kind: 'trait',
    body: [
      'Early sporophytes forked repeatedly (dichotomous branching), and each tip carried a sporangium. A branched sporophyte makes many sporangia from one fertilisation. Mosses and liverworts never branch their sporophytes.',
    ],
    confidence: 'Established',
    sources: ['Kenrick, P. & Crane, P. R. (1997). Nature 389: 33–39.'],
  },
  {
    id: 'asexual',
    title: 'Asexual propagules',
    kind: 'trait',
    body: [
      'Fragments and gemmae clone the parent cheaply and quickly. Without a protective wall they only survive in water or on wet ground, so they cannot carry a lineage across dry land.',
    ],
    confidence: 'Established',
    sources: [],
  },
  {
    id: 'selection',
    title: 'Natural selection',
    kind: 'concept',
    body: [
      'Individuals carrying some variants survive, get fertilised and leave more spores than others in their particular place and time. Those variants become more common. Nothing in the game computes a "fitness score": what spreads is whatever leaves more descendants in the simulated world.',
      'Whether a trait helps depends on context. A cuticle that saves a plant on dry ground starves it under water.',
    ],
    confidence: 'Established',
    sources: [],
  },
  {
    id: 'drift',
    title: 'Genetic drift: why most new mutations are lost',
    kind: 'concept',
    body: [
      'A new mutation starts in a single individual. Whether that one individual happens to survive and reproduce depends far more on luck than on a small advantage. Theory predicts that even a beneficial mutation is usually lost: its chance of spreading is only about twice its advantage (Haldane 1927; Kimura 1962).',
      'That is why each mutation you pick arises several separate times during an epoch. Usually most copies vanish and, with luck and a real advantage, one spreads.',
    ],
    confidence: 'Established',
    sources: [
      'Kimura, M. (1962). On the probability of fixation of mutant genes in a population. Genetics 47: 713–719.',
    ],
  },
  {
    id: 'alternation',
    title: 'Alternation of generations',
    kind: 'concept',
    body: [
      'Every land plant alternates between a haploid gametophyte (one set of chromosomes), which makes eggs and sperm, and a diploid sporophyte (two sets), which makes spores by meiosis.',
      'In mosses and liverworts the gametophyte is the main plant and the sporophyte stays attached to it. In vascular plants the sporophyte became the large, independent plant.',
      'In the game, traits of the gametophyte come from its single genome copy, and traits of the sporophyte from both copies.',
    ],
    confidence: 'Established',
    sources: [],
  },
  {
    id: 'homoiohydry',
    title: 'Poikilohydry and homoiohydry',
    kind: 'concept',
    body: [
      'Poikilohydric plants, like most mosses, take on whatever water status their surroundings have: they dry out in dry air and revive when wet.',
      'Homoiohydric plants hold their water status steady: a cuticle seals them, stomata regulate gas exchange, and vascular tissue resupplies water from the soil. That lets them keep photosynthesising in dry air, but each part has a cost.',
    ],
    confidence: 'Established',
    sources: [
      'Raven, J. A. (2002). Selection pressures on stomatal evolution. New Phytol. 153: 371–386.',
    ],
  },
  {
    id: 'draft',
    title: 'What your choice means',
    kind: 'model',
    body: [
      'Mutations are random. Nature does not supply the variants a plant "needs". The Mutation Draft shows a few random mutations that arose in your lineage, and you choose which one this story follows. You cannot see whether it will help. Selection and chance decide that in the simulation.',
      'Drafted mutations are major-effect changes, such as a regulatory gene switched on in a new tissue. They are rarer in nature than the small-effect mutations that also arise in the background every generation.',
    ],
    confidence: 'Well supported',
    sources: ['Plant-evo design: ADR 0004 (Mutation Draft).'],
  },
  {
    id: 'time',
    title: 'Compressed time',
    kind: 'model',
    body: [
      'Each epoch stands for about five million years but simulates 100 generations of one pond margin. The shape of evolution (which variants spread, in which places, and why) comes from the simulation. Its speed does not: real change took far more generations.',
      'Climate, CO₂ and oxygen follow published reconstructions, but those reconstructions are uncertain for this early time. The game uses values within published ranges.',
    ],
    confidence: 'Well supported',
    sources: ['Plant-evo Science Bible, chapter 07 (early Earth environments).'],
  },
  {
    id: 'model',
    title: 'How the simulation works',
    kind: 'model',
    body: [
      'Every cell of the map holds at most one plant with a real genome. Each simulated month, each plant photosynthesises (the Farquhar–von Caemmerer–Berry model), gains or loses water through its surfaces, and may die of drought or starvation.',
      'In the wet season, gametophytes can be fertilised through a film of water. Sporophytes grow and release spores, which disperse and compete for free space. Perennials keep their place.',
      'Every equation and parameter, with its source, is listed in the Science Bible on GitHub.',
    ],
    confidence: 'Well supported',
    sources: [
      'Farquhar, G. D., von Caemmerer, S. & Berry, J. A. (1980). Planta 149: 78–90.',
      'Bernacchi, C. J. et al. (2001). Plant Cell Environ. 24: 253–259.',
    ],
  },
];

export function codexEntry(id: string): CodexEntry | undefined {
  return CODEX.find((e) => e.id === id);
}

export const TRAIT_CODEX: Record<TraitId, string> = {
  desiccationTolerance: 'desiccationTolerance',
  cuticle: 'cuticle',
  stomata: 'stomata',
  sporeWall: 'sporeWall',
  sporophyte: 'sporophyte',
  stature: 'stature',
  vascular: 'vascular',
  rooting: 'rooting',
  branching: 'branching',
  asexual: 'asexual',
};
