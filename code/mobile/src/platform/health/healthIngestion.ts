/**
 * HealthKit ingestion pipeline (non-native layer).
 *
 * Pulls from the HealthGate and decides what the Profile should silently adopt.
 * Pure orchestration with injected dependencies (gate, clock, telemetry sink) so
 * it is fully unit-testable without a native HealthKit.
 *
 * Invariants this pipeline guarantees:
 *  - CONVENIENCE-ONLY / NEVER a model input: it only ever proposes a bodyweight
 *    for the local Profile (display). It never touches the model client.
 *  - DENIAL IS FULLY FUNCTIONAL: a denied/unavailable/errored read returns a
 *    clean result with no adoption; the app is unaffected.
 *  - iPhone IS SOURCE OF TRUTH: a value is adopted only when Health differs from
 *    what the Profile already holds; ingestion is idempotent (re-running with no
 *    new sample adopts nothing).
 *  - It NEVER throws — observability over failure (telemetry), never a crash.
 */
// @ts-nocheck

// 

import type { HealthGate } from '@/platform/health';
import { HEALTH_EVENTS } from '@/platform/events';
import type { HealthState } from './healthModel';

export interface HealthIngestionDeps {
  health: HealthGate;
  /** Last persisted Health record (permission + last adopted weight). */
  prevState: HealthState;
  /** What the Profile currently holds, so we only adopt a genuine change. */
  profileWeightKg: number | null;
  now: () => number;
  /** Telemetry sink (track). Injected so the pipeline stays pure/testable. */
  track: (type: string, data?: Record<string, unknown>) => void;
}

export interface HealthIngestionResult {
  /** The new durable Health record to persist. */
  state: HealthState;
  /** Bodyweight (kg) the Profile should silently adopt, or null for no change. */
  adoptedBodyweightKg: number | null;
}

/** Round to 0.1 kg so float jitter from a sample never looks like a "change". */
function norm(kg: number): number {
  return Math.round(kg * 10) / 10;
}

/**
 * Run ingestion. Reads current permission, and — only when granted — the latest
 * bodyweight, adopting it into the Profile if it genuinely differs. Always emits
 * the observed permission state so a later revoke-in-Settings is reconstructable.
 */
export async function ingestHealth(deps: HealthIngestionDeps): Promise<HealthIngestionResult> {
  const { health, prevState, profileWeightKg, now, track } = deps;
  const nowIso = () => new Date(now()).toISOString();

  let permission = prevState.permission;
  try {
    permission = await health.permissionState();
  } catch {
    permission = 'unavailable';
  }
  // Always record the observed state (cheap, and makes revoke/grant transitions
  // reconstructable in the dataset).
  track(HEALTH_EVENTS.permissionState, { state: permission });

  // Denied / unavailable / unknown → no ingestion; the app is unaffected.
  if (permission !== 'granted') {
    return { state: { ...prevState, permission }, adoptedBodyweightKg: null };
  }

  let sampleKg: number | null = null;
  try {
    const sample = await health.latestBodyweight();
    sampleKg = sample ? sample.kg : null;
  } catch {
    track(HEALTH_EVENTS.ingestionFailed, { reason: 'read_threw' });
    return { state: { ...prevState, permission }, adoptedBodyweightKg: null };
  }

  if (sampleKg == null) {
    // Granted but nothing to read — not a failure; just nothing to adopt.
    return {
      state: { ...prevState, permission, lastSyncedAt: nowIso() },
      adoptedBodyweightKg: null,
    };
  }

  const next = norm(sampleKg);
  const current = profileWeightKg == null ? null : norm(profileWeightKg);
  const changed = next !== current;
  const state: HealthState = {
    permission,
    lastBodyweightKg: next,
    lastSyncedAt: nowIso(),
  };

  if (!changed) {
    // Idempotent: Health agrees with the Profile (the source of truth) — adopt nothing.
    return { state, adoptedBodyweightKg: null };
  }

  track(HEALTH_EVENTS.bodyweightIngested, { hadPrior: current != null });
  return { state, adoptedBodyweightKg: next };
}

/**
 * Record the outcome of the one-time Connect Health permission prompt. Pure
 * telemetry helper used by the ConnectHealth screen so the grant/deny decision
 * lands in the research dataset (and the denied path is observable).
 */
export function recordPermissionOutcome(
  granted: boolean,
  track: (type: string, data?: Record<string, unknown>) => void,
): void {
  track(HEALTH_EVENTS.permissionRequested);
  track(granted ? HEALTH_EVENTS.connected : HEALTH_EVENTS.denied);
}
