/**
 * Live cardio tracker — the screen's window onto the run.
 *
 * REAL SENSORS (replaces the simulated generator that shipped through Build #22 and
 * fabricated distance/pace/HR while the phone sat on a table):
 *   • distance / pace — expo-location GPS, with honest gating: a fix only counts when its
 *     horizontal accuracy is tight, and distance only accrues while the device is actually
 *     MOVING (Doppler speed over a walking threshold, displacement under a sanity cap). A
 *     stationary indoor session reads 0.00 km, no pace, ~0 kcal — by construction.
 *   • calories — distance-based estimate from the athlete's bodyweight (≈1.03 kcal/kg per km
 *     running, ≈0.55 walking — the standard net-cost approximations). No distance ⇒ no calories.
 *     Absent bodyweight ⇒ omitted entirely (kcal = 0).
 *   • heart rate — READ FROM HEALTHKIT (founder 2026-07-29), which is where an Apple Watch writes
 *     it. Polled every few seconds and shown only while the newest sample is still FRESH
 *     (`domain/heartRate`): a watch batches its writes, so "the latest sample" is regularly minutes
 *     old, and a stale pulse under a live clock is the same lie as a pace on a table. No watch, no
 *     grant, or nothing recent ⇒ a dash, which is the honest answer most of the time.
 *
 * ════ WHAT THIS FILE IS NOW ════
 *
 * It is a VIEW, not the run. The run lives in `cardioRun` (module-level, so a background wake can
 * write to it with no React tree), the fixes arrive through two paths that both feed it, and this
 * hook only starts them, stops them, and publishes a snapshot once a second.
 *
 *   FOREGROUND — `watchPositionAsync`, while the screen is up.
 *   BACKGROUND — `cardioTask`, a TaskManager task, for the phone in a pocket (founder 2026-07-29).
 *
 * Both are held for exactly as long as there is a run, and both are released the moment there is
 * not. Running them together is deliberate: iOS hands the foreground watcher a tighter cadence,
 * and `ingestFix` is idempotent about ORDER, not about identity — a fix delivered twice is a
 * zero-length segment, which the gates already discard (`MIN_SEGMENT_M`).
 *
 * Elapsed time is wall-clock (accumulated across pause/resume), never interval ticks — JS timers
 * suspend in the background and silently under-count.
 *
 * The GPS lock state is part of the sample (`gps`) so the screen can say "acquiring" / "location
 * off" instead of rendering confident zeros.
 */
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { CardioGait } from '@/data/local/models';
import {
  beginRun,
  endRun,
  heartRateReadings,
  ingestFix,
  setGait,
  setGps,
  setHeartRate,
  setPaused,
  setWeight,
  snapshot,
  ZERO,
  type CardioSample,
  type GpsState,
} from './cardioRun';
import { startCardioLocationTask, stopCardioLocationTask } from './cardioTask';
import { health } from '@/platform/health';
import { liveHeartRate } from '@/domain/heartRate';

/**
 * How often Health is asked for a new beat. Five seconds: a watch writes at most every few seconds
 * while it is tracking, and asking faster only spends battery re-reading the same sample. The
 * freshness gate (`domain/heartRate`) is what decides whether the answer is worth drawing, so a
 * slower poll costs precision, never truth.
 */
const HR_POLL_MS = 5_000;

// The pure math (gates, formatters) lives in cardioMath — native-free, unit-tested.
export { fmtClock, fmtPace, hrZone, haversineM, kcalForKm, movementCredit, segmentCounts } from './cardioMath';
export type { CardioSample, GpsState } from './cardioRun';
export { heartRateReadings } from './cardioRun';

/**
 * Live cardio sample for an activity. `active` spans the whole activity (GPS stays warm across
 * pauses); `paused` gates accumulation. `liveGait` can change mid-activity (the athlete toggles
 * run/walk); calories and split attribution follow it.
 */
export function useCardioTracker(
  active: boolean,
  paused: boolean,
  liveGait: CardioGait,
  weightKg?: number | null,
): CardioSample {
  const [sample, setSample] = useState<CardioSample>(ZERO);
  const startedRef = useRef(false);

  // The gait and the weight are facts about the run, not about this component — they go straight
  // through to the run so a BACKGROUND fix prices its calories the same way a foreground one does.
  useEffect(() => {
    setGait(liveGait);
  }, [liveGait]);
  useEffect(() => {
    setWeight(weightKg);
  }, [weightKg]);

  // ── The activity's own lifetime: one run, one background task, released together.
  useEffect(() => {
    if (!active) return;
    beginRun(liveGait, weightKg);
    startedRef.current = true;
    setSample(snapshot());
    return () => {
      startedRef.current = false;
      void stopCardioLocationTask();
      endRun();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!active) return;
    setPaused(paused);
  }, [active, paused]);

  // ── HEART RATE, from the watch by way of Health. Polled for the whole activity — including
  //    while PAUSED, because a pulse during a pause is still her pulse and the row should not go
  //    dark just because she stopped at a crossing.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const read = () => {
      void health
        .latestHeartRate()
        .then((sample) => {
          if (alive) setHeartRate(liveHeartRate(sample, Date.now()));
        })
        .catch(() => {
          if (alive) setHeartRate(null);
        });
    };
    read();
    const id = setInterval(read, HR_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [active]);

  // ── Publish once a second while the screen is up. Nothing here accumulates: it reads.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSample(snapshot()), 1000);
    setSample(snapshot());
    return () => clearInterval(id);
  }, [active, paused]);

  // ── GPS: the permissions, the foreground watcher, and the background task.
  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    setGps('acquiring');

    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) {
          setGps('denied');
          setSample(snapshot());
          return;
        }
        /**
         * ════ A RUN HAPPENS WITH THE PHONE IN A POCKET (founder 2026-07-29) ════
         *
         * Asked AFTER the foreground grant, and only as a run is STARTING: a background-location
         * prompt at launch, for an app she has not yet run with, is the kind of ask that gets
         * refused once and then forever. A refusal is not a failure — she keeps exactly the
         * behaviour she has today, and the run records perfectly while the screen is on. So this
         * gates nothing; it only ever adds.
         */
        const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);
        if (cancelled) return;
        if (bg?.granted) void startCardioLocationTask();

        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          (loc) =>
            ingestFix({
              lat: loc.coords.latitude,
              lon: loc.coords.longitude,
              tsMs: loc.timestamp,
              accuracyM: loc.coords.accuracy ?? null,
              speedMs: loc.coords.speed ?? null,
            }),
        );
      } catch {
        if (!cancelled) {
          setGps('unavailable');
          setSample(snapshot());
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
