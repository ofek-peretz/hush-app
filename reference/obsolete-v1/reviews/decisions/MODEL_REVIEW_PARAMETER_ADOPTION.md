# Model Review — Parameter Adoption (post-Sprint 4)

> **════ ALIGNMENT NOTE — DX-17 (2026-06-12) ════**
> This decision (**NO adoption** — κ, τ_sys, τ_cap, σ²_ref and the decision thresholds remain unchanged /
> provisional) still stands and is unaffected by the DX delta tranche. Note only that the **success basis
> is reoriented** (DX-14): the Phase-0 question is honest capability tracking + **stagnation detection
> (M5)**, not load prediction; a future re-review still requires the extended harness (conflict /
> progress-regress / varied-rest scenarios). Build has since advanced to **schema v9 / 156 tests**.

> Formal model-review document for the parameter-adoption decision gated by Sprint 4 (Q1
> recommend-only). It presents, per parameter, the Sprint 4 evidence and a defensible adoption
> recommendation. **This is a review document only: no code is modified, no value is adopted, no
> test is re-baselined here.** Adoption (if any) is a separate, explicitly approved change that must
> re-baseline the affected golden tests. Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Model: Hush v1 (frozen) · Build: Sprint 0–4 ✅ (125 tests, schema v6) ·
> Source: `sim/calibration.py` sweeps + `sim/gate.py` (Phase 0 harness, production `SessionEngine` path).

> **DECISION — RATIFIED (2026-06-10): NO PARAMETER ADOPTION.** All reviewed parameters
> (κ, τ_sys, τ_cap, σ²_ref, `DECISION_CONF_GATE`, `SURPRISE_DEADBAND`, and the out-of-scope set in §6)
> **remain unchanged at their current provisional values.** `hush_model/constants.py` is untouched;
> the 125 tests are unaffected; no golden test is re-baselined. The §7 follow-up (extend the harness
> with conflict / progress-regress / varied-rest scenarios before any future adoption review) is the
> recorded next step for the parameters the present scenarios do not exercise. This decision closes the
> post-Sprint-4 adoption gate; the recommend-only constraint (Q1) is satisfied with the null outcome.

---

## 0. Executive summary (read this first)

**Recommendation: adopt NOTHING this cycle.** When the Sprint 4 sweeps are re-run on a **fine grid
centered on the current baselines** (rather than the coarse ×0.5–×2.0 grid + short horizon that
produced the first-pass "recommendations"), the result inverts:

- **κ, τ_sys, τ_cap** — the **current values are at (or adjacent to) the convergence-error minimum**;
  every candidate change *increases* recovery error, and the minimum is **sharp (knife-edge)**.
  The earlier "recommend ×1.5" was a coarse-grid + short-horizon + tie-break artifact; on the finer
  grid κ=0.075 gives **~2.3** convergence error vs **~0.01** at κ=0.05. **Keep; do not adopt a change.**
- **σ²_ref** — the harness's stable-truth scenarios are **nearly insensitive** to it (Δ convergence
  error < 0.05 across the whole grid), because σ²_ref governs **conflict suppression**, which a
  constant/recovering synthetic athlete does not generate. **No adoption evidence either way.**
- **DECISION_CONF_GATE, SURPRISE_DEADBAND** — the harness is **completely insensitive** (identical
  metrics across all values): these gate the L1 INCREASE/DECREASE *firing*, which the current
  scenarios don't exercise. The first-pass "recommendations" (15.0 / 0.25) were pure `min()`
  tie-breaking over identical values — **spurious; ignore.**

The honest conclusion: **the provisional values are not improved by the available evidence, and the
parameters that the evidence *can't* speak to (σ²_ref, the decision thresholds) need richer scenarios
(conflicting evidence, genuine regressions, INCREASE/DECREASE firing) before any adoption review can
be meaningful.** The correct next action is to *extend the harness*, not to adopt numbers. This is the
recommend-only discipline (Q1) doing exactly its job — it caught a coarse-grid false positive before
it touched the model.

A separate structural observation (NOT a parameter): the constant-truth athlete settles **~3.6 score
units above true** — the *conservative-discount equilibrium bias* (ES-005.1 §7 safety discount). No κ/τ
value removes it; it is a model-design property, out of scope for parameter adoption, flagged for a
future design review.

**Evidence metric.** Unless noted, the table column is **recovery convergence error** = |settled
inferred score − true (58)| on the seed-away-from-truth (A1-offline) scenario, knee_dominant, ~14
simulated weeks, production `SessionEngine` path; stability columns are oscillation / drift on the
constant-truth athlete. All sweeps ran under `override_parameters` (restored + `assert_unpatched`).

---

## 1. κ (`KAPPA`) — fatigue generation scale (ES-011 A.4)

- **Current value:** `0.05`
- **Recommended value:** **`0.05` (no change).**
- **Evidence from Sprint 4:**

  | κ | recovery conv-err | const osc | const drift | stable |
  |---|---|---|---|---|
  | 0.025 | 1.906 | 0.007 | 0.0004 | ✓ |
  | 0.0375 | 0.999 | 0.038 | 0.015 | ✓ |
  | **0.05 (current)** | **0.008** | 0.087 | 0.036 | ✓ |
  | 0.075 | 2.266 | 0.038 | 0.016 | ✓ |
  | 0.10 | 5.121 | 0.000 | 0.000 | ✓ (ratchet 3) |

  0.05 is the clear convergence minimum; error rises steeply on both sides.
- **Expected behavioral impact (of moving):** raising κ over-removes fatigue (treats normal sets as
  more fatiguing), biasing recovered scores and degrading convergence; lowering κ under-corrects.
  Either direction worsens the recovery the loop exists to do.
- **Sensitivity findings:** **knife-edge = TRUE.** A ±50% move adds ~2–5 units of convergence error.
  κ is one of the two most sensitive parameters; precisely why it must not drift.
- **Risks:** adopting the coarse-run κ=0.075 would have *increased* error ~280×; any change risks the
  fatigue correction (still directional, A5 un-separated) being mis-scaled across cohorts not in the
  synthetic set.
- **Affected tests (if changed — for awareness, not action):** Sprint 2 fatigue
  generation/accumulation/decay golden values; C.3 de-fatigue ordering; fatigue-aware
  prediction/recommendation; the Sprint 3A/3B-2 fatigue-aware sequencing/driver trajectories.
- **Adoption recommendation:** **KEEP `0.05`. Do not adopt a change.** Re-examine only with a
  fatigue-stress scenario (varied rest intervals) that exercises κ beyond a single steady cohort.

## 2. τ_sys (`TAU_SYS`) — systemic recovery time-constant (ES-011 D)

- **Current value:** `1.0` (weeks)
- **Recommended value:** **`1.0` (no change).**
- **Evidence from Sprint 4:**

  | τ_sys | recovery conv-err | const osc | const drift | stable |
  |---|---|---|---|---|
  | 0.5 | 1.912 | 0.016 | 0.0002 | ✓ |
  | 0.75 | 1.015 | 0.031 | 0.012 | ✓ |
  | **1.0 (current)** | **0.008** | 0.087 | 0.036 | ✓ |
  | 1.5 | 2.734 | 0.035 | 0.014 | ✓ |
  | 2.0 | 5.166 | 0.000 | 0.000 | ✓ |

  Same shape as κ: 1.0 is the minimum.
- **Expected behavioral impact (of moving):** a longer τ_sys leaves more residual fatigue between
  sessions (over-soft loads, biased recovery); a shorter τ_sys clears it too fast (under-correction).
- **Sensitivity findings:** **knife-edge = TRUE.** ±50% adds ~1–5 units of error.
- **Risks:** A6 (per-athlete τ) is deliberately *not* learned at MVP; a population τ change would shift
  every athlete's fatigue clock at once. High blast radius for no evidentiary gain.
- **Affected tests (if changed):** Sprint 2 recovery/decay anchors, fatigue-aware recommendation;
  fatigue-aware multi-session trajectories (3A/3B-2).
- **Adoption recommendation:** **KEEP `1.0`. Do not adopt a change.**

## 3. τ_cap (`TAU_CAP`) — per-capability recovery time-constants (ES-011 D)

- **Current value:** `{horizontal_push 0.6, horizontal_pull 0.6, vertical_push 0.5, knee_dominant 0.9, hip_dominant 0.9}`
- **Recommended value:** **unchanged (×1.0).**
- **Evidence from Sprint 4 (whole-dict scale):**

  | scale | recovery conv-err | const osc | const drift | stable |
  |---|---|---|---|---|
  | ×0.5 | 0.219 | 0.089 | 0.037 | ✓ |
  | ×0.75 | 0.116 | 0.095 | 0.039 | ✓ |
  | **×1.0 (current)** | **0.008** | 0.087 | 0.036 | ✓ |
  | ×1.5 | 0.245 | 0.094 | 0.039 | ✓ |
  | ×2.0 | 0.580 | 0.083 | 0.034 | ✓ |

  ×1.0 is the minimum; effects are smaller than κ/τ_sys but still favor the baseline.
- **Expected behavioral impact (of moving):** scales the capability-local fatigue clocks; smaller
  effect than τ_sys here because the single-capability synthetic sessions don't stress cross-capability
  recovery differences.
- **Sensitivity findings:** baseline-optimal; the convergence curve is shallow but minimized at ×1.0
  (the sweep flags knife-edge by the relative criterion over a small range — interpret as
  "baseline-optimal, modest sensitivity," not a cliff).
- **Risks:** the per-capability *ratios* (0.5–0.9) were not independently calibrated here (only a whole-
  dict scale was swept); adopting per-capability changes would need a per-capability scenario the
  harness does not yet provide.
- **Affected tests (if changed):** Sprint 2 per-capability fatigue/decay; fatigue-aware trajectories.
- **Adoption recommendation:** **KEEP. Do not adopt a change.** Per-capability calibration needs
  capability-differentiated scenarios (and ideally real data) — defer.

## 4. σ²_ref (`SIGMA2_REF`) — variance reference for conflict suppression (ES-010 C)

- **Current value:** `9.0` (score²)
- **Recommended value:** **`9.0` (no change) — but flagged: not meaningfully tested.**
- **Evidence from Sprint 4:**

  | σ²_ref | recovery conv-err | const osc | const drift | stable |
  |---|---|---|---|---|
  | 4.5 | 0.052 | 0.051 | 0.021 | ✓ |
  | 6.75 | 0.018 | 0.092 | 0.038 | ✓ |
  | **9.0 (current)** | **0.008** | 0.087 | 0.036 | ✓ |
  | 13.5 | 0.021 | 0.094 | 0.039 | ✓ |
  | 18.0 | 0.032 | 0.113 | 0.046 | ✓ |

  The metric barely moves (whole-grid spread < 0.05). σ²_ref governs the **agreement** factor that
  suppresses confidence / damps learning **under conflicting evidence** — and the constant/recovering
  synthetic athletes produce *low-variance, non-conflicting* evidence, so this knob is essentially
  unexercised. The first-pass "recommend 4.5" was a marginal tie inside the noise.
- **Expected behavioral impact (of moving):** affects how hard the model suppresses confidence when
  recent S_obs disagree — invisible on a clean trajectory; material only under genuine conflict.
- **Sensitivity findings:** **insensitive on the available scenarios** (the knife-edge flag is an
  artifact of the relative criterion over a near-flat range). No usable sensitivity signal.
- **Risks:** adopting any σ²_ref from this evidence would be calibrating a conflict parameter on
  conflict-free data — the classic "tune on the wrong scenario" error ES-010 warns against.
- **Affected tests (if changed):** Sprint 2 variance/agreement suite (suppression, learning-rate
  damping, "Contradiction 4").
- **Adoption recommendation:** **KEEP `9.0`. Do not adopt.** Build a **conflicting-evidence scenario**
  (alternating high/low S_obs at constant truth) in a future harness extension before reviewing σ²_ref.

## 5. Decision thresholds reviewed

### 5a. `DECISION_CONF_GATE` — confidence gate for INCREASE/DECREASE (ES-006)

- **Current value:** `30.0` · **Recommended:** **`30.0` (no change).**
- **Evidence:** convergence error and stability are **identical across {15, 22.5, 30, 45}** (0.008
  throughout). The gate controls whether the L1 governor may *fire* a load change; the recovery/constant
  scenarios converge through the precision blend without the gate binding, so the harness produces **no
  signal**. The first-pass "recommend 15.0" was `min()` over identical values — **spurious.**
- **Sensitivity:** none observed (unexercised).
- **Risks:** changing a safety gate on zero evidence would be unjustified; lowering it (the spurious
  suggestion) would let the governor act at *lower* confidence — a safety-relevant change that must never
  ride on a tie-break.
- **Affected tests (if changed):** Sprint 3A governor branches (gate, stability-guard) + sequencing.
- **Adoption recommendation:** **KEEP `30.0`. Do not adopt.** Needs a scenario that drives
  INCREASE/DECREASE firing (a genuinely progressing/regressing athlete crossing the stability guard).

### 5b. `SURPRISE_DEADBAND` — neutral band on the stability-guard surprise (ES-006)

- **Current value:** `0.5` · **Recommended:** **`0.5` (no change).**
- **Evidence:** identical metrics across {0.25, 0.5, 0.75, 1.0} — same reason as the gate (the streak
  logic isn't exercised into a decision on these trajectories). First-pass "0.25" was a tie-break.
- **Sensitivity:** none observed (unexercised).
- **Risks:** narrowing the deadband would make the guard fire on smaller surprises — again safety-
  relevant, must not ride on a tie.
- **Affected tests (if changed):** Sprint 3A `update_streaks` / stability-guard tests.
- **Adoption recommendation:** **KEEP `0.5`. Do not adopt.** Same prerequisite as the gate.

---

## 6. Parameters reviewed and explicitly out of scope this cycle

| Parameter | Why no adoption | Disposition |
|---|---|---|
| `STABILITY_N` | Ratified (ES-006 "2–3 consistent observations"); not a calibration target. | Frozen. |
| `PREFERENCE_NUDGE` | Exercised only by athlete REPLACE/skip; synthetic athletes don't override (no organic signal). | Defer to Phase 1 preference data. |
| `SESSION_FATIGUE_CEILING` | Inert under Class-A (session total ≤ 24; never trims). | Defer to Class-B/C breadth. |
| `P_EXPLORE` | Near-inert with default-50 preferences (exploration rarely changes selection). | Defer to the preference engine. |
| Volume bands (8/12/18) / null-focus ×0.75 | Class-A band collapse + the null-focus multiplier are documented behaviors, not parameter-fit questions. | Defer to a Phase-0 band/design review. |
| `EXERCISE_COST_DEFAULT`, `RIR_REFERENCE` | Reference/structural; not exercised as free knobs by the scenarios. | Keep. |

---

## 7. Overall recommendation & required follow-up

1. **Adopt nothing now.** No parameter's current value is improved by the Sprint 4 evidence; κ/τ are
   already optimal-and-sensitive, and σ²_ref / the decision thresholds are unexercised by the present
   scenarios. Adopting the first-pass coarse-grid "recommendations" would *degrade* the model.
2. **Extend the harness before the next adoption review** (a Sprint 4.1 / pre-Phase-1 task), with:
   (a) a **conflicting-evidence** scenario (alternating S_obs at constant truth) to exercise σ²_ref;
   (b) a **progress/regress** scenario that drives the L1 governor to *fire* INCREASE/DECREASE across
   the stability guard, to exercise `DECISION_CONF_GATE` / `SURPRISE_DEADBAND`; (c) **varied-rest** and
   **multi-capability** fatigue scenarios to exercise τ_cap ratios.
3. **Treat the equilibrium bias as a design question, not a parameter** — record the ~3.6-unit
   conservative-discount overshoot for a future ES-005.1 §7 design review; it is not adjustable via
   κ/τ/σ²_ref.
4. **If/when adoption is approved**, it is a separate change that must: update `hush_model/constants.py`,
   **deliberately re-baseline** the affected golden suites named above (enumerated assertion-by-assertion
   at that time), and record the before/after parameter values and the test deltas in a follow-up
   completion note. Nothing in this document performs any of that.

*Sources: `sim/calibration.py` (fine-grid sweeps, ±25–50% around baseline, ~14 wk, production path),
`sim/gate.py` (constant + recovery scenarios), `sim/metrics.py`; all runs under
`sim/parameters.override_parameters` (restored; `assert_unpatched` passed; `constants.py` unchanged).
No code modified, no value adopted, no test re-baselined.*
