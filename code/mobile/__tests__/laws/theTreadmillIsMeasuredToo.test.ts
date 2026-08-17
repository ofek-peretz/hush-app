// @ts-nocheck
import fs from 'fs';
import path from 'path';
import {
  beginRun,
  endRun,
  ingestStride,
  isIndoor,
  setPaused,
  snapshot,
} from '@/platform/cardio/cardioRun';
import { kcalPerKgKm, gaitFromPace } from '@/platform/cardio/cardioMath';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A TREADMILL IS MEASURED, NOT ESTIMATED FROM THE CLOCK.
 *
 * ⛔ FOUNDER, 2026-08-12: *"אני ארצה לעשות אפשרות לריצה והליכה גם בהליכון וגם בחוץ. אני לא יודע איך
 * APPLE WORKOUT יודעים בהליכון כמה המשתמש הלך אם לפי ה-GPS זה במקום."*
 *
 * They do not use GPS. `DistanceWalkingRunning` is written by the phone's motion coprocessor from
 * step cadence and a stride-length model calibrated against her outdoor GPS work — the same number
 * Apple's own indoor workouts report. **The read scope has held it since `healthKitGate` was
 * written and nothing had ever read it**, which is the third time that exact shape has turned up in
 * this file's neighbours (the heart rate and the external workouts were the first two).
 *
 * ⚠️ AND IT NEEDS NO WATCH — the question he asked before saying go. Core Motion is in the phone. A
 * watch improves the calibration and is not required; what a watch-less athlete loses indoors is
 * the HEART RATE, which the stage already draws as absent (`3.4g`).
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

afterEach(() => endRun());

describe('the indoor run credits what the phone measured', () => {
  it('⛔ credits the DELTA, never the running total', () => {
    /*
     * The reading is cumulative. Adding it whole on every poll would make a 5 km treadmill run
     * report 15 km inside a minute — the same defect the GPS path's monotonic guard exists for,
     * arriving through a different door.
     */
    beginRun('run', 70, true);
    // ⚠️ A RUN BEGINS PAUSED (`EMPTY().paused === true`) — the 3·2·1 countdown is what starts it.
    setPaused(false);
    ingestStride(0, 1_000); // the cursor only
    ingestStride(0.2, 61_000);
    ingestStride(0.4, 121_000);
    ingestStride(0.6, 181_000);
    expect(+snapshot().distanceKm.toFixed(3)).toBe(0.6);
  });

  it('⚠️ the first reading sets the cursor and credits nothing — there is no interval yet', () => {
    beginRun('run', 70, true);
    // ⚠️ A RUN BEGINS PAUSED (`EMPTY().paused === true`) — the 3·2·1 countdown is what starts it.
    setPaused(false);
    ingestStride(1.4, 1_000); // she walked to the gym with the phone in her pocket
    expect(snapshot().distanceKm).toBe(0);
  });

  it('⛔ a reading that goes backwards is dropped, not credited as negative distance', () => {
    beginRun('run', 70, true);
    // ⚠️ A RUN BEGINS PAUSED (`EMPTY().paused === true`) — the 3·2·1 countdown is what starts it.
    setPaused(false);
    ingestStride(0, 1_000);
    ingestStride(0.5, 61_000);
    ingestStride(0.3, 121_000); // a source resetting under us
    expect(+snapshot().distanceKm.toFixed(3)).toBe(0.5);
  });

  it('⚠️ standing still on a moving belt credits nothing and blanks the pace', () => {
    // The whole point of the outdoor gates, arriving on the indoor path: a phone that is not moving
    // must read 0.00 km and "--:--", never a pace inferred from elapsed time.
    beginRun('run', 70, true);
    // ⚠️ A RUN BEGINS PAUSED (`EMPTY().paused === true`) — the 3·2·1 countdown is what starts it.
    setPaused(false);
    ingestStride(0, 1_000);
    ingestStride(0.2, 61_000);
    expect(snapshot().paceSec).toBeGreaterThan(0);
    ingestStride(0.2, 121_000);
    expect(snapshot().paceSec).toBe(0);
    expect(+snapshot().distanceKm.toFixed(3)).toBe(0.2);
  });

  it('⛔ a PAUSE credits nothing, and the cursor still advances', () => {
    /*
     * Otherwise the walk to the water fountain arrives in one lump the moment she resumes — the
     * distance is real, the run it would be attributed to is not.
     */
    beginRun('run', 70, true);
    // ⚠️ A RUN BEGINS PAUSED (`EMPTY().paused === true`) — the 3·2·1 countdown is what starts it.
    setPaused(false);
    ingestStride(0, 1_000);
    setPaused(true);
    ingestStride(0.3, 61_000);
    setPaused(false);
    ingestStride(0.4, 121_000);
    expect(+snapshot().distanceKm.toFixed(3)).toBe(0.1);
  });

  it('⚠️ an OUTDOOR run ignores stride readings entirely', () => {
    // Both sources deliver whenever the app is on screen. Crediting both would double every run.
    beginRun('run', 70, false);
    setPaused(false);
    expect(isIndoor()).toBe(false);
    ingestStride(0, 1_000);
    ingestStride(1, 61_000);
    expect(snapshot().distanceKm).toBe(0);
  });

  it("⚠️ and it is never 'acquiring' — there is no satellite to wait for", () => {
    beginRun('run', 70, true);
    expect(snapshot().gps).toBe('ready');
  });
});

describe('⛔ the gait question answers itself indoors, exactly as it does outdoors', () => {
  /*
   * FOUNDER: *"האם זה באמת מחשב שונה הליכה או ריצה מבחינת המדדים? או שאפשר לעשות מצב קרדיו אחד?"*
   *
   * Distance, pace and time are the same arithmetic for both. **Only the energy differs**, and
   * `cardioMath` already interpolates it continuously between ACSM's walking equation (valid to
   * 6.4 km/h) and its running equation (valid from 8 km/h) rather than picking a side. So one mode
   * serves both, nobody is asked, and there is no cliff to land on the wrong side of.
   */
  it('a walking pace is billed as a walk and a running pace as a run — on the same run', () => {
    const walkPace = 3600 / 5; // 5 km/h
    const runPace = 3600 / 12; // 12 km/h
    expect(kcalPerKgKm(walkPace)).toBeLessThan(kcalPerKgKm(runPace));
    expect(gaitFromPace(walkPace)).toBe('walk');
    expect(gaitFromPace(runPace)).toBe('run');
  });

  it('⚠️ and a treadmill segment is billed at its OWN pace, not the session average', () => {
    // A walk-run interval on a belt is the case a single declared gait gets wrong in both
    // directions; `creditDistance` bills each segment as it is credited.
    beginRun('run', 70, true);
    // ⚠️ A RUN BEGINS PAUSED (`EMPTY().paused === true`) — the 3·2·1 countdown is what starts it.
    setPaused(false);
    ingestStride(0, 0);
    ingestStride(0.1, 120_000); // 0.1 km in 2 min → 3 km/h, a walk
    const afterWalk = snapshot().calories;
    ingestStride(0.6, 271_000); // 0.5 km in 2.5 min → 12 km/h, a run
    const runOnly = snapshot().calories - afterWalk;
    // Five times the distance at more than five times the cost — because the rate rose too.
    expect(runOnly / afterWalk).toBeGreaterThan(5);
  });
});

describe('⛔ and the wire reaches the screen', () => {
  const tracker = () => read('src/platform/cardio/cardioTracker.ts');
  const cardio = () => read('src/screens/cardio/Cardio.tsx');

  it('the indoor poll feeds `ingestStride`, and the GPS watcher never opens beside it', () => {
    /*
     * ⚠️ TWO SOURCES RUNNING TOGETHER WOULD DOUBLE THE RUN. `ingestStride` refuses outdoors and
     * `ingestFix` credits nothing from a stationary phone, so nothing would actually be counted
     * twice — but a treadmill session that ASKS for location spends the battery on a receiver
     * watching a stationary phone, and burns the one permission prompt she will ever grant on a
     * belt. Both effects are gated on the mode.
     */
    expect(tracker()).toContain('if (!active || !indoor) return;');
    expect(tracker()).toContain('if (!active || indoor) return;');
    expect(tracker()).toMatch(/health\s*\.distanceSince\(startedAt\)/);
    expect(tracker()).toContain('beginRun(liveGait, weightKg, indoor);');
  });

  it('⚠️ a source that drops out mid-run keeps what it already credited', () => {
    // `null` before the first reading stands the mode down; `null` afterwards must not retract the
    // kilometres she actually covered.
    expect(tracker()).toContain('if (!sawAny) {');
  });

  it("⛔ and it never says 'Acquiring GPS signal' over a treadmill", () => {
    /*
     * Both of the stage's absence sentences name GPS, and neither is true indoors — a satellite
     * message over a belt is the same class of lie as a pace on a table, which is the defect this
     * whole module was rebuilt around.
     */
    expect(cardio()).toContain("t('cardio.motionOff')");
    // The absence sentence is chosen by the MODE first, before either GPS branch is reached.
    expect(cardio()).toMatch(/indoor\s*\?\s*gps === 'unavailable'/);
  });

  it('⚠️ the mode is read off the MOVEMENT, so a prescribed treadmill needs no question', () => {
    expect(cardio()).toContain("nav.params?.indoor ?? (target?.ex ? !isOutdoorMovement(target.ex) : false)");
  });

  it('⛔ and the athlete who opens the tab herself is asked ONE thing — where, not what', () => {
    /*
     * FOUNDER: *"יש רק הליכה או ריצה בחוץ או הליכה או ריצה בהליכון. זהו."* — four things she can
     * do, one bit the app needs. Walking versus running is measured from her pace, per segment.
     *
     * ⚠️ A FOUR-WAY PICKER WOULD BE THE BUG THIS WHOLE THREAD IS ABOUT. It would ask her to declare
     * something the phone measures better than she can guess, and would be wrong the moment she
     * walks a hill in the middle of a run.
     */
    const ready = read('src/screens/cardio/CardioReady.tsx');
    expect(ready).toContain("t(v ? 'cardio.treadmill' : 'cardio.outside')");
    /*
     * ⛔ AND THE PLACE IS DRAWN, not only named (founder, 2026-08-12). The choice she is making is
     * about a PLACE, and a place is a thing you recognise before you read it. ⚠️ Nothing in either
     * drawing is a measurement — a track with a distance on it would be the first thing on this
     * screen claiming something before she has moved.
     */
    expect(ready).toContain('<TreadmillArt');
    expect(ready).toContain('<TrackArt');
    // …and nothing on it asks her to pick a gait.
    expect(ready).not.toMatch(/cardio\.(run|walk)'/);
    // The answer reaches the live stage.
    /* ⛔ EXPLICIT, INCLUDING `false` — `navigate(name, undefined)` does not clear a route's params,
       so the ternary let an outdoor run inherit a treadmill's flag. See the note in `Root`. */
    expect(read('src/app/Root.tsx')).toContain("navigateMain('CardioLive', { indoor })");
  });

  it('⛔ and a CARRY can no longer be prescribed — every distance is walking or running', () => {
    /*
     * *"אין נסיעת חקלאי."* It was the last distance movement on offer that is not one of the four,
     * and it is why "has a distance ⇒ the phone counts it" was ever a tempting predicate. With it
     * gone the two questions collapse: everything the coach can prescribe a distance for is
     * tracked, by the satellite or by Core Motion.
     */
    const facts = read('src/domain/coachFacts.ts');
    expect(facts).toContain("'farmer_carry',");
    const offered = facts.slice(facts.indexOf('const NOT_YET_OFFERED'), facts.indexOf('export function coachMovements'));
    expect(offered).toContain("'farmer_carry'");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔⛔ AND THE WIRE HAS TO BE PLUGGED IN THE WAY THE SOCKET IS SHAPED (founder 2026-08-16):
 *
 *   > *"בקרדיו בפנים ניערתי את הפלאפון המון ואין תנועה במסך."*
 *
 * (The shaking could never have worked — Core Motion counts GAIT, not vibration, and the phone must
 * be on her. But under that there was a real defect, and it took the whole mode.)
 *
 * `distanceSince` called `queryQuantitySamples` with **no `limit`** — a REQUIRED field the Nitro
 * bridge decodes as a non-optional `double`, so it threw on device — and with the dates **flat**
 * instead of under `filter.date`, where the Swift side is the only place that reads them. The
 * correct form of both was already written in `recentWorkouts`, thirty lines below, in the same file.
 *
 * ── WHY EVERY EXISTING LAW WATCHED IT HAPPEN ────────────────────────────────────────────────────
 * The tests below this one assert on the file's TEXT: that `async distanceSince(` exists, that the
 * scope holds the type. All true, all passing, none of them ever CALLED it — because `jest.setup.js`
 * mocks the healthkit module without defining `queryQuantitySamples` at all, and makes
 * `isHealthDataAvailableAsync` resolve false so the function returns at its first line. And the file
 * carries `@ts-nocheck`, so the compiler could not object either.
 *
 * **A law that reads a function's name proves the function is named.** This one runs it, against a
 * double that enforces the library's contract — the only place the defect was ever visible.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⛔ the indoor query is shaped the way the library reads it', () => {
  const quantityCalls: any[] = [];

  beforeEach(() => {
    quantityCalls.length = 0;
    jest.resetModules();
    jest.doMock('@kingstinct/react-native-healthkit', () => ({
      isHealthDataAvailableAsync: async () => true,
      isHealthDataAvailable: () => true,
      requestAuthorization: async () => true,
      getRequestStatusForAuthorization: async () => 2,
      getMostRecentQuantitySample: async () => undefined,
      AuthorizationRequestStatus: { unknown: 0, shouldRequest: 1, unnecessary: 2 },
      queryWorkoutSamples: async () => [],
      queryQuantitySamples: async (_type: string, options: any) => {
        quantityCalls.push(options);
        /*
         * ⚠️ THE DOUBLE ENFORCES THE CONTRACT, IT DOES NOT ASSUME IT. Both rules are read off the
         * installed package, not invented here:
         *   · `GenericQueryOptions.limit` is `readonly limit: number` — NOT optional — and the
         *     generated bridge decodes it via `JSIConverter<double>::fromJSI`, i.e. `asNumber()`,
         *     which throws on `undefined`. So: missing `limit` ⇒ throw, exactly as on device.
         *   · `FilterForSamplesBase` puts the window under `date`, and `QuantityTypeModule.swift`
         *     reads `options?.filter?.date?.startDate`. A flat `{ startDate }` is not a narrow
         *     predicate, it is NO predicate — so the double ignores it, exactly as the device does.
         */
        if (typeof options?.limit !== 'number') throw new TypeError('limit is required');
        const from = options?.filter?.date?.startDate ?? null;
        const to = options?.filter?.date?.endDate ?? null;
        const all = [
          // Inside the window: 1.0 km, then 0.5 km.
          { quantity: 1.0, startDate: new Date(1_000), endDate: new Date(2_000) },
          { quantity: 0.5, startDate: new Date(2_000), endDate: new Date(3_000) },
          // Before it — the walk to the gym. Only an unfiltered read returns this.
          { quantity: 9.0, startDate: new Date(-100_000), endDate: new Date(-99_000) },
        ];
        if (!from || !to) return all;
        return all.filter((s) => s.startDate >= from && s.endDate <= to);
      },
    }));
  });

  afterEach(() => {
    jest.dontMock('@kingstinct/react-native-healthkit');
    jest.resetModules();
  });

  const gate = () => require('@/platform/health/healthKitGate').healthKitGate;

  it('it passes a limit — without one the call throws and the whole mode reads as "motion off"', async () => {
    // The regression itself: before the fix this resolved to null, and null is what draws
    // `cardio.motionOff` over a 0 m stage for the entire run.
    await expect(gate().distanceSince(1_000, 3_000)).resolves.not.toBeNull();
    expect(typeof quantityCalls[0].limit).toBe('number');
  });

  it('…and the limit is the "every sample" sentinel, because the answer is a SUM', async () => {
    // A capped read would silently drop segments off a long run — the one read on this gate that
    // must not take "the newest few". The library's sentinel is any non-positive number.
    await gate().distanceSince(1_000, 3_000);
    expect(quantityCalls[0].limit).toBeLessThanOrEqual(0);
  });

  it('it narrows by date where the native side actually looks', async () => {
    await gate().distanceSince(1_000, 3_000);
    expect(quantityCalls[0].filter?.date?.startDate).toBeInstanceOf(Date);
    expect(quantityCalls[0].filter?.date?.endDate).toBeInstanceOf(Date);
  });

  it('⚠️ and the window really excludes her walk to the gym', async () => {
    // The end-to-end consequence of the mis-nesting: an unfiltered predicate returns the 9 km
    // sample too, and the treadmill stage opens at 10.5 km.
    await expect(gate().distanceSince(1_000, 3_000)).resolves.toBeCloseTo(1.5, 3);
  });
});

describe('the wire it rides on', () => {
  it('⛔ the read scope already held the distance type — this is a wire, not a model', () => {
    const gate = read('src/platform/health/healthKitGate.ts');
    expect(gate).toContain("const DISTANCE = 'HKQuantityTypeIdentifierDistanceWalkingRunning';");
    expect(gate).toContain('toRead: [HEART_RATE, ACTIVE_ENERGY, DISTANCE, WORKOUT]');
    expect(gate).toContain('async distanceSince(');
  });

  it('⛔ the indoor mode asks for its OWN source, rather than relying on a skippable onboarding step', () => {
    /*
     * `requestPermission` lived only in `ConnectHealth` (skippable) and `ProfileSheet`. An athlete
     * who tapped past onboarding reached the treadmill with HealthKit unauthorized — and a denied
     * READ returns an empty array, not an error, so the stage drew a confident 0 m with no message.
     * The outdoor half of the same hook has always asked for location where it needs it.
     */
    const tracker = read('src/platform/cardio/cardioTracker.ts');
    const indoor = tracker.slice(tracker.indexOf('if (!active || !indoor) return;'), tracker.indexOf('if (!active || indoor) return;'));
    expect(indoor).toMatch(/health\.permissionState\(\)/);
    expect(indoor).toMatch(/health\.requestPermission\(\)/);
  });

  it('⚠️ every gate implements it, and the stub returns null rather than a confident zero', () => {
    // 0 is "she did not move"; null is "nothing was measured". The indoor stage must be able to
    // refuse to run rather than draw a flat zero for forty minutes — Android reaches here today.
    const health = read('src/platform/health.ts');
    expect(health).toContain('distanceSince(sinceMs: number, untilMs?: number): Promise<number | null>;');
    const stub = health.slice(health.indexOf('export const healthStub'));
    expect(stub).toContain('async distanceSince()');
    expect(stub.slice(stub.indexOf('async distanceSince()'))).toMatch(/^async distanceSince\(\) \{\s*return null;/);
  });

  it('⚠️ and both indoor corners exist in the catalogue — a walk on a belt had no name at all', () => {
    const moves = read('src/data/movements.ts');
    expect(moves).toContain("{ id: 'run_treadmill'");
    expect(moves).toContain("{ id: 'walk_treadmill'");
    /*
     * ⚠️ NEITHER CARRIES `gps` — the whole distinction this work turns on. Asserted per LINE: a
     * window between two ids swept up `walk_outdoor` in the middle and the law failed on a
     * neighbour, which is a law measuring the file's layout rather than its content.
     */
    const lines = moves.split(/\r?\n/);
    for (const id of ['run_treadmill', 'walk_treadmill']) {
      const line = lines.find((l) => l.includes(`id: '${id}'`))!;
      expect({ id, tracked: /tracked: 'motion'/.test(line) }).toEqual({ id, tracked: true });
    }
    for (const id of ['run_outdoor', 'walk_outdoor']) {
      expect(lines.find((l) => l.includes(`id: '${id}'`))).toContain("tracked: 'gps'");
    }
  });
});
