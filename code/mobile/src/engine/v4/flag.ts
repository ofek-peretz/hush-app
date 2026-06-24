/**
 * Hush v4 engine feature flag.
 *
 * ON by default (2026-06-24): the v4 engine is the LIVE prescription source — fixtureModel sources
 * prescriptions from the persisted v4 per-slot state. The legacy double-progression (`prescribe()`)
 * is retained ONLY as rollback code, reached when this is OFF. Tests that exercise the legacy
 * rollback path opt out explicitly via `setV4Enabled(false)`.
 */
let enabled = true;

export function isV4Enabled(): boolean {
  return enabled;
}

/** Rollback / test hook — flip the live engine. Production default is ON (v4). */
export function setV4Enabled(on: boolean): void {
  enabled = on;
}
