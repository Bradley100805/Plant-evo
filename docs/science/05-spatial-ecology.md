# 05. Spatial ecology

**Status:** v0, implemented in Phase 2 (a single pond-margin landscape), awaiting expert review.
**Code:** [`packages/sim/src/world/landscape.ts`](../../packages/sim/src/world/landscape.ts)
(`Landscape`, `EnvironmentSpec`, `buildEnvironment`, `wetness`, `ZONES`, `siteAt`) and
[`packages/sim/src/world/world.ts`](../../packages/sim/src/world/world.ts) (`computeShade`, the
fertilisation neighbourhood, `disperse`, `sporeDormancySurvival`, the dispersal constants in
`LIFE`).
**Tests:** `pnpm vitest run packages/sim/src/world`
([`world.test.ts`](../../packages/sim/src/world/world.test.ts)); `pnpm test` runs them with the
rest of the suite.

This chapter specifies the space the lineage lives in: one pond-margin landscape, its seasonal
environment cell by cell and month by month, and the spatial parts of the life cycle: competition
for space and light, the reach of swimming sperm, dispersal of spores and propagules, survival
through the dry season, and the establishment lottery. The life cycle itself is in
[chapter 04](04-life-cycle.md), the physiology that turns site conditions into growth and
survival in [chapter 03](03-plant-physiology.md), and the environmental values for each epoch in
[chapter 07](07-early-earth-environments.md).

[ADR 0007](../adr/0007-chapter-1-world-model.md) records why the first chapter runs on a single
landscape. Not in scope yet (plan §4.6): more than one landscape or patch, gene flow between
populations, soil depth, nutrients, salinity, below-ground competition, biotic guilds and fire.

## 1. The landscape

The landscape is a grid of square cells rising from open water at _x_ = 0 to dry ground at
_x_ = width − 1. The _y_ axis runs along the shore.

| Option        | Default       | Units        | Meaning                                             |
| ------------- | ------------- | ------------ | --------------------------------------------------- |
| `width`       | 48            | cells        | Columns, from open water to dry ground              |
| `height`      | 24            | cells        | Rows along the shore                                |
| `cellSize`    | 0.1           | m            | Side of a cell (cell area 0.01 m²)                  |
| `shoreColumn` | 14            | column       | Where the ground meets the baseline mean lake level |
| `slope`       | 0.055         | m per column | Rise in ground elevation per column                 |
| `relief`      | 0.12          | m            | Amplitude of random relief                          |
| `seed`        | `'landscape'` |              | Seed of the relief                                  |

The default landscape has 1152 cells and covers 4.8 m × 2.4 m. Chapter 1 of the game uses these
defaults with the seed `<game seed>/landscape`, so each game has its own shoreline. None of the
values has a literature source; they are modelling choices that fit the five zones (§3) into one
small grid.

**Elevation** of the cell at (_x_, _y_), relative to the baseline mean lake level:

```
z(x, y) = slope × (x − shoreColumn) + relief × noise(x, y)
```

`noise` is value noise in [−1, 1]: three octaves on grids with spacing 12, 6 and 3 cells and
amplitudes 1, 1/2 and 1/4. Each grid point is uniform in [−1, 1], drawn from the `relief` stream
of the landscape seed. Values between grid points are interpolated bilinearly with smoothstep
weights `t²(3 − 2t)`, and the sum of the octaves is divided by their total amplitude (1.75). The
terrain is fixed for the whole game; only the lake and the climate change between epochs.

With the default seed, elevation runs from −0.78 m to +1.87 m. The mean gradient is 0.055 m per
0.1 m, or 55%.

## 2. Seasons and the monthly environment

`buildEnvironment` turns an epoch's `EnvironmentSpec` (chapter 07) into the climate of each month
and the site conditions of each cell in each month.

### 2.1 Seasons

The year has 12 months, numbered 0–11. A seasonal weight

```
w(m) = 0.5 + 0.5 × cos(2π (m − 2.5) / 12)
```

is 1 at the peak of the wet season (_m_ = 2.5, between months 2 and 3) and 0 at the peak of the
dry season (_m_ = 8.5). Months 0–5 have _w_ > 0.5 and form the **wet season**; months 6–11 have
_w_ < 0.5 and form the **dry season**. Because months fall on whole numbers, _w_ runs from 0.017
to 0.983, and every seasonal quantity spans 96.6% of its nominal range.

Inputs given as a (wettest month, driest month) pair are mixed by
`mix([wet, dry], w) = dry + (wet − dry) × w`.

### 2.2 Climate (the same in every cell)

| Quantity                                                          | Formula                                  | Units                   |
| ----------------------------------------------------------------- | ---------------------------------------- | ----------------------- |
| Air temperature                                                   | `meanTempC + tempSeasonality × (2w − 1)` | °C                      |
| PAR (daytime mean, above any canopy or water)                     | `par × (1 − 0.25 w)`                     | µmol m⁻² s⁻¹            |
| Day length                                                        | 12                                       | h                       |
| Vapour pressure deficit                                           | `mix(vpd, w)`                            | kPa                     |
| Rain and dew wetness _r_ (fraction of daylight with wet surfaces) | `mix(rainWet, w)`                        | fraction                |
| Lake level                                                        | `lakeLevel + lakeSeasonality × (2w − 1)` | m, relative to baseline |

The wet season is therefore warmer, cloudier (PAR up to 25% lower; the 0.25 has no source), more
humid and wetter, and the lake stands higher. VPD is an input, not derived from temperature. The
model has no rainfall amount: "rain" is the fraction of daylight during which surfaces are wet.

### 2.3 Water and soil in each cell

For cell _c_ in month _m_, let `d = lake(m) − z(c)`:

| Quantity               | Submerged (_d_ > 0) | Emergent (_d_ ≤ 0)                         |
| ---------------------- | ------------------- | ------------------------------------------ |
| Water depth            | _d_                 | 0                                          |
| Water-table depth      | 0                   | −*d* (height of the ground above the lake) |
| Surface wetness `w_s`  | 1                   | `min(1, 0.8 r + exp(−table / 0.15 m))`     |
| Topsoil moisture (0–1) | 1                   | `mix(soilMoisture, w)`                     |

- The water table is flat, at the lake's level that month.
- 0.15 m (`SURFACE_FRINGE`) is the "height above the water table over which the ground surface
  stays moist". Rain and dew add 0.8 _r_. Neither value has a source.
- Topsoil moisture is the same in every emergent cell, whatever its height.
- The physiology reads these four values through `siteAt` (chapter 03 §5).

**Dry exposure** of a cell is the fraction of the six dry-season months (6–11) in which it is
emergent. It sets how much of the dry season spores and propagules in that cell must survive
(§7–§8).

### 2.4 Example: the chapter-1 baseline

The chapter-1 baseline (`base` in [`chapter1.ts`](../../packages/sim/src/game/chapter1.ts): mean
25 °C ± 2 °C, PAR 1000, `rainWet` 0.35 / 0.05, `vpd` 0.7 / 1.8 kPa, `soilMoisture` 0.6 / 0.1, lake
level 0 ± 0.25 m) gives these months. The first two epochs use it unchanged; later epochs change
CO₂, O₂ and temperature, and the Hirnantian epoch also the water. The values are set and sourced
in chapter 07; this table only illustrates the formulas.

| Months   | _w_   | Temperature (°C) | PAR | VPD (kPa) | _r_   | Lake (m) | Topsoil moisture |
| -------- | ----- | ---------------- | --- | --------- | ----- | -------- | ---------------- |
| 2 and 3  | 0.983 | 26.9             | 754 | 0.72      | 0.345 | +0.241   | 0.59             |
| 1 and 4  | 0.854 | 26.4             | 787 | 0.86      | 0.306 | +0.177   | 0.53             |
| 0 and 5  | 0.629 | 25.5             | 843 | 1.11      | 0.239 | +0.065   | 0.41             |
| 6 and 11 | 0.371 | 24.5             | 907 | 1.39      | 0.161 | −0.065   | 0.29             |
| 7 and 10 | 0.146 | 23.6             | 963 | 1.64      | 0.094 | −0.177   | 0.17             |
| 8 and 9  | 0.017 | 23.1             | 996 | 1.78      | 0.055 | −0.241   | 0.11             |

## 3. Zones

Each cell is given one of five zones from the number of months it is submerged and, if it is never
submerged, the shallowest depth its water table reaches:

| Index | Zone        | Rule                                                                    |
| ----- | ----------- | ----------------------------------------------------------------------- |
| 0     | open water  | submerged in all 12 months                                              |
| 1     | shallows    | submerged in 6–11 months                                                |
| 2     | margin      | submerged in 1–5 months                                                 |
| 3     | damp ground | never submerged; water table less than 0.4 m down in at least one month |
| 4     | dry ground  | never submerged; water table at least 0.4 m down in every month         |

Zones are labels. They are used for reports, for the chapter goals and to choose where founders
start, but no process reads them: every process uses the per-cell, per-month values of §2. The
thresholds (6 months, 0.4 m) have no source.

With the default seed (`'landscape'`) the zones hold:

| Environment                                  | Open water | Shallows | Margin | Damp ground | Dry ground |
| -------------------------------------------- | ---------- | -------- | ------ | ----------- | ---------- |
| Chapter-1 baseline (lake 0 ± 0.25 m)         | 230        | 133      | 75     | 195         | 519        |
| Hirnantian epoch (lake −0.2 ± 0.25 m, drier) | 147        | 129      | 78     | 189         | 609        |

## 4. Competition for space

Each cell holds at most one genetic individual (chapter 04 §2). An individual with a perennating
body keeps its cell, and arrivals cannot take it (chapter 04 §8). Every other cell is free at the
end of the year and goes to at most one arrival through the establishment lottery (§9). Cells do
not compete for water or nutrients: each cell's water supply depends only on its own site.

## 5. Competition for light: overtopping and shading

At the start of each month, before fertilisation and growth, each cell _c_ with a live body
receives shade from taller sporophytes in its 8 neighbouring cells:

```
h_c     = height of c's sporophyte if it is alive, otherwise 0.002 m (the gametophyte's height)
shade_c = Σ over neighbours j with a live sporophyte and h_j > h_c:
            canopyOverlap × PAI_j × min(1, (h_j − h_c) / overtopHeight)
I_c     = PAR × exp(−0.7 × shade_c)
```

- `canopyOverlap` = 0.3 is the share of a neighbour's canopy that overhangs the cell when it fully
  overtops it, and `overtopHeight` = 0.02 m is the height advantage at which it does. Both were
  tuned in playtesting. The code comment: "A taller neighbour's canopy leans over this cell, more so
  the more it overtops it."
- `PAI_j` is the neighbour sporophyte's photosynthetic area index, already scaled by its
  development trait _k_ (chapter 04 §6.1).
- Heights and area indices are those at the end of the previous month (or at the start of the
  year).
- 0.7 is the light-extinction coefficient `CANOPY_K`, attributed in the code to Monsi & Saeki
  (1953), who introduced the Beer–Lambert description of light in plant stands (chapter 03 §6; the
  value itself is still to be sourced, chapter 03 §10).
- Gametophytes do not shade their neighbours. A gametophyte is also shaded by its own sporophyte:
  `I_G = I_c × exp(−0.7 × PAI_S)` (chapter 04 §4.2). A sporophyte receives `I_c`.
- Neighbours beyond the edge of the grid contribute nothing.

Taller plants shade shorter neighbours, so competition for light is asymmetric (Established).
The codex entry `stature` gives the player-facing account (Niklas 1997).

## 6. The reach of swimming sperm

Fertilisation (chapter 04 §5) is the only within-year interaction between individuals besides
shading. A mature gametophyte can be fertilised by a mature gametophyte at most 1 cell away
(Chebyshev distance; up to 0.14 m centre to centre) when its own cell is emergent, or 2 cells
(up to 0.28 m) when it is submerged. A neighbour can father only if its own cell is submerged or
has surface wetness ≥ 0.3. The egg's chance of fertilisation is scaled by the water film on its own
cell, `max(r, w_s)` or 1 under water.

## 7. Dispersal

After the year's last release and the perennation decisions, every spore and propagule released
this year is dispersed at once (`disperse`). Each arrival is an **offer** to a cell, weighted by
the expected number of viable arrivals it represents; the offers enter the establishment lottery
(§9).

### 7.1 Kernels

A kernel with radius _R_ and scale _s_ (both in cells) holds every integer offset (_dx_, _dy_)
whose Euclidean distance _d_ is at most _R_ + 0.5, including (0, 0), with weight proportional to
exp(−*d*/_s_), normalised to sum to 1. Offsets that fall outside the grid are lost: weights are not
renormalised at the edges.

| Kernel     | _R_ | _s_ | Offsets | Weight on the source cell | Mean distance        | Largest distance |
| ---------- | --- | --- | ------- | ------------------------- | -------------------- | ---------------- |
| Spores     | 3   | 1.5 | 37      | 0.104                     | 1.75 cells (0.175 m) | √10 ≈ 3.16 cells |
| Propagules | 2   | 0.8 | 21      | 0.274                     | 1.06 cells (0.106 m) | √5 ≈ 2.24 cells  |

### 7.2 Spores

A parent cell _p_ released `s0` spores in month 5 and `s1` in month 11. Both releases share its
release height _h_ (the tallest height its sporophyte had at either release this year) and its
spore-wall trait _wall_ (the parent sporophyte's). Each release with spores is dispersed
separately, judged by the water in its own month:

```
Month-5 release:  viable(c) = s0 × survive(c),   rain = s0 × D
Month-11 release: viable(c) = s1,                rain = s1

submerged  = cell p is under water in the release month
escape     = 1 if submerged, otherwise h / (h + escapeHeight)      escapeHeight = 0.005 m
windborne  = escape × h / (h + windHeight)                         windHeight   = 0.05 m
local      = escape − windborne
nearby     = 0.3 + 0.7 × wall
airborne   = 0.1 + 0.9 × wall
D          = sporeDormancySurvival(wall)                           (§8)
survive(c) = 1 − dryExposure(c) × (1 − D)
```

Each release makes these offers:

| Destination                          | Weight                                           |
| ------------------------------------ | ------------------------------------------------ |
| The parent's own cell (trapped)      | `(1 − escape) × nearby × g(p) × viable(p)`       |
| Each kernel offset, to cell _c_      | `local × K(offset) × nearby × g(c) × viable(c)`  |
| The landscape-wide spore rain (§7.4) | `windborne × airborne × rain`, pooled per parent |

_g_(_c_) is the germination factor of the landing cell (§9). Spores released in month 5 must last
through the dry season (`survive`, and _D_ for the spore rain); those released in month 11 need
not.

The code comments give the reasoning: "Spores shed at mat level are mostly trapped in the parent's
own patch; raising the sporangia lets them escape into moving air. Under water, currents carry them
off. Each release is judged by the water at its own month." `escapeHeight` and the `airborne`
formula were tuned in playtesting. The code does not say what `nearby` and `airborne` represent;
read with the trait description ("A tough wall that lets spores survive drying, UV and travel
through air"), they are the share of spores that survive the journey, near the ground and in the
air respectively.

How release height splits one release from a parent whose cell is emergent in the release month:

| Release height _h_ | Trapped in own cell | Local kernel | Spore rain |
| ------------------ | ------------------- | ------------ | ---------- |
| 1 mm               | 0.833               | 0.163        | 0.003      |
| 3 mm               | 0.625               | 0.354        | 0.021      |
| 5 mm               | 0.500               | 0.455        | 0.045      |
| 1 cm               | 0.333               | 0.556        | 0.111      |
| 2 cm               | 0.200               | 0.571        | 0.229      |
| 5 cm               | 0.091               | 0.455        | 0.455      |
| 10 cm              | 0.048               | 0.317        | 0.635      |

The local kernel returns a further 10.4% of its share to the parent's own cell. A parent that is
under water in the release month traps nothing (`escape` = 1) and splits that release between the
local kernel and the spore rain by the second factor alone. Where a cell is under water at the
month-5 release but exposed at the month-11 release (part of the shallows under the chapter-1
baseline), the first release is water-dispersed and the second is not.

Spores released from higher up travel further (Well supported; codex `stature`, Niklas 1997).

### 7.3 Propagules

Propagules use the propagule kernel only: no trapping term and no spore rain. For a parent that
released `a0` propagules in month 5 and `a1` in month 11, the offer to cell _c_ at each kernel
offset is

```
K(offset) × v(c) × (a1 + a0 × (1 − dryExposure(c)))
```

where _v_(_c_) is the propagule viability of the landing cell (§9). Propagules released in month 5
survive the dry season only in proportion to the share of dry-season months their landing cell
stays under water; they have no dormancy. Unwalled gemmae and fragments survive only in water or
on wet ground (Established; codex `asexual`).

### 7.4 The landscape-wide spore rain

The spore-rain weights of all parents are summed to _G_. Every cell _c_ then receives one offer of
weight `(G / n) × g(c)`, where _n_ is the number of cells, so windborne spores fall evenly over the
whole landscape. If that offer wins the cell, the parent is drawn in proportion to its share of
_G_, from an alias table (chapter 01 §2). The spore rain stays on the landscape: none of it is lost
off the edge, and none arrives from outside.

## 8. Spore dormancy survival

The chance that a spore survives the dry season in the soil rises steeply with the quality of its
wall:

```
D(wall) = (0.02 + 0.98 × wall)²
```

| Spore wall      | _D_    |
| --------------- | ------ |
| 0               | 0.0004 |
| 0.2             | 0.047  |
| 0.3 (ancestral) | 0.099  |
| 0.5             | 0.26   |
| 0.9             | 0.81   |
| 1               | 1      |

It is applied only to spores released in month 5:

- spores in the parent's own cell or the local kernel survive with probability
  `1 − dryExposure(c) × (1 − D)`, so fully in a cell that stays under water through the dry season
  and with probability _D_ in one that is exposed all season;
- spores in the spore rain always survive with probability _D_, wherever they land.

The form of the curve and its constants have no source. Sporopollenin walls let spores survive
drying and ultraviolet light, and the oldest evidence of land plants is walled spores
(Established; codex `sporeWall`; Rubinstein et al. 2010 for the cryptospores).

## 9. The establishment lottery

The landing conditions are read from **month 0** (the start of the next wet season) of the
environment of the year just simulated:

| Factor                       | Submerged in month 0 | Emergent in month 0       |
| ---------------------------- | -------------------- | ------------------------- |
| Spore germination _g_(_c_)   | 0.8                  | `w_s` in month 0          |
| Propagule viability _v_(_c_) | 1                    | `0.5 × (w_s in month 0)²` |

None of these values has a source.

**Lottery.** Each cell keeps a running total `W_c` of the weights offered to it and a provisional
winner. Each offer adds its weight to `W_c` and replaces the winner with probability
(its weight) / `W_c`. This is weighted reservoir sampling with a sample of one: after all offers,
each offer has won with probability equal to its weight divided by the final `W_c`, whatever the
order in which offers arrived. Offers are made parent by parent in cell order (the month-5 spores,
then the month-11 spores, then propagules), then the spore rain cell by cell.

**Establishment.** Then, for each cell:

1. A cell held by a perennial keeps its occupant and genome; its offers are ignored.
2. Otherwise, if it received any offer, an individual establishes with probability
   `1 − exp(−establishment × W_c)`, with `establishment` = 10⁻³ ("probability that one viable
   arriving propagule founds an individual in an empty cell"). The occupant comes from the winning
   offer, and its genome is made as in chapter 04 §10.
3. Otherwise the cell is empty next year.

So each viable arrival founds an individual independently with probability 10⁻³, and the cell
goes to one arrival drawn in proportion to its contribution. This is the lottery model of
competition for space (Chesson & Warner 1981), with no advantage to residents beyond perennation.
The value 10⁻³ has no source.

## 10. Initial conditions in the game

`Game.create` places a founder, as a propagule-grown gametophyte (chapter 04 §4.1), in every cell
of the zones listed in the scenario's `startZones` (open water and shallows in chapter 1), then
runs a 40-year burn-in in the first epoch's environment. Each epoch then runs 100 years in its own
environment (chapter 07). The landscape stays the same throughout; each epoch's lake level and
climate re-draw the zones.

## 11. Parameters

| Name                                | Value                     | Units         | Meaning                                                              | Source                                |
| ----------------------------------- | ------------------------- | ------------- | -------------------------------------------------------------------- | ------------------------------------- |
| Landscape options                   | see §1                    |               | Grid, cell size, shore, slope, relief                                | Modelling choice                      |
| Season shape                        | cosine, peak at month 2.5 |               | Seasonal weight _w_                                                  | Modelling choice                      |
| Wet-season cloudiness               | 0.25                      | (fraction)    | Reduction of PAR at _w_ = 1                                          | Modelling assumption                  |
| Day length                          | 12                        | h             | Every month                                                          | Modelling assumption                  |
| Rain contribution to `w_s`          | 0.8 _r_                   | (fraction)    | Surface wetness of emergent ground from rain and dew                 | Modelling assumption                  |
| `SURFACE_FRINGE`                    | 0.15                      | m             | E-folding height of surface wetness above the water table            | Modelling assumption                  |
| Zone thresholds                     | 6 months; 0.4 m           |               | Shallows vs margin; damp vs dry ground                               | Modelling choice                      |
| Gametophyte height for shade        | 0.002                     | m             | Reference height of a cell without a live sporophyte                 | `gametophyteBody` height (chapter 03) |
| `canopyOverlap`                     | 0.3                       | (fraction)    | Share of a fully overtopping neighbour's canopy over the cell        | Playtesting                           |
| `overtopHeight`                     | 0.02                      | m             | Height advantage for full overtopping                                | Playtesting                           |
| `CANOPY_K`                          | 0.7                       |               | Light-extinction coefficient                                         | Monsi & Saeki 1953 (chapter 03)       |
| `sporeRadius`, `sporeScale`         | 3, 1.5                    | cells         | Spore kernel                                                         | Modelling assumption                  |
| `propaguleRadius`, `propaguleScale` | 2, 0.8                    | cells         | Propagule kernel                                                     | Modelling assumption                  |
| `escapeHeight`                      | 0.005                     | m             | Release height at which half the spores escape the parent's cell     | Playtesting                           |
| `windHeight`                        | 0.05                      | m             | Release height at which half the escaping spores join the spore rain | Modelling assumption                  |
| `nearby`                            | 0.3 + 0.7 × wall          | (fraction)    | Survival factor of trapped and local spores                          | Modelling assumption                  |
| `airborne`                          | 0.1 + 0.9 × wall          | (fraction)    | Survival factor of spores in the spore rain                          | Playtesting                           |
| Dormancy survival                   | (0.02 + 0.98 × wall)²     | (probability) | Survival of a month-5 spore through a fully exposed dry season       | Modelling assumption                  |
| Germination under water             | 0.8                       | (fraction)    | Spore germination factor in a submerged cell                         | Modelling assumption                  |
| Propagule viability on land         | 0.5 × `w_s`²              | (fraction)    | In an emergent cell                                                  | Modelling assumption                  |
| `establishment`                     | 10⁻³                      | (probability) | Chance that one viable arrival founds an individual                  | Modelling assumption                  |
| Sperm range, father's wetness       | 1 or 2 cells; 0.3         |               | See §6 and chapter 04 §5                                             | Modelling assumption                  |

"Playtesting" marks values introduced or tuned while playtesting chapter 1 (selection scans and
head-to-head runs, per the commit that added them). The environmental inputs (`EnvironmentSpec`)
are set and sourced in chapter 07.

## 12. Simplifications

| Simplification                                                                                                        | Why                                                       | What it affects, and what it does not                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One small landscape (4.8 m × 2.4 m) of 10 cm cells, one individual per cell                                           | Hundreds of generations per epoch must run in the browser | Population size is at most 1152, so drift is strong and there is no gene flow from other populations. Each cell's gametophyte stands for a patch, not one tiny plant. |
| A planar slope with random relief, fixed for the whole game                                                           | Gives every zone in one grid                              | No erosion, sedimentation or channels. The gradient is steep (§1).                                                                                                    |
| Climate is the same in every cell                                                                                     | No microclimate model yet                                 | Cells differ only in water depth, water table, surface wetness, dry exposure and shading. Light under water is attenuated in the physiology (chapter 03).             |
| The water table is flat at the lake's level, with no lag; topsoil moisture is the same in every emergent cell         | Simplest hydrology tied to the lake                       | Dry ground is dry because of its height above the lake, not its distance from it. Rain does not recharge the water table.                                             |
| Fixed 12-hour days                                                                                                    | Latitude is not modelled                                  | No seasonal day length.                                                                                                                                               |
| Isotropic kernels measured in cells, no wind direction; local dispersal is lost at edges but the spore rain is closed | Simple and fast                                           | No directional gene flow along slopes or prevailing winds. Changing `cellSize` changes the kernels' physical scale.                                                   |
| Shading only from the 8 neighbours, using last month's sizes; no below-ground competition                             | Neighbours closer than one canopy width dominate shading  | Tall plants shade only adjacent cells. Water is never competed for.                                                                                                   |
| Germination and viability read from month 0 of the year just simulated                                                | One evaluation per year                                   | At an epoch change, arrivals are judged by the old epoch's conditions for one year.                                                                                   |
| Zones are labels only                                                                                                 | Processes use continuous site values                      | Zone thresholds affect reports and goals, not survival or growth.                                                                                                     |
| Expected numbers of arrivals, one winner per free cell                                                                | Speed: no per-spore bookkeeping                           | Chance enters through the lottery and establishment draws only. Each cell's expected contribution from each parent is exact.                                          |

## 13. Tests

Run with `pnpm vitest run packages/sim/src/world` (9 tests, all passing). The tests that bear on
this chapter:

| Test (`world.test.ts`)                                                   | What it checks                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| landscape › rises from open water to dry ground                          | The default landscape (48 × 24, seed `'landscape'`) under the test file's Ordovician-like environment has at least one cell in every zone; the cell at (0, 0) is open water and the cell at (47, 0) is dry ground; the cell at (14, 0) is at least as deep in month 2 as in month 8. |
| world › keeps the ancestral alga in the water and loses it on dry ground | The spatial pattern of the life cycle: after 31 years, more than half of the open-water cells hold a reproducing sporophyte and no dry-ground cell does (chapter 04 §14).                                                                                                            |
| world › cannot fertilise without surface water                           | No fertilisation on a flat landscape far above the lake, with no rain (chapter 04 §14).                                                                                                                                                                                              |
| world › spore walls improve dry-season survival                          | `sporeDormancySurvival(0.9)` is more than 5 times `sporeDormancySurvival(0.2)` (§8).                                                                                                                                                                                                 |
| emergent selection on the cuticle (Phase 2 exit check)                   | A cuticle variant spreads on seasonally drying ground and declines under permanent water (chapter 04 §14).                                                                                                                                                                           |

## 14. Known issues and open questions

1. **The slope is steep for a pond margin.** 0.055 m per 0.1 m cell is a 55% gradient (about
   29°); the default ground rises about 2.6 m across 4.7 m. It fits all five zones into 48 columns.
   A gentler, larger landscape would also need the kernels and sperm ranges, which are in cells,
   rescaled.
2. **Both spore releases use one release height.** _h_ is the taller of the sporophyte's heights
   at the two releases, so month-5 spores can be dispersed from a height reached only by month 11.
3. **Dry-season survival is treated differently by route.** Local spores and propagules use the
   landing cell's dry exposure, so they survive fully in a cell submerged through the dry season,
   whatever their wall. Spores in the spore rain always pay the full dormancy factor, even when they
   land in permanent water.
4. **The shading reference height ignores the gametophyte when a sporophyte is present.** A cell
   with a live sporophyte uses that sporophyte's height (0 for a new zygote) rather than
   max(sporophyte, 0.002 m), so a gametophyte carrying a small sporophyte can be shaded by
   neighbours shorter than itself.
5. **Germination is higher on wet emergent ground than under water.** A submerged cell has spore
   germination 0.8, an emergent cell with surface wetness 1 has 1.0.
6. **Edges are treated inconsistently.** Local spores and propagules that fall off the grid are
   lost, while the spore rain is closed (none lost, none arriving). The along-shore edges are not
   wrapped, so edge cells receive fewer local arrivals.
7. **The hydrology is minimal.** The water table is flat at lake level; topsoil moisture does not
   depend on height; there are two fringe heights with different values (`SURFACE_FRINGE` = 0.15 m
   here, `PHYS.capillaryFringe` = 0.3 m in chapter 03).
8. **Seasonal amplitudes are 96.6% of their documented values** because months are sampled at
   whole numbers (_w_ from 0.017 to 0.983). The lake also peaks in the warmest month, a modelling
   choice that chapter 07 should confirm.
9. **The propagule kernel ignores the ground between source and landing cell,** although the
   header comment of `world.ts` says propagules "only move short distances through wet ground".
10. **Few parameters have sources.** Kernel scales, escape and wind heights, `nearby`,
    `airborne`, the dormancy curve, germination factors, the establishment constant and the zone
    thresholds are modelling assumptions or playtesting values.
11. **Tests are thin for this chapter.** The lake-seasonality assertion also passes if cell
    (14, 0) is dry in both months. No test checks the zone thresholds, kernel normalisation, the
    lottery's proportional sampling or the shading formula.

## References

- Chesson, P. L. & Warner, R. R. (1981). Environmental variability promotes coexistence in lottery
  competitive systems. _American Naturalist_ 117: 923–943.
- Monsi, M. & Saeki, T. (1953). Über den Lichtfaktor in den Pflanzengesellschaften und seine
  Bedeutung für die Stoffproduktion. _Japanese Journal of Botany_ 14: 22–52. (Cited for
  `CANOPY_K` in `physiology.ts` and in chapter 03.)
- Niklas, K. J. (1997). _The Evolutionary Biology of Plants_. University of Chicago Press. (Cited
  in the codex, `stature`.)
- Rubinstein, C. V., Gerrienne, P., de la Puente, G. S., Astini, R. A. & Steemans, P. (2010).
  Early Middle Ordovician evidence for land plants in Argentina (eastern Gondwana). _New
  Phytologist_ 188: 365–369. (Cited in the codex, `sporeWall`, and in chapter 02.)
