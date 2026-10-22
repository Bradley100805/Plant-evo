# 01. Population genetics

**Status:** v0, implemented in Phase 1, awaiting expert review.
**Code:** [`packages/sim/src/genetics`](../../packages/sim/src/genetics),
[`packages/sim/src/rng`](../../packages/sim/src/rng).
**Tests:** `pnpm test` (unit + statistical), `STATS_SEED=random pnpm test:stats`.

This chapter specifies the population-genetics engine: how genomes are stored, how one
generation produces the next, and how the engine is checked against theory. Every lineage in
the game will run on it.

## 1. Scope

In scope for Phase 1:

- Finite populations of haploid or diploid individuals, sexual or clonal, with optional selfing.
- Discrete loci with additive allele values; recombination between adjacent loci.
- Mutation under several models, with allele identity and ancestry tracked.
- Selection through a pluggable fitness function (placeholder models, see §5).
- Analytical expectations used for validation and shown in the Lab.

Deferred to later phases: emergent fitness from physiology and life cycle (Phase 2), spatial
structure and gene flow (Phase 3), varying population size, polyploidy, hybridization and
speciation (Phase 7), alternation of haploid and diploid generations (Phase 2).

## 2. The generation cycle

The engine is an individual-based **Wright–Fisher** model: generations do not overlap and the
population size N is constant. One generation (`stepGeneration`) runs:

1. **Fitness.** Each individual _i_ gets a relative fitness _wᵢ_ ≥ 0 from the fitness model.
   If every _wᵢ_ is 0, the step reports extinction and changes nothing.
2. **Parent sampling.** Each of the N offspring draws a mother with probability
   _wᵢ / Σw_, with replacement, using a Walker/Vose alias table (O(1) per draw).
3. **Mating.**
   - _Sexual, random union (default):_ the father is drawn independently in the same way, so
     selfing happens with probability about 1/N, as in the classic Wright–Fisher model.
   - _Sexual, with selfing rate σ:_ with probability σ the mother also acts as father;
     otherwise the father is redrawn until he differs from the mother.
   - _Clonal:_ the offspring copies the mother's genome.
4. **Meiosis and recombination.** A diploid parent passes one recombinant copy: the gamete
   starts on a random parental copy and switches copy between loci _l − 1_ and _l_ with
   probability _rₗ_ (0 ≤ _rₗ_ ≤ 0.5). In a haploid sexual life cycle, the offspring is a
   recombinant of the two parents' single copies (gamete fusion followed by immediate meiosis).
5. **Mutation.** Each locus of each transmitted copy mutates with probability μ. The engine
   jumps straight to the next mutated locus with a geometric draw instead of testing every
   locus, which keeps low mutation rates cheap.

With uniform fitness, every gene copy in the next generation is an independent uniform draw
from the 2N (diploid) or N (haploid) copies of the current one. That is exactly the
Wright–Fisher sampling scheme, so classic results apply with Nₑ = N.

Fitness acts through the number of offspring sampled, which combines viability and fecundity
selection into one step. Separate survival and reproduction stages arrive with the life-cycle
model in Phase 2.

## 3. Genomes, alleles and ancestry

- A genome is an array of **allele ids**, laid out as
  `genomes[(individual × ploidy + copy) × loci + locus]` in a `Uint32Array`.
- The **allele table** records, for every id: its additive _value_, its _locus_, its _parent_
  id (the allele it mutated from), and the generation it arose in.
- Every mutation creates a new id, even when the new value equals the parent's. Identity by
  descent is therefore always tracked (infinite-alleles identity), while the _value_ carries
  identity in state for phenotypes and fitness.
- Ids are allocated in increasing order, so a parent always has a smaller id than its children.
  That makes "this allele and all its descendants" a single forward pass.
- **Compaction** runs when the table exceeds 2 × (gene copies × loci) + 4096 entries. It drops
  alleles that are neither present nor ancestors of a present allele, renumbers the survivors
  in order, and rewrites the genomes.
- **Pins** keep a chosen allele and its ancestry alive across compaction. The Mutation Draft
  will pin each variant the player introduces, so its fate can be followed even after loss.

## 4. Mutation models

| Model                   | New allele value                  | Use                                                     |
| ----------------------- | --------------------------------- | ------------------------------------------------------- |
| `neutralRelabel`        | same as parent                    | Neutral identity-by-descent studies (infinite alleles)  |
| `toggle(a, b)`          | the other of two states           | Biallelic loci with back mutation                       |
| `oneWay(target)`        | always `target`, no back mutation | Loss-of-function / deleterious alleles                  |
| `gaussianIncrement(σₘ)` | parent + Normal(0, σₘ²)           | Quantitative traits (continuum of alleles; Kimura 1965) |

**Mutation rate units.** μ is per _locus_ per transmitted copy per generation. A locus in this
engine stands for a gene or trait-determining region, not a single nucleotide. For scale, the
measured per-nucleotide rate in _Arabidopsis thaliana_ is about 7 × 10⁻⁹ per site per
generation (Ossowski et al. 2010). Per-gene rates are much higher because a gene has many sites.
The game will compress evolutionary time and raise mutation supply accordingly (see plan §4.9).
The codex must say so.

## 5. Fitness models (Phase 1 placeholders)

These specify fitness directly. They exist to validate the engine against theory and to drive
the Lab. From Phase 2, fitness in the game will be measured from simulated growth, survival
and reproduction instead (design pillar 3).

| Model                     | Fitness                                                                                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neutral`                 | _w_ = 1                                                                                                                                                                                                                                                                             |
| `singleLocusSelection`    | Diploid: 1, 1 + _hs_, 1 + _s_ for 0, 1, 2 mutant copies. Haploid: 1 or 1 + _s_. Clamped at 0.                                                                                                                                                                                       |
| `multiplicativeSelection` | Product of the single-locus fitness over all loci                                                                                                                                                                                                                                   |
| `TraitSelection`          | Phenotype _z_ = _G_ + _E_, with _G_ the sum of allele values over loci and copies and _E_ ~ Normal(0, Vₑ) drawn fresh each generation. Fitness from: Gaussian stabilizing _w_ = exp(−(_z_ − θ)² / 2ω²), directional _w_ = exp(β_z_), or truncation (top fraction reproduce equally) |

## 6. Randomness and reproducibility

- All randomness comes from a seeded **xoshiro128\*\*** generator (Blackman & Vigna 2021),
  checked against the reference algorithm's output in unit tests.
- Each population derives independent named streams from its seed: `setup`, `reproduction`,
  `mutation`, `fitness` and `intervention`. A stream depends only on the seed and its name,
  never on how many numbers other streams have used.
- A useful consequence: under neutrality, changing the mutation rate leaves the genealogy (who
  descends from whom) unchanged, because parent sampling and recombination use their own
  stream. A unit test checks this.
- Player actions use the `intervention` stream, so introducing a variant never reshuffles the
  rest of the run.
- A golden-seed snapshot test fails if the order or meaning of random draws changes. Any such
  change must be deliberate, because saved games would no longer replay identically.
- ESLint forbids `Math.random`, `Date.now` and `performance.now` in the simulation core.
- **Caveat:** `Math.log` and `Math.sqrt` (used for normal and geometric draws) are
  bit-identical within one JavaScript engine but not guaranteed across engines (plan §7.4).

## 7. Analytical expectations

Implemented in [`theory.ts`](../../packages/sim/src/genetics/theory.ts). _C_ is the number of
gene copies: 2N for diploids, N for haploids.

| Quantity                                   | Expression                                                                                                                            | Source                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Fixation probability, neutral              | _u_(_p_) = _p_                                                                                                                        | Wright 1931; Kimura 1962          |
| Fixation probability, additive selection   | _u_(_p_) = (1 − e^(−2N_sp_)) / (1 − e^(−2N_s_)), diploid genotypes 1, 1 + _s_/2, 1 + _s_; same form for haploids with fitness 1 + _s_ | Kimura 1962                       |
| Fixation probability, dominance _h_        | _u_(_p_) = ∫₀ᵖ G / ∫₀¹ G, G(_x_) = exp(−4N_s_[_hx_ + (1 − 2_h_)_x_²/2]), integrated numerically                                       | Kimura 1962                       |
| New beneficial mutation, large N           | _u_ ≈ 2 × (advantage per copy)                                                                                                        | Haldane 1927                      |
| Gene diversity under drift                 | _H_ₜ = _H_₀(1 − 1/_C_)ᵗ                                                                                                               | Wright 1931                       |
| Variance of allele-frequency change        | Var(Δ_p_) = _p_(1 − _p_)/_C_                                                                                                          | Wright 1931                       |
| Hardy–Weinberg proportions                 | _q_², 2_pq_, _p_² after one generation of random mating                                                                               | Hardy 1908; Weinberg 1908         |
| Mutation–selection balance                 | _q̂_ ≈ μ/(_hs_) for _h_ > 0; _q̂_ ≈ √(μ/_s_) when recessive                                                                             | Haldane 1927; Crow & Kimura 1970  |
| Infinite-alleles equilibrium diversity     | _F_ = (1 − μ)² / (_C_ − (_C_ − 1)(1 − μ)²), _H_ = 1 − _F_ ≈ θ/(1 + θ), θ = 2_C_μ                                                      | Kimura & Crow 1964                |
| Response to selection (breeder's equation) | _R_ = _h_²_S_, with _h_² = Vₐ/Vₚ                                                                                                      | Lush 1937; Falconer & Mackay 1996 |

## 8. Validation

The statistical suite
([`popgen.stats.test.ts`](../../packages/sim/src/genetics/popgen.stats.test.ts)) runs each
check with many replicates. A check passes when |observed − expected| is under
4 standard errors, plus a small allowance where the theory is itself an approximation
(5% relative for diffusion results). Results with the default seed (`plant-evo`):

| Check                                        | Setup                                             | Observed | Expected | Tolerance |
| -------------------------------------------- | ------------------------------------------------- | -------- | -------- | --------- |
| Neutral fixation, diploid                    | N = 50, _p_₀ = 0.2, 3000 replicates               | 0.2003   | 0.2000   | ±0.029    |
| Neutral fixation, haploid                    | N = 100, _p_₀ = 0.1, 3000 replicates              | 0.0907   | 0.1000   | ±0.022    |
| Single beneficial mutant, diploid            | N = 100, _s_ = 0.04, _h_ = 0.5, 20 000 replicates | 0.0395   | 0.0392   | ±0.0075   |
| Single beneficial mutant, haploid            | N = 200, _s_ = 0.05, 10 000 replicates            | 0.0942   | 0.0952   | ±0.0165   |
| Deleterious allele from 10%                  | N = 50, _s_ = −0.02, _h_ = 0.5, 5000 replicates   | 0.0346   | 0.0347   | ±0.0121   |
| Gene diversity after 60 generations, diploid | N = 50, 100 loci × 40 replicates                  | 0.2775   | 0.2736   | ±0.019    |
| Gene diversity after 60 generations, haploid | N = 100, 100 loci × 40 replicates                 | 0.2718   | 0.2736   | ±0.014    |
| Var(Δ_p_) / [_p_(1 − _p_)/2N]                | N = 200, _p_ = 0.3, 2000 loci                     | 0.970    | 1        | ±0.127    |
| Hardy–Weinberg χ² (1 d.f.)                   | N = 20 000, from 30% AA / 70% aa                  | 0.067    | < 15.1   | P = 10⁻⁴  |
| Mutation–selection balance _q̂_               | N = 1000, μ = 10⁻³, _s_ = 0.1, _h_ = 0.5          | 0.0207   | 0.0200   | ±12%      |
| Infinite-alleles gene diversity              | N = 100, μ = 0.0025 (θ = 1)                       | 0.4994   | 0.5009   | ±0.03     |
| Breeder's equation, one generation           | N = 5000, 100 loci, _h_² ≈ 0.5, top 20%           | 0.680    | 0.704    | ±0.05     |

Earlier checks at intermediate time points, and the mean of Δ_p_, are in the test output.
Six runs with random seeds also passed. A nightly CI job repeats the suite with fresh random
seeds and twice the replicates.

## 9. Simplifications

| Simplification                                                           | Why                                             | Consequence / when it is lifted                                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Constant N, non-overlapping generations                                  | Matches the Wright–Fisher model the theory uses | Population dynamics arrive with ecology (Phase 3)                                                          |
| Fitness is specified, not emergent                                       | Needed to validate against theory               | Replaced by life-cycle fitness in Phase 2                                                                  |
| One undivided (panmictic) population                                     | Phase 1 scope                                   | Spatial patches and gene flow in Phase 3                                                                   |
| Additive allele values only (no dominance in trait values, no epistasis) | Simplest quantitative-genetic model             | Dominance exists in the single-locus fitness models; developmental modules with pleiotropy come in Phase 2 |
| Recombination only between adjacent loci, with no crossover interference | Standard and sufficient for now                 | A map-based model can replace it if linkage matters later                                                  |
| Alternation of generations not modelled                                  | Phase 2 scope                                   | Haploid and diploid life cycles exist separately for now                                                   |
| Uniform floats have 32-bit resolution                                    | Speed                                           | Probabilities below about 2 × 10⁻¹⁰ are not resolved; no current model needs them                          |

## 10. Open questions for review

1. Should selection act in two stages (viability, then fecundity) before Phase 2, to separate
   survival and fertility effects in the Lab?
2. Is the 5% allowance for diffusion-approximation error appropriate for N ≥ 50, or should the
   suite compare against exact Wright–Fisher transition-matrix results for small N?
3. Which per-locus mutation-rate range should the game use once time is compressed? This needs
   to be settled with chapter 09 (macroevolution).

## References

- Blackman, D. & Vigna, S. (2021). Scrambled linear pseudorandom number generators. _ACM
  Transactions on Mathematical Software_ 47(4). doi:10.1145/3460772
- Crow, J. F. & Kimura, M. (1970). _An Introduction to Population Genetics Theory_. Harper & Row.
- Falconer, D. S. & Mackay, T. F. C. (1996). _Introduction to Quantitative Genetics_ (4th ed.).
  Longman.
- Haldane, J. B. S. (1927). A mathematical theory of natural and artificial selection, Part V:
  selection and mutation. _Proceedings of the Cambridge Philosophical Society_ 23: 838–844.
- Hardy, G. H. (1908). Mendelian proportions in a mixed population. _Science_ 28: 49–50.
- Kimura, M. (1962). On the probability of fixation of mutant genes in a population.
  _Genetics_ 47: 713–719.
- Kimura, M. (1965). A stochastic model concerning the maintenance of genetic variability in
  quantitative characters. _PNAS_ 54: 731–736.
- Kimura, M. & Crow, J. F. (1964). The number of alleles that can be maintained in a finite
  population. _Genetics_ 49: 725–738.
- Lande, R. (1975). The maintenance of genetic variability by mutation in a polygenic character
  with linked loci. _Genetical Research_ 26: 221–235.
- Lush, J. L. (1937). _Animal Breeding Plans_. Collegiate Press.
- Ossowski, S. et al. (2010). The rate and molecular spectrum of spontaneous mutations in
  _Arabidopsis thaliana_. _Science_ 327: 92–94.
- Vose, M. D. (1991). A linear algorithm for generating random numbers with a given
  distribution. _IEEE Transactions on Software Engineering_ 17: 972–975.
- Walker, A. J. (1977). An efficient method for generating discrete random variables with
  general distributions. _ACM Transactions on Mathematical Software_ 3: 253–256.
- Weinberg, W. (1908). Über den Nachweis der Vererbung beim Menschen. _Jahreshefte des Vereins
  für vaterländische Naturkunde in Württemberg_ 64: 368–382.
- Wright, S. (1931). Evolution in Mendelian populations. _Genetics_ 16: 97–159.
