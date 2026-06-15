"""
Idempotency / exactly-once (BB-1; API contract §13). Also the anti-replay security control
(Security DI2/CS2).

`handle_idempotent` is the apply-and-record primitive every state-changing handler routes
through. The dedup check, the model write (the apply_fn), and the dedup record commit in **one
transaction** (BB-2) — so a retried event after a flaky network **never learns twice** (the
cardinal requirement; double-applying corrupts the capability state the whole trial measures).
It runs under the single-writer lock (BB-9) so writers serialize.

  - **Scope:** keyed per athlete (derived from the token), so a captured event cannot be
    replayed cross-athlete (anti-replay).
  - **Response parity:** a deduped replay returns the response recorded the first time —
    semantically identical (same observation_id, same next), so the device's blind retries
    are safe and indistinguishable from a fresh apply (§13).

`apply_fn(conn)` performs the lifecycle/learning primitive on the active connection and returns
a JSON-serializable response dict. Because `RequestDatabase.transaction()` is re-entrant, the
nested transactions the pipeline primitives open join this outer unit (atomic with the record).

CONCEPTUAL LOCATION: app/idempotency.py.
"""
from __future__ import annotations

import json
from typing import Callable

from hush_model.persistence.db import now_iso
from .connection import write_serialized


def handle_idempotent(
    db, athlete_id: str, key: str, apply_fn: Callable[[object], dict]
) -> tuple[dict, bool]:
    """Apply `apply_fn` exactly once for (athlete_id, key); return (response, replayed).

    On first sight: open the outer transaction, run apply_fn, record (key → response), commit.
    On a replay: return the recorded response WITHOUT re-applying. All under the write lock so
    the single-writer invariant (ES-007) holds across per-request connections."""
    with write_serialized():
        with db.transaction() as conn:
            prior = conn.execute(
                "SELECT response_json FROM idempotency_key "
                "WHERE athlete_id=? AND client_event_id=?",
                (athlete_id, key),
            ).fetchone()
            if prior is not None:
                return json.loads(prior["response_json"]), True

            result = apply_fn(conn)

            conn.execute(
                "INSERT INTO idempotency_key(athlete_id, client_event_id, response_json, created_at) "
                "VALUES (?,?,?,?)",
                (athlete_id, key, json.dumps(result), now_iso()),
            )
            return result, False
