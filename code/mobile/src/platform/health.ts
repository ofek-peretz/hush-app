/**
 * Health interface (HealthKit / Health Connect). DEFERRED native surface —
 * stubbed behind this interface per the v1 build decision (wired later via
 * EAS/Mac). Spec §1.2, §7.11, §10.3.
 *
 * Product rules captured even while stubbed:
 *  - Denial is NOT a failure: the flow routes through About You; the path is
 *    visually identical to granted (§7.11).
 *  - HealthKit is NOT a model input (ratified OD); bodyweight updates flow
 *    silently if connected, no UI (§10.3).
 */

export interface HealthGate {
  /** Request permission; resolves to whether Health is available to read. */
  requestPermission(): Promise<boolean>;
  /** Latest bodyweight in kg if connected, else null. Never blocks the UI. */
  latestBodyweightKg(): Promise<number | null>;
}

/** v1 stub: always reports unavailable, so onboarding routes through About You. */
export const healthStub: HealthGate = {
  async requestPermission() {
    return false;
  },
  async latestBodyweightKg() {
    return null;
  },
};

/**
 * Active Health provider — the single swap point. Stub today (Expo Go / no
 * native build); on a Mac/EAS dev build, replace with the HealthKit-backed gate
 * (see NATIVE_SURFACES.md: read-only quantityType bodyMass + step/walk samples,
 * `com.apple.developer.healthkit` entitlement, NSHealthShareUsageDescription).
 * Do NOT statically import an uninstalled native module here — it breaks the
 * Metro bundle; the real gate is added alongside the dev-build dependency.
 */
export const health: HealthGate = healthStub;
