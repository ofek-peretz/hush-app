# Sprint 4 — Instrumentation & the Phase 0 Simulation / Calibration Harness

Builds the Build Plan's Phase 0 modules **[2] simulation harness**, **[3] parameter calibration +
stability runs**, and **[7] validation instrumentation**, ending at the **Phase 0 gate**. It drives
the **frozen model verbatim** through the production `SessionEngine` (Q4) and produces calibration /
stability / sensitivity evidence. **No model redesign, no product feature, no parameter adoption**
(Q1 recommend-only). All 105 prior tests stay green bit-for-bit.

## Files (all `sim/`, offline; import the frozen model)

| File | Role |
|---|---|
| `parameters.py` | **`override_parameters`** context manager (HD1) — patches the exact production binding sites (`set_fatigue`/`agreement`/`govern`/`update_streaks`/`nudge` defaults; `compose_session` kw-default `ceiling`; `composition.P_EXPLORE`; `pipeline.TAU_SYS/TAU_CAP`), resolving by name, **restoring with assertion**. Harness-only; never wraps the golden suite. `assert_unpatched()` is the recommend-only guard (Q1). |
| `shadow.py` | `ShadowPolicy` — the **frozen** fixed linear-progression A8 counterfactual. Reads actuals + its own state only; **never** `capability_state` (R5). Seeds from the model's first load (HD2). |
| `harness.py` | `Harness` + `Trajectory` — drives the production `SessionEngine` over synthetic cohorts; two clocks advance together (HD3); deterministic per-session seed (HD4/R4); optional shadow recording. |
| `scenarios.py` | Known-answer athletes: `constant` / `improver` / `fatigued` / `recovery`. |
| `metrics.py` | A2 stability (oscillation/drift/ratchet/convergence), A1 recoverability + fresh-state, A8 shadow paired comparison. |
| `calibration.py` | Parameter sweeps via the override CM → **recommended-values table + sensitivity map + under-exercised report**. Adopts nothing (Q1). |
| `gate.py` | Phase 0 gate: **raw metrics are the primary output** (Q5); the verdict is labelled provisional-until-thresholds-ratified. |

Edits in place (additive, behavior-neutral): `schema.py` + `migration_006` (`shadow_recommendation`
table + `observation.override_category/override_target`); `repositories.py`
(`insert_shadow_recommendation`, override params on `insert_observation`); `service.py`
(`reconstruct_session`). **`SessionEngine` is unchanged** — shadow recording lives in the harness, so
the live path is byte-identical (a refinement of the impl plan's optional hook; even safer for parity).

## Phase 0 findings (representative; raw metrics are primary — Q5)

- **A2 stability — STABLE.** A constant-truth athlete shows oscillation ≈ 0.08, drift ≈ 0.03 units/sample,
  ratchet run 1 — **no oscillation, drift, or ratcheting**. But it settles ≈ **3.6 score units above
  true**: a *conservative-discount equilibrium bias* (the safety discount keeps loads conservative, the
  athlete over-performs, the score sits a few points high). **Reported, not corrected** — recommend-only /
  no redesign.
- **A1 recoverability (offline) — RECOVERS.** A seed-away-from-truth athlete (seed 48, true 58) settles to
  ≈ 58 (convergence error ≈ 0.6) and **beats the no-learning baseline by ≈ 9.4 units**. Non-circular: the
  athlete never shares the model's κ/τ (R2).
- **A8 shadow** — the fixed-policy paired comparison is built and recorded; the metric computes
  (directional, per the Validation Architecture).
- **Calibration (RECOMMEND-ONLY, NOT adopted — Q1):** on the recovery+constant objective the sweeps
  recommend roughly κ ×1.5, τ_sys ×1.5, σ²_ref ×0.5, with κ and τ flagged **knife-edge-sensitive**.
  These are **evidence for a separate adoption review**, not changes — `constants.py` is untouched.
- **Under-exercised (reported, Q3/R4):** `SESSION_FATIGUE_CEILING` is inert under Class-A (session total
  ≤ 24, never trims); the volume bands collapse (moderate==high for once-trained capabilities); default
  `focus=null` applies ×0.75 to every capability. Defer their calibration to Class-B/C breadth / Phase 0
  band review.

## Verification

`python build/_verify/assemble_and_test.py` → **125/125** (105 prior bit-for-bit + 20 new). Schema v6.
**No model constant adopted** (a test asserts `constants.py` calibration targets are unchanged).
