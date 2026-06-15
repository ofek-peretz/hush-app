# HUSH_V1_TRACEABILITY.md

> For every engine, state, decision type, capability, and major invariant: the source
> specification(s). Use this to answer "where does this rule come from?" and to keep the
> implementation provably faithful to the frozen model. Sprint 0 code paths are noted where
> they exist. Anchor specs: **ES-005.1** (math), **ES-008 v2** (calibration).

> **════ AS-BUILT RE-POINT — DX-15 (2026-06-12) ════**
> Beyond Sprint 0, the build advanced through DX-07/04/03 → M1 → DX-11 → DX-09/M5 → **DX-08/10/12**, then
> the **Wave-2 backend API shell** over the frozen model (Schema **v11**, **284/284** — model golden 189 +
> API pytest 95). Re-points reflected in the rows below: the **ES-006 L1 governor is advisory** (DX-03;
> emits the held load; program load = score-derived `target_load`, DX-20); `actual_weight` is a
> **learning input** (M1/DX-01/02 — `evidence.py`/`pipeline.py`); **exploration is off** (DX-04);
> **`bodyweight_kg`** is on `AthleteState` (DX-07); **ES-013 investigation is retired → M5 stagnation
> detection** (DX-09 — `hush_model/stagnation.py`, `persistence/stagnation_service.py`, sprint6);
> **CHANGE_STRATEGY is an advisory M5 surfacing**, not investigation-licensed. Stagnation history is
> read from `state_update_log`⋈`evidence`.

---

## 1. Engines → source specs

| Engine | Source spec(s) | Sprint 0 code |
|---|---|---|
| Workout / Session Engine | ES-001 (hierarchy, lifecycle), ES-009 (composition), ES-009.1 (volume), ES-002 (catalog) | `hush_model/catalog.py` (ES-002 catalog, Sprint 3B-1); **`composition.py` (ES-009 four stages + exploration floor) + `volume.py` (ES-009.1 two-lever) + `persistence/session.py` (`SessionEngine` driver), Sprint 3B-2** (Class-A only) |
| Prediction Engine | ES-004 (engine), ES-005.1 (forward math), ES-011 (fatigue adjust) | `hush_model/prediction.py` (fatigue-adjusted, Sprint 2) |
| Evidence Engine | ES-004 (evidence types), ES-010 (attribution, taxonomy) | `hush_model/evidence.py` (de-fatigue ordering, Sprint 2) |
| State Update Engine | ES-007 (ownership, gradual, conflict), ES-005.1 §5–6 (blend, confidence) | `hush_model/state_update.py` (+ES-010 C agreement, Sprint 2) |
| Recommendation Engine | ES-006 (decisions, gate, metrics), ES-005.1 §7,§13 (discount, quantization), ES-002/ES-009 §6 (REPLACE) | `hush_model/recommendation.py` + `hush_model/decision.py` (Sprint 3A: full L1 KEEP/INCREASE/DECREASE governor over the ES-005.1 target, stability guard, confidence gate) + `service.replace_exercise`/`catalog.replace` (Sprint 3B-1: **L2 REPLACE_EXERCISE live**, preference-driven); CHANGE_STRATEGY signal-only |
| Fatigue & Recovery Engine | ES-011 (all); amends ES-005.1 §4 + ES-010 order | `hush_model/fatigue.py`, `recovery.py` (Sprint 2; fixed τ, effort_offset=0) |
| Investigation Engine | ES-013 — **RETIRED in v1**; replaced by M5 | — (not built; see Stagnation/M5) |
| Stagnation / M5 | Product Spec §12/§13; ports `sim/metrics.py` trend primitives; reads `state_update_log`⋈`evidence` | `hush_model/stagnation.py` + `persistence/stagnation_service.py` (DX-09, sprint6; read-only, advisory; migration_009 v9) |
| Trust Measurement (governance) | ES-012; replaces Founder North Star; v1 success reoriented (DX-14) | Phase-0 instruments only — `sim/shadow.py` + de-biased error (Sprint 4); full TrustScore deferred |

---

## 2. States → source specs

| State object | Mutability | Source spec(s) | Sprint 0 |
|---|---|---|---|
| Athlete | static | ES-Founder Ch2, ES-003 (onboarding fields) | `domain.AthleteState` |
| Exercise / catalog | static | ES-002 (mappings, weights, difficulty_factor, versioning) | `hush_model/catalog.py` (Sprint 3B-1; code-resident frozen reference data, Class-A only, version-tied to CAPABILITY_MODEL_VERSION) |
| WorkoutSession → ExerciseBlock → Set | immutable | ES-001 | — |
| Observation | immutable | ES-001, ES-004; fatigue/effort-adjusted per ES-011 | `domain.Observation` |
| Evidence | immutable | ES-010 (per-capability), ES-005.1 §5 (quality/weight) | `domain.Evidence` |
| Recommendation | immutable | ES-006 (fields, reason), version stamps ES-005.1/ES-008 v2 | `domain.Recommendation` |
| StateUpdateLog | immutable | ES-007 | — (deferred persistence) |
| Investigation records | immutable | ES-013 | — |
| AthleteState | mutable | ES-007, ES-Founder Ch2; **`bodyweight_kg` added (DX-07, migration_007 v7)** | `domain.AthleteState` (+ `bodyweight_kg`, nullable; `onboard` signature + profile contract) |
| CapabilityState (score, confidence, sum_w; +Sprint 3A decision memory: last_recommended_weight, last_decision, consecutive_positive/negative) | mutable | ES-008 v2 (score), ES-005.1 §5–6 (confidence, sum_w); ES-006 (decision memory/streaks); `trend` deliberately NOT stored (ES-008 derivable) | `domain.CapabilityState` |
| PreferenceState | mutable | ES-007, ES-009 §6 (selection), ES-010 (preference signal) | `domain.PreferenceState` + `preference_state` table (Sprint 3B-1; minimal bounded nudge `preference.nudge`, no learning curve) |
| StrategyState | mutable | ES-008 v2 (fields), ES-006/007 (CHANGE_STRATEGY) | `domain.StrategyState` + `strategy_state` table (Sprint 3B-1; weekly_volume enum; single-source defaults `default_strategy_state`) |
| Fatigue state (systemic + per-capability) | mutable | ES-011 | — |
| Investigation state | mutable | ES-013 | — |

---

## 3. Decision types → source specs

| Decision | Layer | Source spec(s) |
|---|---|---|
| Per-set load / target reps | L1 | ES-006, ES-005.1 (prediction + target=rtf−RIR), ES-011 (fatigue) |
| KEEP_LOAD | L1 | ES-006 (default under uncertainty), ES-011 B.3 (fatigue hold) — Sprint 3A `decision.py` |
| INCREASE_LOAD | L1 | ES-006; blocked by ES-011 when fatigue elevated — Sprint 3A (stability guard + confidence gate, one step toward target) |
| DECREASE_LOAD | L1 | ES-006; ES-011 B.3 (only when fatigue low → real regression) — Sprint 3A (negative run on fatigue-removed surprise) |
| REPLACE_EXERCISE | L2 | ES-006 (preference-driven), ES-002 (replacement group), ES-009 §6 (selection) — **live in Sprint 3B-1** (`service.replace_exercise` + `catalog.replace`; preference-driven, never performance-driven, capability-preserving, audited) |
| Volume change | L3 | ES-009.1 (allocation), ES-007 (evaluation cycle) — **per-session allocation live in Sprint 3B-2 (`volume.py`); band auto-progression signal-only to ES-007 (unbuilt)** |
| CHANGE_STRATEGY | L4 | ES-006 (rare, high-confidence); **v1: an ADVISORY M5 surfacing** (DX-09) — *not* investigation-licensed (ES-013 retired); read-only, acceptance-gated volume option only |
| Goal change | L5 | ES-013 §9 (athlete-owned; system surfaces stall only); Founder Principle 8 |

---

## 4. Capabilities → source specs

| Capability | Class | A_c (S=64 landmark) | k | Source |
|---|---|---|---|---|
| horizontal_push | A | 113 kg | 0.016227 | ES-005.1 (anchor), ES-008 v2 |
| horizontal_pull | A | 100 kg | 0.016227 | ES-008 v2 |
| vertical_push | A | 68 kg | 0.016227 | ES-008 v2 |
| knee_dominant | A | 150 kg | 0.016227 | ES-008 v2 |
| hip_dominant | A | 180 kg | 0.016227 | ES-008 v2 |
| vertical_pull | B (bodyweight) | n/a (needs bodyweight) | 0.016227 | ES-008 v2 §1,§3 |
| core_stability | C (isometric/time) | n/a (hold-time curve) | separate κ | ES-008 v2 §3 |

Shared `k` across Class-A is what makes equal scores percentile-comparable (ES-008 v2 §6,
Principle #51). Class B requires a bodyweight input (not collected — open gap). Class C uses
a duration curve and a DurationObservation, never the kg/Epley pipeline (ES-008 v2 §3).
Sprint 0 implements the five Class-A capabilities only.

---

## 5. Major invariants → source specs

| # | Invariant | Source | Sprint 0 enforcement |
|---|---|---|---|
| 1 | Decisions read from state, never from raw history | ES-Founder §34 | by construction (loop reads CapabilityState) |
| 2 | History immutable; state mutable | ES-Founder, ES-001 | frozen vs mutable dataclasses |
| 3 | Recommendation and learning use the same model, inverted (Principle #43) | ES-005.1 | round-trip test passes |
| 4 | Observed performance = capability − fatigue (Principle #59) | ES-011 | Sprint 2: de-fatigue before attribution (`evidence.py`), fatigue-adjusted prediction |
| 5 | One capability, one mode | ES-013 | (modes deferred) |
| 6 | Safety > Investigation > Recommendation, governed by Trust | ES-013, ES-011, ES-012 | (precedence deferred) |
| 7 | Every conclusion carries what it could not exclude | ES-006 audit rule, ES-013 §11 | (audit ledger deferred) |
| 8 | Capabilities durable, exercises interchangeable, fatigue transient | ES-008 v2, ES-002, ES-011 | three-tier ontology in domain/constants |
| 9 | Confidence is data, not metadata | ES-005.1 §6, ES-006 gate | confidence drives discount in recommendation |
| 10 | Conservative defaults (Safe > Accurate) | ES-003 #39, ES-005.1 §7, ES-006 | discount + plate-floor + light seeds |

---

## 6. Key formulas → source specs (all ES-005.1 unless noted)

| Rule | Formula | Source | Sprint 0 |
|---|---|---|---|
| ReferenceStrength | `A_c · e^{kS}` | §1, ES-008 v2 §2 | `capability/reference_strength.py` |
| Inverse score | `ln(RM1/A_c)/k` | §1 | `score_of` |
| Epley predict | `(RM1/L − 1)·30` | §2 | `capability/epley.py` |
| Epley load-for-reps | `RM1/(1+r/30)` | §2 | `load_for_reps` |
| Epley observed RM1 | `L·(1+r/30)` | §2 | `rm1_from` |
| Target vs failure | `target = predicted_rtf − RIR` | §3/§4 | `recommendation.py` |
| Observed score | `S_obs = ln(RM1_obs/A_c)/k` | §5, ES-010 A.1 | `evidence.py` |
| Evidence quality | `(pred_conf/100)·error_class_weight` | §5 | `constants.error_class_weight` |
| Evidence weight wᵢ | `decay·quality·w_c` | §5, ES-010 | `evidence.py` |
| Precision blend | `(Σw·S_old + wᵢ·S_obs)/(Σw+wᵢ)` | §5 | `state_update.py` |
| Capability confidence | `100·(1−e^{−Σw/8})`, floor 10 | §6, ES-008 v2 seed | `capability/confidence.py` |
| Variance-suppressed confidence | `× agreement(1−σ²/σ²_ref)` | ES-010 C | `variance.py` + `confidence.py`/`state_update.py` (Sprint 2; σ²_ref provisional) |
| Decay | `0.5^{Δt/23.48wk}` | §10 | `capability/decay.py` |
| Safety discount | `1 − 0.12·(1−c/100)` | §7 | `recommendation.safety_discount` |
| Quantization | round DOWN to plate increment | §13 | `recommendation.py` |
| Cohort multiplier | `m_sex·(1−0.005·max(0,age−30))` | ES-008 v2 §5 | `constants.cohort_multiplier` |
| Seed scores | beginner 30 / intermediate 48 / advanced 64 | ES-008 v2 §4 | `constants.SEED_SCORE` |
| Seed prior precision | `Σw = −8·ln(0.9) = 0.843` (so prior participates in blend) | derived from §6 at seed floor | `seeding.SEED_PRIOR_SUM_W` |
| Fatigue: set generation | `κ·rel_load·reps·proximity·exercise_cost` | ES-011 A.4 | `fatigue.set_fatigue` (Sprint 2; κ provisional) |
| Fatigue decay / recovery | `Fatigue·e^{−Δt/τ}` (τ systemic + per-capability) | ES-011 D | `recovery.py` (Sprint 2; **fixed τ**, provisional) |
| De-fatigue before attribution | rep-space removal before ES-005.1 conversion | ES-011 C.3 (amends ES-010 order) | `fatigue.defatigue_reps` in `evidence.py` (Sprint 2) |
| Decision governor (KEEP/INCREASE/DECREASE) | **ADVISORY (DX-03/DX-20):** computes the decision + reason and surfaces them, but **emits the held load** (the ±1-increment step is not applied); the program load is the score-derived `target_load` | ES-006 | `decision.govern` (Sprint 3A; load formula preserved) → emitted held + `target_load` (DX-03/M1) |
| Stability guard | `STABILITY_N=3` consistent observations; run on sign of fatigue-adjusted surprise | ES-006 | `decision.update_streaks` (Sprint 3A; `STABILITY_N` ratified, gate/deadband provisional) |
| Block surprise (decision hook) | `s_obs − score_at_block_entry`, once per block (drift-independent) | ES-006 | `pipeline._record_block_decision` / `complete_block` (Sprint 3B-1; single shared hook, rested + fatigue-aware) |
| Global confidence / calibration | `mean(Class-A confidences)`; calibrating while `< 70` | ES-009 §5, ES-008 v2 | `domain.AthleteState.global_confidence` / `.calibration_phase` (Sprint 3B-1; derived, not stored) |
| Exercise selection (Stage-3 primitive) | calibration → canonical; steady-state → argmax preference_score, tie-break difficulty_factor | ES-009 §6 | `catalog.ExerciseCatalog.select` / `.replace` (Sprint 3B-1) |
| Preference nudge | one bounded step per REPLACE event, clamped [0,100] | ES-009 §6 | `preference.nudge` (Sprint 3B-1; `PREFERENCE_NUDGE` provisional) |
| Session template (Stage 1) | Class-A-restricted frozen split by `weekly_frequency`; `session_index mod len`; freq clamped to {2,3,4} | ES-009 §4 | `composition.compose_session` / `constants.TEMPLATES_CLASS_A` (Sprint 3B-2; 7-cap templates frozen inactive; 5/5 coverage re-proven) |
| Capability priority (Stage 2) | calibration: `staleness + uncertainty` (staleness=min(wk_since,2), uncertainty=(100−conf)/100); steady-state: focus-first, info-gain tie-break | ES-009 §5 | `composition.resolve_priority` (Sprint 3B-2) |
| Volume two-lever allocation | `per_session=weekly/times_trained`; `slots=clamp(round(p/3),1,2)`; `sets=clamp(round(p/slots),2,4)`; focus ×1.25/1.00/0.75; calibration 1×2 | ES-009.1 §1–5 | `volume.allocate` / `volume.times_trained` (Sprint 3B-2; bands 8/12/18 provisional; **Q3 band collapse documented**) |
| Block ordering (Stage 4) | `CAPABILITY_PRIORITY_ORDER` (knee/hip/h_push/h_pull/v_push), then difficulty_factor desc, then slot | ES-009 §7 / ratified Q1 | `composition._order_key` (Sprint 3B-2; no catalog ordering metadata) |
| Exploration floor | **OFF by default (DX-04): `P_EXPLORE = 0.0`** — a steady-state slot always takes its top-preference exercise (composition preference-stable). Mechanism retained (seeded RNG, `exploration_seed`, R4) for Phase-0 override only | ES-009 §6 | `composition._select_for_slot` (Sprint 3B-2; guarded `P_EXPLORE > 0.0`; DX-04) |
| Session fatigue ceiling + recovery gate | if Σ(slots×sets) > ceiling, trim lowest-priority slots until ≤ ceiling (trim-only, never rebuilt) | ES-011 / ES-009.1 §4 / ratified Q2,R1 | `composition._trim_to_ceiling` (Sprint 3B-2; `SESSION_FATIGUE_CEILING=24` PROVISIONAL/UNVALIDATED) |
| Per-capability decision update (multi-slot) | one ES-006 governor update per capability per session, driven by the primary slot | ES-006 / ratified R2 | `persistence/session.SessionEngine` → `pipeline.complete_block` (Sprint 3B-2) |

---

## 7. Attribution & override rules → ES-010

| Rule | Source |
|---|---|
| Multi-capability split is in LOAD space, not rep space | ES-010 A.1 (Contradiction 1) |
| Each capability converts against its OWN anchor A_c | ES-010 A.1 (Contradiction 2) |
| One Evidence row per (observation, capability); accumulation only in Σw | ES-010 A.5 (Contradiction 3) |
| Override taxonomy: LOAD / EXERCISE_REPLACEMENT / EQUIPMENT_CONSTRAINT / SET_SKIP / SESSION_SKIP / VOLUNTARY_PROGRESSION | ES-010 B.1 |
| Categories: learning / preference / adherence / noise | ES-010 B.3 |
| LOAD_OVERRIDE enters the SAME path on actual_weight | ES-010 B.4, ES-005.1 §5 |
| Conflict → suppress confidence + damp learning rate (variance) | ES-010 C, ES-007 conflict principle |

---

## 8. Investigation & plateau rules → ES-013

| Rule | Source |
|---|---|
| Plateau is a residual surviving experiment, never a raw detection (Principle #63) | Plateau Red Team Review; ES-013 core |
| Probes: Deload / Challenge / Volume / Exercise; each single-variable, reversible, invisible, confidence-gated | Plateau Investigation Framework; ES-013 §4 |
| Sequence: suspicion gate → deload (if fatigued) → challenge → volume|exercise → strategy | ES-013 §5 |
| Deload is diagnostic AND treatment for the fatigue confound | Framework; ES-013 §4.1 |
| Challenge resolves the self-induced-plateau (held-load) confound | ES-013 §4.2 |
| Investigation confidence bounded by weakest input + un-excluded confounds | ES-013 §6 |
| CHANGE_STRATEGY licensed only by Resolved-confirmed investigation | ES-013 §8 |
| Goal change athlete-owned; system surfaces stalls only | ES-013 §9; Founder Principle 8 |
| Mode precedence Fatigue > Investigation > Recommendation, Trust governs | Investigation Engine Spec; ES-013 §2,§10 |

---

## 9. Trust rules → ES-012

| Rule | Source |
|---|---|
| TrustScore = Trustworthiness × CostlyDeference × DiscernmentRetained (multiplicative) | ES-012 C.1 |
| Acceptance is demoted from North Star to diagnostic | ES-012 H (replaces Founder North Star) |
| De-biased (fatigue+effort-adjusted) error is the model-quality signal | ES-012 D.1 |
| Override Productivity replaces "minimize overrides" | ES-012 B, H |
| Shadow baseline = within-athlete fixed-progression counterfactual | ES-012 F.1 — **built Sprint 4 (`sim/shadow.py`, fixed/non-learning; `shadow_recommendation` table)** |
| Validation needs ≥1 decrease + ≥1 fatigue-hold per athlete handled with compliance | ES-012 F.4 |

---

## 9a. Validation & instrumentation (Sprint 4) → source

| Item | Source | Sprint 4 code |
|---|---|---|
| Phase 0 offline simulation harness (frozen model, synthetic athletes) | Validation Architecture Phase 0; Build Plan [2] | `sim/harness.py` + `sim/scenarios.py` (drives the production `SessionEngine`; non-circular) |
| Parameter override for sweeps (production binding sites) | Build Plan [3] | `sim/parameters.override_parameters` (restores + asserts; recommend-only, Q1) |
| A2 stability (oscillation/drift/ratchet) + convergence | Validation Architecture A2; Build Plan [10] | `sim/metrics.py`, `sim/gate.py` (raw metrics primary, Q5) |
| A1 recoverability (offline) + fresh-state check | Validation Architecture A1 | `sim/metrics.recoverability` / `.fresh_state_check` (live probe slot deferred to ES-013) |
| A8 shadow paired comparison | ES-012 F.1 / D.1 | `sim/metrics.shadow_paired` + `shadow_recommendation` |
| A9 override-target logging | ES-010 B.1 | `observation.override_category/override_target` (Sprint 4 cols) |
| Complete session reconstruction | ES-009 §9 / Inv. 7 | `service.reconstruct_session` |
| Parameter calibration + sensitivity (recommend-only) | Build Plan [3] | `sim/calibration.py` (κ/τ/σ²_ref/gates/nudge; **adopts nothing** — Q1) |
| Phase 0 gate (provisional verdict) | Build Plan [10] | `sim/gate.evaluate` (thresholds proposed, ratifiable — Q5) |

---

## 10. Assumptions → where they bite (Assumptions Register)

| ID | Assumption | Primary spec(s) at risk | MVP testable? |
|---|---|---|---|
| A1 | Capability recoverable from confounded observations | ES-005.1, ES-011 | partial (needs fresh-state probes) |
| A2 | Coupled loop converges | whole stack | no (offline sim only) |
| A3 | Trust measurable through behavior | ES-012 | partial (needs probes) |
| A4 | Athletes will delegate | Founder, Thesis v2 | no (deferred to Phase 3) |
| A5 | effort/fatigue separable | ES-005.1 §4, ES-011 C.4 | no (needs RIR) |
| A6 | per-athlete τ learnable | ES-011 D.3 | no (ship fixed τ) |
| A7 | seed safety across cohorts | ES-008 v2 §4–5 | yes (week 1) |
| A8 | de-biased error valid signal | ES-012 D.1 | directional only |
| A9 | overrides interpretable | ES-010, ES-002 catalog | yes |

**Rule of thumb when implementing:** if a code path depends on A1–A6, it must record what it
could not exclude (Invariant 7) and must not claim certainty it cannot have. If it depends on
A7 or A9, instrument it so the trial measures it directly.
