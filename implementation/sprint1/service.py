"""
Service layer (Sprint 1).

Thin orchestration over repositories + pipeline:
  - onboard: seed an athlete (ES-008 v2) and persist initial state
  - session lifecycle: start, add block, complete/abandon (ES-001 rules)
  - audit: reconstruct the full chain for any observation
            (recommendation -> observation -> evidence -> state update)

No new model logic lives here; it composes Sprint 0 functions and Sprint 1
repositories.
"""
from __future__ import annotations

from .db import Database, now_iso
from .repositories import (
    StateRepository, SessionRepository, LearningRepository,
    PreferenceEventRepository, PREF_EXERCISE_REPLACED, PREF_EXERCISE_RESTORED,
    PREF_SUBSTITUTE_OFFERED, PREF_SUBSTITUTE_SELECTED, PREF_SUBSTITUTE_IGNORED,
)
from .pipeline import LearningPipeline
from ..seeding import seed_athlete


class HushService:
    def __init__(self, db: Database):
        self.db = db
        self.pipeline = LearningPipeline(db)

    # ---------- onboarding ----------

    def onboard(self, athlete_id: str, sex: str, age: int, experience: str,
                bodyweight_kg: float | None = None, goal: str | None = None) -> None:
        st = seed_athlete(athlete_id, sex, age, experience, bodyweight_kg, goal)
        with self.db.transaction() as conn:
            StateRepository(conn).create_athlete(st)

    # ---------- session lifecycle (ES-001) ----------

    def start_session(self, athlete_id: str, week: float) -> str:
        with self.db.transaction() as conn:
            return SessionRepository(conn).create_session(athlete_id, week)

    def add_block(self, session_id: str, athlete_id: str, capability: str,
                  exercise: str, difficulty_factor: float, position: int,
                  target_reps: int, target_sets: int) -> str:
        """Create a block, seeding its recommended_weight from current state."""
        from ..recommendation import recommend
        with self.db.transaction() as conn:
            cap = StateRepository(conn).get_capability_state(athlete_id, capability)
            rec = recommend(cap, exercise, difficulty_factor, target_reps)
            return SessionRepository(conn).add_block(
                session_id, capability, exercise, difficulty_factor, position,
                rec.recommended_weight, target_reps, target_sets,
            )

    def complete_session(self, session_id: str, athlete_id: str) -> None:
        with self.db.transaction() as conn:
            sess = SessionRepository(conn)
            # ES-001 session completion rule: all blocks completed or skipped
            blocks = sess.blocks_for_session(session_id)
            for b in blocks:
                if b["status"] not in ("completed", "skipped"):
                    sess.set_block_status(b["id"], "completed")
            sess.complete_session(session_id)
            StateRepository(conn).increment_workout_count(athlete_id)

    # ---------- L2 REPLACE_EXERCISE (ES-006 / ES-009 §6) — Sprint 3B-1 ----------

    def replace_exercise(
        self,
        athlete_id: str,
        capability: str,
        current_exercise_id: str,
        reason: str,
        target_reps: int = 8,
        block_id: str | None = None,
        to_exercise: str | None = None,
        source: str = "in_session",
        event_id: str | None = None,
    ) -> dict:
        """Live L2 REPLACE (Program Ownership Contract).

        If the athlete names an EXACT target (`to_exercise`), that choice is HONORED VERBATIM —
        it is athlete-owned. The only constraint is that it must train the slot's capability and
        be class-matched (the capability is fixed; ES-008 v2 / Principle #53). With no explicit
        target, the model falls back to the most-PREFERRED exercise in the replacement group
        (preference-driven, NEVER performance-driven — ES-006).

        The chosen exercise becomes the slot's PERSISTENT preference: it is PINNED via an
        append-only `preference_event` (the immutable source of truth) AND the derived
        `preference_state` cache is sticky-set (DX-10). So the choice is durable across refetches,
        reinstalls, device changes, and future week regenerations, and the preference timeline is
        fully reconstructable. Emits a recommendation for the chosen exercise (audit: replaced_from
        + reason). This is the primitive ES-009 Stage 3 reuses; it never enters the load tree."""
        from ..catalog import CATALOG
        from ..preference import apply_sticky, demote
        from ..recommendation import recommend
        from ..domain import Recommendation, PreferenceState
        from ..decision import REPLACE_EXERCISE, REASON_REPLACE_PREFERENCE

        with self.db.transaction() as conn:
            state_repo = StateRepository(conn)
            learn_repo = LearningRepository(conn)
            pref_events = PreferenceEventRepository(conn)
            ath = state_repo.load_athlete_state(athlete_id)
            cap = ath.capabilities[capability]
            current = CATALOG.get(current_exercise_id)
            if current.primary_capability != capability:
                raise ValueError(
                    f"{current_exercise_id!r} does not train {capability!r}"
                )

            valid = {e.exercise_id for e in CATALOG.for_capability(capability)}
            # the athlete's preferred substitute for the exercise being replaced (if any)
            sub = pref_events.projection(athlete_id)["substitutes"].get(current_exercise_id)
            sub_valid = sub if (sub in valid) else None
            if to_exercise is not None:
                # Athlete-owned EXACT choice — honored verbatim (capability + class validated).
                if to_exercise not in valid:
                    raise ValueError(
                        f"{to_exercise!r} is not a class-matched exercise for {capability!r}"
                    )
                chosen = CATALOG.get(to_exercise)
            elif sub_valid is not None:
                # Program Ownership Contract: when an alternative is needed, the athlete's PREFERRED
                # SUBSTITUTE is selected BEFORE any model-generated alternative.
                chosen = CATALOG.get(sub_valid)
            else:
                # preference-driven selection over the replacement group (class-constrained)
                chosen = CATALOG.replace(current_exercise_id, ath.preference_score)

            # Usage capture (ownership-learning dataset): the substitute was offered, then selected
            # or ignored (the athlete chose something else). Append-only; never alters model state.
            if sub_valid is not None:
                pref_events.append(athlete_id, PREF_SUBSTITUTE_OFFERED, capability=capability,
                                   from_exercise=current_exercise_id, to_exercise=sub_valid,
                                   reason=reason, source=source)
                pref_events.append(
                    athlete_id,
                    PREF_SUBSTITUTE_SELECTED if chosen.exercise_id == sub_valid else PREF_SUBSTITUTE_IGNORED,
                    capability=capability, from_exercise=current_exercise_id,
                    to_exercise=sub_valid, reason=reason, source=source)

            base = recommend(cap, chosen.exercise_id, chosen.difficulty_factor, target_reps)
            rec = Recommendation(
                athlete_id=athlete_id, capability=cap.capability,
                exercise=chosen.exercise_id, difficulty_factor=chosen.difficulty_factor,
                recommended_weight=base.recommended_weight, target_reps=base.target_reps,
                predicted_reps_to_failure=base.predicted_reps_to_failure,
                prediction_confidence=base.prediction_confidence,
                decision_reason=REASON_REPLACE_PREFERENCE, decision_type=REPLACE_EXERCISE,
                target_load=base.target_load,
                replaced_from_exercise=current_exercise_id, replace_reason=reason,
            )
            rec_id = learn_repo.insert_recommendation(rec, block_id)

            # DX-10: an accepted replacement becomes the slot's PERSISTENT preference
            # (Product Spec §6). Pin the chosen family to the sticky band; demote the
            # displaced family — so the chosen exercise is the deterministic, durable argmax
            # going forward (most-recent-replacement-wins). Only when the choice actually
            # changed the family (chosen != current) — re-selecting the same exercise must
            # not write (no ratchet, SM3); the sticky-set is itself idempotent.
            if chosen.exercise_family != current.exercise_family:
                state_repo.write_preference_state(athlete_id, PreferenceState(
                    athlete_id, chosen.exercise_family, apply_sticky()))
                state_repo.write_preference_state(athlete_id, PreferenceState(
                    athlete_id, current.exercise_family, demote()))

            # Program Ownership Contract: record the choice as an IMMUTABLE preference event so
            # it pins the exercise for the capability (projection wins over the model, incl. during
            # calibration), is durable across refetches/reinstalls/regenerations, and the timeline
            # is reconstructable. Idempotent on event_id; only when the exercise actually changed.
            if chosen.exercise_id != current_exercise_id:
                pref_events.append(
                    athlete_id, PREF_EXERCISE_REPLACED, capability=capability,
                    from_exercise=current_exercise_id, to_exercise=chosen.exercise_id,
                    reason=reason, source=source, event_id=event_id,
                )

            return {
                "recommendation_id": rec_id, "capability": capability,
                "from_exercise": current_exercise_id, "to_exercise": chosen.exercise_id,
                "reason": reason, "decision_type": REPLACE_EXERCISE,
            }

    # ---------- Program Ownership Contract: athlete-owned preferences ----------

    # NOTE (V1 ratified 2026-06-15): equipment-occupied is a runtime MOVE-DOWN reorder
    # (lifecycle.resolve_unavailable), NOT a backup/substitute swap. Substitute + backup
    # DEFINITIONS remain capturable in the data model (events/projection/dataset) for future use,
    # but no runtime backup-resolution is wired in V1.

    def pin_exercise(self, athlete_id: str, capability: str, to_exercise: str,
                     from_exercise: str | None = None, reason: str = "",
                     source: str = "program_detail", event_id: str | None = None) -> dict:
        """Pin the athlete's EXACT exercise choice for a capability WITHOUT an in-session swap
        (no recommendation emitted — this is a program-customization declaration). Records the
        immutable preference_event (the pin the projection serves to composition with priority)
        AND updates the sticky preference_state cache. The choice is durable across refetches /
        reinstalls / device changes / week regenerations, and the timeline is reconstructable."""
        from ..catalog import CATALOG
        from ..preference import apply_sticky, demote
        from ..domain import PreferenceState

        valid = {e.exercise_id for e in CATALOG.for_capability(capability)}
        if to_exercise not in valid:
            raise ValueError(f"{to_exercise!r} is not a class-matched exercise for {capability!r}")
        chosen = CATALOG.get(to_exercise)
        with self.db.transaction() as conn:
            state_repo = StateRepository(conn)
            pref_events = PreferenceEventRepository(conn)
            state_repo.write_preference_state(
                athlete_id, PreferenceState(athlete_id, chosen.exercise_family, apply_sticky()))
            if from_exercise:
                try:
                    displaced = CATALOG.get(from_exercise)
                    if displaced.exercise_family != chosen.exercise_family:
                        state_repo.write_preference_state(
                            athlete_id, PreferenceState(athlete_id, displaced.exercise_family, demote()))
                except KeyError:
                    pass
            pref_events.append(
                athlete_id, PREF_EXERCISE_REPLACED, capability=capability,
                from_exercise=from_exercise, to_exercise=to_exercise,
                reason=reason, source=source, event_id=event_id)
        return {"capability": capability, "pinned": to_exercise, "from_exercise": from_exercise}

    def restore_exercise(self, athlete_id: str, capability: str, reason: str = "",
                         source: str = "program_detail", event_id: str | None = None) -> dict:
        """Clear the athlete's pin for a capability → the model selects again. Append-only event;
        also resets the previously-pinned exercise's sticky cache so the fallback does not silently
        re-pick it (the EVENT remains the immutable record of the restore)."""
        from ..catalog import CATALOG
        from ..domain import PreferenceState
        from ..preference import demote
        with self.db.transaction() as conn:
            state_repo = StateRepository(conn)
            pref_events = PreferenceEventRepository(conn)
            current_pin = state_repo.get_pinned_exercises(athlete_id).get(capability)
            if current_pin:
                try:
                    state_repo.write_preference_state(
                        athlete_id, PreferenceState(athlete_id, CATALOG.get(current_pin).exercise_family, demote()))
                except KeyError:
                    pass
            pref_events.append(
                athlete_id, PREF_EXERCISE_RESTORED, capability=capability,
                from_exercise=current_pin, reason=reason, source=source, event_id=event_id)
        return {"capability": capability, "restored": True}

    def record_preference_action(self, athlete_id: str, action: str, *, event_id: str | None = None,
                                 **fields) -> str:
        """Append one substitute / backup / reorder preference action (athlete-owned data; never
        alters model state). Idempotent on event_id."""
        with self.db.transaction() as conn:
            return PreferenceEventRepository(conn).append(
                athlete_id, action, event_id=event_id, **fields)

    def preferences_projection(self, athlete_id: str) -> dict:
        """The athlete's CURRENT owned program structure (pins, substitutes, backups, orders),
        projected from the append-only log — exactly reconstructable from the events alone."""
        return PreferenceEventRepository(self.db.conn).projection(athlete_id)

    def preference_events(self, athlete_id: str) -> list[dict]:
        """The full immutable preference timeline (append-only, ascending seq)."""
        return [dict(r) for r in PreferenceEventRepository(self.db.conn).events(athlete_id)]

    def preference_dataset(self, athlete_id: str) -> list[dict]:
        """The preference-LEARNING dataset: one row per model-generated exercise recommendation,
        joined to the athlete's response + subsequent outcome — purely derived from persisted rows
        (recommendation ⋈ preference_event ⋈ observation). Answers: which generated exercises are
        accepted vs replaced, the common replacements, time-to-change, and the subsequent adherence
        / performance per choice. No preference decision is lost (the raw events + observations
        remain queryable for deeper study)."""
        conn = self.db.conn
        proj = PreferenceEventRepository(conn).projection(athlete_id)
        active_pins = proj["pins"]
        # the athlete's exercise-replace events (capability -> list of (ts, from, to))
        replaces = [
            r for r in conn.execute(
                "SELECT server_ts, capability, from_exercise, to_exercise FROM preference_event "
                "WHERE athlete_id=? AND action=? ORDER BY seq ASC",
                (athlete_id, PREF_EXERCISE_REPLACED),
            )
        ]
        rows = conn.execute(
            "SELECT r.id, r.capability, r.exercise, r.created_at, r.decision_type, "
            "       eb.selection_reason, eb.id AS block_id "
            "FROM recommendation r LEFT JOIN exercise_block eb ON eb.id = r.exercise_block_id "
            "WHERE r.athlete_id=? ORDER BY r.created_at ASC",
            (athlete_id,),
        ).fetchall()
        out: list[dict] = []
        for r in rows:
            # Evaluate MODEL suggestions only. A REPLACE_EXERCISE recommendation IS the athlete's
            # chosen replacement (not a model suggestion), so it is not itself an accept/replace
            # datapoint — skip it (the model suggestion it displaced is already a row).
            if r["decision_type"] == "REPLACE_EXERCISE":
                continue
            # the first replace of THIS exercise for THIS capability at/after the recommendation
            change = next(
                (rp for rp in replaces
                 if rp["capability"] == r["capability"]
                 and (rp["from_exercise"] == r["exercise"] or rp["from_exercise"] is None)
                 and rp["server_ts"] >= r["created_at"]),
                None,
            )
            obs = conn.execute(
                "SELECT COUNT(*) AS n, AVG(ABS(prediction_error)) AS mae FROM observation "
                "WHERE exercise_block_id=?", (r["block_id"],),
            ).fetchone()
            if change is not None:
                response = "replaced"
            elif obs["n"]:
                response = "accepted"
            else:
                response = "ignored"
            # subsequent adherence/performance for this capability after the recommendation
            subs = conn.execute(
                "SELECT COUNT(*) AS n, AVG(ABS(prediction_error)) AS mae FROM observation "
                "WHERE athlete_id=? AND capability=? AND created_at > ?",
                (athlete_id, r["capability"], r["created_at"]),
            ).fetchone()
            replacement = change["to_exercise"] if change else None
            out.append({
                "recommendation_id": r["id"],
                "capability": r["capability"],
                "generated_exercise": r["exercise"],
                "selection_reason": r["selection_reason"],
                "athlete_response": response,
                "replacement_exercise": replacement,
                "time_to_change": (change["server_ts"] if change else None),
                # retained long term? — the replacement is still the capability's active pin
                "replacement_still_active": (replacement is not None and active_pins.get(r["capability"]) == replacement),
                # reverted? — replaced once, but no longer the active pin
                "reverted": (replacement is not None and active_pins.get(r["capability"]) != replacement),
                "this_block_observations": obs["n"],
                "this_block_mean_abs_prediction_error": obs["mae"],
                "subsequent_observations": subs["n"],
                "subsequent_mean_abs_prediction_error": subs["mae"],
            })
        return out

    def preference_usage(self, athlete_id: str) -> dict:
        """Usage aggregates for the ownership-learning dataset: how often each preference action
        occurred (defined/offered/selected/ignored/used/bypassed/reordered/restored) and the
        currently-active owned structure — all from the append-only log, joinable to the rest."""
        conn = self.db.conn
        counts: dict[str, int] = {}
        for r in conn.execute(
            "SELECT action, COUNT(*) AS n FROM preference_event WHERE athlete_id=? GROUP BY action",
            (athlete_id,),
        ):
            counts[r["action"]] = r["n"]
        proj = PreferenceEventRepository(conn).projection(athlete_id)
        return {
            "action_counts": counts,
            "active_pins": proj["pins"],
            "active_substitutes": proj["substitutes"],
            "active_backups": proj["backups"],
            "exercise_order": proj["exercise_order"],
            "workout_order": proj["workout_order"],
        }

    # ---------- audit (System Architecture: every rec reconstructable) ----------

    def reconstruct_observation(self, observation_id: str) -> dict:
        """Walk observation -> its evidence -> the state updates they drove."""
        conn = self.db.conn
        obs = conn.execute(
            "SELECT * FROM observation WHERE id=?", (observation_id,)
        ).fetchone()
        if obs is None:
            raise KeyError(observation_id)
        evidence = list(conn.execute(
            "SELECT * FROM evidence WHERE observation_id=?", (observation_id,)
        ))
        updates = []
        for ev in evidence:
            for u in conn.execute(
                "SELECT * FROM state_update_log WHERE evidence_id=?", (ev["id"],)
            ):
                updates.append(dict(u))
        return {
            "observation": dict(obs),
            "evidence": [dict(e) for e in evidence],
            "state_updates": updates,
        }

    def reconstruct_session(self, session_id: str) -> dict:
        """Sprint 4: the COMPLETE chain for a composed session (audit-completeness instrument).

        Returns the ES-009 composition snapshot (template/priority/band/seed/trim inputs), each
        ordered block, its recommendation, its shadow-baseline row (A8), and the observations
        (with any A9 override fields). Every block traces to (composition audit + recommendation
        + shadow + observation); a session that cannot be reconstructed is invalid (ES-009 §9)."""
        conn = self.db.conn
        sess = conn.execute(
            "SELECT * FROM workout_session WHERE id=?", (session_id,)
        ).fetchone()
        if sess is None:
            raise KeyError(session_id)
        blocks = []
        for b in conn.execute(
            "SELECT * FROM exercise_block WHERE workout_session_id=? ORDER BY position",
            (session_id,),
        ):
            recs = [dict(r) for r in conn.execute(
                "SELECT * FROM recommendation WHERE exercise_block_id=?", (b["id"],))]
            obs = [dict(o) for o in conn.execute(
                "SELECT * FROM observation WHERE exercise_block_id=?", (b["id"],))]
            shadows = [dict(s) for s in conn.execute(
                "SELECT * FROM shadow_recommendation WHERE recommendation_id IN "
                "(SELECT id FROM recommendation WHERE exercise_block_id=?)", (b["id"],))]
            blocks.append({
                "block": dict(b), "recommendations": recs,
                "shadow": shadows, "observations": obs,
            })
        return {"session": dict(sess), "blocks": blocks}

    def validation_export(self) -> dict:
        """Operator data-export (BB-32; also the metrics half of BB-23): trial health + the trial's
        A7/A8/A9 validation evidence as one analyzable aggregate. STRICTLY READ-ONLY.

        - A8 (shadow baseline): within-set paired comparison of the model's reps prediction vs the
          fixed non-learning counterfactual's, both scored at the SAME actual reps (DX-12/DX-14:
          reps-prediction is a DIRECTIONAL diagnostic, not a gated success metric).
        - A9 (override log): the BB-7 override-target captures (category/target), with the override rate.
        - A7 (seed safety): FIRST-session prescribed loads + realized first-rep shortfall, segmented by
          cohort (sex × experience). This is the *data* behind the week-1 seed-safety gate; its pass/fail
          THRESHOLDS are OD-8 and are deliberately NOT applied here (export, not verdict).
        """
        conn = self.db.conn
        one = lambda q: conn.execute(q).fetchone()[0]
        health = {
            "athletes": one("SELECT COUNT(*) FROM athlete"),
            "sessions": one("SELECT COUNT(*) FROM workout_session"),
            "sessions_completed": one("SELECT COUNT(*) FROM workout_session WHERE status='completed'"),
            "observations": one("SELECT COUNT(*) FROM observation"),
        }

        # ---- A8 shadow paired comparison (directional) ----
        a8 = _summarize_shadow(conn.execute(
            "SELECT model_predicted_rtf, shadow_predicted_rtf, actual_reps FROM shadow_recommendation"
        ).fetchall())

        # ---- A9 override log ----
        a9 = _summarize_overrides(
            total_observations=health["observations"],
            rows=conn.execute(
                "SELECT override_category, capability, exercise, override_target, actual_weight, week "
                "FROM observation WHERE override_category != '' AND override_category IS NOT NULL"
            ).fetchall(),
        )

        # ---- A7 first-session loads by cohort ----
        a7 = self._first_session_by_cohort(conn)

        return {
            "generated_at": now_iso(),
            "trial_health": health,
            "a8_shadow_paired": a8,
            "a9_overrides": a9,
            "a7_first_session_by_cohort": a7,
        }

    @staticmethod
    def _first_session_ids(conn) -> dict:
        """Each athlete's FIRST session id, chosen deterministically by (session_index, created_at)."""
        first: dict[str, str] = {}
        for s in conn.execute(
            "SELECT id, athlete_id, session_index, created_at FROM workout_session "
            "ORDER BY athlete_id, "
            "CASE WHEN session_index IS NULL THEN 1 ELSE 0 END, session_index, created_at"
        ):
            first.setdefault(s["athlete_id"], s["id"])
        return first

    def a7_first_session_safety(self) -> dict:
        """A7 week-1 seed-safety metrics per cohort (sex×experience), the DATA the BB-11 gate rules on:
          - completion_rate       : fraction of the cohort's FIRST sessions with status 'completed'
          - first_rep_failure_rate: fraction of first-session sets with actual_reps == 0 (could not
                                     complete a single rep at the prescribed day-1 load — the
                                     catastrophic seed-safety signal)
        READ-ONLY. The pass/fail THRESHOLDS over these metrics are OD-8 (applied by `a7_gate`, not here)."""
        conn = self.db.conn
        athletes = {r["id"]: r for r in conn.execute("SELECT id, sex, experience FROM athlete")}
        first = self._first_session_ids(conn)
        agg: dict[str, dict] = {}
        for athlete_id, session_id in first.items():
            a = athletes.get(athlete_id)
            if a is None:
                continue
            key = f"{a['sex']}/{a['experience']}"
            c = agg.setdefault(key, {"n": 0, "completed": 0, "obs": 0, "first_rep_failures": 0})
            c["n"] += 1
            status = conn.execute(
                "SELECT status FROM workout_session WHERE id=?", (session_id,)).fetchone()
            if status is not None and status["status"] == "completed":
                c["completed"] += 1
            for o in conn.execute(
                "SELECT actual_reps FROM observation WHERE workout_session_id=?", (session_id,)):
                c["obs"] += 1
                if o["actual_reps"] == 0:
                    c["first_rep_failures"] += 1
        return {
            key: {
                "n": c["n"],
                "completion_rate": c["completed"] / c["n"] if c["n"] else 0.0,
                "first_rep_failure_rate": c["first_rep_failures"] / c["obs"] if c["obs"] else 0.0,
            }
            for key, c in agg.items()
        }

    # ---------- OD-2 right-to-erasure (logical deletion / anonymization) ----------

    def erase_athlete(self, athlete_id: str) -> dict:
        """Logically erase (anonymize) an athlete — OD-2, ratified 2026-06-12.

        Deletion in V1 is **anonymization, not destruction**: authentication data and the *precise*
        personal identifiers are removed, while the append-only audit/history is **retained in
        anonymized form** for operational/reconstruction/validation purposes. There is **no
        destructive audit-chain deletion** (the immutable history rows are untouched).

        Concretely, atomically:
          1. delete the athlete's `auth_token` rows         — authentication data removed (no login);
          2. delete the athlete's `idempotency_key` rows    — transient user-linked anti-replay records;
          3. NULL the precise identifiers on the `athlete` row (exact `age`, `bodyweight_kg`) and
             redact nothing the validation needs — the **coarse cohort labels `sex`/`experience`**
             are kept because A7 seed-safety validation is segmented by them and they are not, alone,
             a unique identifier; `created_at` stays as the retention basis;
          4. write an `erasure_record` tombstone (athlete_id, erased_at, method) — durable proof.

        The retained `athlete_id` is an opaque pseudonym; its link to the real person lives in the
        auth token (now deleted) and the external enrollment/consent record (deleted by Operations as
        the BB-33 complement — outside this DB). Idempotent: erasing an already-erased athlete is a
        no-op-shaped re-stamp. Returns a summary of what was removed."""
        with self.db.transaction() as conn:
            exists = conn.execute("SELECT 1 FROM athlete WHERE id=?", (athlete_id,)).fetchone()
            if exists is None:
                raise KeyError(athlete_id)
            tokens = conn.execute(
                "DELETE FROM auth_token WHERE athlete_id=?", (athlete_id,)).rowcount
            idem = conn.execute(
                "DELETE FROM idempotency_key WHERE athlete_id=?", (athlete_id,)).rowcount
            # anonymize precise identifiers; keep coarse cohort labels + created_at (retention basis)
            conn.execute(
                "UPDATE athlete SET age=0, bodyweight_kg=NULL WHERE id=?", (athlete_id,))
            erased_at = now_iso()
            conn.execute(
                "INSERT OR REPLACE INTO erasure_record(athlete_id, erased_at, method) VALUES (?,?,?)",
                (athlete_id, erased_at, "logical_anonymization"),
            )
        return {
            "athlete_id": athlete_id,
            "erased_at": erased_at,
            "method": "logical_anonymization",
            "tokens_removed": tokens,
            "idempotency_keys_removed": idem,
            "precise_identifiers_redacted": True,
            "audit_history_retained": True,
        }

    def is_erased(self, athlete_id: str) -> bool:
        return self.db.conn.execute(
            "SELECT 1 FROM erasure_record WHERE athlete_id=?", (athlete_id,)).fetchone() is not None

    @staticmethod
    def _first_session_by_cohort(conn) -> dict:
        """Per-cohort (sex×experience) aggregate of each athlete's FIRST session: prescribed loads per
        capability + realized first-rep shortfall (any set under target_reps = a too-heavy realization)."""
        athletes = {r["id"]: r for r in conn.execute(
            "SELECT id, sex, experience FROM athlete")}
        first_session = HushService._first_session_ids(conn)

        cohorts: dict[str, dict] = {}
        for athlete_id, session_id in first_session.items():
            a = athletes.get(athlete_id)
            if a is None:
                continue
            key = f"{a['sex']}/{a['experience']}"
            c = cohorts.setdefault(key, {"n_athletes": 0, "n_blocks": 0,
                                         "first_rep_shortfalls": 0, "per_capability": {}})
            c["n_athletes"] += 1
            for b in conn.execute(
                "SELECT id, capability, recommended_weight, target_reps FROM exercise_block "
                "WHERE workout_session_id=?", (session_id,)
            ):
                c["n_blocks"] += 1
                pc = c["per_capability"].setdefault(
                    b["capability"], {"n": 0, "sum_weight": 0.0, "max_weight": 0.0})
                pc["n"] += 1
                pc["sum_weight"] += b["recommended_weight"]
                pc["max_weight"] = max(pc["max_weight"], b["recommended_weight"])
                reps = conn.execute(
                    "SELECT MIN(actual_reps) FROM observation WHERE exercise_block_id=?", (b["id"],)
                ).fetchone()[0]
                if reps is not None and reps < b["target_reps"]:
                    c["first_rep_shortfalls"] += 1
        # finalize: means + shortfall fraction
        for c in cohorts.values():
            c["first_rep_shortfall_frac"] = (
                c["first_rep_shortfalls"] / c["n_blocks"] if c["n_blocks"] else 0.0)
            for pc in c["per_capability"].values():
                pc["mean_weight"] = pc["sum_weight"] / pc["n"] if pc["n"] else 0.0
                del pc["sum_weight"]
        return cohorts


# ----------------------------- pure A8/A9 summarizers (BB-32) -----------------------------
# Module-level + dependency-free so the aggregation is unit-testable without a DB.

def _summarize_shadow(rows) -> dict:
    """A8 within-set paired comparison (directional, DX-12). Each row = (model_pred_rtf,
    shadow_pred_rtf, actual_reps): compare |model_pred - actual| vs |shadow_pred - actual| at the
    SAME actual reps. Reports mean abs error for each and how often the model is no worse than the
    fixed counterfactual. NOT a gated success metric — a diagnostic the analyst reads within-athlete."""
    n = 0
    sum_model = sum_shadow = 0.0
    model_no_worse = 0
    for model_pred, shadow_pred, actual in rows:
        if model_pred is None or shadow_pred is None or actual is None:
            continue
        n += 1
        me = abs(float(model_pred) - float(actual))
        se = abs(float(shadow_pred) - float(actual))
        sum_model += me
        sum_shadow += se
        if me <= se:
            model_no_worse += 1
    return {
        "n_pairs": n,
        "model_mean_abs_err": (sum_model / n) if n else 0.0,
        "shadow_mean_abs_err": (sum_shadow / n) if n else 0.0,
        "model_no_worse_than_shadow_frac": (model_no_worse / n) if n else 0.0,
    }


def _summarize_overrides(total_observations: int, rows) -> dict:
    """A9 override log. Each row = (override_category, capability, exercise, override_target,
    actual_weight, week). Reports the override rate over all observations, counts by category, and the
    captured rows verbatim (the richest learning signal; off-catalog targets preserved losslessly)."""
    by_category: dict[str, int] = {}
    out_rows = []
    for cat, cap, exercise, target, actual_weight, week in rows:
        by_category[cat] = by_category.get(cat, 0) + 1
        out_rows.append({
            "override_category": cat, "capability": cap, "exercise": exercise,
            "override_target": target, "actual_weight": actual_weight, "week": week,
        })
    n_over = len(out_rows)
    return {
        "n_observations": total_observations,
        "n_overrides": n_over,
        "override_rate": (n_over / total_observations) if total_observations else 0.0,
        "by_category": by_category,
        "rows": out_rows,
    }
