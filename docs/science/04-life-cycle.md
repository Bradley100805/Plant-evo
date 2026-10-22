# 04. Life cycle and reproduction

**Status:** v0, implemented in Phase 2, awaiting expert review.
**Code:** [`packages/sim/src/world/world.ts`](../../packages/sim/src/world/world.ts) (`LIFE`,
`DEATH_CAUSES`, `World.stepYear` and its helpers). Monthly physiology:
[`packages/sim/src/plant/physiology.ts`](../../packages/sim/src/plant/physiology.ts)
([chapter 03](03-plant-physiology.md)). Trait map:
[`packages/sim/src/plant/traits.ts`](../../packages/sim/src/plant/traits.ts).
**Tests:** `pnpm vitest run packages/sim/src/world`
([`world.test.ts`](../../packages/sim/src/world/world.test.ts)); `pnpm test` runs them with the
rest of the suite.

This chapter specifies the life cycle of the simulated lineage: how gametophytes arise, are
fertilised and nourish sporophytes, how spores and asexual propagules are made, which bodies
survive into the next year, and how genomes pass from one generation to the next. Fitness is
never computed. A variant spreads when its carriers survive, are fertilised and leave more spores
or propagules that win cells.

Related chapters: the landscape, dispersal, shading and the establishment lottery are in
[chapter 05](05-spatial-ecology.md); photosynthesis, the water balance and the monthly survival
probability in [chapter 03](03-plant-physiology.md); the genetic engine in
[chapter 01](01-population-genetics.md); the environment of each epoch in
[chapter 07](07-early-earth-environments.md).

## 1. Scope

In scope for Phase 2:

- Alternation of a haploid gametophyte and a diploid sporophyte. How far the sporophyte develops,
  from a zygote that undergoes meiosis to an independent plant, is an evolvable trait.
- Fertilisation that needs surface water, with outcrossing among nearby gametophytes and selfing.
- Spores (meiotic, recombinant) and asexual propagules (clonal), each with a cost.
- Perennation of either generation, background disturbance and four causes of death.
- Mutation and free recombination at the birth of each haploid individual.

Not modelled yet: separate sexes (every gametophyte is bisexual), evolution of the selfing rate,
inbreeding depression, sperm numbers, heterospory, seeds and pollen (Phase 7), and polyploidy.
The plan (§4.4) lists the mating system with inbreeding depression as a later goal.

## 2. Individuals and genomes

Each landscape cell holds at most one genetic individual: a gametophyte and, once it has been
fertilised, the sporophyte growing on it. Either body can die while the other lives on. A cell
stays occupied for the rest of the year even if both bodies die, and at the end of the year it
stays occupied only if one of its bodies perennates (§8). Otherwise it is open to new arrivals
([chapter 05](05-spatial-ecology.md) §9).

Each cell stores two genome copies:

- **Copy 0, maternal:** the gametophyte's own haploid genome.
- **Copy 1, paternal:** after fertilisation, the father's haploid genome (his copy 0). Before
  fertilisation it is a duplicate of copy 0, which nothing reads.

A trait is a value in (0, 1): `trait = logistic(base + liability)`, with
`base = logit(ancestral value)` ([`traits.ts`](../../packages/sim/src/plant/traits.ts); chapter
03 §2). The two generations read the same genome differently:

| Generation            | Liability               | Equivalent to                             |
| --------------------- | ----------------------- | ----------------------------------------- |
| Gametophyte (haploid) | 2 × (copy-0 sum)        | a diploid homozygous for the same alleles |
| Sporophyte (diploid)  | copy-0 sum + copy-1 sum | additive, no dominance                    |

A copy's sum for a trait adds the allele values at the trait's own loci and, weighted by their
loadings, at the developmental-module loci that affect it (chapter 03 §2).

Gametophyte traits are computed at the start of each year for every occupied cell. Sporophyte
traits are computed at fertilisation and, for a perennating sporophyte, again at the start of each
year.

Which traits each generation uses (this matches `TRAIT_INFO.expressedIn` in `traits.ts`):

| Trait                           | Gametophyte                                                     | Sporophyte                                                                                         |
| ------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Desiccation tolerance           | body (chapter 03)                                               | body (chapter 03)                                                                                  |
| Cuticle                         | body, at half strength (`GAMETOPHYTE_CUTICLE_EXPRESSION` = 0.5) | body                                                                                               |
| Stomata                         | not used (no stomata)                                           | body                                                                                               |
| Rooting                         | rhizoids (body)                                                 | rooting axes (body)                                                                                |
| Asexual propagules              | share of growth put into propagules (§7.2)                      | not used                                                                                           |
| Sporophyte development, _k_     | not used                                                        | nourishment, own growth, water from the gametophyte, desiccation risk, shading, perennation (§6.1) |
| Spore wall                      | not used                                                        | cost per spore (§7.1); survival in dispersal and dormancy (chapter 05 §7–§8)                       |
| Branching                       | not used                                                        | share of growth put into spores (§7.1); body (chapter 03)                                          |
| Upright growth, vascular tissue | not used                                                        | height and body (chapter 03)                                                                       |

So a spore's wall and dormancy are set by its parent sporophyte's diploid genotype, not by the
spore's own genome, and the embryo's nourishment is set by the embryo's genotype, not by its
mother's.

The trait means the world reports (`YearReport.traitMeans`, and `Game.traitMeans`, which the
chapter goals use) average the haploid expression of copy 0 over all occupied cells. For a
sporophyte trait this is the value each individual's haploid genome would express as a
homozygote, not the phenotype of the sporophytes present.

## 3. One simulated year

One call of `stepYear` is one year and one generation. Months are numbered 0–11. Months 0–5 are
the wet season and months 6–11 the dry season ([chapter 05](05-spatial-ecology.md) §2). The steps
run in this order:

1. **Atmosphere.** CO₂ (ppm) is taken from the epoch's environment. O₂ (% by volume) is multiplied
   by 10 to give mmol mol⁻¹ for the photosynthesis model.
2. **Start of year** (`beginYear`, §4.1). Each occupied cell starts a new, unfertilised
   gametophyte, or resumes the bodies that perennated (§8). Every cell's per-year state is reset:
   sporophyte heights, area indices, propagule stores, spore and propagule counts and release
   heights to zero, gametophyte hydration to 1, no fertilisation month and no recorded death. A
   perennating sporophyte then gets its height and area index back from its carried-over biomass.
3. **Twelve months.** In month _m_:
   1. Shade on each live cell is computed from neighbouring sporophytes, using their heights and
      area indices at the end of the previous month (chapter 05 §5).
   2. In months 1–4 only: fertilisation (§5), before any growth this month.
   3. Every cell with a live body, in cell order: first the gametophyte's month (§4.2), then the
      sporophyte's (§6.2). The two are coupled through nourishment and water.
   4. In months 5 and 11 only, after growth: release of spores and propagules (§7).
4. **Report** (`summarise`, §11).
5. **Perennation** (`decidePerennation`, §8).
6. **Map record.** For each cell, `lastEstablished` (occupied this year) and `lastReproduced`
   (released any spores or propagules) are stored for the map.
7. **Dispersal and establishment** (`disperse`, chapter 05 §7–§9), which also writes next year's
   genomes (§10).
8. The generation counter advances. The allele table is compacted when it holds more than
   4 × cells × loci + 4096 ids (chapter 01 §3).

| Month | Season | Life-cycle events                                                                   |
| ----- | ------ | ----------------------------------------------------------------------------------- |
| 0     | wet    | growth; next year's germination conditions are read from this month (chapter 05 §9) |
| 1–4   | wet    | fertilisation, then growth                                                          |
| 5     | wet    | growth, then the first release                                                      |
| 6–10  | dry    | growth                                                                              |
| 11    | dry    | growth, then the second release                                                     |

Random numbers come from five named streams derived from the world seed: `life` (monthly
survival, fertilisation, perennation), `dispersal` (the lottery and establishment), `meiosis`
(recombination), `mutation`, and `intervention` (variants placed by the Mutation Draft). As in
chapter 01 §6, each stream depends only on the seed and its name.

## 4. Gametophytes

### 4.1 Origin and starting size

| How the gametophyte started                                          | Biomass at the start of the year                         |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| Germinated from a spore                                              | `startFromSpore` = 1 × 10⁻⁵ g                            |
| Grew from an asexual propagule (also every founder placed by `seed`) | `startFromPropagule` = 1 × 10⁻⁴ g                        |
| Perennated from last year                                            | `carryOver` × its biomass at last year's end (0.8 `B_G`) |

A new gametophyte is unfertilised and has no sporophyte. Starting sizes are not derived from the
mass of a spore or propagule (§7): a germinating spore starts at 170–500 times the mass of the
spore it came from, and a propagule's gametophyte at 50 times the propagule's mass.

### 4.2 The gametophyte's month

For a live gametophyte of biomass `B_G` in a cell of area _A_ = 0.01 m² (chapter 05 §1):

1. **Light.** `I_G = I × exp(−0.7 × PAI_S)`. _I_ is PAR after shading by neighbours (chapter 05
   §5), `PAI_S` is the area index of its own sporophyte at the end of the previous month, and 0.7
   is `CANOPY_K` (chapter 03 §6). The gametophyte lies beneath its own sporophyte.
2. **Water and carbon balance** of the gametophyte body in this month's climate and site
   (`monthBalance`, chapter 03 §5). This gives its hydration `h_G` and its probability `S_G` of
   surviving the month's desiccation.
3. **Potential biomass change** `ΔB_G` (`biomassChange`, chapter 03 §6).
4. **Allocation**, only when `ΔB_G` > 0:
   - to the propagule store: `0.5 × a × ΔB_G`, where _a_ is the asexual-propagule trait;
   - to its sporophyte, if one is alive and was formed in an earlier month:
     `T = 0.5 × k² × ΔB_G`, where _k_ is the sporophyte's development trait.

   When `ΔB_G` ≤ 0 nothing is allocated.

5. **Update.** `B_G ← min(B_G + ΔB_G − allocations, B_max)`, where `B_max` is the biomass at an
   area index of 4 (`maxBiomass`, chapter 03 §6). The allocations are shares of the potential
   change, taken before the cap; growth above the cap is lost.
6. The gametophyte's area index is updated.
7. **Death** (§9): by desiccation with probability 1 − `S_G`; otherwise by starvation if
   `B_G` < 0.25 × `startFromSpore` = 2.5 × 10⁻⁶ g.

A gametophyte is **mature** when `B_G` ≥ `matureBiomass` = 5 × 10⁻⁴ g at the start of a
fertilisation month. Only mature gametophytes can be fertilised or act as fathers.

## 5. Fertilisation

In each of months 1–4, before that month's growth, each live, unfertilised, mature gametophyte
(taken in cell order) may be fertilised:

1. **Water film at the egg.** If the cell is submerged, `film = 1` and sperm can come from up to
   2 cells away. Otherwise `film = max(r, w_s)`, where _r_ is the month's fraction of daylight
   with surfaces wet from rain or dew and `w_s` is the cell's surface wetness (chapter 05 §2), and
   sperm can come from 1 cell away. Distances are Chebyshev: a 5 × 5 or 3 × 3 square of cells,
   clipped at the landscape edge.
2. **Potential fathers.** Every live, mature gametophyte in that square, the egg's own included.
   A neighbour counts only if its own cell is submerged or has surface wetness ≥ 0.3 ("Sperm swim:
   the neighbour must be joined to this one by surface water"). The gametophyte itself always
   counts. Each neighbour has weight 1 and the gametophyte itself `selfingWeight` = 0.5. _W_ is the
   sum of the weights.
3. **Chance of fertilisation this month:** `P = film × (1 − exp(−W))`.
4. **Father.** If fertilised, the father is drawn in proportion to the weights.
5. **Zygote.** Copy 1 of the cell becomes the father's copy 0. The cell is marked fertilised in
   this month, its sporophyte is alive with `B_S` = `zygoteBiomass` = 2 × 10⁻⁶ g, and the
   sporophyte's traits are computed from both copies.

Consequences:

- Every gametophyte is bisexual. It can father zygotes on any number of neighbours, whether or not
  it has been fertilised itself. A fertilised gametophyte cannot be fertilised again that year.
- **Selfing** happens with probability 0.5 / _W_ given fertilisation. An isolated gametophyte is
  fertilised with probability `film × (1 − e^−0.5)` ≈ 0.39 × `film` per month, always by itself.
  With 8 mature neighbours on wet ground, _W_ = 8.5 and 5.9% of fertilisations are selfed; with 24
  mature neighbours under water, _W_ = 24.5 and 2.0% are.
- A selfed zygote has two identical genome copies, so its sporophyte is homozygous at every locus.
  This is intragametophytic selfing. With purely additive allele effects (chapter 01 §9) it costs
  nothing in the model.
- No mutation happens at fertilisation: gametes carry the father's genome unchanged.
- A gametophyte gets up to four chances a year (months 1–4), so its yearly chance of fertilisation
  compounds over those months.

**Biology.** Bryophyte and fern sperm are flagellate and reach the egg only through liquid water
(Established; textbook material, citation to add). Because a haploid gametophyte makes eggs and
sperm by mitosis, a gametophyte fertilised by its own sperm yields a sporophyte homozygous at every
locus (Established; it follows from the life cycle). The codex's account of why rare fertilisation
matters for the origin of the sporophyte follows Haig (2008).

## 6. The sporophyte

### 6.1 Development as a trait

The sporophyte-development trait _k_ (diploid, in (0, 1)) runs from a walled zygote (_k_ → 0) to a
sporophyte that photosynthesises, loses water and lives on its own (_k_ → 1). Its ancestral value
in chapter 1 of the game is 0.02. _k_ enters in six places:

| Effect                                                            | Formula                                 | At _k_ = 0                | At _k_ = 1                                 |
| ----------------------------------------------------------------- | --------------------------------------- | ------------------------- | ------------------------------------------ |
| Nourishment from the gametophyte (§4.2)                           | `T = 0.5 × k² × ΔB_G`, when `ΔB_G` > 0  | none                      | half of the gametophyte's potential growth |
| Own growth (photosynthesis minus respiration, turnover)           | `k × ΔB_S`                              | none                      | all                                        |
| Water supplied by the gametophyte                                 | `(1 − k) × h_G × 0.003` mol H₂O m⁻² s⁻¹ | all                       | none                                       |
| Monthly survival of desiccation                                   | `1 − k × (1 − S_S)`                     | never dies of desiccation | `S_S`                                      |
| Photosynthetic area index (shades its gametophyte and neighbours) | `k × PAI`                               | 0                         | full                                       |
| Perennation (§8)                                                  | probability `0.92 × k`                  | never                     | 0.92                                       |

The code comments give the reasoning: "An undeveloped sporophyte (a walled zygote) is
metabolically almost inert", and "Nourishing a retained embryo needs a placenta-like interface
that develops with it". The square in the nourishment term was chosen in playtesting; it has no
literature source.

### 6.2 The sporophyte's month

A sporophyte does nothing in the month it is formed. In each later month, and in every month of a
perennating sporophyte, it runs after its gametophyte's month:

1. **Body** from its traits and current biomass `B_S`. Its height grows towards a genetic maximum
   (chapter 03 §4.4).
2. **Water and carbon balance** (`monthBalance`, chapter 03 §5) with light _I_, which is shaded by
   neighbours but not by its own gametophyte, and an extra water supply of
   `(1 − k) × h_G × 0.003` mol m⁻² s⁻¹ if its gametophyte is still alive after its own month
   (`h_G` is the gametophyte's hydration this month). This gives the survival probability `S_S`.
3. **Update.** `B_S ← min(B_S + k × ΔB_S + T, B_max,S)`, with `ΔB_S` from `biomassChange` and
   _T_ from §4.2 (zero if the gametophyte's growth this month was not positive, or it was already
   dead).
4. Its height, the tallest height reached this year, and its area index `k × PAI` are updated.
5. **Death** (§9): by desiccation with probability `k × (1 − S_S)`; otherwise by starvation if
   `B_S` < 0.5 × `zygoteBiomass` = 1 × 10⁻⁶ g.

A gametophyte's death does not kill its sporophyte; the sporophyte loses its nourishment and water
supply. A dependent sporophyte (small _k_) has its own growth, losses and desiccation risk all
scaled by _k_, so it persists almost unchanged and can still release spores.

**Biology.** In the algae closest to land plants the zygote is the only diploid cell and undergoes
meiosis straight away. Land plants retain the zygote, which grows into a multicellular embryo
nourished by the gametophyte (Established; codex `sporophyte`). In mosses and liverworts the
sporophyte stays attached to the gametophyte; in vascular plants it became the large, independent
plant (Established; codex `alternation`). The antithetic theory holds that delaying meiosis
multiplies the spores made from each fertilisation, which matters where fertilisation is rare
(Well supported, as labelled in the codex; Haig 2008).

## 7. Spores and asexual propagules

### 7.1 Spores

In months 5 (end of the wet season) and 11 (end of the dry season), after growth, every live
sporophyte releases spores:

```
allocation = 0.25 + 0.25 × branching
spare      = max(0, B_S − B_base)
cost       = sporeMass × (1 + sporeWallCost × wall) = 2 × 10⁻⁸ g × (1 + 2 × wall)
N          = (4 at month 5, 0 at month 11) + allocation × spare / cost
B_S       ← B_S − allocation × spare
B_base    ← B_S
```

`B_base` is the sporophyte's biomass after its last release or, before its first release this
year, its starting biomass (the zygote's 2 × 10⁻⁶ g, or a perennial's carried-over biomass).
Spores therefore come from growth made since the last release, and a perennial keeps the rest, so
it can build up size over the years. The sporophyte's release height is the tallest height it had
at a release this year; dispersal uses it (chapter 05 §7).

- The 4 spores added at month 5 (`zygoticMeiospores`) stand for the products of the zygote's own
  meiosis ("charophyte-style zygotic meiosis"). They cost no biomass and are added for every
  sporophyte alive at the month-5 release.
- Spore numbers are expected values (real numbers), not integers. Randomness enters later, at
  dispersal and establishment.
- A fully walled spore costs 3 times as much as an unwalled one:

| Spore wall      | Cost per spore |
| --------------- | -------------- |
| 0               | 2.0 × 10⁻⁸ g   |
| 0.3 (ancestral) | 3.2 × 10⁻⁸ g   |
| 1               | 6.0 × 10⁻⁸ g   |

For scale, 2 × 10⁻⁸ g is the mass of a sphere about 35 µm across at a density of 1 g cm⁻³. That is
arithmetic, not a source for the value.

All spores are products of meiosis in the sporophyte: each is a recombinant of its two genome
copies (§10). The 4 zygotic meiospores and the spores made from growth are treated alike.

### 7.2 Asexual propagules

In each month with positive growth, a gametophyte puts `0.5 × a × ΔB_G` into its propagule store
(§4.2). At months 5 and 11 the store is released as `store / propaguleMass` propagules
(`propaguleMass` = 2 × 10⁻⁶ g, "gemma or fragment") and emptied. A gametophyte's death loses its
store. A propagule carries a copy of the gametophyte's genome (copy 0) and grows straight into a
gametophyte.

Propagules have no wall. Those released in month 5 survive the dry season only in proportion to
the share of dry-season months their landing cell stays under water, and propagules germinate well
only in water or on wet ground (chapter 05 §7.3, §9). Gemmae and fragments clone the parent cheaply
but, being unwalled, survive only in water or on wet ground (Established; codex `asexual`).

### 7.3 Fates

Dispersal, dry-season survival (including the spore-wall dormancy curve), germination and the
establishment lottery are specified in chapter 05 §7–§9. In short, spores and propagules released
in month 5 must last through the dry season and those released in month 11 need not.

## 8. Perennation and disturbance

After the year's last release and the report, each occupied cell decides which of its bodies
survive into next year:

```
keep = 1 − disturbance = 0.92
live sporophyte:  perennates with probability k × keep;   carries 0.8 × B_S into next year
live gametophyte: perennates with probability 0.6 × keep; carries 0.8 × B_G into next year
```

The two draws are independent. If either body perennates, the individual keeps its cell and both
genome copies, and no arrival can establish there (chapter 05 §9). Next year:

| Perennated       | Next year                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Gametophyte only | the gametophyte resumes at 0.8 `B_G`, unfertilised, and can be fertilised again by a new father |
| Sporophyte only  | the sporophyte resumes at 0.8 `B_S` with no gametophyte, and grows from month 0                 |
| Both             | both resume; the gametophyte counts as fertilised and keeps nourishing the sporophyte           |

Disturbance (`disturbance` = 0.08 per year; "floods, erosion, burial" in the code comment) acts
only here, as a factor on each body's chance of perennating. It is independent between the two
bodies and between cells, the same in every zone, and never strikes during the year. A body that
fails to perennate is not recorded as a death (§9).

The gametophyte's chance of perennating (0.6) does not depend on any trait. Its traits matter only
through whether it is still alive at the end of the year, which out of the water "takes desiccation
tolerance or homoiohydry" (code comment). A sporophyte perennates in proportion to its
independence, _k_. Perennation was added in playtesting: without it, height could not accumulate
over years and upright growth gave no advantage ([ADR 0007](../adr/0007-chapter-1-world-model.md)).
Many bryophyte gametophytes are perennial (Established; citation to add).

## 9. Death

| Index | Cause (`DEATH_CAUSES`)  | Tested each month, after the body's growth |
| ----- | ----------------------- | ------------------------------------------ |
| 0     | gametophyte desiccation | a uniform draw is ≥ `S_G`                  |
| 1     | gametophyte starvation  | otherwise, `B_G` < 2.5 × 10⁻⁶ g            |
| 2     | sporophyte desiccation  | a uniform draw is ≥ 1 − _k_ (1 − `S_S`)    |
| 3     | sporophyte starvation   | otherwise, `B_S` < 1 × 10⁻⁶ g              |

`S_G` and `S_S` are the monthly probabilities of surviving desiccation from the water balance
(chapter 03 §5.7). A gametophyte's death empties its propagule store and sets its area index to 0; a
sporophyte's death sets its area index to 0. The zone death counts record every death. The
per-cell `cause` field records only the first death in the cell that year (as index + 1; 0 means
none). Failing to perennate, including through disturbance, is not recorded as a death.

## 10. Inheritance at the birth of a new individual

New individuals arise only in `disperse`, in cells that no perennial holds (chapter 05 §9). The
genome of the arrival that wins the cell becomes copy 0 of the new individual:

- **From a spore:** one recombinant copy of the parent's two copies (meiosis). It starts on a
  random parental copy and switches copy between every pair of adjacent loci with probability 0.5,
  so all loci recombine freely (`crossoverRates(0.5)`, `recombineCopy`; chapter 01 §2).
- **From a propagule:** a copy of the parent's copy 0.

Mutation then acts on the new copy 0: each locus mutates with probability μ, which adds a
Normal(0, σ²) increment to the allele value (`gaussianIncrement`; chapter 01 §4). Chapter 1 of the
game uses μ = 3 × 10⁻⁴ per locus per generation and σ = 0.12, on 42 loci (four per trait plus two
developmental-module loci; chapter 03 §2). Finally copy 1 is set equal to copy 0, and the cell
records whether the arrival was a spore or a propagule.

Each haploid individual therefore receives one round of mutation, at its birth. Gametes, zygotes
and perennating bodies receive none. A selfed sporophyte's spores all carry its gametophyte's
genome (plus any new mutations), because recombining two identical copies changes nothing.

The Mutation Draft ([ADR 0004](../adr/0004-mutation-draft.md),
[ADR 0006](../adr/0006-mutation-draft-calibration.md)) places a new allele between years with
`introduceVariant`. The allele goes into copy 0 (the gametophyte's genome) of each chosen
individual. Copy 1 mirrors it, except in a cell that holds a perennating sporophyte, whose copy 1
is its father's genome and is left unchanged; that sporophyte becomes heterozygous for the new
allele.

## 11. What a year reports

`stepYear` returns a `YearReport`, computed after the twelve months and before perennation and
dispersal. Per zone (`ZoneStats`):

| Field                  | Meaning                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cells`                | cells in the zone                                                                                                                                                |
| `established`          | occupied cells this year (new arrivals and perennials)                                                                                                           |
| `perennial`            | of those, the ones carried over from last year                                                                                                                   |
| `survived`             | gametophytes alive at the end of the year                                                                                                                        |
| `fertilised`           | fertilisations that happened this year                                                                                                                           |
| `reproduced`           | individuals whose sporophyte released spores; in practice every sporophyte alive at the month-5 release, which always releases at least the 4 zygotic meiospores |
| `spores`, `propagules` | totals released (expected numbers)                                                                                                                               |
| `deaths`               | deaths by cause (§9)                                                                                                                                             |
| `sporophyteHeight`     | mean, over cells marked fertilised, of the tallest height each sporophyte reached this year (m)                                                                  |

For the whole landscape: `population` (occupied cells), `extinct` (population 0), `traitMeans`
(§2), `sporophyteHeight` and `fertilisationRate`. The last two use cells marked fertilised, which
include perennial sporophytes from earlier years and sporophytes that died during the year.
`reproduced` counts sporophytes only; the map's `lastReproduced` also counts propagule release.

## 12. Parameters

No parameter in this chapter has a literature source. "Playtesting" marks values introduced or
tuned while playtesting chapter 1 (selection scans and head-to-head runs, per the commit that added
them); the rest were set when the model was first written.

| Name                             | Value                                | Units             | Meaning                                                                          | Source                  |
| -------------------------------- | ------------------------------------ | ----------------- | -------------------------------------------------------------------------------- | ----------------------- |
| `startFromSpore`                 | 1 × 10⁻⁵                             | g                 | Gametophyte biomass on germination from a spore                                  | Modelling assumption    |
| `startFromPropagule`             | 1 × 10⁻⁴                             | g                 | Gametophyte biomass on growth from a propagule                                   | Modelling assumption    |
| `matureBiomass`                  | 5 × 10⁻⁴                             | g                 | Gametophyte biomass needed to be fertilised or to father                         | Modelling assumption    |
| `zygoteBiomass`                  | 2 × 10⁻⁶                             | g                 | Sporophyte biomass at fertilisation                                              | Modelling assumption    |
| `fertilisationMonths`            | 1, 2, 3, 4                           | month             | Months in which mature gametophytes can be fertilised                            | Modelling assumption    |
| `releaseMonths`                  | 5, 11                                | month             | Months of spore and propagule release                                            | Modelling assumption    |
| `zygoticMeiospores`              | 4                                    | spores            | Free spores from the zygote's meiosis, at the month-5 release                    | Products of one meiosis |
| `sporeMass`                      | 2 × 10⁻⁸                             | g                 | Mass of an unwalled spore                                                        | Modelling assumption    |
| `sporeWallCost`                  | 2                                    | (relative)        | Extra cost of a full wall, as a multiple of `sporeMass`                          | Modelling assumption    |
| `propaguleMass`                  | 2 × 10⁻⁶                             | g                 | Mass of one asexual propagule                                                    | Modelling assumption    |
| `selfingWeight`                  | 0.5                                  | (relative)        | Weight of the gametophyte itself among potential fathers                         | Modelling assumption    |
| `disturbance`                    | 0.08                                 | yr⁻¹              | Chance that disturbance prevents a surviving body from perennating               | Playtesting             |
| `carryOver`                      | 0.8                                  | (fraction)        | Biomass a perennating body carries into the next year                            | Playtesting             |
| `gametophytePerennation`         | 0.6                                  | (probability)     | Chance a gametophyte alive at the end of the year perennates, before disturbance | Playtesting             |
| Propagule share                  | 0.5 × _a_                            | (fraction)        | Share of a gametophyte's positive growth put into propagules                     | Modelling assumption    |
| Nourishment share                | 0.5 × _k_²                           | (fraction)        | Share of a gametophyte's positive growth passed to its sporophyte                | Square: playtesting     |
| Water from the gametophyte       | 0.003 × (1 − _k_) × `h_G`            | mol H₂O m⁻² s⁻¹   | Extra water supply of a sporophyte on a live gametophyte                         | Modelling assumption    |
| Spore allocation                 | 0.25 + 0.25 × branching              | (fraction)        | Share of a sporophyte's growth since the last release put into spores            | Modelling assumption    |
| Gametophyte starvation threshold | 0.25 × `startFromSpore` = 2.5 × 10⁻⁶ | g                 |                                                                                  | Modelling assumption    |
| Sporophyte starvation threshold  | 0.5 × `zygoteBiomass` = 1 × 10⁻⁶     | g                 |                                                                                  | Modelling assumption    |
| Sperm range                      | 1 (emergent egg), 2 (submerged egg)  | cells (Chebyshev) | How far away a father can be                                                     | Modelling assumption    |
| Father's wetness threshold       | 0.3                                  | (surface wetness) | Minimum surface wetness of an emergent father's cell                             | Modelling assumption    |

Chapter-1 values for the genetics (μ = 3 × 10⁻⁴, σ = 0.12, ancestral traits) are set in
[`chapter1.ts`](../../packages/sim/src/game/chapter1.ts); the dispersal and establishment
parameters are in chapter 05 §11.

## 13. Simplifications

| Simplification                                                                                          | Why                                                                                    | What it affects, and what it does not                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One generation per year, on a fixed calendar (fertilisation in months 1–4, releases in months 5 and 11) | The simplest seasonal cycle that separates wet-season sex from dry-season survival     | Phenology cannot evolve. Comparisons between variants within a year are unaffected.                                                                                                                                                   |
| Every gametophyte is bisexual, with a fixed selfing weight of 0.5                                       | Avoids modelling sex expression before the mating system is a trait                    | Selfing rates follow only from local density and wetness. Unisexual gametophytes, which cannot self, are not represented.                                                                                                             |
| No inbreeding depression                                                                                | Allele effects are additive (chapter 01 §9)                                            | Selfing, including complete homozygosity after intragametophytic selfing, has no genetic cost. Drift and linkage effects of selfing are kept.                                                                                         |
| Spore and propagule numbers are expected values                                                         | Speed: no per-spore bookkeeping                                                        | Demographic chance enters only through the lottery and establishment draws (chapter 05 §9). Expected numbers of offspring are unaffected.                                                                                             |
| Germling size is fixed, not derived from spore or propagule mass                                        | Spore size and provisioning are not yet traits                                         | A spore wall costs biomass but provides no reserves for the germling. Spore number trades off against the wall only.                                                                                                                  |
| Zygotic meiosis is represented by 4 free spores at the month-5 release                                  | Keeps one release calendar for every sporophyte                                        | In charophytes the walled zygote is usually the resting stage and meiosis follows at germination (citation to verify); here the 4 meiospores carry the dormancy instead. Up to 4 recombinant haploid offspring per zygote either way. |
| Spore wall and spore dormancy are set by the parent sporophyte's genotype                               | One trait value per parent; the spore's own genome is not expressed before germination | No selection among the spores of one parent on wall alleles.                                                                                                                                                                          |
| Nourishment is set by the embryo's genotype only                                                        | One trait controls dependence                                                          | The mother gametophyte's genotype has no say, so parent–offspring conflict over provisioning cannot evolve.                                                                                                                           |
| Gametophyte perennation has a fixed chance; disturbance is uniform and independent                      | Few parameters until disturbance regimes are modelled                                  | Traits act on perennation only through survival to the end of the year. Spatially clustered disturbance (floods, erosion) is absent.                                                                                                  |
| Mutation only at the birth of a haploid individual                                                      | One transmission per generation, as in chapter 01                                      | Perennials do not accumulate somatic mutations. Per-generation mutation supply matches chapter 01.                                                                                                                                    |

## 14. Tests

Run with `pnpm vitest run packages/sim/src/world` (9 tests, all passing; the landscape test is
described in chapter 05 §13). The world tests use a 24 × 12 landscape with the shore at column 8
(unless stated) and an Ordovician-like environment defined in the test file (CO₂ 2800 ppm, O₂ 16%,
mean 24 °C, lake seasonality 0.25 m).

| Test (`world.test.ts`)                                                       | What it checks                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| world › is reproducible from its seed and from a snapshot                    | Two worlds with the same seed, founded in open water and shallows, give the same population every year for 10 years. A world restored from a snapshot then gives the same populations as the original over 5 more years (perennation state included).                                                                                      |
| world › keeps the ancestral alga in the water and loses it on dry ground     | With ancestral traits, founded in open water and shallows, after 31 years more than half of the open-water cells hold an individual whose sporophyte released spores, and no dry-ground cell does.                                                                                                                                         |
| world › cannot fertilise without surface water                               | On a flat landscape with the lake 2 m below ground, no rain or dew and dry soil, a world seeded in every cell records no fertilisation in its first year.                                                                                                                                                                                  |
| world › counts carriers of pinned lineages at every pinned locus             | Two variants pinned at different loci (cuticle and stomata), each given to 40 random individuals: the share of individuals carrying either is larger than the share carrying each one, and at most their sum.                                                                                                                              |
| world › introduces a mutation into one genome copy of a perennial sporophyte | After a sporophyte-development allele (value 3) is given to every individual and 8 years run, some cells hold perennating sporophytes. A new allele given to every occupied cell is then in copy 0 everywhere, and in copy 1 exactly where no sporophyte perennates (§10).                                                                 |
| world › keeps a custom genome architecture through a snapshot                | A world with 3 loci per trait and a custom developmental module is restored from a snapshot with the same architecture and the same inherited traits in every cell.                                                                                                                                                                        |
| world › spore walls improve dry-season survival                              | `sporeDormancySurvival(0.9)` is more than 5 times `sporeDormancySurvival(0.2)` (chapter 05 §8).                                                                                                                                                                                                                                            |
| emergent selection on the cuticle (Phase 2 exit check)                       | Flat landscape, every cell seeded; a desiccation-tolerance allele (value 1.5) given to all 288 founders and a cuticle allele (value 1.5) to 60. Averaged over 5 seeds, the cuticle carriers' frequency rises by more than 0.1 in 40 years where the water table lies 0.15–0.35 m below ground, and falls under permanent water 0.6 m deep. |

The game tests ([`game.test.ts`](../../packages/sim/src/game/game.test.ts)) also check that a
saved and reloaded game continues identically, which covers the world's snapshot.

## 15. Known issues and open questions

1. **The zygotic meiospores are added to perennial sporophytes too.** Every sporophyte alive at
   the month-5 release gets the 4 free `zygoticMeiospores`, including perennials from earlier
   years, although the constant is documented as the products of the zygote's own meiosis.
2. **The ancestral "zygote" is not few-spored.** Nourishment (0.5 _k_² `ΔB_G`) and the propagule
   share are taken from the gametophyte's potential growth before the area-index cap, and
   gametophytes in open water sit at that cap (about 0.69 g per 0.01 m² cell). So even at the
   ancestral _k_ ≈ 0.02 a zygote reaches about 0.9 mg by month 5. In the year after the chapter-1
   burn-in (game seeds `a`, `b`, `c`), open-water individuals released about 2.8–2.9 × 10⁴ spores
   and 2 × 10⁶ propagules each, against the 4 meiospores of a charophyte-like zygote. This weakens
   the antithetic-theory contrast the codex describes. Should nourishment use realised growth, or
   be limited by the embryo's size?
3. **Germling size is decoupled from propagule mass.** A spore of 2–6 × 10⁻⁸ g yields a 10⁻⁵ g
   gametophyte, and a 2 × 10⁻⁶ g propagule a 10⁻⁴ g one, so the spore wall's cost buys no reserves.
4. **The "cannot fertilise without surface water" test does not exercise the water requirement.**
   In its setup every gametophyte dies of desiccation before maturing (checked: 16 of 288 alive at
   month 1, none at month 3, none ever mature). Also, surface wetness never reaches exactly 0
   (the exp(−table / 0.15 m) term), so on emergent ground fertilisation is improbable rather than
   impossible. A test with mature gametophytes and no film is needed.
5. **The water criterion differs between egg and father.** The egg's cell uses
   `max(r, w_s)` as a probability factor; a father's cell needs submergence or `w_s ≥ 0.3` and
   ignores rain; cells in between are not checked. The threshold 0.3 and the sperm ranges
   (≤ 0.14 m emergent, ≤ 0.28 m submerged, centre to centre) need checking against field data on
   bryophyte fertilisation distances.
6. **Two "fertilised" measures.** `YearReport.fertilisationRate` counts perennial sporophytes as
   fertilised, while `ZoneStats.fertilised` counts only this year's fertilisations.
7. **Disturbance** is independent per body and per cell, zone-independent and applied only at the
   year's end, although its comment names floods, erosion and burial, which are spatially
   clustered and depend on position relative to the water.
8. **Zygotic meiosis.** The value 4 assumes one meiosis with all four products viable; charophyte
   zygote output varies among genera (citation to verify).
9. **Nothing in this chapter has a literature source.** The masses, thresholds, allocation shares,
   perennation and disturbance values need either sources or sensitivity analyses.

## References

- Haig, D. (2008). Homologous versus antithetic alternation of generations and the origin of
  sporophytes. _Botanical Review_ 74: 395–418. (Cited in the codex, `sporophyte`.)
