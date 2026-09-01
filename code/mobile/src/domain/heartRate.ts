/**
 * ════ A HEART RATE IS ONLY LIVE WHILE IT IS FRESH ════
 *
 * Founder 2026-07-29: *"for an athlete with a watch we already have the heart rate from HealthKit —
 * why not show it? We already did it with the calories."*
 *
 * One correction that shapes this file: **the calories are not from Health.** They are computed
 * from distance × bodyweight (`cardioMath.kcalForKm`), which is why they can never be stale — they
 * are derived from a number we measured a second ago. Heart rate is the opposite: it is READ, from
 * a store somebody else writes to, on their schedule.
 *
 * And that schedule is not ours. An Apple Watch writes heart rate to HealthKit in BATCHES — every
 * few seconds while it knows a workout is running, and only every few MINUTES when it does not.
 * Hush does not start a workout session on the wrist (watch HealthKit is deliberately unprovisioned),
 * so on a plain run the newest sample in Health is routinely two, five, ten minutes old.
 *
 * Drawing that number under a live clock is the same lie as "5:39 /km" on a phone sitting on a
 * table — the exact defect the cardio gates were rebuilt to kill. So the rule is the same shape:
 * **a reading is drawn only while it is recent enough to still be about now.** Older than that, the
 * screen shows a dash, which is honest and costs nothing.
 *
 * Pure & I/O-free. The gate is here so the same rule holds for the live row, the average, and
 * anything that reads it later.
 */

// 

import type { HeartRateSample } from '@/platform/health/healthModel';

/**
 * How old a reading may be and still be called LIVE.
 *
 * 90 seconds, and the number comes from the write cadence rather than from taste: a watch that is
 * tracking movement writes at least once a minute, so a sample older than a minute and a half means
 * the watch is not writing about this run — she left it on the charger, or Health has nothing to
 * say. Tighter and a normal batching gap would blink the number in and out; looser and a reading
 * from the walk to the gym would sit under a live clock claiming to be her pulse.
 */
export const HR_FRESH_MS = 90_000;

/** Physiological bounds. Anything outside them is a bad read, not a heartbeat. */
export const HR_MIN_BPM = 30;
export const HR_MAX_BPM = 240;

/** The reading to DRAW right now, or null for the dash. */
export function liveHeartRate(sample: HeartRateSample | null | undefined, nowMs: number): number | null {
  if (!sample) return null;
  const { bpm, atMs } = sample;
  if (!Number.isFinite(bpm) || bpm < HR_MIN_BPM || bpm > HR_MAX_BPM) return null;
  // A sample stamped in the FUTURE is a clock disagreement, not a fresh reading — treated as
  // fresh rather than discarded (the clocks are seconds apart at worst, and refusing it would
  // blank a perfectly good pulse), but an absurd one is caught by the age test below.
  const age = nowMs - atMs;
  if (age > HR_FRESH_MS || age < -HR_FRESH_MS) return null;
  return Math.round(bpm);
}

/**
 * The average to SAVE on the finished activity, from every live reading it collected.
 *
 * Only readings that were live when they were taken are in this list, so the average inherits the
 * freshness rule rather than re-deriving it. An activity that never saw one saves NO average —
 * `undefined`, not zero: `Session.avgHr` is documented as "present only when a heart-rate source
 * was available", and a 0 bpm on a summary card is worse than a dash.
 */
export function averageHeartRate(readings: readonly number[]): number | undefined {
  if (readings.length === 0) return undefined;
  return Math.round(readings.reduce((a, b) => a + b, 0) / readings.length);
}
