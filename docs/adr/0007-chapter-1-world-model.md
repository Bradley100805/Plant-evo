# 0007. World model for the first chapter: one pond margin, yearly generations

**Status:** Accepted for Phases 2–5. To be revisited when the macro tier (ADR 0003) and further
chapters arrive.

## Context

The plan builds physiology (Phase 2), spatial ecology (Phase 3), morphology (Phase 4) and the
first chapter (Phase 5) in sequence. To reach a playable chapter early, they were built together
in a reduced form. This record lists what that form is and where it departs from the plan.

## Decision

- **One landscape.** A 48 × 24 grid of 10 cm patches: open water, through a seasonally flooded
  margin, up to dry ground. One plant (gametophyte, sporophyte or both) per patch. The landscape
  is the same for the whole chapter; each epoch changes only its climate. Science Bible chapter 05.
- **Time.** Physiology runs monthly (12 steps a year, wet season and dry season); the life cycle
  runs yearly, and one year is one generation. An epoch is 100 generations. Science Bible
  chapters 03 and 04.
- **Fitness is emergent.** No fitness function remains in the world model: survival,
  fertilisation and spore output come from the monthly water and carbon balance and the life
  cycle. The Phase 1 placeholder fitness models remain only for the Lab and the statistical
  suite.
- **Departures from the plan:**
  - Stomata open as far as the plant's water supply allows (supply-limited), instead of the
    Medlyn et al. (2011) optimal-conductance model. With monthly steps and no explicit leaf water
    potential, the simpler rule captures what matters here: stomata only help behind a cuticle
    and with a water supply.
  - Light competition is a neighbourhood overtopping rule with a big-leaf canopy (area index
    capped at 4), not geometry-derived light interception.
  - Morphology (`packages/morph`) is an illustration of the population's mean traits drawn in
    SVG. It does not feed back into physiology, and PixiJS is not used yet. Height in the
    physiology comes from the traits directly.
  - The cost of height is folded into a ceiling set by the traits: maximum sporophyte height is
    3 mm + stature × (3 cm + 50 cm × vascular tissue), so tall plants need water-conducting tissue.
    Tall tissue also loses contact with wet ground (chapter 03). There is no explicit hydraulic or
    mechanical model.
  - No lineage tree and no fitness decomposition in the report yet; the report shows the
    variant's fate, reproduction by zone, deaths by cause and trait change instead.
- **Perennation.** A sporophyte survives into the next year with a chance equal to its
  sporophyte-development trait; a gametophyte with a fixed chance of 0.6. Both face background
  disturbance. Without perennation, height and stature could not accumulate over years, and
  upright growth gave no advantage (found in playtesting).

## Consequences

- The game is playable end to end, and its outcomes come from simulated mechanisms. The
  simplifications are listed in Science Bible chapters 03–07 and in the codex.
- The Phase 2 exit check holds in this model (`world.test.ts`): a cuticle variant spreads on
  drying ground and declines under permanent water.
- Phase 3 and 4 exit criteria (bounded height under competition with explicit costs; morphology
  that changes physiology) are not yet met and stay on the roadmap.

## References

- Medlyn, B. E. et al. (2011). Reconciling the optimal and empirical approaches to modelling
  stomatal conductance. _Global Change Biology_ 17: 2134–2144.
