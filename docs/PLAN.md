# Plant-evo: Development Plan

A step-by-step plan for building **Plant-evo**, a scientifically grounded game about
the evolution of land plants. Players follow lineages from freshwater algae to modern
grasslands. Outcomes come from simulated physiology, ecology, and population genetics,
not from a scripted tech tree.

> Status: planning document (v0). Dates, figures, and citations here are a starting point.
> Verify each one when writing the Science Bible in Phase 0.

---

## Contents

1. [Vision and design pillars](#1-vision-and-design-pillars)
2. [Learning goals](#2-learning-goals)
3. [The core design problem: agency vs. undirected evolution](#3-the-core-design-problem-agency-vs-undirected-evolution)
4. [Scientific model](#4-scientific-model)
5. [Key innovations catalog](#5-key-innovations-catalog)
6. [Game design](#6-game-design)
7. [Technical architecture](#7-technical-architecture)
8. [Scientific validation and testing](#8-scientific-validation-and-testing)
9. [Phased roadmap](#9-phased-roadmap)
10. [Risks and mitigations](#10-risks-and-mitigations)
11. [Open decisions](#11-open-decisions)
12. [Starter reference list](#12-starter-reference-list)
13. [Immediate next steps](#13-immediate-next-steps)

---

## 1. Vision and design pillars

**One-line pitch:** *You don't design a plant. You set up the conditions, pick which
random variants to follow, and watch selection decide across 500 million years.*

### Pillars

1. **Variation is random, selection is not.** The player never buys a trait. Variants
   come from a genetic model, and fitness comes from simulated life cycles.
2. **Every number has a source.** Each parameter, curve, and date links to a citation
   in the Science Bible. When something is simplified, the game says so.
3. **Fitness is measured, not computed.** There is no hand-tuned `fitness = ...`
   formula. Fitness is how many offspring individuals actually leave after growing,
   competing, and reproducing.
4. **Show the mechanism.** Every outcome can be traced to a physiological reason,
   such as "died of desiccation" or "shaded out by taller neighbours".
5. **Deep time is the antagonist.** Climate, CO₂, O₂, continents, and mass extinctions
   follow real Earth history. Plants also push back on them (for example, CO₂ drawdown
   from weathering).
6. **Emergence over scripting.** Convergent evolution (C4 photosynthesis, wood, seeds,
   succulence) should happen because the model allows it, not because a script says so.

---

## 2. Learning goals

The design and the scientific review both measure against these goals:

| # | Players should come away understanding that... |
|---|------------------------------------------------|
| 1 | Mutations are random with respect to need, and selection is the non-random part. |
| 2 | Fitness depends on context. Every trait has costs and trade-offs. |
| 3 | Genetic drift matters, especially in small populations. Most new beneficial mutations are still lost. |
| 4 | Key innovations open new ecological opportunity, which leads to adaptive radiations. |
| 5 | Plants and the planet co-evolve (CO₂, O₂, soils, fire, climate). |
| 6 | We reconstruct evolutionary history from incomplete evidence (fossils, phylogenies). |

---

## 3. The core design problem: agency vs. undirected evolution

Evolution games often teach the wrong lesson. They let players pick traits, as if
organisms evolved toward goals. Plant-evo needs player agency without that teleology.

### Recommended model: three modes with different kinds of agency

| Mode | What the player controls | What stays emergent |
|------|--------------------------|---------------------|
| **Lineage (campaign)** | A **Mutation Draft**: each epoch the simulation generates a few random heritable variants of the focal lineage, and the player picks which one to introduce. The player also chooses which daughter species to follow after a split. | Whether the variant spreads (selection and drift), all competitors, and the environment. |
| **Planet (sandbox)** | The environment: CO₂, temperature, continents, catastrophes, and time speed. | All evolution. Mutations arise at a set rate with no player picks. |
| **Experiment** | Hypotheses: environment settings, starting populations, number of replicates. | All results. The game reports statistics across replicates. |

#### How the Mutation Draft stays honest

- Variants are drawn from the genotype-to-phenotype model using realistic
  effect-size distributions. Most are neutral or mildly harmful, and many are pleiotropic
  (for example, "+12% cuticle thickness, −4% CO₂ conductance").
- The player sees the **trait change** but never a fitness score. They have to reason
  from physiology.
- The chosen variant enters at low frequency (a single mutant or a small founder group).
  Its fixation probability follows population-genetics theory (about 2s for a beneficial
  allele in a large population), so good picks are often lost to drift. That loss is a
  core lesson, not a bug.
- The codex states the framing plainly: the player is choosing which of the mutations
  that *did* arise we follow. The player is not giving the plant foresight.
- A **Pure mode** switch removes the draft entirely. Mutations then arise at rate μ,
  which suits classrooms.

---

## 4. Scientific model

The simulation has layers. Each layer is a separate module in the sim core with its
own tests and its own Science Bible chapter.

```
 Earth history data (CO₂, O₂, T, geography, events)
            │
            ▼
 ┌─────────────────────┐   feedback (weathering, fire, soil)
 │  Environment layer  │◄──────────────────────────────┐
 └─────────┬───────────┘                               │
           ▼                                           │
 ┌─────────────────────┐   ┌─────────────────────┐     │
 │ Genome → development│──►│ Morphology (L-sys)  │     │
 │ → phenotype         │   └─────────┬───────────┘     │
 └─────────┬───────────┘             ▼                 │
           ▼               ┌─────────────────────┐     │
 ┌─────────────────────┐   │ Physiology: light,  │     │
 │ Life cycle &        │◄──│ carbon, water,      │     │
 │ reproduction        │   │ nutrients, mechanics│     │
 └─────────┬───────────┘   └─────────────────────┘     │
           ▼                                           │
 ┌─────────────────────┐                               │
 │ Population genetics │  (individual-based, spatial)  │
 │ + spatial ecology   │───────────────────────────────┘
 └─────────┬───────────┘
           ▼  selection gradients, G-matrix, range
 ┌─────────────────────┐
 │ Macroevolution:     │  species, speciation, extinction,
 │ phylogeny           │  phylogeny, fossil record
 └─────────────────────┘
```

### 4.1 Genome and genotype-to-phenotype map

- **Quantitative loci:** additive allele effects on continuous traits such as cuticle
  thickness, stomatal density, lignification, root:shoot ratio, leaf mass per area,
  branching angle, and internode length.
- **Developmental modules:** loci map to modules through a pleiotropy matrix. Changing
  one module shifts several traits, which creates real trade-offs and genetic
  covariance (the G-matrix).
- **Discrete developmental capacities** (an innovations bitset): vascular cambium,
  heterospory, integument, carpel, Kranz anatomy, and so on. Each one can only arise
  by mutation once its developmental prerequisites exist. This works like a
  morphospace with constraints, not a points-based tech tree. A prerequisite makes an
  innovation possible. It does not make it valuable.
- **Ploidy:** haploid and diploid phases, plus whole-genome duplication events.

```ts
// Sketch only
interface Genome {
  alleles: Float32Array;     // [locus * ploidy] additive effects
  capacities: Uint32Array;   // bitset of discrete developmental capacities
  ploidy: number;            // 1, 2, 4, ...
}

interface Phenotype {
  cuticle: number; stomatalDensity: number; lignin: number;
  rootShoot: number; lma: number; heightMax: number;
  pathway: 'C3' | 'C4' | 'CAM';
  lifeCycle: { sporophyteDominance: number; heterospory: number; seed: boolean };
  morphology: MorphParams;   // feeds the L-system
}
```

### 4.2 Development and morphology

- **Parametric L-systems** (Prusinkiewicz & Lindenmayer) generate plant form from
  genome parameters: dichotomous vs. monopodial branching, branching angle, internode
  length, phyllotaxis, and leaf type.
- **Precedent:** Karl Niklas ran computer simulations of early vascular plant
  morphology, optimizing branching forms for light interception, mechanical support,
  and reproduction. That work is direct scientific grounding for this layer.
- Geometry feeds back into physiology, through light interception and mechanical
  load. Results are computed once per phenotype and cached.

### 4.3 Physiology (per individual, per time step)

| Process | Model (simplified where noted) |
|---------|--------------------------------|
| Light interception | Beer-Lambert canopy attenuation, `I = I₀·e^(−k·LAI)` (Monsi & Saeki), with taller neighbours shading shorter ones |
| C3 photosynthesis | Farquhar, von Caemmerer & Berry (FvCB): `A = min(Wc, Wj) − Rd`, with temperature dependence |
| C4 photosynthesis | Collatz et al. (1992) simplified C4 model |
| CAM | Simplified night-time CO₂ uptake with a large cut in water loss and a growth-rate penalty |
| Stomatal conductance | Medlyn et al. (2011) optimal stomatal model |
| Water balance | Soil water bucket, transpiration from conductance and VPD, hydraulic conductance, and xylem cavitation from a vulnerability curve (P50) |
| Desiccation | Poikilohydric strategy (tolerate drying, as in bryophyte-grade plants) vs. homoiohydric strategy (cuticle, stomata, and vasculature keep water status stable) |
| Carbon budget | Gross photosynthesis − maintenance respiration − construction costs, then allocation to leaf, stem, root, and reproduction |
| Mechanics | Critical buckling height `H ∝ (E/ρ)^(1/3)·D^(2/3)` (Greenhill/McMahon) |
| Hydraulic height limit | Gravity and path-length resistance, with an upper bound near the ~120–130 m tree-height limit (Koch et al. 2004) |
| Nutrients | N and P uptake scaled by root mass and mycorrhizal status |
| Leaf economics | Trade-offs bounded by the leaf economics spectrum (Wright et al. 2004) |
| Temperature stress | Frost and heat damage thresholds, plus dormancy and deciduousness responses |

### 4.4 Life cycle and reproduction

- **Alternation of generations:** a haploid gametophyte and a diploid sporophyte, with
  relative dominance as an evolvable trait.
- **Fertilization constraints:** swimming sperm need a film of water. That constraint
  only relaxes with pollen and seeds.
- **Propagules:** spores, then heterospory, then seeds. Each has its own dispersal
  kernel, dormancy, and provisioning trade-offs.
- **Mating system:** outcrossing vs. selfing rate, with inbreeding depression.
- **Pollination:** wind first, animal-mediated in later eras (see 4.6).

### 4.5 Population genetics

- Individual-based simulation with finite populations, so drift emerges naturally.
- Mutation, recombination (free or linked loci), selection (emergent from the life
  cycle), and gene flow through spore, pollen, and seed dispersal.
- **Polyploidy:** whole-genome duplication gives instant partial reproductive isolation
  (the triploid block) and new genetic material. This matters a great deal in plants.
  Polyploidy accompanies a substantial share of plant speciation events (Wood et al.
  2009).
- **Hybridization** between lineages that are close enough.
- **Speciation:** Dobzhansky-Muller incompatibilities accumulate between isolated
  populations (the "snowball" effect, Orr 1995). A split is recorded once gene flow
  stays near zero and incompatibilities pass a threshold.

### 4.6 Ecology (spatial)

- **Landscape:** a grid of patches with gradients in elevation, water table, soil depth
  and nutrients, and salinity.
- **Competition:** asymmetric competition for light in vertical canopy layers, and
  competition for water and nutrients below ground.
- **Dispersal and establishment:** dispersal kernels, then an establishment lottery
  among propagules that land in open sites.
- **Biotic interactions,** abstracted as guilds with era-appropriate pressure:
  herbivores, pollinators (coevolving), mycorrhizal fungi (a mutualism with a carbon
  cost), and pathogens.
- **Fire:** ignition and spread depend on fuel load, moisture, and atmospheric O₂.
  Fires hardly spread at low O₂ and spread much more at high O₂ (Belcher & McElwain
  2008).

### 4.7 Environment and Earth history

Global time series from about 500 Ma to the present, interpolated and versioned in
the data package:

| Variable | Candidate sources |
|----------|-------------------|
| Atmospheric CO₂ | Foster, Royer & Lunt (2017) proxy compilation; GEOCARBSULF (Berner 2006) |
| Atmospheric O₂ | GEOCARBSULF / COPSE-family models |
| Global temperature | Judd et al. (2024) Phanerozoic temperature curve |
| Paleogeography | GPlates and open plate models (check licenses before use) |
| Sea level, glaciations | Published compilations, to be chosen in Phase 0 |
| Mass extinctions | Late Devonian, end-Permian, end-Triassic, K-Pg, plus the Carboniferous rainforest collapse |

- **Local climate per patch:** a latitudinal temperature gradient, precipitation bands
  from simplified circulation (Hadley cells, a rough approximation), and seasonality.
- **Feedback (switchable):** plant-driven silicate weathering draws down CO₂, in the
  style of GEOCARB. With it on, the player's plants change the planet. A *Data-locked*
  setting forces the historical curve instead.

### 4.8 Macroevolution and phylogeny

- A **species** is represented by a trait mean vector, a G-matrix, a geographic range,
  and abundance.
- **Trait change across deep-time jumps** uses the multivariate breeder's equation
  (Lande 1979), `Δz̄ = G·β`, plus drift variance. Both G and β are estimated from the
  micro-simulation.
- **Origination and extinction** follow a birth-death process. Rates depend on fitness
  in the current environment, range size, fragmentation, and generation time.
- **Phylogeny:** a time-calibrated tree of all lineages, including AI-driven rival
  clades that follow the same rules.
- **Fossil record:** a taphonomic filter decides which lineages get preserved. Woody,
  lowland, swamp-dwelling plants preserve well, while small upland herbs rarely do.
  Players see a *gappy* fossil record next to the true tree.

### 4.9 Bridging timescales (the hardest modelling problem)

Real evolution runs over billions of generations. No browser can simulate that, so the
game uses **two linked tiers**:

1. **Micro tier (ecological time):** for each focal epoch, run an individual-based
   simulation for roughly 100–500 generations on a representative landscape. Measure
   selection gradients, G, population sizes, and range dynamics.
2. **Macro tier (deep time):** jump about 1–10 Myr. Advance trait means with the
   breeder's equation, apply birth-death speciation and extinction, then update the
   environment from data and feedbacks.
3. **Compression is disclosed.** The codex explains that mutation supply and generation
   counts are compressed, and what that does and does not imply.

---

## 5. Key innovations catalog

The first content backlog. Every row needs a developmental basis, physiology hooks,
a codex entry with citations, and a validation scenario (see §8). Dates are approximate
and must be verified in Phase 0.

| Innovation | Approx. first appearance | In-game prerequisites | Benefit | Cost / trade-off |
|------------|--------------------------|-----------------------|---------|------------------|
| Sporopollenin-walled spores | ~470 Ma (Mid-Ordovician cryptospores) | — | Spores survive drying and air dispersal | Wall construction cost |
| Waxy cuticle | Ordovician–Silurian | — | Less water loss, UV protection | Blocks gas exchange |
| Stomata | by ~420 Ma (Late Silurian) | Cuticle | Regulated gas exchange (homoiohydry) | Water lost when open |
| Branched, dominant sporophyte | Silurian | — | More sporangia per fertilization | Support and investment costs |
| Lignified conducting cells (tracheids) | ~430 Ma (Silurian) | Dominant sporophyte | Water transport, height | Lignin carbon cost, cavitation risk |
| Roots (≥2 independent origins) | Early–Mid Devonian | Vascular tissue | Anchorage, water and nutrient uptake | Below-ground carbon |
| Microphylls | Early Devonian (lycophytes) | Vascular tissue | More photosynthetic area | Limited size |
| Megaphylls | Mid–Late Devonian, spreading as CO₂ fell | Branching, vasculature, stomata | High light capture | Overheating at low stomatal density and high CO₂ (Beerling et al. 2001) |
| Wood (secondary growth) | ~400 Ma (Early Devonian) | Vascular cambium | Height, longevity, support | Slow, costly growth |
| Heterospory (many origins) | ~385 Ma (Mid Devonian) | — | Provisioned female gametophyte | Fewer megaspores |
| Seeds | ~365 Ma (Late Devonian) | Heterospory, retained megaspore, integument | Dormancy, provisioning, dispersal | High cost per propagule |
| Pollen | With early seeds | Seeds | Fertilization without free water | Large wind-pollen output |
| Flowers, carpels, double fertilization | Early Cretaceous (~130 Ma; earlier origin debated) | Seeds | Animal pollination, fast life cycles | Display and nectar cost |
| Fruits | Cretaceous | Carpels | Animal seed dispersal | Fruit tissue cost |
| Vessels | Mainly angiosperms (convergent in a few other groups) | Vascular tissue | High hydraulic conductance | Higher embolism risk |
| C4 photosynthesis (>60 origins) | ~30 Ma (Oligocene); grassland expansion late Miocene | Kranz-anatomy precursors | Efficient at low CO₂, high temperature, high light | Extra ATP cost, poor in cool climates |
| CAM (many origins) | Uncertain timing | Succulence | Extreme water-use efficiency | Slow growth |
| Mycorrhizal symbiosis | Likely early in land colonization (Rhynie chert, ~407 Ma) | — | P and water uptake | Carbon paid to the fungus |
| Deciduousness and dormancy | Multiple times | — | Survives cold or dry seasons | Leaf carbon lost each year |
| Polyploidy (WGD) | Recurrent | — | Reproductive isolation, raw genetic material | Meiotic problems, cell-size effects |

---

## 6. Game design

### 6.1 Core loop (Lineage mode)

```
┌─► 1. Environment update (epoch climate, events, feedbacks)
│   2. Mutation Draft: choose 1 of ~3 random variants (trait changes only)
│   3. Simulate ecological generations (fast-forward with live graphs)
│   4. Outcome report:
│        - allele frequency trajectory (did it fix, drift away, get selected out?)
│        - fitness decomposition: survival × fecundity × establishment
│        - causes of death (drought, shade, frost, herbivory, fire, buckling)
│        - range map, population size
│   5. Speciation? → choose which daughter lineage to follow
│   6. Deep-time jump: macro tier advances all clades, extinctions, radiations
└── 7. Repeat until the chapter goal is reached or the lineage goes extinct
```

### 6.2 Campaign chapters (tied to Earth history)

| # | Chapter | Era | Challenge | Innovations in play |
|---|---------|-----|-----------|---------------------|
| 1 | **Leaving the Water** | Ordovician | Desiccation and UV at pond margins | Spores, cuticle, desiccation tolerance, fungal partners |
| 2 | **Reaching Up** | Silurian–Early Devonian | Gas exchange vs. water loss; the Rhynie chert ecosystem | Stomata, tracheids, branched sporophyte |
| 3 | **First Forests** | Devonian | Light competition; falling CO₂; Late Devonian extinction | Roots, leaves, wood, heterospory, seeds |
| 4 | **Coal Swamps** | Carboniferous | High O₂ and wildfire; rainforest collapse as the climate dries | Seed plants vs. lycopsid trees |
| 5 | **The Great Dying** | Permian–Triassic | Aridity and the end-Permian extinction | Conifers, seed ferns, drought tolerance |
| 6 | **Giants and Grazers** | Jurassic | Pressure from large herbivores | Defenses, height, regrowth |
| 7 | **The Abominable Mystery** | Cretaceous | Pollinator coevolution and rapid radiation | Flowers, fruits, vessels, fast life cycles |
| 8 | **After the Impact** | K-Pg | Recovery after the "fern spike" | Opportunistic colonizers |
| 9 | **Grass and Fire** | Cenozoic | CO₂ decline, aridity, fire, ice ages | C4, CAM, deciduousness, grasses |

Each chapter is defined in data (environment script, starting lineages, goals, and codex
unlocks), so teachers and modders can author new ones.

### 6.3 Goals and progression

- **Goals are ecological, not trait checklists:** survive an extinction event, reach a
  given biomass share, colonize a biome, produce *N* descendant species.
- **Field Notes** (achievements) reward *observing* phenomena: a founder effect, a
  harmful allele fixed by drift, convergent evolution, an adaptive radiation after an
  extinction, an evolutionary trade-off.
- **Extinction is a teaching moment.** A post-mortem explains why the lineage died,
  and the player can continue with a surviving sister lineage.

### 6.4 Main screens

1. **World map:** patches and biomes, a range overlay, and a climate overlay.
2. **Plant inspector:** the rendered plant (L-system) with a live physiology readout:
   carbon budget, water status, and where each unit of carbon goes.
3. **Population genetics panel:** allele frequency trajectories, trait distributions,
   population size, and heterozygosity.
4. **Geologic timeline:** environmental curves (CO₂, O₂, temperature) with your position
   in time and upcoming events hidden or revealed depending on difficulty.
5. **Tree of life:** a time-calibrated phylogeny of your clade and rival clades, with a
   toggle between the true tree and the fossil-record-only view.
6. **Codex:** concept pages with citations and a confidence level for each claim:
   *Established*, *Well supported*, or *Hypothesis*.

### 6.5 Language style guide (anti-teleology)

- Never write "the plant wants/needs/tries to evolve X."
- Write "variants with X left more offspring because..."
- Show trade-offs next to benefits whenever a trait is described.

---

## 7. Technical architecture

### 7.1 Recommended stack (web-first)

The reasons for web-first: it runs on school Chromebooks, needs no install, and shares
easily. It can later be wrapped for desktop (Tauri) and published on Steam.

| Concern | Choice |
|---------|--------|
| Language | TypeScript (strict) |
| Build / monorepo | Vite, pnpm workspaces |
| UI | React, with Zustand for UI state |
| 2D world rendering | PixiJS (WebGL) |
| 3D plant inspector | Three.js (via react-three-fiber), added after 2D works |
| Charts | D3 or Observable Plot |
| Simulation runtime | Web Worker(s) via Comlink; the sim core is pure TypeScript with no DOM |
| Hot loops | Structure-of-arrays typed arrays; Rust/WASM **only** if profiling shows a need |
| Data validation | zod schemas for every dataset, chapter, and trait definition |
| Saves | IndexedDB with versioned schemas and migrations |
| Tests | Vitest, fast-check (property-based tests), Playwright (end-to-end) |
| CI / deploy | GitHub Actions: lint, typecheck, tests, statistical suite (nightly); GitHub Pages previews |
| Science analysis | Headless CLI that exports CSV, plus Jupyter notebooks for calibration plots |

**When to choose Godot or Unity instead:** pick an engine if high-fidelity 3D and a
console or Steam release matter more than classroom reach. The sim core design below
carries over either way.

### 7.2 Repository layout

```
plant-evo/
├─ apps/
│  └─ web/                 React app: screens, rendering, worker glue
├─ packages/
│  ├─ sim/                 Deterministic simulation core (no DOM)
│  │  ├─ rng/              Seeded, splittable PRNG streams
│  │  ├─ genetics/         Genome, mutation, recombination, ploidy
│  │  ├─ development/      Genotype → phenotype, capacities
│  │  ├─ physiology/       Light, photosynthesis, water, carbon, mechanics
│  │  ├─ lifecycle/        Alternation of generations, reproduction, dispersal
│  │  ├─ ecology/          Landscape, competition, biotic guilds, fire
│  │  ├─ environment/      Earth-history curves, local climate, feedbacks
│  │  └─ macro/            Species, birth-death, phylogeny, fossils
│  ├─ morph/               Genome → L-system → 2D/3D geometry
│  └─ data/                Datasets, trait catalog, chapters, citations (BibTeX)
├─ tools/
│  ├─ cli/                 Headless runner: scenarios, batch replicates, CSV export
│  └─ notebooks/           Calibration and validation analyses
└─ docs/
   ├─ PLAN.md              This document
   ├─ science/             Science Bible: one chapter per model layer
   └─ adr/                 Architecture decision records
```

### 7.3 Simulation step (micro tier, one growing season)

```ts
// Pseudocode
for (const ind of population) {
  const env   = climate(patch(ind), season, epoch);
  const light = canopyLight(ind, neighbours(ind));          // Beer–Lambert
  const A     = photosynthesis(ind.pheno, light, env);      // FvCB / C4 / CAM
  const water = waterBalance(ind, env);                     // gs, VPD, P50
  applyStress(ind, water, env);                             // desiccation, frost, heat
  ind.carbon += A - respiration(ind);
  allocate(ind);                                            // leaf/stem/root/repro
  hazards(ind, env);                                        // herbivory, fire, buckling
}
const propagules = reproduce(population);                   // mutation, recombination
disperse(propagules); establish(propagules, landscape);     // establishment lottery
```

### 7.4 Determinism and reproducibility

- **Seeded, splittable PRNG** (for example xoshiro128** or PCG) with an independent
  stream per subsystem, so adding a new subsystem doesn't shift existing results.
- No `Math.random`, no wall-clock reads, and no iteration over unordered collections
  inside the sim.
- **Caveat:** JavaScript `Math.exp`, `Math.log`, and `Math.pow` are not guaranteed to
  return bit-identical results across browser engines. Either accept determinism only
  per engine, or ship our own implementations if cross-browser replays matter.
- A save file holds the seed, the scenario, a snapshot, and the action log, so any run
  can be replayed or shared, like a lab notebook.

### 7.5 Performance targets (initial)

- One epoch's micro-simulation (about 200 generations, about 20,000 individuals)
  finishes in **under 10 s** on a mid-range laptop.
- A full 500 Myr macro run finishes in **under 5 min**.
- The UI stays at 60 fps while the sim runs in a worker.
- If those targets are missed: cohort or "super-individual" aggregation, smaller
  landscapes, then WASM for proven hotspots.

---

## 8. Scientific validation and testing

| Test type | Examples |
|-----------|----------|
| **Analytical population genetics** (statistical, many replicates) | Neutral fixation probability ≈ 1/(2N); Kimura fixation probability under selection; heterozygosity decay `H_t = H₀(1 − 1/2N)^t`; Hardy-Weinberg proportions without selection; mutation-selection balance ≈ μ/s |
| **Physiology unit tests** | A-Ci and light-response curves match FvCB with published parameters; C3/C4 crossover temperature moves the right way with CO₂; buckling and hydraulic limits cap height |
| **Emergence scenarios** | Cuticle spreads under drought and not in permanently wet patches; height increases under dense light competition and is limited by cost; C4 spreads at low CO₂ and high temperature but not at high CO₂ and cool temperature; seeds are favoured as conditions dry |
| **Macro calibration** (qualitative) | Diversity curves show radiations after key innovations and dips at mass extinctions, compared against Paleobiology Database plant diversity patterns. Calibrate shapes; never fit to force a match. |
| **Determinism / golden seeds** | Fixed seeds give identical outputs. Regressions show up as snapshot diffs. |
| **Property-based tests** | Conservation of carbon and water; no negative biomass; allele frequencies always within [0, 1] |
| **Expert review** | A botanist or paleobotanist reviews each Science Bible chapter before that system ships |
| **Playtests** | After each phase, check whether players can *explain* outcomes in physiological terms |

---

## 9. Phased roadmap

Durations are rough and assume 1–2 developers. Each phase ends with a working,
testable deliverable and explicit exit criteria. Phases 2–4 can partly overlap.

### Phase 0: Foundations and Science Bible (1–2 weeks)
1. Settle the open decisions in §11 (audience, platform, art direction).
2. Set up the monorepo: TypeScript, Vite, pnpm, ESLint, Prettier, Vitest, and GitHub
   Actions CI.
3. Deploy an empty app to GitHub Pages.
4. Write Science Bible v0: equations, parameters, citations, and stated simplifications
   for genetics, physiology, and Ordovician–Devonian environments. Verify every date in
   §5.
5. Write ADRs for the stack, the two-tier time model, and the Mutation Draft.

**Exit criteria:** CI green, empty app deployed, Science Bible v0 reviewed.

### Phase 1: Headless population genetics engine (2–3 weeks)
1. Seeded, splittable PRNG with tests.
2. Individual-based Wright-Fisher model with mutation, recombination, selection, and
   drift; haploid and diploid.
3. A headless CLI runner with CSV export, plus a notebook that plots trajectories.
4. The statistical validation suite (§8, analytical population genetics).

**Exit criteria:** every analytical test passes within tolerance over many replicates.

### Phase 2: Plant physiology and life cycle (3–4 weeks)
1. Trait schema, pleiotropy matrix, and genotype-to-phenotype mapping.
2. Physiology modules: Beer-Lambert light, FvCB photosynthesis, Medlyn stomatal
   conductance, water bucket and desiccation, carbon allocation, and respiration.
3. Life cycle: alternation of generations, spore production, and the water requirement
   for fertilization.
4. Fitness emerges from the life cycle. Remove any placeholder fitness function.

**Exit criteria:** physiology tests reproduce published response curves. In a
single-patch run, cuticle spreads under drought and does not spread in permanent wet.

### Phase 3: Spatial ecology (3–4 weeks)
1. A patch landscape with moisture, soil, and elevation gradients.
2. Dispersal kernels, the establishment lottery, and gene flow.
3. Vertical light competition with mechanical and hydraulic height costs.

**Exit criteria:** local adaptation along a moisture gradient emerges; height
increases under competition and stays bounded by its costs.

### Phase 4: Morphology and rendering (3–4 weeks, parallel with 2–3)
1. A parametric L-system grammar driven by morphology genes.
2. A 2D renderer in PixiJS.
3. Geometry-derived light interception and mechanical load, cached per phenotype.
4. Presets that check the forms: Cooksonia-like, lycopsid-like, fern-like, and
   conifer-like.

**Exit criteria:** recognizable plant forms come from genome parameters, and
morphology measurably changes physiology.

### Phase 5: Vertical slice, "Leaving the Water" (4–6 weeks)
1. Chapter 1 scenario: a streptophyte alga at a pond margin, through bryophyte-grade
   plants, to early vascular plants.
2. The full Lineage-mode loop: Mutation Draft, simulation, outcome report with fitness
   decomposition, and a simple lineage tree.
3. Screens: world map, plant inspector, population genetics panel, and codex entries.
4. Tutorial, then playtests with 5–10 people (including at least one biology teacher or
   student).

**Exit criteria:** a 30–45 minute session that is fun to play. Testers can explain in
physiological terms why their lineage succeeded or failed. **Go/no-go decision on
scope.**

### Phase 6: Deep time and macroevolution (4–6 weeks)
1. Data pipeline for environmental time series: CO₂, O₂, temperature, and geography,
   with interpolation and zod validation.
2. The macro tier: species abstraction, breeder's-equation trait change, and
   birth-death speciation and extinction.
3. Micro-macro bridge (§4.9), rival clades, and mass-extinction events.
4. The phylogeny viewer and the geologic timeline screen.
5. The weathering feedback with its *Coupled* / *Data-locked* switch.

**Exit criteria:** a full 500 Myr run meets the performance target, and diversity
curves show radiations and extinction dips without being scripted.

### Phase 7: Key innovations expansion (6–8 weeks, iterative)
1. Implement the §5 catalog in era order. For each innovation: prerequisites,
   physiology hooks, rendering, codex entry, and a validation scenario.
2. Add polyploidy and hybridization.

**Exit criteria:** each innovation spreads where theory predicts and fails to spread
where theory predicts it shouldn't.

### Phase 8: Biotic interactions (4–6 weeks)
1. Herbivore guilds and growth-defense trade-offs.
2. Pollinator coevolution, wind vs. animal pollination, and fruit dispersal.
3. Mycorrhizal mutualism, pathogens, and the fire regime tied to O₂ and fuel.

**Exit criteria:** emergent coevolution, such as pollinator specialization and
growth-defense trade-offs, shows up in replicate runs.

### Phase 9: Campaign, education, and science tools (4–6 weeks)
1. Chapters 2–9.
2. Planet (sandbox) mode and Experiment mode with replicates, confidence intervals,
   and CSV export.
3. The fossil-record view with its taphonomic filter, and a cladistics mini-game:
   infer the tree from traits, then compare it with the true simulated tree.
4. A "your history vs. Earth's history" comparison at the end of a run.
5. Teacher materials aligned to curricula, for example NGSS HS-LS4 (Biological
   Evolution).

**Exit criteria:** a classroom pilot completed, with feedback incorporated.

### Phase 10: Polish, performance, accessibility, launch (4–6 weeks)
1. Profiling and optimization (WASM only for proven hotspots).
2. Accessibility: colour-blind-safe palettes, keyboard navigation, data-table
   alternatives for every chart, and scalable text.
3. Offline PWA, localization groundwork, and an optional Tauri desktop build.
4. A final expert scientific review, a balance pass, and release.

**Exit criteria:** public release.

**Rough total:** about 10–14 months for 1–2 developers. The playable vertical slice
comes at about 3–4 months.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Realism makes it slow, dense, or unfun | Layered complexity (simple views by default, detail on demand); the Phase 5 go/no-go; playtests every phase |
| Computational cost | The two-tier time model, structure-of-arrays storage, workers, cohort aggregation, and WASM as a last resort |
| Timescale compression misleads players | Disclose it in the codex and quantify what is compressed |
| Teleological language creeps in | The style guide (§6.5) and review of all UI copy |
| Contested science (leaf origins, angiosperm timing, Devonian anoxia links) | Confidence labels in the codex, cited alternatives, and expert review |
| Scope creep | Phase exit criteria, a vertical slice first, and data-driven content so new material doesn't require engine changes |
| Data licensing | Check every dataset's license in Phase 0 and prefer openly licensed sources |
| Cross-browser nondeterminism | Engine-pinned replays or custom maths functions (§7.4) |

---

## 11. Open decisions

These shape everything downstream. Settle them in Phase 0.

1. **Primary audience:** classroom (ages 14–18 or undergraduate), general gamers, or
   both. This affects difficulty, session length, and teacher tooling.
2. **Platform:** web-first (recommended) vs. desktop/Steam-first vs. mobile.
3. **Visual style:** stylized 2D (recommended to start) vs. 3D.
4. **Team and timeline:** solo or small team, and the target date for the vertical
   slice.
5. **Player agency model:** confirm the Mutation Draft plus Pure mode (§3), or go
   sandbox-only.
6. **Business model:** free/open-source educational project vs. a commercial release.
   This affects data-licensing choices.

---

## 12. Starter reference list

Verify and expand these into BibTeX in `packages/data` during Phase 0.

**Plant evolution and paleobotany**
- Kenrick, P. & Crane, P. R. (1997). The origin and early evolution of plants on land. *Nature*.
- Willis, K. J. & McElwain, J. C. (2014). *The Evolution of Plants* (2nd ed.). Oxford University Press.
- Taylor, T. N., Taylor, E. L. & Krings, M. (2009). *Paleobotany: The Biology and Evolution of Fossil Plants*. Academic Press.
- Niklas, K. J. (1997). *The Evolutionary Biology of Plants*. University of Chicago Press.
- Morris, J. L. et al. (2018). The timescale of early land plant evolution. *PNAS*.
- One Thousand Plant Transcriptomes Initiative (2019). One thousand plant transcriptomes and the phylogenomics of green plants. *Nature*.
- Beerling, D. J., Osborne, C. P. & Chaloner, W. G. (2001). Evolution of leaf-form in land plants linked to atmospheric CO₂ decline. *Nature*.
- Sage, R. F., Christin, P.-A. & Edwards, E. J. (2011). The C4 plant lineages of planet Earth. *Journal of Experimental Botany*.
- Wood, T. E. et al. (2009). The frequency of polyploid speciation in vascular plants. *PNAS*.
- Algeo, T. J. & Scheckler, S. E. (1998). Terrestrial-marine teleconnections in the Devonian. *Phil. Trans. R. Soc. B*.
- Sahney, S., Benton, M. J. & Falcon-Lang, H. J. (2010). Rainforest collapse triggered Carboniferous tetrapod diversification. *Geology*.
- Niklas, K. J., Tiffney, B. H. & Knoll, A. H. (1983). Patterns in vascular land plant diversification. *Nature*.

**Physiology and ecology models**
- Farquhar, G. D., von Caemmerer, S. & Berry, J. A. (1980). A biochemical model of photosynthetic CO₂ assimilation in leaves of C3 species. *Planta*.
- Collatz, G. J., Ribas-Carbo, M. & Berry, J. A. (1992). Coupled photosynthesis-stomatal conductance model for leaves of C4 plants. *Aust. J. Plant Physiol.*
- Medlyn, B. E. et al. (2011). Reconciling the optimal and empirical approaches to modelling stomatal conductance. *Global Change Biology*.
- Wright, I. J. et al. (2004). The worldwide leaf economics spectrum. *Nature*.
- Koch, G. W. et al. (2004). The limits to tree height. *Nature*.
- Belcher, C. M. & McElwain, J. C. (2008). Limits for combustion in low O₂ redefine paleoatmospheric predictions for the Mesozoic. *Science*.
- Prusinkiewicz, P. & Lindenmayer, A. (1990). *The Algorithmic Beauty of Plants*. Springer.

**Earth history**
- Berner, R. A. (2006). GEOCARBSULF: a combined model for Phanerozoic atmospheric O₂ and CO₂. *Geochim. Cosmochim. Acta*.
- Foster, G. L., Royer, D. L. & Lunt, D. J. (2017). Future climate forcing potentially without precedent in the last 420 million years. *Nature Communications*.
- Judd, E. J. et al. (2024). A 485-million-year history of Earth's surface temperature. *Science*.

**Population and quantitative genetics**
- Kimura, M. (1962). On the probability of fixation of mutant genes in a population. *Genetics*.
- Lande, R. (1979). Quantitative genetic analysis of multivariate evolution, applied to brain:body size allometry. *Evolution*.
- Orr, H. A. (1995). The population genetics of speciation: the evolution of hybrid incompatibilities. *Genetics*.

**Data sources (check licenses)**
- Paleobiology Database (paleobiodb.org): fossil occurrences and diversity curves.
- Open Tree of Life: a reference phylogeny for comparison views.
- APG IV (2016) and PPG I (2016): classification of angiosperms, ferns, and lycophytes.
- TRY Plant Trait Database: trait ranges (access terms apply).
- GPlates and open plate models: paleogeography.

---

## 13. Immediate next steps

1. Answer the open decisions in §11.
2. Scaffold the monorepo and CI (Phase 0, steps 2–3).
3. Write the first Science Bible chapter: *Population genetics core*, with the exact
   model, parameters, and the analytical tests it must pass.
4. Build the seeded PRNG and Wright-Fisher engine, test-first (Phase 1).
