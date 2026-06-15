"""
ASGI app factory (BB-14) — wires the frozen model behind the frozen API contract.

`create_app(db_path, operator_key)` initializes/brings-forward the durable DB (BB-9 bootstrap),
configures the request dependencies, registers the contract error envelope (§15), and mounts the
athlete routers + the separate operator surface. Sync (`def`) handlers run the existing
synchronous, transactional pipeline (build plan §3); the threadpool concurrency they introduce is
bounded by the single-writer connection model (BB-9).

The app layer computes NO load, score, or decision — it orchestrates the existing primitives only.

Run (dev):  uvicorn app.app_main:app
CONCEPTUAL LOCATION: app/app_main.py.
"""
from __future__ import annotations

import os

from fastapi import FastAPI

from . import deps, errors, observability
from .connection import init_database
from .routers import sessions, blocks, reads, profile, telemetry, preferences, weeks
from .internal import operator


def create_app(db_path: str | None = None, operator_key: str | None = None) -> FastAPI:
    db_path = db_path or os.environ.get("HUSH_DB_PATH", "hush.db")
    operator_key = operator_key or os.environ.get("HUSH_OPERATOR_KEY")

    observability.configure_logging()                # BB-28 structured operational logging
    schema_version = init_database(db_path)          # BB-9 deploy/startup bootstrap
    deps.configure(db_path, operator_key)

    app = FastAPI(
        title="Hush v1 API",
        version="v1",
        summary="Hush v1 — advisory training intelligence. Hush recommends; the athlete decides.",
    )
    app.state.schema_version = schema_version

    # BB-28: correlation id + one structured access line per request. Added last ⇒ outermost user
    # middleware (sits just inside ServerErrorMiddleware, outside routing and the exception
    # handlers) so the id is bound before any handler runs and the access line always fires.
    app.add_middleware(observability.CorrelationMiddleware)

    errors.register_exception_handlers(app)

    # athlete-scoped surface (the frozen contract §4)
    app.include_router(reads.router, tags=["read"])
    app.include_router(sessions.router, tags=["sessions"])
    app.include_router(blocks.router, tags=["blocks"])
    app.include_router(profile.router, tags=["profile"])
    app.include_router(telemetry.router, tags=["telemetry"])
    app.include_router(preferences.router, tags=["preferences"])
    app.include_router(weeks.router, tags=["weeks"])
    # operator surface — separate scope (§16A), never reachable from an athlete token
    app.include_router(operator.router, tags=["internal"])

    @app.get("/health", tags=["ops"])
    def health() -> dict:
        return {"status": "ok", "schema_version": app.state.schema_version}

    return app


# Module-level app for `uvicorn app.app_main:app` (dev). Production passes an explicit db_path.
# Guarded so importing this module under test does not create a stray DB (tests build their own
# app via create_app(tmp_path) with HUSH_AUTOCREATE_APP=0); uvicorn can also use --factory.
app = create_app() if os.environ.get("HUSH_AUTOCREATE_APP", "1") == "1" else None
