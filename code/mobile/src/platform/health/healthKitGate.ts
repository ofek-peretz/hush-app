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
 *  - READ-ONLY: we request read access for bodyMass ONLY (bodyweight import) and
 *    never write to Health (no `toShare`). No activity / steps / distance / workout
 *    scope is requested — HealthKit is bodyweight import, nothing else.
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
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import type { HealthGate } from '@/platform/health';
import type { BodyweightSample, HealthPermissionState } from './healthModel';

// String-union identifiers (v14 dropped the enum). Read-only scopes only.
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';

/** Read-only auth request — bodyweight ONLY, `toRead` only, never `toShare`
 *  (Hush never writes, and reads nothing beyond bodyweight). */
const READ_AUTH = {
  toRead: [BODY_MASS],
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
};
