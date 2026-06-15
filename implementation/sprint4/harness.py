"""
Phase 0 simulation harness (Build Plan module [2]). Sprint 4.

Drives the FROZEN model through the PRODUCTION path (Q4): it onboards a synthetic athlete,
then runs the real `SessionEngine` over simulated weeks, recording the inferred trajectory.
Because it imports the same `hush_model` + `SessionEngine` the live service uses, it tests
the real model, not a reimplementation (Build Plan guiding principle).

Non-circularity (R2): the synthetic athlete (sim/synthetic_athlete.py) generates reps from
its OWN true capability + its OWN independent fatigue/recovery constants — never the model's
kappa/tau. The test is whether the model, using its own provisional parameters, recovers a
true score it was never given.

Two clocks advance together (HD3): each session advances `week` by 1/sessions_per_week AND
calls `athlete.advance_week(1/sessions_per_week)`, so model-fatigue (week deltas) and the
athlete's true fatigue/gain stay synchronized.

Determinism (R4/HD4): the per-session exploration seed is a pure function of
(athlete_id, session_index); two identical runs produce identical trajectories.

CONCEPTUAL LOCATION: sim/harness.py (harness package).
"""
from __future__ import annotations
from dataclasses import dataclass, field
import zlib

from hush_model.persistence.db import Database
from hush_model.persistence.service import HushService
from hush_model.persistence.session import SessionEngine
from hush_model.persistence.repositories import StateRepository, LearningRepository
from hush_model.volume import clamp_frequency
from hush_model.domain import StrategyState
from .shadow import ShadowPolicy


@dataclass
class Sample:
    week: float
    session_index: int
    score: dict[str, float]
    confidence: dict[str, float]
    fatigue: dict[str, float]
    load: dict[str, float]          # primary-slot recommended load per capability


@dataclass
class Trajectory:
    athlete_id: str
    true_score: dict[str, float]
    samples: list[Sample] = field(default_factory=list)

    def series(self, capability: str, attr: str = "score") -> list[float]:
        return [getattr(s, attr).get(capability) for s in self.samples
                if getattr(s, attr).get(capability) is not None]

    def final_score(self, capability: str) -> float:
        xs = self.series(capability, "score")
        return xs[-1] if xs else float("nan")


def session_seed(athlete_id: str, session_index: int) -> int:
    """Deterministic per-session exploration seed (HD4): pure in its inputs, varied across
    sessions, reproducible across runs. Persisted on the session row by SessionEngine (R4)."""
    return zlib.crc32(f"{athlete_id}:{session_index}".encode()) & 0x7FFFFFFF


class Harness:
    """Owns an in-memory DB + the production SessionEngine for one synthetic-athlete run."""

    def __init__(self):
        self.db = Database(":memory:")
        self.service = HushService(self.db)
        self.engine = SessionEngine(self.db)

    def close(self):
        self.db.close()

    def setup(self, synth, strategy: StrategyState | None = None,
              confidence: float | None = None, sum_w: float | None = None) -> None:
        """Onboard the synthetic athlete; optionally set a strategy and force a confidence
        level (to reach steady state without simulating the whole calibration ramp)."""
        self.service.onboard(synth.athlete_id, synth.sex, synth.age, synth.experience)
        with self.db.transaction() as conn:
            sr = StateRepository(conn)
            if strategy is not None:
                sr.write_strategy_state(synth.athlete_id, strategy)
            if confidence is not None:
                conn.execute(
                    "UPDATE capability_state SET confidence=?, sum_w=? WHERE athlete_id=?",
                    (confidence, sum_w if sum_w is not None else 40.0, synth.athlete_id),
                )

    def run(self, synth, weeks: int, target_reps: int = 8,
            record_shadow: bool = False) -> Trajectory:
        """Run `weeks` simulated weeks of composed sessions; record the inferred trajectory."""
        with self.db.transaction() as conn:
            freq = StateRepository(conn).get_strategy_state(synth.athlete_id).weekly_frequency
        spw = clamp_frequency(freq)
        dt = 1.0 / spw
        traj = Trajectory(athlete_id=synth.athlete_id, true_score=dict(synth.true_score))
        shadow = ShadowPolicy() if record_shadow else None

        session_index = 0
        week = 1.0
        for _w in range(weeks):
            for _s in range(spw):
                seed = session_seed(synth.athlete_id, session_index)
                sid, plan, _ = self.engine.run_session(
                    synth.athlete_id, week=week, session_index=session_index,
                    seed=seed, perform=synth.perform, target_reps=target_reps,
                )
                if record_shadow:
                    self._record_shadow(synth.athlete_id, sid, shadow, target_reps, week)
                traj.samples.append(self._sample(synth.athlete_id, sid, week, session_index))
                synth.advance_week(dt)
                week += dt
                session_index += 1
        return traj

    # ----------------------------- recording -----------------------------

    def _sample(self, athlete_id: str, session_id: str, week: float,
                session_index: int) -> Sample:
        conn = self.db.conn
        score, conf, fat, load = {}, {}, {}, {}
        for row in conn.execute(
            "SELECT capability, score, confidence, fatigue FROM capability_state "
            "WHERE athlete_id=?", (athlete_id,)):
            score[row["capability"]] = row["score"]
            conf[row["capability"]] = row["confidence"]
            fat[row["capability"]] = row["fatigue"]
        # primary-slot (lowest position) recommended load per capability in this session
        for row in conn.execute(
            "SELECT capability, recommended_weight FROM exercise_block "
            "WHERE workout_session_id=? ORDER BY position", (session_id,)):
            load.setdefault(row["capability"], row["recommended_weight"])
        return Sample(week, session_index, score, conf, fat, load)

    def _record_shadow(self, athlete_id: str, session_id: str, shadow: ShadowPolicy,
                       target_reps: int, week: float) -> None:
        conn = self.db.conn
        with self.db.transaction() as c:
            lr = LearningRepository(c)
            for b in conn.execute(
                "SELECT * FROM exercise_block WHERE workout_session_id=? ORDER BY position",
                (session_id,)):
                key = (athlete_id, b["exercise"])
                shadow_weight = shadow.recommend(key, b["recommended_weight"])
                shadow_pred = shadow.predict_rtf(key, target_reps)
                # representative observation for the block (last set)
                obs = conn.execute(
                    "SELECT predicted_reps_to_failure, actual_reps FROM observation "
                    "WHERE exercise_block_id=? ORDER BY created_at DESC LIMIT 1", (b["id"],)
                ).fetchone()
                rec = conn.execute(
                    "SELECT id FROM recommendation WHERE exercise_block_id=? LIMIT 1",
                    (b["id"],)).fetchone()
                if obs is None:
                    continue
                lr.insert_shadow_recommendation(
                    rec["id"] if rec else None, athlete_id, b["capability"], b["exercise"],
                    shadow_weight, shadow_pred, obs["predicted_reps_to_failure"],
                    int(obs["actual_reps"]), week,
                )
                shadow.record(key, target_reps, int(obs["actual_reps"]))
