/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE DAYS SHE TRAINS — WATCHED, NEVER ASKED.
 *
 * ⛔ FOUNDER, 2026-08-04, on the Home redesign:
 *
 *   > *"What happens if she didn't train on the day we told her to? What if she wants to train on a
 *   > rest day? And how does the system know which days she wants to train at all? You're right that
 *   > the way I chose is like a to-do list and that wasn't right — but it was my answer to those
 *   > questions, which is why I did N workouts instead of days."*
 *
 * His three questions have one answer: **a schedule is a promise the athlete never made**, so every
 * day it can be broken. Nothing here is assigned to her. Onboarding already says how MANY days;
 * this says WHICH — from the only evidence there is, which is the days she has actually trained.
 *
 * ── ⚠️ WHY IT MAY ANSWER "I DO NOT KNOW YET", AND WHY THAT MATTERS MOST ─────────────────────────
 * `null` is the important return, not the fallback. In week one there is no pattern, and naming
 * weekdays from one session would be the app guessing at her life — the exact thing the product
 * refuses to do everywhere else (`hypertrophy-only`: it acts on recorded facts, never on theory).
 *
 * So the week has NO weekday labels until it has earned them, and until then Home counts instead —
 * which is the founder's own N-workouts model, unchanged. **The week earns its days**, and the
 * change arrives as a reward rather than as a setup step nobody wanted to fill in.
 *
 * ── WHAT A MISSED DAY COSTS ─────────────────────────────────────────────────────────────────────
 * Nothing. A weekday is expected because she trained on it, and it stops being expected when she
 * stops. There is no "missed", no catch-up, and no state anywhere that records a broken promise —
 * the pattern was simply wrong, and the pattern is the only thing that changes.
 *
 * Pure & I/O-free: same sessions in, same days out, on any device, forever.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import type { Session } from '@/data/local/models';
import type { Weekday } from '@/domain/coachPlan';

const WEEKDAY_OF: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * How far back the pattern looks.
 *
 * Three weeks: long enough that one strange week (a holiday, an illness) cannot rewrite her days,
 * short enough that a genuine change of routine is reflected inside a month. A longer window would
 * keep insisting on the days of a job she has left.
 */
export const PATTERN_WINDOW_WEEKS = 3;
const DAY_MS = 86_400_000;

/**
 * How many times a weekday must appear before it is HERS.
 *
 * Two. One is an event; two inside three weeks is a habit. It also means a single session can never
 * put a weekday on her screen, which is the failure mode that would make the whole feature feel
 * like the app inventing a routine for her.
 */
export const OCCURRENCES_FOR_A_DAY = 2;

/**
 * The least history the pattern will speak from at all.
 *
 * Two full weeks. Below that even a repeated weekday is one week's coincidence, and the honest
 * answer is the numbered column.
 */
export const MIN_HISTORY_DAYS = 14;

/** A session that actually happened — the only kind that is evidence of anything. */
function trained(s: Session): boolean {
  return s.state === 'SAVED' && s.sets.length > 0;
}

/**
 * The weekdays she trains on, or `null` when there is not enough to say.
 *
 * @param history her sessions, in any order
 * @param daysPerWeek what she told onboarding — the CEILING on how many days may be named
 * @param nowMs      the moment the window is measured back from
 */
export function trainingDays(
  history: Session[],
  daysPerWeek: number | undefined,
  nowMs: number,
): Set<Weekday> | null {
  const done = history.filter(trained);
  if (done.length === 0) return null;

  /*
   * ⚠️ THE WINDOW IS MEASURED FROM HER FIRST SESSION, NOT FROM TODAY'S DATE. An athlete who joined
   * five days ago has five days of history however long the app has been installed, and asking
   * whether `now - firstSession >= 14 days` is the question that actually matters. Using the window
   * start would have let a single old session two months back satisfy the floor.
   */
  const starts = done.map((s) => Date.parse(s.startedAt)).filter((n) => Number.isFinite(n));
  if (starts.length === 0) return null;
  const first = Math.min(...starts);
  if (nowMs - first < MIN_HISTORY_DAYS * DAY_MS) return null;

  const from = nowMs - PATTERN_WINDOW_WEEKS * 7 * DAY_MS;
  const counts = new Map<Weekday, number>();
  for (const at of starts) {
    if (at < from || at > nowMs) continue;
    const day = WEEKDAY_OF[new Date(at).getDay()];
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const qualified = [...counts.entries()]
    .filter(([, n]) => n >= OCCURRENCES_FOR_A_DAY)
    /*
     * Most-trained first, and ties broken by the WEEK's own order rather than by insertion — a tie
     * resolved by Map ordering would put a different day on her screen depending on which session
     * happened to be logged first, which is a coin toss wearing a rule's clothes.
     */
    .sort((a, b) => b[1] - a[1] || WEEKDAY_OF.indexOf(a[0]) - WEEKDAY_OF.indexOf(b[0]));

  if (qualified.length === 0) return null;

  /*
   * ⚠️ HER OWN ANSWER IS THE CEILING. If she trains five days and told us four, naming five would
   * be the app overruling the one number she actually gave it. The extra day is real and it belongs
   * to her, not on a plan that says four.
   */
  const cap = daysPerWeek && daysPerWeek > 0 ? daysPerWeek : qualified.length;
  return new Set(qualified.slice(0, cap).map(([d]) => d));
}

/**
 * The week's seven days in the order she reads them, each with what is on it.
 *
 * ⚠️ SUNDAY-FIRST, because both languages this app ships in start their week there. When the
 * calendar this is drawn against changes, it changes here and nowhere else.
 */
export const WEEK_ORDER: readonly Weekday[] = WEEKDAY_OF;
