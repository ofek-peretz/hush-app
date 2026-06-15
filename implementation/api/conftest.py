"""
pytest bootstrap for the ASSEMBLED tree (BB-13).

When pytest runs against `build/_assembled/tests/`, this conftest puts the assembled root
(`build/_assembled/`) on `sys.path` so both `app` (the web shell) and `hush_model` (the frozen
model) import exactly as they ship — one assembled tree, the same the golden runner tests
(build plan §12: "one implementation of the math"). It also disables the module-level app
auto-create so importing `app.app_main` under test never writes a stray DB.

CONCEPTUAL LOCATION: build/_assembled/tests/conftest.py (assembled from implementation/api/conftest.py).
"""
from __future__ import annotations

import os
import sys

os.environ.setdefault("HUSH_AUTOCREATE_APP", "0")

_ASSEMBLED_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # build/_assembled
if _ASSEMBLED_ROOT not in sys.path:
    sys.path.insert(0, _ASSEMBLED_ROOT)
