# Hush Current Status

> **Canonical status now lives in `docs/canonical/HUSH_V1_PROJECT_STATUS.md`.**
> This file is a short mirror; if the two ever disagree, the canonical document governs.

Date: 2026-06-12

Model Status:
v1 — advisory (Hush recommends; the athlete decides). Not a load-authority system.

Canonical Documents:
- HUSH_V1_PRODUCT_SPECIFICATION  (product framing — advisory, stagnation-first)
- HUSH_V1_PROJECT_STATUS  (canonical status anchor)
- HUSH_V1_EXECUTION_CONTEXT
- HUSH_V1_INDEX
- HUSH_V1_SPEC_MANIFEST
- HUSH_V1_TRACEABILITY

Specifications:
ES-001 through ES-013 (ES-013 active investigation **RETIRED** in v1 → detection = M5)

Implementation Status:
- Sprint 0–4 Complete
- Wave 1 Complete (migration runner, drift guard, as-built docs)
- DX-07 (bodyweight, migration_007, schema v7) Complete
- DX-04 (exploration off) · DX-03 (governor advisory) Complete
- M1 = DX-01/02/20/05/06/19 (actual_weight is a learning input; programs from learned target_load) Complete
- DX-11 (event-driven runtime + session_progress, schema v8) Complete
- DX-09 = M5 stagnation detection (read-only, advisory; migration_009, schema v9) Complete
- DX-08 (Option D bodyweight-keyed seeding) · DX-10 (sticky preference) · DX-12 (instrumentation/gate repoint) Complete
- Wave-2 backend (API shell, B1–B5) Complete — schema v10 (migration_010 web-shell infra)
- BB-16/17/32 · BB-28 (backend half) · BB-5/BB-3 (prod-migration + backup mechanism) Complete
- BB-11 A7 gate ARMED (OD-8 thresholds ratified) · OD-2 erasure mechanism (migration_011, schema v11) Complete
- Decisions: OD-1 Closed (Option B) · OD-2/4/8 Closed · OD-3 decision Closed / impl DEFERRED (bundled with BB-33 + BB-30 enrollment/consent/email workstream)

Tests:
284 Passing — model golden runner 189 + API pytest 95
(+3 since: BB-22 operator-access audit logging — granted/denied/key-never-logged, in test_api_observability)
(model: sprint0 19 · seed_validation 6 · sprint1 12 · sprint2 27 · sprint3a 18 · sprint3b1 22 · sprint3b2 26 · equipment_coverage 9 · sprint4 23 · wave1 12 · sprint5 3 · sprint6 12;
 API: test_api_core 19 · test_api_connection 7 · test_api_instruments 4 · test_api_metrics 5 · test_api_gate 8 · test_api_observability 15 · test_api_migrate 12 · test_api_erasure 8 · test_api_ops_monitor 17)
Run: `python build/_verify/assemble_and_test.py` (one gate: model golden runner + API pytest).

Schema Version:
11 (… v9 → v10 web-shell infra: idempotency_key, auth_token · v10 → v11 migration_011 erasure_record — OD-2 right-to-erasure)

Current Sprint:
Wave-2 backend (B1–B5) COMPLETE — the additive API shell over the frozen model. See
reviews/completion/WAVE_2_BACKEND_COMPLETION_REPORT.md. Model delta (DX-01…12, M1) all complete.

Done this tranche (code): BB-13 assembled pytest-green tree · BB-9 connection model · BB-14 API
(full contract §4) · BB-1 idempotency · BB-2 atomicity · BB-19/20/24 auth · BB-8 bounds · BB-4/6/7
stamping/clock/override · BB-10 A8 shadow · BB-12 reconstruct · BB-23/25 operator provisioning ·
BB-31 pinned deps + Dockerfile · **BB-16 seed-coverage acceptance gate** (DX-08 §4 D2 —
`sim/seed_validation.py`; gate (a) normal cells + (c) continuity PASS; gate (b) detrained over-claim
is the D1 table-fit target, see reviews/completion/BB-16_BB-17_SEED_COVERAGE_GATE_COMPLETION_REPORT.md) ·
**BB-17 equipment→catalog coverage** verified + RESOLVED (`sim/equipment_coverage.py`). V1 is gym-based
(standard commercial gym, barbell always present); a barbell alone covers all 5 Class-A capabilities ⇒
**V1 target environment provides complete Class-A coverage** (regression-locked). Non-gym setups
(home/dumbbell-/machine-/bodyweight-only) are OUT OF SCOPE — no catalog-expansion or equipment-aware
composition work. See BB-17_EQUIPMENT_COVERAGE_COMPLETION_REPORT.md ·
**BB-32 validation export** (+BB-23 metrics) — `GET /internal/metrics` returns trial health + A7/A8/A9
evidence (read-only, operator-key); A7 cohort-segmented first-session view is the data behind the week-1
gate (thresholds = OD-8). See BB-32_VALIDATION_EXPORT_COMPLETION_REPORT.md ·
**BB-11 A7 week-1 gate — ARMED (2026-06-12)** — `GET /internal/gate/a7` per-cohort SAFE/UNSAFE/INSUFFICIENT +
overall PROCEED/PAUSE_AND_REANCHOR (the hard stop = re-anchor ES-008 v2). OD-8 ratified the thresholds
(max_first_rep_failure_rate=0.0, min_completion_rate=0.80, min_cohort_n=5) ⇒ `armed: true`. See
BB-11_A7_GATE_ARMED_COMPLETION_REPORT.md · **OD-2 erasure mechanism** — `erase_athlete` +
`POST /internal/athletes/{id}/erase` + migration_011 erasure_record (schema v11); logical anonymization,
no destructive audit-chain deletion. See OD-2_ERASURE_COMPLETION_REPORT.md ·
**BB-28 observability (backend half)** — `app/observability.py`: pure-ASGI correlation-id middleware
(inbound validated against log-injection; echoed `X-Correlation-Id`; surfaced as `error.request_id`) +
one allowlisted JSON access line per request (method/route-template/status/latency_ms/correlation_id) on
the `hush.api` logger; no-sensitive-values enforced structurally (no body/header/token/health path),
proven by a full-lifecycle test. Client-side logging (Mobile) + log shipping/alerting (Operations —
BB-27/29/30) remain open. See BB-28_OBSERVABILITY_COMPLETION_REPORT.md.

RESOLVED (Product, 2026-06-12): OD-1 (Option B) · OD-2 (logical anonymization — built) · OD-4 (HealthKit
not a model input — no V1 code) · OD-8 (A7 thresholds ratified — BB-11 armed). OD-3 (email magic-link)
decision ratified; **implementation DEFERRED** (no partial build) → bundled with the future
enrollment/consent/email workstream (BB-33 + BB-30).

Operations PREP done on-host (2026-06-12 — architecture/runbooks/templates ready, infra Open):
- BB-30 `DEPLOYMENT_ARCHITECTURE_V1.md` + deploy/{.env.example,ingress/Caddyfile.example,entrypoint.sh,compose.staging.yaml}
- BB-21 `DATA_PROTECTION_AT_REST_V1.md` + `deploy/backup/encrypted_backup.sh`
- BB-22 operator-access audit logging BUILT (code, `deps.require_operator` → `operator_access` granted/denied line) + secrets/network in DEPLOYMENT §5
- BB-29 `INCIDENT_RUNBOOK_V1.md` (rollback/restore/A7-pause-reanchor/disaster + staged rollout)
- Debt: ATD-17 `SCHEMA_REFERENCE_V1.md`, ATD-19 `VERSIONING_POLICY_V1.md`
- See reviews/completion/BB-30_BB-21_BB-22_BB-29_OPERATIONS_PREP_COMPLETION_REPORT.md

Pre-deploy tooling done on-host (2026-06-12 — executable, validated; external dep = runner/staging/iOS):
- BB-15 client contract: `deploy/export_openapi.py` → `deploy/openapi.json` (served contract, 16 paths, schema-stamped; `--check` drift gate)
- BB-14/BB-30 dress-rehearsal: `deploy/smoke_test.py` (stdlib-only full-lifecycle HTTP smoke; `--self` boots+tears-down the assembled app; validated green)
- BB-31 SCA + CI: `deploy/sca_audit.py` (pip-audit over the pinned closure; honest exit 2) + `.github/workflows/ci.yml` (assemble → gate → openapi-drift → SCA + `--self` smoke)
- BB-27 watcher already in code: `python -m app.ops_monitor` (exit 0/1/2 for cron/alerting)
- See reviews/completion/PRE_DEPLOY_TOOLING_COMPLETION_REPORT.md

Next (NOT code on this host — Operations / Mobile / Compliance):
- Operations INFRA (escalate): cloud host/runtime · DNS + issued TLS cert · secrets-manager instance ·
  encrypted /data volume · firewall rules for /internal/* · off-box encrypted backup bucket + scheduler ·
  pager integration · on-call rota · BB-27 alert delivery · the live runs of BB-3/BB-5/BB-28 against the deployed env.
- Mobile: BB-15 iOS app (6 screens) · BB-26 Data Protection + Keychain · OD-5/6/7/9/10 client decisions.
- Compliance/Product: BB-33 enrollment + consent pipeline · BB-35 DPIA/retention · BB-37 support + recovery
  (carries the deferred OD-3 build) · BB-34/36 privacy labels.
(On-host model + backend surface is COMPLETE. D1 strength-standard table is folded into DX-08, shipped.)

Provisional / unvalidated (model review 2026-06-10 — adopt nothing):
kappa, tau (systemic + per-capability), sigma^2_ref, decision gate/deadband, PREFERENCE_NUDGE,
SESSION_FATIGUE_CEILING, P_EXPLORE.

Open Assumptions:
A1–A18 (see Assumptions Register + DX-16 re-annotation: A1 less central, A9 deviation=input, A5 heavier, A14 inactive)

Architecture:
- Single Service
- Single Database
- Pure Model Package
- Simulation Harness

Rule:
No redesign without explicit model review.
