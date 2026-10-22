# 0003. Two-tier time model

**Status:** Accepted. Implementation in Phase 6.

## Context

Land-plant evolution spans about 500 million years and an astronomical number of generations.
No device can simulate that individual by individual. The game still needs its outcomes to come
from simulated mechanisms rather than scripts.

## Decision

Two linked tiers (plan §4.9):

1. **Micro tier (ecological time):** individual-based simulation for roughly 100–500
   generations per epoch on a representative landscape. It measures selection gradients (β),
   the additive genetic covariance matrix (G), population sizes and range dynamics.
2. **Macro tier (deep time):** jumps of about 1–10 Myr. Species trait means advance by the
   multivariate breeder's equation Δz̄ = Gβ (Lande 1979) plus drift variance. Speciation and
   extinction follow a birth–death process whose rates depend on micro-tier results, range size
   and environment.

The compression is disclosed to players in the codex: what is compressed (generations, mutation
supply) and what that does and does not imply.

## Consequences

- The Phase 1 engine is the micro tier's core. The breeder's-equation check in the statistical
  suite already exercises the quantity the bridge relies on.
- Results across the bridge are approximations. Chapter 09 of the Science Bible must specify
  them and their tests before Phase 6 begins.
- Reference: Lande, R. (1979). Quantitative genetic analysis of multivariate evolution, applied
  to brain:body size allometry. _Evolution_ 33: 402–416.
