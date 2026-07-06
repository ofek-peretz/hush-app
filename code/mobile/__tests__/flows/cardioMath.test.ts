/**
 * Cardio honesty gates (founder review, 2026-07-06).
 *
 * Build #22 shipped a SIMULATED tracker: a phone lying on a table showed
 * 0.11 km · 5:39 /km · 7 kcal · 147 bpm. The replacement accrues distance only
 * through `segmentCounts` over real GPS fixes. These tests pin the gate so the
 * stationary-indoor case can never read as movement again, and the estimators
 * stay distance-based (no distance ⇒ no calories; no bodyweight ⇒ no guess).
 */
import {
  segmentCounts,
  kcalForKm,
  haversineM,
  fmtPace,
  fmtClock,
} from '@/platform/cardio/cardioMath';

describe('segmentCounts — the stationary-indoor case never accrues distance', () => {
  const good = { accuracyM: 8, dopplerSpeedMs: 2.8, segmentM: 3.1, dtS: 1.1 };

  it('accepts an honest running segment', () => {
    expect(segmentCounts(good)).toBe(true);
  });

  it('rejects position jitter while standing still (Doppler ~0)', () => {
    // Indoors, position wobbles by meters while Doppler speed stays near zero —
    // exactly the screenshot scenario. The wobble must not count.
    expect(segmentCounts({ ...good, dopplerSpeedMs: 0.1, segmentM: 2.4 })).toBe(false);
    expect(segmentCounts({ ...good, dopplerSpeedMs: 0 })).toBe(false);
    expect(segmentCounts({ ...good, dopplerSpeedMs: -1 })).toBe(false); // iOS invalid marker
    expect(segmentCounts({ ...good, dopplerSpeedMs: null })).toBe(false);
  });

  it('rejects loose fixes (indoor accuracy is typically tens of meters)', () => {
    expect(segmentCounts({ ...good, accuracyM: 31 })).toBe(false);
    expect(segmentCounts({ ...good, accuracyM: 65 })).toBe(false);
    expect(segmentCounts({ ...good, accuracyM: null })).toBe(false);
  });

  it('rejects teleports, sub-meter noise, and broken time deltas', () => {
    expect(segmentCounts({ ...good, segmentM: 40, dtS: 1 })).toBe(false); // 40 m/s jump
    expect(segmentCounts({ ...good, segmentM: 0.4 })).toBe(false); // sub-meter noise
    expect(segmentCounts({ ...good, dtS: 0 })).toBe(false);
    expect(segmentCounts({ ...good, dtS: 30 })).toBe(false); // gap breaks the segment
  });

  it('accepts a brisk walk (the slowest honest movement)', () => {
    expect(segmentCounts({ accuracyM: 12, dopplerSpeedMs: 1.3, segmentM: 1.4, dtS: 1 })).toBe(true);
  });
});

describe('kcalForKm — distance-based, never guessed', () => {
  it('zero distance ⇒ zero calories (the stationary session reads ~0 kcal)', () => {
    expect(kcalForKm(0, 'run', 80)).toBe(0);
  });
  it('unknown bodyweight ⇒ 0 (omitted downstream), never a default-person guess', () => {
    expect(kcalForKm(5, 'run', undefined)).toBe(0);
    expect(kcalForKm(5, 'run', null)).toBe(0);
    expect(kcalForKm(5, 'run', 0)).toBe(0);
  });
  it('scales with weight, distance, and gait', () => {
    expect(kcalForKm(5, 'run', 80)).toBeCloseTo(412, 0);
    expect(kcalForKm(5, 'walk', 80)).toBeCloseTo(220, 0);
    expect(kcalForKm(5, 'run', 80)).toBeGreaterThan(kcalForKm(5, 'walk', 80));
  });
});

describe('haversineM — real-world sanity', () => {
  it('zero for the same point', () => {
    expect(haversineM(32.0853, 34.7818, 32.0853, 34.7818)).toBe(0);
  });
  it('~111 km per degree of latitude', () => {
    const d = haversineM(32, 34.78, 33, 34.78);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_500);
  });
  it('meters-scale for a one-second running stride', () => {
    // ~3 m northward at Tel Aviv latitude.
    const d = haversineM(32.08530, 34.78180, 32.08533, 34.78180);
    expect(d).toBeGreaterThan(2.5);
    expect(d).toBeLessThan(4.5);
  });
});

describe('pace/clock formatting stays honest at the edges', () => {
  it('no movement ⇒ "--:--", never a fabricated pace', () => {
    expect(fmtPace(0)).toBe('--:--');
    expect(fmtPace(-5)).toBe('--:--');
    expect(fmtPace(Infinity)).toBe('--:--');
  });
  it('normal pace and clock render', () => {
    expect(fmtPace(342)).toBe('5:42');
    expect(fmtClock(39)).toBe('0:39');
    expect(fmtClock(3671)).toBe('1:01:11');
  });
});
