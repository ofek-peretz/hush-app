"""
Assemble the documented hush_model/ + sim/ + tests/ tree from the per-sprint snapshot
files and run every test_* function (no pytest in this checkout — plain-assert runner,
the same method the Sprint 2 completion report used to produce the 46/46 result).
"""
from __future__ import annotations
import os, shutil, sys, importlib, traceback, types

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root
IMPL = os.path.join(ROOT, "implementation")
OUT = os.path.join(ROOT, "build", "_assembled")

# (dest relative path under OUT) <- (source file under implementation/)
MAP = {
    "hush_model/__init__.py": None,
    "hush_model/constants.py": "sprint0/constants.py",
    "hush_model/domain.py": "sprint0/domain.py",
    "hush_model/prediction.py": "sprint0/prediction.py",
    "hush_model/recommendation.py": "sprint0/recommendation.py",
    "hush_model/evidence.py": "sprint0/evidence.py",
    "hush_model/state_update.py": "sprint0/state_update.py",
    "hush_model/seeding.py": "sprint0/seeding.py",
    "hush_model/strength_standards.py": "sprint0/strength_standards.py",
    "hush_model/fatigue.py": "sprint2/fatigue.py",
    "hush_model/recovery.py": "sprint2/recovery.py",
    "hush_model/variance.py": "sprint2/variance.py",
    "hush_model/decision.py": "sprint3a/decision.py",
    "hush_model/catalog.py": "sprint3b1/catalog.py",
    "hush_model/preference.py": "sprint3b1/preference.py",
    "hush_model/composition.py": "sprint3b2/composition.py",
    "hush_model/volume.py": "sprint3b2/volume.py",
    "hush_model/stagnation.py": "sprint6/stagnation.py",
    "hush_model/capability/__init__.py": None,
    "hush_model/capability/epley.py": "sprint0/epley.py",
    "hush_model/capability/reference_strength.py": "sprint0/reference_strength.py",
    "hush_model/capability/confidence.py": "sprint0/confidence.py",
    "hush_model/capability/decay.py": "sprint0/decay.py",
    "hush_model/loop/__init__.py": None,
    "hush_model/loop/orchestrator.py": "sprint0/orchestrator.py",
    "hush_model/persistence/__init__.py": None,
    "hush_model/persistence/db.py": "sprint1/db.py",
    "hush_model/persistence/schema.py": "sprint1/schema.py",
    "hush_model/persistence/repositories.py": "sprint1/repositories.py",
    "hush_model/persistence/service.py": "sprint1/service.py",
    "hush_model/persistence/pipeline.py": "sprint1/pipeline.py",
    "hush_model/persistence/migrations/__init__.py": None,
    "hush_model/persistence/migrations/runner.py": "wave1/migrations_runner.py",
    "hush_model/persistence/migrations/migration_002_fatigue.py": "sprint2/migration_002_fatigue.py",
    "hush_model/persistence/migrations/migration_003_decision.py": "sprint3a/migration_003_decision.py",
    "hush_model/persistence/migrations/migration_004_foundation.py": "sprint3b1/migration_004_foundation.py",
    "hush_model/persistence/migrations/migration_005_composition.py": "sprint3b2/migration_005_composition.py",
    "hush_model/persistence/session.py": "sprint3b2/session.py",
    "hush_model/persistence/runtime.py": "sprint5/runtime.py",
    "hush_model/persistence/stagnation_service.py": "sprint6/stagnation_service.py",
    "hush_model/persistence/migrations/migration_006_instrumentation.py": "sprint4/migration_006_instrumentation.py",
    "hush_model/persistence/migrations/migration_007_bodyweight.py": "wave1/migration_007_bodyweight.py",
    "hush_model/persistence/migrations/migration_008_session_progress.py": "sprint5/migration_008_session_progress.py",
    "hush_model/persistence/migrations/migration_009_stagnation.py": "sprint6/migration_009_stagnation.py",
    "hush_model/persistence/migrations/migration_010_infra.py": "api/migration_010_infra.py",
    "hush_model/persistence/migrations/migration_011_erasure.py": "api/migration_011_erasure.py",
    "hush_model/persistence/migrations/migration_012_events.py": "api/migration_012_events.py",
    "hush_model/persistence/migrations/migration_013_offpolicy.py": "api/migration_013_offpolicy.py",
    "hush_model/persistence/migrations/migration_014_composition_audit.py": "api/migration_014_composition_audit.py",
    "hush_model/persistence/migrations/migration_015_preference_events.py": "api/migration_015_preference_events.py",
    "hush_model/persistence/migrations/migration_016_week_plan.py": "api/migration_016_week_plan.py",
    "hush_model/persistence/migrations/migration_017_workout_name.py": "api/migration_017_workout_name.py",
    # ---- Wave-2 web shell (BB-13/14): the additive API layer beside the frozen model ----
    "app/__init__.py": None,
    "app/connection.py": "api/connection.py",
    "app/migrate.py": "api/migrate.py",
    "app/errors.py": "api/errors.py",
    "app/observability.py": "api/observability.py",
    "app/schemas.py": "api/schemas.py",
    "app/auth.py": "api/auth.py",
    "app/a7_gate.py": "api/a7_gate.py",
    "app/ops_monitor.py": "api/ops_monitor.py",
    "app/idempotency.py": "api/idempotency.py",
    "app/instrumentation.py": "api/instrumentation.py",
    "app/deps.py": "api/deps.py",
    "app/lifecycle.py": "api/lifecycle.py",
    "app/app_main.py": "api/app_main.py",
    "app/routers/__init__.py": None,
    "app/routers/sessions.py": "api/routers/sessions.py",
    "app/routers/blocks.py": "api/routers/blocks.py",
    "app/routers/reads.py": "api/routers/reads.py",
    "app/routers/profile.py": "api/routers/profile.py",
    "app/routers/telemetry.py": "api/routers/telemetry.py",
    "app/routers/preferences.py": "api/routers/preferences.py",
    "app/routers/weeks.py": "api/routers/weeks.py",
    "app/routers/consent.py": "api/routers/consent.py",
    "app/internal/__init__.py": None,
    "app/internal/operator.py": "api/internal/operator.py",
    "sim/__init__.py": None,
    "sim/synthetic_athlete.py": "sprint0/synthetic_athlete.py",
    "sim/seed_validation.py": "sprint0/seed_validation.py",
    "sim/equipment_coverage.py": "sprint3b2/equipment_coverage.py",
    "sim/parameters.py": "sprint4/parameters.py",
    "sim/shadow.py": "sprint4/shadow.py",
    "sim/harness.py": "sprint4/harness.py",
    "sim/scenarios.py": "sprint4/scenarios.py",
    "sim/metrics.py": "sprint4/metrics.py",
    "sim/calibration.py": "sprint4/calibration.py",
    "sim/gate.py": "sprint4/gate.py",
    "tests/test_sprint0.py": "sprint0/test_sprint0.py",
    "tests/test_seed_validation.py": "sprint0/test_seed_validation.py",
    "tests/test_equipment_coverage.py": "sprint3b2/test_equipment_coverage.py",
    "tests/test_sprint1.py": "sprint1/test_sprint1.py",
    "tests/test_sprint2.py": "sprint2/test_sprint2.py",
    "tests/test_sprint3a.py": "sprint3a/test_sprint3a.py",
    "tests/test_sprint3b1.py": "sprint3b1/test_sprint3b1.py",
    "tests/test_sprint3b2.py": "sprint3b2/test_sprint3b2.py",
    "tests/test_sprint4.py": "sprint4/test_sprint4.py",
    "tests/test_wave1.py": "wave1/test_wave1.py",
    "tests/test_sprint5.py": "sprint5/test_sprint5.py",
    "tests/test_sprint6.py": "sprint6/test_sprint6.py",
    # ---- Wave-2 API tests (BB-13): run under pytest against the assembled app/ + hush_model/ ----
    "tests/conftest.py": "api/conftest.py",
    "tests/test_api_core.py": "api/test_api_core.py",
    "tests/test_api_connection.py": "api/test_api_connection.py",
    "tests/test_api_instruments.py": "api/test_api_instruments.py",
    "tests/test_api_metrics.py": "api/test_api_metrics.py",
    "tests/test_api_gate.py": "api/test_api_gate.py",
    "tests/test_api_observability.py": "api/test_api_observability.py",
    "tests/test_api_migrate.py": "api/test_api_migrate.py",
    "tests/test_api_erasure.py": "api/test_api_erasure.py",
    "tests/test_api_ops_monitor.py": "api/test_api_ops_monitor.py",
}

# The API tests run under pytest (FastAPI TestClient + fixtures), not the plain-assert golden
# runner. They are assembled into the tree above and invoked separately by `run()` (build plan §12).
API_TEST_FILES = [
    "tests/test_api_core.py",
    "tests/test_api_connection.py",
    "tests/test_api_instruments.py",
    "tests/test_api_metrics.py",
    "tests/test_api_gate.py",
    "tests/test_api_observability.py",
    "tests/test_api_migrate.py",
    "tests/test_api_erasure.py",
    "tests/test_api_ops_monitor.py",
]


def assemble():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    for dest, src in MAP.items():
        dpath = os.path.join(OUT, dest)
        os.makedirs(os.path.dirname(dpath), exist_ok=True)
        if src is None:
            open(dpath, "w").close()
        else:
            shutil.copyfile(os.path.join(IMPL, src), dpath)


def run():
    assemble()
    sys.path.insert(0, OUT)
    suites = ["tests.test_sprint0", "tests.test_seed_validation", "tests.test_sprint1",
              "tests.test_sprint2", "tests.test_sprint3a",
              "tests.test_sprint3b1", "tests.test_sprint3b2", "tests.test_equipment_coverage",
              "tests.test_sprint4",
              "tests.test_wave1", "tests.test_sprint5", "tests.test_sprint6"]
    total = passed = 0
    failures = []
    for modname in suites:
        mod = importlib.import_module(modname)
        names = [n for n in dir(mod) if n.startswith("test_")]
        for n in names:
            fn = getattr(mod, n)
            if not isinstance(fn, types.FunctionType):
                continue
            total += 1
            try:
                fn()
                passed += 1
            except Exception as e:
                failures.append((modname, n, "".join(traceback.format_exc())))
        print(f"{modname}: {len(names)} tests")
    print(f"\n==== model golden runner: {passed}/{total} passed ====")
    for mod, n, tb in failures:
        print(f"\nFAIL {mod}.{n}\n{tb}")
    return passed, total, failures


def run_api_tests() -> int:
    """Run the Wave-2 API pytest suite against the assembled tree (build plan §12). Returns the
    pytest exit code (0 = pass, 5 = no tests collected). Skips gracefully if FastAPI/pytest are
    absent so the model gate still works in a minimal environment. Invoked with explicit file
    paths (never cwd-inside-_assembled, which would lock the dir against the next rmtree)."""
    try:
        import pytest  # noqa: F401
        import fastapi  # noqa: F401
    except Exception as e:  # pragma: no cover
        print(f"\n==== API pytest suite SKIPPED (missing dep: {e}) ====")
        return 0
    import subprocess
    paths = [os.path.join(OUT, p) for p in API_TEST_FILES]
    print("\n---- running API pytest suite (app/ + hush_model/) ----")
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "--no-header", *paths],
        cwd=ROOT,
    )
    print(f"==== API pytest suite exit code: {proc.returncode} ====")
    return proc.returncode


if __name__ == "__main__":
    p, t, f = run()
    api_rc = run_api_tests()
    ok = (not f) and (api_rc == 0)
    print(f"\n==== OVERALL: model {p}/{t} + API pytest rc={api_rc} -> {'PASS' if ok else 'FAIL'} ====")
    sys.exit(0 if ok else 1)
