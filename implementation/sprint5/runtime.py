"""
Event-driven session runtime (DX-11) — the runtime half of the M1 input flip. Sprint 5.

`SessionEngine.run_session` runs a whole session in ONE in-process call, holding the
per-capability ES-006 decision-memory accumulator (`_CapMemory`) in a process-local dict. The
device-driven path instead receives ONE set per request — each its own transaction, with no
shared process memory — so the accumulator must be PERSISTED (`session_progress`, migration
008) and read once at session close to advance the governor ONCE per capability (R2).

`SessionRuntime` is the service-layer primitive the future `POST /sessions/{id}/sets` and
`POST /sessions/{id}/complete` handlers map onto (SERVER_BUILD_PLAN §7;
SESSION_RUNTIME_TRANSITION_REVIEW §2/§5). It writes NO model logic — it composes the existing
`SessionEngine.compose_and_open` (steps 1–2), `LearningPipeline.report_set_fatigue_aware`
(step 3, govern=False), and `LearningPipeline.complete_block` (step 4, once per capability in
CAPABILITY_PRIORITY_ORDER), then closes the session (step 5). The result is bit-for-bit
identical to `SessionEngine` on the same inputs/order — the differential-replay gate (review
§7) verifies it.

The athlete's logged `(actual_weight, actual_reps)` is carried via the same `perform` callback
the pipeline already takes (M1/DX-01). The production endpoint passes
`perform=lambda rec: (reported_actual_weight, reported_actual_reps)`.

This is NOT the web shell (auth, idempotency, connection-per-request — review §5.5/§5.6,
BB-1/9/19); those are the later Wave-2 batch. DX-11 delivers the primitive + the accumulator.

CONCEPTUAL LOCATION: hush_model/persistence/runtime.py (a driver beside session.py / service.py).
"""
from __future__ import annotations
from dataclasses import dataclass

from ..constants import CAPABILITY_PRIORITY_ORDER
from .db import Database, now_iso
from .repositories import StateRepository, SessionRepository
from .pipeline import LearningPipeline
from .session import SessionEngine, SessionPlan


@dataclass
class _Acc:
    """The persisted per-(session, capability) accumulator — the database-backed equivalent of
    SessionEngine._CapMemory (session.py). One row per capability per session."""
    entry_score: float | None = None     # score before ANY of this capability's sets this session
    s_obs: float = 0.0                    # representative observed score (primary slot preferred)
    decision_type: str = ""
    recommended_weight: float = 0.0
    have_primary: bool = False


class SessionProgressRepository:
    """Reader/writer for the `session_progress` accumulator (additive infra table, DX-11)."""

    def __init__(self, conn):
        self.conn = conn

    def get(self, session_id: str, capability: str) -> _Acc:
        row = self.conn.execute(
            "SELECT * FROM session_progress WHERE workout_session_id=? AND capability=?",
            (session_id, capability),
        ).fetchone()
        if row is None:
            return _Acc()
        return _Acc(
            entry_score=row["entry_score"],
            s_obs=row["s_obs"],
            decision_type=row["decision_type"],
            recommended_weight=row["recommended_weight"],
            have_primary=bool(row["have_primary"]),
        )

    def upsert(self, session_id: str, capability: str, acc: _Acc) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO session_progress"
            "(workout_session_id, capability, entry_score, s_obs, decision_type, "
            " recommended_weight, have_primary, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (session_id, capability, acc.entry_score, acc.s_obs, acc.decision_type,
             acc.recommended_weight, 1 if acc.have_primary else 0, now_iso()),
        )

    def all_for_session(self, session_id: str) -> dict[str, _Acc]:
        rows = self.conn.execute(
            "SELECT * FROM session_progress WHERE workout_session_id=?", (session_id,)
        ).fetchall()
        return {
            r["capability"]: _Acc(
                entry_score=r["entry_score"], s_obs=r["s_obs"],
                decision_type=r["decision_type"], recommended_weight=r["recommended_weight"],
                have_primary=bool(r["have_primary"]),
            )
            for r in rows
        }


def _cap_rank(capability: str) -> int:
    try:
        return CAPABILITY_PRIORITY_ORDER.index(capability)
    except ValueError:
        return len(CAPABILITY_PRIORITY_ORDER)


class SessionRuntime:
    """Event-driven compose → per-set report → complete, over the existing primitives."""

    def __init__(self, db: Database):
        self.db = db
        self.pipeline = LearningPipeline(db)
        self.engine = SessionEngine(db)

    def start_session(
        self, athlete_id: str, week: float, session_index: int, seed: int,
        target_reps: int = 8,
    ) -> tuple[str, SessionPlan, list]:
        """≡ SessionEngine steps 1–2 (load-free compose + persist blocks), reusing the SAME
        primitive. Returns (session_id, plan, block_ids). The future `POST /sessions` handler."""
        return self.engine.compose_and_open(
            athlete_id, week, session_index, seed, target_reps
        )

    def report_set(
        self, athlete_id: str, session_id: str, block_id: str, capability: str,
        exercise: str, difficulty_factor: float, target_reps: int, set_number: int,
        perform, week: float, is_primary_slot: bool,
        override_category: str = "", override_target: float | None = None,
    ):
        """≡ SessionEngine step 3 for ONE set. `perform(rec) -> (actual_weight, actual_reps)`
        carries the athlete's LOGGED load (M1/DX-01). `week` is pinned by the caller from the
        session row and `govern=False` always (review §5.3 — a single-set govern=True would
        advance the governor per set). After the learning chain, update the PERSISTED
        accumulator exactly as SessionEngine updates _CapMemory (session.py).

        BB-7: `override_category`/`override_target` are the opt-in A9 passthrough (default
        ''/None — byte-identical to the in-process replay path; only the API ingestion path
        sets them) recorded on the observation by the learning chain."""
        res = self.pipeline.report_set_fatigue_aware(
            athlete_id, session_id, block_id, capability, exercise, difficulty_factor,
            target_reps, set_number, perform, week, govern=False,
            override_category=override_category, override_target=override_target,
        )
        with self.db.transaction() as conn:
            repo = SessionProgressRepository(conn)
            acc = repo.get(session_id, capability)
            if acc.entry_score is None:
                acc.entry_score = res.score_before     # session-entry score for this capability
            # default-fill from any block until the primary is seen; primary overrides.
            if is_primary_slot or not acc.have_primary:
                if set_number == 1:
                    acc.decision_type = res.decision_type
                    acc.recommended_weight = res.recommended_weight
                acc.s_obs = res.s_obs
            if is_primary_slot:
                acc.have_primary = True
            repo.upsert(session_id, capability, acc)
        return res

    def complete_session(self, athlete_id: str, session_id: str, week: float) -> None:
        """≡ SessionEngine steps 4–5. Advance ES-006 decision memory ONCE per capability (R2),
        in CAPABILITY_PRIORITY_ORDER, reading the persisted accumulator; then mark remaining
        blocks completed, complete the session, and advance the workout count. The future
        `POST /sessions/{id}/complete` handler (review §5.1: complete_block deferred to close)."""
        with self.db.transaction() as conn:
            accs = SessionProgressRepository(conn).all_for_session(session_id)
        for capability in sorted(accs, key=_cap_rank):
            acc = accs[capability]
            self.pipeline.complete_block(
                athlete_id, capability, week,
                score_at_block_entry=acc.entry_score if acc.entry_score is not None else 0.0,
                block_s_obs=acc.s_obs, decision_type=acc.decision_type,
                recommended_weight=acc.recommended_weight,
            )
        with self.db.transaction() as conn:
            sess = SessionRepository(conn)
            for b in sess.blocks_for_session(session_id):
                if b["status"] not in ("completed", "skipped"):
                    sess.set_block_status(b["id"], "completed")
            sess.complete_session(session_id)
            StateRepository(conn).increment_workout_count(athlete_id)
