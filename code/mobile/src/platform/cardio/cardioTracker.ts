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
import { audioSession } from '@/platform/voice/audioSession';
import { indoorReadingKm, pedometer } from './pedometer';
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

/**
 * ⛔ THE PEDOMETER IS ASKED EVERY SECOND (2026-09-15). Unlike Health it answers live, so a second is
 * what makes the metres move as she walks. The query reads the coprocessor's own count: it costs a
 * read, not a sensor.
 */
const PEDOMETER_POLL_MS = 1_000;

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
     * ════ ⛔ TWO MEASUREMENTS OF ONE WALK — THE LIVE ONE AND THE COMPLETE ONE (founder, 2026-09-15) ════
     *
     * Health alone was minutes late: the iPhone flushes `DistanceWalkingRunning` in batches, so every
     * treadmill run sat on its first metre and then jumped. The pedometer (`modules/hush-pedometer`)
     * answers the same question from the motion coprocessor within a second, and is polled every
     * second. Health is still read, every five: it is the only source that carries the WATCH's
     * strides, which is all there is when the phone sits on the console. The run is credited from the
     * larger of the two (`indoorReadingKm`) — the same strides measured twice are one distance.
     *
     * Each source keeps its own last reading, so a source that drops out mid-run cannot pull the
     * figure down, and `ingestStride` refuses anything that goes backwards anyway.
     */
    let pedometerKm: number | null = null;
    let healthKm: number | null = null;
    /*
     * ⚠️ WHEN HEALTH OVERTAKES THE PEDOMETER, ITS BATCH WAS WALKED OVER ITS OWN INTERVAL. The
     * pedometer credits every second or two, so a watch batch that lands above it (0.50 → 0.62 km)
     * would be timed over one second: a 2:00 /km pace and running-rate calories. The span that
     * batch covered is the time since Health last moved, scaled to the part of it that is new.
     */
    let healthChangedAtMs = Date.now();
    let healthCoveredSinceMs: number | undefined;
    let creditedKm = 0;
    let lastStrideAtMs = 0;
    let healthAnswered = false;
    let pedometerAnswered = false;
    const pedometerLive = pedometer.usable();
    /*
     * ⛔ AND THE PROCESS STAYS AWAKE WITH THE SCREEN LOCKED. Outdoors the location session keeps it
     * running; indoors nothing did, so iOS suspended it and the lock-screen card, the wrist and the
     * kilometre notes froze until she looked. The workout's keep-alive, held by this run by name
     * (`holdKeepAlive`) — a treadmill opened from inside a workout does not stop the workout's loop.
     *
     * ⚠️ WHAT STAYS FROZEN, AND WHY IT IS iOS: HealthKit's store is protected while the device is
     * locked (`errorDatabaseInaccessible` → `distanceSince` null → the last Health figure holds). So
     * the phone-on-the-console, watch-on-the-wrist run advances on the lock screen only when she
     * unlocks, and heals in one read then. The pedometer is not protected — a phone on her keeps
     * moving the card live.
     */
    void audioSession.holdKeepAlive('indoorRun');
    /*
     * ⛔ AND THE MODE HAS TO ASK FOR ITS OWN SOURCE (founder 2026-08-16).
     *
     * `requestPermission` was called in exactly two places, `ConnectHealth` and `ProfileSheet` —
     * NEITHER on the cardio path. A denied READ in HealthKit returns an EMPTY ARRAY rather than an
     * error, so the poll read `0` and the stage drew a confident **0 m for the whole run with no
     * message at all**. Indoors asks for its source where she can see what it is for.
     *
     * ⚠️ ONLY WHEN UNDETERMINED — re-prompting on every run is how a grant gets revoked. And the
     * pedometer's own Motion & Fitness prompt waits for this one: two system sheets at once is how
     * one of them gets dismissed unread.
     */
    let ready: Promise<void> | null = null;
    const ensureSource = () => {
      ready ??= (async () => {
        const state = await health.permissionState();
        if (state === 'unknown') await health.requestPermission();
      })().catch(() => undefined);
      return ready;
    };
    const credit = () => {
      if (!alive) return;
      const km = indoorReadingKm(pedometerKm, healthKm);
      if (km == null) {
        // Only before the first good reading, and only once every source has answered: nothing to
        // measure with is `unavailable`. A source that drops out later keeps what it credited.
        if (!sawAny && healthAnswered && (pedometerAnswered || !pedometerLive)) {
          setGps('unavailable');
          setSample(snapshot());
        }
        return;
      }
      sawAny = true;
      // A source that answered late lifts the "no source" line it could not have prevented.
      if (snapshot().gps === 'unavailable') setGps('ready');
      const ledByHealth = healthKm != null && km === healthKm && km > (pedometerKm ?? 0);
      // ⚠️ A STRICTLY LATER INSTANT EVERY TIME. Both sources can answer inside the same millisecond, and
      // `ingestStride` drops a reading that is not newer than the last — which silently lost the one
      // that carried the watch's batch, with `creditedKm` already claiming it.
      const at = Math.max(Date.now(), lastStrideAtMs + 1);
      lastStrideAtMs = at;
      ingestStride(km, at, ledByHealth && km > creditedKm ? healthCoveredSinceMs : undefined);
      creditedKm = Math.max(creditedKm, km);
    };
    const readHealth = () => {
      void ensureSource()
        .then(() => health.distanceSince(startedAt))
        .then((km) => {
          healthAnswered = true;
          if (km != null && km > (healthKm ?? 0)) {
            const now = Date.now();
            const batchKm = km - (healthKm ?? 0);
            const newKm = km - Math.max(creditedKm, pedometerKm ?? 0);
            healthCoveredSinceMs = newKm > 0 ? now - (now - healthChangedAtMs) * Math.min(1, newKm / batchKm) : undefined;
            healthChangedAtMs = now;
            healthKm = km;
          } else if (km != null && healthKm == null) {
            healthKm = km;
          }
          credit();
        })
        .catch(() => {
          healthAnswered = true;
          credit();
        });
    };
    const readPedometer = () => {
      if (!pedometerLive) return;
      void ensureSource()
        .then(() => pedometer.kmSince(startedAt))
        .then((km) => {
          pedometerAnswered = true;
          if (km != null) pedometerKm = Math.max(pedometerKm ?? 0, km);
          credit();
        })
        .catch(() => {
          pedometerAnswered = true;
          credit();
        });
    };
    /*
     * ⚠️ AND THE RETURN TO FOREGROUND READS IMMEDIATELY (the build-57 QA finding, the indoor half).
     * Core Motion keeps counting in HARDWARE while the process sleeps, and both reads are cumulative,
     * so one read heals the whole gap. What must not happen is her reopening onto a frozen figure
     * while the intervals wind back up.
     */
    const read = () => {
      readPedometer();
      readHealth();
    };
    read();
    const pedometerId = setInterval(readPedometer, PEDOMETER_POLL_MS);
    const healthId = setInterval(readHealth, STRIDE_POLL_MS);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') read();
    });
    return () => {
      alive = false;
      clearInterval(pedometerId);
      clearInterval(healthId);
      sub.remove();
      void audioSession.releaseKeepAlive('indoorRun');
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
