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

// 

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import {
  beginRun,
  ingestStride,
  endRun,
  ingestFix,
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

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ HOW OFTEN THE TREADMILL IS ASKED HOW FAR SHE HAS GOT (founder, 2026-08-12)
 *
 * Five seconds, the same as the heart rate and for the same reason: Core Motion writes
 * `DistanceWalkingRunning` in short segments as she moves, and asking faster only re-reads a sample
 * that has not changed. The reading is CUMULATIVE, so a slower poll costs nothing at all — the next
 * one carries everything the last one missed (`ingestStride` credits the delta).
 *
 * ⚠️ WHICH IS THE WHOLE REASON THE INDOOR PATH IS A POLL AND THE OUTDOOR ONE IS A SUBSCRIPTION. A
 * missed GPS fix is a missed segment forever; a missed distance read is nothing.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const STRIDE_POLL_MS = 5_000;

// The pure math (gates, formatters) lives in cardioMath — native-free, unit-tested.
// ⚠️ `kcalForKm` is NOT re-exported any more (2026-08-18): it prices a whole distance at a DECLARED
// gait, and nothing has declared one since v7. Every caller here bills per segment at the pace it
// was covered at (`kcalForSegment`). The function keeps its home in `cardioMath`, where its own
// tests live; it simply has no business being handed out from the live tracker.
export { fmtClock, fmtPace, hrZone, haversineM, kcalForSegment, kcalPerKgKm, gaitFromPace, movementCredit, segmentCounts } from './cardioMath';
export type { CardioSample, GpsState } from './cardioRun';
export { heartRateReadings } from './cardioRun';

/**
 * Live cardio sample for an activity. `active` spans the whole activity (GPS stays warm across
 * pauses); `paused` gates accumulation.
 *
 * ⚠️ THERE IS NO GAIT ARGUMENT (2026-08-18). This docblock still described "the athlete toggles
 * run/walk mid-activity; calories and split attribution follow it" — a toggle deleted in v7, and a
 * behaviour that has not existed since: every credited stretch is billed at the pace it was actually
 * covered at, and every finished kilometre is labelled from its own split. The hook took a
 * `liveGait` and handed it to a setter that wrote a field nobody read.
 */
export function useCardioTracker(
  active: boolean,
  paused: boolean,
  weightKg?: number | null,
  /**
   * ⛔ INDOORS — a treadmill, a belt, a track under a roof (founder, 2026-08-12).
   *
   * The distance comes from the phone's motion coprocessor by way of Health instead of from the
   * satellite. **It is a source, not a second screen**: the maths, the calorie model and every beat
   * above this hook are identical, and `kcalPerKgKm` already prices a walking segment and a running
   * segment differently without being told which is which.
   */
  indoor = false,
): CardioSample {
  const [sample, setSample] = useState<CardioSample>(ZERO);
  const startedRef = useRef(false);

  // The weight is a fact about the run, not about this component — it goes straight through to the
  // run so a BACKGROUND fix prices its calories the same way a foreground one does.
  useEffect(() => {
    setWeight(weightKg);
  }, [weightKg]);

  // ── The activity's own lifetime: one run, one background task, released together.
  useEffect(() => {
    if (!active) return;
    beginRun(weightKg, indoor);
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
    // Foreground return → read now (the same catch-up the stride poll makes; see its note).
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') read();
    });
    return () => {
      alive = false;
      clearInterval(id);
      sub.remove();
    };
  }, [active]);

  // ── Publish once a second while the screen is up. Nothing here accumulates: it reads.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSample(snapshot()), 1000);
    setSample(snapshot());
    return () => clearInterval(id);
  }, [active, paused]);

  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ INDOORS: THE PHONE'S OWN MOTION, POLLED — the treadmill's replacement for the GPS watcher
   *
   * `HKQuantityTypeIdentifierDistanceWalkingRunning` since the run began. Core Motion derives it
   * from step cadence and a stride-length model calibrated on her outdoor GPS work, so **no watch
   * is required** — the coprocessor is in the phone. A watch improves the calibration; it is not
   * the source.
   *
   * ⚠️ IT RUNS THROUGH A PAUSE, and `ingestStride` is what refuses to credit it. The cursor has to
   * keep moving or the distance she covered standing at the water fountain arrives in one lump on
   * resume, attributed to a run that was not happening.
   *
   * ⚠️ AND `null` STANDS DOWN THE WHOLE MODE. Health unreadable — Android today, or a denied
   * grant — is not "she did not move": it is no source at all, and the stage must say so rather
   * than draw a confident 0.00 for forty minutes. That is what `unavailable` already means here.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  useEffect(() => {
    if (!active || !indoor) return;
    let alive = true;
    const startedAt = Date.now();
    let sawAny = false;
    /*
     * ⛔ AND THE MODE HAS TO ASK FOR ITS OWN SOURCE (founder 2026-08-16).
     *
     * `requestPermission` was called in exactly two places, `ConnectHealth` and `ProfileSheet` —
     * NEITHER on the cardio path. `ConnectHealth` is a skippable onboarding step, so an athlete who
     * tapped past it arrived here with HealthKit never authorized. A denied READ in HealthKit
     * returns an EMPTY ARRAY rather than an error, by design, so the poll below reads `0`, latches
     * `sawAny`, and the stage draws a confident **0 m for the whole run with no message at all** —
     * the worst of the three outcomes, because it looks like it is working.
     *
     * The outdoor half of this hook has always asked for location the moment it needs it (below).
     * Indoors asks for its source the same way, and for the same reason: a permission requested
     * where the athlete can see what it is for is the one she grants.
     *
     * ⚠️ ONLY WHEN UNDETERMINED. Re-prompting on every run is how a grant gets revoked, and iOS
     * shows the sheet once regardless. `unavailable` is Android, the simulator, or a device with no
     * HealthKit — there is no source to ask for, and the mode stands down instead of polling
     * something that will never answer.
     */
    let ready: Promise<void> | null = null;
    const ensureSource = () => {
      ready ??= (async () => {
        const state = await health.permissionState();
        if (state === 'unavailable') {
          if (alive) {
            setGps('unavailable');
            setSample(snapshot());
          }
          return;
        }
        if (state === 'unknown') await health.requestPermission();
      })().catch(() => undefined);
      return ready;
    };
    /*
     * ⚠️ AND THE RETURN TO FOREGROUND READS IMMEDIATELY (same QA finding, the indoor half).
     * Indoors there is no location session, so iOS suspends JS while the screen is off and the
     * poll freezes with it — by design: Core Motion keeps counting in HARDWARE, and the cumulative
     * read heals the whole gap in one delta. What must not happen is her reopening onto a frozen
     * figure for up to five more seconds while the interval winds back up. The AppState listener
     * below reads the instant she is back.
     */
    const read = () => {
      void ensureSource()
        .then(() => health.distanceSince(startedAt))
        .then((km) => {
          if (!alive) return;
          if (km == null) {
            // Only before the first good reading. A source that drops out mid-run keeps whatever it
            // already credited rather than retracting the kilometres she actually covered.
            if (!sawAny) {
              setGps('unavailable');
              setSample(snapshot());
            }
            return;
          }
          sawAny = true;
          ingestStride(km);
        })
        .catch(() => {
          if (alive && !sawAny) setGps('unavailable');
        });
    };
    read();
    const id = setInterval(read, STRIDE_POLL_MS);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') read();
    });
    return () => {
      alive = false;
      clearInterval(id);
      sub.remove();
    };
  }, [active, indoor]);

  // ── GPS: the permissions, the foreground watcher, and the background task.
  //    ⚠️ NOT OPENED INDOORS AT ALL — a treadmill session that asked for location would spend the
  //    battery on a receiver that reports a stationary phone, and `ingestFix` would credit nothing
  //    anyway. The permission prompt is the worse half: asking to track her location to measure a
  //    belt is the kind of ask that gets refused once and then forever.
  useEffect(() => {
    if (!active || indoor) return;
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
         * ════ ⛔ THE TASK STARTS ON THE FOREGROUND GRANT — "ALWAYS" WAS NEVER REQUIRED ════
         *
         * FOUNDER, device QA 2026-08-23, and it was critical: *"כשאני סוגר את המסך המטרים
         * והמדדים לא משתנים. כאילו זה היה בהפסקה."* He locked the phone mid-run and the whole
         * run froze — metres, calories, the kilometre notes, everything.
         *
         * The root cause was one conditional: `if (bg?.granted) startCardioLocationTask()`. The
         * TaskManager task was gated on the "Always" location upgrade — and expo-location's own
         * source says the opposite in as many words (*"As a user-initiated foreground service,
         * this does NOT require the background location permission"*): a session STARTED in the
         * foreground keeps delivering in the background on the When-In-Use grant alone, because
         * the task's own consumer sets `allowsBackgroundLocationUpdates = YES` and the app
         * declares `UIBackgroundModes: location`. That is how every workout app on the store
         * records with While-Using.
         *
         * Without the task, iOS SUSPENDS the JS runtime seconds after the screen locks — the
         * foreground watcher's provider explicitly sets `allowsBackgroundLocationUpdates = false`
         * — so nothing ran at all: not the accumulator, not the heart-rate poll, not the Live
         * Activity updates, not the per-kilometre notes. A pocketed phone IS the run's normal
         * state, which is what made this critical.
         *
         * So the task starts on the grant the run already has. The "Always" request stays, AFTER
         * the start and still un-gating: it buys relaunch-after-eviction delivery, and a refusal
         * now costs exactly nothing.
         */
        void startCardioLocationTask();
        void Location.requestBackgroundPermissionsAsync().catch(() => null);

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
  }, [active, indoor]);

  return sample;
}
