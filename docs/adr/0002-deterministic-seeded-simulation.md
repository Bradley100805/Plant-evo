# 0002. Deterministic, seeded, DOM-free simulation core

**Status:** Accepted (Phase 1)

## Context

Saves, shared runs, Experiment mode and the statistical test suite all need the same inputs to
give the same outputs. Players and teachers should be able to share a seed and see the same
history.

## Decision

- Every random draw goes through `Rng` (xoshiro128\*\*), seeded from a number or string.
- Subsystems get **named streams** (`rng.fork(name)`), derived from the seed key and the name
  only. Adding a stream never changes the numbers another stream produces.
- A population owns separate streams for setup, reproduction (genealogy), mutation, fitness
  noise and player interventions.
- ESLint bans `Math.random`, `Date.now`, `performance.now`, `window` and `document` inside
  `packages/sim`.
- A golden-seed snapshot test fails when the sequence of draws changes. Updating it is allowed
  only for deliberate changes, noted in the changelog because old saves stop replaying.
- The statistical suite runs with a fixed seed in CI (deterministic, never flaky) and with
  random seeds nightly (catches seed-specific luck). Failures print the seed to reproduce them.

## Consequences

- Runs replay exactly within one JavaScript engine. `Math.log`/`Math.sqrt` may differ in the
  last bit between engines, so cross-browser replays are not guaranteed (plan §7.4). If that
  matters later, ship our own implementations of those functions.
- Code in the core cannot use convenient sources of randomness or time; this is intentional.
