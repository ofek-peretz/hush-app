# Sprint 3B-2 — Session Composition (ES-009) + Volume (ES-009.1) + Live Fatigue Ceiling

Second half of the approved Sprint 3B split. Turns the single-block path into an ordered,
volume-bearing, **multi-set** `ExerciseBlock[]` over the five Class-A capabilities, built on
the Sprint 3B-1 foundation (catalog, StrategyState, PreferenceState, global-confidence /
calibration, the `complete_block()` hook). **Composition is strictly load-free** — ES-006 fills
loads per block afterward (Invariant 3). All Sprint 0–3B-1 trajectories are preserved bit-for-bit.

## Files

| File | Spec | What |
|---|---|---|
| `composition.py` | ES-009 | Four-stage engine: template → priority → (volume) → selection → ordering. Emits a load-free `SessionPlan`. The seeded exploration floor lives in Stage 3. |
| `volume.py` | ES-009.1 | Two-lever allocation (slots × sets), focus weighting, calibration restraint; **sole owner of `target_sets`**; `times_trained` from the Class-A-restricted templates. |
| `session.py` | ES-009→ES-006 | `SessionEngine` driver (readiness HD1): compose → persist blocks → run each block's sets (`govern=False`) → advance ES-006 decision memory **once per capability** (R2). |
| `migration_005_composition.py` | ES-009 §9 | Additive/idempotent: composition-audit columns on `workout_session` (incl. the required `exploration_seed`) + `selection_reason` on `exercise_block`. schema v5. |
| `test_sprint3b2.py` | — | 23 tests (coverage proof, priority, volume + documented collapse, exploration determinism, ceiling trim, driver R2/R4, migration). |

Edits in place: `constants.py` (templates, `CAPABILITY_PRIORITY_ORDER`, bands, lever bounds,
`P_EXPLORE`, `SESSION_FATIGUE_CEILING`), `schema.py` (audit columns), `repositories.py`
(`create_session`/`add_block` audit params), `pipeline.py` (`SetResult` surfaces `s_obs` /
`decision_type` / `recommended_weight` for the driver).

## Ratified decisions honored

- **Q1 / `CAPABILITY_PRIORITY_ORDER`** = `(knee_dominant, hip_dominant, horizontal_push,
  horizontal_pull, vertical_push)` — drives Stage-4 ordering, ceiling/gate trim ("lowest priority"
  = last = trimmed first), and all deterministic tie-breaks. **No new catalog metadata.**
- **Q2 — trim-only recovery gate.** Over the live ceiling → remove the lowest-priority slot(s)
  until total ≤ ceiling; never rebuilt/re-optimized; second slots dropped before sole slots
  (coverage-preserving).
- **Q3 — band collapse accepted & documented** (see below). ES-009.1 unchanged.
- **R1 — `SESSION_FATIGUE_CEILING = 24`**, flagged **PROVISIONAL / UNVALIDATED / CALIBRATION
  REQUIRED**. (Under Class-A the total never exceeds 24, so the ceiling binds at most at equality;
  the trim is proven on a synthetic over-ceiling case.)
- **R2 — one governor update per capability per session**, driven by the primary slot; secondary
  slots learn only.
- **R3 — governor memory stays capability-scoped**; `difficulty_factor` translates exercises (no
  exercise-specific memory).
- **R4 — fully deterministic exploration** from a persisted session seed; no system-time/global
  randomness; never fires during calibration; never crosses the class constraint.

## Known V1 limitation (Q3) — band collapse, precise form

Under Class-A-only coverage, `times_trained` collapses to 1 for once-per-week capabilities, so the
two-lever allocation saturates. The **measured** behavior (null focus, literal ES-009.1 §3
×0.75-for-unfocused):

| | once-trained cap | twice-trained cap |
|---|---|---|
| low | 6 sets | 3 sets |
| moderate | **8** | 4 sets |
| high | **8** | 6 sets |

So **moderate == high for once-trained capabilities** (all caps at freq 2; the once-trained ones at
freq 3/4); `low` stays distinct, and **twice-trained capabilities stay fully distinct**. This is a
consequence of the ratified Class-A restriction collapsing `times_trained`, **not** an ES-009.1
defect; the 8/12/18 bands and 1–2 / 2–4 clamps ship unchanged. Revisit when Class-B/C activate or in
Phase-0 band calibration.

> **Note for model review (not a redesign):** with the default `focus = null`, every capability is
> "other" and takes the ×0.75 multiplier (literal ES-009.1 §3). The effective default band is thus
> 0.75× nominal. This is the faithful literal reading; flagged here in case a neutral (×1.0)
> no-focus multiplier was intended — a model-review decision, deferred to Phase 0 with the bands.

## Verification

`python build/_verify/assemble_and_test.py` → **105/105** (82 prior bit-for-bit + 23 new). schema v5.
