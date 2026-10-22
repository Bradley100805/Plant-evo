# Plant-evo

A scientifically grounded game about the evolution of land plants, from freshwater algae to
modern grasslands. Outcomes come from simulated physiology, ecology, and population genetics
running against real Earth-history data. Nothing is scripted: variation is random and
selection decides.

**Status:** the first chapter, _Leaving the Water_ (470–410 million years ago), is playable in
the browser. Follow a lineage of freshwater algae through 13 epochs: each epoch, choose which of
a few random mutations to follow, then watch 100 generations of a simulated population decide
its fate. Physiology (photosynthesis, water and carbon balance), the plant life cycle, a
pond-margin landscape and population genetics all run underneath. A genetics Lab checks the
engine against classic theory. See the plan's [Progress](docs/PLAN.md#progress) section for
what is done and what is simplified.

## Documents

- [Development plan](docs/PLAN.md): vision, scientific model, game design, roadmap, progress.
- [Science Bible](docs/science/README.md): the specification for every simulated model, with
  equations, sources, simplifications and validation results.
- [Architecture decision records](docs/adr/README.md).

## Getting started

Requires Node.js 22.12+ and pnpm 10 (`corepack enable` sets up pnpm from `package.json`).

```sh
pnpm install
pnpm dev          # the game and the Lab at http://localhost:5173
pnpm check        # format, lint, typecheck and all tests
```

## Repository layout

| Path             | What it is                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| `packages/sim`   | Deterministic, DOM-free simulation core: genetics, physiology, world, game |
| `packages/morph` | Plant drawings from trait values (parametric L-system), shown in the game  |
| `apps/web`       | Vite + React web app: the game and the Lab; simulations run in Web Workers |
| `tools/cli`      | Headless experiment runner with CSV export                                 |
| `docs`           | Plan, Science Bible, ADRs                                                  |

## Commands

| Command                                      | What it does                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build`                    | Run or build the web app                                                                |
| `pnpm test`                                  | Unit tests and the statistical validation suite (seeded, deterministic)                 |
| `pnpm test:stats`                            | Only the statistical suite; prints observed vs. expected for each check                 |
| `STATS_SEED=random pnpm test:stats`          | The statistical suite with a fresh random seed (`STATS_SCALE=2` doubles replicates)     |
| `pnpm -s sim --help`                         | List CLI experiments and options                                                        |
| `pnpm -s sim sweep --s 0.05 --out sweep.csv` | Follow 100 new beneficial mutations; CSV to a file, theory summary to stderr            |
| `pnpm -s sim play --strategy planned`        | Play the whole first chapter headlessly with a scripted strategy; one CSV row per epoch |

Every simulation is seeded (`--seed` in the CLI, the seed field in the game and the Lab): the
same seed, and in the game the same choices, always give the same result. The game autosaves to
the browser's IndexedDB after every epoch.
