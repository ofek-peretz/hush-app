/**
 * ════ ONE RUN, TWO GPS PATHS, ONE DISTANCE ════
 *
 * The run is now a module singleton (`cardioRun`) fed by BOTH the foreground watcher and the
 * background TaskManager task, because a task can be woken with no React tree at all. iOS does not
 * stop the task while the app is on screen, so in the foreground **every fix arrives twice** — and
 * a background delivery arrives BATCHED, i.e. several fixes at once, after the foreground has
 * already moved past them.
 *
 * A duplicate is harmless on its own (`dtS <= 0` fails `segmentCounts`). What is not harmless is
 * that it would still overwrite the chain's last point, rewinding it to somewhere already
 * travelled — so the next fix re-measures a segment the run has already counted. A 10 km run
 * reports 15. That is what the monotonic guard exists for, and this file is the proof.
 */
// @ts-nocheck

// 

jest.mock('@/platform/notifications', () => ({ notifier: { kilometre: async () => {} } }));

import { beginRun, endRun, ingestFix, setPaused, snapshot, setHeartRate } from '@/platform/cardio/cardioRun';

const T0 = Date.parse('2026-07-29T09:00:00.000Z');

/**
 * A straight line north at ~3 m/s, one fix a second — a real, coherent run: it holds, it agrees
 * with its own Doppler, and it leaves its origin (the three things `cardioMath` asks for).
 */
const M_PER_DEG_LAT = 111_320;
const leg = (i: number) => ({
  lat: 32.0 + (i * 3) / M_PER_DEG_LAT,
  lon: 34.8,
  tsMs: T0 + i * 1000,
  accuracyM: 5,
  speedMs: 3,
});

/** Feed n seconds of that run through one path. */
function run(from: number, to: number, feed: (f: ReturnType<typeof leg>) => void = ingestFix) {
  for (let i = from; i <= to; i++) feed(leg(i));
}

beforeEach(() => {
  endRun();
  beginRun('run', 75);
  setPaused(false);
});
afterEach(() => endRun());

describe('the monotonic guard', () => {
  it('a straight run accrues the distance it actually covered', () => {
    run(0, 60);
    // 60 s at 3 m/s ≈ 180 m. The first fix seeds the chain and credits nothing.
    expect(snapshot().distanceKm).toBeGreaterThan(0.15);
    expect(snapshot().distanceKm).toBeLessThan(0.19);
  });

  it('THE SAME FIXES DELIVERED TWICE DO NOT DOUBLE THE DISTANCE', () => {
    run(0, 60);
    const once = snapshot().distanceKm;
    // The background task replaying exactly what the foreground already fed.
    run(0, 60);
    expect(snapshot().distanceKm).toBe(once);
  });

  it('…and interleaved delivery — the shape the two paths really produce — is identical', () => {
    const solo = (() => {
      run(0, 30);
      const d = snapshot().distanceKm;
      endRun();
      beginRun('run', 75);
      setPaused(false);
      return d;
    })();
    for (let i = 0; i <= 30; i++) {
      ingestFix(leg(i)); // foreground
      ingestFix(leg(i)); // …and the task, the same instant
    }
    expect(snapshot().distanceKm).toBeCloseTo(solo, 6);
  });

  it('a BATCH that arrives late cannot rewind the chain and re-count the ground', () => {
    run(0, 30);
    const ahead = snapshot().distanceKm;
    // The task wakes and hands over fixes 10–20 — ground already covered. Without the guard the
    // chain would jump back to fix 10 and the next live fix would re-measure 20 seconds of running.
    run(10, 20);
    expect(snapshot().distanceKm).toBe(ahead);
    run(31, 40);
    // Only the ten NEW seconds were added — ~30 m, never the replayed stretch.
    expect(snapshot().distanceKm - ahead).toBeLessThan(0.04);
  });
});

describe('the run is still the run', () => {
  it('a stationary phone records nothing at all — the chair, indoors', () => {
    for (let i = 0; i <= 60; i++) {
      // Jitter around one spot: WiFi trilateration's shape — it never leaves its origin.
      ingestFix({
        lat: 32.0 + (i % 2 ? 0.00008 : -0.00008),
        lon: 34.8 + (i % 3 ? 0.00008 : -0.00008),
        tsMs: T0 + i * 1000,
        accuracyM: 18,
        speedMs: 2.4, // the lie a hop hands us
      });
    }
    expect(snapshot().distanceKm).toBe(0);
    expect(snapshot().route).toEqual([]);
  });

  it('a pause credits nothing across it, and the clock stops with it', () => {
    run(0, 20);
    const atPause = snapshot();
    setPaused(true);
    // Fixes keep arriving from a task that does not know she stopped.
    run(21, 40);
    expect(snapshot().distanceKm).toBe(atPause.distanceKm);
  });

  it('heart rate is the last LIVE reading, and the average is every one of them', () => {
    setHeartRate(140);
    setHeartRate(160);
    expect(snapshot().hr).toBe(160);
    expect(snapshot().avgHr).toBe(150);
    // A refused reading blanks the row rather than holding the last number it liked.
    setHeartRate(null);
    expect(snapshot().hr).toBeNull();
    expect(snapshot().avgHr).toBe(150); // …and never joins the average
  });

  it('a run with no live reading saves no average — not a zero', () => {
    run(0, 20);
    expect(snapshot().avgHr).toBeUndefined();
  });
});
