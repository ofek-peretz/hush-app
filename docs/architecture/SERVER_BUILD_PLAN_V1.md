# SERVER_BUILD_PLAN_V1.md — Backend Engineering Blueprint (Sprint 5 / Wave-2 B1–B5)

> A **step-by-step engineering blueprint** a backend engineer executes to stand up the Hush v1 service:
> the production API that serves the frozen `API_CONTRACT_V1.md`, ingests the device's event stream
> (Option B), and drives the **already-built, frozen** learning pipeline (Sprint 0–4 + Wave 1). **It is a
> build plan, not an architecture review.** It wraps the frozen model in an additive web shell; it **does
> not redesign the model, add features, or change any architecture decision.** Every endpoint maps to an
> existing `HushService`/`SessionEngine`/repository primitive; the only new code is the web layer, the
> auth/idempotency infrastructure, and the operational surround. Governing rule: *no redesign without
> explicit model review.*
>
> Date: 2026-06-11 · Assumes: `API_CONTRACT_V1.md` frozen · `MOBILE_BUILD_PLAN_V1.md` frozen · **OD-1 =
> Option B adopted** · Build: Sprint 0–4 ✅ + Wave 1 ✅ + DX-07/04/03 + M1 + **DX-11** + DX-09/M5
> · Model: advisory; UX/Architecture: frozen. **════ AS-BUILT (2026-06-12): this plan is EXECUTED — the
> Wave-2 backend (Steps 1–5) is BUILT and `pytest`-green at schema v11, 284 tests** (model golden 189 +
> API pytest 95; `reviews/completion/WAVE_2_BACKEND_COMPLETION_REPORT.md`). The text below is retained as
> the build plan of record; what remains is off-host deployment (Operations).

---

## 0. Fixed constraints (read first — invariants, not choices)

- **The model is frozen and runs unchanged.** The service imports the **same assembled `hush_model/`
  package** the simulation harness tests — "one implementation of the math" (Build Plan §5–§6;
  `SERVER_ARCHITECTURE_ASBUILT_V1.md`). The API layer computes **no** load, score, or decision; it calls
  the existing pipeline.
- **Single writer.** Only `StateRepository` (via the pipeline's StateWriter) mutates capability/athlete
  state (ES-007). The web layer never writes model state directly.
- **Transactional audit chain.** `Set → Observation → de-fatigue → Evidence → StateUpdate` commits
  atomically via the existing `db.transaction()`; a half-applied step corrupts state silently — so every
  request that learns does so in **one transaction** (BB-2).
- **The frozen API surface is exactly `API_CONTRACT_V1.md`.** No endpoint is added; the operator
  `/internal/*` surface is a **separate scope** the athlete token cannot reach (§16 of the contract).
- **Synchronous, single-process, one SQLite DB, ~100 users** (frozen architecture). No microservices, no
  message bus, no queue — the entire learning chain runs sub-millisecond **inside** the request that
  reports a set. Horizontal scale / Postgres is **out of v1 scope** (LP2/Future).
- **Active capabilities = 5 Class-A only.** Requests naming `vertical_pull`/`core_stability` are rejected
  `422`. Loads kg, reps integer (contract §1).
- **Health never enters the loop; only sanctioned inputs are learning inputs** (contract §16C): per-set
  `actual_weight`+`actual_reps`, skip, replace targets. Effort/RIR is refused `422`.

---

## 1. Repository structure

Build on the existing **snapshot-and-assemble** source model (`SERVER_ARCHITECTURE_ASBUILT_V1.md` §1;
`DEVELOPMENT_WORKFLOW.md`). The API is a **new additive layer** beside the frozen model — never inside it
(keep the pure package pure). New source lives in its own snapshot dir and is added to the assembler `MAP`,
exactly as Wave-1 added `runner.py`.

```
implementation/
├─ sprint0..4/ , wave1/        # frozen model + persistence + Wave-1 hygiene (UNCHANGED)
└─ api/                        # NEW Sprint-5 backend snapshots (the web shell)
     app_main.py               #   ASGI app + router wiring + middleware
     deps.py                   #   per-request connection, auth, idempotency dependencies
     auth.py                   #   bearer-token validation, athlete_id derivation (BB-19/20)
     idempotency.py            #   client_event_id dedup store + apply-and-record (BB-1)
     schemas.py                #   Pydantic request/response models == API_CONTRACT_V1 DTOs
     errors.py                 #   the contract §15 error envelope + HTTP mapping
     routers/                  #   sessions.py, blocks.py, profile.py, recs.py, history.py
     internal/                 #   operator surface (audit/metrics/state) — separate scope
     instrumentation.py        #   request-path A8/A9/A1/A3 hooks (BB-10)
     migration_007_infra.py    #   ADDITIVE infra tables (idempotency, token, profile-meta)
     connection.py             #   BB-9 connection model (per-request conn + write serialization)

build/_assembled/              # GENERATED (never hand-edited)
   hush_model/...              #   frozen model + persistence (as today)
   app/...                     #   assembled from implementation/api/  (the service)
   tests/...                   #   model tests (as today) + api tests

deploy/                        # NEW: Dockerfile, gunicorn/uvicorn config, xcfg, migration entrypoint
```

**Assembler change (BB-13):** add `implementation/api/*` → `build/_assembled/app/*` entries to the `MAP` in
`build/_verify/assemble_and_test.py`, and stand up a real **`pytest`-green** invocation of the assembled
tree (BB-13 also resolves the bespoke-runner/pytest parity, TB5). The model keeps its golden runner; the
API layer is tested under `pytest` against the assembled `app/` + `hush_model/`.

---

## 2. Service / module boundaries

Three layers, strict one-way dependency (`app/` → `hush_model.persistence` → `hush_model/`):

| Layer | Package | Role | Writes model logic? |
|---|---|---|---|
| **Web shell (NEW)** | `app/` | routing, request/response Pydantic models, auth, idempotency, error mapping, instrumentation hooks, operator surface | **No** — it orchestrates only |
| **Service / engines (existing)** | `hush_model/persistence/` | `HushService` (onboard, session lifecycle, L2 replace, audit), `SessionEngine` (compose→run→learn), `LearningPipeline`, repositories, `db`, migrations/runner | the only place model state is written |
| **Pure model (frozen)** | `hush_model/` | the seven engines, `constants.py`, prediction/evidence/state-update/etc. — I/O-free | frozen |

**Boundary rule (mirrors `SessionEngine`, which "writes no model logic"):** `app/` composes
`HushService` + `SessionEngine` + repositories + the pipeline. It adds **no** number, formula, or decision.
If a handler is tempted to compute a load or a score, that is a bug — the value comes from the pipeline.

**Operator surface** (`app/internal/`) is a **separate router** mounted behind the operator key and
network restriction (BB-22/23); it is never reachable from an athlete bearer token (contract §16A).

---

## 3. API implementation architecture

**Framework (recommended default for BB-14; toggle point §12): FastAPI with *synchronous* (`def`) route
handlers.** Rationale: Pydantic models map 1:1 onto the contract DTOs (exact wire fidelity); sync handlers
run the existing synchronous, transactional pipeline without async/SQLite friction; the threadpool
concurrency they introduce is bounded by the connection model (§5/BB-9). This is an implementation choice
*within* the frozen "one synchronous service" architecture — not a new architecture decision.

### 3.1 Endpoint → handler → existing primitive (the whole surface)

Exactly the contract §4 surface. Each handler is thin: validate → (idempotency) → call the existing
primitive in one transaction → map result to the response DTO.

| Method · path | Handler | Calls (existing) | Idempotency |
|---|---|---|---|
| `GET /sessions/today` | `sessions.today` | `StateRepository.load_athlete_state` + cached next `Session` | — |
| `POST /sessions` | `sessions.start` | `composition.compose_session` → `SessionRepository.create_session` + `add_block`×N (loads via `recommend`) | `client_request_id` |
| `POST /sessions/{id}/sets` | `sessions.report_set` | `LearningPipeline.report_set_fatigue_aware(govern=False)` (+ per-cap `complete_block` on block end) | `client_event_id` |
| `POST /blocks/{id}/skip` | `blocks.skip` | `SessionRepository.set_block_status(..., "skipped")` | `client_event_id` |
| `POST /blocks/{id}/replace` | `blocks.replace` | `HushService.replace_exercise` (L2 REPLACE primitive) | `client_event_id` |
| `POST /sessions/{id}/complete` | `sessions.complete` | finish blocks + per-cap `complete_block` + `complete_session` + `increment_workout_count` + **pre-compose next** + shadow write | `client_event_id` |
| `GET /sessions` | `history.list` | append-only read of `workout_session` (athlete-scoped, cursor) | — |
| `GET /sessions/{id}` | `history.detail` | `HushService.reconstruct_session` (athlete-scoped) | — |
| `GET /recommendations/{id}/why` | `recs.why` | `recommendation` row → `decision_reason` + "what it could not exclude" | — |
| `GET /profile` · `PATCH /profile` | `profile.get/patch` | `athlete` row read / update (+ `bodyweight_kg` → profile-metadata side table) | `client_request_id` (PATCH) |

### 3.2 Request/response models (`schemas.py`)
Pydantic models mirroring `API_CONTRACT_V1.md` §3/§7/§8 **exactly** (field names = server columns so the
audit chain stays traceable). Validation enforces the model-input boundary (BB-8): `actual_reps ≥ 0`,
`actual_weight > 0`, `set_number ∈ [1, target_sets]`, `capability ∈` the 5 active, and **reject any
unknown learning-input field** (e.g. an effort/RIR field → `422`, contract §16C). Be liberal on additive
*non-input* fields (forward-compat, contract §11).

### 3.3 Transaction & versioning
- Every state-changing handler runs inside **one** `db.transaction()` (the existing ctx manager) so the
  learning chain + the idempotency record + any instrument row commit or roll back together (BB-2).
- `model_version`/`capability_model_version` are already stamped on every history row; the handler also
  returns them in responses and includes `catalog_version` on composed sessions (BB-4). Additive response
  fields only; **fail-closed** on anything unrecognized (contract §11).

---

## 4. Authentication implementation

**Scheme (contract §2; BB-19/20): one bearer token per athlete, server derives `athlete_id` from the
token — never trusts a client-supplied id.**

- **Token store:** an additive `auth_token` table (migration 007, infra — *not* model state):
  `token_hash TEXT PK, athlete_id TEXT, created_at, revoked_at`. Store only a **hash** of a high-entropy
  random token (BB-20); compare in constant time.
- **Auth dependency (`deps.require_athlete`)**: extract `Authorization: Bearer …` → hash → look up active
  token → yield `athlete_id`. Missing/invalid/revoked → `401` (contract §2/§15). Every query in the handler
  is scoped to **this** `athlete_id`; a path referencing another athlete's `ws_…/eb_…/rec_…` returns `404`
  (existence not leaked) or `403` per contract §16A — **no IDOR** (BB-19).
- **Provisioning (BB-25):** tokens are issued at enrollment by the operator path (`HushService.onboard`
  creates the athlete; a sibling op mints + returns the token over the secure channel). **No public
  registration/login endpoint** (contract §2).
- **Throttling (BB-24):** per-source auth-failure throttling to blunt token brute-force, even without
  general rate limiting.
- **Operator scope (BB-22):** `/internal/*` requires the operator key (from the secrets manager), is
  network-restricted, and **every operator access is logged**. The athlete token has no path to it.
- **TLS-only** everywhere (ATS/contract §1); the token never appears in URLs or logs (BB-28).

---

## 5. Persistence architecture

The existing two-zone schema (immutable history + mutable projection) and repositories are **unchanged**.
The only persistence work is the **connection model** (BB-9) and **additive infra tables**.

### 5.1 Connection model (BB-9 — the one real production gap, OC1)
As-built, one `Database` holds one `sqlite3.Connection` (`check_same_thread=True`) — correct for the sim,
**unusable by a concurrent API as-is**. The sanctioned fix (audit §11: "an additive shell around the
unchanged pure model"):
- **Connection-per-request:** open a SQLite connection at request entry (WAL + `PRAGMA foreign_keys=ON`
  set **per connection** — OC2), pass it to the repositories/pipeline exactly as today (they already take
  the active connection), close at request end. WAL gives concurrent readers.
- **Write serialization:** SQLite allows one writer. Preserve the single-writer invariant by **serializing
  the learning-chain transaction** (a process-level write lock / single write worker, or `BEGIN IMMEDIATE`
  + bounded retry on `SQLITE_BUSY`). At 100 users with sub-ms chains, a single writer is ample.
- **Recommended topology (toggle §12):** **one process / one worker** for writes (trivially preserves the
  single writer) with WAL readers; or a small pool with the write lock. No change to any repository or model
  code — they receive a connection, as now.

### 5.2 Additive infra schema (web-shell migration — NOT model behavior)
> **Numbering note (2026-06-11):** in the as-built repo, **migration 007 = bodyweight (DX-07)** and
> **migration 008 = the DX-11 `session_progress` accumulator** (Schema **v8**). The idempotency/token/
> profile-meta infra tables below are therefore a **later** migration (009+), landed with the web shell —
> not 007. The pattern is unchanged.

A new **additive, idempotent** migration registered in the Wave-1 `runner.MIGRATIONS` (advances
`SCHEMA_VERSION`; the Wave-1 fresh-DB stamp + drift guard extend automatically):
- `idempotency_key(athlete_id, client_event_id, response_json, created_at, PRIMARY KEY(athlete_id, client_event_id))` — §6.
- `auth_token(token_hash PK, athlete_id, created_at, revoked_at)` — §4.
- `athlete_profile_metadata(athlete_id PK, bodyweight_kg REAL, updated_at)` — the contract §9 bodyweight
  *metadata* (out of the model loop; a **side table** so the model's `athlete` row and its three-site
  positional discipline are untouched).
These are **infra tables outside the model zones**; no model number, formula, or column meaning changes.
Run via the Wave-1 single runner, **after a tested backup** (BB-3 → BB-5; `MIGRATION_RUNBOOK_V1.md`).

---

## 6. Idempotency implementation (BB-1)

The contract's exactly-once guarantee (contract §13) lives here, and it is simultaneously the anti-replay
security control (Security DI2/CS2).

**Algorithm (apply-and-record in one transaction):**
```
def handle_event(athlete_id, key, apply_fn) -> Response:   # key = client_event_id (or client_request_id)
    with db.transaction() as conn:                          # ONE txn: dedup + learn + record commit together
        prior = conn.execute(
            "SELECT response_json FROM idempotency_key WHERE athlete_id=? AND client_event_id=?",
            (athlete_id, key)).fetchone()
        if prior is not None:
            return deserialize(prior["response_json"])       # replay → SAME response, NO re-apply
        result = apply_fn(conn)                               # the learning chain / lifecycle primitive
        conn.execute("INSERT INTO idempotency_key(athlete_id, client_event_id, response_json, created_at) "
                     "VALUES (?,?,?,?)", (athlete_id, key, serialize(result), now_iso()))
        return result
```
- **Scope:** keyed per athlete (derived from the token) — a captured event cannot be replayed cross-athlete
  (anti-replay).
- **Atomicity:** the dedup record and the model write are in the **same** transaction, so a retried
  `set_report` after a flaky network **never learns twice** (the cardinal requirement; ties to BB-2).
- **Response parity:** a deduped replay returns a response **semantically identical** to the original
  (same `observation_id`, same `next`), so the device's blind retries are safe (contract §13).
- **Ordering:** the device drains in `seq` order, one in-flight (mobile §6.2); the server applies as
  received. Genuine lifecycle/order violations (a set on a `completed` session) → `409` (contract §15), on
  which the device pulls and reconciles.

---

## 7. Session lifecycle execution path

Maps the contract lifecycle (ES-001 `planned→active→completed/abandoned`) onto the **existing** primitives,
disaggregated for event-driven reporting. **No orchestration rule changes** — it reuses `SessionEngine`'s
ratified rules (R2: one governor update per capability; load-free composition; persisted exploration seed),
driven by incoming events instead of the in-process loop.

**`POST /sessions` (start/compose):**
1. `load_athlete_state` → `compose_session(ath, strategy, session_index, seed, week)` (load-free, ES-009).
2. `create_session` with the ES-009 §9 audit snapshot (seed/index/frequency/volume/calibration).
3. For each composed block: `recommend(cap, exercise, df, target_reps)` → `add_block(... recommended_weight ...)`.
   (Steps 1–3 are exactly `SessionEngine.run_session` steps 1–2, minus the in-process set loop.) Return the
   full frozen `Session`. `201`; idempotent on `client_request_id`.

**`POST /sessions/{id}/sets` (the core loop):**
> **Implemented as the DX-11 primitive (2026-06-11):** steps 2–3 below are
> `hush_model/persistence/runtime.py::SessionRuntime.report_set` over the persisted
> `session_progress` accumulator (migration 008). The athlete's logged `(actual_weight, actual_reps)`
> pair is carried via `perform=lambda rec: (actual_weight, actual_reps)` (M1/DX-01). **`complete_block`
> is DEFERRED to `POST /complete`, once per capability in `CAPABILITY_PRIORITY_ORDER`** — the
> R2-safe variant `SESSION_RUNTIME_TRANSITION_REVIEW.md` §5.1 recommends over the per-block-last-set
> phrasing in item 3 below (which would double-fire for a multi-slot capability). Verified bit-for-bit vs
> `SessionEngine` by the differential-replay gate (`test_sprint5`). The handler here only adds the
> idempotency wrapper + HTTP mapping.
1. Idempotency wrapper (§6) opens the transaction.
2. `pipeline.report_set_fatigue_aware(athlete_id, session_id, block_id, capability, exercise, df,
   target_reps, set_number, perform=<reported (actual_weight, actual_reps)>, week, govern=False)` — appends
   the observation, runs de-fatigue→evidence→state-update (the existing chain), records A8/A9 instruments
   (§8/BB-10). `week` is pinned from the session row (review §5.3).
3. **Per-capability decision memory (R2):** accumulate the block's entry-score / `s_obs` /
   decision_type across set reports into the persisted `session_progress` (`SessionProgress` mirroring
   `SessionEngine._CapMemory`). **DX-11 defers all `complete_block` calls to `POST /complete`** (review
   §5.1), iterating `CAPABILITY_PRIORITY_ORDER` once per capability — identical to `SessionEngine` step 4.
4. Compute `next` (next_set / next_block / session_complete) from the **frozen plan** (flow control only —
   the prescription does not change mid-session) and return ack (contract §7.2).

**`POST /blocks/{id}/skip`:** `set_block_status(block_id, "skipped")`; **no** observation/evidence/state
write (contract §5.1). Return `{block, next}`. Idempotent.

**`POST /blocks/{id}/replace`:** `HushService.replace_exercise(athlete_id, capability,
current_exercise_id, reason, target_reps, block_id)` — the existing preference-driven, capability-preserving
L2 primitive (one bounded nudge; audit `replaced_from`/`reason`). Off-catalog target captured verbatim via
the observation `override_category`/`override_target` (A9). Return the new block. Idempotent.

**`POST /sessions/{id}/complete`:**
1. Mark any non-completed/skipped block `completed` (ES-001 completion rule).
2. `complete_block` for any capability whose decision memory is still pending (R2), then
   `complete_session(session_id)` + `increment_workout_count`.
3. **Pre-compose the next session** (compose + persist as `is_next`, the cache fill — contract §6/§8.5) and
   write the **shadow-baseline** row for the session (BB-10/A8).
4. `finished_early` → still a `complete` (remaining blocks `skipped`); a true abandon uses
   `abandon_session` (status `abandoned`). Idempotent on `client_event_id`.

---

## 8. Sync ingestion path

How the device's queued events (mobile §6) are ingested and the projection returned.

**Ingest (push):** each event POST is independent, **idempotent** (§6), **transactional** (§7), and
**athlete-scoped** (§4). The server validates the event targets an `active` session/block (else `409`), runs
the lifecycle primitive (§7), records the idempotency key, and returns the ack. Ordering is the device's
responsibility (one in-flight, `seq` order); one author per athlete means no merge.

**Instruments in the path (BB-10) — live from session one:**
- **A8 shadow baseline:** alongside the model recommendation, compute the fixed non-learning shadow policy
  (`sim/shadow.py`) and write `shadow_recommendation` (the existing table) — the paired comparison.
- **A9 override log:** replace/off-catalog targets recorded on the observation (`override_category`,
  `override_target`).
- **A1 fresh-state / A3 costly-case tags:** recorded per the Sprint-4 instrumentation.
- **Audit completeness (BB-12):** `reconstruct_session` must return composition + recommendation + shadow +
  observation for every block; a session that can't be reconstructed is invalid (ES-009 §9).

**Pull (projection):** `GET /sessions/today` assembles the `Projection` DTO from
`load_athlete_state` (the 5 capability states, strategy, preferences, athlete) + the cached `is_next`
session, with an `ETag` (contract §6). `{today: null, reason: "awaiting_compose"}` when the athlete outran
the one-session cache (the device shows the calm degraded state). A `catalog_version` bump forces a refresh.

---

## 9. Observability / logging architecture

- **The audit chain is the real "log"** (`SERVER_ARCHITECTURE_ASBUILT_V1.md` §6): every recommendation is
  reconstructable (`reconstruct_observation`/`reconstruct_session`) in the immutable history. The
  operator `/internal/audit` exposes this slice; the athlete app gets only the per-rec "why".
- **Structured operational logging (BB-28):** leveled, category-tagged, with a **correlation id = the
  `client_event_id`** flowing client→server→audit (one mechanism, two payoffs with BB-1). **No sensitive
  values in logs** (no tokens, no rep counts in plaintext at info level).
- **Monitoring + alerting (BB-27):** uptime, error rate, request latency (instrument the in-request
  learning chain — it is the sub-ms hot path), with alerts to a named on-call.
- **Operator surface (BB-23):** `/internal/` audit/state/metrics endpoints behind the operator key (BB-22),
  network-restricted, access-logged — the support + analysis surface.
- **Validation data export (BB-32):** a tested export path for the A7/A8/A9 evidence via `/internal/metrics`
  + audit.

---

## 10. Background jobs / workers

At 100 users the **learning loop is entirely in-request** (sub-ms, transactional) — there is **no queue,
no message bus, no worker for the model** (frozen architecture; honored). The only background work is
**operational**, and none of it touches the learning chain:
- **Backups (BB-3):** a scheduled job snapshotting the SQLite DB **with WAL** (e.g. `litestream`/`VACUUM
  INTO` to encrypted storage) + a **tested restore**. "No migration without a fresh backup."
- **A7 week-1 gate monitoring (BB-11):** a scheduled/operator aggregation of first-session loads
  **segmented by cohort tail**, with the defined **stop/pause-and-re-anchor** trigger (the hard Phase-1
  gate; abort = re-anchor ES-008 v2, **never** field-tune — KL-9). Needs OD-8 thresholds ratified.
- **Pre-compose** is **not** a background job — it runs synchronously inside `POST /complete` (§7), keeping
  the device's cache filled without async machinery.
- **Migration runner** is a **deploy step**, not a worker (the Wave-1 single runner, gated by a backup).

---

## 11. Deployment topology

```
            ┌────────────────────── prod (and a mirror staging) ──────────────────────┐
  Athlete   │  TLS termination ─► one Hush service process (FastAPI, sync handlers)    │
  app  ───► │      │  connection-per-request (WAL readers) + serialized writer (BB-9)  │
  (TLS)     │      ▼                                                                    │
            │  hush_model (frozen) + persistence  ──►  one SQLite DB (WAL)             │
            │      │                                     • encrypted-at-rest volume    │
            │      └─ in-request learning chain (sub-ms, transactional)                │  (BB-21)
            │  /internal/* (operator key, network-restricted, access-logged) ──────────│  (BB-22/23)
            └───────────────┬───────────────────────────────┬────────────────────────┘
                            │ scheduled backups (WAL-aware)  │ A7 gate monitor (cohort-segmented)
                            ▼ encrypted storage (BB-3/21)    ▼ stop/re-anchor trigger (BB-11)
```

- **One deployable, one DB, single-process/few-workers, synchronous** — the frozen architecture (no
  microservices/queue). The **deployable is a generated artifact** (`assemble_and_test.py` output, OC3):
  pin a build (Docker image of the assembled tree) as the build-of-record (BB-31 provenance).
- **Staging + prod** (BB-30), TLS, **secrets manager** for the operator key + token pepper (BB-22).
- **Migrations on deploy** via the Wave-1 runner, gated by a successful backup (BB-5/BB-3).
- **Out of scope (recorded, not built):** horizontal scale, multi-process write, Postgres, cloud-sync
  hardening — Future/Cloud (BL-1; LP2). The single-writer SQLite model is the v1 decision.

---

## 12. Testing strategy

The model is exhaustively tested (131 server tests, golden/parity) — **do not re-test it**. New tests cover
the **web shell and its contract**, under `pytest` against the assembled `app/` + `hush_model/`.

| Layer | What | How |
|---|---|---|
| **API contract** | request/response mapping vs `API_CONTRACT_V1.md` fixtures; the **shared contract test** the app's CI also runs | recorded fixtures + FastAPI `TestClient` |
| **Idempotency (BB-1)** | a replayed `client_event_id` is a **verified no-op** (no double-learn); same response returned | apply event twice, assert one observation + identical body |
| **AuthZ (BB-19)** | server derives `athlete_id` from token; cross-athlete id → `404`/`403`; revoked token → `401`; auth throttling | per-token request tests |
| **Atomicity (BB-2)** | mid-chain fault rolls back the **whole** transaction (incl. the idempotency record) | fault injection in `apply_fn` |
| **Input bounds (BB-8)** | reps/weight/set_number bounds; inactive capability and effort/RIR field → `422` | malformed-request tests |
| **Concurrency (BB-9/ATD-20)** | connection-per-request under concurrent athletes; WAL readers; serialized writer; `SQLITE_BUSY` retry | threaded/parallel client tests |
| **Lifecycle e2e** | **start → report a full workout → complete → assert state + audit** (Build Plan's e2e = the integration test) | `TestClient` end-to-end |
| **Instruments (BB-10/12)** | shadow A8 + override A9 captured in-path; `reconstruct_session` complete for every block | record-and-assert |
| **Migration on populated DB (BB-5)** | the Wave-1 runner + migration 007 on a realistic populated copy; fresh-vs-migrated parity holds | populated-DB migration test |

CI: model golden runner (as today) **plus** the API `pytest` suite **plus** the cross-tier contract test
run against deployed staging (mirrors the mobile §10 contract test). BB-13 unifies these into one green CI.

---

## 13. Build order

Ordered by dependency, mirroring Wave-2 batches **B1→B5** (`WAVE_2_EXECUTION_CHECKLIST.md`). Each step ends
green before the next.

**Step 1 — Foundation (B1: BB-13, BB-30).** Assemble the runnable, `pytest`-green tree incl. the new `app/`
package skeleton; stand up staging+prod env (TLS, secrets). Resolve the bespoke-runner/pytest parity (TB5).

**Step 2 — Connection model (B2: BB-9, ATD-20).** Implement connection-per-request + write serialization
(§5.1) as an additive shell; add the concurrency / populated-DB-migration / fault-rollback tests. **No model
or repository change.**

**Step 3 — API core (B3: BB-14 + BB-1/19/8/2/4/6/7).** In order:
3.1 `schemas.py` (Pydantic == contract DTOs) + `errors.py` (envelope). 3.2 `auth.py`/`deps.require_athlete`
(BB-19/20) + `migration_007_infra` (idempotency/token/profile-meta, additive, via the runner).
3.3 `idempotency.py` apply-and-record (BB-1) — build it **first**, it is load-bearing.
3.4 The read endpoints (`GET /sessions/today`, history, why, profile) — pure reads, athlete-scoped.
3.5 The event endpoints (`POST /sessions`, `/sets`, `/skip`, `/replace`, `/complete`) wired to the §7
lifecycle path, each in one transaction with version/clock/override handling (BB-4/6/7) and bounds (BB-8).
3.6 Staging dress-rehearsal: the lifecycle e2e against deployed staging.

**Step 4 — Instruments & the A7 gate (B4: BB-10, BB-12, BB-11).** Wire A8 shadow / A9 override / A1
fresh-state / A3 tags into the ingestion path; verify complete `reconstruct_session`; arm the A7 week-1
gate monitor (needs OD-8 thresholds) with the stop/re-anchor trigger.

**Step 5 — Durability, security, observability, rollout (B5/B7 + BB-29).** Backups+restore (BB-3),
encryption-at-rest (BB-21), tokens + provisioning (BB-20/25), prod migration (BB-5), operator surface +
secrets (BB-22/23), monitoring/logging (BB-27/28), dependency pinning/SCA (BB-31), data export (BB-32),
incident runbook + staged rollout (BB-29).

**Integration checkpoints (with the mobile track):**
- After Step 3: `HushAPI` ⇄ this API on staging (auth + `GET /sessions/today` + one `POST /sets`); the
  **shared contract test** green on both sides.
- After Step 3: **idempotent-replay** verified end-to-end (a re-sent `client_event_id` does not double-learn)
  — the joint BB-1 acceptance.
- Before Step 5 ships: instruments confirmed capturing from the **first real session** (BB-10) — or the
  trial is "dead on arrival".

---

## 14. Decision toggle points (build to the default; flip if the OD/infra choice differs)

| Choice | Default built | Toggle point |
|---|---|---|
| Web framework (BB-14) | **FastAPI, synchronous handlers** | `app_main.py` + `routers/` (Flask/WSGI swappable; handlers stay sync) |
| Connection model (BB-9) | **single writer (one worker) + WAL readers, connection-per-request** | `connection.py` (small write-locked pool is the alternative) |
| Token storage (BB-20) | **hashed tokens in `auth_token` (main DB)** | `auth.py` (secrets-manager-backed store is the alternative) |
| Idempotency store (BB-1) | **`idempotency_key` table in the main DB (same txn)** | `idempotency.py` |
| Backups (BB-3) | **WAL-aware snapshot to encrypted storage + tested restore** | `deploy/` job (litestream vs `VACUUM INTO`) |

These are implementation choices **within** the frozen single-process synchronous architecture — not new
architecture decisions.

---

## 15. What this blueprint does NOT do

- It does **not** change the frozen model, any number/formula/constant, the schema *meaning*, or any
  decision logic. (Migration 007 adds **infra** tables only, outside the model zones.)
- It adds **no endpoint** beyond `API_CONTRACT_V1.md` and **no product feature**.
- It introduces **no queue, message bus, microservice, second datastore, or horizontal-scale change** — the
  learning loop stays synchronous and in-request (frozen architecture).
- It runs the model **exactly once** (the assembled package) — no reimplementation, no client logic.
- It does **not** begin implementation — it is the executable plan for Wave-2 batches B1–B5.

---

*Backend build plan only. Implements the frozen API contract over the frozen model; no redesign, no new
features, no model-behavior change, no architecture-decision change. Traceability: `API_CONTRACT_V1.md` ·
`MOBILE_BUILD_PLAN_V1.md` · `SERVER_ARCHITECTURE_ASBUILT_V1.md` · `MIGRATION_RUNBOOK_V1.md` ·
`WAVE_2_EXECUTION_CHECKLIST.md` (B1–B5) · `OD1_FINAL_DECISION.md` (Option B). Frozen model authoritative as
in `HUSH_V1_EXECUTION_CONTEXT.md`.*
