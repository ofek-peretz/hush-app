"""
Production migration verification + backup-gated forward migration (BB-5 / BB-3 mechanism).

The migration *system* is built (the single ordered runner, ATD-13; fresh-vs-migrated parity,
ATD-8; the no-rollback discipline, `MIGRATION_RUNBOOK_V1.md` §4). What BB-5 adds is the operator
tooling that makes the runbook's rule — *"no migration on a real DB without a tested backup, and
exercise the chain against a populated copy first; assert schema version + referential integrity"*
(§11 checklist; runbook §4) — **executable and enforced in code**, not merely documented.

The production database engine is SQLite at every tier (build plan §11 topology), so this harness
rehearses a production migration faithfully on any host: the only step that is Operations, not
code, is pointing `--db` at the live deployed file (service drained). Everything else — the backup,
the forward run, and the schema/referential-integrity verification — is exercised here and tested.

It changes NO migration, schema, or model behavior. It composes the existing sanctioned primitives:

  - `backup_database`  — WAL-safe online snapshot via the sqlite3 backup API (the BB-3 mechanism the
                         skeleton in `deploy/README.md` describes), self-verified with integrity_check.
  - `restore_database` — copy a known-good backup back into place (tested-restore, BB-3) + verify.
  - `verify_database`  — the §11 gate: schema-version head + full chain recorded + `integrity_check`
                         + `foreign_key_check` (referential integrity) + fresh-vs-migrated shape parity.
  - `migrate_production` — the ONE sanctioned production migration command: it **refuses to run the
                         forward chain unless it has first taken a fresh backup** (structural, not by
                         convention), then runs `run_migrations` (the single ordered runner), then
                         verifies. Forward-only — on a failed verify it does NOT auto-rollback (there
                         is no down-migration, MG3); it reports the backup to restore from.

CONCEPTUAL LOCATION: app/migrate.py (web shell ops tooling, beside connection.py).
"""
from __future__ import annotations

import os
import shutil
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone

from hush_model.persistence.db import Database
from hush_model.persistence.migrations.runner import (
    run_migrations, migration_versions, MIGRATIONS, SCHEMA_VERSION,
)


class BackupRequiredError(RuntimeError):
    """Raised when a production migration is attempted without a successful fresh backup.
    Enforces the runbook's non-negotiable rule *before* any forward migration touches the DB."""


class BackupError(RuntimeError):
    """Raised when a backup cannot be produced or fails its own integrity check."""


# ----------------------------- verification (the §11 gate) -----------------------------

@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str


@dataclass
class VerifyReport:
    ok: bool
    schema_version: int
    expected_version: int
    checks: list[CheckResult] = field(default_factory=list)

    def __bool__(self) -> bool:
        return self.ok

    def failed(self) -> list[CheckResult]:
        return [c for c in self.checks if not c.ok]


@contextmanager
def _readonly_conn(target):
    """Yield a connection for read-only verification. `target` may be a path (opened+closed here)
    or an already-open connection (left open for the caller)."""
    if isinstance(target, str):
        conn = sqlite3.connect(target)
        try:
            yield conn
        finally:
            conn.close()
    else:
        yield target


def _expected_shape() -> dict[str, set[str]]:
    """The table -> column-set a fresh `SCHEMA_SQL` DB embodies (the head of the chain). The
    deployed DB must contain at least this shape (fresh-vs-migrated parity, ATD-8 direction that
    matters operationally: the app needs every expected table/column to exist)."""
    db = Database(":memory:")
    try:
        tables = {r[0] for r in db.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        return {t: {r[1] for r in db.conn.execute(f"PRAGMA table_info({t})")} for t in tables}
    finally:
        db.close()


def verify_database(target) -> VerifyReport:
    """Assert a database is fully migrated AND structurally sound. Read-only. Returns a structured
    report (every check named with detail) so an operator sees exactly what failed. This is the
    BB-5 / §11 acceptance gate: schema version + referential integrity + shape parity."""
    checks: list[CheckResult] = []
    head = -1
    with _readonly_conn(target) as conn:
        # 1. schema_version head == SCHEMA_VERSION (fully brought forward)
        try:
            recorded = {r[0] for r in conn.execute("SELECT version FROM schema_version")}
            head = max(recorded) if recorded else -1
            checks.append(CheckResult(
                "schema_version_head", head == SCHEMA_VERSION,
                f"head={head} expected={SCHEMA_VERSION}"))
            # 2. the full chain is recorded (no missing step)
            missing = set(migration_versions()) - recorded
            checks.append(CheckResult(
                "chain_complete", not missing,
                "all chain versions recorded" if not missing else f"missing versions {sorted(missing)}"))
        except sqlite3.Error as e:
            checks.append(CheckResult("schema_version_head", False, f"schema_version unreadable: {e}"))
            checks.append(CheckResult("chain_complete", False, f"schema_version unreadable: {e}"))

        # 3. no migration is still pending (read-only: each migration self-reports applied)
        try:
            pending = [m.VERSION for m in MIGRATIONS if not m.already_applied(conn)]
            checks.append(CheckResult(
                "no_pending_migrations", not pending,
                "none pending" if not pending else f"pending {pending}"))
        except sqlite3.Error as e:
            checks.append(CheckResult("no_pending_migrations", False, f"unreadable: {e}"))

        # 4. physical integrity
        integ = conn.execute("PRAGMA integrity_check").fetchone()[0]
        checks.append(CheckResult("integrity_check", integ == "ok", integ))

        # 5. referential integrity — every FK constraint satisfied (independent of foreign_keys pragma)
        fk_rows = conn.execute("PRAGMA foreign_key_check").fetchall()
        checks.append(CheckResult(
            "foreign_key_check", not fk_rows,
            "no violations" if not fk_rows else f"{len(fk_rows)} orphan row(s): {[tuple(r) for r in fk_rows[:5]]}"))

        # 6. fresh-vs-migrated shape parity — the deployed DB carries every expected table+column
        actual_tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        expected = _expected_shape()
        missing_shape: list[str] = []
        for tname, ecols in expected.items():
            if tname not in actual_tables:
                missing_shape.append(f"table {tname}")
                continue
            acols = {r[1] for r in conn.execute(f"PRAGMA table_info({tname})")}
            for c in ecols - acols:
                missing_shape.append(f"{tname}.{c}")
        checks.append(CheckResult(
            "schema_shape_parity", not missing_shape,
            "matches SCHEMA_SQL" if not missing_shape else f"missing {missing_shape[:8]}"))

    ok = all(c.ok for c in checks)
    return VerifyReport(ok=ok, schema_version=head, expected_version=SCHEMA_VERSION, checks=checks)


# ----------------------------- backup / restore (BB-3 mechanism) -----------------------------

def backup_database(path: str, backup_dir: str) -> str:
    """Take a WAL-safe, consistent online snapshot of `path` into `backup_dir` and return the
    backup file path. Uses the sqlite3 backup API (copies committed state including the WAL — a
    raw file copy would miss un-checkpointed pages), then self-verifies the snapshot with
    `integrity_check`. Off-box storage / scheduling / encryption stay Operations (BB-3/BB-21);
    this is the mechanism they operationalize."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"no database to back up at {path!r}")
    os.makedirs(backup_dir, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
    dst = os.path.join(backup_dir, f"hush-{ts}.db")

    src = sqlite3.connect(path)
    try:
        bck = sqlite3.connect(dst)
        try:
            src.backup(bck)  # consistent online snapshot (WAL-aware)
        finally:
            bck.close()
    finally:
        src.close()

    chk = sqlite3.connect(dst)
    try:
        result = chk.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        chk.close()
    if result != "ok":
        raise BackupError(f"backup integrity_check failed for {dst!r}: {result}")
    return dst


def restore_database(backup_path: str, dest_path: str) -> VerifyReport:
    """Restore a known-good backup over `dest_path` and verify it (tested-restore, BB-3). Removes
    any stale WAL sidecars on the destination so the restored file is authoritative. The service
    MUST be drained (no open connection to `dest_path`) before calling this — a production rule,
    not enforceable here."""
    if not os.path.exists(backup_path):
        raise FileNotFoundError(f"no backup at {backup_path!r}")
    for suffix in ("-wal", "-shm"):
        side = dest_path + suffix
        if os.path.exists(side):
            os.remove(side)
    shutil.copyfile(backup_path, dest_path)
    return verify_database(dest_path)


# ----------------------------- the sanctioned production migration -----------------------------

@dataclass
class MigrateReport:
    ok: bool
    applied_versions: list[int]
    backup_path: str | None
    verify: VerifyReport


def _run_forward(path: str) -> list[int]:
    """Bring an existing DB forward via the single ordered runner (the sanctioned forward path).
    Does NOT re-run SCHEMA_SQL — a deployed prod DB is already shaped; the runner applies only the
    not-yet-applied deltas, each self-guarded and idempotent."""
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        applied = run_migrations(conn)
        conn.commit()
    finally:
        conn.close()
    return applied


def migrate_production(path: str, *, backup_dir: str | None = None,
                       require_backup: bool = True) -> MigrateReport:
    """The ONE sanctioned production migration command (BB-5).

    Sequence: (1) take a fresh, integrity-verified backup — and **refuse to proceed if it cannot**
    (`require_backup=True`, the default, enforces the runbook rule structurally); (2) run the
    forward chain via the single ordered runner; (3) verify schema version + referential integrity
    + shape parity. Forward-only: on a failed verify it does NOT auto-rollback (no down-migration,
    MG3) — restore the reported backup with `restore_database` and investigate.

    `require_backup=False` is the explicit, dangerous operator override (e.g. a throwaway staging
    copy); it still takes a backup when `backup_dir` is given."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"no database at {path!r} (production migration runs on an existing DB)")

    backup_path: str | None = None
    if require_backup:
        if not backup_dir:
            raise BackupRequiredError(
                "refusing to migrate without a backup: backup_dir is required "
                "(runbook §4 — no migration without a fresh, restore-tested backup)")
        try:
            backup_path = backup_database(path, backup_dir)
        except Exception as e:  # backup is the precondition — fail BEFORE migrating
            raise BackupRequiredError(f"backup failed; refusing to migrate {path!r}: {e}") from e
    elif backup_dir:
        backup_path = backup_database(path, backup_dir)

    applied = _run_forward(path)
    report = verify_database(path)
    return MigrateReport(ok=report.ok, applied_versions=applied,
                         backup_path=backup_path, verify=report)


# ----------------------------- operator CLI -----------------------------

def _format_report(verify: VerifyReport) -> str:
    lines = [f"schema_version={verify.schema_version} (expected {verify.expected_version}) "
             f"-> {'OK' if verify.ok else 'FAIL'}"]
    for c in verify.checks:
        lines.append(f"  [{'PASS' if c.ok else 'FAIL'}] {c.name}: {c.detail}")
    return "\n".join(lines)


def run_cli(argv: list[str] | None = None) -> int:
    """Operator entry point: `python -m app.migrate --db <path> --backup-dir <dir>` migrates;
    `--verify-only` just runs the gate. Returns a process exit code (0 = ok, 1 = fail/refused)."""
    import argparse

    parser = argparse.ArgumentParser(description="Hush v1 production migration / verification (BB-5).")
    parser.add_argument("--db", required=True, help="path to the SQLite database")
    parser.add_argument("--backup-dir", default=None, help="directory for the pre-migration backup")
    parser.add_argument("--verify-only", action="store_true",
                        help="only run the verification gate (no backup, no migration)")
    parser.add_argument("--no-backup", action="store_true",
                        help="DANGEROUS: migrate without requiring a backup (staging throwaways only)")
    args = parser.parse_args(argv)

    if args.verify_only:
        report = verify_database(args.db)
        print(_format_report(report))
        return 0 if report.ok else 1

    try:
        result = migrate_production(args.db, backup_dir=args.backup_dir,
                                    require_backup=not args.no_backup)
    except BackupRequiredError as e:
        print(f"REFUSED: {e}")
        return 1
    if result.backup_path:
        print(f"backup: {result.backup_path}")
    print(f"applied migrations: {result.applied_versions or '(none — already current)'}")
    print(_format_report(result.verify))
    if not result.ok and result.backup_path:
        print(f"VERIFY FAILED — forward-only, no auto-rollback. Restore from: {result.backup_path}")
    return 0 if result.ok else 1


if __name__ == "__main__":  # pragma: no cover
    import sys
    sys.exit(run_cli())
