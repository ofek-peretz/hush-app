/**
 * Duration presentation — ONE rule for the whole app (founder 2026-07-12).
 *
 * A RECORDED duration is always read in MINUTES ("63 min"), never as a clock
 * ("1:03"). "1:03" beside a date is ambiguous — it reads as one minute past one in
 * the morning — and a summary figure has no business making the athlete parse a
 * colon. Every completed-work figure (History rows, Well Done, the cardio record,
 * a workout's detail) goes through here.
 *
 * The one exception, deliberately: a LIVE clock still ticks as a clock. Mid-run the
 * athlete is reading seconds pass, not summarising a session — that surface keeps
 * `fmtClock` (mm:ss / h:mm:ss).
 */

// 


/** Minutes of a recorded duration, rounded to the nearest minute (never 0 for real work). */
export function durationMinutes(seconds: number): number {
  const s = Math.max(0, Math.round(seconds));
  if (s === 0) return 0;
  return Math.max(1, Math.round(s / 60));
}

/**
 * "63 min" — the app-wide recorded-duration label. `unit` is the localized "min"
 * (callers pass `t('common.minShort')`) so the rule holds in Hebrew too.
 */
export function fmtMinutes(seconds: number, unit: string): string {
  return `${durationMinutes(seconds)} ${unit}`;
}

/** Same, from milliseconds (session summaries carry ms). */
export function fmtMinutesFromMs(ms: number, unit: string): string {
  return fmtMinutes(ms / 1000, unit);
}

/**
 * A PLANNED duration — the estimate a workout card carries before it is trained.
 *
 * ⛔ ONE ROUNDING, EVERYWHERE (design review 2026-09-01). PreWorkout rounded the estimate to the
 * nearest five ("55 דקות") while the Program tab printed the raw figure ("57 דק׳") — the same
 * workout, two numbers, one tab apart, which is exactly the experience that teaches an athlete
 * not to trust numbers. An ESTIMATE stated to the minute also claims a precision the engine does
 * not have; five is the honest step. Every surface that prints a planned duration calls this.
 */
export function plannedMinutes(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

/**
 * ⛔ ONE DATE ON EVERY POSTER (design review 2026-09-01). WellDone printed "1 ספטמבר" (no ב,
 * no year), the milestone screen "1 בספטמבר 2026" (full), one screen apart. The rule: day + month
 * in the locale's own composed form, and the year ONLY once the date has left the current year —
 * a keepsake needs a year in January, not in the week it was earned.
 */
export function posterDate(d: Date, locale: string, now: Date = new Date()): string {
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}
