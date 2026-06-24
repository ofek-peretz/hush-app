# Hush v1 — Deploy & Operations (Wave-2 backend)

The Hush v1 service is the **frozen model wrapped in an additive web shell** (`app/`), serving the
frozen `API_CONTRACT_V1.md` over the frozen pipeline. This directory is the build-of-record and the
operational surround. Governing rule: *no redesign without explicit model review.*

## Build & verify (the deployable is a generated artifact)

```
python build/_verify/assemble_and_test.py     # canonical gate: model golden runner + API pytest
```

This assembles `build/_assembled/{app,hush_model,sim,tests}` and must be **green** before an image is
built (model golden runner **189/189** + API pytest **95** as of this writing). The Docker image
(`deploy/Dockerfile`) pins the assembled tree + `requirements.txt` (BB-31 provenance).

## Run (dev)

```
pip install -r deploy/requirements.txt
HUSH_DB_PATH=hush.db HUSH_OPERATOR_KEY=<key> uvicorn app.app_main:app --workers 1
```

`init_database` runs at startup (create-or-bring-forward via the Wave-1 single migration runner,
schema **v11**). In prod, gate every migration on a tested backup (BB-3 → BB-5).

## Topology (frozen architecture — build plan §11)

One deployable, one SQLite DB (WAL), **single process / one write worker**, synchronous handlers.
WAL gives concurrent readers; a process-level lock serializes the single writer (ES-007 / BB-9).
Scale **readers**, never writers, in v1. No microservices, no queue, no second datastore.

```
app (TLS terminates at ingress) → hush_model (frozen) + persistence → SQLite (WAL, encrypted vol)
   /internal/* behind the operator key (separate scope; no athlete-token path)
```

## What is DONE in code (this backend tranche)

| Item | Where |
|---|---|
| BB-13 assembled, pytest-green tree | `build/_verify/assemble_and_test.py` (app/ + API pytest) |
| BB-9 connection-per-request + serialized writer + re-entrant txn | `app/connection.py`, `hush_model/persistence/db.py` |
| BB-14 API (full contract §4 surface) | `app/app_main.py`, `app/routers/*` |
| BB-1 idempotency / anti-replay (apply-and-record, one txn) | `app/idempotency.py`, migration 010 |
| BB-2 transactional atomicity (fault rollback verified) | re-entrant txn + `test_api_connection.py` |
| BB-19/20 per-token authz (no IDOR), hashed high-entropy tokens | `app/auth.py`, `app/deps.py` |
| BB-24 auth-failure throttling | `app/auth.py::AuthThrottle` |
| BB-8 input bounds; effort/RIR → 422 | `app/schemas.py` (`extra="forbid"` on set report) |
| BB-4 version stamping (model/capability/catalog) on responses | `app/lifecycle.py` |
| BB-6 server-authoritative clock (week from enrollment) | `app/lifecycle.py::server_week` |
| BB-7 lossless override capture (A9 LOAD + off-catalog) | opt-in pipeline passthrough |
| BB-10 A8 shadow baseline in the request path | `app/instrumentation.py` |
| BB-12 complete `reconstruct_session` verified | `/internal/audit/sessions/{id}` + tests |
| BB-23/25 operator enrollment + token minting | `app/internal/operator.py` |
| BB-28 structured access log + correlation id (backend half) | `app/observability.py` |
| BB-5 backup-gated prod migration + verify (mechanism) | `app/migrate.py`, `test_api_migrate.py` |
| BB-3 backup + tested-restore mechanism | `app/migrate.py::backup_database`/`restore_database` |
| BB-11 A7 week-1 gate **ARMED** (OD-8 ratified thresholds) | `app/a7_gate.py`, `GET /internal/gate/a7` |
| BB-27 ops watcher for the ARMED A7 gate + health + drift (exit-coded for cron/alerting) | `app/ops_monitor.py` (`python -m app.ops_monitor`) |
| OD-2 right-to-erasure (logical anonymization) | `service.py::erase_athlete`, `POST /internal/athletes/{id}/erase`, migration 011 |
| BB-31 pinned deps + image provenance | `deploy/requirements*.txt`, `deploy/Dockerfile` |

## Open — needs Operations / Product / Mobile (NOT code-completable on the build host)

These are tracked in `docs/canonical/HUSH_V1_OPEN_ITEMS.md`. They require infrastructure, an iOS
toolchain, or a **product/architecture decision** — escalate, do not invent:

- **Product decisions — RATIFIED 2026-06-12 (code shipped same day):** OD-2 right-to-erasure →
  logical anonymization (`erase_athlete` + migration 011) · OD-8 A7 thresholds → **BB-11 ARMED** ·
  OD-4 HealthKit not a model input (no V1 code) · OD-3 email magic-link recovery (decision ratified;
  **impl DEFERRED — no partial build** → bundled with the future BB-33 + BB-30 enrollment/consent/email
  workstream and built only when that workstream exists).
- **Operations infra:** BB-30 deployed env (staging+prod, TLS, secrets) · BB-21 encryption-at-rest ·
  BB-22 operator key in secrets manager + network restriction + access logging · BB-27
  monitoring/alerting · BB-29 incident runbook + staged rollout. **(Backend half built — Operations to
  operationalize against the live env):** BB-28 structured logging + correlation id (`app/observability.py`);
  **BB-3 backup/restore mechanism** + **BB-5 backup-gated prod migration + verify** (`app/migrate.py`) —
  what remains is running them against the **deployed** DB and off-box/encrypted/scheduled backup storage.

  **On-host PREP done 2026-06-12 (architecture/runbooks/templates ready; only the infra stand-up + one
  product decision remain — see `reviews/completion/BB-30_BB-21_BB-22_BB-29_OPERATIONS_PREP_COMPLETION_REPORT.md`):**
  - **BB-30** → `docs/architecture/DEPLOYMENT_ARCHITECTURE_V1.md` + `deploy/.env.example`,
    `deploy/ingress/Caddyfile.example`, `deploy/entrypoint.sh` (backup-gated migrate→serve), `deploy/compose.staging.yaml`.
  - **BB-21** → `docs/architecture/DATA_PROTECTION_AT_REST_V1.md` + `deploy/backup/encrypted_backup.sh`.
  - **BB-22** → operator-access audit logging **built in code** (`deps.require_operator` → `operator_access`
    granted/denied line; key never logged); secrets-mgr flow + `/internal/*` restriction in DEPLOYMENT §5.
  - **BB-29** → `docs/architecture/INCIDENT_RUNBOOK_V1.md` (rollback/restore/A7-pause-reanchor/disaster + staged rollout).
  - Debt: **ATD-17** → `SCHEMA_REFERENCE_V1.md`, **ATD-19** → `VERSIONING_POLICY_V1.md`.
- **Mobile:** BB-15 the iOS app (6 screens + onboarding + "why") · BB-26 device Data-Protection/Keychain.
- **The A7 hard gate (BB-11):** week-1 cohort-segmented seed-safety monitor + stop/re-anchor trigger;
  needs OD-8 thresholds. Abort path = re-anchor, **never** field-tune parameters (KL-9).
- **Consent/compliance:** BB-33 enrollment+consent+waiver · BB-35 retention/DPIA · BB-37 support/recovery.

## Backups (BB-3) + production migration (BB-5) — built mechanism

The backup, tested-restore, and backup-gated forward migration are now **code** (`app/migrate.py`,
tested in `test_api_migrate.py`). The prod DB engine is SQLite at every tier, so these rehearse a
production migration faithfully; what remains for Operations is running them against the **deployed**
DB (service drained) and off-box/encrypted/scheduled backup storage (BB-21/BB-30).

```
# Verify the deployed DB is fully migrated + referentially intact (read-only gate):
python -m app.migrate --db "$HUSH_DB_PATH" --verify-only

# The ONE sanctioned production migration: takes a fresh integrity-verified backup FIRST and
# REFUSES to migrate if it can't ("no migration without a backup"), runs the ordered chain, then
# asserts schema_version == 11 (current head) + referential integrity. Forward-only (no down-migration).
python -m app.migrate --db "$HUSH_DB_PATH" --backup-dir /backups

# Restore (drain the service first):
python -c "from app.migrate import restore_database; print(restore_database('/backups/hush-<ts>.db', '$HUSH_DB_PATH').ok)"
```

Operator API: `backup_database` (WAL-safe online snapshot, self-verified), `restore_database`
(tested restore), `verify_database` (schema-version + `foreign_key_check` + shape-parity gate),
`migrate_production` (the backup-gated command). Stage a copy of prod → migrate → verify before
touching the live DB (runbook §4).

## Monitoring the ARMED A7 gate (BB-27) — `app/ops_monitor.py`

The A7 week-1 seed-safety gate is the single HARD Phase-1 gate and it is **ARMED**. An armed
hard-stop needs an active watcher: when a cohort shows unsafe seeds the gate flips to
`PAUSE_AND_REANCHOR` and the ramp must stop and **re-anchor ES-008 v2 (never field-tune — KL-9)**.
`app/ops_monitor.py` is that watcher — a dependency-free CLI (stdlib only, runs on a bare Python on
the bastion/cron host) that polls `/health` + `/internal/gate/a7` + `/internal/metrics` and grades
**OK / WARN / CRITICAL → exit 0 / 1 / 2** (worst finding wins). The A7 hard stop, an unreachable
service, and a denied/absent operator key are all CRITICAL (page someone).

```
# one-shot check (exit code drives the alert):
HUSH_OPERATOR_KEY=<key> python -m app.ops_monitor --base-url https://hush.internal --json

# cron (every 5 min); non-zero exit → your alerting wrapper pages:
*/5 * * * *  HUSH_OPERATOR_KEY=<key> python -m app.ops_monitor --base-url https://hush.internal \
              --expect-data --json >> /var/log/hush/ops_monitor.jsonl 2>&1 || notify-pager
```

Flags: `--expect-data` (WARN if the trial export is empty), `--override-rate-warn R` (operational
heuristic only — a high A9 override rate is a nudge to inspect day-1 seeding, **not** a model gate;
the only model gate is A7). The monitor reads the gate verdict and grades operational severity — it
never re-decides a model threshold. It also emits one structured JSON line per run on logger
`hush.ops` for log shipping. What remains for Operations: point `--base-url` at the deployed service
and wire the exit code / `hush.ops` line into the existing pager (BB-27 alert delivery).

## Contract export, smoke test, SCA & CI — pre-deploy / dress-rehearsal tooling

These reduce the remaining off-host work (iOS client, staging dress-rehearsal, build provenance) to
their irreducible external dependency. All run against the **assembled** build-of-record; the model is
untouched.

| Asset | Command | What it gives you | External dep that remains |
|---|---|---|---|
| **OpenAPI contract** | `python deploy/export_openapi.py` → `deploy/openapi.json` | The served contract as a machine artifact (16 paths, schema-version-stamped). `--check` is a CI drift gate; the iOS client (BB-15) can codegen/type-check against it instead of hand-transcribing `API_CONTRACT_V1.md`. | iOS toolchain / client codegen (Xcode). |
| **HTTP smoke test** | `HUSH_OPERATOR_KEY=<k> python deploy/smoke_test.py --base-url <url>` (or `--self`) | Drives the full athlete lifecycle + operator surface over **real HTTP** against a running server — the BB-14/BB-30 staging dress-rehearsal gate (`TestClient` can't prove the wire). Stdlib-only; runs on a bare bastion Python. `--self` boots the assembled app locally for CI. | The deployed/staging env (BB-30). |
| **SCA gate** | `python deploy/sca_audit.py --install` | `pip-audit` over the pinned closure (`requirements*.txt`); fails CI on a known-vulnerable pin. Honest exit 2 (not a false pass) when the advisory DB is unreachable. | Network to the advisory DB / CI runner. |
| **CI workflow** | `.github/workflows/ci.yml` | Reproducible build-of-record: assemble → canonical gate → OpenAPI drift → SCA, plus the `--self` smoke job. Same commands a developer runs locally. | A GitHub-compatible Actions runner. |

```
python deploy/export_openapi.py            # write deploy/openapi.json (the client/contract baseline)
python deploy/export_openapi.py --check    # CI: fail if openapi.json drifted from the served surface
python deploy/smoke_test.py --self         # CI/local: boot assembled app, smoke full lifecycle, tear down
python deploy/sca_audit.py --install       # CI: SCA over the pinned dependency closure (BB-31)
```
