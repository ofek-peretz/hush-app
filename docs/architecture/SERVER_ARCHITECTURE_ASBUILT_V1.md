# SERVER_ARCHITECTURE_ASBUILT_V1.md — As-Built Server Code Architecture

> **Factual as-built reference for the Hush v1 server code** at close of Sprint 4 + Wave 1 (Audit DG1 /
> ATD-15). It describes how the code actually fits together — the snapshot→package mapping, the
> connection/transaction model, the repository boundaries, the learning-pipeline shape, the migration
> chain + runner, and an **invariant-enforcement matrix** (which invariants are DB-, CI-, test-, or
> convention-enforced). **It describes; it does not design or redesign.** Where it points forward (the
> concurrency connection model), it names the open item and does not pre-decide it. The frozen model is
> authoritative as in `HUSH_V1_EXECUTION_CONTEXT.md`. Governing rule: *no redesign without explicit model
> review.*
>
> Date: 2026-06-10 · Build: Sprint 0–4 ✅ + Wave 1 ✅ (131 tests: 125 prior + 6 Wave-1, schema v6) ·
> Source verified against: `db.py`, `schema.py`, `repositories.py`, `pipeline.py`, `service.py`,
> `session.py`, `migration_00{2..6}_*.py`, `migrations/runner.py`, `build/_verify/assemble_and_test.py`.
>
> **════ AS-BUILT UPDATE — DX-15 (2026-06-12) ════** The codebase advanced past this Sprint-4 snapshot:
> `sprint5/runtime.py` (`SessionRuntime` + `session_progress`, migration_008), `sprint6/stagnation.py`
> + `stagnation_service.py` (migration_009), DX-08/10/12, and the **Wave-2 backend** `app/` web layer
> (migration_010 web-shell infra, migration_011 erasure) were added — **`SCHEMA_VERSION = 11`, 284 tests**
> (model golden 189 + API pytest 95). The recommendation surface is **advisory** (ES-006 governor advisory,
> DX-03/DX-20) and the logged `actual_weight` is a **learning input** (M1). The connection/transaction/
> repository/runner description below remains accurate (the additions are additive infra over the unchanged
> pipeline; the API shell adds connection-per-request + a serialized writer over it).

---

## 1. Source layout & the snapshot→package mapping

The authoritative source is **flat per-sprint snapshot directories** under `implementation/`; the
runnable package is **generated**, not hand-maintained.

- `implementation/sprint0/ … sprint4/` — the per-sprint snapshots. **Later sprints edit earlier files in
  place** (e.g. `sprint1/schema.py` already carries Sprint 2–4 columns; `sprint1/db.py` carries the
  Wave-1 stamp). Provenance is recorded in `CONCEPTUAL LOCATION:` and `# Sprint N` comments.
- `implementation/wave1/` — **Wave-1 Pre-S5 hygiene** snapshots (this wave): `migrations_runner.py`,
  `test_wave1.py`. Kept in their own directory so their provenance (post-Sprint-4 hygiene, not a sprint
  feature) is honest.
- `build/_assembled/` — the **generated** package tree (`hush_model/…`, `sim/…`, `tests/…`). **Never
  edited by hand** — it is output (see `DEVELOPMENT_WORKFLOW.md`, ATD-16).
- `build/_verify/assemble_and_test.py` — the assembler + bespoke test runner. Its `MAP` dict is the
  authoritative snapshot→package mapping; its `suites` list is the authoritative test-suite set.

**The package an engineer reasons about** (`hush_model/persistence/db.py`) is assembled from a snapshot
(`implementation/sprint1/db.py`). To change it: edit the **snapshot**, then re-assemble.

```
implementation/sprintN/<file>.py   ──assemble_and_test.py MAP──►   build/_assembled/hush_model/.../<file>.py
implementation/wave1/<file>.py     ──────────────────────────►    build/_assembled/.../<file>.py | tests/
```

### 1.1 The assembled package shape

```
hush_model/
  constants.py            # single source of truth for all model numbers (frozen)
  domain.py               # value objects
  prediction.py recommendation.py evidence.py state_update.py seeding.py
  fatigue.py recovery.py variance.py decision.py catalog.py preference.py
  composition.py volume.py
  capability/             # epley, reference_strength, confidence, decay
  loop/orchestrator.py
  persistence/
    db.py                 # Database + transaction() + fresh-DB version stamp (ATD-12)
    schema.py             # cumulative SCHEMA_SQL (v6-shaped)
    repositories.py       # StateRepository (sole writer) + Session/Learning (append-only)
    pipeline.py           # the transactional learning chain
    service.py            # thin orchestration + audit reads
    session.py            # SessionEngine driver (compose→run→learn)
    migrations/
      runner.py           # ATD-13: single ordered runner + MIGRATIONS + SCHEMA_VERSION
      migration_00{2..6}_*.py
sim/                      # synthetic athlete + Phase-0 harness (Sprint 4)
tests/                    # test_sprint0..4 + test_wave1
```

---

## 2. Connection & transaction model (as-built)

- **One database, one connection.** `persistence/db.py:Database.__init__` opens a single
  `sqlite3.Connection` (`db.py`), sets `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL`, runs
  the cumulative `SCHEMA_SQL` via `executescript`, then (Wave-1, ATD-12) stamps `schema_version` for the
  full migration chain so a fresh DB records its version.
- **`transaction()`** is a context manager that `commit()`s on success and `rollback()`s on any
  exception — the unit that keeps the learning chain atomic (Observation + Evidence + StateUpdate commit
  or roll back together; the audit chain's "every link present" guarantee).
- **Scale assumption as-built:** synchronous, single-process, ~100 users; "sub-millisecond inside the
  request." `sqlite3.Connection` defaults to `check_same_thread=True`; there is **no pool and no
  per-request connection**.

> **Forward pointer (not decided here):** serving a *concurrent* API needs a connection model
> (connection-per-request or write-serialization) — this is **Wave-2 `BB-9`** and depends on the **`OD-1`**
> client-architecture decision (both **open**; see `OPEN_ITEMS_EXECUTION_PLAN.md`). This document records
> the single-connection model **as it is today**; it does not choose the production model. The pure model
> package is connection-agnostic, so that work is an additive shell around unchanged math.

---

## 3. Repository boundaries

Three repositories enforce the state-ownership rule as a **code** boundary (`repositories.py`):

- **`StateRepository` — the ONLY writer of `athlete` / `athlete_state` / `capability_state` /
  `strategy_state` / `preference_state`.** Realizes ES-007's "only X may write Y". All writes take the
  active transaction connection so the caller controls atomicity. The capability-state write path is the
  "three-site discipline" surface (create / write / `_row_to_cap` must stay in lockstep).
- **`SessionRepository` — append-only** writer/reader for the ES-001 hierarchy
  (`workout_session → exercise_block → set_record`). It exposes `create_session`, `add_block`, `add_set`,
  and the **lifecycle status UPDATEs** (`set_block_status`, `complete_session`, `abandon_session`) — so
  *facts* are append-only but *lifecycle status* is mutated (see the invariant matrix, §6: history
  immutability is partial-by-design + convention).
- **`LearningRepository` — append-only** writer for `recommendation` / `observation` / `evidence` /
  `state_update_log` / `shadow_recommendation`. Insert-only; no update/delete methods.

**Audit reads** (`service.py:reconstruct_observation` / `reconstruct_session`) are **raw SQL on
`self.db.conn`**, a second read surface over the schema outside the repositories (Audit TD3, accepted).

---

## 4. The learning pipeline (request-time chain)

`persistence/pipeline.py` holds the transactional learning chain, driven per set:

- **Two near-identical methods** (Audit TD1, accepted): `report_set` (rested path, retained for
  bit-for-bit parity) and `report_set_fatigue_aware` (the production ES-011 path). Skeleton-identical;
  they diverge only in fatigue handling.
- **Per-set vs per-block split:** each set commits in its own transaction; the ES-006 decision-memory
  advance is a **separate `complete_block` transaction**, run once per capability per session (governor
  cadence R2). A crash between the last set and `complete_block` leaves sets recorded but decision memory
  un-advanced — recoverable, since the projection is default-inert (Audit OC4).
- **`SessionEngine`** (`persistence/session.py`) is the driver: compose (load-free, ES-009/009.1) →
  persist ordered blocks → run each block's sets through the chain (`govern=False`) → advance decision
  memory once per capability → close the session. It writes **no model logic**; it composes the pure
  functions + repositories.

The **pure model package** (`constants.py`, `prediction.py`, `state_update.py`, `capability/…`, etc.) is
I/O-free and imported verbatim by both the service and the `sim/` harness — so the simulation tests the
real model, not a reimplementation.

---

## 5. Schema & migrations

- **`schema.py:SCHEMA_SQL`** is the cumulative, v6-shaped DDL used to build a **fresh** DB (the only path
  `db.py` runs). It has two logical zones: **immutable history** (`workout_session`, `exercise_block`,
  `set_record`, `observation`, `evidence`, `recommendation`, `state_update_log`, `shadow_recommendation`)
  and **mutable projection** (`athlete`, `athlete_state`, `capability_state`, `strategy_state`,
  `preference_state`), plus the `schema_version` bookkeeping table.
- **Migrations** `migration_00{2..6}_*.py` bring an **existing** DB forward. Each is **additive-only**,
  **idempotent** (`IF NOT EXISTS` / column-existence guards), uniform in shape (`VERSION`, optional
  `_NEW_TABLES`, `_ADDITIONS`, `apply()`, `already_applied()`), and stamps its own `VERSION` row.
- **`migrations/runner.py`** (Wave-1, ATD-13) is the **single ordered invocation path**: `MIGRATIONS`
  (the ordered chain = single source of truth for which migrations exist), `SCHEMA_VERSION` (= 6, the head
  of the chain), and `run_migrations(conn)` (applies each in order, each self-guarded; returns the
  versions that did work; idempotent). It changes **no** migration's logic — it only sequences them behind
  one entry point.
- **Fresh-vs-migrated parity:** a fresh `SCHEMA_SQL` DB and a fully-migrated DB have identical table/column
  shape (tested per migration: `test_fresh_vs_migrated_columns_match_*`) and, since Wave-1 ATD-12,
  identical `schema_version` contents. The Wave-1 drift guard
  (`test_wave1.test_schema_sql_embodies_every_migration_addition`, ATD-8) asserts `SCHEMA_SQL` contains
  every `_NEW_TABLES` table and every `_ADDITIONS` column in the chain — making the SR1 drift structural,
  not hand-checked.

Full procedural detail (how to add a migration, ordering guarantee, no-rollback reality) lives in
`MIGRATION_RUNBOOK_V1.md` (ATD-18), which shares the invariant matrix below.

---

## 6. Invariant-enforcement matrix (canonical copy)

The load-bearing invariants and **how each is actually enforced today** (DB = storage-level; CI = grep/
build check; Test = a specific test; Convention = discipline only). Shared with `MIGRATION_RUNBOOK_V1.md`
(ATD-18) — **this is the authoritative copy.**

| Invariant | Enforcement (as-built) | Notes / source |
|---|---|---|
| Pure model is I/O-free, single source of numbers (`constants.py`) | **CI** (no-I/O import discipline) + **Test** (golden values) | `constants.py`; Audit "healthy core" |
| Single writer of capability/athlete state (`StateRepository`) | **Convention + CI-grep** (not a DB grant) | Audit SR4 / ATD-10 |
| Immutable history (facts append-only) | **Convention + Test** (no mutation methods on `LearningRepository`); **no DB trigger** | Audit SR2 / ATD-9 — lifecycle status UPDATEs *do* exist on `SessionRepository` (partial by design) |
| Transactional learning chain (atomic links) | **DB** (`transaction()` commit/rollback) + **Test** | `db.py`; pipeline tests |
| Three-site capability-state discipline (create/write/read in lockstep) | **Test** (round-trip) only | Audit TD4 / ATD-6; EX1 |
| Additive + idempotent migrations | **Test** (per-migration additive+idempotent) + **Convention** | `test_migration_00*`; Audit MG1 |
| Single ordered migration path | **Code (runner) + Test** (Wave-1) | `runner.py`; `test_wave1` (ATD-13) |
| Fresh DB records its version | **Code (db.py stamp) + Test** (Wave-1) | `db.py`; `test_wave1` (ATD-12) |
| Schema-source parity (`SCHEMA_SQL` ↔ migration chain) | **Test** (Wave-1 drift guard) + per-migration parity test | `test_wave1` (ATD-8); `test_fresh_vs_migrated_*` |
| Version stamping on history rows (`model_version`/`capability_model_version`) | **Code** (stamped on insert) + **Test** | `repositories.py`; verify-end-to-end is Wave-2 BB-4 |
| Apple Health never enters the learning loop | **Convention/architecture** (no such code path exists in v1) | Mobile §9.1 (maintained invariant) |

**Reading of the matrix:** the system's most sacred guarantee — a reconstructable, immutable audit chain
— is currently **test/convention-enforced, not DB-enforced** (SR2/ATD-9). Hardening it to a storage-level
backstop is acknowledged debt (Wave 4), not a Wave-1 change.

---

## 7. What is NOT in this document

- It does **not** decide the concurrency connection model (Wave-2 BB-9 / OD-1).
- It does **not** describe the API or mobile app (Wave 2; `API_CONTRACT_V1.md`, `MOBILE_ARCHITECTURE_V1.md`).
- It changes **no** model number, formula, schema shape, or behavior — it is a description of the
  as-built tree after Wave 1.

---

*As-built reference only. For the frozen model start at `HUSH_V1_EXECUTION_CONTEXT.md`; for status
`HUSH_V1_PROJECT_STATUS.md`; for the dev loop `DEVELOPMENT_WORKFLOW.md`; for migrations
`MIGRATION_RUNBOOK_V1.md`. Long-term health findings: `reviews/ARCHITECTURAL_AUDIT_HUSH_V1.md`.*
