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
  movementCredit,
  MIN_MOVING_RUN,
  MIN_DEPARTURE_M,
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
    expect(segmentCounts({ ...good, accuracyM: 21 })).toBe(false);
    expect(segmentCounts({ ...good, accuracyM: 31 })).toBe(false);
    expect(segmentCounts({ ...good, accuracyM: 65 })).toBe(false);
    expect(segmentCounts({ ...good, accuracyM: null })).toBe(false);
  });

  it('rejects the INCOHERENT segment — a WiFi hop wearing a runner\'s speed', () => {
    // The chair session (founder, 2026-07-12): indoors, iOS trilaterates off WiFi. It reports a
    // flattering accuracy, hops 15 m between reference points, and derives a "speed" from those
    // hops — so the fix arrives looking like a person running. What gives it away is that the
    // geometry and the Doppler disagree: a real runner covers ≈ speed × dt, a hop does not.
    expect(segmentCounts({ accuracyM: 14, dopplerSpeedMs: 3.7, segmentM: 15, dtS: 1 })).toBe(false); // 15 m/s geo vs 3.7 doppler
    expect(segmentCounts({ accuracyM: 14, dopplerSpeedMs: 3.0, segmentM: 1.1, dtS: 1 })).toBe(false); // doppler claims 3 m/s, went 1.1 m
    // …while a real runner's two numbers agree, and pass.
    expect(segmentCounts({ accuracyM: 6, dopplerSpeedMs: 3.2, segmentM: 3.3, dtS: 1 })).toBe(true);
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

describe('movementCredit — the movement has to prove itself (founder 2026-07-12)', () => {
  it('a lone plausible fix credits NOTHING — one fix is noise, a run of them is a person', () => {
    const c = movementCredit(true, { movingRun: 0, departedM: 100 });
    expect(c.counts).toBe(false);
    expect(c.movingRun).toBe(1);
  });

  it('credits once the movement has held AND the athlete has left where they started', () => {
    const c = movementCredit(true, { movingRun: MIN_MOVING_RUN - 1, departedM: MIN_DEPARTURE_M });
    expect(c.counts).toBe(true);
  });

  it('never credits while the athlete is still orbiting the origin — jitter goes nowhere', () => {
    // Every fix looks like movement, forever, and the phone has not left the room.
    let state = { movingRun: 0, departedM: 12 };
    for (let i = 0; i < 200; i++) {
      const c = movementCredit(true, state);
      expect(c.counts).toBe(false);
      state = { movingRun: c.movingRun, departedM: 12 };
    }
  });

  it('a single implausible fix resets the proof — movement must be continuous', () => {
    expect(movementCredit(false, { movingRun: 9, departedM: 500 })).toEqual({ counts: false, movingRun: 0 });
  });

  it('THE CHAIR SESSION: sitting still indoors records 0.00 km and an EMPTY route', () => {
    // Replays the founder's session: he sat in a chair and did not move, and the summary drew a
    // 70 m zig-zag. Every fix here is the indoor worst case — flattering accuracy, a hop of a
    // few metres, and a Doppler speed that says "running".
    const fixes = Array.from({ length: 300 }, (_, i) => ({
      accuracyM: 12 + (i % 5),
      dopplerSpeedMs: 1.6 + (i % 3) * 0.7,
      segmentM: 3 + (i % 7),
      dtS: 1,
      departedM: (i % 9) * 2, // wanders around the chair, never leaves it
    }));

    let state = { movingRun: 0, departedM: 0 };
    let distM = 0;
    let routePoints = 0;
    for (const f of fixes) {
      const plausible = segmentCounts(f);
      const credit = movementCredit(plausible, { movingRun: state.movingRun, departedM: f.departedM });
      if (credit.counts) {
        distM += f.segmentM;
        routePoints++;
      }
      state = { movingRun: credit.movingRun, departedM: f.departedM };
    }

    expect(distM).toBe(0);
    expect(routePoints).toBe(0);
  });

  it('THE REAL RUN: a 5 km run is credited in full, from the third fix on', () => {
    let state = { movingRun: 0, departedM: 0 };
    let distM = 0;
    let credited = 0;
    for (let i = 0; i < 1200; i++) {
      const f = { accuracyM: 6, dopplerSpeedMs: 3.2, segmentM: 3.2, dtS: 1 };
      const departedM = i * 3.2; // he is actually going somewhere
      const credit = movementCredit(segmentCounts(f), { movingRun: state.movingRun, departedM });
      if (credit.counts) {
        distM += f.segmentM;
        credited++;
      }
      state = { movingRun: credit.movingRun, departedM };
    }
    // Everything after the proof window is credited: 1200 fixes minus the handful spent
    // clearing MIN_MOVING_RUN and the 25 m departure (~8 fixes at 3.2 m each).
    expect(credited).toBeGreaterThan(1180);
    expect(distM / 1000).toBeCloseTo(3.8, 1);
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
