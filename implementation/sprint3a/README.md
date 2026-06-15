# Sprint 3A — Decision Hierarchy (ES-006)

> First half of the approved Sprint 3 split. Implements the ES-006 cross-session load
> decision as a **governor** over the existing ES-005.1 score-derived load, on the
> single-block path. No composition, volume, or catalog (those are Sprint 3B). Every
> mechanism traces to a frozen spec; nothing is redesigned. Governing rule: *no
> redesign without explicit model review.*

- **Status:** complete. **Tests:** 64 passing (46 prior bit-for-bit + 18 new).
- **Schema version:** 3 (additive decision migration).
- **Canonical plan:** `reviews/planning/SPRINT_3A_IMPLEMENTATION_PLAN.md` (accepted).
- **Readiness review:** `reviews/planning/SPRINT_3A_CODE_READINESS_REVIEW.md` (accepted).

---

## 1. What this sprint delivers

Sprint 0–2 re-derived a working load from the (gradually moving) capability score every
call; cross-session progression was implicit, with no `KEEP/INCREASE/DECREASE` decision,
no stability guard, and no recommendation memory. Sprint 3A makes the per-capability load
recommendation an explicit, auditable **ES-006 decision**:

| Mechanism | Spec | Where |
|---|---|---|
| Governor over the ES-005.1 target (KEEP/INCREASE/DECREASE) | ES-006 | `decision.py` `govern()` |
| Stability guard — `STABILITY_N=3` consistent observations | ES-006 Stability Requirement | `decision.py` `update_streaks()` |
| Streak on the **fatigue-adjusted surprise** (`S_obs_clean − score_before`) | ES-011 C.1 | `pipeline.py` (governed path) |
| Confidence gate on whether/how far the load moves | ES-006 Confidence Gate | `decision.py` `govern()` |
| Load progression by equipment increment ("never exceed granularity") | ES-006 Load Progression | `constants.EQUIPMENT_STEP_KG` |
| Reset-the-streak-on-fire (no immediate re-fire) | ES-006 Recommendation Memory | `pipeline.py` |
| Decision memory (`last_recommended_weight`, `last_decision`, streaks) | ES-006 | `domain.CapabilityState` (projected) |
| `decision_type` + `target_load` audit ("why didn't it move?") | ES-006 audit / Inv. 7 | `domain.Recommendation`, schema |
| Fatigue gating folded in as named decisions (`fatigue_hold`) | ES-011 B.2/B.3 | `recommendation.py` (unchanged behavior) |

**Single source of truth for load is preserved (Invariant 3):** the governor never
computes a load from scratch. It returns either the held load or the held load stepped by
**one** equipment increment toward the ES-005.1 target — there is no second load formula.
`decision.py` is the single live authority for decision type and reason; the Sprint 2
`fatigue.decision_reason()` helper is marked **superseded** (kept only for its unit tests).

## 2. The governor (ratified design)

ES-006 acts as a **rate-limiter** over the ES-005.1 score-derived target:

- `KEEP_LOAD` (default) — hold `last_recommended_weight`; ignore sub-step score wiggle.
- `INCREASE_LOAD` — after `STABILITY_N` consistent positive observations, at sufficient
  confidence, step the held load up by one increment toward the target (only while
  `target > held`); the run is then consumed (reset).
- `DECREASE_LOAD` — symmetric, on a consistent negative run (genuine regression).
- An **elevated-fatigue day never reaches the governor**: it is handled upstream in
  `recommend()` as a `fatigue_hold` (INCREASE structurally impossible), and the streak is
  computed on the fatigue-*removed* surprise, so fatigue can never manufacture a DECREASE.

Observed governed trajectory (seeded score 40, truth 60, confidence 55):

```
wk decision         emit  target  score  cp
 1 KEEP_LOAD        52.5    52.5  40.52   1     <- cold-start working-set seed
 2 KEEP_LOAD        52.5    52.5  41.01   2
 3 KEEP_LOAD        52.5    52.5  41.50   3
 4 KEEP_LOAD        52.5    52.5  41.96   4     <- held: target hasn't cleared held yet
 5 KEEP_LOAD        52.5    52.5  42.41   5
 6 INCREASE_LOAD    55.0    55.0  42.84   .     <- one 2.5kg step; run consumed
 ...
11 INCREASE_LOAD    57.5    57.5  44.77   .
```

Load lags the rising score and moves one plate at a time — load is the fast knob, used
gently; the conservative, trust-preserving ES-006 default.

## 3. Why the 46 prior tests stay bit-for-bit

The governor is **default-inert**. It engages only when `last_recommended_weight` is
non-NULL, and only the opt-in governed pipeline path (`report_set(..., govern=True)`)
ever writes that memory. The Sprint 0 orchestrator, the Sprint 1 `report_set`, and the
Sprint 2 `report_set_fatigue_aware` never set it, so `recommend()` always takes the
cold-start branch there and is byte-identical to before. New state/audit fields are
additive with inert defaults (NULL memory, zero streaks, `decision_type='KEEP_LOAD'`,
`target_load`), so a migrated Sprint 2 DB is semantically unchanged. The Sprint 1 parity
test (`<1e-9`) and the Sprint 2 reason-string identity tests both pass unchanged.

## 4. Files

**New:** `decision.py` (authority), `migration_003_decision.py`, `test_sprint3a.py`, this README.
**Edited in place (additive):** `constants.py` (thresholds + equipment step), `domain.py`
(CapabilityState +5 fields, Recommendation +2), `recommendation.py` (governor wiring,
cold-start + fatigue paths preserved), `fatigue.py` (supersede note), `schema.py`
(3 tables), `repositories.py` (MR2 three-site plumbing + audit columns), `pipeline.py`
(`govern` flag, streak/memory update, reset-on-fire, carry new fields through).

## 5. Conditions honored (this sprint's acceptance gate)

1. **`decision.py` is the single live decision authority** — recommendation, fatigue, and
   decision reason codes converge there; `fatigue.decision_reason()` is superseded.
2. **MR2 mandatory checklist** — all five new `CapabilityState` fields are written in
   `create_athlete`, `write_capability_state`, and read in `_row_to_cap`, with
   `test_decision_memory_round_trips` guarding against silent persistence failure.
3. **Multi-session sequencing harness built in this sprint** —
   `test_multisession_stability_guard_then_increase`,
   `test_multisession_streak_persists_in_state`, and
   `test_increase_resets_the_streak_on_fire` exercise cross-session behavior end-to-end.
4. **Sprint 0–2 parity preserved** — all 46 prior tests remain green and bit-for-bit.

## 6. Deferred to Sprint 3B / later (stubbed at clean boundaries)

- `REPLACE_EXERCISE` (L2): signal-only — needs the ES-002 catalog + PreferenceState (3B).
- `CHANGE_STRATEGY` (L4): signal-only — licensed only by a completed investigation (ES-013).
- Session composition / volume / fatigue ceiling (ES-009/009.1): Sprint 3B.
- Full override-productivity metrics / TrustScore (ES-012): Sprint 6. 3A keeps the three
  override metrics un-collapsed and the override target loggable; it does not compute them.
- Threshold calibration (`DECISION_CONF_GATE`, `SURPRISE_DEADBAND`; `STABILITY_N=3` ratified):
  provisional, a Phase 0 responsibility.

## 7. Running

This checkout holds per-sprint **snapshots**, not the assembled tree (as in Sprint 2). To
verify: `python build/_verify/assemble_and_test.py` assembles `hush_model/ + sim/ + tests/`
from the snapshots and runs every `test_*` (plain-assert runner; no pytest in this
checkout). Expected: `64/64 passed`. In a real assembled tree,
`PYTHONPATH=. python -m pytest tests/ -q` should report 64 passing.
