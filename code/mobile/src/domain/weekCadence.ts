/**
 * Weekly cadence (founder, 2026-06-21). The training week is a fixed window that
 * opens **Sunday at 04:00 local** and runs to the next Sunday 04:00. When all of
 * a week's workouts are done the athlete is in Recovery until the next opening —
 * the next week is genuinely LOCKED until then (no starting early).
 *
 * Also the source of the **training-week counter** ("Week N"), which appears all
 * over the product (Home meter, Recovery, the progress reports). Week 1 is the
 * week the account was created (`memberSince`); it increments each Sunday 04:00.
 *
 * Pure + I/O-free so it is fully unit-testable and deterministic given a clock.
 */

export const WEEK_OPEN_DOW = 0; // Sunday (JS Date.getDay(): 0=Sun … 6=Sat)
export const WEEK_OPEN_HOUR = 4; // 04:00 local
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The most recent Sunday-04:00 at or before `nowMs` — the start of the current
 * training week. Built from local Y/M/D parts so it is DST-correct (always lands
 * on a real local 04:00, never drifting by the DST hour).
 */
export function currentWeekOpen(nowMs: number): number {
  const d = new Date(nowMs);
  let c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), WEEK_OPEN_HOUR, 0, 0, 0);
  while (c.getTime() > nowMs || c.getDay() !== WEEK_OPEN_DOW) {
    c = new Date(c.getFullYear(), c.getMonth(), c.getDate() - 1, WEEK_OPEN_HOUR, 0, 0, 0);
  }
  return c.getTime();
}

/**
 * The first Sunday-04:00 strictly AFTER `afterMs` — when the next training week
 * opens / unlocks.
 */
export function nextWeekOpen(afterMs: number): number {
  const d = new Date(afterMs);
  let c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), WEEK_OPEN_HOUR, 0, 0, 0);
  while (c.getTime() <= afterMs || c.getDay() !== WEEK_OPEN_DOW) {
    c = new Date(c.getFullYear(), c.getMonth(), c.getDate() + 1, WEEK_OPEN_HOUR, 0, 0, 0);
  }
  return c.getTime();
}

/**
 * 1-based training-week number for "Week N", counted in Sunday-04:00 windows
 * since the account was created. Falls back to 1 on a missing/unparseable anchor.
 */
export function trainingWeekNumber(memberSinceIso: string | null | undefined, nowMs: number): number {
  if (!memberSinceIso) return 1;
  const m = Date.parse(memberSinceIso);
  if (Number.isNaN(m)) return 1;
  const first = currentWeekOpen(m);
  const cur = currentWeekOpen(nowMs);
  const weeks = Math.round((cur - first) / WEEK_MS);
  return Math.max(1, weeks + 1);
}

/**
 * Whether the weekly bucket must be regenerated NOW (calendar-primary cadence, 2026-07-05).
 * True when there is no bucket yet, or the calendar week has advanced past the Sunday-04:00 the
 * current bucket was built for. Completion is deliberately irrelevant — the roll is purely the
 * Sunday-04:00 boundary, so finishing early never rolls and an unfinished week never blocks the
 * roll. `builtForMs == null` WITH an existing bucket is pre-upgrade state → do NOT roll (the caller
 * adopts it into the current week), so upgrading never wipes an in-progress week.
 */
export function shouldRollWeek(builtForMs: number | null, hasProgram: boolean, nowMs: number): boolean {
  if (!hasProgram) return true;
  if (builtForMs == null) return false;
  return currentWeekOpen(nowMs) > builtForMs;
}
