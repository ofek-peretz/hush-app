/**
 * HealthKit data model (non-native layer).
 *
 * The shapes the app reads from Health and the persisted record of the Health
 * connection. HealthKit is CONVENIENCE-ONLY and is NEVER a model input (ratified
 * OD, spec §10.3): bodyweight read here flows silently into the local Profile for
 * display; it is not sent to the model and the model's only inputs remain actual
 * weight + actual reps (see ModelClient). The iPhone Profile stays the source of
 * truth — Health only ever proposes a value the phone may adopt.
 */

// 


/** Permission lifecycle as the app understands it. `unknown` until first checked;
 *  `unavailable` when there is no HealthKit (Expo Go / web / pre-native build). */
export type HealthPermissionState = 'unknown' | 'granted' | 'denied' | 'unavailable';

/** A bodyweight reading from Health, normalized to kilograms. */
export interface BodyweightSample {
  kg: number;
  /** When the sample was recorded in Health (ISO), if known. */
  recordedAt?: string;
}

/**
 * A heart-rate reading from Health, with the instant it was MEASURED.
 *
 * `atMs` is load-bearing: a watch batches its writes, so the newest sample in Health is regularly
 * minutes old. Only `domain/heartRate` decides whether that is still worth drawing.
 */
export interface HeartRateSample {
  bpm: number;
  atMs: number;
}

/**
 * A workout Health recorded that this app did not — her football, her spin class, her swim.
 *
 * Deliberately the shape of a FACT and nothing else: what it was, when, how long, and whatever the
 * watch measured. No interpretation, no scoring, no "load". The coach reads it the way it reads a
 * run she recorded herself, and decides what it means for tomorrow.
 */
export interface ExternalWorkout {
  /** Apple's own activity name, lowercased — "soccer", "cycling", "swimming", "highIntensityIntervalTraining". */
  kind: string;
  /** When it started (ISO). */
  at: string;
  minutes: number;
  /** Active kilocalories, when the watch measured them. */
  kcal?: number;
  /** Average heart rate, when the watch measured it. */
  avgHr?: number;
  /** Distance in kilometres, for the sports that cover ground. */
  km?: number;
}

/** Durable record of the Health connection (persisted via db; see DataProtection). */
export interface HealthState {
  permission: HealthPermissionState;
  /** Last bodyweight (kg) adopted from Health, for idempotent re-ingestion. */
  lastBodyweightKg: number | null;
  /** When ingestion last ran successfully (ISO), else null. */
  lastSyncedAt: string | null;
}

export const INITIAL_HEALTH_STATE: HealthState = {
  permission: 'unknown',
  lastBodyweightKg: null,
  lastSyncedAt: null,
};
