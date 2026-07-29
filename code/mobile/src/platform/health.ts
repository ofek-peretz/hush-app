/**
 * Health interface (HealthKit / Health Connect). DEFERRED native surface —
 * stubbed behind this interface per the v1 build decision (wired later via
 * EAS/Mac). Spec §1.2, §7.11, §10.3.
 *
 * Product rules captured even while stubbed:
 *  - Denial is NOT a failure: the flow routes through About You; the path is
 *    visually identical to granted (§7.11).
 *  - HealthKit is NOT a model input (ratified OD); bodyweight updates flow
 *    silently to the Profile if connected, no UI (§10.3).
 *  - The iPhone Profile is the source of truth — Health only proposes values.
 *
 * The CONTRACT lives here; the ingestion pipeline that consumes it (silent
 * bodyweight adoption + telemetry) is health/healthIngestion.ts, and the data
 * model is health/healthModel.ts. This file imports nothing native so it loads
 * everywhere (Expo Go / Windows / test).
 */
import { Platform } from 'react-native';
import type { BodyweightSample, HealthPermissionState, HeartRateSample } from './health/healthModel';

export interface HealthGate {
  /** Request read permission. Resolves true iff Health is readable afterward.
   *  Denial resolves false (never throws) — denial is a routed path, not an error. */
  requestPermission(): Promise<boolean>;
  /** Current permission state WITHOUT prompting (re-check on a later launch so a
   *  revoke-in-Settings is observable). */
  permissionState(): Promise<HealthPermissionState>;
  /** Latest bodyweight in kg if connected, else null. Never blocks the UI. */
  latestBodyweightKg(): Promise<number | null>;
  /** Most-recent bodyweight sample (with timestamp) if connected, else null. */
  latestBodyweight(): Promise<BodyweightSample | null>;
  /**
   * The most recent HEART-RATE sample, with the instant it was measured (founder 2026-07-29:
   * "for an athlete with a watch we already have the heart rate from HealthKit — why not show it").
   *
   * The timestamp is not decoration and it is not optional. A watch writes heart rate to Health in
   * BATCHES, and between workouts it samples every few minutes — so "the latest sample" is very
   * often several minutes old. Printing that beside a live clock would be the same lie as a pace on
   * a phone sitting on a table, which is the defect this whole module was rebuilt around. The
   * caller decides what counts as fresh (`domain/heartRate`); the gate only reports WHAT and WHEN.
   *
   * DISPLAY ONLY, like everything else from Health — it reaches the cardio log and nothing else.
   * No load, no selection, no volume (ratified: HealthKit is not a model input).
   */
  latestHeartRate(): Promise<HeartRateSample | null>;
}

/** v1 stub: reports unavailable, so onboarding routes through About You and the
 *  denied/unavailable path is the one exercised until the native gate is added. */
export const healthStub: HealthGate = {
  async requestPermission() {
    return false;
  },
  async permissionState() {
    return 'unavailable';
  },
  async latestBodyweightKg() {
    return null;
  },
  async latestBodyweight() {
    return null;
  },
  async latestHeartRate() {
    return null;
  },
};

/**
 * Active Health provider — the single swap point.
 *
 * On iOS the HealthKit-backed gate (`health/healthKitGate.ts`, read-only bodyMass —
 * bodyweight import only) is selected via a LAZY require so its native module is
 * only loaded on the platform that has it — web / Expo Go / test never touch it,
 * and a load failure (no native module / dev client without the build) falls back
 * to the stub. Everywhere else the stub is used, so onboarding routes through the
 * identical denied/unavailable path (§7.11).
 */
function selectHealthGate(): HealthGate {
  if (Platform.OS !== 'ios') return healthStub;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('./health/healthKitGate') as { healthKitGate: HealthGate }).healthKitGate;
  } catch {
    return healthStub; // native module absent (Expo Go / build without HealthKit)
  }
}

export const health: HealthGate = selectHealthGate();
