# 03. Plant physiology (light, photosynthesis, water, carbon)

**Status:** v0, implemented in Phase 2, awaiting expert review.
**Code:** [`packages/sim/src/plant`](../../packages/sim/src/plant):
[`photosynthesis.ts`](../../packages/sim/src/plant/photosynthesis.ts) (§3),
[`physiology.ts`](../../packages/sim/src/plant/physiology.ts) (§4–§6),
[`traits.ts`](../../packages/sim/src/plant/traits.ts) (§2).
**Tests:** `pnpm vitest run packages/sim/src/plant` (this chapter's unit tests), `pnpm test` (all).

This chapter specifies how one plant body turns light, CO₂ and water into growth over a month,
and how drying kills it. The life cycle (chapter 04) and the landscape (chapter 05) call these
functions to run whole lineages.

The model rests on one idea. A plant body exchanges CO₂ and water vapour through the same
surfaces. A cuticle slows both, so on its own it buys hydration at the price of photosynthesis.
Stomata help only once a cuticle has sealed the rest of the surface, because only then does
closing the pores stop water loss. Internal water transport (vascular tissue and rooting axes)
keeps tissue above the wet ground hydrated. None of these dependencies is written into the code
as a rule. They follow from the flux equations in §4 and §5.

## 1. Scope

In scope for Phase 2:

- Ten heritable traits with values in (0, 1), built from additive loci and two pleiotropic
  developmental modules (§2).
- C3 leaf photosynthesis: the Farquhar–von Caemmerer–Berry (FvCB) model with the temperature
  functions of Bernacchi et al. (2001), solved together with CO₂ supply through a conductance (§3).
- Two plant bodies built from the traits: a haploid gametophyte and a diploid sporophyte (§4).
- A monthly water and carbon balance for a submerged or emergent body, with cuticle, stomata,
  internal water transport and a desiccation hazard (§5).
- Growth with self-shading, an area-index cap and tissue turnover (§6).

Specified elsewhere: alternation of generations, fertilisation, spores and propagules, carbon
transfer between generations and perennation (chapter 04); the landscape, site water, neighbour
shading and dispersal (chapter 05); epoch climates and atmospheres (chapter 07); the genetics
engine (chapter 01).

Listed in plan §4.3 but not implemented: C4 and CAM photosynthesis, the Medlyn et al. (2011)
stomatal model, a soil water bucket, xylem cavitation, mechanics and hydraulic height limits,
nutrients, and frost and heat damage.

**Units.** CO₂ and Γ\* in µmol mol⁻¹ (ppm); O₂ in mmol mol⁻¹ (210 = 21%); conductances in
mol m⁻² s⁻¹; assimilation and respiration rates in µmol m⁻² s⁻¹; PAR in µmol photons m⁻² s⁻¹;
temperature in °C; vapour pressure deficit (VPD) in kPa; heights and depths in m; biomass in g.
Unless stated otherwise, "per m²" means per m² of photosynthetic tissue.

## 2. Traits and their genetic basis

Every individual carries ten traits, each a number in (0, 1). Chapter 01 specifies the genetics
engine (genomes, mutation, recombination). This section only specifies how a genome becomes
trait values ([`traits.ts`](../../packages/sim/src/plant/traits.ts)).

| Trait (code id)                                | Expressed in                      | Used in this chapter                                                                  |
| ---------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| Desiccation tolerance (`desiccationTolerance`) | both                              | Lowers Vcmax₂₅ (§4.5); lowers the desiccation hazard (§5.7)                           |
| Waxy cuticle (`cuticle`)                       | both (gametophyte at half weight) | Surface conductances to water vapour and CO₂ (§4.1); tissue mass per area             |
| Stomata (`stomata`)                            | sporophyte                        | Maximum stomatal conductance (§4.2); tissue mass per area                             |
| Sporopollenin spore wall (`sporeWall`)         | sporophyte                        | Not used here (chapter 04)                                                            |
| Sporophyte (embryo) development (`sporophyte`) | sporophyte                        | Not used here; the world scales sporophyte growth and survival by it (§7, chapter 04) |
| Upright growth (`stature`)                     | sporophyte                        | Height (§4.4); with `vascular`, tissue mass per area and photosynthetic fraction      |
| Water-conducting tissue (`vascular`)           | sporophyte                        | Height, internal water supply, rooting depth, tissue mass per area                    |
| Rhizoids and rooting axes (`rooting`)          | both                              | Rooting depth, internal water supply, photosynthetic fraction                         |
| Branching (`branching`)                        | sporophyte                        | Photosynthetic fraction (a small cost); its benefit is in chapter 04                  |
| Asexual propagules (`asexual`)                 | gametophyte                       | Not used here (chapter 04)                                                            |

"Expressed in" is the `TRAIT_INFO` metadata. The body functions in §4.3 read exactly these
traits: the gametophyte reads cuticle, rooting and desiccation tolerance; the sporophyte reads
cuticle, stomata, stature, vascular, rooting, branching and desiccation tolerance.

**Architecture** (`createArchitecture`). Each trait has its own additive loci (default 4 per
trait), and each developmental module adds one shared locus: 10 × 4 + 2 = 42 loci. Trait _t_ owns
loci 4·_t_ to 4·_t_ + 3; the module loci follow in the order below.

| Module                     | Loadings λ                               | Rationale given in the code                                                                                                                                |
| -------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phenylpropanoid metabolism | vascular 0.6, sporeWall 0.4, stature 0.4 | Lignin and sporopollenin both draw on phenylpropanoid metabolism (Weng & Chapple 2010). Lignified walls also stiffen axes, so the module loads on stature. |
| Lipid polyester synthesis  | cuticle 0.6, sporeWall 0.4               | Cutin and the spore wall's aliphatic components are both lipid polyesters (no source given).                                                               |

The loading values themselves have no source; they are calibration choices. That lignin and the
spore wall's sporopollenin both come from phenylpropanoid metabolism is labelled
**Established** in the codex (Weng & Chapple 2010).

**Liability and trait value** (`liabilities`, `phenotype`, `basesFromTraits`):

```text
L_t = Σ_{l ∈ loci(t)} x_l  +  Σ_m λ_{m,t} · x_m
x_l = a_{l,1} + a_{l,2}     diploid: sum of both copies
x_l = 2 · a_{l,1}           haploid: the single copy, doubled
z_t = logistic(β_t + L_t),   β_t = logit(z_t^anc)
```

Here _a_ are additive allele values (chapter 01 §3), λ the module loadings, and `z_t^anc` the
scenario's ancestral value of trait _t_, so a genome of zero-valued alleles expresses the ancestral
phenotype. Doubling the haploid copy means a haploid carrying an allele expresses the same value as
a diploid homozygous for it. In the world (§7), gametophyte traits come from the single genome copy
and sporophyte traits from both copies, as the codex entry on alternation of generations says.

Two consequences of the logistic map: an allele's effect on a trait is largest near _z_ = 0.5
and small near 0 or 1, and no trait ever reaches exactly 0 (see §10, item 6). A change Δa in a
module allele's value shifts each loaded trait's liability by λ·Δa (2λ·Δa in a haploid).

## 3. Leaf photosynthesis

Every body uses the C3 model of Farquhar, von Caemmerer & Berry (1980), with temperature
functions from Bernacchi et al. (2001), solved together with the diffusive supply of CO₂
([`photosynthesis.ts`](../../packages/sim/src/plant/photosynthesis.ts)). The FvCB model is the
standard description of C3 leaf photosynthesis (**Established**).

### 3.1 Temperature responses

```text
f(k₂₅, Eₐ, T)    = k₂₅ · exp[ Eₐ (T_K − 298.15) / (298.15 · R · T_K) ]
f_pk(k₂₅, Eₐ, T) = f(k₂₅, Eₐ, T) · [1 + exp((298.15·ΔS − H_d) / (298.15·R))]
                                  / [1 + exp((T_K·ΔS − H_d) / (R·T_K))]
```

with _T_K_ = _T_ + 273.15 and _R_ = 8.314 × 10⁻³ kJ mol⁻¹ K⁻¹. Both functions return _k_₂₅ at
25 °C. `peakedArrhenius` (_f_pk_) adds high-temperature deactivation, normalised so the 25 °C
value is unchanged.

Rates of a leaf at temperature _T_ and O₂ mole fraction _O_ (`leafRates`):

```text
K_c   = f(404.9, 79.43, T)                 µmol mol⁻¹
K_o   = f(278.4, 36.38, T)                 mmol mol⁻¹
Γ*    = f(42.75, 37.83, T) · O / 210       µmol mol⁻¹
K     = K_c · (1 + O / K_o)                µmol mol⁻¹
Vcmax = f_pk(Vcmax₂₅, 65.33, T)            µmol m⁻² s⁻¹
Jmax  = f_pk(r_J · Vcmax₂₅, 50, T)         µmol m⁻² s⁻¹
R_d   = f(r_d · Vcmax₂₅, 46.39, T)         µmol m⁻² s⁻¹
```

Γ\* scales in proportion to O₂ because Γ\* = 0.5·_O_/τ, where τ is Rubisco's CO₂/O₂ specificity
(**Established**). Bernacchi's 42.75 µmol mol⁻¹ is the value at 210 mmol mol⁻¹ O₂. Day
respiration _R_d_ has no deactivation term.

| Parameter                       | Value               | Units        | Source                                                                                         |
| ------------------------------- | ------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| _K_c_ at 25 °C                  | 404.9               | µmol mol⁻¹   | Bernacchi et al. 2001                                                                          |
| _K_o_ at 25 °C                  | 278.4               | mmol mol⁻¹   | Bernacchi et al. 2001                                                                          |
| Γ\* at 25 °C, 210 mmol mol⁻¹ O₂ | 42.75               | µmol mol⁻¹   | Bernacchi et al. 2001                                                                          |
| _E_a_ of _K_c_, _K_o_, Γ\*      | 79.43, 36.38, 37.83 | kJ mol⁻¹     | Bernacchi et al. 2001                                                                          |
| _E_a_ of Vcmax                  | 65.33               | kJ mol⁻¹     | Bernacchi et al. 2001                                                                          |
| _E_a_ of _R_d_                  | 46.39               | kJ mol⁻¹     | Bernacchi et al. 2001                                                                          |
| _E_a_ of Jmax (`EA_JMAX`)       | 50                  | kJ mol⁻¹     | Calibration. The code says it lies inside a published 30–60 kJ mol⁻¹ range but cites no source |
| Deactivation energy _H_d_       | 200                 | kJ mol⁻¹     | "Typical value", Medlyn et al. 2002                                                            |
| Entropy term Δ*S*               | 0.65                | kJ mol⁻¹ K⁻¹ | "Typical value", Medlyn et al. 2002                                                            |
| Gas constant _R_                | 8.314 × 10⁻³        | kJ mol⁻¹ K⁻¹ | Physical constant                                                                              |

With these values Vcmax peaks at 31.7 °C (1.30 × its 25 °C value) and Jmax at 30.3 °C
(1.15 ×). The same _H_d_ and Δ*S* are used for both.

### 3.2 Electron transport

The electron transport rate _J_ is the smaller root of a non-rectangular hyperbola in incident
PAR _I_ (`electronTransport`):

```text
θ·J² − (α·I + Jmax)·J + α·I·Jmax = 0
J = [α·I + Jmax − √((α·I + Jmax)² − 4·θ·α·I·Jmax)] / (2θ)
```

_J_ = 0 when _I_ ≤ 0 or Jmax ≤ 0. The code clamps the discriminant at 0.

### 3.3 Biochemical demand

```text
W_c = Vcmax · (C_i − Γ*) / (C_i + K)                       Rubisco-limited
W_j = J · (C_i − Γ*) / (4·C_i + 8·Γ*)                       electron-transport-limited
A   = min(W_c, W_j) − R_d
```

The _W_j_ form assumes four electrons per carboxylation or oxygenation. Triose-phosphate-use
limitation and mesophyll conductance are not modelled: _C_i_ is taken as the CO₂ mole fraction
at Rubisco.

### 3.4 Supply and demand solved together

CO₂ reaches the tissue through one total conductance _g_ (mol m⁻² s⁻¹, CO₂ basis), so
_A_ = _g_(_C_a_ − _C_i_). Both limitations have the form _A_ = _V_(_C_i_ − Γ\*)/(_C_i_ + _K_) −
_R_d_, with (_V_, _K_) = (Vcmax, _K_) for Rubisco and (_J_/4, 2Γ\*) for electron transport.
Eliminating _C_i_ (`coupledRate`):

```text
A² − b·A + c = 0
b = g·(C_a + K) + V − R_d
c = g·[V·(C_a − Γ*) − R_d·(C_a + K)]
A = (b − √(b² − 4c)) / 2 = 2c / (b + √(b² − 4c))
```

The smaller root is the physical one. The code uses the second form, which is numerically
stable, whenever its denominator is positive, and clamps the discriminant at 0. `assimilate`
then returns

```text
A   = min(A_c, A_j)
C_i = C_a − A / g        (C_a when g = 0)
limitedBy = "rubisco" if A_c ≤ A_j, else "light"
```

Taking the minimum of the two coupled solutions gives the same answer as solving the supply line
against min(_W_c_, _W_j_) − _R_d_, because supply falls and both demands rise with _C_i_.

Limiting cases: with _g_ = 0 the rate is 0 (no exchange at all, so respiration is neither seen
nor lost). In darkness (_J_ = 0) with _g_ > 0, the light-limited root is exactly −*R_d*.

### 3.5 Leaf parameters

All bodies share `DEFAULT_LEAF`, except that desiccation tolerance lowers Vcmax₂₅ (§4.5).

| Parameter                                      | Code         | Value | Units                  | Source                                                  |
| ---------------------------------------------- | ------------ | ----- | ---------------------- | ------------------------------------------------------- |
| Vcmax at 25 °C                                 | `vcmax25`    | 40    | µmol m⁻² s⁻¹           | No source given                                         |
| Jmax₂₅ / Vcmax₂₅                               | `jmaxRatio`  | 1.8   | –                      | Code comment: "≈ 1.7–2 in vascular plants"; no citation |
| _R_d,25_ / Vcmax₂₅                             | `rdFraction` | 0.015 | –                      | Code comment: Collatz et al. (1991) use 0.015           |
| Quantum yield of electron transport (incident) | `alpha`      | 0.24  | mol e⁻ (mol photons)⁻¹ | No source given                                         |
| Curvature of the light response                | `theta`      | 0.7   | –                      | No source given                                         |

Because Jmax₂₅ and _R_d,25_ are set as fractions of Vcmax₂₅, anything that scales Vcmax₂₅ scales
them too.

### 3.6 Reference values

Computed from the code for orientation (not tests). Default leaf, O₂ = 210 mmol mol⁻¹:

| _T_ (°C) | Vcmax | Jmax  | _R_d_ | Γ\*   | _K_    |
| -------- | ----- | ----- | ----- | ----- | ------ |
| 10       | 10.70 | 26.73 | 0.223 | 19.05 | 195.9  |
| 20       | 27.05 | 54.10 | 0.436 | 32.95 | 461.5  |
| 25       | 40.00 | 72.00 | 0.600 | 42.75 | 710.3  |
| 30       | 51.03 | 82.94 | 0.817 | 54.99 | 1093.6 |
| 35       | 47.94 | 70.60 | 1.101 | 70.15 | 1682.0 |
| 40       | 31.17 | 41.72 | 1.471 | 88.80 | 2580.8 |

Net assimilation _A_ (µmol m⁻² s⁻¹) at 25 °C and _I_ = 1000, default leaf, O₂ = 210 mmol mol⁻¹,
for conductances that appear in §4–§5:

| CO₂ conductance _g_                                          | _C_a_ = 400 | 1000  | 3000  |
| ------------------------------------------------------------ | ----------- | ----- | ----- |
| Unlimited (_g_ = 10; light-limited)                          | 11.31       | 13.69 | 14.93 |
| Fully open stomata alone (0.4/1.6 = 0.25)                    | 10.90       | 13.59 | 14.92 |
| Bare surface under water (0.004 and 0.5 in series = 0.00397) | 1.27        | 3.46  | 10.58 |
| Full cuticle, no stomata (1.71 × 10⁻⁴)                       | 0.059       | 0.162 | 0.503 |

Diffusion through water limits a submerged body strongly at today's CO₂ and much less at 3000 ppm,
the level the game's first chapter starts from (chapter 07). A sealed surface without stomata
starves at any CO₂ level in the table.

## 4. Plant bodies

[`physiology.ts`](../../packages/sim/src/plant/physiology.ts) describes each body in a month by a
`Body` record: height, tissue mass per unit photosynthetic area (LMA, g m⁻²), photosynthetic
fraction of biomass, non-stomatal surface conductances to water vapour and to CO₂, maximum
stomatal conductance (water-vapour basis), rooting depth, internal water-supply capacity, leaf
parameters and desiccation tolerance.

### 4.1 Surface conductances and the cuticle

The cuticle expression _c_ ∈ (0, 1) sets the non-stomatal conductance by geometric interpolation
between a wet, uncutinised surface and a complete cuticle (`surfaceConductance`,
`surfaceConductanceCo2`):

```text
g_w(c)   = 0.8^(1−c) · 0.003^c                         water vapour
g_CO2(c) = g_w(c) / [1.6^(1−c) · 17.5^c]                CO₂
```

On a bare surface, CO₂ conductance is the water-vapour conductance divided by 1.6, the ratio of
the two gases' diffusivities in air. Through a complete cuticle it is divided by 17.5: the code
states that CO₂ crosses the cuticle at only about 5.7% of the water-vapour conductance (Boyer,
Wong & Farquhar 1997). Because the ratio itself rises with _c_, each step of cuticle cuts CO₂
conductance by a larger factor than water conductance.

| _c_  | _g_w_ (H₂O) | _g_CO2_     | Ratio |
| ---- | ----------- | ----------- | ----- |
| 0    | 0.800       | 0.500       | 1.60  |
| 0.25 | 0.198       | 0.0680      | 2.91  |
| 0.5  | 0.0490      | 0.00926     | 5.29  |
| 0.75 | 0.0121      | 0.00126     | 9.62  |
| 1    | 0.00300     | 1.71 × 10⁻⁴ | 17.50 |

That cuticles slow water loss is **Established** (Kerstiens 1996). That they impede CO₂ much more
than water vapour comes from leaf measurements by Boyer, Wong & Farquhar (1997); the codex labels
its cuticle entry **Established** as a whole (see §10, item 10).

### 4.2 Stomata

The sporophyte's maximum stomatal conductance to water vapour is _g_s,max_ = 0.4·_s_ for stomata
trait _s_. Its CO₂ conductance is _g_s_/1.6 (**Established**: the ratio of the diffusivities of
water vapour and CO₂ in air). Stomata act in parallel with the surface conductance. How far they
open is set by the water supply (§5.4); they are fully open under water and while surfaces are
wet. The gametophyte has none.

In real plants, stomata occur only on the sporophyte in mosses and hornworts, and liverworts lack
them (**Established**). What the first stomata were for is still debated (codex,
**Well supported**; Edwards, Kerp & Hass 1998).

### 4.3 Gametophyte and sporophyte

Symbols: _c_ cuticle, _s_ stomata, _v_ vascular, _h_ stature, _r_ rooting, _b_ branching,
_d_ desiccation tolerance (all trait values); _H_ sporophyte height (§4.4); _B_ biomass (g).

| Property                              | Gametophyte (`gametophyteBody`)        | Sporophyte (`sporophyteBody`)                             |
| ------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| Cuticle expression _c_                | `0.5 × cuticle trait`                  | `cuticle trait`                                           |
| Height (m)                            | `0.002`                                | _H_(_B_), §4.4                                            |
| LMA (g m⁻²)                           | `15 + 20c`                             | `20 + 20c + 2s + 60vh`                                    |
| Photosynthetic fraction               | `0.9 − 0.3r`                           | `max(0.2, 0.85 − 0.4r − 0.25vh − 0.05b)`                  |
| Surface conductances                  | _g_w_(_c_), _g_CO2_(_c_)               | _g_w_(_c_), _g_CO2_(_c_)                                  |
| Max stomatal conductance              | `0`                                    | `0.4s`                                                    |
| Rooting depth (m)                     | `0.002 + 0.02r`                        | `0.003 + 0.3r(0.2 + 0.8v)`                                |
| Internal supply _k_int_ (mol m⁻² s⁻¹) | `0.0002 + 0.001r`                      | `(0.0002 + 0.008v)(0.25 + 0.75r) / (1 + H/(0.01 + 0.5v))` |
| Leaf                                  | `DEFAULT_LEAF`, `Vcmax₂₅ × (1 − 0.3d)` | same                                                      |

No source is given for any coefficient in this table. They set the relative costs and benefits of
the traits and should be treated as calibration values until sourced (§10, item 13).

- **Gametophyte.** A prostrate thallus 2 mm tall, without stomata or vascular tissue. Cuticle
  genes act at half strength (`GAMETOPHYTE_CUTICLE_EXPRESSION` = 0.5). The code's reason:
  bryophyte gametophytes have much thinner cuticles than sporophytes and depend mostly on external
  water. No source is given. Its surface conductance therefore never falls below
  _g_w_(0.5) = 0.049 mol m⁻² s⁻¹.
- **Sporophyte.** Costs appear as a higher LMA (more grams per m² of tissue, so fewer m² per
  gram) and a lower photosynthetic fraction. Vascular tissue is costly mainly through the `vh`
  term, that is, lignified upright axes. The internal supply falls with height: without vascular
  tissue it halves at _H_ = 1 cm, with full vascular tissue at 51 cm.

A plant that holds its water status steady in dry air (homoiohydry) needs a cuticle, stomata and
vascular tissue together (**Established**; codex, Raven 2002). The sporophyte functions make this
possible without requiring it.

### 4.4 Sporophyte height

```text
H_max = 0.003 + h · (0.03 + 0.5·v)               m      (maxSporophyteHeight)
H(B)  = H_max · B / (B + 2·H_max)                m      (sporophyteHeight)
```

The sporophyte approaches its genetic maximum as it grows, reaching half of it at
_B_ = 2·_H_max_ (a calibration constant with implied units g m⁻¹). _H_max_ ranges from 3 mm to
3.3 cm without vascular tissue and reaches 53.3 cm at _h_ = _v_ = 1. For scale, _Cooksonia_
(about 430 Ma), the oldest widely accepted vascular-plant fossil, was a few centimetres tall
(**Well supported**; codex, Niklas 1997). Height controls contact with the wet substrate (§5.3),
internal supply (§4.3), and, in chapters 04–05, shading of neighbours and spore release.

### 4.5 Cost of desiccation tolerance

Desiccation tolerance _d_ lowers photosynthetic capacity linearly (`leafFor`):

```text
Vcmax₂₅ = 40 · (1 − 0.3·d)
```

Jmax₂₅ and _R_d,25_ fall in the same proportion (§3.5). The benefit is a lower desiccation hazard
(§5.7). That tolerance trades off against growth is **Well supported** (codex; Alpert 2006). The
30% maximum cost is not from a source.

### 4.6 Parameters of §4–§5 (`PHYS` and constants)

| Parameter                                                   | Code                             | Value   | Units       | Source as stated in the code                                                                                                   |
| ----------------------------------------------------------- | -------------------------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| H₂O conductance of a wet, uncutinised surface               | `boundaryLayerConductance`       | 0.8     | mol m⁻² s⁻¹ | None ("boundary-layer limited")                                                                                                |
| Minimum cuticular conductance (full cuticle)                | `minCuticularConductance`        | 0.003   | mol m⁻² s⁻¹ | None. The codex cites Kerstiens (1996) for cuticular water permeability in general                                             |
| Max stomatal conductance (H₂O) at _s_ = 1                   | `maxStomatalConductance`         | 0.4     | mol m⁻² s⁻¹ | None                                                                                                                           |
| CO₂ conductance of the unstirred water layer                | `aquaticConductance`             | 0.004   | mol m⁻² s⁻¹ | None                                                                                                                           |
| PAR attenuation in pond water                               | `waterAttenuation`               | 0.8     | m⁻¹         | None                                                                                                                           |
| Water supply to tissue on a saturated substrate             | `contactSupply`                  | 0.012   | mol m⁻² s⁻¹ | "Near the evaporation rate of free water at a high VPD", no citation. In model terms it equals 0.8 × VPD/_P_ at VPD ≈ 1.52 kPa |
| e-folding height of contact with the wet substrate          | `contactHeight`                  | 0.01    | m           | None                                                                                                                           |
| Capillary fringe above the water table                      | `capillaryFringe`                | 0.3     | m           | None                                                                                                                           |
| Monthly desiccation hazard (fully sensitive, dry all month) | `desiccationHazard`              | 4       | month⁻¹     | None                                                                                                                           |
| Photosynthetic cost at full desiccation tolerance           | `toleranceGrowthCost`            | 0.3     | –           | None (trade-off: Alpert 2006, codex)                                                                                           |
| H₂O : CO₂ diffusivity ratio in air                          | `vapourToCo2`                    | 1.6     | –           | Physical (**Established**)                                                                                                     |
| H₂O : CO₂ conductance ratio of a full cuticle               | `cuticleVapourToCo2`             | 17.5    | –           | Boyer, Wong & Farquhar 1997 ("~5.7%")                                                                                          |
| Atmospheric pressure _P_                                    | `pressure`                       | 101.325 | kPa         | Standard atmosphere                                                                                                            |
| Fraction of clear-day potential realised                    | `fieldEfficiency`                | 0.5     | –           | None ("cloud, low sun angles, variability")                                                                                    |
| Days per month                                              | `daysPerMonth`                   | 30.4    | d           | 365/12                                                                                                                         |
| Gametophyte cuticle expression                              | `GAMETOPHYTE_CUTICLE_EXPRESSION` | 0.5     | –           | None (see §4.3)                                                                                                                |

## 5. Monthly water and carbon balance

`monthBalance(body, climate, site, atm, par, extraSupply = 0)` computes one month of gas exchange
for 1 m² of the body's tissue. `par` is the light reaching the body after shading by neighbours
and before any water column. `extraSupply` (mol m⁻² s⁻¹) adds water from another body; the world
uses it for a sporophyte drawing on its gametophyte (§7).

Inputs. Climate (`MonthClimate`): mean temperature, mean daylight PAR, day length, VPD and
`rainWet`, the fraction of daylight during which surfaces are wet from rain or dew. Site
(`SiteMonth`): water depth, `surfaceWet` (fraction of time the ground surface is wet),
water-table depth and topsoil moisture (0–1). Atmosphere: CO₂ (µmol mol⁻¹) and O₂
(mmol mol⁻¹). Chapter 05 specifies how the landscape generates these.

### 5.1 Time and scaling

Leaf rates are computed once per month at the month's mean temperature and the atmosphere's O₂
(§3.1). Daylight lasts _t_d_ = 3600 × `dayHours` seconds and night _t_n_ = 3600 × (24 −
`dayHours`). Every monthly total is multiplied by _s_ = `fieldEfficiency` × `daysPerMonth` =
0.5 × 30.4 = 15.2 effective days.

### 5.2 Submerged bodies

When the water depth is above 0, the body is always hydrated, but CO₂ must diffuse through
water and light is attenuated. The unstirred water layer and the plant surface act as
resistances in series:

```text
g_tissue = g_CO2(c) + g_s,max / 1.6
g        = 1 / (1/0.004 + 1/g_tissue)
I        = par · exp(−0.8 · depth)
A        = assimilate(g, C_a, I)
```

Hydration is 1 and survival is 1. _C_a_ is the atmospheric CO₂: the water is treated as being in
equilibrium with the air, and only dissolved CO₂ is taken up. Stomata count as fully open.

### 5.3 Emergent bodies: water supply

```text
contact    = 0.012 · surfaceWet · exp(−height / 0.01)
soilAccess = max( soilMoisture, clamp₀₁(1 − (waterTableDepth − rootDepth) / 0.3) )
supply     = contact + k_int · soilAccess + extraSupply
```

Contact supply is water taken up from a wet substrate; it falls off within a few centimetres of
height. Soil access is the larger of topsoil moisture and access to the water table: full when
the rooting depth reaches the table, falling linearly to zero when the table lies 0.3 m (the
capillary fringe) below the roots.

### 5.4 Emergent bodies: demand, stomatal regulation and hydration

```text
D          = VPD / 101.325                                      mol mol⁻¹
E_surface  = g_w(c) · D
g_s,dry    = min( g_s,max, max(0, (supply − E_surface) / D) )    (g_s,max if D = 0)
E_dry      = (g_w(c) + g_s,dry) · D
h_dry      = 1 if E_dry ≤ supply, else supply / E_dry
w          = clamp₀₁(rainWet)
hydration  = w + (1 − w) · h_dry
```

While surfaces are wet (fraction _w_ of daylight), tissue is hydrated and stomata are fully
open. While they are dry, stomata open only as far as the water left after unavoidable surface
losses allows. If the supply cannot even meet surface losses, stomata shut and the tissue is
hydrated for the fraction supply/_E_surface_ of the dry time. Partial hydration is treated as a
fraction of time spent fully hydrated, not as a reduced rate. The resulting `hydration` is
applied to the whole month, nights included.

This is where the cuticle–stomata dependency comes from. On an uncutinised body, surface losses
are as large as the largest possible supply (0.8·_D_ against at most 0.012 mol m⁻² s⁻¹), so
little or no water is left for stomata and they barely change hydration. Behind a cuticle, the
surface loses little and the supply can pay for open stomata.

### 5.5 Emergent bodies: assimilation

```text
A_wet = assimilate(g_CO2(c) + g_s,max / 1.6, C_a, par)
A_dry = assimilate(g_CO2(c) + g_s,dry / 1.6, C_a, par)
Ā     = w · A_wet + (1 − w) · h_dry · A_dry
A_hyd = Ā / hydration      (0 when hydration = 0)
```

_Ā_ is the mean net assimilation over daylight (zero while dehydrated); _A_hyd_ is the mean net
assimilation while hydrated.

### 5.6 Carbon over the month

For both submerged (_A_hyd_ = _A_, hydration = 1) and emergent bodies (`withCarbon`), in µmol per
m² of tissue per month:

```text
dayCarbon            = s · A_hyd · hydration · t_d
nightRespiration     = s · R_d · hydration · t_n
shadedDayRespiration = s · R_d · hydration · t_d
carbonPerArea        = dayCarbon − nightRespiration
```

_A_ is already net of day respiration, so `dayCarbon` is a net gain for sunlit tissue.
`shadedDayRespiration` is what tissue in full shade loses in daylight (§6). Night respiration uses
the same _R_d_ at the month's mean temperature. Dehydrated tissue neither photosynthesises nor
respires.

### 5.7 Desiccation survival

```text
survival = exp( −4 · (1 − hydration) · (1 − d)² )          emergent
survival = 1                                                submerged
```

Fully sensitive tissue (_d_ = 0) that is dry all month survives with probability e⁻⁴ ≈ 0.018.
The quadratic sensitivity means moderate tolerance already removes most of the hazard
(_d_ = 0.5 leaves a quarter of it), while the photosynthetic cost (§4.5) is linear in _d_.

### 5.8 Outputs

| Field                  | Meaning                                                                       | Used by the world? |
| ---------------------- | ----------------------------------------------------------------------------- | ------------------ |
| `dayCarbon`            | Net daytime assimilation per m² of sunlit tissue over the month, µmol         | Yes, via §6        |
| `shadedDayRespiration` | Daytime respiration per m² of shaded tissue over the month, µmol              | Yes, via §6        |
| `nightRespiration`     | Night respiration per m² of tissue over the month, µmol                       | Yes, via §6        |
| `hydration`            | Fraction of the month the tissue was hydrated and metabolically active        | Yes (§7)           |
| `survival`             | Probability of surviving the month's desiccation                              | Yes (§7)           |
| `carbonPerArea`        | `dayCarbon` − `nightRespiration` for one unshaded m², µmol                    | Tests only         |
| `assimilation`         | _A_hyd_, µmol m⁻² s⁻¹                                                         | Tests only         |
| `supplyRatio`          | supply / ((_g_w_ + _g_s,max_)·_D_); ∞ when submerged or when that demand is 0 | Diagnostic only    |

### 5.9 Worked example: when do stomata pay?

The codex says that at CO₂ several times today's level, enough CO₂ diffuses through a cuticle
that stomata add little, and that their advantage grows as CO₂ falls. The model reproduces this.
Ratio of monthly carbon gain (`carbonPerArea`) with stomata 0.8 to stomata 0.02, for a 0.05 g
sporophyte on the physiology tests' damp site and climate (24 °C, PAR 900, VPD 1.2 kPa,
`rainWet` 0.1) with O₂ = 170 mmol mol⁻¹. Hydration is 1 in every case, so the gain is purely in
CO₂ uptake. Computed from the code; not a test.

| CO₂ (ppm) | cuticle 0.3 | cuticle 0.5 | cuticle 0.8 |
| --------- | ----------- | ----------- | ----------- |
| 400       | 1.31        | 3.03        | 7.85        |
| 800       | 1.04        | 1.60        | 3.58        |
| 1500      | 1.01        | 1.10        | 1.88        |
| 2500      | 1.00        | 1.03        | 1.19        |
| 3000      | 1.00        | 1.02        | 1.10        |

Part of the high-CO₂ result comes from the comparison body's residual stomatal conductance
(stomata trait 0.02 gives 0.008 mol m⁻² s⁻¹; §10, item 6).

## 6. Growth, self-shading and turnover

`biomassChange(body, balance, B, area)` converts a month's balance into a change in biomass for
_B_ grams spread over `area` m² of ground:

```text
L      = B · f_p / (LMA · area)                         photosynthetic area index (areaIndex)
A_tot  = L · area                                       m² of tissue
A_sun  = min(A_tot, area · (1 − e^(−k·L)) / k)          k = CANOPY_K = 0.7
C      = dayCarbon · A_sun − shadedDayRespiration · (A_tot − A_sun) − nightRespiration · A_tot
ΔB     = γ · C − 0.03 · B
γ      = GRAMS_PER_UMOL = (12 × 10⁻⁶ / 0.45) · 0.75 = 2.0 × 10⁻⁵ g µmol⁻¹
```

with _f_p_ the photosynthetic fraction. The code calls this the big-leaf approximation: tissue
equivalent to the "sunlit area" `area`·(1 − e^(−*kL*))/_k_ photosynthesises at the full rate for the
light reaching the body's top, the rest only respires, and all tissue respires at night. 3% of
biomass turns over each month.

The world caps biomass at the value that gives the maximum area index (`maxBiomass`):

```text
B_max = MAX_AREA_INDEX · LMA · area / f_p,      MAX_AREA_INDEX = 4
```

| Parameter                    | Code             | Value      | Units    | Source as stated in the code                                                                                         |
| ---------------------------- | ---------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| Light-extinction coefficient | `CANOPY_K`       | 0.7        | –        | Monsi & Saeki 1953                                                                                                   |
| Maximum area index           | `MAX_AREA_INDEX` | 4          | m² m⁻²   | Code: tissue shaded below its compensation point is shed, so canopies and moss mats stay at roughly 3–8. No citation |
| Biomass per µmol CO₂ fixed   | `GRAMS_PER_UMOL` | 2.0 × 10⁻⁵ | g µmol⁻¹ | 45% carbon in biomass, 75% construction efficiency; no citation                                                      |
| Monthly turnover             | (literal)        | 0.03       | month⁻¹  | None                                                                                                                 |

The Beer–Lambert description of light in plant stands goes back to Monsi & Saeki (1953)
(**Established**). How fast light is extinguished depends on the angle and arrangement of the
organs, so _k_ is not a universal constant (**Established**).

**Which limit binds.** In the growth test's conditions (gametophyte, wet site, 24 °C, PAR 900,
CO₂ 2500 ppm), `biomassChange` alone settles at an area index of about 18, because growth
continues while the body's total balance is positive. The deepest layer stops paying for itself
(its gain no longer covers its respiration and turnover) at about 3.6. In the world the cap of 4
therefore sets standing biomass in good conditions, standing in for the shedding of shaded tissue
the code comment describes. Self-shading limits biomass below the cap only when the month's
carbon balance is poor (§10, item 1).

## 7. Where the world model calls these functions

[`World.stepYear`](../../packages/sim/src/world/world.ts) runs these functions for every occupied
cell, every month. The life-cycle rules around them are specified in chapter 04 and the spatial
rules in chapter 05; this list only shows the interface.

- **Atmosphere.** `{ co2: epoch CO₂ (ppm), o2: epoch O₂ (%) × 10 }`, so O₂ is in mmol mol⁻¹.
- **Light.** `par × exp(−CANOPY_K × shade)`, where `shade` sums the area index of taller
  neighbouring sporophytes that overhang the cell (chapter 05).
- **Gametophyte.** `gametophyteBody` with traits from the single genome copy. It lies under its
  own sporophyte, so its light is further multiplied by `exp(−CANOPY_K × sporophyte area index)`.
  Then `monthBalance` (no extra supply), `biomassChange`, diversion of part of any growth to
  propagules and to the sporophyte, the cap at `maxBiomass`, and `areaIndex`. It dies of
  desiccation with probability 1 − `survival`, or of starvation below a biomass threshold.
- **Sporophyte.** `sporophyteBody` with traits from both copies and its current biomass. While its
  gametophyte lives it receives `extraSupply` = (1 − _k_) × gametophyte `hydration` × 0.003
  mol m⁻² s⁻¹, where _k_ is the sporophyte-development trait. Its own growth is
  _k_ × `biomassChange`, it is capped at `maxBiomass`, its height comes from `sporophyteHeight`,
  its area index is _k_ × `areaIndex`, and its desiccation survival is 1 − _k_(1 − `survival`).

## 8. Simplifications

| Simplification                                                                                                                                     | Why                                                                                         | Consequence / when it is lifted                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| One time step per month at mean temperature and mean daylight PAR, scaled by a fixed field efficiency (0.5)                                        | Speed: thousands of bodies, 12 steps per generation                                         | No diurnal or day-to-day variation; light-response curvature is handled only through the fixed factor. Same temperature by day and night       |
| One leaf parameter set for all bodies, apart from the tolerance cost                                                                               | No measured parameter sets for early land plants yet                                        | Gametophyte and sporophyte differ only in conductances, LMA, allocation, height and light                                                      |
| FvCB without mesophyll conductance, triose-phosphate-use limitation or light inhibition of day respiration                                         | Simplest standard form                                                                      | Assimilation at very high CO₂ may be overestimated; day and night respiration are equal                                                        |
| Water balance is a steady state each month: no soil water bucket, tissue water storage, hydraulic conductance or cavitation                        | The simplest model in which cuticle saves water, stomata regulate, and transport resupplies | Hydration is a fraction of time; what happened earlier in the month does not matter. Plan §4.3's bucket and P50 model are not implemented      |
| Stomata follow a supply rule (open as far as supply allows), not the Medlyn et al. (2011) model named in plan §4.3                                 | Needs only supply and demand, which the model already computes                              | Stomata respond to CO₂, light and VPD only through water supply; they are fully open whenever surfaces are wet or submerged                    |
| Surfaces have one conductance set by the cuticle trait, interpolated geometrically between two end points                                          | One trait, two measured end points                                                          | No wax chemistry, cuticle thickness or UV protection. A water film on wet tissue, which would slow CO₂ uptake, is ignored                      |
| Water fluxes are per m² of tissue and independent of area index                                                                                    | Keeps the balance independent of body size                                                  | A dense mat neither humidifies its interior nor shares water; a mat with area index 4 receives four times the substrate water per m² of ground |
| Under water: CO₂ in equilibrium with air, no bicarbonate use, water temperature equal to air temperature, one light-attenuation coefficient        | Phase 2 scope                                                                               | Aquatic carbon-concentrating mechanisms cannot evolve or matter                                                                                |
| Desiccation acts as a hazard; tissue is either hydrated or not                                                                                     | Simplest form that separates tolerant from sensitive tissue                                 | No damage accumulation, no repair cost on rewetting; dry tissue neither photosynthesises nor respires                                          |
| Canopy: shaded tissue gets no light at all, only respires; a hard cap at area index 4 stands in for shedding; all tissue respires at the leaf rate | Cheap and monotonic                                                                         | Underestimates photosynthesis of partly shaded tissue; no separate stem or root respiration                                                    |
| Height is a saturating function of biomass; no mechanics or hydraulic height limit                                                                 | Phase 2 scope (plan §4.3 lists both for later)                                              | Height costs are only those built into LMA, photosynthetic fraction and internal supply                                                        |
| No frost or heat damage; enzyme deactivation is the only high-temperature effect                                                                   | Phase 2 scope                                                                               | Temperature extremes reduce carbon gain but never kill directly                                                                                |

## 9. Tests and validation

`pnpm vitest run packages/sim/src/plant` runs 23 unit tests in three files; all pass at the time
of writing.

**[`photosynthesis.test.ts`](../../packages/sim/src/plant/photosynthesis.test.ts)**

| Test                                             | What it checks                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temperature functions return the 25 °C values    | `arrhenius` and `peakedArrhenius` return _k_₂₅ at 25 °C; Γ\* = 42.75 and _K_ = 404.9(1 + 210/278.4) at 25 °C and 21% O₂                                                |
| Hand calculation of Rubisco-limited assimilation | _K_ = 710.33 and _W_c_ = 25.462 for Vcmax 100, _C_i_ 300. The arithmetic is written out in the test and does not call the model code (§10, item 14)                    |
| Peaked Vcmax                                     | Rises from 25 to 35 °C and falls from 40 to 50 °C                                                                                                                      |
| Electron transport                               | Zero in darkness; below α·_I_ at low light; between 95 and 100 at very high light for Jmax = 100                                                                       |
| Coupled supply and demand                        | For _g_ ∈ {0.002, 0.02, 0.2} and _C_a_ ∈ {400, 2500} at PAR 1200 and 25 °C, _A_ equals _g_(_C_a_ − _C_i_) and an independently coded FvCB demand at the returned _C_i_ |
| Limits                                           | _A_ = 0 when _g_ = 0; _A_ = −*R_d* in darkness with open pores                                                                                                         |
| Directions                                       | _A_ rises with CO₂ and with conductance, and is higher at 150 than at 210 mmol mol⁻¹ O₂                                                                                |
| Diffusion limitation                             | Doubling _g_ from 0.0005 to 0.001 raises _A_ by more than 1.8 × (near-linear, as under water)                                                                          |
| Degenerate quadratic                             | No NaN for _V_ = 0 and tiny _g_                                                                                                                                        |

**[`physiology.test.ts`](../../packages/sim/src/plant/physiology.test.ts)** uses 24 °C, PAR 900,
12 h days, VPD 1.2 kPa, `rainWet` 0.1, CO₂ 2500 ppm and O₂ 170 mmol mol⁻¹, with every trait at
0.02 unless set, on three sites: submerged (0.3 m), damp and dry.

| Test                            | What it checks                                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface conductances            | End points 0.8 and 0.003; H₂O : CO₂ ratios 1.6 and 17.5                                                                                                                           |
| Cuticle under water             | A sporophyte with cuticle 0.8 gains less than 60% of the carbon of a bare one                                                                                                     |
| Cuticle on always-wet surfaces  | With `rainWet` = 1, hydration is 1 and the cuticle lowers carbon gain                                                                                                             |
| Cuticle on drying ground        | Cuticle 0.7 raises hydration and survival by more than 0.5 each on the dry site                                                                                                   |
| Stomata                         | Without a cuticle, stomata 0.8 leave hydration unchanged (to 0.1). Behind cuticle 0.8 at CO₂ 800 ppm, stomata 0.8 keep hydration above 0.99 and raise carbon gain more than 1.5 × |
| Water transport                 | A tall sporophyte (cuticle 0.7, stomata 0.7, stature 0.9, 0.5 g) on dry ground has hydration below 0.8 without, and above 0.99 with, vascular 0.9 and rooting 0.8                 |
| Vascular sporophytes are taller | At 1 g and stature 0.9: below 0.04 m with vascular 0.02, above 0.1 m with vascular 0.9                                                                                            |
| Desiccation tolerance           | A gametophyte on dry ground survives with probability above 0.8 at tolerance 0.9 and below 0.2 at 0.02, and assimilates less when tolerant                                        |
| Growth saturates                | A gametophyte on 0.01 m² of wet ground grows more than 10 × in 4 months from 1 mg, changes by less than 1% between months 23 and 24, and stays below 20 g                         |
| Growth in darkness              | Biomass falls                                                                                                                                                                     |
| Gametophyte cuticle             | The same cuticle trait gives the gametophyte a higher surface conductance than the sporophyte                                                                                     |

**[`traits.test.ts`](../../packages/sim/src/plant/traits.test.ts)**

| Test         | What it checks                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Architecture | 10 × 4 + 2 loci; locus owners; labels such as "Waxy cuticle 2" and "Phenylpropanoid metabolism"             |
| Liabilities  | Per-trait sums over copies; module loadings 0.6, 0.4, 0.4 from one phenylpropanoid allele; haploid doubling |
| Logistic map | Bases from ancestral values reproduce those values at zero liability; logistic(logit(_x_)) = _x_            |

**Emergent check.** The Phase 2 exit check (a cuticle variant spreads where the ground dries and
declines under permanent water) is in
[`world.test.ts`](../../packages/sim/src/world/world.test.ts) and is specified with the life cycle
in chapter 04.

**Not yet done.** Plan §8 and the Phase 2 exit criteria (plan §9) ask physiology tests to
reproduce published response curves. No test yet compares _A_–_C_i_ or light-response curves
with published data (§10, item 14).

## 10. Known issues and open questions

1. **The area-index cap, not self-shading, limits biomass.** In the growth test's conditions,
   `biomassChange` alone settles at an area index of about 18, whereas the deepest layer stops
   paying for itself at about 3.6. In the world, `MAX_AREA_INDEX` = 4 does the limiting. The
   test name ("saturates as the canopy shades itself") and the comment "self-shading caps the
   standing biomass" overstate self-shading's role, and no plant test exercises the cap. Low
   respiration costs contribute: see item 2, and tissue respiration is only leaf _R_d_, 1.5% of
   Vcmax₂₅.
2. **`fieldEfficiency` also scales respiration.** The factor is described as the fraction of the
   clear-day potential realised (cloud, low sun angles, variability), but it multiplies night and
   shaded respiration too, which halves them. The landscape's PAR is already a mean daylight
   value, with a cloudier wet season, so the factor may also double-count cloud.
3. **Stomata conduct CO₂ under water as if gas-filled.** Submerged, `g_s,max/1.6` is added to
   the tissue's CO₂ conductance. With cuticle 0.8 in the physiology test conditions, adding
   stomata 0.8 restores a submerged sporophyte's monthly carbon from 3.29 to 5.43 × 10⁶ µmol m⁻²
   (bare: 5.49 × 10⁶). CO₂ diffuses nearly 10⁴ times more slowly in water than in air, so
   flooded pores should add almost nothing. Once stomata exist, this removes most of the
   cuticle's cost under water.
4. **Boundary layer.** The bare-surface conductance (0.8) is described as boundary-layer
   limited, yet stomatal conductance is added in parallel to it rather than in series, so total
   conductance can exceed it (1.2 mol m⁻² s⁻¹ at _c_ = 0, _s_ = 1). The bare-surface CO₂
   conductance uses the stomatal ratio 1.6; the usual ratio for boundary layers is about 1.37
   (1.6^(2/3)). Both effects are probably small in play.
5. **Mixed temperature parameterisation.** The Vcmax activation energy (65.33 kJ mol⁻¹) comes
   from Bernacchi et al.'s (2001) simple Arrhenius fit but is used inside a peaked function with
   Medlyn et al.'s (2002) deactivation terms. The resulting optima (Vcmax 31.7 °C, Jmax 30.3 °C)
   belong to this combination, not to either source. `EA_JMAX` = 50 kJ mol⁻¹ cites a "published
   30–60 kJ mol⁻¹ range" without a source.
6. **"Absent" structures are never absent.** Logistic traits never reach 0, and conductances are
   linear in trait values with no threshold. The ancestral stomata value in the game's first
   chapter, "Leaving the Water" (0.02), gives a sporophyte 0.008 mol m⁻² s⁻¹ of stomatal
   conductance, 2.7 × the full cuticle's 0.003. The physiology tests also use 0.02 as "no
   stomata". Should a structure below some trait value map to zero?
7. **Construction efficiency applied to losses.** `biomassChange` converts a carbon deficit with
   the same factor (0.75 construction efficiency), so losing 1 µmol of CO₂ removes 2.0 × 10⁻⁵ g
   rather than the 2.67 × 10⁻⁵ g of biomass that holds that carbon. Losses are 25% too small.
8. **The tolerance cost also lowers respiration.** Because Jmax₂₅ and _R_d,25_ are fractions of
   Vcmax₂₅, desiccation tolerance lowers _R_d_ by up to 30% as well. That partly offsets the
   cost, most where respiration is a large share of the budget (shade, darkness).
9. **Units in sporophyte height.** In _H_ = _H_max_·_B_/(_B_ + 2·_H_max_), biomass (g) is added
   to height (m). The constant 2 carries implied units of g m⁻¹ and ties the biomass scale to the
   height scale. It works as a calibration but should be made explicit.
10. **The cuticle's CO₂ ratio needs checking.** The code's 17.5 ("~5.7%", codex "about 6%") is
    attributed to Boyer, Wong & Farquhar (1997). The exact figure, and the species and water
    potential it applies to, have not yet been checked against the paper. The measurements were
    on vascular-plant leaves; whether the ratio carries over to early land-plant cuticles is open.
    The codex labels the whole cuticle entry Established; a reviewer should decide whether the
    CO₂ ratio, which rests on one study, should be Well supported.
11. **Aquatic conductance.** For CO₂ in water equilibrated with air (diffusivity about
    1.9 × 10⁻⁹ m² s⁻¹, solubility about 0.033 mol L⁻¹ atm⁻¹ at 25 °C), 0.004 mol m⁻² s⁻¹
    corresponds to an unstirred layer of about 16 µm. A reviewer should compare this with
    measured boundary layers on submerged plants, and decide whether bicarbonate use by
    charophyte-grade ancestors needs modelling.
12. **Extinction coefficient.** _k_ = 0.7 is attributed to Monsi & Saeki (1953), who introduced
    the Beer–Lambert description; the value itself should be sourced. Upright axes of early
    sporophytes and dense moss mats may well differ from broad-leaved canopies. The same _k_ is
    used for neighbour shading in `world.ts`.
13. **Unsourced values.** No source is given for: Vcmax₂₅ = 40, `jmaxRatio` 1.8, α = 0.24,
    θ = 0.7, `EA_JMAX`, all `PHYS` conductances (0.8, 0.003, 0.4, 0.004), water attenuation 0.8,
    contact supply 0.012, contact height 0.01, capillary fringe 0.3, hazard 4, tolerance cost 0.3,
    field efficiency 0.5, 45% carbon and 75% construction efficiency, `MAX_AREA_INDEX` 4 (and its
    "3–8" range), turnover 3%, the gametophyte cuticle factor 0.5 (and the claim that gametophyte
    cuticles are thinner), the lipid-polyester module and all module loadings, and every
    coefficient in the body table (§4.3). Each needs a source or an explicit "calibrated" label.
    Kerstiens (1996), already in the codex, is a candidate source for the cuticular minimum.
14. **Test gaps.** No test reproduces published response curves, which plan §8 and the Phase 2
    exit criteria require. The "hand calculation" test does not call the model code, so it
    cannot fail if the code changes. The area-index cap and `maxBiomass` are not tested in the
    plant tests.

## References

- Alpert, P. (2006). Constraints of tolerance: why are desiccation-tolerant organisms so small or
  rare? _Journal of Experimental Biology_ 209: 1575–1584.
- Bernacchi, C. J., Singsaas, E. L., Pimentel, C., Portis, A. R. Jr & Long, S. P. (2001).
  Improved temperature response functions for models of Rubisco-limited photosynthesis. _Plant,
  Cell & Environment_ 24: 253–259.
- Boyer, J. S., Wong, S. C. & Farquhar, G. D. (1997). CO₂ and water vapor exchange across leaf
  cuticle (epidermis) at various water potentials. _Plant Physiology_ 114: 185–191.
- Collatz, G. J., Ball, J. T., Grivet, C. & Berry, J. A. (1991). Physiological and environmental
  regulation of stomatal conductance, photosynthesis and transpiration: a model that includes a
  laminar boundary layer. _Agricultural and Forest Meteorology_ 54: 107–136.
- Edwards, D., Kerp, H. & Hass, H. (1998). Stomata in early land plants: an anatomical and
  ecophysiological approach. _Journal of Experimental Botany_ 49: 255–278.
- Farquhar, G. D., von Caemmerer, S. & Berry, J. A. (1980). A biochemical model of photosynthetic
  CO₂ assimilation in leaves of C3 species. _Planta_ 149: 78–90. doi:10.1007/BF00386231
- Kerstiens, G. (1996). Cuticular water permeability and its physiological significance.
  _Journal of Experimental Botany_ 47: 1813–1832.
- Medlyn, B. E. et al. (2002). Temperature response of parameters of a biochemically based model
  of photosynthesis. II. A review of experimental data. _Plant, Cell & Environment_ 25:
  1167–1179.
- Medlyn, B. E. et al. (2011). Reconciling the optimal and empirical approaches to modelling
  stomatal conductance. _Global Change Biology_ 17: 2134–2144.
- Monsi, M. & Saeki, T. (1953). Über den Lichtfaktor in den Pflanzengesellschaften und seine
  Bedeutung für die Stoffproduktion. _Japanese Journal of Botany_ 14: 22–52.
- Niklas, K. J. (1997). _The Evolutionary Biology of Plants_. University of Chicago Press.
- Raven, J. A. (2002). Selection pressures on stomatal evolution. _New Phytologist_ 153: 371–386.
- Weng, J.-K. & Chapple, C. (2010). The origin and evolution of lignin biosynthesis. _New
  Phytologist_ 187: 273–285.
