# 0001. Web-first TypeScript monorepo

**Status:** Accepted (Phase 0)

## Context

The game needs a heavy simulation, rich charts and UI, and reach into classrooms where installs
are hard (school Chromebooks). The plan (§7.1) recommended the web, with a desktop wrapper later.

## Decision

- **Language:** TypeScript in strict mode throughout.
- **Repository:** one pnpm workspace with three kinds of package:
  - `packages/sim`: the simulation core. Pure TypeScript, no DOM, no build step; other
    packages import its source directly.
  - `apps/web`: Vite + React app. Simulations run in a Web Worker.
  - `tools/cli`: headless runner (via `tsx`) for batch experiments and CSV export.
- **Quality gates:** Prettier, ESLint (typescript-eslint), `tsc --noEmit` per package, Vitest
  with a `unit` project and a `stats` project for statistical validation. CI runs all of them,
  plus the production build.
- **Charts:** hand-written SVG components for now (no chart library). Revisit if chart needs
  outgrow them.
- **Toolchain versions:** TypeScript 6.0. TypeScript 7 (the native compiler) is not yet
  supported by typescript-eslint; revisit when it is.

## Consequences

- One language from simulation to UI, with types shared between the worker and the app.
- No build step for internal packages keeps iteration fast, but `packages/sim` cannot be
  published to npm as-is. Add a build if that is ever needed.
- If profiling shows the simulation is too slow, hot loops can move to Rust/WASM behind the
  same TypeScript API (plan §7.5).
