# Hush — Architecture Inventory (post-cleanup)

**As of:** the `chore/legacy-bayesian-cleanup` branch. The legacy Bayesian backend is decommissioned; the dead mobile threshold + program-change paths are removed. Only three states remain: **ACTIVE**, **FUTURE-CANDIDATE**, **DEPRECATED**.

**Verified:** mobile `tsc` clean · `jest` **452/452** · `expo export --platform ios` rc=0. No Python backend remains (mobile is the product).

---

## ACTIVE — shipping / on the live path

### Mobile app (`code/mobile`)
| Area | Components |
|---|---|
| **v4 engine** | `src/engine/v4/*` — constants, types, reads, decisions, swap, rails, explain, planWeek, planNextWeek, invariants, catalogAdapter, v4Engine, flag. Gated default-OFF until TestFlight. |
| **Persistence** | `db.ts` keys: `profile, program, mode, activeSession, history, snapshots, forecasts*, recents, pendingSync, telemetry, firsts, health, preferences, engineV4, schemaVersion` (v3). (*forecasts = DEPRECATED, see below.) |
| **Data models** | `Profile, Program/ProgramDay/Slot, Session/SetLog, SetTarget, PortraitSnapshot, SessionSummary, HistoryEvent, OwnedPreferences, EngineV4State`. |
| **Catalog** | `exercises.ts` (59 ex) + `progressionRule`/`movementPattern`/`catalogAdapter`. |
| **Screens** | Onboarding flow, Home, SessionFlow, WellDone, Program, ProgramDetail, History, WorkoutDetail, Progress, QuarterlyReport, ProfileSheet, **WeeklyUpdate** (+ Why), **V4Debug** (DEV-only). |
| **Surfaces** | Capability Portrait (computePortrait, 5 bars), Weekly Update + Why, Progress/Quarterly reports. |
| **Analytics** | `telemetry.ts` pipeline + ~40 events incl. onboarding/program_generated/volume_changed/weekly_update_*/notification_opened. |
| **Notifications** | weekly_program_ready (→ Weekly Update / Program), quarterly_report. |
| **Health / watch** | bodyweight ingestion (`HealthState`), `sessionMirror`, watch connectivity/live-activity modules. |
| **Backend client** | `httpClient.ts` (dormant — talks to a future v4 backend over HTTP; no Python server exists yet). |

### Repo / infra
- `.github/workflows/ci.yml` — **rewritten** to the mobile gate (tsc + jest).
- `deploy/`, `fly.toml` — deployment scaffolding (now dead w/o a backend; reusable infra — see DEPRECATED).
- Docs: `HUSH_V4_MIGRATION_PLAN.md`, `V4_TESTFLIGHT_QA_CHECKLIST.md`, `V4_LEGACY_DATA_AUDIT.md`, `V4_CLEANUP_PROPOSAL.md`, this file.

---

## FUTURE-CANDIDATE — preserved on purpose, not used today

| Asset | Where | Why kept |
|---|---|---|
| Rich exercise model | `reference/backend/exercise_catalog_rich.py` | multi-capability weights, `exercise_family`, `replacement_group`, `difficulty_factor`, `exercise_cost` — smarter swaps / assistance attribution / difficulty-aware seeding. |
| Full data-model classification | `V4_LEGACY_DATA_AUDIT.md` + `V4_CLEANUP_PROPOSAL.md` | the curated schema reference for a future v4 backend (history hierarchy, `preference_event`, `athlete_event`, recommendation shell, auth/idempotency/erasure, week_plan). |
| `Profile.heightCm` | mobile model | collected, engine-unused; BMI / body-comp / calorie context. |
| `OwnedPreferences.substitutes` | mobile | persisted, not yet consumed; athlete-defined swap targets for `select_replacement`. |
| Walk/cardio + vitals | `HistoryEvent kind:'walk'`, `WalkSample`, `useWorkoutVitals` (HR + active kcal) | conditioning / recovery / coaching — explicitly NOT v4 engine inputs. |
| `PortraitSnapshot` time series | `db.snapshots` | progress-over-time visualization. |
| `AthleteMode.ADVISORY_AUTOPILOT_L1` | mobile mode | reserved gated autopilot tier. |
| Legacy Bayesian backend (full) | **git history** | recoverable if ever needed; not in the working tree. |

---

## DEPRECATED — present, scheduled to resolve

| Item | Where | Resolve when |
|---|---|---|
| **Legacy double-progression** `progression.ts:prescribe()` + the `fixtureModel` flag-OFF branch | mobile | the fallback while the v4 flag ships OFF → remove after the v4 flag is flipped ON post-TestFlight. (`computePortrait` in the same file is ACTIVE.) |
| **Forecasts** — `ForecastRecord/Seed/State`, `db.forecasts`, the Portrait 8-week forecast, `track('forecast_*')`, the `ForecastSeed` on `SetTarget` | mobile | **founder decision after the first public release** — predictive, sits against v4's react-don't-predict stance; keep until real-world signal says retire vs keep as a non-engine goal surface. |
| `PendingSync` / `db.pendingSync` | mobile | reusable by a future v4 backend; harmless offline. |
| `deploy/` + `fly.toml` (backend deploy tooling: `export_openapi.py`, `sca_audit.py`, `smoke_test.py`, requirements) | repo | dead without a backend; reusable scaffolding for a future v4 backend — re-point or remove when that decision is made. |
| `build/_txt/` legacy design docs (ES Bayesian specs + product docs) | repo | historical reference; archive later (left in place — docs, not engine code). |

---

## REMOVED in this cleanup (for the record)
- **Mobile:** `ThresholdEvent`/`ThresholdKind` + `pendingThreshold` plumbing (db key/methods, appStore state/actions/detection, `detectThreshold`/`thresholdLine`, notification `threshold_alert` + `fireThresholdAlert`, `track('threshold_crossed')`, i18n keys) — the Portrait crossing-alert whose destination was already gone. `ProgramChangeCard.tsx` + `ProgramChange`/`ProgramChangeKind` + `ModelClient.programChanges` (+ fixture/http impls) — replaced by Weekly Update + Why. (11 dead tests removed.)
- **Backend (decommissioned):** all of `implementation/` (Bayesian compute: recommendation/prediction/confidence/decay/evidence/state_update/orchestrator/fatigue/variance/recovery/decision/stagnation + the API runtime + ~284 backend tests), the latent/prediction/fatigue tables (`capability_state`, `evidence`, `state_update_log`, `session_progress`, `stagnation_marker`, `shadow_recommendation`, `preference_state` + fatigue columns), `build/_verify`, `build/_assembled`, local `*.db`.

**Net:** the entire Bayesian latent/predictive/fatigue machinery is gone; every active product surface, all history/telemetry/preference/catalog/watch assets, and every future-product asset is retained (in-tree or in git + the audit docs).
