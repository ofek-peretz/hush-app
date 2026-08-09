/**
 * THE RUN ITSELF — one accumulator, module-level, fed by whichever GPS path is alive.
 *
 * ════ WHY THIS IS NOT A REACT REF ANY MORE (founder 2026-07-29) ════
 *
 * A run happens with the phone in a pocket. Until now the accumulator lived inside
 * `useCardioTracker`'s ref and the fixes arrived through `watchPositionAsync`, which iOS suspends
 * the moment the app leaves the screen — so an athlete who pocketed her phone and ran 10 km came
 * back to **0.00 km**. Not an under-count: nothing at all.
 *
 * Real background location on iOS arrives through a TaskManager task, and a task is NOT a
 * component: it can be woken with the whole React tree torn down. So the state it writes cannot
 * live in a hook. It lives here, and BOTH paths — the foreground watch and the background task —
 * call the same `ingestFix`. One set of honesty gates, one distance, one set of splits, whichever
 * way the fix arrived.
 *
 * Everything that DECIDES anything is still in `cardioMath` (pure, native-free, unit-tested); this
 * file only holds the running totals and the order the gates are applied in. It was lifted out of
 * the hook verbatim, deliberately: the gates are the product of a founder-reported defect (a chair,
 * indoors, recording 0.07 km) and they are not the place to be clever while moving code.
 */
// @ts-nocheck

// 

import type { CardioGait, CardioPoint, CardioSplit } from '@/data/local/models';
import {
  MAX_ACCURACY_M,
  MIN_SPEED_MS,
  fmtPace,
  haversineM,
  kcalForSegment,
  gaitFromPace,
  movementCredit,
  segmentCounts,
} from './cardioMath';
import { notifier } from '@/platform/notifications';
import { averageHeartRate } from '@/domain/heartRate';

export type GpsState = 'idle' | 'acquiring' | 'ready' | 'denied' | 'unavailable';

export interface CardioSample {
  elapsedSec: number;
  distanceKm: number;
  /** Live pace over recent movement, sec/km; 0 (⇒ "--:--") when not moving or no lock. */
  paceSec: number;
  /**
   * bpm, from the athlete's watch by way of HealthKit — and ONLY while the reading is still
   * fresh (see `domain/heartRate`). Null is the dash, and it is the honest answer far more often
   * than not: no watch, no grant, or a watch that has not written for a minute and a half.
   */
  hr: number | null;
  /**
   * The mean of every LIVE reading this activity has collected — the figure the saved record and
   * the summary card carry. It is on the SAMPLE rather than read at save time on purpose: the run
   * is torn down the instant the activity ends, and the summary is drawn after that, so the last
   * published snapshot has to already hold it. `undefined` = no reading was ever live, and the
   * record then carries no average at all (never a 0).
   */
  avgHr: number | undefined;
  calories: number; // kcal, distance-based; 0 until real distance exists
  splits: CardioSplit[];
  gps: GpsState;
  /**
   * The path actually travelled (founder 2026-07-12) — every counted fix, in order, so the
   * summary can draw the route the athlete ran. Only fixes that PASSED the accuracy + movement
   * gates are kept, so the trace is the same honest data the distance is: a stationary session
   * records no path at all, rather than a jitter cloud around a bench.
   */
  route: CardioPoint[];
}

/** One accepted GPS fix, in the shape both paths hand over. */
export interface Fix {
  lat: number;
  lon: number;
  tsMs: number;
  /** Horizontal accuracy in metres; null/absent = unusable. */
  accuracyM: number | null;
  /** Doppler speed in m/s; null when the platform did not report one. */
  speedMs: number | null;
}

interface Prev {
  lat: number;
  lon: number;
  tsMs: number;
}

const EMPTY = () => ({
  active: false,
  paused: true,
  gait: 'run' as CardioGait,
  weightKg: null as number | null | undefined,
  activeMs: 0, // accumulated while running
  resumedAtMs: 0, // wall-clock instant of the last resume (0 = not running)
  distM: 0,
  cal: 0,
  paceSec: 0,
  splits: [] as CardioSplit[],
  lastKm: 0,
  splitStartSec: 0,
  lastFix: null as Prev | null,
  // The instant of the newest fix EVER accepted — see the monotonic guard in `ingestFix`. It
  // deliberately survives a pause and a bad fix, both of which clear `lastFix`.
  lastTsMs: 0,
  gps: 'idle' as GpsState,
  // The last LIVE reading (already through the freshness gate), and every one this activity has
  // seen — the average on the saved record is built from these and nothing else.
  hr: null as number | null,
  hrReadings: [] as number[],
  route: [] as CardioPoint[],
  // The movement proof (see cardioMath): where the activity started, how far the athlete has
  // actually got from it, how many consecutive fixes have looked like real movement — and
  // whether the activity has already proven itself (once proven, it stays proven).
  origin: null as Prev | null,
  departedM: 0,
  movingRun: 0,
  proven: false,
});

let s = EMPTY();

export const ZERO: CardioSample = {
  elapsedSec: 0,
  distanceKm: 0,
  paceSec: 0,
  hr: null,
  avgHr: undefined,
  calories: 0,
  splits: [],
  gps: 'idle',
  route: [],
};

/** Wall-clock elapsed, accumulated across pause/resume — never an interval tick count. */
export function elapsedSec(): number {
  const runMs = s.resumedAtMs > 0 ? Date.now() - s.resumedAtMs : 0;
  return Math.round((s.activeMs + runMs) / 1000);
}

/** A fresh activity. Everything the previous one accumulated is gone. */
export function beginRun(gait: CardioGait, weightKg?: number | null): void {
  s = EMPTY();
  s.active = true;
  s.gait = gait;
  s.weightKg = weightKg;
  s.gps = 'acquiring';
}

export function endRun(): void {
  s = EMPTY();
}

export function isRunning(): boolean {
  return s.active;
}

/**
 * A heart-rate reading, already judged live by `domain/heartRate`. `null` means the gate refused
 * it — the row goes back to a dash rather than holding the last number it liked, which would be
 * the stale-pulse lie with extra steps.
 */
export function setHeartRate(bpm: number | null): void {
  if (!s.active) return;
  s.hr = bpm;
  if (bpm != null) s.hrReadings.push(bpm);
}

/** Every live reading this activity collected — the source of the saved average. */
export function heartRateReadings(): readonly number[] {
  return s.hrReadings;
}

/** The athlete toggled run/walk mid-activity; calories and split attribution follow it. */
export function setGait(gait: CardioGait): void {
  s.gait = gait;
}

export function setWeight(weightKg?: number | null): void {
  s.weightKg = weightKg;
}

export function setGps(state: GpsState): void {
  s.gps = state;
}

/**
 * Pause / resume. A pause BREAKS the GPS segment — no distance is credited across it, and the
 * movement has to prove itself again on resume (a paused athlete is a still one).
 */
export function setPaused(paused: boolean): void {
  if (paused === s.paused) return;
  if (paused) {
    if (s.resumedAtMs > 0) s.activeMs += Date.now() - s.resumedAtMs;
    s.resumedAtMs = 0;
    s.lastFix = null;
    s.movingRun = 0;
    s.paceSec = 0;
  } else {
    s.resumedAtMs = Date.now();
  }
  s.paused = paused;
}

export function snapshot(): CardioSample {
  return {
    elapsedSec: elapsedSec(),
    distanceKm: s.distM / 1000,
    paceSec: s.paceSec,
    hr: s.hr,
    avgHr: averageHeartRate(s.hrReadings),
    calories: s.cal,
    splits: s.splits,
    gps: s.gps,
    route: s.route,
  };
}

/**
 * ONE FIX, THROUGH THE GATES. Lifted verbatim out of the hook's `watchPositionAsync` callback —
 * the order of the tests IS the design (see `cardioMath`). Called from the foreground watcher and
 * from the background task alike; neither knows which one it is.
 */
export function ingestFix(fix: Fix): void {
  if (!s.active) return;
  const { lat: latitude, lon: longitude, tsMs, accuracyM: accuracy, speedMs: speed } = fix;
  /**
   * ════ TIME ONLY GOES FORWARD (and this is why the two paths are safe) ════
   *
   * The foreground watcher and the background task BOTH deliver, at the same time, whenever the
   * app is on screen — iOS does not stop the task just because the athlete is looking. So the same
   * fix arrives twice, and a background delivery arrives BATCHED: three fixes at once, after the
   * foreground has already moved past them.
   *
   * A duplicate is harmless on its own (`dtS <= 0` fails `segmentCounts`, so nothing is credited).
   * What is NOT harmless is that it would still overwrite `lastFix` — rewinding the chain to a
   * point already travelled, so the NEXT fix re-measures a segment the run has already counted and
   * adds it a second time. A 10 km run could report 15.
   *
   * So an older-or-equal fix is not new information and is dropped before it can touch anything.
   * `lastTsMs` is separate from `lastFix` on purpose: a pause and a poor fix both clear the chain,
   * and neither of them makes the past interesting again.
   */
  if (tsMs <= s.lastTsMs) return;
  s.lastTsMs = tsMs;
  const goodFix = accuracy != null && accuracy <= MAX_ACCURACY_M;
  if (goodFix && s.gps !== 'ready') s.gps = 'ready';
  if (s.paused || !goodFix) {
    if (!goodFix) {
      s.lastFix = null; // a poor fix breaks the segment
      s.movingRun = 0; // …and the movement has to prove itself again
    }
    return;
  }
  const prev = s.lastFix;
  s.lastFix = { lat: latitude, lon: longitude, tsMs };
  // The origin is the first fix good enough to trust. Everything the athlete has to beat — the
  // departure test — is measured from here.
  if (!s.origin) s.origin = { lat: latitude, lon: longitude, tsMs };
  s.departedM = haversineM(s.origin.lat, s.origin.lon, latitude, longitude);
  if (!prev) return;

  const dtS = (tsMs - prev.tsMs) / 1000;
  const segM = haversineM(prev.lat, prev.lon, latitude, longitude);
  const plausible = segmentCounts({ accuracyM: accuracy, dopplerSpeedMs: speed, segmentM: segM, dtS });
  // A plausible segment still has to PROVE itself: movement that holds across consecutive fixes,
  // from a phone that has gone further than its own error bar. This is what a chair cannot fake
  // (founder 2026-07-12 — see cardioMath). The proof is made once per activity, not once per stride.
  const credit = movementCredit(plausible, {
    movingRun: s.movingRun,
    departedM: s.departedM,
    accuracyM: accuracy,
    proven: s.proven,
  });
  s.movingRun = credit.movingRun;
  s.proven = credit.proven;

  // Pace shows recent MOVEMENT, never elapsed/position artifacts: a light EMA over Doppler speed
  // while moving; blank the moment movement stops. It follows the same proof as the distance — a
  // pace with no credited distance behind it is the exact "5:39 /km on a table" lie this whole
  // module exists to prevent.
  if (credit.counts && speed != null && speed >= MIN_SPEED_MS) {
    const inst = 1000 / speed; // sec/km
    s.paceSec = s.paceSec > 0 ? Math.round(s.paceSec * 0.7 + inst * 0.3) : Math.round(inst);
  } else if (!plausible) {
    s.paceSec = 0;
  }
  if (!credit.counts) return;

  /*
   * ⛔ THE GAIT IS MEASURED, NOT DECLARED (founder 2026-08-04). `s.gait` is a fixed 'run' — the
   * picker was deleted in v7 and the constant it used to set was left frozen, so a walk was billed
   * at the running rate: nearly double. The pace is right here and already smoothed; it is the
   * answer to the question nobody is being asked.
   */
  const rate = s.paceSec;
  // The trace records only fixes that COUNTED — the same gate as the distance, so the drawn route
  // can never disagree with the kilometres beside it. The first point of a segment is seeded too,
  // so a resumed leg starts where the athlete stands.
  //
  // PUSHED, not re-spread: an hour's run is ~3,600 fixes, and rebuilding the array on every one is
  // quadratic. The array identity is deliberately stable — nothing renders the route live, so a
  // new reference each second would only churn.
  if (s.route.length === 0) s.route.push({ lat: prev.lat, lon: prev.lon });
  s.route.push({ lat: latitude, lon: longitude });
  s.distM += segM;
  s.cal += kcalForSegment(segM / 1000, rate, s.weightKg);
  const kmDone = Math.floor(s.distM / 1000);
  if (kmDone > s.lastKm) {
    s.lastKm = kmDone;
    const nowSec = elapsedSec();
    const sec = nowSec - s.splitStartSec;
    s.splitStartSec = nowSec;
    s.splits = [...s.splits, { km: kmDone, durationSec: sec, paceSec: sec, gait: gaitFromPace(sec) }];
    /**
     * …and it is ANNOUNCED (founder 2026-07-29: "in cardio, a notification for every kilometre").
     * Delivered now, not scheduled: the split has already happened. The on-screen moment (3.4b)
     * and the haptic still carry it when she is looking; this is the path for a phone in a pocket,
     * which is where a phone is during a run — and it is the reason the background task exists.
     */
    void notifier.kilometre(kmDone, fmtPace(sec));
  }
}
