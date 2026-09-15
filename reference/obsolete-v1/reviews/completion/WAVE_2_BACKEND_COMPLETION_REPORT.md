# WAVE_2_BACKEND_COMPLETION_REPORT.md — API shell (B1–B5 backend), the deployable V1 spine

> Completion report for the **Wave-2 backend tranche** — the additive web shell that wraps the
> **frozen model** behind the **frozen `API_CONTRACT_V1.md`**, per `SERVER_BUILD_PLAN_V1.md`
> (Steps 1–5, backend). **Complete (code-side).** Tests: **model golden runner 173/173** (was
> 172/172; **+1** new migration-010 hygiene test in `test_wave1`) **+ API pytest 30/30** — all green
> via the single canonical command. **No model number, formula, constant, schema *meaning*, or golden
> trajectory changed**; the API layer computes no load, score, or decision (build plan §2 boundary).
> Schema **v9 → v10** (one ADDITIVE infra migration: `idempotency_key`, `auth_token`).
>
> Date: 2026-06-12 · Build: Sprint 0–4 ✅ + Wave 1 ✅ + DX-07/04/03 ✅ + M1 ✅ + DX-11 ✅ + DX-09 ✅
> + DX-13…18 ✅ + DX-08 ✅ + DX-10 ✅ + DX-12 ✅ + **Wave-2 backend ✅** (Schema **v10**) · Owner: Backend.
> OD-1 = Option B (local-first event-sourced) assumed adopted; the API is the event-ingestion +
> projection surface for it. Governing rule: *no redesign without explicit model review.*

---

## 0. Executive summary

| Item (registry id) | Class | Status | Evidence |
|---|---|---|---|
| **BB-13** assembled, `pytest`-green service tree | Foundation | ✅ Done | `assemble_and_test.py` now assembles `app/` + API tests and runs **model golden runner + API pytest** in one gate |
| **BB-9** connection model (resolve OC1) | Additive shell | ✅ Done | `app/connection.py`: connection-per-request (WAL+FK per conn, OC2) + serialized writer (`WRITE_LOCK`); re-entrant `db.transaction()` |
| **BB-14** the API (full contract §4 surface) | New web layer | ✅ Done | `app/app_main.py` + `app/routers/*` — all 10 contract endpoints + operator surface + `/health` |
| **BB-1** idempotency / anti-replay | New | ✅ Done | `app/idempotency.py` apply-and-record in **one** txn; per-athlete key; response parity; `idempotency_key` table |
| **BB-2** transactional atomicity (fault rollback) | Invariant | ✅ Verified | re-entrant txn (nested pipeline txns join the idempotency unit) + mid-apply-fault rollback test |
| **BB-19/20** per-token authz (no IDOR), hashed tokens | New | ✅ Done | `app/auth.py` (sha256+pepper, constant-time, revocation), `deps.require_athlete`; cross-athlete → 404 |
| **BB-24** auth-failure throttling | New | ✅ Done | `auth.AuthThrottle` (sliding window) → 429 |
| **BB-8** input bounds; effort/RIR → 422 | Boundary | ✅ Done | `app/schemas.py` (`extra="forbid"` on the set report; reps≥0, weight>0, set_number bounds) |
| **BB-4** version stamping on responses | Invariant | ✅ Done | model/capability/catalog versions on every Session/profile/why response |
| **BB-6** server-authoritative clock | New | ✅ Done | `lifecycle.server_week` derives `week` from enrollment time; device times not trusted |
| **BB-7** lossless override capture (A9) | Instrument | ✅ Done | opt-in `override_category`/`override_target` passthrough → observation; LOAD-deviation + off-catalog |
| **BB-10** A8 shadow baseline in request path | Instrument | ✅ Done | `app/instrumentation.py` reconstructs the fixed counterfactual from persisted rows; one shadow row/set |
| **BB-12** complete `reconstruct_session` | Instrument | ✅ Verified | `/internal/audit/sessions/{id}` returns composition+rec+shadow+observation for every block; test asserts |
| **BB-23/25** operator enrollment + token minting | Operator | ✅ Done (slice) | `app/internal/operator.py` behind the operator key (separate scope, §16A) |
| **BB-31** pinned deps + image provenance | Build | ✅ Done | `deploy/requirements*.txt` (full closure pinned), `deploy/Dockerfile` (assembled artifact) |

**Test result:** `==== OVERALL: model 173/173 + API pytest rc=0 -> PASS ====`
Model golden per-suite: `sprint0 19 · sprint1 12 · sprint2 27 · sprint3a 18 · sprint3b1 22 · sprint3b2 26 · sprint4 23 · wave1 11 · sprint5 3 · sprint6 12`.
API pytest: `test_api_core 19 · test_api_connection 7 · test_api_instruments 4` = **30**.
Baseline before this tranche was **172/172**; the only model-suite delta is **wave1 +1** (the
`migration_010` additive/idempotent hygiene test). Every prior trajectory is byte-for-byte unchanged.

---

## 1. What changed in the frozen layer (and why it is behavior-preserving)

The web shell is additive; only **four** touches reach `implementation/<sprint>/`, each opt-in or
structural and proven non-regressive by the unchanged 173-test golden runner:

1. **`sprint1/db.py` — re-entrant `transaction()`.** Depth-tracked; for every existing single-level
   caller the depth goes 1→0 and commit/rollback is byte-identical. Nesting (the API idempotency
   wrapper enclosing the pipeline's own transactions) makes the dedup record + the learning chain
   commit or roll back **together** (BB-1/BB-2). No model math.
2. **`sprint1/schema.py` + new `migration_010_infra` (registered in the Wave-1 runner; v9→v10).**
   Two ADDITIVE infra tables (`idempotency_key`, `auth_token`) **outside both schema zones**. The
   drift guard (`test_wave1`) and fresh-DB stamp extend automatically. (The build plan's third
   table, `athlete_profile_metadata`, is intentionally **not** created — `bodyweight_kg` already
   lives on `athlete` as of DX-07.)
3. **`sprint1/pipeline.py::report_set_fatigue_aware` — opt-in A9 passthrough.** New
   `override_category=""`/`override_target=None` params, defaulted so sim/golden callers are
   byte-identical; only the API ingestion path sets them (the BB-7 lossless override instrument).
4. **`sprint5/runtime.py::SessionRuntime.report_set` — threads the same opt-in passthrough.**

Re-gold: `test_wave1` version asserts v9→v10 (`+10` in the chain) and a new `test_migration_010_*`.
No other test moved.

## 2. Endpoint → existing primitive (the whole surface, build plan §3.1)

Every handler is thin (validate → idempotency → existing primitive in one txn → DTO):

- `POST /sessions` → `SessionEngine.compose_and_open` (+ persist per-block recommendation for the
  "why" id) · `GET /sessions/today` → projection read · `POST /sessions/{id}/sets` →
  `SessionRuntime.report_set` (DX-11 event primitive, govern=False) + A8 shadow · `POST /blocks/{id}/skip`
  → `set_block_status` · `POST /blocks/{id}/replace` → `HushService.replace_exercise` (or off-catalog
  A9 capture) · `POST /sessions/{id}/complete` → `SessionRuntime.complete_session` (R2 once-per-cap)
  + pre-compose next · `GET /sessions[/{id}]` → athlete-scoped history · `GET /recommendations/{id}/why`
  → recommendation row + honesty clause · `GET|PATCH /profile`. Operator: `POST /internal/athletes`
  (onboard + mint token), `…/revoke`, `GET /internal/audit/sessions/{id}` (BB-12).

## 3. As-built decisions (within the frozen architecture; not new decisions)

- **Framework = FastAPI, sync handlers** (build plan §3 default). Pinned (BB-31).
- **Connection topology = one write worker + WAL readers** (build plan §12 default); single-writer
  via a process lock preserves ES-007 across per-request connections.
- **Composed session opens `active`** (mirrors `SessionEngine`); `today` returns the latest
  non-terminal session; `complete` pre-composes the next (the cache fill). `POST /sessions` returns
  an existing active session rather than stacking a second (the cold/first-case endpoint, §5).
- **`week` is server-authoritative** from enrollment elapsed time (BB-6); exploration is off so the
  persisted seed (= session_index) is inert but kept for R4 reconstructability.

## 4. Verification

`python build/_verify/assemble_and_test.py` → model **173/173** + API **30/30**, `PASS`. The app
boots under `uvicorn app.app_main:app` (health ok, schema_version 10, all 13 paths in the OpenAPI).
Concurrency, fault-rollback, idempotent-replay, IDOR, bounds, full lifecycle e2e, A8 capture, and
BB-12 reconstruction are each asserted (see `tests/test_api_*`).

## 5. NOT done — handoffs & escalations (tracked in `HUSH_V1_OPEN_ITEMS.md`)

Not code-completable on the build host; require infra, an iOS toolchain, or a decision:

- **Escalate (product/architecture decisions — do not invent):** **OD-2** immutable-audit vs
  right-to-erasure · **OD-3** account-recovery posture · **OD-8** Phase-0 gate-threshold ratification
  (gates BB-11) · **OD-4** HealthKit-read-in-v1.
- **Operations infra:** BB-30 deployed env (staging+prod, TLS, secrets) · BB-3 backups+restore ·
  BB-21 encryption-at-rest · BB-22 operator key in secrets manager + network restriction + access
  logging · BB-27 monitoring/alerting · BB-28 structured logging + correlation id · BB-29 runbook +
  staged rollout · BB-5 prod-DB migration (after backup). `deploy/` carries the topology + a backup
  skeleton; standing up the live environment is Operations.
- **Mobile (BB-15/26):** the iOS app + device data-protection — needs an iOS toolchain.
- **The A7 hard gate (BB-11):** week-1 cohort-segmented seed-safety monitor + stop/re-anchor trigger
  (needs OD-8). Abort = re-anchor, **never** field-tune (KL-9).
- **Consent/compliance (BB-33/35/37):** enrollment+consent+waiver, retention/DPIA, support/recovery.

## 6. Files

New (`implementation/api/` → assembled `app/`): `connection.py`, `errors.py`, `schemas.py`,
`auth.py`, `idempotency.py`, `instrumentation.py`, `deps.py`, `lifecycle.py`, `app_main.py`,
`routers/{sessions,blocks,reads,profile}.py`, `internal/operator.py`, `migration_010_infra.py`,
`conftest.py`, `test_api_{core,connection,instruments}.py`.
Touched (frozen): `sprint1/{db,schema,pipeline}.py`, `sprint5/runtime.py`, `wave1/migrations_runner.py`,
`wave1/test_wave1.py` (re-gold v9→v10 + migration_010 test), `build/_verify/assemble_and_test.py` (MAP + API pytest).
Deploy: `deploy/{requirements.txt,requirements-dev.txt,Dockerfile,README.md}`.
