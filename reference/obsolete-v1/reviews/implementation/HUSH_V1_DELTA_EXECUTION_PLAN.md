# HUSH_V1_DELTA_EXECUTION_PLAN.md

> **Scope:** the implementation delta from the completed **Sprint 0–4** build to **Approved
> Hush**, derived directly from the Gap Review (A–V) and M1–M5. Implementation changes only.
> No philosophy, no redesign, no alternatives, no new ideas. ① "no action" Gap-Review items
> are omitted by definition; every change below traces to a ② or ③ finding.
>
> **Grouping:** **P0** = must change before Sprint 5 · **P1** = should change during Sprint 5 ·
> **P2** = documentation / cleanup.
> **Complexity:** Trivial / Small / Medium / Large.
> Date: 2026-06-11.

---

## Dependency overview (critical path)

```
DX-01 (M1 consume actual_weight)
   ├── DX-02 (M2 predict at actual load)
   ├── DX-05 (§7 contract) ── DX-06 (F1/runtime supersede) ── DX-11 (set endpoint + accumulator)
   └── DX-09 (M5 stagnation)            ▲
DX-07 (bodyweight schema) ── DX-08 (Option D seeding)
DX-03 (M3 governor advisory) ─┐
DX-04 (M4 exploration off)  ──┴── DX-19 (tests + golden trajectories) ── DX-12 (instrumentation repoint)
DX-10 (preference stickiness)  [independent]
P2 docs (DX-13…DX-18) follow their code/spec counterparts.
```

The hard ordering constraint: **DX-01 precedes M5 (DX-09) and the contract/runtime chain
(DX-05/06/11)** — stagnation and the endpoint are untrustworthy until the real load is consumed.

---

## P0 — Must change before Sprint 5

| Change ID | Description | Affected files / modules / specs | Depends on | Complexity |
|---|---|---|---|---|
| **DX-01** | **M1** — stop overwriting `observation.actual_weight` with `recommended_weight`; pass the athlete-logged `actual_weight` into the observation. (Evidence engine already consumes `obs.actual_weight`; no math change.) | `hush_model/persistence/pipeline.py` (4 sites ≈ 151/157/316/322); `evidence.py` (no change, consumer) | — | Small |
| **DX-02** | **M2** — compute `prediction_error` / quality weight from the prediction evaluated at the **actual** load, not the recommended load. | `hush_model/persistence/pipeline.py`, `prediction.py` | DX-01 | Small |
| **DX-03** | **M3** — demote the ES-006 governor to advisory: stop auto-applying INCREASE/DECREASE to the emitted/held load (governor still computes; its load step is not applied). | `hush_model/decision.py` (`govern`), `recommendation.py`, `persistence/pipeline.py` (`complete_block`), `persistence/session.py` | — | Medium |
| **DX-04** | **M4** — disable the `P_EXPLORE` exploration auto-substitution so composition is stable. | `hush_model/composition.py` (exploration draw ≈ line 146), `constants.py` (`P_EXPLORE`) | — | Trivial |
| **DX-05** | **§7 contract reversal** — `actual_weight` becomes a **required learning input**; remove "one number in / `actual_weight` inert / A9-only"; make the mobile outbox event payload require `actual_weight`. | `docs/architecture/API_CONTRACT_V1.md §7`; `MOBILE_ARCHITECTURE_V1.md` / `MOBILE_BUILD_PLAN_V1.md` (outbox payload) | DX-01 | Small |
| **DX-06** | Supersede the **F1** "reps-only" conclusion and update the **runtime-fidelity input contract** to `(actual_weight, actual_reps)`. | `reviews/implementation/F1_CLARIFICATION_REPORT.md`; `reviews/implementation/SESSION_RUNTIME_TRANSITION_REVIEW.md` | DX-05 | Small |
| **DX-07** | Add `bodyweight_kg`: schema column + migration, `AthleteState` field, `onboard` signature, profile contract. | new `persistence/migrations/migration_007_bodyweight.py`; `persistence/schema.py`; `domain.py` (`AthleteState`); `persistence/service.py` (`onboard`); `persistence/repositories.py`; `API_CONTRACT_V1.md §9` | — | Small |
| **DX-19** | Update the test suite and **Phase-0 golden trajectories** for the M1–M4 behavior changes (weight-fed learning, governor advisory, exploration off) — the existing 131 bit-for-bit assertions encode the old behavior and will otherwise fail. | `implementation/*/test_*.py`; assembled `tests/`; Phase-0 golden fixtures | DX-01, DX-02, DX-03, DX-04 | Medium |

## P1 — Should change during Sprint 5

| Change ID | Description | Affected files / modules / specs | Depends on | Complexity |
|---|---|---|---|---|
| **DX-08** | **Option D seeding** — bodyweight-keyed strength-standard table + prior generator (capped experience modifier, downward bias, floor/ceiling clamp, confidence cap 25), replacing the 3-bucket seed with fallback when bodyweight is absent. | `hush_model/seeding.py`; new strength-standard table data/module; `constants.py` (Option D params) | DX-07 | Medium |
| **DX-09** | **M5 stagnation detection** — read-only per-capability trend state (signed slope + oscillation + confidence/agreement gate over score history), imbalance read (median-gap across the 5 Class-A), mapping to ≤1 insight / ≤1 advisory recommendation / ≤1 acceptance-gated volume option, plus the 4-week cooldown marker. | new `hush_model/stagnation.py`; port `sim/metrics.py` primitives (`drift_vs_flat`/`oscillation`/`reversals`) into the model; score-history read via `state_update_log`/`repositories.py`; new `migration_008_stagnation` (`last_surfaced_week`); `decision.py` (`CHANGE_STRATEGY` surfacing); `domain.py` (trend/insight entity); `volume.py` (actionable lever) | DX-01, DX-02 | Large |
| **DX-10** | Make an accepted exercise **replacement a sticky persistent preference** (currently a bounded +5 nudge). | `hush_model/preference.py`; `decision.py` (`REASON_REPLACE_PREFERENCE`); `constants.py` (`PREFERENCE_NUDGE`) | — | Small |
| **DX-11** | Set-report endpoint + `session_progress` accumulator carry `actual_weight` through the event-driven learning chain. | `SERVER_BUILD_PLAN_V1.md`; `reviews/implementation/WAVE_2_EXECUTION_CHECKLIST.md`; new `session_progress` accumulator (infra migration) | DX-01, DX-05 | Medium |
| **DX-12** | Repoint Phase-0 instrumentation/gate/calibration: **keep** the trend primitives and score-estimate calibration; reframe the load-prediction (shadow/convergence/recoverability) metrics off the old success basis. | `implementation/sprint4/shadow.py`, `gate.py`, `calibration.py`, `metrics.py`; `migration_006_instrumentation`; `LearningRepository` (shadow rows) | DX-19 | Medium |

## P2 — Documentation / cleanup

| Change ID | Description | Affected files / modules / specs | Depends on | Complexity |
|---|---|---|---|---|
| **DX-13** | Re-state the affected ES specs to advisory/retired semantics: ES-006 governor advisory; ES-013 active investigation retired → detection = M5; ES-011 fatigue load-gating advisory; ES-010 weight-deviation = input (not override); ES-003 conservative bias advisory; ES-005.1 recommendation/discount advisory; ES-008 v2 seeding → Option D pointer. | `specs/` (ES-003/005.1/006/008v2/010/011/013); `docs/canonical/HUSH_CANONICAL_DESIGN_SPEC_V1.0.md` | DX-03, DX-04, DX-09 | Medium |
| **DX-14** | Re-state success definition: ES-012 metric and Thesis v2 goal/authority; Validation Architecture / Phase-0 success criteria reoriented to stagnation/program. | `specs/ES-012`; `docs/founder/` (Thesis v2); `docs/architecture/Hush Validation Architecture v1.docx` | DX-12 | Medium |
| **DX-15** | Re-status the canonical orientation set: re-status ES-006/012/013, register M1–M5 and the Product Specification, re-point traceability. | `docs/canonical/` (SPEC_MANIFEST, EXECUTION_CONTEXT, PROJECT_STATUS, INDEX, TRACEABILITY, OPEN_ITEMS); root `README.md.md`, `CURRENT_STATUS.md.md` | DX-13, DX-14 | Medium |
| **DX-16** | Re-annotate the Assumptions Register: A1 (recoverability) less central; A9 (deviation = input, not override); A5 (no-RIR) unchanged but heavier. | `docs/assumptions/Hush v1 Assumptions Register.docx` | DX-13 | Small |
| **DX-17** | Re-annotate the consolidated design inputs as superseded-by-M5 (keep the plateau-cause taxonomy as reference); add "superseded framing" notes to the prior load-centric reviews; re-scope the param-adoption / open-items / roadmap docs. | `docs/assumptions/Investigation Engine Specification.docx`, `Plateau Investigation Framework.docx`; `reviews/CAPABILITY_INITIALIZATION_*`, `EXERCISE_LEVEL_*`, `MODEL_READINESS_FINAL_REVIEW`, `ARCHITECTURAL_AUDIT`, `BETA_READINESS_REVIEW`; `reviews/decisions/MODEL_REVIEW_PARAMETER_ADOPTION.md`, `OPEN_ITEMS_EXECUTION_PLAN.md`, `Model Completion Roadmap.docx` | DX-13 | Small |
| **DX-18** | API contract wording: mark `recommended_weight` advisory across §0/§3.2/§3.3/§6/§7.2; add bodyweight to §9; re-point §17 traceability. | `docs/architecture/API_CONTRACT_V1.md` (§0/§3/§6/§7.2/§9/§17) | DX-05, DX-07 | Small |

---

## Notes (binding on execution)

- **Move the input-contract flip as one unit.** DX-01, DX-05, DX-06, DX-11, and DX-19 share the
  reps-only→`actual_weight` root; partial application leaves the system internally contradictory.
- **Do not ship ES-013 active investigation alongside M5.** DX-09 (M5) is the detection path;
  DX-13 retires the active investigation engine in the same release.
- **`①` core is untouched.** No change above modifies the capability math (`reference_strength`,
  `epley`, blend, decay, confidence/variance), `state_update.py`, the evidence consumer, the
  catalog, or the volume engine — confirming the delta is plumbing, demotion, one assembly
  (DX-09), and documentation, not a rebuild.

*Delta only. Current Sprint 4 → Approved Hush. Traceability: Gap Review A–V; M1–M5.*
