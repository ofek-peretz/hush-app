/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * MOVING A WORKOUT TO ANOTHER DAY — the one rule, and both doors into it.
 *
 * ⛔ FOUNDER, 2026-08-05:
 *
 *   > *"Why don't we show a weekly board, where the AI chooses which day to place each workout on,
 *   > and the athlete can change it herself by dragging from one day to another and swapping?"*
 *
 *   > *"And of course, if the athlete presses a different workout and starts it, the AI swaps the
 *   > position of the current workout with the position of the workout she started, on the day
 *   > board."*
 *
 * Two sentences, one mechanism. She can drag it, or she can simply START it — and the second is the
 * more important door, because it is the one she uses without deciding to. An athlete who opens the
 * app on Tuesday and trains Friday's session has told the board something, and a board that ignored
 * it would be back to being a schedule she never agreed to.
 *
 * ── IT IS A SWAP, NEVER A DISPLACEMENT ──────────────────────────────────────────────────────────
 * Dropping Friday's session onto Tuesday does not leave Friday empty and it does not evict Tuesday's
 * session to nowhere. **They trade.** The week keeps its shape — the same four sessions, the same
 * spacing between the muscles they train — and only the order changes, which is the only thing she
 * was expressing an opinion about.
 *
 * ⚠️ ONTO AN EMPTY DAY IS A MOVE, NOT A SWAP. There is nothing to trade with, so the source day
 * simply becomes free. That is the one asymmetry, and it is not really one: a swap with nothing is
 * a move.
 *
 * ── WHY THIS IS PURE, AND WHY IT RETURNS DAYS RATHER THAN A PLAN ────────────────────────────────
 * The caller owns the write. `CoachPlan` is the coach's own object and the app edits exactly one
 * field of it — `day` — so handing this function the whole plan would let it rewrite anything.
 * It answers the only question the athlete asked: which session sits on which weekday now.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { WEEK_ORDER } from '@/domain/trainingDays';
import type { Weekday } from '@/domain/coachPlan';

/** What the board knows about one session — its identity and where it currently sits. */
export interface BoardWorkout {
  id: string;
  /** The weekday it is on, or absent when the coach named none. */
  day?: string;
}

/**
 * The day each session sits on after `id` moves to `to`, keyed by session id.
 *
 * ⚠️ EVERY SESSION IS IN THE RESULT, not only the two that moved. The caller writes the whole
 * mapping back, so a partial answer would leave the rest of the week to be merged by hand — and a
 * merge is where the bug would be.
 *
 * Returns `null` when nothing would change: an unknown id, a day that is not a weekday, or a
 * session dropped back onto the day it was already on. A caller that persists on `null` writes a
 * plan for no reason and rotates state that should not have moved.
 */
export function moveWorkoutToDay(
  workouts: readonly BoardWorkout[],
  id: string,
  to: Weekday,
): Record<string, Weekday> | null {
  if (!WEEK_ORDER.includes(to)) return null;
  const moving = workouts.find((w) => w.id === id);
  if (!moving) return null;
  if (moving.day === to) return null;

  const out: Record<string, Weekday> = {};
  for (const w of workouts) {
    if (w.day && WEEK_ORDER.includes(w.day as Weekday)) out[w.id] = w.day as Weekday;
  }

  /*
   * Whoever is on the target day takes the mover's day. When the mover HAD no day — the coach named
   * none, which is most hypertrophy weeks — the occupant has nowhere to go, so it takes the first
   * free weekday rather than being dropped. A session that vanishes off the board because she
   * dragged another one onto it is the worst outcome available here.
   */
  const occupant = workouts.find((w) => w.id !== id && w.day === to);
  out[id] = to;
  if (occupant) {
    const freed = moving.day && WEEK_ORDER.includes(moving.day as Weekday) ? (moving.day as Weekday) : null;
    const taken = new Set(Object.entries(out).filter(([k]) => k !== occupant.id).map(([, d]) => d));
    out[occupant.id] = freed ?? WEEK_ORDER.find((d) => !taken.has(d)) ?? to;
  }
  return out;
}

/**
 * The days after she STARTS a session that is not the one the board offered — his second sentence.
 *
 * The workout she started takes TODAY, and whatever was on today takes the day she took it from.
 * Identical to a drag onto today, which is exactly the point: one mechanism, two doors, and no
 * second rule that could ever disagree with the first.
 *
 * ⚠️ `null` when she started the session that was already on today, which is the ordinary case and
 * must cost nothing.
 */
export function daysAfterStarting(
  workouts: readonly BoardWorkout[],
  startedId: string,
  today: Weekday,
): Record<string, Weekday> | null {
  return moveWorkoutToDay(workouts, startedId, today);
}

/*
 * ⛔ `dropTarget` AND `MeasuredRow` ARE DELETED (founder 2026-08-12).
 *
 * They resolved which WEEKDAY ROW a dragged session landed on, by measured band rather than by a
 * row-height constant — good arithmetic for a problem that no longer exists. The week is N workouts
 * now, always numbered, so there are no weekday rows to land on and `DraggableWeekRow` has gone with
 * them.
 *
 * ⚠️ `moveWorkoutToDay` STAYS, and is no longer about dragging at all. `daysAfterStarting` is the
 * only caller: when she STARTS a session that sits elsewhere in the week, the days are rewritten so
 * the record matches what she actually did. That is observation, which survives; assignment is what
 * left.
 */
