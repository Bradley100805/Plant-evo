# 0006. Mutation Draft as implemented: recurrent origins and major-effect variants

**Status:** Accepted. Amends [0004](0004-mutation-draft.md) (the parts that differ are listed
below).

## Context

ADR 0004 introduced a followed mutation as a single new allele. Playtesting the first chapter
headlessly (`pnpm -s sim play`) showed two problems with that:

1. **Almost nothing happened.** A single copy of even a strongly beneficial allele is usually
   lost by drift (fixation probability about 2s; Haldane 1927, Kimura 1962). With one origin per
   epoch and 13 epochs, most games ended with the lineage nearly where it started, which teaches
   the right lesson about drift but is not a game.
2. **Small effects were invisible.** Alleles drawn from the background mutation distribution
   (SD 0.12 liability units) move a trait by a few hundredths. Their selective advantage is too
   small to beat drift in 100 generations, and the player cannot tell one offer from another.

## Decision

Implemented in `packages/sim/src/game/game.ts`, parameters in
`packages/sim/src/game/chapter1.ts` (`draft`):

- **Offers.** Each epoch offers 4 variants at distinct genes (no two offers share an owner
  trait or module). Module genes (master regulators that affect several traits) are 3 times as
  likely to be offered as any single-trait gene, so pleiotropic innovations come up.
- **Major effects.** A drafted allele changes the gene's liability by |N(1.5, 0.4)| per copy,
  relative to the population's current mean allele value at that locus. These are the
  rare large-effect mutations (for example a regulatory gene switched on in a new tissue), not
  the background ones, which keep arising every generation at μ = 3 × 10⁻⁴ per locus per copy
  with effect SD 0.12.
- **Direction.** An offer raises its trait with probability 1 − (current trait mean), so a gene
  for a nearly absent trait almost always offers more of it and a trait near its maximum mostly
  offers less. Without this, half of all offers would be visibly useless reductions of traits
  that are already near zero.
- **Recurrent origins.** The chosen allele arises 6 independent times, each time as a single
  copy in a random individual, at evenly spaced generations across the first 60% of the epoch.
  Each origin is pinned so its descendants can be counted. Recurrent mutation is real (the same
  change at the same site recurs in large populations), and six origins give a beneficial
  variant a fair chance while most individual copies are still lost.
- **What players see.** For each offer: the gene, and for each trait it affects, the current
  population mean and the expected value in a carrier (haploid, or homozygous diploid). Never a
  fitness value. After the epoch: how many times it arose, its final frequency, and its fate
  (lost, rare < 5%, spreading, fixed ≥ 95%).
- **Pure mode** keeps the draft but takes the choice away: nature picks one of the offers, or
  none, uniformly at random (deterministic for a seed and epoch). This differs from 0004, which
  removed the draft. Keeping it lets Pure and Lineage runs be compared on the same terms.

## Consequences

- The codex entries "What your choice means" and "Genetic drift" explain that the player chooses
  which arisen mutation the story follows, that drafted mutations are rarer major-effect ones,
  and why most are still lost.
- Results from a batch of headless games are in the plan's Progress section. Choosing well
  matters (a goal-directed strategy reaches more milestones than random choice or Pure mode),
  but no strategy reaches every milestone in every world, and the lineage can still stall.
- The parameters are a balance between realism and play. They are the first thing to revisit
  after playtests with people.

## References

- Haldane, J. B. S. (1927). A mathematical theory of natural and artificial selection, Part V:
  selection and mutation. _Proceedings of the Cambridge Philosophical Society_ 23: 838–844.
- Kimura, M. (1962). On the probability of fixation of mutant genes in a population.
  _Genetics_ 47: 713–719.
