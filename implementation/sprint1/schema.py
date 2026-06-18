"""
Hush v1 database schema (Sprint 1).

Single SQLite database (MVP scale, per the System Architecture). Two logical zones:

  IMMUTABLE HISTORY (append-only, never UPDATE/DELETE):
    workout_session -> exercise_block -> set_record   (ES-001 hierarchy)
    observation, evidence, recommendation, state_update_log

  MUTABLE STATE (the projection decisions read from):
    athlete, athlete_state, capability_state

Invariants enforced here:
  - the hierarchy: no set without a block, no block without a session (FKs)
  - both recommended_weight and actual_weight on set_record (ES-001 critical rule)
  - model_version / capability_model_version stamped on every history row
  - capability_state.sum_w materialized (precision accumulator, O(1) updates)

Field naming note: ES-001's Observation schema predates the ES-004/005.1 correction
that split predicted_reps (target) from predicted_reps_to_failure (the learning
quantity). We persist the ES-005.1 semantics (predicted_reps_to_failure) because
ES-005.1 is the governing later correction; the column is named accordingly.
"""

SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

-- ---------- mutable state ----------

CREATE TABLE IF NOT EXISTS athlete (
    id            TEXT PRIMARY KEY,
    sex           TEXT NOT NULL,
    age           INTEGER NOT NULL,
    experience    TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    bodyweight_kg REAL                  -- DX-07: nullable; inert until Option D (DX-08)
);

CREATE TABLE IF NOT EXISTS athlete_state (
    athlete_id        TEXT PRIMARY KEY REFERENCES athlete(id),
    workout_count     INTEGER NOT NULL DEFAULT 0,
    -- Sprint 2 (ES-011 A.3): systemic fatigue (score units) + recovery clock
    fatigue_systemic      REAL NOT NULL DEFAULT 0,
    last_workout_at_week  REAL,
    updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capability_state (
    athlete_id     TEXT NOT NULL REFERENCES athlete(id),
    capability     TEXT NOT NULL,
    score          REAL NOT NULL,
    confidence     REAL NOT NULL,
    sum_w          REAL NOT NULL,
    last_trained_at_week REAL,
    -- Sprint 2 (ES-011 A.3): per-capability fatigue (score units)
    fatigue        REAL NOT NULL DEFAULT 0,
    -- Sprint 2 (ES-010 Part C): decay-weighted recent-variance moments (O(1))
    var_w          REAL NOT NULL DEFAULT 0,
    var_ws         REAL NOT NULL DEFAULT 0,
    var_ws2        REAL NOT NULL DEFAULT 0,
    -- Sprint 3A (ES-006): decision memory + stability-guard streaks (projected state)
    last_recommended_weight REAL,
    last_decision           TEXT,
    consecutive_positive    INTEGER NOT NULL DEFAULT 0,
    consecutive_negative    INTEGER NOT NULL DEFAULT 0,
    last_decision_week      REAL,
    updated_at     TEXT NOT NULL,
    PRIMARY KEY (athlete_id, capability)
);

-- Sprint 3B-1 (ES-008 v2 / ES-009 / ES-009.1): strategy projection (1 row/athlete).
-- weekly_volume is an ENUM band (low|moderate|high); the ES-009/009.1 consumers arrive
-- in Sprint 3B-2. Seeded at onboarding from domain.default_strategy_state (single source
-- of truth); a migrated athlete with NO row falls back to the same defaults on read.
CREATE TABLE IF NOT EXISTS strategy_state (
    athlete_id        TEXT PRIMARY KEY REFERENCES athlete(id),
    weekly_frequency  INTEGER NOT NULL DEFAULT 3,
    weekly_volume     TEXT NOT NULL DEFAULT 'moderate',
    primary_focus     TEXT,
    secondary_focus   TEXT,
    updated_at        TEXT NOT NULL
);

-- Sprint 3B-1 (ES-007/010 / ES-009 §6): learned preference per (athlete, family).
-- Absent row reads as preference_score = 50 (ES-009 §6 default-if-unobserved), so no
-- rows are seeded at onboarding.
CREATE TABLE IF NOT EXISTS preference_state (
    athlete_id        TEXT NOT NULL REFERENCES athlete(id),
    exercise_family   TEXT NOT NULL,
    preference_score  REAL NOT NULL DEFAULT 50,
    updated_at        TEXT NOT NULL,
    PRIMARY KEY (athlete_id, exercise_family)
);

-- Program Ownership Contract (migration 015): the append-only athlete-preference event log.
-- EVERY athlete preference action (exercise pin/restore, substitute add/remove, backup
-- define/remove, exercise/workout reorder) is one immutable row — never updated or deleted.
-- The athlete's CURRENT preferences are a PROJECTION over this log (latest-wins per key), so
-- the full preference timeline is reconstructable forever: which model exercises were
-- accepted/rejected, what was replaced, when, and how preferences evolved. Joinable to the
-- research dataset via athlete_id (→ recommendation/observation/athlete_event). This is the
-- SOURCE OF TRUTH for athlete-owned program structure; preference_state is a derived cache.
CREATE TABLE IF NOT EXISTS preference_event (
    event_id        TEXT PRIMARY KEY,        -- idempotent (client- or server-generated)
    athlete_id      TEXT NOT NULL REFERENCES athlete(id),
    seq             INTEGER NOT NULL,         -- per-athlete monotonic order (server-assigned)
    server_ts       TEXT NOT NULL,
    action          TEXT NOT NULL,            -- exercise_replaced|exercise_restored|substitute_added|
                                              -- substitute_removed|backup_defined|backup_removed|
                                              -- exercise_reordered|workout_reordered
    capability      TEXT,                     -- the slot's capability (exercise pin/reorder)
    slot_key        TEXT,                     -- optional finer slot identity
    from_exercise   TEXT,                     -- prior/displaced/primary exercise
    to_exercise     TEXT,                     -- chosen exercise / substitute / backup
    payload         TEXT NOT NULL DEFAULT '{}', -- JSON (ordered lists for reorder, etc.)
    reason          TEXT NOT NULL DEFAULT '',
    source          TEXT NOT NULL DEFAULT '',  -- onboarding_customization|in_session|program_detail|...
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pref_event_athlete ON preference_event(athlete_id, seq);
CREATE INDEX IF NOT EXISTS ix_pref_event_action  ON preference_event(action);

-- Weekly Program Container (migration 016). The model GENERATES a weekly plan of N workouts; the
-- athlete completes them IN ANY ORDER; the week completes only when ALL are done; then the system
-- enters Rest and generates the NEXT week from the completed week's data. A week groups N
-- workout_session rows (week_plan_id + position_in_week). The composition audit snapshot lives at
-- the week (the unit that is planned + regenerated). Append-only history (status flips active →
-- completed; rows are never rewritten).
CREATE TABLE IF NOT EXISTS week_plan (
    id                        TEXT PRIMARY KEY,
    athlete_id                TEXT NOT NULL REFERENCES athlete(id),
    week_number               INTEGER NOT NULL,
    status                    TEXT NOT NULL,          -- active | completed
    weekly_frequency          INTEGER NOT NULL,
    weekly_volume             TEXT,
    primary_focus             TEXT,
    secondary_focus           TEXT,
    catalog_version           TEXT,
    model_version             TEXT,
    capability_model_version  TEXT,
    created_at                TEXT NOT NULL,
    completed_at              TEXT
);

-- ---------- immutable history (append-only) ----------

CREATE TABLE IF NOT EXISTS workout_session (
    id            TEXT PRIMARY KEY,
    athlete_id    TEXT NOT NULL REFERENCES athlete(id),
    status        TEXT NOT NULL,          -- planned|active|completed|abandoned
    week          REAL NOT NULL,
    started_at    TEXT,
    completed_at  TEXT,
    -- Sprint 3B-2 (ES-009 §9): composition audit snapshot. exploration_seed is REQUIRED
    -- to reconstruct the one nondeterministic step (the exploration draw); the others
    -- snapshot the mutable strategy/calibration inputs that drove the template + volume,
    -- so a session stays self-describing (Invariant 2). NULL on pre-3B-2 sessions.
    exploration_seed   INTEGER,
    session_index      INTEGER,
    weekly_frequency   INTEGER,
    weekly_volume      TEXT,
    calibration_phase  INTEGER,
    -- Migration 014: the rest of the composition audit snapshot, so the candidate-selection
    -- decision is replayable from stored data ALONE years later. primary/secondary_focus are
    -- the mutable strategy inputs that drove Stage-2 ordering + Stage-3 selection (otherwise
    -- lost — strategy_state is a mutable projection with no history). catalog_version pins the
    -- candidate POOL (a catalog edit otherwise makes a past selection irreproducible).
    -- model_version/capability_model_version stamp WHICH composition code ran. NULL on
    -- pre-014 sessions.
    primary_focus            TEXT,
    secondary_focus          TEXT,
    catalog_version          TEXT,
    model_version            TEXT,
    capability_model_version TEXT,
    -- Weekly Program Container (migration 016): the week this workout belongs to + its athlete-
    -- owned position within the week (0-based). NULL on the legacy session-at-a-time path.
    week_plan_id             TEXT REFERENCES week_plan(id),
    position_in_week         INTEGER,
    -- Migration 017: stable, structure-derived workout name (e.g. "Upper A", "Full Body B").
    -- Derived from the template index within the frequency split, so it is invariant across
    -- weekly regeneration and athlete reordering. NULL only on pre-017 rows not yet backfilled.
    name                     TEXT,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercise_block (
    id                 TEXT PRIMARY KEY,
    workout_session_id TEXT NOT NULL REFERENCES workout_session(id),
    capability         TEXT NOT NULL,
    exercise           TEXT NOT NULL,
    difficulty_factor  REAL NOT NULL,
    position           INTEGER NOT NULL,
    recommended_weight REAL NOT NULL,
    target_reps        INTEGER NOT NULL,
    target_sets        INTEGER NOT NULL,
    status             TEXT NOT NULL,      -- planned|active|completed|skipped
    -- Sprint 3B-2 (ES-009 §6): "why this exercise" — canonical|preference|exploration|
    -- second_slot|replacement. '' on pre-3B-2 blocks (the single-block manual path).
    selection_reason   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS set_record (
    id                 TEXT PRIMARY KEY,
    exercise_block_id  TEXT NOT NULL REFERENCES exercise_block(id),
    set_number         INTEGER NOT NULL,
    recommended_weight REAL NOT NULL,
    target_reps        INTEGER NOT NULL,
    actual_weight      REAL,               -- both stored (ES-001 critical rule)
    actual_reps        INTEGER,
    status             TEXT NOT NULL,       -- completed|skipped
    completed_at       TEXT
);

CREATE TABLE IF NOT EXISTS recommendation (
    id                        TEXT PRIMARY KEY,
    athlete_id                TEXT NOT NULL REFERENCES athlete(id),
    exercise_block_id         TEXT REFERENCES exercise_block(id),
    capability                TEXT NOT NULL,
    exercise                  TEXT NOT NULL,
    difficulty_factor         REAL NOT NULL,
    recommended_weight        REAL NOT NULL,
    target_reps               INTEGER NOT NULL,
    predicted_reps_to_failure REAL NOT NULL,
    prediction_confidence     REAL NOT NULL,
    decision_reason           TEXT NOT NULL,
    -- Sprint 2 (ES-011 E.1): fatigue state assumed by this recommendation
    est_fatigue_systemic      REAL NOT NULL DEFAULT 0,
    est_fatigue_capability    REAL NOT NULL DEFAULT 0,
    -- Sprint 3A (ES-006): the named decision + the ungoverned ES-005.1 target load
    decision_type             TEXT NOT NULL DEFAULT 'KEEP_LOAD',
    target_load               REAL NOT NULL DEFAULT 0,
    -- Sprint 3B-1 (ES-006 L2): REPLACE_EXERCISE audit (NULL/'' on the normal path)
    replaced_from_exercise    TEXT,
    replace_reason            TEXT NOT NULL DEFAULT '',
    model_version             TEXT NOT NULL,
    capability_model_version  TEXT NOT NULL,
    created_at                TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observation (
    id                        TEXT PRIMARY KEY,
    athlete_id                TEXT NOT NULL REFERENCES athlete(id),
    workout_session_id        TEXT NOT NULL REFERENCES workout_session(id),
    exercise_block_id         TEXT NOT NULL REFERENCES exercise_block(id),
    set_id                    TEXT NOT NULL REFERENCES set_record(id),
    capability                TEXT NOT NULL,
    exercise                  TEXT NOT NULL,
    difficulty_factor         REAL NOT NULL,
    actual_weight             REAL NOT NULL,
    actual_reps               INTEGER NOT NULL,
    predicted_reps_to_failure REAL NOT NULL,
    prediction_error          REAL NOT NULL,
    week                      REAL NOT NULL,
    -- Sprint 4 (ES-010 B.1 / A9): override-target logging. '' / NULL on the normal path;
    -- set when an override is recorded (category = LOAD / EXERCISE_REPLACEMENT / ...).
    override_category         TEXT NOT NULL DEFAULT '',
    override_target           REAL,
    -- Off-policy calibration sample (migration 013). Materializes the decision-time
    -- model state ALONGSIDE the realized outcome so an override (or any set) is a
    -- self-contained calibration sample — usable later for probability calibration
    -- and model improvement, not merely "an override happened". All NULL/0 on the
    -- legacy/rested path (never written by the Sprint 0-2 callers; byte-identical).
    --   off_policy: 1 iff the logged load deviated from the prescription (A9 override).
    --   mu_decision: latent capability score μ at decision time (score_before).
    --   sigma_decision: decision-time uncertainty σ = sqrt(recent variance), 0 cold-start.
    --   predicted_reps_prescribed: model's predicted reps-to-failure at the PRESCRIBED
    --     (on-policy) load — distinct from predicted_reps_to_failure, which is re-predicted
    --     at the actual (off-policy) load. Together with actual_reps this is the pair a
    --     downstream calibrator fits.
    --   predicted_success: the model's pre-registered success expectation for the
    --     prescription (1.0 iff predicted_reps_prescribed >= target_reps). The model is
    --     rep-based — this is the deterministic expectation calibration scores outcomes
    --     against, NOT a fabricated probability.
    --   capability_value: observed capability-space value (s_obs) for this capability.
    off_policy                INTEGER NOT NULL DEFAULT 0,
    mu_decision               REAL,
    sigma_decision            REAL,
    predicted_reps_prescribed REAL,
    predicted_success         REAL,
    capability_value          REAL,
    created_at                TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
    id                        TEXT PRIMARY KEY,
    observation_id            TEXT NOT NULL REFERENCES observation(id),
    athlete_id                TEXT NOT NULL REFERENCES athlete(id),
    capability                TEXT NOT NULL,
    s_obs                     REAL NOT NULL,
    quality                   REAL NOT NULL,
    weight                    REAL NOT NULL,
    source_week               REAL NOT NULL,
    model_version             TEXT NOT NULL,
    capability_model_version  TEXT NOT NULL,
    created_at                TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS state_update_log (
    id               TEXT PRIMARY KEY,
    athlete_id       TEXT NOT NULL REFERENCES athlete(id),
    capability       TEXT NOT NULL,
    evidence_id      TEXT REFERENCES evidence(id),
    prev_score       REAL NOT NULL,
    prev_confidence  REAL NOT NULL,
    prev_sum_w       REAL NOT NULL,
    new_score        REAL NOT NULL,
    new_confidence   REAL NOT NULL,
    new_sum_w        REAL NOT NULL,
    reason           TEXT NOT NULL,
    -- Sprint 2 (ES-010 C / ES-011 E): conflict + fatigue audit on the update
    agreement            REAL NOT NULL DEFAULT 1,
    sigma2_recent        REAL NOT NULL DEFAULT 0,
    est_fatigue_capability REAL NOT NULL DEFAULT 0,
    -- Sprint 3A (ES-006): the decision this update was recorded under
    decision_type    TEXT NOT NULL DEFAULT '',
    model_version    TEXT NOT NULL,
    created_at       TEXT NOT NULL
);

-- Sprint 4 (ES-012 F.1 / A8): shadow-baseline paired comparison. Written ONLY by the
-- Phase 0 harness / live instrumentation; empty on a non-instrumented database, so the
-- prior trajectories are byte-unchanged. The shadow is a FIXED, non-learning policy
-- (sim/shadow.py); this table stores its recommendation + prediction beside the model's.
CREATE TABLE IF NOT EXISTS shadow_recommendation (
    id                    TEXT PRIMARY KEY,
    recommendation_id     TEXT REFERENCES recommendation(id),
    athlete_id            TEXT NOT NULL REFERENCES athlete(id),
    capability            TEXT NOT NULL,
    exercise              TEXT NOT NULL,
    shadow_weight         REAL NOT NULL,
    shadow_predicted_rtf  REAL NOT NULL,
    model_predicted_rtf   REAL NOT NULL,
    actual_reps           INTEGER NOT NULL,
    week                  REAL NOT NULL,
    created_at            TEXT NOT NULL
);

-- Sprint 5 (DX-11): event-driven per-(session, capability) decision-memory accumulator.
-- ADDITIVE INFRA table (migration 008) — the persisted equivalent of SessionEngine._CapMemory,
-- so the device-driven set-report path (one set per request, no shared process memory) can
-- advance the ES-006 governor ONCE per capability at session close (R2). It holds NO model
-- number/formula; empty on the in-process path, so prior trajectories are byte-unchanged.
CREATE TABLE IF NOT EXISTS session_progress (
    workout_session_id  TEXT NOT NULL REFERENCES workout_session(id),
    capability          TEXT NOT NULL,
    entry_score         REAL,                         -- score before the cap's FIRST set this session
    s_obs               REAL NOT NULL DEFAULT 0,      -- representative observed score (primary slot preferred)
    decision_type       TEXT NOT NULL DEFAULT '',
    recommended_weight  REAL NOT NULL DEFAULT 0,
    have_primary        INTEGER NOT NULL DEFAULT 0,   -- 0/1
    updated_at          TEXT NOT NULL,
    PRIMARY KEY (workout_session_id, capability)
);

-- Sprint 6 (M5 / DX-09): anti-repetition memory for stagnation surfacing. ADDITIVE INFRA table
-- (migration 009) — records what the weekly review surfaced and when, so a plateau is not
-- re-surfaced until its trend state changes or a 4-week cooldown elapses (Product Spec §12). M5
-- is read-only w.r.t. learned state; this is the only thing it writes. Empty until the first
-- weekly review, so prior trajectories are byte-unchanged.
CREATE TABLE IF NOT EXISTS stagnation_marker (
    athlete_id          TEXT NOT NULL,
    capability          TEXT NOT NULL,
    last_surfaced_week  REAL,
    last_surfaced_state TEXT NOT NULL DEFAULT '',
    updated_at          TEXT NOT NULL,
    PRIMARY KEY (athlete_id, capability)
);

-- Wave 2 / B3 (web shell, migration 010): ADDITIVE INFRA tables — NOT model state, outside
-- both schema zones. They carry no model number/formula/decision; empty until the API serves
-- a request, so every prior trajectory is byte-unchanged.

-- BB-1 idempotency / anti-replay (API contract §13): the exactly-once dedup store. Keyed per
-- athlete (derived from the token) so a captured event cannot be replayed cross-athlete. The
-- recorded response is returned verbatim on any replay, in the SAME transaction as the apply.
CREATE TABLE IF NOT EXISTS idempotency_key (
    athlete_id       TEXT NOT NULL,
    client_event_id  TEXT NOT NULL,    -- client_event_id or client_request_id (contract §13)
    response_json    TEXT NOT NULL,    -- the original response body, replayed verbatim
    created_at       TEXT NOT NULL,
    PRIMARY KEY (athlete_id, client_event_id)
);

-- BB-19/20 per-athlete bearer auth: store only a HASH of a high-entropy token; the server
-- derives athlete_id from the presented token (never trusts a client-supplied id). Revocation
-- is a non-null revoked_at (a revoked token authenticates to nothing → 401).
CREATE TABLE IF NOT EXISTS auth_token (
    token_hash   TEXT PRIMARY KEY,
    athlete_id   TEXT NOT NULL REFERENCES athlete(id),
    created_at   TEXT NOT NULL,
    revoked_at   TEXT
);

-- Wave 2 / OD-2 (migration 011): erasure tombstone — the auditable proof that an athlete was
-- LOGICALLY erased (anonymized). OD-2 ratified 2026-06-12: deletion = anonymization (auth + precise
-- identifiers removed, audit/history retained anonymized; NO destructive audit-chain deletion). The
-- anonymization itself is `HushService.erase_athlete`; this records that it happened + when. Empty
-- until the first erasure, so every prior trajectory is byte-unchanged.
CREATE TABLE IF NOT EXISTS erasure_record (
    athlete_id  TEXT PRIMARY KEY,
    erased_at   TEXT NOT NULL,
    method      TEXT NOT NULL
);

-- migration 012: the durable, append-only research event store — an immutable, joinable log of
-- every athlete/app interaction (temporal training data, decision responses, preferences, trust
-- milestones, lifecycle/context). NOT model state; the substrate the model is evaluated/retrained
-- against later. Idempotent on event_id; dual clocks (server + client wall + client monotonic)
-- preserve intra-session chronology forever. `data` is a non-sensitive JSON payload. Retained for
-- the athlete lifetime; erasure anonymizes via the athlete pseudonym (OD-2 audit-retention).
CREATE TABLE IF NOT EXISTS athlete_event (
    event_id          TEXT PRIMARY KEY,
    athlete_id        TEXT NOT NULL REFERENCES athlete(id),
    session_id        TEXT,
    type              TEXT NOT NULL,
    server_ts         TEXT NOT NULL,
    client_ts         TEXT,
    client_monotonic  REAL,
    seq               INTEGER,
    app_version       TEXT,
    os                TEXT,
    device_id         TEXT,
    locale            TEXT,
    network           TEXT,
    data              TEXT NOT NULL DEFAULT '{}'
);

-- Sprint 2: migration bookkeeping (thin runner; Build Plan §3)
CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_block_session   ON exercise_block(workout_session_id);
CREATE INDEX IF NOT EXISTS ix_set_block       ON set_record(exercise_block_id);
CREATE INDEX IF NOT EXISTS ix_obs_athlete     ON observation(athlete_id);
CREATE INDEX IF NOT EXISTS ix_evidence_obs    ON evidence(observation_id);
CREATE INDEX IF NOT EXISTS ix_capstate_athlete ON capability_state(athlete_id);
CREATE INDEX IF NOT EXISTS ix_sul_athlete     ON state_update_log(athlete_id);
CREATE INDEX IF NOT EXISTS ix_event_athlete   ON athlete_event(athlete_id, server_ts);
CREATE INDEX IF NOT EXISTS ix_event_session   ON athlete_event(session_id);
CREATE INDEX IF NOT EXISTS ix_event_type      ON athlete_event(type);
"""
