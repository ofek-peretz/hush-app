/**
 * ════ A HEART RATE IS ONLY LIVE WHILE IT IS FRESH ════
 *
 * Founder 2026-07-29: show heart rate during a run, from the watch, by way of HealthKit.
 *
 * The reason this needs a gate at all — and a test — is that a watch writes to HealthKit on ITS
 * schedule, in batches, and only samples every few minutes when it does not think a workout is
 * running. Hush does not start a workout session on the wrist, so "the latest sample in Health" is
 * routinely minutes old. Drawing that under a live clock is the same class of lie as "5:39 /km" on
 * a phone sitting on a table, which is the defect the whole cardio module was rebuilt around.
 */
// @ts-nocheck

// 

import {
  liveHeartRate,
  averageHeartRate,
  HR_FRESH_MS,
  HR_MIN_BPM,
  HR_MAX_BPM,
} from '@/domain/heartRate';

const NOW = Date.parse('2026-07-29T10:00:00.000Z');
const at = (agoMs: number) => NOW - agoMs;

describe('what may be drawn as a live pulse', () => {
  it('a reading from a second ago is her pulse', () => {
    expect(liveHeartRate({ bpm: 148.4, atMs: at(1_000) }, NOW)).toBe(148);
  });

  it('…and a reading from ten minutes ago is a DASH, not a pulse', () => {
    // The exact failure this file exists for: a watch that batched its writes, or was left on the
    // charger. The number is real; it is simply not about now.
    expect(liveHeartRate({ bpm: 148, atMs: at(10 * 60_000) }, NOW)).toBeNull();
  });

  it('the boundary is the window, and it is not off by a sample', () => {
    expect(liveHeartRate({ bpm: 120, atMs: at(HR_FRESH_MS - 1) }, NOW)).toBe(120);
    expect(liveHeartRate({ bpm: 120, atMs: at(HR_FRESH_MS + 1) }, NOW)).toBeNull();
  });

  it('no sample at all is a dash — never a zero, never a guess', () => {
    expect(liveHeartRate(null, NOW)).toBeNull();
    expect(liveHeartRate(undefined, NOW)).toBeNull();
  });

  it('a physiologically impossible read is a bad read', () => {
    expect(liveHeartRate({ bpm: 0, atMs: NOW }, NOW)).toBeNull();
    expect(liveHeartRate({ bpm: HR_MIN_BPM - 1, atMs: NOW }, NOW)).toBeNull();
    expect(liveHeartRate({ bpm: HR_MAX_BPM + 1, atMs: NOW }, NOW)).toBeNull();
    expect(liveHeartRate({ bpm: Number.NaN, atMs: NOW }, NOW)).toBeNull();
  });

  it('a slightly future stamp is a clock disagreement, not a reason to blank her pulse', () => {
    // The phone and the watch are seconds apart at worst. Refusing this would drop good readings.
    expect(liveHeartRate({ bpm: 150, atMs: NOW + 2_000 }, NOW)).toBe(150);
    // …but a stamp from next week is not a clock skew.
    expect(liveHeartRate({ bpm: 150, atMs: NOW + 7 * 86_400_000 }, NOW)).toBeNull();
  });
});

describe('the average on the saved record', () => {
  it('is the mean of the live readings', () => {
    expect(averageHeartRate([140, 150, 160])).toBe(150);
  });

  it('an activity that never saw a live reading saves NO average — not a zero', () => {
    // `Session.avgHr` is documented "present only when a heart-rate source was available", and a
    // summary card reading "0 bpm" would be worse than the dash it replaces.
    expect(averageHeartRate([])).toBeUndefined();
  });

  it('inherits the freshness rule rather than re-deriving it', () => {
    // Only readings that passed `liveHeartRate` are ever collected, so the average cannot contain
    // a stale one. This pins the composition — the two functions must not drift apart.
    const samples = [
      { bpm: 140, atMs: at(1_000) },
      { bpm: 200, atMs: at(30 * 60_000) }, // stale: a reading from the drive over
      { bpm: 160, atMs: at(2_000) },
    ];
    const live = samples.map((s) => liveHeartRate(s, NOW)).filter((v): v is number => v != null);
    expect(live).toEqual([140, 160]);
    expect(averageHeartRate(live)).toBe(150);
  });
});
