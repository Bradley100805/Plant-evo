# 0004. Player agency through the Mutation Draft

**Status:** Accepted. Implemented in Phase 5 and amended by
[0006](0006-mutation-draft-calibration.md) (recurrent origins, major-effect offers, Pure mode).

## Context

Evolution games often let players pick traits, which teaches that organisms evolve toward
goals. Plant-evo must give players meaningful choices without that teleology (plan §3).

## Decision

- **Lineage mode:** each epoch, the simulation generates a few random heritable variants of the
  focal lineage from the genotype-to-phenotype model. The player picks one to introduce. They
  see the trait changes, never a fitness score.
- The variant enters as a single new allele (`introduceAllele`), drawn from the population's
  `intervention` random stream, and is **pinned** so its fate can be followed even after loss.
- Its spread is decided by selection and drift. Most picks are lost, as theory predicts. The
  Lab's "A new mutation" experiment already shows this.
- **Pure mode** removes the draft: mutations arise at rate μ with no player choice.
- **Planet** and **Experiment** modes give agency over the environment and over experimental
  design instead.

## Consequences

- The codex must frame the draft honestly: the player chooses which of the mutations that did
  arise we follow, not what the plant "needs".
- The engine needs no special path for player variants; they are ordinary alleles.
