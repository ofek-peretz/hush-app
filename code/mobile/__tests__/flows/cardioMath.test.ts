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
  requiredDepartureM,
  MIN_MOVING_RUN,
  MIN_DEPARTURE_M,
  kcalForKm,
  kcalPerKgKm,
  gaitFromPace,
  kcalForSegment,
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

  it('rejects USELESS fixes — but keeps the merely loose ones a real run produces', () => {
    // The cap is 30 m, not 20. A street of tall buildings or heavy tree cover reports 20–35 m
    // routinely, and a tighter cap would hand a real 10 km back to the athlete as 0.00 km. The
    // loose-but-real fix is kept and made to prove itself by DEPARTURE instead (movementCredit),
    // which is the honest test: go further than your own error bar.
    expect(segmentCounts({ ...good, accuracyM: 21 })).toBe(true); // a real run under trees
    expect(segmentCounts({ ...good, accuracyM: 29 })).toBe(true); // a real run in a city canyon
    expect(segmentCounts({ ...good, accuracyM: 31 })).toBe(false); // past this a fix says nothing
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
  const GOOD_FIX = 6; // metres of accuracy — an honest outdoor GPS fix
  const far = { movingRun: 0, departedM: 500, accuracyM: GOOD_FIX, proven: false };

  it('a lone plausible fix credits NOTHING — one fix is noise, a run of them is a person', () => {
    const c = movementCredit(true, far);
    expect(c.counts).toBe(false);
    expect(c.movingRun).toBe(1);
    expect(c.proven).toBe(false);
  });

  it('credits once the movement has held AND the athlete has left where they started', () => {
    const c = movementCredit(true, { ...far, movingRun: MIN_MOVING_RUN - 1, departedM: MIN_DEPARTURE_M });
    expect(c.counts).toBe(true);
    expect(c.proven).toBe(true);
  });

  it('never credits while the athlete is still orbiting the origin — jitter goes nowhere', () => {
    let state = { movingRun: 0, departedM: 12, accuracyM: 14, proven: false };
    for (let i = 0; i < 200; i++) {
      const c = movementCredit(true, state);
      expect(c.counts).toBe(false);
      state = { ...state, movingRun: c.movingRun, proven: c.proven };
    }
  });

  it('YOU MUST OUT-MOVE YOUR OWN ERROR BAR — a loose fix has to go further to be believed', () => {
    // A ±30 m fix can land 30 m from the truth while the phone has not moved. Asking it for a
    // flat 25 m departure asks it for less than its own noise, which is asking for nothing.
    expect(requiredDepartureM(6)).toBe(MIN_DEPARTURE_M); // a tight fix: the floor governs
    expect(requiredDepartureM(30)).toBe(60); // a loose one: twice its uncertainty
    expect(requiredDepartureM(null)).toBe(60); // unknown accuracy is treated as the worst case

    const loose = { movingRun: MIN_MOVING_RUN, departedM: 40, accuracyM: 30, proven: false };
    expect(movementCredit(true, loose).counts).toBe(false); // 40 m is inside a ±30 m fix's noise
    expect(movementCredit(true, { ...loose, departedM: 61 }).counts).toBe(true); // 61 m is not
  });

  it('a single implausible fix breaks the RUN but never un-proves the activity', () => {
    const c = movementCredit(false, { movingRun: 9, departedM: 500, accuracyM: GOOD_FIX, proven: true });
    expect(c).toEqual({ counts: false, movingRun: 0, proven: true });
  });

  it('THE TRAFFIC LIGHT: a proven runner who stops and starts loses nothing', () => {
    // The proof is about the ACTIVITY — this person is outdoors and running. Re-demanding it
    // after every stop would throw away three fixes each time, which over a city 10 km is a
    // hundred metres of real distance surrendered to guard against a chair they are not in.
    let state = { movingRun: 6, departedM: 900, accuracyM: GOOD_FIX, proven: true };
    // …stopped at the light: the fixes stop looking like movement.
    for (let i = 0; i < 20; i++) {
      const c = movementCredit(false, state);
      expect(c.counts).toBe(false);
      state = { ...state, movingRun: c.movingRun, proven: c.proven };
    }
    // …green. The very first stride back is credited — no re-trial.
    const first = movementCredit(true, state);
    expect(first.counts).toBe(true);
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

    let state = { movingRun: 0, proven: false };
    let distM = 0;
    let routePoints = 0;
    for (const f of fixes) {
      const plausible = segmentCounts(f);
      const credit = movementCredit(plausible, {
        movingRun: state.movingRun,
        departedM: f.departedM,
        accuracyM: f.accuracyM,
        proven: state.proven,
      });
      if (credit.counts) {
        distM += f.segmentM;
        routePoints++;
      }
      state = { movingRun: credit.movingRun, proven: credit.proven };
    }

    expect(distM).toBe(0);
    expect(routePoints).toBe(0);
  });

  it('THE CITY RUNNER: a real run under tall buildings is credited, not zeroed', () => {
    // The first cut of this fix capped accuracy at 20 m, which reads a street of tall buildings
    // (20–35 m fixes are routine there) as "not moving" and hands a real 10 km back as 0.00 km.
    // Zeroing a real run is a far worse failure than over-counting a chair.
    let state = { movingRun: 0, proven: false };
    let distM = 0;
    for (let i = 0; i < 1200; i++) {
      const f = { accuracyM: 24, dopplerSpeedMs: 3.2, segmentM: 3.2, dtS: 1 };
      const departedM = i * 3.2;
      const credit = movementCredit(segmentCounts(f), {
        movingRun: state.movingRun,
        departedM,
        accuracyM: f.accuracyM,
        proven: state.proven,
      });
      if (credit.counts) distM += f.segmentM;
      state = { movingRun: credit.movingRun, proven: credit.proven };
    }
    // Everything after the proof (a 24 m fix must depart 48 m ≈ 15 fixes) is credited in full.
    expect(distM / 1000).toBeGreaterThan(3.7);
  });

  it('THE REAL RUN: a clean 5 km is credited in full, from the third fix on', () => {
    let state = { movingRun: 0, proven: false };
    let distM = 0;
    let credited = 0;
    for (let i = 0; i < 1200; i++) {
      const f = { accuracyM: GOOD_FIX, dopplerSpeedMs: 3.2, segmentM: 3.2, dtS: 1 };
      const departedM = i * 3.2; // he is actually going somewhere
      const credit = movementCredit(segmentCounts(f), {
        movingRun: state.movingRun,
        departedM,
        accuracyM: f.accuracyM,
        proven: state.proven,
      });
      if (credit.counts) {
        distM += f.segmentM;
        credited++;
      }
      state = { movingRun: credit.movingRun, proven: credit.proven };
    }
    // Everything after the proof window is credited: 1200 fixes minus the handful spent clearing
    // MIN_MOVING_RUN and the 25 m departure (~8 fixes at 3.2 m each).
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

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * NOBODY IS ASKED WHETHER THEY ARE RUNNING.
 *
 * ⛔ FOUNDER, 2026-08-04: *"does she have to define a run or a walk? Or can we just derive it from
 * the GPS distance?"* — and she never was asked. The v7 cardio stage opens straight into tracking
 * with `gait` hard-coded to 'run', so every walk was billed at the running rate: 1.03 kcal/kg/km
 * against 0.55, nearly double, for as long as the picker has been gone.
 *
 * ── ⚠️ WHY THESE TESTS ARE ABOUT THE MIDDLE ─────────────────────────────────────────────────────
 * The two ends are arithmetic. The interesting property is that there is NO CLIFF: a threshold has
 * to be wrong somewhere and at 8 km/h it is wrong by 87%, which is a jogger losing half her
 * calories to one second of pace. ACSM's walking equation holds to 6.4 km/h and its running
 * equation from 8; between them neither applies, and the estimate moves continuously through the
 * span rather than jumping across it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the gait is measured, not declared', () => {
  const RUN = 3600 / 12; // 12 km/h — unambiguously running
  const WALK = 3600 / 5; // 5 km/h — unambiguously walking

  it('a real run bills at the running rate and a real walk at the walking one', () => {
    expect(kcalPerKgKm(RUN)).toBeCloseTo(1.03, 3);
    expect(kcalPerKgKm(WALK)).toBeCloseTo(0.55, 3);
  });

  it('⛔ and NOWHERE between them is there a cliff', () => {
    // Walked across the whole ambiguous span one second of pace at a time: no neighbouring pair may
    // differ by more than a hair. This is the assertion a threshold cannot pass.
    let prev = kcalPerKgKm(RUN);
    for (let p = 3600 / 12; p <= 3600 / 4; p += 1) {
      const here = kcalPerKgKm(p);
      expect(Math.abs(here - prev)).toBeLessThan(0.005);
      prev = here;
    }
  });

  it('and it never goes the wrong way — slower is never worth MORE per km', () => {
    for (let p = 3600 / 12; p <= 3600 / 4; p += 5) {
      expect(kcalPerKgKm(p + 5)).toBeLessThanOrEqual(kcalPerKgKm(p) + 1e-9);
    }
  });

  it('⚠️ a pace of zero is "not moving", and answers rather than throwing', () => {
    // It is reachable: `paceSec` is blanked the moment movement stops. No distance is credited
    // there either, so the rate it returns is never actually spent — but NaN would poison the total.
    expect(Number.isFinite(kcalPerKgKm(0))).toBe(true);
    expect(Number.isFinite(kcalPerKgKm(Number.NaN))).toBe(true);
  });

  it('the honesty rule survives: no bodyweight, no calories', () => {
    expect(kcalForSegment(5, RUN, null)).toBe(0);
    expect(kcalForSegment(5, RUN, 0)).toBe(0);
    expect(kcalForSegment(5, RUN, 80)).toBeCloseTo(412, 0);
  });

  it('⚠️ the LABEL is allowed a threshold because nothing is billed through it', () => {
    // A kilometre is tagged "walk" or not for the eye. The calories never round through this — that
    // is the whole point of the continuous rate above.
    expect(gaitFromPace(WALK)).toBe('walk');
    expect(gaitFromPace(RUN)).toBe('run');
    expect(gaitFromPace(0)).toBe('run'); // an activity too short to have a pace
  });
});
