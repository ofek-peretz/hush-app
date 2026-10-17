-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE COACH PAYS — the plan behind `coaches.seat_limit`. (2026-09-18, COACH_TRACK_V1 §4/§6)
--
-- `0001_coach.sql` gave every coach a `seat_limit` and left it NULL (the free tier). These columns
-- record WHY it is whatever it is: which tier Apple verified, which purchase it came from, what
-- state that purchase is in, and when the paid period ends.
--
-- ⛔ SEATS MAY DROP BELOW LIVE LINKS, AND NOTHING HERE DELETES ANYTHING. A lapsed plan sets
-- `seat_limit` back to NULL; the coach keeps every athlete and every week he ever sent, and simply
-- cannot invite another until he is under the limit again or renews (`over_limit`, §6). There is no
-- trigger, no cascade and no cleanup on this table for exactly that reason.
--
-- ⛔ ONE PURCHASE CANNOT RAISE TWO ROSTERS. `coaches_plan_txn` is a partial UNIQUE index on Apple's
-- `originalTransactionId` — the same subscription claimed on a second account is refused by the
-- database, not merely by the read before the write (409 `plan_claimed`).
--
-- ⚠️ 0001 IS UNTOUCHED, and D1 applies migrations in order. A worker deployed with 0002 unapplied
-- answers 503 on every coach route (the SELECT names columns that do not exist yet) — so this is
-- applied BEFORE the deploy that reads it, exactly as 0001 was.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE coaches ADD COLUMN plan_product_id TEXT;              -- 'hush.coach.10|30|100.month'
ALTER TABLE coaches ADD COLUMN plan_txn TEXT;                     -- Apple's originalTransactionId
ALTER TABLE coaches ADD COLUMN plan_state TEXT;                   -- 'active' | 'grace' | 'expired'
ALTER TABLE coaches ADD COLUMN plan_renews_at INTEGER;            -- ms; NULL once nothing is running
ALTER TABLE coaches ADD COLUMN plan_event_at INTEGER;             -- ms of the newest event applied

-- ⛔ ONE PURCHASE, ONE ROSTER.
CREATE UNIQUE INDEX coaches_plan_txn ON coaches(plan_txn) WHERE plan_txn IS NOT NULL;
