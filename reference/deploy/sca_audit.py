#!/usr/bin/env python3
"""
Software-composition analysis gate (BB-31 — SCA over the pinned dependency closure).

The deployable is a generated artifact pinned by `deploy/requirements.txt` (runtime) and
`deploy/requirements-dev.txt` (test/CI). BB-31 asks for SCA on that closure so a known-vulnerable
transitive pin is caught before it ships. This script is that gate: it runs `pip-audit` against the
pinned requirement files (no environment scan — the pins ARE the build-of-record) and exits non-zero
if a known vulnerability is found, so CI can block on it.

It is deliberately self-bootstrapping and degrades honestly:
  * `pip-audit` present            -> run it against the requirement files; its exit code is ours.
  * `pip-audit` absent, --install  -> pip-install it first, then run.
  * `pip-audit` absent, no network -> exit 2 (UNABLE TO RUN), never a false "clean". SCA that cannot
                                      reach the advisory DB must not be mistaken for a pass.

The advisory database is fetched over the network by pip-audit; in an air-gapped CI, point it at a
mirror via PIP_AUDIT_* / cache. This script owns the *policy* (which files, fail-on-vuln, honest
unable-to-run); the network/tooling availability is the external dependency.

Usage:
    python deploy/sca_audit.py                 # audit runtime + dev pins (requires pip-audit)
    python deploy/sca_audit.py --install       # pip-install pip-audit if missing, then audit
    python deploy/sca_audit.py --runtime-only  # audit only the production runtime closure

Exit: 0 = no known vulnerabilities · 1 = vulnerabilities found · 2 = unable to run (tool/network).
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_REQ = os.path.join(ROOT, "deploy", "requirements.txt")
DEV_REQ = os.path.join(ROOT, "deploy", "requirements-dev.txt")


def _have_pip_audit() -> bool:
    return importlib.util.find_spec("pip_audit") is not None


def _install_pip_audit() -> bool:
    print("pip-audit not found; installing ...")
    proc = subprocess.run([sys.executable, "-m", "pip", "install", "pip-audit"])
    return proc.returncode == 0


def _audit(req_files: list[str]) -> int:
    cmd = [sys.executable, "-m", "pip_audit", "--strict", "--progress-spinner", "off"]
    for f in req_files:
        cmd += ["-r", f]
    print("running:", " ".join(cmd))
    try:
        return subprocess.run(cmd).returncode
    except OSError as e:
        print(f"UNABLE TO RUN pip-audit: {e}", file=sys.stderr)
        return 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SCA gate over the pinned dependency closure (BB-31).")
    parser.add_argument("--install", action="store_true",
                        help="pip-install pip-audit if it is missing, then run")
    parser.add_argument("--runtime-only", action="store_true",
                        help="audit only deploy/requirements.txt (the production image closure)")
    args = parser.parse_args(argv)

    req_files = [RUNTIME_REQ] if args.runtime_only else [RUNTIME_REQ, DEV_REQ]
    for f in req_files:
        if not os.path.exists(f):
            print(f"requirement file missing: {f}", file=sys.stderr)
            return 2

    if not _have_pip_audit():
        if args.install:
            if not _install_pip_audit():
                print("UNABLE TO RUN: could not install pip-audit (offline?).", file=sys.stderr)
                return 2
        else:
            print(
                "UNABLE TO RUN: pip-audit is not installed. Re-run with --install (needs network), "
                "or `pip install pip-audit` in CI. Exiting 2 (NOT a clean pass).",
                file=sys.stderr,
            )
            return 2

    rc = _audit(req_files)
    if rc == 0:
        print("SCA OK: no known vulnerabilities in the pinned closure.")
    elif rc == 1:
        print("SCA FAILED: known vulnerabilities found (see above).", file=sys.stderr)
    else:
        print(f"SCA UNABLE TO RUN (pip-audit exit {rc}; likely no network to the advisory DB).",
              file=sys.stderr)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
