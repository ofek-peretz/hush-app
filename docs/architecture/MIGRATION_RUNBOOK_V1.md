# MIGRATION_RUNBOOK_V1.md — Migration Runbook & Invariant Enforcement

> The operator/maintainer runbook for the Hush v1 schema migrations (Audit DG4 / ATD-18): how to add a
> migration, the ordering guarantee (the single runner), the fresh-vs-migrated parity requirement, and the
> current no-rollback reality. It also carries the **invariant-enforcement matrix**, whose canonical copy
> lives in `SERVER_ARCHITECTURE_ASBUILT_V1.md` §6 (ATD-15) and is summarized here for the migration
> audience. **It documents the existing migration system; it changes no migration and no behavior.**
> Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Build: Sprint 0–4 ✅ + Wave 1 ✅ (131 tests, schema v6) · Owner: Backend/Operations.
> **As of 2026-06-12: `SCHEMA_VERSION = 11`, 284 tests** — added migration_007 (bodyweight), 008
> (session_progress), 009 (stagnation_marker), 010 (web-shell infra: idempotency_key, auth_token), 011
> (erasure_record — OD-2 right-to-erasure), all additive/idempotent through the same single runner; the
> runbook process is unchanged. The backup-gated `migrate_production` + `verify_database` mechanism
> (BB-5/BB-3, `app/migrate.py`) now implements "no migration without a fresh verified backup".

---

## 1. The migration system as-built

- **Two paths to a v6 database.** A **fresh** DB is built by `db.py` from the cumulative
  `schema.py:SCHEMA_SQL` (and, since Wave-1 ATD-12, stamped with the full version chain). An **existing**
  DB is brought forward by applying migrations `002 → 006` in order.
- **Each migration** (`implementation/sprint*/migration_00{2..6}_*.py`) is **additive-only** and
  **idempotent**: it adds columns/tables guarded by `IF NOT EXISTS` / column-existence checks, never
  rewrites or drops data, and stamps its `VERSION` into `schema_version`. Uniform shape: `VERSION`,
  optional `_NEW_TABLES`, `_ADDITIONS`, `apply()`, `already_applied()`.
- **The single ordered runner** (`hush_model/persistence/migrations/runner.py`, Wave-1 ATD-13) is the
  **only sanctioned invocation path**. It exposes:
  - `MIGRATIONS` — the ordered chain (single source of truth for which migrations exist);
  - `SCHEMA_VERSION` — the head of the chain (= 6);
  - `run_migrations(conn)` — apply each in order, each self-guarded; returns the versions that did work;
    **idempotent** (a second run returns `[]`).
- **Do not** invoke migrations ad hoc per file in production; that path invited ordering mistakes (Audit
  MG2) and is superseded by the runner.

---

## 2. How to add a migration (e.g. `007`)

1. **Write the snapshot** `implementation/sprint<N>/migration_007_<name>.py` following the existing shape:
   `VERSION = 7`, declarative `_NEW_TABLES` / `_ADDITIONS`, `apply()` + `already_applied()`. **Additive
   only** — add columns/tables; never `ALTER ... DROP`, never rewrite rows. Choose defaults so existing
   rows are **semantically unchanged** ("absence == prior behavior").
2. **Mirror it in `SCHEMA_SQL`** (`implementation/sprint1/schema.py`) so a fresh DB is born v7-shaped. The
   migration's `_NEW_TABLES`/`_ADDITIONS` and the `SCHEMA_SQL` text must agree.
3. **Register it in the runner** — append the module to `MIGRATIONS` in `migrations/runner.py` (this also
   advances `SCHEMA_VERSION` to 7 automatically and extends the fresh-DB stamp).
4. **Wire the snapshot** into `build/_verify/assemble_and_test.py` `MAP`
   (`"hush_model/persistence/migrations/migration_007_<name>.py": "sprint<N>/migration_007_<name>.py"`).
5. **Add tests** (per existing convention): a per-migration additive+idempotent test, and confirm the
   Wave-1 guards still pass (the drift guard `test_schema_sql_embodies_every_migration_addition` will fail
   if step 2 was skipped — that is the guard working).
6. **Run** `python build/_verify/assemble_and_test.py` → all prior tests green + the new ones.

---

## 3. The guarantees you must preserve

- **Ordering:** migrations apply strictly ascending via `run_migrations`. Never rely on per-file order.
- **Idempotency:** re-running the runner (or any migration) on an up-to-date DB is a no-op. Verified by
  `test_runner_applies_in_order_and_is_idempotent` and `test_runner_is_noop_on_fresh_db` (Wave-1).
- **Fresh-vs-migrated parity:** a fresh `SCHEMA_SQL` DB and a fully-migrated DB must be identical in
  table/column shape **and** in `schema_version` contents. Guarded by `test_fresh_vs_migrated_columns_*`
  (per migration) and the Wave-1 drift guard `test_schema_sql_embodies_every_migration_addition` (ATD-8).
  **If you add a migration column but forget `SCHEMA_SQL` (or vice versa), the drift guard fails** — fix
  the divergence, do not silence the test.
- **Additivity:** the fresh-DB version stamp (ATD-12) and `already_applied` correctness rest on every
  migration staying additive + idempotent. A single non-additive migration breaks the fresh-DB path
  silently — so this discipline is non-negotiable (Audit MG1).

---

## 4. No rollback — operate accordingly

- Migrations are **forward-only**; there is **no down-migration** (Audit MG3). A bad migration on live
  data cannot be auto-reversed.
- **Therefore (Wave-2 dependencies, not built here):** no migration runs on a real DB without a **tested
  backup + restore** (`BB-3`) and the migration is exercised against a **populated** copy first (`BB-5`).
  This runbook documents the constraint; the backup/restore tooling is Wave-2 Operations work.
- **Operational rule:** *no migration without a fresh, restore-tested backup.* Stage migrations
  (copy of prod → migrate → verify) before touching the live DB.

---

## 5. Invariant-enforcement matrix (migration-relevant summary)

Canonical copy: `SERVER_ARCHITECTURE_ASBUILT_V1.md` §6 (ATD-15). The rows a migration author most needs:

| Invariant | Enforcement | What it means for you |
|---|---|---|
| Additive + idempotent migrations | **Test + Convention** | never drop/rewrite; guard every add; test idempotency |
| Single ordered migration path | **Code (runner) + Test** | register in `MIGRATIONS`; never invoke ad hoc |
| Fresh DB records its version | **Code (db.py stamp) + Test** | the stamp reads `MIGRATIONS`; adding a migration extends it automatically |
| Schema-source parity (`SCHEMA_SQL` ↔ chain) | **Test (drift guard)** | mirror every migration add into `SCHEMA_SQL` |
| Immutable history (facts append-only) | **Convention + Test; NO DB trigger** | migrations must not add UPDATE/DELETE paths to history facts |
| Single writer of state | **Convention + CI-grep** | a migration must not introduce a second writer of `capability_state` |
| Version stamping on history rows | **Code + Test** | new history columns carry `model_version`/`capability_model_version` discipline |

---

## 6. Related

- As-built code architecture + canonical invariant matrix: `SERVER_ARCHITECTURE_ASBUILT_V1.md` (ATD-15).
- Dev loop (edit snapshot → assemble → test): `DEVELOPMENT_WORKFLOW.md` (ATD-16).
- Long-term migration risks: `reviews/ARCHITECTURAL_AUDIT_HUSH_V1.md` §5 (MG1–MG4).

---

*Runbook only — documents the existing migration system; no migration or behavior is changed. Backups
(BB-3), the prod migration run (BB-5), and the incident runbook (BB-29) are Wave-2 items that consume
this document.*
