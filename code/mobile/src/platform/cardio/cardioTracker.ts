/**
 * Live cardio tracker — the sample source for the Open-training (run / walk) flow.
 *
 * REAL SENSORS (replaces the simulated generator that shipped through Build #22 and
 * fabricated distance/pace/HR while the phone sat on a table):
 *   • distance / pace — expo-location GPS (`watchPositionAsync`, BestForNavigation),
 *     with honest gating: a fix only counts when its horizontal accuracy is tight,
 *     and distance only accrues while the device is actually MOVING (Doppler speed
 *     over a walking threshold, displacement under a sanity cap). A stationary
 *     indoor session reads 0.00 km, no pace, ~0 kcal — by construction.
 *   • calories — distance-based estimate from the athlete's bodyweight (≈1.03 kcal/kg
 *     per km running, ≈0.55 walking — the standard net-cost approximations). No
 *     distance ⇒ no calories. Absent bodyweight ⇒ omitted entirely (kcal = 0).
 *   • heart rate — NO phone-side source exists, so `hr` is null and the UI shows a
 *     dash. (A live HR feed needs the watch app / an HKWorkoutSession — that is the
 *     next native step, not something to fake here.)
 *
 * Elapsed time is wall-clock (accumulated across pause/resume), never interval
 * ticks — JS timers suspend in the background and silently under-count.
 *
 * The GPS lock state is part of the sample (`gps`) so the screen can say
 * "acquiring" / "location off" instead of rendering confident zeros.
 *
 * Foreground-only for now: without the background-location task entitlement iOS
 * suspends position updates when the app leaves the foreground. The screen keeps
 * itself awake during an activity; true background tracking is a follow-up build.
 */
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { CardioGait, CardioPoint, CardioSplit } from '@/data/local/models';
import {
  MAX_ACCURACY_M,
  MIN_SPEED_MS,
  haversineM,
  kcalForKm,
  movementCredit,
  segmentCounts,
} from './cardioMath';

// The pure math (gates, formatters) lives in cardioMath — native-free, unit-tested.
export { fmtClock, fmtPace, hrZone, haversineM, kcalForKm, movementCredit, segmentCounts } from './cardioMath';

export type GpsState = 'idle' | 'acquiring' | 'ready' | 'denied' | 'unavailable';

export interface CardioSample {
  elapsedSec: number;
  distanceKm: number;
  /** Live pace over recent movement, sec/km; 0 (⇒ "--:--") when not moving or no lock. */
  paceSec: number;
  /** bpm — null: no heart-rate source on the phone (never fabricated). */
  hr: number | null;
  calories: number; // kcal, distance-based; 0 until real distance exists
  splits: CardioSplit[];
  gps: GpsState;
  /**
   * The path actually travelled (founder 2026-07-12) — every counted fix, in order, so the
   * summary can draw the route the athlete ran. Only fixes that PASSED the accuracy +
   * movement gates are kept, so the trace is the same honest data the distance is: a
   * stationary session records no path at all, rather than a jitter cloud around a bench.
   */
  route: CardioPoint[];
}

const ZERO: CardioSample = { elapsedSec: 0, distanceKm: 0, paceSec: 0, hr: null, calories: 0, splits: [], gps: 'idle', route: [] };

interface Fix {
  lat: number;
  lon: number;
  tsMs: number;
}

/**
 * Live cardio sample for an activity. `active` spans the whole activity (GPS stays
 * warm across pauses); `paused` gates accumulation. `liveGait` can change
 * mid-activity (the athlete toggles run/walk); calories and split attribution follow it.
 */
export function useCardioTracker(
  active: boolean,
  paused: boolean,
  liveGait: CardioGait,
  weightKg?: number | null,
): CardioSample {
  const [sample, setSample] = useState<CardioSample>(ZERO);
  const gaitRef = useRef(liveGait);
  gaitRef.current = liveGait;
  const weightRef = useRef(weightKg);
  weightRef.current = weightKg;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Mutable accumulator (refs so the GPS callback and the clock read/write the
  // latest without re-subscribing).
  const acc = useRef({
    activeMs: 0, // accumulated while running
    resumedAtMs: 0, // wall-clock instant of the last resume (0 = not running)
    distM: 0,
    cal: 0,
    paceSec: 0,
    splits: [] as CardioSplit[],
    lastKm: 0,
    splitStartSec: 0,
    lastFix: null as Fix | null,
    gps: 'idle' as GpsState,
    route: [] as CardioPoint[],
    // The movement proof (see cardioMath): where the activity started, how far the athlete has
    // actually got from it, how many consecutive fixes have looked like real movement — and
    // whether the activity has already proven itself (once proven, it stays proven).
    origin: null as Fix | null,
    departedM: 0,
    movingRun: 0,
    proven: false,
  });

  const elapsedSecNow = () => {
    const s = acc.current;
    const runMs = s.resumedAtMs > 0 ? Date.now() - s.resumedAtMs : 0;
    return Math.round((s.activeMs + runMs) / 1000);
  };

  const publish = () => {
    const s = acc.current;
    setSample({
      elapsedSec: elapsedSecNow(),
      distanceKm: s.distM / 1000,
      paceSec: s.paceSec,
      hr: null,
      calories: s.cal,
      splits: s.splits,
      gps: s.gps,
      route: s.route,
    });
  };

  // ── Wall-clock elapsed: accumulate across pause/resume; tick the UI once a second.
  useEffect(() => {
    const s = acc.current;
    const running = active && !paused;
    if (running) {
      s.resumedAtMs = Date.now();
      const id = setInterval(publish, 1000);
      publish();
      return () => {
        clearInterval(id);
        s.activeMs += Date.now() - s.resumedAtMs;
        s.resumedAtMs = 0;
        // A pause breaks the GPS segment — no distance is credited across it, and the
        // movement has to prove itself again on resume (a paused athlete is a still one).
        s.lastFix = null;
        s.movingRun = 0;
        s.paceSec = 0;
        publish();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused]);

  // ── GPS: one subscription for the whole activity (kept warm across pauses).
  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    const s = acc.current;
    s.gps = 'acquiring';
    publish();

    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) {
          s.gps = 'denied';
          publish();
          return;
        }
        sub = await Location.watchPositionAsync(
          // (expo-location's foreground `watchPositionAsync` does not expose CLActivityType —
          // it is a background-task option only — so the movement proof is entirely ours.)
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          (loc) => {
            const { latitude, longitude, accuracy, speed } = loc.coords;
            const tsMs = loc.timestamp;
            const goodFix = accuracy != null && accuracy <= MAX_ACCURACY_M;
            if (goodFix && s.gps !== 'ready') s.gps = 'ready';
            if (pausedRef.current || !goodFix) {
              if (!goodFix) {
                s.lastFix = null; // a poor fix breaks the segment
                s.movingRun = 0; // …and the movement has to prove itself again
              }
              return;
            }
            const prev = s.lastFix;
            s.lastFix = { lat: latitude, lon: longitude, tsMs };
            // The origin is the first fix good enough to trust. Everything the athlete has to
            // beat — the departure test — is measured from here.
            if (!s.origin) s.origin = { lat: latitude, lon: longitude, tsMs };
            s.departedM = haversineM(s.origin.lat, s.origin.lon, latitude, longitude);
            if (!prev) return;

            const dtS = (tsMs - prev.tsMs) / 1000;
            const segM = haversineM(prev.lat, prev.lon, latitude, longitude);
            const plausible = segmentCounts({ accuracyM: accuracy, dopplerSpeedMs: speed, segmentM: segM, dtS });
            // A plausible segment still has to PROVE itself: movement that holds across
            // consecutive fixes, from a phone that has gone further than its own error bar. This
            // is what a chair cannot fake (founder 2026-07-12 — see cardioMath). The proof is
            // made once per activity, not once per stride.
            const credit = movementCredit(plausible, {
              movingRun: s.movingRun,
              departedM: s.departedM,
              accuracyM: accuracy,
              proven: s.proven,
            });
            s.movingRun = credit.movingRun;
            s.proven = credit.proven;

            // Pace shows recent MOVEMENT, never elapsed/position artifacts: a light EMA over
            // Doppler speed while moving; blank the moment movement stops. It follows the same
            // proof as the distance — a pace with no credited distance behind it is the exact
            // "5:39 /km on a table" lie this whole file exists to prevent.
            if (credit.counts && speed != null && speed >= MIN_SPEED_MS) {
              const inst = 1000 / speed; // sec/km
              s.paceSec = s.paceSec > 0 ? Math.round(s.paceSec * 0.7 + inst * 0.3) : Math.round(inst);
            } else if (!plausible) {
              s.paceSec = 0;
            }
            if (!credit.counts) return;

            const g = gaitRef.current;
            // The trace records only fixes that COUNTED — the same gate as the distance, so the
            // drawn route can never disagree with the kilometres beside it. The first point of a
            // segment is seeded too, so a resumed leg starts where the athlete stands.
            //
            // PUSHED, not re-spread: an hour's run is ~3,600 fixes, and rebuilding the array on
            // every one is quadratic. The array identity is deliberately stable — nothing renders
            // the route live, so a new reference each second would only churn.
            if (s.route.length === 0) s.route.push({ lat: prev.lat, lon: prev.lon });
            s.route.push({ lat: latitude, lon: longitude });
            s.distM += segM;
            s.cal += kcalForKm(segM / 1000, g, weightRef.current);
            const kmDone = Math.floor(s.distM / 1000);
            if (kmDone > s.lastKm) {
              s.lastKm = kmDone;
              const nowSec = elapsedSecNow();
              const sec = nowSec - s.splitStartSec;
              s.splitStartSec = nowSec;
              s.splits = [...s.splits, { km: kmDone, durationSec: sec, paceSec: sec, gait: g }];
            }
          },
        );
      } catch {
        if (!cancelled) {
          s.gps = 'unavailable';
          publish();
        }
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return sample;
}

