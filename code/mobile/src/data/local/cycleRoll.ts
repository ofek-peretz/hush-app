/**
 * ════ THE ROTATION'S ROLL (founder 2026-09-28) — the write half of `weekCadence.cycleClosedAt` ════
 *
 * Reads the week she trains (the same `loadWeekPlan` Today reads), her history and the cycle's
 * opening, and when every workout of the week has been trained since that opening, opens the next
 * cycle: the anchor moves to the moment the closing session started (+1 ms), the old anchor is kept
 * as the closed cycle's start (the weekly letter's window), and the cycle count goes up by one.
 *
 * ⚠️ IT ROLLS EVERY CLOSED CYCLE, NOT ONE. A wrist that trained offline for a fortnight reconciles
 * several sessions at once; stopping after one roll would leave a cycle that is already closed
 * standing open until the next session. Bounded, because a record is not a place for an infinite
 * loop even when it cannot happen.
 *
 * ⚠️ SERIALISED. It is called from the completion of every session (phone, wrist, salvage) and from
 * Today's focus, and two of those can overlap. Each run starts from what the previous one wrote, and
 * the anchor is derived from the record rather than from the clock, so a race writes the same value.
 *
 * Never throws; returns the new anchor, or null when nothing rolled.
 */
import { db } from '@/data/local/db';
import { loadWeekPlan } from '@/data/local/weekPlan';
import { coachWeek } from '@/domain/coachWeek';
import { cycleClosedAt, trainingWeekNumber } from '@/domain/weekCadence';

const MAX_ROLLS = 52;
let inFlight: Promise<unknown> = Promise.resolve();

export function rollClosedCycles(): Promise<number | null> {
  const run = inFlight.then(async (): Promise<number | null> => {
    try {
      const [plan, history, open] = await Promise.all([
        loadWeekPlan().catch(() => null),
        db.loadHistory().catch(() => []),
        db.loadWeekOpen().catch(() => null),
      ]);
      if (open == null) return null;
      const ids = coachWeek(plan).map((w) => w.id);
      let anchor = open;
      let prev: number | null = null;
      let rolled = 0;
      for (let i = 0; i < MAX_ROLLS; i++) {
        const next = cycleClosedAt(ids, history, anchor);
        if (next == null || next <= anchor) break;
        prev = anchor;
        anchor = next;
        rolled += 1;
      }
      if (rolled === 0 || prev == null) return null;
      /* The count continues from where the calendar left it for a member who trained under the
         Saturday week — her "שבוע 5" does not become "שבוע 2" the day the rotation arrives. */
      const stored = await db.loadWeekCycle().catch(() => null);
      const base = stored ?? trainingWeekNumber((await db.loadProfile().catch(() => null))?.memberSince, open);
      await Promise.all([db.saveWeekOpen(anchor), db.saveWeekPrevOpen(prev), db.saveWeekCycle(base + rolled)]);
      return anchor;
    } catch {
      return null;
    }
  });
  inFlight = run.catch(() => null);
  return run;
}
