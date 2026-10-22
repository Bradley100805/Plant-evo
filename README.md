# Plant-evo

A scientifically grounded game about the evolution of land plants, from freshwater algae to
modern grasslands. Outcomes come from simulated physiology, ecology, and population genetics
running against real Earth-history data. Nothing is scripted: variation is random and
selection decides.

**Status:** Phase 1 of 10 complete. The population-genetics engine is built and validated
against theory. A web Lab previews it in the browser.

## Documents

- [Development plan](docs/PLAN.md): vision, scientific model, game design, roadmap, progress.
- [Science Bible](docs/science/README.md): the specification for every simulated model, with
  equations, sources, simplifications and validation results.
- [Architecture decision records](docs/adr/README.md).

## Getting started

Requires Node.js 22.12+ and pnpm 10 (`corepack enable` sets up pnpm from `package.json`).

```sh
pnpm install
pnpm dev          # web Lab at http://localhost:5173
pnpm check        # format, lint, typecheck and all tests
```

## Repository layout

| Path           | What it is                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------- |
| `packages/sim` | Deterministic, DOM-free simulation core: seeded RNG, population genetics, theory, experiments |
| `apps/web`     | Vite + React web app; simulations run in a Web Worker                                         |
| `tools/cli`    | Headless experiment runner with CSV export                                                    |
| `docs`         | Plan, Science Bible, ADRs                                                                     |

## Commands

| Command                                      | What it does                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build`                    | Run or build the web app                                                            |
| `pnpm test`                                  | Unit tests and the statistical validation suite (seeded, deterministic)             |
| `pnpm test:stats`                            | Only the statistical suite; prints observed vs. expected for each check             |
| `STATS_SEED=random pnpm test:stats`          | The statistical suite with a fresh random seed (`STATS_SCALE=2` doubles replicates) |
| `pnpm -s sim --help`                         | List CLI experiments and options                                                    |
| `pnpm -s sim sweep --s 0.05 --out sweep.csv` | Follow 100 new beneficial mutations; CSV to a file, theory summary to stderr        |

Every simulation is seeded (`--seed` in the CLI, the Seed field in the Lab): the same seed
always gives the same result.
