"""
Repositories (Sprint 1).

Two repository families enforce the System Architecture's state-ownership rule as a
code boundary (not a network one):

  - History repositories are APPEND-ONLY. They expose insert/get/list, never update
    or delete. Immutable history (ES-001, ES-Founder) is enforced by the absence of
    mutation methods, not by convention.

  - StateRepository is the ONLY writer of capability_state / athlete_state. The
    learning pipeline's StateWriter is the only caller of its write methods. This is
    the code realization of ES-007's "only X may write Y".

All writes take an explicit sqlite connection (the active transaction), so the
caller controls atomicity.
"""
from __future__ import annotations
import json
import uuid
import sqlite3

from .db import now_iso
from ..domain import (
    AthleteState, CapabilityState, Recommendation, Observation, Evidence,
    StrategyState, PreferenceState, default_strategy_state,
)


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ----------------------------- Program Ownership Contract: preference events -----------------------------
# The append-only preference_event action vocabulary. Athlete-owned program structure is a
# PROJECTION over this immutable log (latest-wins per key) — never an overwritten row.
PREF_EXERCISE_REPLACED = "exercise_replaced"     # pin to_exercise for a capability (explicit choice)
PREF_EXERCISE_RESTORED = "exercise_restored"     # clear the pin → model picks again
PREF_SUBSTITUTE_ADDED = "substitute_added"       # from_exercise -> preferred substitute (to_exercise)
PREF_SUBSTITUTE_REMOVED = "substitute_removed"
PREF_BACKUP_DEFINED = "backup_defined"           # from_exercise -> equipment-busy backup (to_exercise)
PREF_BACKUP_REMOVED = "backup_removed"
PREF_EXERCISE_REORDERED = "exercise_reordered"   # payload.order = the workout's exercise sequence
PREF_WORKOUT_REORDERED = "workout_reordered"     # payload.order = workout order
# Usage events (athlete-owned-structure USAGE, not definitions) — append-only, never change the
# projection; they feed the ownership-learning dataset (actual usage, not only definitions).
PREF_SUBSTITUTE_OFFERED = "substitute_offered"
PREF_SUBSTITUTE_SELECTED = "substitute_selected"
PREF_SUBSTITUTE_IGNORED = "substitute_ignored"
PREF_BACKUP_OFFERED = "backup_offered"
PREF_BACKUP_USED = "backup_used"
PREF_BACKUP_BYPASSED = "backup_bypassed"
# Equipment-occupied (V1 ratified 2026-06-15): a runtime move-down reorder of the CURRENT workout
# (no replacement, no structure change). Captured for gym-congestion / workout-friction research.
# payload = {original_position, new_position}; slot_key = workout (session) id; from_exercise = the
# occupied exercise. A usage event — it never changes the owned projection.
PREF_EXERCISE_BUSY = "exercise_busy"
_USAGE_ACTIONS = frozenset({
    PREF_SUBSTITUTE_OFFERED, PREF_SUBSTITUTE_SELECTED, PREF_SUBSTITUTE_IGNORED,
    PREF_BACKUP_OFFERED, PREF_BACKUP_USED, PREF_BACKUP_BYPASSED, PREF_EXERCISE_BUSY,
})


def project_preferences(rows) -> dict:
    """Replay append-only preference_event rows (ascending seq) into the CURRENT projection:
    pins (capability->exercise), substitutes (primary->sub), backups (primary->backup),
    exercise_order (capability->list), workout_order (list). Latest-wins per key; *_removed /
    *_restored clear. Pure + deterministic, so the current preferences are exactly reconstructable
    from the log alone — at any past seq, replay the prefix."""
    pins: dict[str, str] = {}
    subs: dict[str, str] = {}
    backups: dict[str, str] = {}
    ex_order: list = []   # the athlete's preferred exercise sequence within a workout (flat)
    wk_order: list = []   # the athlete's preferred workout sequence
    for r in rows:  # already ordered by seq ASC
        a = r["action"]
        if a == PREF_EXERCISE_REPLACED:
            if r["capability"] and r["to_exercise"]:
                pins[r["capability"]] = r["to_exercise"]
        elif a == PREF_EXERCISE_RESTORED:
            pins.pop(r["capability"], None)
        elif a == PREF_SUBSTITUTE_ADDED:
            if r["from_exercise"] and r["to_exercise"]:
                subs[r["from_exercise"]] = r["to_exercise"]
        elif a == PREF_SUBSTITUTE_REMOVED:
            subs.pop(r["from_exercise"], None)
        elif a == PREF_BACKUP_DEFINED:
            if r["from_exercise"] and r["to_exercise"]:
                backups[r["from_exercise"]] = r["to_exercise"]
        elif a == PREF_BACKUP_REMOVED:
            backups.pop(r["from_exercise"], None)
        elif a == PREF_EXERCISE_REORDERED:
            order = json.loads(r["payload"] or "{}").get("order")
            if isinstance(order, list):
                ex_order = order   # latest-wins
        elif a == PREF_WORKOUT_REORDERED:
            order = json.loads(r["payload"] or "{}").get("order")
            if isinstance(order, list):
                wk_order = order
        # usage actions (offered/selected/ignored/used/bypassed) are recorded but do NOT change
        # the owned projection — they are usage telemetry for the learning dataset.
    return {"pins": pins, "substitutes": subs, "backups": backups,
            "exercise_order": ex_order, "workout_order": wk_order}


class PreferenceEventRepository:
    """Append-only writer/reader for the athlete-preference event log (Program Ownership
    Contract). It exposes append/read/projection but NO update or delete — the preference
    timeline is immutable; current state is always a projection over the log."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def _next_seq(self, athlete_id: str) -> int:
        row = self.conn.execute(
            "SELECT COALESCE(MAX(seq), -1) AS m FROM preference_event WHERE athlete_id=?",
            (athlete_id,),
        ).fetchone()
        return int(row["m"]) + 1

    def append(self, athlete_id: str, action: str, *, capability=None, slot_key=None,
               from_exercise=None, to_exercise=None, payload=None, reason: str = "",
               source: str = "", event_id: str | None = None) -> str:
        """Append ONE immutable preference action. Idempotent on event_id (a retried client
        action never doubles a row). seq is server-assigned monotonic per athlete."""
        eid = event_id or _id("pe")
        if self.conn.execute(
            "SELECT 1 FROM preference_event WHERE event_id=?", (eid,)
        ).fetchone() is not None:
            return eid
        seq = self._next_seq(athlete_id)
        now = now_iso()
        self.conn.execute(
            "INSERT INTO preference_event"
            "(event_id, athlete_id, seq, server_ts, action, capability, slot_key, "
            " from_exercise, to_exercise, payload, reason, source, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (eid, athlete_id, seq, now, action, capability, slot_key,
             from_exercise, to_exercise, json.dumps(payload or {}, separators=(",", ":")),
             reason, source, now),
        )
        return eid

    def events(self, athlete_id: str) -> list:
        return list(self.conn.execute(
            "SELECT * FROM preference_event WHERE athlete_id=? ORDER BY seq ASC",
            (athlete_id,),
        ))

    def projection(self, athlete_id: str) -> dict:
        return project_preferences(self.events(athlete_id))


# ----------------------------- state (sole writer) -----------------------------

class StateRepository:
    """The ONLY component permitted to write athlete/capability state."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    # athlete identity (written once at onboarding)
    def create_athlete(self, st: AthleteState) -> None:
        self.conn.execute(
            "INSERT INTO athlete(id, sex, age, experience, bodyweight_kg, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (st.athlete_id, st.sex, st.age, st.experience, st.bodyweight_kg, now_iso()),
        )
        self.conn.execute(
            "INSERT INTO athlete_state"
            "(athlete_id, workout_count, fatigue_systemic, last_workout_at_week, "
            " updated_at) VALUES (?,0,?,?,?)",
            (st.athlete_id, st.fatigue_systemic, st.last_workout_at_week, now_iso()),
        )
        for cap in st.capabilities.values():
            self.conn.execute(
                "INSERT INTO capability_state"
                "(athlete_id, capability, score, confidence, sum_w, "
                " last_trained_at_week, fatigue, var_w, var_ws, var_ws2, "
                " last_recommended_weight, last_decision, consecutive_positive, "
                " consecutive_negative, last_decision_week, updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (st.athlete_id, cap.capability, cap.score, cap.confidence,
                 cap.sum_w, cap.last_trained_at_week, cap.fatigue,
                 cap.var_w, cap.var_ws, cap.var_ws2,
                 cap.last_recommended_weight, cap.last_decision,
                 cap.consecutive_positive, cap.consecutive_negative,
                 cap.last_decision_week, now_iso()),
            )
        # Sprint 3B-1: seed the StrategyState row from the SINGLE-SOURCE factory (the
        # same one default-on-absence uses), so a seeded athlete and a migrated row-less
        # athlete are provably identical (MR3). No PreferenceState rows are seeded — an
        # absent family reads as the default 50 (ES-009 §6).
        strat = st.strategy or default_strategy_state(st.athlete_id)
        self.write_strategy_state(st.athlete_id, strat)

    def get_capability_state(self, athlete_id: str, capability: str) -> CapabilityState:
        row = self.conn.execute(
            "SELECT * FROM capability_state WHERE athlete_id=? AND capability=?",
            (athlete_id, capability),
        ).fetchone()
        if row is None:
            raise KeyError((athlete_id, capability))
        return self._row_to_cap(row)

    @staticmethod
    def _row_to_cap(row) -> CapabilityState:
        # Sprint 2 columns must be carried back into state (else fatigue/variance
        # would reset to defaults on every read, silently disabling persistence).
        # Sprint 3A (MR2): the decision-memory / streak columns carry the SAME risk —
        # drop one here and the stability guard silently never accumulates. All three
        # sites (create_athlete, write_capability_state, _row_to_cap) stay in lockstep;
        # test_decision_memory_round_trips guards against a silent omission.
        return CapabilityState(
            capability=row["capability"], score=row["score"],
            confidence=row["confidence"], sum_w=row["sum_w"],
            last_trained_at_week=row["last_trained_at_week"],
            fatigue=row["fatigue"], var_w=row["var_w"],
            var_ws=row["var_ws"], var_ws2=row["var_ws2"],
            last_recommended_weight=row["last_recommended_weight"],
            last_decision=row["last_decision"],
            consecutive_positive=row["consecutive_positive"],
            consecutive_negative=row["consecutive_negative"],
            last_decision_week=row["last_decision_week"],
        )

    def load_athlete_state(self, athlete_id: str) -> AthleteState:
        a = self.conn.execute(
            "SELECT * FROM athlete WHERE id=?", (athlete_id,)
        ).fetchone()
        if a is None:
            raise KeyError(athlete_id)
        ast = self.conn.execute(
            "SELECT * FROM athlete_state WHERE athlete_id=?", (athlete_id,)
        ).fetchone()
        caps = {}
        for row in self.conn.execute(
            "SELECT * FROM capability_state WHERE athlete_id=?", (athlete_id,)
        ):
            caps[row["capability"]] = self._row_to_cap(row)
        return AthleteState(
            athlete_id=athlete_id, sex=a["sex"], age=a["age"],
            experience=a["experience"], capabilities=caps,
            bodyweight_kg=a["bodyweight_kg"],
            fatigue_systemic=(ast["fatigue_systemic"] if ast else 0.0),
            last_workout_at_week=(ast["last_workout_at_week"] if ast else None),
            # Sprint 3B-1: strategy (default-on-absence) + preference projections.
            strategy=self.get_strategy_state(athlete_id),
            preferences=self.get_preference_states(athlete_id),
            # Program Ownership Contract: athlete-owned exercise pins (capability->exercise) and
            # exercise order, projected from the append-only preference_event log. Composition
            # honors these with priority over the model (including during calibration).
            pinned_exercises=self._preference_projection(athlete_id)["pins"],
            exercise_order=self._preference_projection(athlete_id)["exercise_order"],
        )

    def _preference_projection(self, athlete_id: str) -> dict:
        """The athlete-owned preference projection over the append-only log. Guarded so a pre-015
        database without the log reads as empty (no athlete-owned structure) rather than erroring."""
        has_log = self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='preference_event'"
        ).fetchone()
        if has_log is None:
            return {"pins": {}, "substitutes": {}, "backups": {}, "exercise_order": [], "workout_order": []}
        rows = self.conn.execute(
            "SELECT * FROM preference_event WHERE athlete_id=? ORDER BY seq ASC", (athlete_id,)
        )
        return project_preferences(rows)

    def get_pinned_exercises(self, athlete_id: str) -> dict[str, str]:
        """Current athlete-pinned exercises (capability->exercise_id), projected from the log."""
        return self._preference_projection(athlete_id)["pins"]

    def write_capability_state(self, athlete_id: str, cap: CapabilityState) -> None:
        """Sole capability-state mutation path (fatigue + variance + Sprint 3A decision
        memory). All new CapabilityState fields MUST be written here (MR2 checklist)."""
        self.conn.execute(
            "UPDATE capability_state SET score=?, confidence=?, sum_w=?, "
            "last_trained_at_week=?, fatigue=?, var_w=?, var_ws=?, var_ws2=?, "
            "last_recommended_weight=?, last_decision=?, consecutive_positive=?, "
            "consecutive_negative=?, last_decision_week=?, "
            "updated_at=? WHERE athlete_id=? AND capability=?",
            (cap.score, cap.confidence, cap.sum_w, cap.last_trained_at_week,
             cap.fatigue, cap.var_w, cap.var_ws, cap.var_ws2,
             cap.last_recommended_weight, cap.last_decision,
             cap.consecutive_positive, cap.consecutive_negative,
             cap.last_decision_week,
             now_iso(), athlete_id, cap.capability),
        )

    # --- Sprint 3B-1: StrategyState (sole writer) — three-site discipline ---
    def write_strategy_state(self, athlete_id: str, strat: StrategyState) -> None:
        """Upsert the athlete's strategy projection. Sole strategy writer."""
        self.conn.execute(
            "INSERT INTO strategy_state"
            "(athlete_id, weekly_frequency, weekly_volume, primary_focus, "
            " secondary_focus, updated_at) VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(athlete_id) DO UPDATE SET "
            "weekly_frequency=excluded.weekly_frequency, "
            "weekly_volume=excluded.weekly_volume, "
            "primary_focus=excluded.primary_focus, "
            "secondary_focus=excluded.secondary_focus, updated_at=excluded.updated_at",
            (athlete_id, strat.weekly_frequency, strat.weekly_volume,
             strat.primary_focus, strat.secondary_focus, now_iso()),
        )

    def get_strategy_state(self, athlete_id: str) -> StrategyState:
        """Read the strategy projection, or the SINGLE-SOURCE default if no row exists
        (default-on-absence; a migrated, row-less athlete is identical to a seeded one)."""
        row = self.conn.execute(
            "SELECT * FROM strategy_state WHERE athlete_id=?", (athlete_id,)
        ).fetchone()
        if row is None:
            return default_strategy_state(athlete_id)
        return StrategyState(
            athlete_id=athlete_id, weekly_frequency=row["weekly_frequency"],
            weekly_volume=row["weekly_volume"], primary_focus=row["primary_focus"],
            secondary_focus=row["secondary_focus"],
        )

    # --- Sprint 3B-1: PreferenceState (sole writer) ---
    def write_preference_state(self, athlete_id: str, pref: PreferenceState) -> None:
        """Upsert one (athlete, exercise_family) preference. Sole preference writer."""
        self.conn.execute(
            "INSERT INTO preference_state"
            "(athlete_id, exercise_family, preference_score, updated_at) "
            "VALUES (?,?,?,?) ON CONFLICT(athlete_id, exercise_family) DO UPDATE SET "
            "preference_score=excluded.preference_score, updated_at=excluded.updated_at",
            (athlete_id, pref.exercise_family, pref.preference_score, now_iso()),
        )

    def get_preference_states(self, athlete_id: str) -> dict[str, PreferenceState]:
        """All persisted preference rows for an athlete (absent families default to 50
        at read time via AthleteState.preference_score)."""
        out: dict[str, PreferenceState] = {}
        for row in self.conn.execute(
            "SELECT * FROM preference_state WHERE athlete_id=?", (athlete_id,)
        ):
            out[row["exercise_family"]] = PreferenceState(
                athlete_id=athlete_id, exercise_family=row["exercise_family"],
                preference_score=row["preference_score"],
            )
        return out

    # --- Sprint 2 (ES-011): systemic fatigue lives on athlete_state, written here ---
    def get_systemic_fatigue(self, athlete_id: str) -> tuple[float, float | None]:
        row = self.conn.execute(
            "SELECT fatigue_systemic, last_workout_at_week FROM athlete_state "
            "WHERE athlete_id=?", (athlete_id,),
        ).fetchone()
        if row is None:
            raise KeyError(athlete_id)
        return row["fatigue_systemic"], row["last_workout_at_week"]

    def write_systemic_fatigue(
        self, athlete_id: str, fatigue_systemic: float, last_workout_at_week: float
    ) -> None:
        self.conn.execute(
            "UPDATE athlete_state SET fatigue_systemic=?, last_workout_at_week=?, "
            "updated_at=? WHERE athlete_id=?",
            (fatigue_systemic, last_workout_at_week, now_iso(), athlete_id),
        )

    def increment_workout_count(self, athlete_id: str) -> None:
        self.conn.execute(
            "UPDATE athlete_state SET workout_count = workout_count + 1, "
            "updated_at=? WHERE athlete_id=?",
            (now_iso(), athlete_id),
        )


# ----------------------------- Weekly Program Container -----------------------------

class WeekPlanRepository:
    """Reader/writer for the week entity. A week groups N workout_session rows; it flips
    active → completed (never rewritten otherwise). The composition audit snapshot lives here."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def create_week(self, athlete_id: str, week_number: int, *, weekly_frequency: int,
                    weekly_volume: str | None, primary_focus: str | None,
                    secondary_focus: str | None, catalog_version: str | None,
                    model_version: str | None, capability_model_version: str | None) -> str:
        wid = _id("wk")
        self.conn.execute(
            "INSERT INTO week_plan"
            "(id, athlete_id, week_number, status, weekly_frequency, weekly_volume, "
            " primary_focus, secondary_focus, catalog_version, model_version, "
            " capability_model_version, created_at, completed_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (wid, athlete_id, week_number, "active", weekly_frequency, weekly_volume,
             primary_focus, secondary_focus, catalog_version, model_version,
             capability_model_version, now_iso(), None),
        )
        return wid

    def active_week(self, athlete_id: str):
        return self.conn.execute(
            "SELECT * FROM week_plan WHERE athlete_id=? AND status='active' "
            "ORDER BY week_number DESC LIMIT 1", (athlete_id,)
        ).fetchone()

    def latest_week(self, athlete_id: str):
        return self.conn.execute(
            "SELECT * FROM week_plan WHERE athlete_id=? ORDER BY week_number DESC LIMIT 1",
            (athlete_id,)
        ).fetchone()

    def next_week_number(self, athlete_id: str) -> int:
        row = self.conn.execute(
            "SELECT COALESCE(MAX(week_number), -1) AS m FROM week_plan WHERE athlete_id=?",
            (athlete_id,)
        ).fetchone()
        return int(row["m"]) + 1

    def sessions_for_week(self, week_plan_id: str) -> list:
        return list(self.conn.execute(
            "SELECT * FROM workout_session WHERE week_plan_id=? ORDER BY position_in_week",
            (week_plan_id,)
        ))

    def is_week_complete(self, week_plan_id: str) -> bool:
        row = self.conn.execute(
            "SELECT COUNT(*) AS n, "
            " SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS done "
            "FROM workout_session WHERE week_plan_id=?", (week_plan_id,)
        ).fetchone()
        return bool(row["n"]) and row["n"] == row["done"]

    def complete_week(self, week_plan_id: str) -> None:
        self.conn.execute(
            "UPDATE week_plan SET status='completed', completed_at=? WHERE id=? AND status='active'",
            (now_iso(), week_plan_id),
        )


# ----------------------------- history (append-only) -----------------------------

class SessionRepository:
    """Append-only writer/reader for the ES-001 execution hierarchy."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def create_session(self, athlete_id: str, week: float, strategy_id: str = "",
                       exploration_seed: int | None = None,
                       session_index: int | None = None,
                       weekly_frequency: int | None = None,
                       weekly_volume: str | None = None,
                       calibration_phase: bool | None = None,
                       primary_focus: str | None = None,
                       secondary_focus: str | None = None,
                       catalog_version: str | None = None,
                       model_version: str | None = None,
                       capability_model_version: str | None = None,
                       status: str = "active",
                       week_plan_id: str | None = None,
                       position_in_week: int | None = None,
                       name: str | None = None) -> str:
        """Open a session. The Sprint 3B-2 composition audit fields default to None, so the
        pre-3B-2 single-block path is unchanged; the composition driver passes them so the
        session reconstructs its template + exploration draw (ES-009 §9).

        Migration 014: primary/secondary_focus + catalog_version + model/capability versions
        complete the audit snapshot so the candidate-selection decision replays from stored
        data alone (default None ⇒ the pre-014 path is byte-identical)."""
        sid = _id("ws")
        calib = None if calibration_phase is None else (1 if calibration_phase else 0)
        self.conn.execute(
            "INSERT INTO workout_session"
            "(id, athlete_id, status, week, started_at, completed_at, "
            " exploration_seed, session_index, weekly_frequency, weekly_volume, "
            " calibration_phase, primary_focus, secondary_focus, catalog_version, "
            " model_version, capability_model_version, week_plan_id, position_in_week, name, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (sid, athlete_id, status, week, (now_iso() if status == "active" else None), None,
             exploration_seed, session_index, weekly_frequency, weekly_volume,
             calib, primary_focus, secondary_focus, catalog_version,
             model_version, capability_model_version, week_plan_id, position_in_week, name, now_iso()),
        )
        return sid

    def add_block(self, session_id: str, capability: str, exercise: str,
                  difficulty_factor: float, position: int, recommended_weight: float,
                  target_reps: int, target_sets: int, selection_reason: str = "") -> str:
        bid = _id("eb")
        self.conn.execute(
            "INSERT INTO exercise_block"
            "(id, workout_session_id, capability, exercise, difficulty_factor, "
            " position, recommended_weight, target_reps, target_sets, status, "
            " selection_reason) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (bid, session_id, capability, exercise, difficulty_factor, position,
             recommended_weight, target_reps, target_sets, "active", selection_reason),
        )
        return bid

    def add_set(self, block_id: str, set_number: int, recommended_weight: float,
                target_reps: int, actual_weight: float | None,
                actual_reps: int | None, status: str) -> str:
        sid = _id("set")
        self.conn.execute(
            "INSERT INTO set_record"
            "(id, exercise_block_id, set_number, recommended_weight, target_reps, "
            " actual_weight, actual_reps, status, completed_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (sid, block_id, set_number, recommended_weight, target_reps,
             actual_weight, actual_reps, status,
             now_iso() if status == "completed" else None),
        )
        return sid

    def set_block_status(self, block_id: str, status: str) -> None:
        self.conn.execute(
            "UPDATE exercise_block SET status=? WHERE id=?", (status, block_id)
        )

    def complete_session(self, session_id: str) -> None:
        self.conn.execute(
            "UPDATE workout_session SET status='completed', completed_at=? WHERE id=?",
            (now_iso(), session_id),
        )

    def abandon_session(self, session_id: str) -> None:
        self.conn.execute(
            "UPDATE workout_session SET status='abandoned', completed_at=? WHERE id=?",
            (now_iso(), session_id),
        )

    def blocks_for_session(self, session_id: str) -> list[sqlite3.Row]:
        return list(self.conn.execute(
            "SELECT * FROM exercise_block WHERE workout_session_id=? ORDER BY position",
            (session_id,),
        ))


class LearningRepository:
    """Append-only writer/reader for recommendation/observation/evidence/log."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def insert_recommendation(self, rec: Recommendation, block_id: str | None) -> str:
        rid = _id("rec")
        self.conn.execute(
            "INSERT INTO recommendation"
            "(id, athlete_id, exercise_block_id, capability, exercise, "
            " difficulty_factor, recommended_weight, target_reps, "
            " predicted_reps_to_failure, prediction_confidence, decision_reason, "
            " est_fatigue_systemic, est_fatigue_capability, "
            " decision_type, target_load, replaced_from_exercise, replace_reason, "
            " model_version, capability_model_version, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (rid, rec.athlete_id, block_id, rec.capability, rec.exercise,
             rec.difficulty_factor, rec.recommended_weight, rec.target_reps,
             rec.predicted_reps_to_failure, rec.prediction_confidence,
             rec.decision_reason, rec.est_fatigue_systemic, rec.est_fatigue_capability,
             rec.decision_type, rec.target_load,
             rec.replaced_from_exercise, rec.replace_reason,
             rec.model_version, rec.capability_model_version, now_iso()),
        )
        return rid

    def insert_observation(self, obs: Observation, session_id: str,
                           block_id: str, set_id: str,
                           override_category: str = "", override_target=None,
                           off_policy: int = 0, mu_decision=None, sigma_decision=None,
                           predicted_reps_prescribed=None, predicted_success=None,
                           capability_value=None) -> str:
        """Append one observation. Sprint 4: optional A9 override-target fields (default
        ''/None on the normal path), recorded at creation so history stays immutable.

        Migration 013: optional off-policy calibration sample (off_policy flag + decision-time
        μ/σ, the prescribed-load prediction + its success expectation, and the capability-space
        value). Default 0/None on the legacy/rested path so every Sprint 0-2 caller is
        byte-identical; only the production learning path populates them."""
        oid = _id("obs")
        self.conn.execute(
            "INSERT INTO observation"
            "(id, athlete_id, workout_session_id, exercise_block_id, set_id, "
            " capability, exercise, difficulty_factor, actual_weight, actual_reps, "
            " predicted_reps_to_failure, prediction_error, week, "
            " override_category, override_target, "
            " off_policy, mu_decision, sigma_decision, predicted_reps_prescribed, "
            " predicted_success, capability_value, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (oid, obs.athlete_id, session_id, block_id, set_id, obs.capability,
             obs.exercise, obs.difficulty_factor, obs.actual_weight, obs.actual_reps,
             obs.predicted_reps_to_failure, obs.prediction_error, obs.week,
             override_category, override_target,
             off_policy, mu_decision, sigma_decision, predicted_reps_prescribed,
             predicted_success, capability_value, now_iso()),
        )
        return oid

    def insert_shadow_recommendation(
        self, recommendation_id: str | None, athlete_id: str, capability: str,
        exercise: str, shadow_weight: float, shadow_predicted_rtf: float,
        model_predicted_rtf: float, actual_reps: int, week: float,
    ) -> str:
        """Append one A8 shadow-baseline paired-comparison row (ES-012 F.1). Written only by
        the Phase 0 harness / live instrumentation; the shadow is a fixed, non-learning policy.
        Reoriented (DX-12/DX-14): these rows feed a DIRECTIONAL model-quality diagnostic (the
        no-learning reps-prediction counterfactual), not the load-prediction success basis."""
        sid = _id("shadow")
        self.conn.execute(
            "INSERT INTO shadow_recommendation"
            "(id, recommendation_id, athlete_id, capability, exercise, shadow_weight, "
            " shadow_predicted_rtf, model_predicted_rtf, actual_reps, week, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (sid, recommendation_id, athlete_id, capability, exercise, shadow_weight,
             shadow_predicted_rtf, model_predicted_rtf, actual_reps, week, now_iso()),
        )
        return sid

    def insert_evidence(self, ev: Evidence, observation_id: str) -> str:
        eid = _id("ev")
        self.conn.execute(
            "INSERT INTO evidence"
            "(id, observation_id, athlete_id, capability, s_obs, quality, weight, "
            " source_week, model_version, capability_model_version, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (eid, observation_id, ev.athlete_id, ev.capability, ev.s_obs, ev.quality,
             ev.weight, ev.source_week, ev.model_version, ev.capability_model_version,
             now_iso()),
        )
        return eid

    def insert_state_update_log(self, athlete_id: str, capability: str,
                                evidence_id: str | None, prev: CapabilityState,
                                new: CapabilityState, reason: str,
                                model_version: str,
                                agreement: float = 1.0,
                                sigma2_recent: float = 0.0,
                                est_fatigue_capability: float = 0.0,
                                decision_type: str = "") -> str:
        lid = _id("sul")
        self.conn.execute(
            "INSERT INTO state_update_log"
            "(id, athlete_id, capability, evidence_id, prev_score, prev_confidence, "
            " prev_sum_w, new_score, new_confidence, new_sum_w, reason, "
            " agreement, sigma2_recent, est_fatigue_capability, decision_type, "
            " model_version, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (lid, athlete_id, capability, evidence_id, prev.score, prev.confidence,
             prev.sum_w, new.score, new.confidence, new.sum_w, reason,
             agreement, sigma2_recent, est_fatigue_capability, decision_type,
             model_version, now_iso()),
        )
        return lid
