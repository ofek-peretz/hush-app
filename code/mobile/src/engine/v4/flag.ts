/**
 * Hush v4 engine feature flag (gated rollout, approved 2026-06-24).
 *
 * OFF by default: the live prescription path stays on the existing double-progression until the v4
 * engine is verified on-device (TestFlight). When ON, fixtureModel sources prescriptions from the
 * persisted v4 per-slot state. Tests flip this via setV4Enabled() to exercise the v4 path.
 */
let enabled = false;

export function isV4Enabled(): boolean {
  return enabled;
}

/** Test/rollout hook — flip the live engine. Production default is OFF until on-device sign-off. */
export function setV4Enabled(on: boolean): void {
  enabled = on;
}
