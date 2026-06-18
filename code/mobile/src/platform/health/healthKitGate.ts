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
 *  - READ-ONLY: we request read access for bodyMass + distanceWalkingRunning and
 *    never write to Health (no `toShare`).
 *  - HealthKit is NOT a model input: this gate only surfaces values; the silent
 *    bodyweight adoption + telemetry live in `healthIngestion.ts`, feeding the
 *    Profile (display), never the ModelClient.
 *
 * HealthKit privacy note: iOS never reveals whether READ access was granted.
 * `getRequestStatusForAuthorization` only says whether the prompt has been shown, so
 * `permissionState()` maps "already determined" → `granted` and lets ACTUAL
 * readability gate adoption (a denied read returns no sample → "nothing to adopt").
 * This is the documented HealthKit pattern and keeps the denied path == granted.
 */
import {
  AuthorizationRequestStatus,
  getMostRecentQuantitySample,
  getRequestStatusForAuthorization,
  isHealthDataAvailableAsync,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';
import type { HealthGate } from '@/platform/health';
import type { BodyweightSample, HealthPermissionState, WalkSample } from './healthModel';

// String-union identifiers (v14 dropped the enum). Read-only scopes only.
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const DISTANCE_WALKING_RUNNING = 'HKQuantityTypeIdentifierDistanceWalkingRunning';

/** Read-only auth request — `toRead` only, never `toShare` (Hush never writes). */
const READ_AUTH = {
  toRead: [BODY_MASS, DISTANCE_WALKING_RUNNING],
} as const;

/** kilograms — the unit the Profile speaks. */
const KG = 'kg' as const;

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

  async latestBodyweight(): Promise<BodyweightSample | null> {
    try {
      const sample = await getMostRecentQuantitySample(BODY_MASS, KG);
      if (!sample) return null;
      return { kg: sample.quantity, recordedAt: sample.endDate.toISOString() };
    } catch {
      return null;
    }
  },

  async latestBodyweightKg(): Promise<number | null> {
    return (await this.latestBodyweight())?.kg ?? null;
  },

  async recentWalks(): Promise<WalkSample[]> {
    try {
      // Query recent workouts and keep walks/runs (filtering in JS avoids a
      // version-specific predicate shape). `duration`/`totalDistance` are Quantities.
      const workouts = await queryWorkoutSamples({ limit: 50, ascending: false });
      return workouts
        .filter(
          (w) =>
            w.workoutActivityType === WorkoutActivityType.walking ||
            w.workoutActivityType === WorkoutActivityType.running,
        )
        .map((w) => ({
          id: w.uuid,
          startedAt: w.startDate.toISOString(),
          distanceMeters: w.totalDistance?.quantity ?? 0,
          durationS: w.duration.quantity,
        }));
    } catch {
      return [];
    }
  },
};
