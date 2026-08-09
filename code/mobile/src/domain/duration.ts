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
// @ts-nocheck

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
