-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE COACH TRACK — storage. (2026-09-17, docs/architecture/COACH_TRACK_V1.md §5)
--
-- D1 database `ferrox-coach`, bound as COACH_DB on hush-identity. Every time is epoch MILLISECONDS
-- (INTEGER); the ISO strings on the wire are derived on the way out.
--
-- ⛔ THE COACH NEVER LEARNS THE TRAINEE'S `sub`. It lives in exactly one column
-- (`coach_links.trainee_sub`) and no route that a coach calls ever selects it — a trainee is
-- addressed by `coach_links.id` (the linkId) everywhere else.
--
-- ⛔ ENDED IS NOT DELETED, AND DELETED FOLLOWS 30 DAYS LATER (law 6). An unlink sets `ended_at`,
-- and every coach read filters `ended_at IS NULL`, so access stops at once. The daily cron
-- (`purgeCoach`) removes links ended more than 30 days ago; the children below go with them, both
-- by an explicit DELETE and by ON DELETE CASCADE, so neither mechanism alone is load-bearing.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE coaches (
  sub         TEXT PRIMARY KEY,               -- the coach's own identity (Apple sub, or google:<sub>)
  name        TEXT NOT NULL,                  -- ≤ 40, what her trainees see
  seat_limit  INTEGER,                        -- NULL = env COACH_FREE_SEATS (default 2); StoreKit raises it (phase 3)
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER                         -- account deleted: links ended, row purged 30 days later
);

CREATE TABLE coach_links (
  id                  TEXT PRIMARY KEY,       -- the linkId — the ONLY handle a coach ever holds
  coach_sub           TEXT NOT NULL REFERENCES coaches(sub) ON DELETE CASCADE,
  trainee_sub         TEXT NOT NULL,          -- never selected by a coach route
  trainee_name        TEXT NOT NULL,          -- ≤ 40
  sex                 TEXT,                   -- 'male' | 'female' | NULL
  days                INTEGER,                -- 1..7 | NULL
  consent_bodyweight  INTEGER NOT NULL DEFAULT 0,
  consent_cardio      INTEGER NOT NULL DEFAULT 0,
  since               INTEGER NOT NULL,       -- the link date: nothing before it is ever accepted (law 4)
  ended_at            INTEGER                 -- NULL = live
);
-- ⛔ ONE COACH AT A TIME (law 6) — held by the database, not only by a read before the insert.
CREATE UNIQUE INDEX coach_links_one_live_per_trainee ON coach_links(trainee_sub) WHERE ended_at IS NULL;
CREATE INDEX coach_links_by_coach ON coach_links(coach_sub, ended_at);
CREATE INDEX coach_links_by_ended ON coach_links(ended_at) WHERE ended_at IS NOT NULL;

CREATE TABLE coach_invites (
  code          TEXT PRIMARY KEY,             -- the invite alphabet, 6 characters
  coach_sub     TEXT NOT NULL REFERENCES coaches(sub) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,             -- created_at + 7 days
  used_at       INTEGER,                      -- single-use
  used_by_link  TEXT                          -- deliberately no FK: the invite may outlive a purged link
);
CREATE INDEX coach_invites_by_coach ON coach_invites(coach_sub);
CREATE INDEX coach_invites_by_expiry ON coach_invites(expires_at);

CREATE TABLE coach_weeks (
  link_id     TEXT NOT NULL REFERENCES coach_links(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,               -- 1, 2, 3 … per link
  sent_at     INTEGER NOT NULL,
  coach_name  TEXT NOT NULL,
  week_json   TEXT NOT NULL,                  -- a CoachWeekWire, as `readCoachWeek` rebuilt it
  PRIMARY KEY (link_id, version)
);

CREATE TABLE coach_sessions (
  link_id        TEXT NOT NULL REFERENCES coach_links(id) ON DELETE CASCADE,
  id             TEXT NOT NULL,               -- the phone's Session.id — the idempotency key
  at_ms          INTEGER NOT NULL,
  uploaded_at    INTEGER NOT NULL,
  bodyweight_kg  REAL,                        -- only ever written under consent; nulled when consent is withdrawn
  payload_json   TEXT NOT NULL,               -- a SessionUpload WITHOUT bodyweightKg, as `readSessionUpload` rebuilt it
  PRIMARY KEY (link_id, id)
);
CREATE INDEX coach_sessions_by_time ON coach_sessions(link_id, at_ms DESC);

CREATE TABLE coach_cardio (
  link_id       TEXT NOT NULL REFERENCES coach_links(id) ON DELETE CASCADE,
  id            TEXT NOT NULL,
  at_ms         INTEGER NOT NULL,
  uploaded_at   INTEGER NOT NULL,
  payload_json  TEXT NOT NULL,                -- a CardioUpload, as `readCardioUpload` rebuilt it
  PRIMARY KEY (link_id, id)
);
CREATE INDEX coach_cardio_by_time ON coach_cardio(link_id, at_ms DESC);

CREATE TABLE coach_templates (
  id          TEXT PRIMARY KEY,
  coach_sub   TEXT NOT NULL REFERENCES coaches(sub) ON DELETE CASCADE,
  name        TEXT NOT NULL,                  -- ≤ 40, unique per coach (a save under a used name replaces it)
  week_json   TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX coach_templates_name ON coach_templates(coach_sub, name);
