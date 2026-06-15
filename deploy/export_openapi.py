#!/usr/bin/env python3
"""
Export the frozen API contract as an OpenAPI 3.x document (operational/contract asset).

The Hush v1 service is FastAPI, so the *served* contract is already machine-described by
`app.openapi()`. This script renders that document to a checked-in artifact
(`deploy/openapi.json`) so that:

  * the **iOS client** (BB-15) can be generated / type-checked against the exact server contract
    instead of hand-transcribing `API_CONTRACT_V1.md` (reduces Mobile effort + drift risk);
  * the **staging dress-rehearsal** (BB-14/BB-30) has a contract baseline to diff against;
  * **CI** can fail on undeclared contract drift (`--check`), making the served surface a
    reviewed, version-stamped artifact rather than an implicit one.

It computes nothing about the model and changes no model behaviour — it serializes the existing
FastAPI route table. Run against the assembled tree (the build-of-record) so the exported contract
matches what ships.

Usage:
    python deploy/export_openapi.py                 # write deploy/openapi.json
    python deploy/export_openapi.py --check         # exit 1 if the file is stale (CI drift gate)
    python deploy/export_openapi.py --stdout        # print to stdout, write nothing

The app factory creates/brings-forward a DB at import; we point it at a throwaway temp DB and a
dummy operator key so exporting the contract never touches a real database.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSEMBLED = os.path.join(ROOT, "build", "_assembled")
DEFAULT_OUT = os.path.join(ROOT, "deploy", "openapi.json")


def _load_app():
    """Import the assembled app with a throwaway DB so export has no side effects on real data."""
    if not os.path.isdir(os.path.join(ASSEMBLED, "app")):
        sys.exit(
            "assembled tree not found — run `python build/_verify/assemble_and_test.py` first "
            f"(looked in {ASSEMBLED})"
        )
    sys.path.insert(0, ASSEMBLED)
    tmp_db = os.path.join(tempfile.gettempdir(), "hush_openapi_export.db")
    # Never auto-create the module-level app against the real default DB.
    os.environ["HUSH_AUTOCREATE_APP"] = "0"
    from app.app_main import create_app  # noqa: WPS433 (import after path setup, by design)

    app = create_app(db_path=tmp_db, operator_key="export-only-dummy-key")
    try:
        os.remove(tmp_db)
    except OSError:
        pass
    return app


def build_spec() -> dict:
    app = _load_app()
    spec = app.openapi()
    # Stamp the schema version the contract was generated against (read from app state) so a
    # consumer can correlate the contract with a deployed migration head.
    spec.setdefault("info", {})["x-hush-schema-version"] = getattr(
        app.state, "schema_version", None
    )
    return spec


def _serialize(spec: dict) -> str:
    # Stable, diff-friendly serialization (sorted keys, trailing newline) so `--check` is meaningful.
    return json.dumps(spec, indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export the Hush v1 OpenAPI contract.")
    parser.add_argument("--out", default=DEFAULT_OUT, help="output path (default deploy/openapi.json)")
    parser.add_argument("--check", action="store_true", help="exit 1 if the on-disk file is stale")
    parser.add_argument("--stdout", action="store_true", help="print to stdout, write no file")
    args = parser.parse_args(argv)

    rendered = _serialize(build_spec())

    if args.stdout:
        sys.stdout.write(rendered)
        return 0

    if args.check:
        if not os.path.exists(args.out):
            print(f"DRIFT: {args.out} does not exist — run export_openapi.py", file=sys.stderr)
            return 1
        with open(args.out, "r", encoding="utf-8") as fh:
            current = fh.read()
        if current != rendered:
            print(
                f"DRIFT: {args.out} is out of date with the served contract — "
                "re-run `python deploy/export_openapi.py`",
                file=sys.stderr,
            )
            return 1
        print(f"OK: {args.out} matches the served contract")
        return 0

    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(rendered)
    paths = len(json.loads(rendered).get("paths", {}))
    print(f"wrote {args.out} ({paths} paths)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
