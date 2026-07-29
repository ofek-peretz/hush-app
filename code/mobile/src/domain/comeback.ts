/**
 * AFTER A GAP (v7 §10) — "no 'you broke your streak', no deload".
 *
 * The handoff's whole position on an absence, in one line: "Your weights stand where you left them
 * — the first set decides whether they still fit." So this module computes exactly two things, and
 * refuses to compute a third:
 *
 *   · HOW LONG she was away — a fact, stated once, never counted against her.
 *   · WHETHER that is worth saying at all — below the threshold it is just a week, and a product
 *     that greets you after four days is a product that watches you.
 *
 * ════ WHAT IT DELIBERATELY DOES NOT DO ════
 * It does NOT decide a load. Not a deload, not a "re-entry week", not a percentage off what she was
 * lifting. That would be Hush guessing at a body it has not measured since — the exact theory the
 * engine is built to refuse (hypertrophy-only law: ZERO theory, recorded facts only). Her loads
 * stand, and the first set is the measurement that settles it. Any future temptation to "ease her
 * back in" belongs to the engine reading a real logged set, not to this file.
 *
 * Pure and I/O-free.
 */
import type { Session } from '@/data/local/models';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a silence has to run before it is worth naming.
 *
 * Eleven days is the handoff's own example ("opened after eleven quiet days"); the threshold sits
 * at TEN so that example lands inside it. Below ten, an absence is a holiday, an illness, a busy
 * fortnight at work — none of which the athlete needs greeted. A lower number would turn the
 * welcome into a nag, which is the one thing §10 exists to avoid.
 */
export const COMEBACK_DAYS = 10;

export interface Comeback {
  /** Whole days between the last logged session and now. */
  daysAway: number;
  /** When she last trained (ms). */
  lastSessionMs: number;
}

/**
 * The gap worth greeting, or null.
 *
 * Null on every ordinary return, on a first-ever open (there is no "back" without a "before"), and
 * on a history that cannot be read — the welcome is a nicety, and a nicety must never be the reason
 * a screen fails to open.
 */
export function comebackAfterGap(history: readonly Session[], nowMs: number): Comeback | null {
  let lastMs = 0;
  for (const s of history) {
    const t = Date.parse(s.startedAt);
    if (Number.isFinite(t) && t > lastMs) lastMs = t;
  }
  if (lastMs <= 0) return null; // never trained — this is a beginning, not a return

  const daysAway = Math.floor((nowMs - lastMs) / DAY_MS);
  if (daysAway < COMEBACK_DAYS) return null;
  return { daysAway, lastSessionMs: lastMs };
}
