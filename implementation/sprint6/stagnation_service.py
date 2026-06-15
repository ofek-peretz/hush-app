"""
M5 stagnation persistence engine (DX-09). Sprint 6.

Composes the PURE `hush_model/stagnation.py` over the persisted history. It reads the
per-capability learned-score series (from the immutable `state_update_log`, joined to `evidence`
for the logical `source_week`), the in-window session count (from `observation`), and the
current capability states (score / confidence / variance moments). It writes NOTHING to model
state — its only write is the additive `stagnation_marker` (the anti-repetition cooldown memory,
Product Spec §12). The weekly review is the entry point the program-construction / Weekly
Intelligence Review calls; it returns an advisory assessment and applies nothing (§13).

CONCEPTUAL LOCATION: hush_model/persistence/stagnation_service.py (a driver beside session.py).
"""
from __future__ import annotations

from ..constants import CLASS_A_CAPABILITIES, STAGNATION_WINDOW_WEEKS
from ..variance import recent_variance, agreement as compute_agreement
from ..stagnation import classify_trend, detect_imbalance, assess, StagnationAssessment
from .db import Database, now_iso
from .repositories import StateRepository


class StagnationRepository:
    """Read-only history reader + the single `stagnation_marker` writer (DX-09)."""

    def __init__(self, conn):
        self.conn = conn

    def score_series(self, athlete_id: str, capability: str, since_week: float) -> list[float]:
        """The capability's learned-score trajectory within the window, in time order. Reads the
        immutable state-update log joined to evidence for the logical week (source_week)."""
        rows = self.conn.execute(
            "SELECT sul.new_score AS s FROM state_update_log sul "
            "JOIN evidence ev ON sul.evidence_id = ev.id "
            "WHERE sul.athlete_id=? AND sul.capability=? AND ev.source_week >= ? "
            "ORDER BY ev.source_week, sul.rowid",
            (athlete_id, capability, since_week),
        ).fetchall()
        return [r["s"] for r in rows]

    def sessions_in_window(self, athlete_id: str, capability: str, since_week: float) -> int:
        """Distinct sessions training the capability within the window (§12 ≥6 eligibility)."""
        row = self.conn.execute(
            "SELECT COUNT(DISTINCT workout_session_id) AS n FROM observation "
            "WHERE athlete_id=? AND capability=? AND week >= ?",
            (athlete_id, capability, since_week),
        ).fetchone()
        return int(row["n"]) if row is not None else 0

    def get_marker(self, athlete_id: str, capability: str):
        row = self.conn.execute(
            "SELECT last_surfaced_week, last_surfaced_state FROM stagnation_marker "
            "WHERE athlete_id=? AND capability=?",
            (athlete_id, capability),
        ).fetchone()
        if row is None:
            return None
        return (row["last_surfaced_week"], row["last_surfaced_state"])

    def upsert_marker(self, athlete_id: str, capability: str, week: float, state: str) -> None:
        self.conn.execute(
            "INSERT INTO stagnation_marker"
            "(athlete_id, capability, last_surfaced_week, last_surfaced_state, updated_at) "
            "VALUES (?,?,?,?,?) ON CONFLICT(athlete_id, capability) DO UPDATE SET "
            "last_surfaced_week=excluded.last_surfaced_week, "
            "last_surfaced_state=excluded.last_surfaced_state, updated_at=excluded.updated_at",
            (athlete_id, capability, week, state, now_iso()),
        )


class StagnationEngine:
    """Weekly, read-only stagnation/imbalance detection over the learned score (M5 / DX-09)."""

    def __init__(self, db: Database):
        self.db = db

    def weekly_review(self, athlete_id: str, week: float) -> StagnationAssessment:
        """Run M5 detection at program construction. Reads history + current state, classifies
        each Class-A capability's trend, computes the imbalance read, assembles ≤1 insight / ≤1
        advisory recommendation / ≤1 acceptance-gated volume option (cooldown-respecting), records
        the cooldown marker for whatever was surfaced, and returns the assessment. APPLIES
        NOTHING and mutates NO model state (§12/§13)."""
        since_week = week - STAGNATION_WINDOW_WEEKS
        with self.db.transaction() as conn:
            state_repo = StateRepository(conn)
            repo = StagnationRepository(conn)
            ath = state_repo.load_athlete_state(athlete_id)
            weekly_volume = ath.strategy.weekly_volume if ath.strategy is not None else "moderate"

            reports = {}
            scores_by_cap: dict[str, float] = {}
            confidences: dict[str, float] = {}
            markers: dict[str, tuple] = {}
            for capability in CLASS_A_CAPABILITIES:
                cap = ath.capabilities.get(capability)
                if cap is None:
                    continue
                sigma2 = recent_variance(cap.var_w, cap.var_ws, cap.var_ws2)
                agree = compute_agreement(cap.var_w, cap.var_ws, cap.var_ws2)
                scores = repo.score_series(athlete_id, capability, since_week)
                sessions = repo.sessions_in_window(athlete_id, capability, since_week)
                reports[capability] = classify_trend(
                    capability, scores, cap.confidence, sigma2, agree, sessions,
                )
                scores_by_cap[capability] = cap.score
                confidences[capability] = cap.confidence
                markers[capability] = repo.get_marker(athlete_id, capability)

            lagging = detect_imbalance(scores_by_cap, confidences)
            assessment = assess(reports, lagging, markers, week, weekly_volume)

            # record the cooldown marker for the surfaced capability only (the sole write).
            if assessment.surfaced_capability is not None:
                cap = assessment.surfaced_capability
                repo.upsert_marker(athlete_id, cap, week, assessment.reports[cap].state)

        return assessment
