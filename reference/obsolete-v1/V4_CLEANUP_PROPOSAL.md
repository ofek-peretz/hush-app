# Hush — v4 Cleanup Proposal (review before any removal)

**Basis:** `V4_LEGACY_DATA_AUDIT.md`. **Status:** proposal only — nothing deleted.
**Goal (founder):** remove legacy Bayesian-engine baggage while preserving all useful history, telemetry, analytics, preference, exercise-catalog, and future-product assets. No users, no real data → cleanest possible window.

**Buckets:** `KEEP` (required by v4) · `KEEP FOR FUTURE` (unused today, valuable) · `DEPRECATED` (dead but keep temporarily — has a live dependency or a pending decision) · `DELETE NOW` (safe removal; justified per item).

**One prerequisite decision (drives ~70% of DELETE NOW):** the **Python backend is entirely dormant** (mobile runs `fixtureModel`; no token). The Bayesian *compute modules* and the *latent tables* are load-bearing for that backend's `/recommend` + `compose_week` path — so deleting them = **decommissioning the dead Bayesian backend now**. Recommended (no data lost: it's all in git history + preserved as reference in the two audit docs; a future v4 backend reuses the API/auth/history *schema*, never the Bayesian engine). The table below assumes **decommission-now**; if you'd rather keep the backend dormant until a v4 port, move every backend "DELETE NOW" to "DEPRECATED" — the mobile cleanup is unaffected.

---

## 1. MOBILE (the live app)

### KEEP — required by v4
- `db` keys: `profile, program, activeSession, history, preferences, engineV4, recents, telemetry, firsts, health, schemaVersion`, `mode.completedSessions`.
- Models: `Profile` (sex, age, weightKg, experience, goal, daysPerWeek, volume, units, name, healthConnected, memberSince), `Program/ProgramDay/Slot`, `Session/SetLog`, `EngineV4State` (all fields), `OwnedPreferences` (pinsByMuscle, backups, workoutOrder, exerciseOrderByWorkout), `SetTarget` (load/reps), `SessionSummary`, `PortraitSnapshot` (perCapability, stillLearning, confidence-internal).
- Catalog (`exercises.ts`): all fields + `progressionRule`/`movementPattern`/`catalogAdapter`.
- Telemetry pipeline + all current event types.

### KEEP FOR FUTURE — unused by v4, cheap to keep, real upside
- `Profile.heightCm` — collected, engine-unused; BMI/body-comp/coaching.
- `OwnedPreferences.substitutes` — persisted, not yet consumed; athlete-defined swap targets for `select_replacement`.
- `AthleteMode.ADVISORY_AUTOPILOT_L1` — reserved gated tier.
- `mode.portrait` + `PortraitSnapshot` series — progress visualization over time.
- Walk/cardio + vitals: `HistoryEvent kind:'walk'`, `WalkSample`, `useWorkoutVitals` (HR + active calories), `HealthState` series — conditioning/recovery/coaching (explicitly NOT engine inputs).

### DEPRECATED — keep temporarily (live dependency / pending decision)
- **Legacy double-progression** `progression.ts:prescribe()` + the `fixtureModel` flag-OFF branch — the fallback while the v4 flag ships OFF; remove once v4 is the default after TestFlight. (`computePortrait` in the same file is KEEP.)
- **Forecasts** — `ForecastRecord/ForecastSeed/ForecastState`, `db.forecasts`, the `ForecastSeed` on `SetTarget`, the Portrait 8-week forecast, `track('forecast_*')`. Predictive — conflicts with v4's *react-don't-predict* principle, but wired into UI and awaiting your product call. Keep until the "retire vs keep as a non-engine goal surface" decision.
- `PendingSync` / `db.pendingSync` — backend-sync queue; inert offline. Keep until backend fate is set (trivially reusable by a v4 backend).

### DELETE NOW — safe removal (with rationale)
| Item | Why no remaining value after v4 |
|---|---|
| `ThresholdEvent`, `ThresholdKind`, `db.pendingThreshold` (+`loadPendingThreshold/save/clear`, `K.pendingThreshold`), `track('threshold_crossed')`, the threshold/overtake plumbing in appStore + notification routing (`threshold_alert`) | The Portrait capability-crossing alert was already removed — `Root.tsx` states `threshold_alert` "no longer has a destination." Dead end-to-end; produces and routes nothing. |
| `ProgramChangeCard.tsx` | Unused component (no consumer anywhere). Its role (surfacing changes) is fully replaced by the v4 **Weekly Update + Why**. |
| `ProgramChange`/`ProgramChangeKind` `frame` path + `ModelClient.programChanges` + its fixture/http impls | The `frame`-change concept does not exist in v4 (no frame reframing). `programChanges` has no UI consumer; Weekly Update is the live surface. (Spans the interface + both impls — a coordinated removal.) |
| `ReasonType` `'hold'` branch / unused advisory-forecast wiring on `SetTarget` left dangling after Forecasts are decided | Only meaningful via the predictive layer; once Forecasts retire it is dead. *(Gated on the Forecast decision — list here only if Forecasts are retired.)* |

---

## 2. BACKEND — Bayesian latent state & compute (the core "baggage")

### DELETE NOW — Bayesian latent TABLES (no v4 analog; embody removed concepts)
| Table / columns | Why no remaining value after v4 |
|---|---|
| `capability_state` — `score, confidence, sum_w, fatigue, var_w, var_ws, var_ws2, last_recommended_weight, last_decision, consecutive_positive, consecutive_negative, last_decision_week` | The Bayesian latent: a hidden capability score + confidence + variance + fatigue + decision-memory. v4 reads demonstrated e1RM directly and holds NO latent/hidden state (I-30..I-39). Every column is a forbidden concept. |
| `evidence` (whole table) | Attribution of an observation into weighted capability "evidence" for the Bayesian update. v4 has no evidence/weighting step. |
| `state_update_log` (whole table) | Audit of score/confidence deltas + `agreement`, `sigma2_recent`, `est_fatigue`. There is no score to update under v4. |
| `session_progress` (whole table) | Per-(session,capability) **decision-memory accumulator** for the ES-006 governor. v4 resolves each slot from completed sets; no cross-set memory. |
| `stagnation_marker` (whole table) | Anti-repetition memory for the Bayesian plateau-surfacing feature. v4 handles plateaus reactively (stall window → lever ladder → patient hold), surfaced via Weekly Update; no separate marker. |
| `shadow_recommendation` (whole table) | Stores `shadow_predicted_rtf` vs `model_predicted_rtf` — both Bayesian reps-to-failure predictions. No v4 analog. (The *A/B-eval concept* is worth rebuilding later — noted in KEEP FOR FUTURE — but this Bayesian-specific table is empty baggage.) |
| `preference_state` (whole table) | Learned `preference_score` per family (Bayesian preference inference). Superseded by v4 `locked`/pins + the **`preference_event`** append-only log (which is KEPT). A derived cache of a model that no longer exists. |
| `athlete_state.fatigue_systemic`, `athlete_state.last_workout_at_week` | The systemic-fatigue scalar + recovery clock. v4 infers no fatigue; absence is read from `days_since_last_session` only. |
| `recommendation` — `predicted_reps_to_failure, prediction_confidence, est_fatigue_systemic, est_fatigue_capability, decision_type, target_load` | Prediction + confidence + assumed-fatigue + governor outputs. v4 issues a deterministic prescription with none of these. (Table SHELL — exercise/weight/reps/versions — see KEEP FOR FUTURE.) |
| `observation` — `predicted_reps_to_failure, prediction_error, off_policy, mu_decision, sigma_decision, predicted_reps_prescribed, predicted_success, capability_value, override_category, override_target` | The Bayesian learning record: prediction error + off-policy probability-calibration sample (μ/σ/predicted_success) + capability-space value. v4 learns nothing and predicts nothing. **Sole caveat:** the off-policy calibration fields had research value *if a learned layer were ever revisited* — but with zero data captured, there is nothing to preserve, so they are safe to drop now. |
| `exercise_block.difficulty_factor` | A Bayesian load-scaling input applied per block. v4 never reads it (load comes from demonstrated e1RM). |

### DELETE NOW — Bayesian COMPUTE modules (Python)
| Modules | Why no remaining value after v4 |
|---|---|
| `sprint0/{recommendation, prediction, confidence, decay, evidence, state_update, orchestrator, seeding, reference_strength}.py`; `sprint2/{fatigue, variance, recovery}.py`; `sprint3a/decision.py`; `sprint6/{stagnation, stagnation_service}.py`; `sprint4/{shadow, calibration, gate, scenarios, harness, metrics, parameters}.py`; `sprint7/*` sims; their `test_*.py` | These ARE the Bayesian engine: latent-score recommendation, reps-to-failure prediction, confidence, evidence decay, fatigue/variance/recovery inference, the ES-006 decision governor, stagnation surfacing, and the shadow/calibration eval harness. v4 reimplements progression deterministically in `src/engine/v4`; none of this is reachable or reusable (it computes the forbidden quantities). Recoverable from git if ever needed. |
| `lifecycle.compose_week` + `routers` Bayesian wiring that calls `recommend`/`SessionEngine` | This is the dead backend's prescription path — it exists only to drive the Bayesian engine. Goes with it (the v4 backend, when built, composes via the v4 engine instead). |

### KEEP FOR FUTURE — backend assets a v4 backend reuses (NOT Bayesian)
- **`set_record`, `exercise_block` (minus `difficulty_factor`), `workout_session`, `week_plan`** — the append-only training-history hierarchy + weekly container + composition/version stamps. The truth substrate + reproducibility. (`exercise_block.selection_reason` — "why this exercise" explainability.)
- **`preference_event`** — the full athlete-choice timeline (accepted/rejected/replaced/reordered). Personalization + coaching gold.
- **`athlete_event`** — the research/analytics event store + dual clocks.
- **`recommendation` table SHELL** — reshaped to log v4's issued prescription (exercise, weight, reps, versions) without the Bayesian columns.
- **`strategy_state.primary_focus / secondary_focus`** — specialization lever.
- **Backend catalog (`catalog.py`) richer model** — `capabilities{cap:weight}`, `exercise_family`, `replacement_group`, `difficulty_factor`, `exercise_cost`, `active` (assistance attribution, smarter swaps, difficulty-aware seeding).
- **`epley.py` / strength-standard math** — pure formulas v4 also uses.

### KEEP — backend infra (engine-agnostic; required by ANY backend)
- `athlete` (identity), `athlete_state.workout_count`, `strategy_state.weekly_frequency/weekly_volume`, `auth_token`, `idempotency_key`, `erasure_record`, `schema_version`, the migration runner, the API router/auth/consent/enroll shell.

---

## 3. ANALYTICS / TELEMETRY
- **KEEP / KEEP FOR FUTURE — all of it.** `athlete_event`, the telemetry pipeline, and every event type are preserved. The only analytics removal is `track('threshold_crossed')` (its feature is gone) and, if Forecasts retire, `track('forecast_*')`. No analytics history or schema is otherwise touched.

---

## 4. SUMMARY

| Bucket | Mobile | Backend |
|---|---|---|
| **KEEP** | profile/program/history/engineV4/preferences/catalog/telemetry/health/portrait | athlete, counts, freq/volume, auth, idempotency, erasure, migrations, API shell |
| **KEEP FOR FUTURE** | heightCm, substitutes, autopilot tier, portrait series, walk/cardio+vitals | history hierarchy, preference_event, athlete_event, recommendation shell, focus fields, rich catalog, epley |
| **DEPRECATED** | legacy `prescribe()` (until flag ON), Forecasts (pending decision), pendingSync | *(none — or the whole backend, if you choose keep-dormant over decommission-now)* |
| **DELETE NOW** | ThresholdEvent + pendingThreshold plumbing; ProgramChangeCard + `frame`/`programChanges` | Bayesian latent tables (capability_state, evidence, state_update_log, session_progress, stagnation_marker, shadow_recommendation, preference_state) + fatigue columns + prediction columns + difficulty_factor + the Bayesian compute modules/tests + the dead compose path |

**Net effect:** the entire Bayesian latent/predictive/fatigue machinery is removed; every byte of real-history, choice-log, analytics, catalog, and future-product capability is retained (in-tree where reused, in git + these docs where the backend is decommissioned).

**Recommended review order if approved:** (1) mobile DELETE NOW (small, zero-dependency, lowest risk) → (2) confirm the backend decision (decommission-now vs keep-dormant) → (3) backend Bayesian DELETE NOW as one PR → (4) flip the v4 flag after TestFlight, then retire the DEPRECATED `prescribe()` path. Each step re-runs tsc + jest + expo export.

*No code changed by this document.*
