/**
 * HealthKit ingestion — convenience-only, never a model input, denial fully
 * functional, iPhone is source of truth. Pure pipeline with an injected gate.
 */
import { ingestHealth, recordPermissionOutcome } from '@/platform/health/healthIngestion';
import { INITIAL_HEALTH_STATE } from '@/platform/health/healthModel';
import { HEALTH_EVENTS } from '@/platform/events';
import type { HealthGate } from '@/platform/health';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

function gate(over: Partial<HealthGate> = {}): HealthGate {
  return {
    requestPermission: async () => true,
    permissionState: async () => 'granted',
    latestBodyweightKg: async () => null,
    latestBodyweight: async () => ({ kg: 80 }),
    ...over,
  };
}

function run(g: HealthGate, profileWeightKg: number | null) {
  const events: { type: string; data?: Record<string, unknown> }[] = [];
  return ingestHealth({
    health: g,
    prevState: INITIAL_HEALTH_STATE,
    profileWeightKg,
    now: () => NOW,
    track: (type, data) => void events.push({ type, data }),
  }).then((res) => ({ res, events, types: events.map((e) => e.type) }));
}

describe('ingestHealth — granted', () => {
  it('adopts a new bodyweight silently into the profile', async () => {
    const { res, events } = await run(gate(), null);
    expect(res.adoptedBodyweightKg).toBe(80);
    expect(res.state.permission).toBe('granted');
    expect(res.state.lastBodyweightKg).toBe(80);
    expect(events.some((e) => e.type === HEALTH_EVENTS.bodyweightIngested)).toBe(true);
  });

  it('is idempotent — adopts nothing when Health agrees with the profile (source of truth)', async () => {
    const { res, types } = await run(gate(), 80);
    expect(res.adoptedBodyweightKg).toBeNull();
    expect(types).not.toContain(HEALTH_EVENTS.bodyweightIngested);
  });

  it('treats sub-0.1kg jitter as no change (rounding)', async () => {
    const { res } = await run(gate({ latestBodyweight: async () => ({ kg: 80.04 }) }), 80);
    expect(res.adoptedBodyweightKg).toBeNull();
  });

  it('granted but no sample → no adoption, not a failure', async () => {
    const { res, types } = await run(gate({ latestBodyweight: async () => null }), null);
    expect(res.adoptedBodyweightKg).toBeNull();
    expect(types).not.toContain(HEALTH_EVENTS.ingestionFailed);
  });
});

describe('ingestHealth — denial path stays fully functional', () => {
  it('denied → no read, no adoption, denied recorded', async () => {
    const { res, types } = await run(gate({ permissionState: async () => 'denied' }), 75);
    expect(res.adoptedBodyweightKg).toBeNull();
    expect(res.state.permission).toBe('denied');
    expect(types).toContain(HEALTH_EVENTS.permissionState);
  });

  it('unavailable (gate throws on permission) → unavailable, no crash', async () => {
    const g = gate({ permissionState: async () => { throw new Error('no native module'); } });
    const { res } = await run(g, null);
    expect(res.state.permission).toBe('unavailable');
    expect(res.adoptedBodyweightKg).toBeNull();
  });

  it('a read that throws → ingestion_failed, never throws upward', async () => {
    const g = gate({ latestBodyweight: async () => { throw new Error('read failed'); } });
    const { res, types } = await run(g, null);
    expect(res.adoptedBodyweightKg).toBeNull();
    expect(types).toContain(HEALTH_EVENTS.ingestionFailed);
  });
});

describe('recordPermissionOutcome', () => {
  it('captures grant', () => {
    const ev: string[] = [];
    recordPermissionOutcome(true, (t) => ev.push(t));
    expect(ev).toEqual([HEALTH_EVENTS.permissionRequested, HEALTH_EVENTS.connected]);
  });
  it('captures denial (the routed, functional path)', () => {
    const ev: string[] = [];
    recordPermissionOutcome(false, (t) => ev.push(t));
    expect(ev).toEqual([HEALTH_EVENTS.permissionRequested, HEALTH_EVENTS.denied]);
  });
});
