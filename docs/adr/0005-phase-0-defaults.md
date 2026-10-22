# 0005. Defaults for the plan's open decisions

**Status:** Provisional. Revisit when the project owner decides each item.

## Context

Plan §11 lists open decisions that shape later work. The plan was accepted without answers to
them, so work proceeded on the plan's recommendations. This record makes those defaults
explicit so they can be changed deliberately.

## Defaults in effect

| Decision                   | Default                                          | Where it shows up now                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience                   | Both classroom (ages 14–18+) and general players | Lab copy explains concepts; no teacher tooling yet                                                                                                                                                    |
| Platform                   | Web-first; desktop wrapper (Tauri) later         | ADR 0001; GitHub Pages deploy                                                                                                                                                                         |
| Visual style               | Stylized 2D first, 3D inspector later            | SVG charts; L-system renderer planned in 2D (Phase 4)                                                                                                                                                 |
| Team and timeline          | Unknown; phases sized for 1–2 developers         | Roadmap durations in the plan                                                                                                                                                                         |
| Player agency              | Mutation Draft + Pure mode                       | ADR 0004                                                                                                                                                                                              |
| Business model and license | **Undecided**                                    | The repository has no license yet. Until one is chosen, the code is not open source, and the app must not claim it is. Data-source licenses must be checked before any dataset is bundled (plan §10). |

## Consequences

- Choosing a license is the most time-sensitive item: it affects which datasets can be bundled
  (Phase 6) and whether outside contributors can take part.
- Changing audience or platform later mostly affects UI copy and packaging, not the
  simulation core.
