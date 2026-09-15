# Sprint 4 Completion Report — Instrumentation & the Phase 0 Simulation / Calibration Harness

> Completion record for Sprint 4. It states what was built, the Phase 0 evidence produced, what
> remains deferred, and what is known to be unproven, as of the close of Sprint 4. It does not
> redesign the frozen model, adds no product feature, and **adopts no parameter** (Q1 recommend-only).
> Every claim traces to a frozen source (`Hush Validation Architecture v1`, `Hush v1 Technical Build
> Plan`, the Assumptions Register, ES-012) or to delivered, tested code. Governing rule: *no redesign
> without explicit model review.*

- **Date:** 2026-06-10
- **Model:** Hush v1 (frozen)
- **Build:** Sprint 0 ✅ · 1 ✅ · 2 ✅ · 3A ✅ · 3B-1 ✅ · 3B-2 ✅ · **4 ✅**
- **Tests:** 125 passing (12 + 7 + 27 + 18 + 18 + 23 + **20**); the 105 prior tests unchanged **bit-for-bit**
- **Schema version:** 6 (additive instrumentation migration applied)
- **Inputs (all accepted):** `SPRINT_4_PLANNING_REVIEW.md`, `SPRINT_4_IMPLEMENTATION_PLAN.md`,
  `SPRINT_4_CODE_READINESS_REVIEW.md` (Q1–Q5 resolved; five gating preconditions accepted)

---

## 1. What was implemented

Sprint 4 built the Phase 0 instruments and the offline simulation/calibration harness — the Build
Plan's modules [2]/[3]/[7] — and produced the calibration, stability, and sensitivity evidence the
Phase 0 gate consumes. The harness drives the **frozen model verbatim** through the production
`SessionEngine` (Q4), so it tests the real model, not a copy. Built strictly in the ratified priority
order: the parameter override context manager first, parity held throughout, the shadow baseline
frozen before comparisons, raw metrics before verdicts, recommend-only throughout.

| Deliverable | Source | Where |
|---|---|---|
| **`override_parameters` context manager** (patches exact production binding sites, restores with assertion) | Build Plan [3] / HD1 | `sim/parameters.py` |
| Simulation harness driving production `SessionEngine` over cohorts × weeks; trajectory recorder | Build Plan [2] | `sim/harness.py` |
| Known-answer scenarios (constant / improver / fatigued / recovery) | Build Plan [2] | `sim/scenarios.py` |
| Frozen shadow baseline (fixed linear progression; reads actuals only) | ES-012 F.1 / A8 | `sim/shadow.py` |
| A2 stability + A1 recoverability + fresh-state + A8 paired metrics | Validation Arch. | `sim/metrics.py` |
| Parameter calibration + sensitivity (recommend-only) | Build Plan [3] | `sim/calibration.py` |
| Phase 0 gate (raw metrics primary; provisional verdict) | Build Plan [10] | `sim/gate.py` |
| Shadow-baseline + override-target persistence; complete reconstruction | A8 / A9 / ES-009 §9 | `schema.py`, `migration_006`, `repositories.py`, `service.reconstruct_session` |

**The five gating preconditions, honored:**
1. **`override_parameters` built and verified first.** It patches the exact binding sites (function
   default args for κ/σ²_ref/gates/nudge, the kw-only `compose_session` ceiling, and the
   `pipeline.TAU_SYS/TAU_CAP` / `composition.P_EXPLORE` module globals), resolving each **by name** (not
   fragile `__defaults__` indices), and **restores in `finally` with a post-restore equality
   assertion** (`assert_unpatched`). A test proves a swept κ changes generated fatigue inside the CM and
   is exactly restored after.
2. **Parity baseline green throughout** — the 105 prior tests pass bit-for-bit; instruments are additive
   and default-inert; `SessionEngine` is unchanged (shadow recording lives in the harness).
3. **Shadow baseline frozen** before any comparison — a fixed, non-learning policy that reads actuals +
   its own state only, never `capability_state` (asserted, R5).
4. **Raw metrics first, verdicts second** — `gate.evaluate()` returns the raw metric dict; the
   `passed_provisional` flag is explicitly labelled provisional until the thresholds are ratified (Q5).
5. **Recommend-only maintained** — no path adopts a value; a test asserts the model `constants.py`
   calibration targets are unchanged at suite end (Q1).

## 2. Phase 0 evidence produced (recommend-only; raw metrics primary)

Representative knee_dominant results (the harness reports per-capability raw metrics):

- **A2 stability — STABLE, with a documented bias.** Constant-truth athlete: oscillation ≈ **0.08**,
  drift ≈ **0.034** units/sample, ratchet run **1** — no oscillation, drift, or ratcheting. The inferred
  score settles ≈ **3.6 units above true** — a *conservative-discount equilibrium bias* (the safety
  discount keeps loads conservative; the athlete over-performs; the steady-state score sits a few points
  high). **Reported, not corrected** (recommend-only / no redesign).
- **A1 recoverability (offline) — RECOVERS.** Seed-away-from-truth (seed 48, true 58): convergence error
  ≈ **0.6**; **beats the no-learning baseline by ≈ 9.4 units**. Non-circular (R2): the synthetic athlete
  never shares the model's κ/τ.
- **A8 shadow** — paired comparison built and recorded; the metric (model vs fixed-policy MAE, win rate)
  computes (directional, per the Validation Architecture).
- **Phase 0 gate (PROVISIONAL — Q5):** at the current parameters, stability and recoverability **pass**
  the proposed thresholds for the tested capability; the verdict is **provisional until the thresholds
  are ratified**, and carries the equilibrium-bias and knife-edge caveats below.

**Recommended parameter values — RECOMMEND-ONLY, NOT ADOPTED (Q1).** On the recovery+constant objective,
the sweeps recommend (vs current baseline):

| Parameter | Baseline | Recommended | Knife-edge? |
|---|---|---|---|
| κ (`KAPPA`) | 0.05 | ~0.075 (×1.5) | **yes** (sensitive) |
| `TAU_SYS` | 1.0 | ~1.5 | **yes** (sensitive) |
| `SIGMA2_REF` | 9.0 | ~4.5 | no |
| `DECISION_CONF_GATE` | 30.0 | ~15.0 | no |
| `SURPRISE_DEADBAND` | 0.5 | ~0.25 | no |

These are **evidence for a separate adoption review**, not changes — `constants.py` is untouched. κ and
τ_sys are **knife-edge-sensitive** and must be treated with particular caution at adoption.

**Under-exercised parameters (reported, not calibrated — R4/Q3):** `SESSION_FATIGUE_CEILING` is inert
under Class-A (session total ≤ 24, never trims); the volume bands collapse (moderate==high for
once-trained capabilities); default `focus=null` applies the ×0.75 multiplier to every capability
(effective default band 0.75× nominal). Their calibration is deferred to Class-B/C breadth / a Phase-0
band review.

## 3. What remains deferred

- **Adoption of any recommended parameter value** — a separate, explicit, owner-reviewed re-baseline
  (Q1); Sprint 4 recommends, it does not adopt.
- **Live fresh-state probe slots + Investigation Engine (ES-013)** — Sprint 6 / Phase 2; Sprint 4 did the
  offline A1 check only (Q2).
- **Trust metric + operator dashboard (ES-012)** — Phase 2.
- **API, mobile app, cohort recruitment (Phase 1), organic overrides** — later; override logging ships as
  instrumentation exercised by injection.
- **Per-athlete τ (A6), effort_offset (A5)** — Phase 3 / RIR-gated.
- **Class-B/C calibration of the ceiling/bands; the null-focus ×0.75 decision** — deferred to breadth /
  Phase-0 band review.
- **Any model formula/structure change** — out of scope by construction.

## 4. Current test counts

| Suite | Count | Scope |
|---|---|---|
| Sprint 0 | 12 | model loop, anchors, recovery |
| Sprint 1 | 7 | persistence, hierarchy, parity |
| Sprint 2 | 27 | fatigue/variance |
| Sprint 3A | 18 | decision governor |
| Sprint 3B-1 | 18 | catalog/strategy/preference/REPLACE |
| Sprint 3B-2 | 23 | composition/volume/ceiling |
| **Sprint 4** | **20** | `override_parameters` take-effect + restore (HD1) + globals/kwdefaults + reject-non-targets; constant-stable-bounded / improver-rises / recovery-converges (R2) / fatigued-recovers; determinism; shadow fixed+state-free (R5) + rows recorded + paired metric + inert-when-not-instrumented; override-target logging (A9) + complete reconstruction; migration 006 additive/idempotent + fresh-vs-migrated parity; metric detectors; calibration recommends-without-adopting (Q1) + under-exercised report + gate-raw-first (Q5) + recommend-only guard |
| **Total** | **125** | all passing |

The 105 prior tests pass **bit-for-bit** post-Sprint-4: the harness/instruments are additive, the new
tables are written only by the harness (empty otherwise), `SessionEngine` is unchanged, and no constant
value changed.

**Verification (honest):** as in prior sprints this checkout holds per-sprint *snapshots*; the 125/125
result was produced by `build/_verify/assemble_and_test.py`. In a real tree,
`PYTHONPATH=. python -m pytest tests/ -q` should report 125 passing.

## 5. Known limitations

1. **Phase 0 thresholds are PROPOSED, not ratified (Q5).** The pass/fail verdict is provisional; the raw
   metrics are the authoritative output.
2. **Conservative-discount equilibrium bias** — the inferred score settles a few units above true on a
   constant athlete. A real, reported behavior of the frozen model (not corrected; recommend-only).
3. **κ and τ_sys are knife-edge-sensitive** in the swept ranges — adoption must treat them with caution.
4. **All recommended values are UNADOPTED** (Q1) — the model still runs on the provisional constants;
   the fatigue/variance/decision corrections remain directional until an adoption review.
5. **A8 / A1 are simulation/offline only** — the live shadow + fresh-state probes are Phase 1/ES-013.
   Phase 0 gives **simulation-only** assurance on A2 (the Validation Architecture's honest contract).
6. **Under-exercised parameters** (ceiling/bands/null-focus) — reported, not calibrated, under Class-A.
7. **Repo layout:** snapshots ≠ assembled package; `pytest` is not in this checkout.
8. **Existential A1–A4** remain only partially reachable (A1 offline here; A2 simulation-only).

## 6. Recommended next sprint

**A parameter-adoption review (gated, short), then Sprint 5 — Mobile app (6 screens) + cohort
recruitment (Phase 1).** Adoption of the recommended κ/τ/σ²_ref/gate/deadband values is a separate,
explicit re-baseline (Q1): present the evidence, decide, update the constants, and deliberately
re-baseline the affected golden tests. After adoption, the validation program proceeds to **Phase 1**
(the app + cohort), where the instruments built here (shadow baseline, override logging, fresh-state)
must be live from day one (Build Plan), gated by the **A7 seed-safety** week-1 check. Phase 2
(Investigation + Trust, ES-013/ES-012) follows.

## 7. Updated repository status

```
docs/canonical/    HUSH_V1_PROJECT_STATUS.md   <- status anchor (now through Sprint 4)
reviews/planning/  ... SPRINT_4_PLANNING_REVIEW, SPRINT_4_IMPLEMENTATION_PLAN, SPRINT_4_CODE_READINESS_REVIEW
reviews/completion/ ... SPRINT_4_COMPLETION_REPORT  <- THIS FILE
implementation/sprint4/ parameters.py, shadow.py, harness.py, scenarios.py, metrics.py,
                        calibration.py, gate.py, migration_006_instrumentation.py,
                        test_sprint4.py, README.md
                        (edits in place: schema/repositories/service)
build/_verify/     assemble_and_test.py
```

- **Model:** Hush v1, frozen. **Sprints:** 0–4 complete.
- **Tests:** 125 passing (105 prior unchanged bit-for-bit). **Schema version:** 6.
- **Next:** parameter-adoption review (gated) → Sprint 5 app + cohort (Phase 1).
- **Provisional, pending an adoption review:** κ, τ_sys, τ_cap, σ²_ref, `DECISION_CONF_GATE`,
  `SURPRISE_DEADBAND`, `PREFERENCE_NUDGE`, `SESSION_FATIGUE_CEILING`, `P_EXPLORE` — Sprint 4 produced
  recommendations + evidence; **none adopted.**

---

*This report records the close of Sprint 4. For the frozen model, start at
`HUSH_V1_EXECUTION_CONTEXT.md`; for rule origins, `HUSH_V1_TRACEABILITY.md`; for the live status anchor,
`HUSH_V1_PROJECT_STATUS.md`.*
