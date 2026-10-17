# Hush — Legacy Data Audit (pre-merge inventory review)

**Purpose:** a complete inventory of every stored data structure in the codebase, classified for the v4 cutover. **No data exists yet** (no users) — this is a "don't accidentally discard something useful" review, not a migration.

**Scope inspected:** backend SQLite schema (`implementation/sprint1/schema.py` + migrations 002–018), mobile local persistence (`src/data/local/db.ts` + `models.ts`), telemetry schema (`src/platform/telemetry.ts`), both exercise catalogs (`src/data/exercises.ts`, `implementation/sprint3b1/catalog.py`), and the health/vitals/watch structures.

**Two big framing facts**
- The **mobile** app is what runs; v4 was built there. The **entire Python backend is currently bypassed** (no token → `fixtureModel`). So "used by v4" below means *the mobile v4 path*; the backend is a separate "port-or-decommission" decision.
- v4's governing principles forbid prediction/fatigue/latent-state. So anything that **stores a prediction, a latent score, or an inferred internal state is dead under v4** — but the **raw observed outcomes** those were computed from are exactly what v4 consumes, and are the keepers.

---

## PART A — Inventory by store

### A1. Backend SQLite (22 tables)
| Table | Purpose | Nature |
|---|---|---|
| `athlete` | identity (sex, age, experience, bodyweight_kg, goal, created_at) | profile |
| `athlete_state` | workout_count, **fatigue_systemic**, last_workout_at_week | mixed |
| `capability_state` | **score, confidence, sum_w, fatigue, var_w/ws/ws2, last_recommended_weight, last_decision, consecutive_pos/neg, last_decision_week** | Bayesian latent |
| `strategy_state` | weekly_frequency, weekly_volume, primary/secondary_focus | strategy |
| `preference_state` | learned preference_score per (athlete, family) | Bayesian-ish cache |
| `preference_event` | **append-only athlete-choice log** (pin/replace/substitute/backup/reorder) | ownership truth |
| `week_plan` | weekly container + composition/version snapshot | structure |
| `workout_session` | session history + composition audit (seed, focus, versions, name, week_plan_id, position) | history |
| `exercise_block` | per-exercise prescription (recommended_weight, target_reps/sets, **difficulty_factor**, position, **selection_reason**) | history |
| `set_record` | **recommended_weight, target_reps, actual_weight, actual_reps, status** | history (truth) |
| `recommendation` | issued prescription + **predicted_reps_to_failure, prediction_confidence, est_fatigue_*, decision_type, target_load**, replace audit, versions | Bayesian output |
| `observation` | actual vs predicted + **prediction_error, off_policy, mu_decision, sigma_decision, predicted_reps_prescribed, predicted_success, capability_value**, override_* | Bayesian learning |
| `evidence` | s_obs, quality, weight, source_week | Bayesian learning |
| `state_update_log` | score/confidence deltas + agreement, sigma2_recent, est_fatigue | Bayesian audit |
| `shadow_recommendation` | A/B shadow policy comparison | research/eval |
| `session_progress` | per-(session,capability) decision-memory accumulator | Bayesian infra |
| `stagnation_marker` | anti-repetition memory for plateau surfacing | Bayesian-engine feature |
| `idempotency_key` | exactly-once dedup | infra |
| `auth_token` | hashed bearer tokens + revocation | infra |
| `erasure_record` | OD-2 erasure tombstone | infra/compliance |
| `athlete_event` | **append-only research event store** (all interactions) | analytics substrate |
| `schema_version` | migration bookkeeping | infra |

### A2. Mobile local persistence (`db.ts` keys)
`profile, program, mode, activeSession, history, snapshots, forecasts, recents, pendingSync, pendingThreshold, telemetry, firsts, health, preferences, engineV4, schemaVersion`.

### A3. Mobile models (`models.ts`)
Profile, OnboardingInputs, Slot, ProgramDay, Program, SetTarget, ForecastSeed/Record/State, SetLog, SessionSummary, Session, PortraitSnapshot, ProgramChange(+Kind), ThresholdEvent(+Kind), HistoryEvent, AthleteMode, PortraitState. Plus `OwnedPreferences` (db.ts) and `EngineV4State` (db.ts).

### A4. Telemetry schema
`TelemetryEvent {event_id, type, client_ts, client_monotonic, seq, session_id, app_version, os, device_id, locale, network, data}` → backend `athlete_event`. ~40 event types.

### A5. Catalogs
- **Mobile** (`exercises.ts`, 59 ex): id, name, capability, muscle, equipment, tier, baseKg, bwScaled, bodyweight, cues[3], synonyms, swapOnly + derived progressionRule / movementPattern / defaultBackup / similar / LOAD_STEP_KG.
- **Backend** (`catalog.py`, ~10 ex): exercise_id, **capabilities{cap:weight} (multi-capability)**, **difficulty_factor**, equipment, exercise_class, **replacement_group**, **exercise_family**, **exercise_cost**, active.

### A6. Health / vitals / watch
- `HealthState {lastBodyweightKg, lastSyncedAt}`; `BodyweightSample {kg, recordedAt}`; `WalkSample {distanceMeters, durationS, startedAt}`.
- `useWorkoutVitals` — live **heart rate** + **active calories** (paired watch) / estimated kcal.
- `SessionMirror` / `MirrorStep` — watch session display (exerciseName, set labels, target weight/reps, reasonDelta, swapOptions).

---

## PART B — Classification (the five requested buckets)

### 1) Fields CURRENTLY USED BY v4 (mobile path) — keep, in active use
- **Profile:** `sex, age, weightKg, experience, goal, daysPerWeek, volume, units` (seed + scheme + assembler). `name, memberSince, healthConnected, heightCm` (product/UI; heightCm collected but engine-unused — see bucket 2).
- **Program / ProgramDay / Slot** (`capability, exerciseId, setCount, supplemental, key, completed`) — the assembled split v4 operates under.
- **History `Session` / `SetLog`** (`exerciseId, recommendedWeight, recommendedReps, actualWeight, actualReps, startedAt, earlyFinish`) — the **completed-work truth** v4 reads (→ SlotResult; `failed` inferred from actual<recommended).
- **`EngineV4State`** — every per-slot field: `current_exercise_id, current_load_kg, current_sets, rep_target, rep_range, calibrating, calib_weeks, miss_streak, flat_weeks, hold_mode, levers_tried, tenure_weeks, weeks_since_swap, locked, history[WeekRecord], order_index, pattern, slotId` + `global{days_since_last_session, injury_flag}`, `lastAdvanceAt`, `goal`, `lastUpdate{explanations…}`.
- **`OwnedPreferences`** `pinsByMuscle` (→ v4 `locked` manual replace), `exerciseOrderByWorkout`, `workoutOrder`, `backups`. (`substitutes` persisted but not yet consumed by v4 — bucket 2.)
- **Catalog fields:** `id, name, capability, muscle, equipment, tier, baseKg, bwScaled, bodyweight, cues, synonyms, swapOnly` + `progressionRule`, `movementPattern` (→ engine `Pattern`, incl. VERTICAL_PULL).
- **PortraitSnapshot** `perCapability, stillLearning` (display via `computePortrait`); `confidence` internal.
- **Telemetry** buffer + firsts; **HealthState.lastBodyweightKg** (seeds bodyweight); **activeSession, recents, mode.completedSessions, SessionSummary**.

### 2) NOT used by v4 but POTENTIALLY VALUABLE later — keep, don't delete
- **`profile.heightCm`** — collected at onboarding, unused by the engine. Future: BMI / body-composition context, calorie estimates, coaching.
- **`strategy_state.primary_focus / secondary_focus`** — the focus/specialization concept (dropped in the schedule-agnostic v4). Future: a "bring up X" specialization lever.
- **`preference_event` (full log)** — beyond the current projection: the **timeline of every accepted/rejected/replaced exercise**. Gold for personalization ("you always swap X→Y"), coaching, and model evaluation. Keep even though v4 only needs the latest-wins projection.
- **`athlete_event` research store + the telemetry schema** — the substrate for analytics, retention analysis, and any future learned/coaching layer.
- **`OwnedPreferences.substitutes`** — persisted, not yet wired into v4 selection. Future: athlete-defined preferred swap targets feeding `select_replacement`.
- **Backend catalog richness:** `capabilities{cap:weight}` (multi-capability assistance attribution — e.g. bench also trains triceps), `difficulty_factor`, `exercise_cost`, `exercise_family`, `replacement_group`. The mobile catalog is single-capability + tier; these enable smarter swap pools, assistance-aware progress, and difficulty-aware seeding later.
- **`exercise_block.selection_reason`** (`canonical|preference|exploration|second_slot|replacement`) — "why this exercise" audit, useful for explainability/coaching surfaces.
- **Composition/version stamps** (`catalog_version, model_version, capability_model_version, exploration_seed`, week_plan snapshot) — reproducibility/debuggability of any past prescription.
- **Walk/cardio + vitals:** `HistoryEvent kind:'walk'`, `WalkSample{distanceMeters,durationS}`, live **heart-rate** + **active-calorie** capture. v4 explicitly does NOT use these as engine inputs (react-to-completed-strength-work only), but they are real, already-captured signals for **conditioning history, recovery context, and coaching** — keep the structures.
- **`PortraitSnapshot` time series** — per-construction snapshots enable progress-over-time visualization even though the live bars are recomputed.
- **`AthleteMode.ADVISORY_AUTOPILOT_L1`** (gated, flag-off) — reserved autopilot tier.

### 3) OBSOLETE — safe to remove (no v4 use, no future value identified)
- **`pendingThreshold` / `ThresholdEvent` (+`ThresholdKind`)** — Portrait capability-crossing alerts; the **Portrait alert destination was already removed** (see `Root.tsx`: "threshold_alert no longer has a destination"). Dead end-to-end.
- **`ProgramChange` `frame` kind + `ProgramChangeCard`** — "frame change decided/vetoable" surface; **unused** (no consumer) and v4 has no frame-change concept. The Weekly Update + Why replaces the load-change surface. (Keep the `load` notion only as the conceptual ancestor of v4 explanations; the component + frame path are removable.)
- **`mode.portrait` threshold/overtake plumbing** tied to the removed alerts.
- **`exercise_block.difficulty_factor`** as a *runtime input* — it scaled load in the Bayesian recommender; v4 never reads it (could be repurposed per bucket 2, but the current usage is dead).

### 4) Bayesian-engine DEAD structures — created for the old engine, now inert
**All of these embody concepts v4 removed by evidence (fatigue inference, latent score/confidence, variance, prediction, decision-memory). They produce or store nothing v4 reads.**
- **`capability_state`**: `score, confidence, sum_w, fatigue, var_w, var_ws, var_ws2, last_recommended_weight, last_decision, consecutive_positive, consecutive_negative, last_decision_week`.
- **`athlete_state.fatigue_systemic`, `last_workout_at_week`** (fatigue clock).
- **`recommendation`**: `predicted_reps_to_failure, prediction_confidence, est_fatigue_systemic, est_fatigue_capability, decision_type, target_load`.
- **`observation`**: `predicted_reps_to_failure, prediction_error, off_policy, mu_decision, sigma_decision, predicted_reps_prescribed, predicted_success, capability_value, override_*`.
- **`evidence`** (s_obs/quality/weight), **`state_update_log`** (score deltas, agreement, sigma2_recent, est_fatigue), **`shadow_recommendation`**, **`session_progress`** (decision-memory accumulator), **`stagnation_marker`** (Bayesian plateau surfacing), **`preference_state`** (learned preference_score — superseded by v4 `locked`/pins + the preference_event log).
- **Python modules** behind them (already flagged for the separate backend workstream): `recommendation, prediction, confidence, decay, evidence, state_update, orchestrator, fatigue, variance, recovery, decision, stagnation*`.

**Caveat (one genuinely dual-use item):** `observation`'s off-policy calibration fields (`mu_decision, sigma_decision, predicted_success`) are Bayesian-shaped but were designed for *probability calibration / model improvement*. If a future learned layer is ever revisited, these are the only "dead" fields with research value — everything else in bucket 4 is purely the old latent machinery.

### 5) Existing schema elements with FUTURE product / analytics / personalization / coaching value
(The "keep these on purpose" list — superset of bucket 2, organized by capability.)
- **Coaching / personalization:** `preference_event` timeline · backend catalog `capabilities{cap:weight}` + `exercise_family` + `replacement_group` (assistance attribution, smarter swaps) · `heightCm` (body-comp) · `selection_reason` · `OwnedPreferences.substitutes`.
- **Conditioning / recovery (non-engine):** walk/cardio history + `WalkSample` · live heart-rate + active-calorie capture · `HealthState` bodyweight series.
- **Analytics / research:** `athlete_event` + telemetry schema · `shadow_recommendation` (as an A/B *framework*, even if the specific shadow policy is retired) · composition/version stamps for reproducibility.
- **Progress visualization:** `PortraitSnapshot` time series · `set_record` recommended-vs-actual history · `week_plan` weekly grouping.
- **Compliance / infra (keep regardless):** `auth_token, idempotency_key, erasure_record, schema_version`.

---

## PART C — Recommendations (no action taken; report only)

1. **Keep all raw history + event + preference logs** (`workout_session`/`exercise_block`/`set_record` minus the Bayesian columns; `athlete_event`; `preference_event`). These are the irreplaceable truth + choice timeline v4 and any future layer need.
2. **When the backend is ported to v4** (separate workstream), drop the bucket-4 latent tables/columns; do **not** drop the history hierarchy, events, preferences, auth, or week_plan.
3. **Mobile cleanup is low-risk now** (no data): `pendingThreshold`/`ThresholdEvent`, the `frame` ProgramChange path + `ProgramChangeCard` are dead and removable. Forecasts (`ForecastRecord/Seed/State`) are **predictive** and sit uneasily with v4's react-don't-predict stance — flag for a product decision (keep as a non-engine "goal" surface, or retire) rather than silently removing.
4. **Consciously preserve** bucket-2/5 structures even though v4 ignores them: `heightCm`, focus fields, substitutes, the backend catalog's multi-capability/family/cost fields, and the walk/vitals capture — they are cheap to keep and unlock coaching/personalization/conditioning later.

*Nothing here changes code. This is an inventory for the merge decision.*
