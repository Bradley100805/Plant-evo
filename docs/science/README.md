# Science Bible

The Science Bible is the specification for everything Plant-evo simulates. Each chapter sets
out the model, its equations and parameters, the sources behind it, the simplifications it
makes, and the tests that check the code against it. If the code and the Science Bible
disagree, one of them has a bug.

Design pillar 2 from the [development plan](../PLAN.md): **every number has a source.**

## Chapters

| #   | Chapter                                                 | Status            | Implemented in              | Phase |
| --- | ------------------------------------------------------- | ----------------- | --------------------------- | ----- |
| 01  | [Population genetics](01-population-genetics.md)        | v0, needs review  | `packages/sim/src/genetics` | 1     |
| 02  | [Key innovations timeline](02-innovations-timeline.md)  | v0, dates checked | (content data, later)       | 0 → 7 |
| 03  | Plant physiology (light, photosynthesis, water, carbon) | Not started       |                             | 2     |
| 04  | Life cycle and reproduction                             | Not started       |                             | 2     |
| 05  | Spatial ecology                                         | Not started       |                             | 3     |
| 06  | Morphology (L-systems)                                  | Not started       |                             | 4     |
| 07  | Earth history: Ordovician–Devonian environments         | Not started       |                             | 5     |
| 08  | Earth history: full Phanerozoic, feedbacks              | Not started       |                             | 6     |
| 09  | Macroevolution and phylogeny                            | Not started       |                             | 6     |

Each chapter is written at the start of the phase that implements it, and reviewed by someone
with the relevant expertise before that phase ships. Chapters 01 and 02 were written in Phase 0.

## Conventions

### Confidence labels

Every factual claim that reaches players (codex entries, tooltips, chapter text) carries one of:

| Label              | Meaning                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Established**    | Textbook consensus, supported by many independent lines of evidence.                     |
| **Well supported** | Current majority view with good evidence, but details (dates, mechanisms) still debated. |
| **Hypothesis**     | A serious, published idea that is contested or has limited evidence.                     |

### Simplifications

A model that departs from reality on purpose lists the departure under **Simplifications**,
with the reason and what it does and does not affect. The game's codex shows these to players.

### Citations

Cite author(s), year, title, venue and a DOI where one exists. Primary sources are preferred.
Reviews and textbooks are acceptable for established material. When a figure comes from a
secondary source, say so. BibTeX for all references will live in `packages/data` from Phase 2.

### Dates

Geological ages are in Ma (millions of years ago). Stage names follow the International
Commission on Stratigraphy chart. A specific chart version will be pinned in Phase 6, when the
Earth-history data package is built.

### Language

Follow the anti-teleology style guide in the plan (§6.5): variants that did X _left more
offspring_. Plants never _want_ or _try_ to evolve anything.
