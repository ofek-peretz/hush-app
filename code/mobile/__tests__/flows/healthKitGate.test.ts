/**
 * healthKitGate — denial/unavailable safety.
 *
 * Under jest the native HealthKit module is mocked so isHealthDataAvailable()
 * resolves false (jest.setup.js). The gate must degrade exactly like the stub:
 * 'unavailable', no samples, no walks, never throwing. This locks the contract
 * the ingestion pipeline relies on (denial is a routed path, never an error).
 */
import { healthKitGate } from '@/platform/health/healthKitGate';

describe('healthKitGate (HealthKit unavailable under test)', () => {
  it('reports unavailable when HealthKit is not available', async () => {
    await expect(healthKitGate.permissionState()).resolves.toBe('unavailable');
  });

  it('requestPermission resolves false (no module), never throws', async () => {
    await expect(healthKitGate.requestPermission()).resolves.toBe(false);
  });

  it('reads nothing when unavailable', async () => {
    await expect(healthKitGate.latestBodyweight()).resolves.toBeNull();
    await expect(healthKitGate.latestBodyweightKg()).resolves.toBeNull();
    await expect(healthKitGate.recentWalks()).resolves.toEqual([]);
  });
});
