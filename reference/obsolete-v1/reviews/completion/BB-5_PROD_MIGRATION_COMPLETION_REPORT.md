# BB-5 — Production Migration Verification + Backup-Gated Migration (MECHANISM) — Completion Report

Date: 2026-06-12
Owner: Backend (the live-DB run remains Operations)
Status: **Mechanism COMPLETE** (pointing it at the deployed prod DB stays Operations — BB-30 env)
Gate: `python build/_verify/assemble_and_test.py` → **model golden 188/188 + API pytest 67/67 → PASS**

---

## 1. What BB-5 asks for

> *Run the full additive migration chain on the **real prod DB** engine/config and assert schema
> version + referential integrity before launch; exercise the migration against a **populated copy**
> first; **no migration without a fresh, restore-tested backup**.* — `BETA_READINESS_REVIEW.md` §3.1/§11,
> `MIGRATION_RUNBOOK_V1.md` §4, `WAVE_2_EXECUTION_CHECKLIST.md` B5.

The migration **system** was already built and hygienic (single ordered runner ATD-13; fresh-vs-migrated
parity ATD-8; forward-only/no-rollback discipline, runbook §4). What was missing — and what BB-5 is —
is the **operator tooling that turns the runbook's rules into executable, enforced code**: take a
verified backup, run the chain, and assert schema version + referential integrity, refusing to migrate
if a backup cannot be taken.

The production database engine is **SQLite at every tier** (build plan §11 topology), so this harness
**rehearses a production migration faithfully on any host**. The only step that is genuinely Operations,
not code, is pointing `--db` at the live deployed file (service drained) — which needs BB-30's deployed
environment. Everything BB-5 can build and test on this host is built and tested.

Additive ops tooling beside the frozen model — **no model number, formula, schema, migration, or golden
changed** (golden stays 188/188; schema stays v10).

## 2. As-built

New module **`implementation/api/migrate.py`** (assembles to `app/migrate.py`; MAP + `API_TEST_FILES`
updated in `build/_verify/assemble_and_test.py`). It composes the existing sanctioned primitives — it
adds no migration and no new schema:

1. **`verify_database(target)` — the §11 acceptance gate (read-only).** Returns a structured
   `VerifyReport` (every check named, with detail) covering six obligations:
   - `schema_version_head` — recorded head `== SCHEMA_VERSION` (fully brought forward);
   - `chain_complete` — every `migration_versions()` step is recorded (no missing step);
   - `no_pending_migrations` — each migration self-reports `already_applied(conn)` (read-only);
   - `integrity_check` — `PRAGMA integrity_check == 'ok'` (physical soundness);
   - `foreign_key_check` — **`PRAGMA foreign_key_check` returns zero rows** (referential integrity,
     independent of the `foreign_keys` pragma — it scans every FK constraint);
   - `schema_shape_parity` — the deployed DB carries **every table + column a fresh `SCHEMA_SQL` DB
     embodies** (the operationally-relevant direction of ATD-8 drift: the app needs every expected
     table/column to exist). The expected shape is read live from a fresh in-memory `Database`.

2. **`backup_database(path, backup_dir)` — the BB-3 backup mechanism.** A **WAL-safe consistent online
   snapshot** via the sqlite3 backup API (copies committed state *including the WAL* — a raw file copy
   would miss un-checkpointed pages), then **self-verifies the snapshot** with its own `integrity_check`.
   This is the executable core of the skeleton in `deploy/README.md`. Off-box storage / scheduling /
   encryption stay Operations (BB-3/BB-21); this is the mechanism they operationalize.

3. **`restore_database(backup_path, dest)` — tested restore (BB-3).** Removes stale WAL sidecars on the
   destination (so the restored file is authoritative), copies the known-good backup into place, and
   re-verifies. The service must be drained first — a production rule, documented, not enforceable here.

4. **`migrate_production(path, *, backup_dir, require_backup=True)` — the ONE sanctioned prod migration
   command.** Sequence: (1) take a fresh, integrity-verified backup — **and refuse to proceed if it
   cannot** (`BackupRequiredError`, the default), enforcing *"no migration without a backup"*
   **structurally, before any forward step touches the DB**; (2) run the forward chain via the single
   ordered runner (`run_migrations` — the sanctioned forward path; it does **not** re-run `SCHEMA_SQL`,
   so on an already-shaped prod DB it applies only not-yet-applied deltas); (3) `verify_database`.
   **Forward-only:** on a failed verify it does NOT auto-rollback (no down-migration, MG3) — it reports
   the backup path to `restore_database` from.

5. **Operator CLI** (`run_cli` / `python -m app.migrate`): `--db`, `--backup-dir`, `--verify-only`
   (gate only), `--no-backup` (the explicit dangerous staging override). Prints a per-check report;
   exit 0 on ok, 1 on fail/refusal.

## 3. Why this is the executable slice (scope boundary)

- **In code & tested (this tranche):** the backup mechanism, the tested restore, the forward run on a
  populated copy, idempotency, and the full schema-version + referential-integrity + shape-parity gate —
  all of it a faithful production-migration rehearsal because the engine is SQLite everywhere.
- **Remains Operations (BB-30):** executing it against the **live deployed DB file** in the staging/prod
  environment, off-box/encrypted backup storage and scheduling (BB-3/BB-21), and the drain-before-restore
  operational step. The tool is ready; the deployed environment to run it in is not on this host.

## 4. Tests — `implementation/api/test_api_migrate.py` (+12; API 55 → 67)

- `test_verify_passes_on_fresh_init` / `test_verify_passes_on_populated_db` — the gate passes on a
  freshly-initialised DB and on one carrying real athlete history; all six checks present.
- `test_verify_detects_incomplete_chain` — a DB knocked back to pre-v10 fails `schema_version_head`,
  `chain_complete`, and `no_pending_migrations` (the gate has teeth on version).
- `test_verify_detects_referential_integrity_violation` — an orphan `auth_token` inserted with FK
  enforcement OFF is caught by `foreign_key_check` (the gate has teeth on referential integrity).
- `test_verify_detects_missing_table` — dropping a base `SCHEMA_SQL` table fails `schema_shape_parity`.
- `test_backup_is_valid_and_restore_round_trips` — backup is a complete verifiable DB; mutate the live
  DB (+1 athlete), restore, and the athlete count returns to the snapshot (tested restore, BB-3).
- `test_migrate_forward_on_older_db_then_verifies` — a populated DB knocked back to pre-v10 forward-
  migrates: exactly `[10]` applied, verify passes, **populated data preserved across the migration**.
- `test_migrate_on_current_db_is_idempotent_noop` — on a current DB, `applied == []`, data intact.
- `test_no_migration_without_a_backup` — `require_backup` with no `backup_dir`, **and** with an
  uncreatable `backup_dir`, both raise `BackupRequiredError` and **leave the DB un-migrated** (the
  refusal is structural, asserted by the DB still failing verify afterwards).
- `test_migrate_production_refuses_missing_db` — refuses a non-existent DB path.
- `test_cli_verify_only_reports_status` / `test_cli_migrate_refusal_without_backup_dir` — CLI returns
  0/1 correctly and prints `FAIL` / `REFUSED`.

## 5. Files

- **New:** `implementation/api/migrate.py`, `implementation/api/test_api_migrate.py`.
- **Edited:** `build/_verify/assemble_and_test.py` (MAP `app/migrate.py` + test wiring + `API_TEST_FILES`).

**Verification:** `python build/_verify/assemble_and_test.py` → `OVERALL: model 188/188 + API pytest
rc=0 -> PASS` (API suite 67). Suite total **255** (model 188 + API 67).
