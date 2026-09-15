/**
 * Weekly cadence. The training week is a fixed window that opens **Saturday at 20:30 local** and
 * runs to the next Saturday 20:30 — the moment the engine's updated plan swaps in for the coming
 * week. When all of a week's workouts are done the athlete is in Recovery until the next opening —
 * the next week is genuinely LOCKED until then (no starting early).
 *
 * THE HOUR IS 20:30, AND THE HOUR IS THE POINT (founder 2026-07-13). It was 23:59 — chosen as the
 * last possible instant of the week, which is exactly why nobody ever witnessed it: the update
 * landed while the athlete was asleep and was, by morning, indistinguishable from "the app just
 * looks like this". The weekly update is the one recurring proof that somebody is MANAGING this
 * program, and a proof nobody sees is not a proof. 20:30 on a Saturday is a waking hour on the
 * quietest evening of the week: the roll happens, the note arrives, and the athlete can open the
 * app and read what changed while it is still Saturday. (It moved from Sunday 04:00 to Sat 20:30
 * on 2026-07-09; this is the same boundary, moved to where it can be witnessed.)
 *
 * Also the source of the **training-week counter** ("Week N"), which appears all
 * over the product (Home meter, Recovery, the progress reports). Week 1 is the
 * week the account was created (`memberSince`); it increments each Saturday 20:30.
 *
 * Pure + I/O-free so it is fully unit-testable and deterministic given a clock.
 */

// 

import type { Program, ProgramDay, Session } from '@/data/local/models';
import { sessionTrained } from '@/domain/completion';

/*
 * ════ THE OPENING DAY IS HERS TO MOVE (2026-09-01, audit finding 07) ═══════════════════════════
 *
 * Saturday 20:30 STAYS THE DEFAULT — the founder's witnessable hour, unchanged for every athlete
 * who never touches the control and for every existing test. What changed is only that the DAY is
 * a preference now (`Profile.weekOpensDow`, edited in You): Saturday evening is the quietest
 * evening of an Israeli week, and for most of the world that evening is Sunday. A weekly ritual
 * pinned to the wrong culture's calendar reads as a bug she cannot name.
 *
 * A LIVE BINDING + a clamped setter, the same shape as `FREE_SESSION_LIMIT`: every reader — the
 * cadence walkers below, the weekly note's trigger — reads the binding at use time, so the roll,
 * the letter and the lock can never disagree about when the week turns. The HOUR stays fixed:
 * one witnessable evening hour is the product's call, not a preference to fragment.
 */
export let WEEK_OPEN_DOW = 6; // Saturday (JS Date.getDay(): 0=Sun … 6=Sat) — the default
export const WEEK_OPEN_HOUR = 20; // 20:xx local
export const WEEK_OPEN_MINUTE = 30; // :30 — the updated plan swaps in at 20:30 (founder 2026-07-13)

/** Apply her preference (boot / the You control). Anything not a real weekday leaves the default. */
export function applyWeekOpenDow(dow: unknown): void {
  if (typeof dow !== 'number' || !Number.isInteger(dow) || dow < 0 || dow > 6) return;
  WEEK_OPEN_DOW = dow;
}
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The most recent Saturday-20:30 at or before `nowMs` — the start of the current
 * training week. Built from local Y/M/D parts so it is DST-correct (always lands
 * on a real local 20:30, never drifting by the DST hour).
 */
export function currentWeekOpen(nowMs: number): number {
  const d = new Date(nowMs);
  let c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), WEEK_OPEN_HOUR, WEEK_OPEN_MINUTE, 0, 0);
  while (c.getTime() > nowMs || c.getDay() !== WEEK_OPEN_DOW) {
    c = new Date(c.getFullYear(), c.getMonth(), c.getDate() - 1, WEEK_OPEN_HOUR, WEEK_OPEN_MINUTE, 0, 0);
  }
  return c.getTime();
}

/**
 * The first Saturday-20:30 strictly AFTER `afterMs` — when the next training week
 * opens / unlocks.
 */
export function nextWeekOpen(afterMs: number): number {
  const d = new Date(afterMs);
  let c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), WEEK_OPEN_HOUR, WEEK_OPEN_MINUTE, 0, 0);
  while (c.getTime() <= afterMs || c.getDay() !== WEEK_OPEN_DOW) {
    c = new Date(c.getFullYear(), c.getMonth(), c.getDate() + 1, WEEK_OPEN_HOUR, WEEK_OPEN_MINUTE, 0, 0);
  }
  return c.getTime();
}

/**
 * 1-based training-week number for "Week N", counted in Saturday-20:30 windows
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar days from `nowMs` through `untilMs` inclusive (e.g. Thu → Sat = 3). */
export function trainableDaysUntil(nowMs: number, untilMs: number): number {
  const a = new Date(nowMs);
  const b = new Date(untilMs);
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.max(0, Math.round((b0 - a0) / DAY_MS) + 1);
}

/**
 * The week-open the FIRST bucket (onboarding) is built for (founder 2026-07-10):
 * a mid-week signup whose remaining calendar days cannot fit the chosen weekly
 * frequency (e.g. Thursday + 4×/week) would otherwise lose its very first program
 * at the coming Saturday 20:30 with no chance of completing it. In that case the
 * bucket is stamped as built for the NEXT open, so it survives the first roll and
 * the athlete gets a full runway; from then on the calendar rhythm applies
 * unchanged. A signup whose window fits (e.g. Sunday + 4×) anchors normally.
 */
export function firstBucketOpen(nowMs: number, daysPerWeek: number): number {
  const next = nextWeekOpen(nowMs);
  return trainableDaysUntil(nowMs, next) >= daysPerWeek ? currentWeekOpen(nowMs) : next;
}

/**
 * The "Week N" shown on product surfaces. While the (possibly extended) first
 * bucket is still ahead of the calendar (`bucketOpenMs` in the future — only ever
 * true for a mid-week signup's first bucket), the athlete is still in week 1;
 * afterwards it is the plain Saturday-window count since the account was created.
 */
export function displayWeekNumber(
  memberSinceIso: string | null | undefined,
  bucketOpenMs: number | null,
  nowMs: number,
): number {
  if (bucketOpenMs != null && bucketOpenMs > nowMs) return 1;
  return trainingWeekNumber(memberSinceIso, nowMs);
}

/**
 * The instant the CURRENT week's work started counting. Normally the bucket's own anchor, but a
 * first bucket stamped for the NEXT open (mid-week signup, `firstBucketOpen`) lies in the FUTURE —
 * its work starts NOW, so it clamps to the current calendar week-open.
 */
export function bucketStart(bucketOpenMs: number | null, nowMs: number): number {
  const current = currentWeekOpen(nowMs);
  return Math.min(bucketOpenMs ?? current, current);
}

/**
 * Re-apply this week's DONE flags to a program from the session history — the single place that
 * answers "which of these workouts did the athlete already train this week?".
 *
 * Needed in two situations: healing a crashed completion at boot (a kill between the history write
 * and the flag write), and after ANY mid-week regeneration (a volume or FREQUENCY change), because
 * generateProgram returns fresh days with `completed: false` and would otherwise re-offer a workout
 * the athlete already trained.
 *
 * A session is matched by its captured day NAME first — stable across a re-split, where the
 * positional `day_N` ids shift (4×/week `day_3` = "Upper B" but 5×/week `day_3` = "Push B") —
 * falling back to the id for sessions saved before names were captured.
 *
 * Only a TRAINED session finishes a workout (domain/completion): a PARTIAL session — under half the
 * prescribed sets — leaves the workout on the week's list, and this heal must never quietly promote
 * it to done. Pure: returns the healed program, or null when nothing changed.
 */
export function healWeekCompletion(
  program: Program,
  history: Session[],
  bucketOpenMs: number | null,
  nowMs: number,
): Program | null {
  const start = bucketStart(bucketOpenMs, nowMs);
  const thisWeek = history.filter((s) => Date.parse(s.startedAt) >= start);
  const matches = (d: ProgramDay, s: Session) =>
    s.programDayName ? s.programDayName === d.name : s.programDayId === d.id;
  const days = program.days.map((d) =>
    !d.completed && !d.isRest && thisWeek.some((s) => matches(d, s) && sessionTrained(s, d))
      ? { ...d, completed: true }
      : d,
  );
  return days.some((d, i) => d.completed !== program.days[i].completed) ? { ...program, days } : null;
}

/**
 * Whether the weekly bucket must be regenerated NOW (calendar-primary cadence). True when there is
 * no bucket yet, or the calendar week has advanced past the Saturday-20:30 the current bucket was
 * built for. Completion is deliberately irrelevant — the roll is purely the Saturday-20:30 boundary,
 * so finishing early never rolls and an unfinished week never blocks the roll. `builtForMs == null`
 * WITH an existing bucket is pre-upgrade state → do NOT roll (the caller adopts it into the current
 * week), so upgrading never wipes an in-progress week.
 */
export function shouldRollWeek(builtForMs: number | null, hasProgram: boolean, nowMs: number): boolean {
  if (!hasProgram) return true;
  if (builtForMs == null) return false;
  return currentWeekOpen(nowMs) > builtForMs;
}
