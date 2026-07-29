/**
 * HealthKit-backed HealthGate (NATIVE iOS surface).
 *
 * Real implementation behind the `health` swap point in `platform/health.ts`,
 * built on `@kingstinct/react-native-healthkit` v14 (the SDK-54 / RN-0.81 / New-Arch
 * line; Nitro-based). Imported ONLY on iOS, and lazily, so the native module never
 * loads on web / Expo Go / a non-iOS host. Every call is defensively wrapped so a
 * missing module, a denial, or a read error degrades to the same "nothing to adopt"
 * result the stub produces (denial is a routed path, never an error — spec §7.11).
 *
 * Contract honored here (ratified OD, spec §10.3):
 *  - READ-ONLY: we request read access for the CARDIO metrics the run / walk
 *    recorder surfaces — heart rate, active energy (calories) and walking/running
 *    distance, plus workouts — and never write to Health (no `toShare`). Bodyweight
 *    is no longer read; the Profile's weight is entered by hand.
 *  - HealthKit is NOT a model input: this gate only surfaces values for the cardio
 *    log (distance / pace / heart / calories). None of it feeds the strength engine,
 *    the program, loads, or selection.
 *
 * HealthKit privacy note: iOS never reveals whether READ access was granted.
 * `getRequestStatusForAuthorization` only says whether the prompt has been shown, so
 * `permissionState()` maps "already determined" → `granted` and lets ACTUAL
 * readability gate adoption (a denied read returns no sample → "nothing to adopt").
 * This is the documented HealthKit pattern and keeps the denied path == granted.
 */
import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailableAsync,
  queryQuantitySamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import type { HealthGate } from '@/platform/health';
import type { BodyweightSample, HealthPermissionState, HeartRateSample } from './healthModel';

// String-union identifiers (v14 dropped the enum). Read-only cardio scopes — the
// metrics the run / walk recorder shows: heart rate, active energy (calories),
// walking/running distance, and the workout type itself.
const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const DISTANCE = 'HKQuantityTypeIdentifierDistanceWalkingRunning';
const WORKOUT = 'HKWorkoutTypeIdentifier';

/** Read-only auth request — cardio metrics, `toRead` only, never `toShare`
 *  (Hush never writes to Health). */
const READ_AUTH = {
  toRead: [HEART_RATE, ACTIVE_ENERGY, DISTANCE, WORKOUT],
} as const;

export const healthKitGate: HealthGate = {
  async requestPermission() {
    try {
      if (!(await isHealthDataAvailableAsync())) return false;
      // Resolves true once the request flow completes (prompt shown or already
      // determined). For READ-only this is NOT a grant signal — readability is.
      return await requestAuthorization(READ_AUTH);
    } catch {
      return false;
    }
  },

  async permissionState(): Promise<HealthPermissionState> {
    try {
      if (!(await isHealthDataAvailableAsync())) return 'unavailable';
      const status = await getRequestStatusForAuthorization(READ_AUTH);
      // 'unnecessary' = already determined → treat as granted (read grant is opaque;
      // adoption is gated on a real readable sample). Else not yet asked.
      if (status === AuthorizationRequestStatus.unnecessary) return 'granted';
      return 'unknown';
    } catch {
      return 'unavailable';
    }
  },

  // Bodyweight is no longer read from Health (weight is entered by hand). These
  // satisfy the shared HealthGate contract but never surface a value, so the
  // (now inert) bodyweight-adoption path in healthIngestion.ts simply does nothing.
  async latestBodyweight(): Promise<BodyweightSample | null> {
    return null;
  },

  async latestBodyweightKg(): Promise<number | null> {
    return null;
  },

  /**
   * The newest heart-rate sample the watch has written, with WHEN it was measured.
   *
   * The read scope has been requested since the gate was written (`HEART_RATE` is in `READ_AUTH`) —
   * nothing had ever read it. This is the read, and it is deliberately dumb: newest sample, its
   * value, its instant. Whether that is still worth drawing is `domain/heartRate`'s decision, not
   * this file's, because the same answer has to hold for the live row and for the average.
   *
   * A denial is indistinguishable from "no data" in HealthKit by design — both come back as an
   * empty result, which is exactly the null this returns. Nothing here throws.
   */
  async latestHeartRate(): Promise<HeartRateSample | null> {
    try {
      const samples = await queryQuantitySamples(HEART_RATE, {
        limit: 1,
        ascending: false, // newest first
        unit: 'count/min',
      });
      const s = samples[0];
      if (!s) return null;
      // `endDate` is when the beat was measured; `startDate` for an instantaneous sample is the
      // same instant. Prefer the end — a batched write can span a few seconds.
      const atMs = new Date(s.endDate ?? s.startDate).getTime();
      if (!Number.isFinite(s.quantity) || !Number.isFinite(atMs)) return null;
      return { bpm: s.quantity, atMs };
    } catch {
      return null;
    }
  },
};
