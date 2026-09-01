/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A RUN THE APP LOST IS STILL A RUN SHE RAN.
 *
 * ⛔ THE DEFECT (found 2026-08-18). The whole run lived in one module singleton (`cardioRun`) and
 * reached storage only when `CardioComplete` mounted. So iOS evicting the app mid-run — the exact
 * case the background location task exists for — took the distance, the splits, the route and the
 * calories with it, and she came back to nothing at all. The strength side has had
 * `saveActiveSession`, a resume snapshot and a salvage since S3; cardio had none of the three.
 *
 * ⚠️ AN EVICTION IS PRECISELY "endRun NEVER RAN". That is what these tests do: they never call it,
 * and then begin the next run. Nothing else needs simulating — the snapshot is the only thing that
 * crosses the gap, which is the whole point of it.
 *
 * ⚠️ AND THE OTHER HALF IS THE ONE THAT MUST NOT HAPPEN: a run that is OVER coming back to haunt the
 * next one. A finished run clears its snapshot; a snapshot of the wrong KIND, or older than the
 * resume window, is discarded rather than folded in. Losing twenty minutes is bad; inventing five
 * kilometres she did not run is not survivable.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

jest.mock('@/platform/notifications', () => ({ notifier: { kilometre: async () => {} } }));

import { db } from '@/data/local/db';
import {
  CARDIO_RESUME_WINDOW_MS,
  beginRun,
  endRun,
  ingestStride,
  setPaused,
  snapshot,
} from '@/platform/cardio/cardioRun';

const T0 = Date.parse('2026-08-18T07:00:00.000Z');

/** Let the run's storage round-trip land — `beginRun` reads the snapshot back asynchronously. */
const settle = () => new Promise((r) => setImmediate(r));

/** A treadmill run that covered 1.2 km and closed its first kilometre. */
function runOneKilometreIndoors(): void {
  beginRun(70, true);
  // ⚠️ A RUN BEGINS PAUSED (`EMPTY().paused === true`) — the 3·2·1 countdown is what starts it.
  setPaused(false);
  ingestStride(0, T0);
  ingestStride(1.2, T0 + 600_000);
}

beforeEach(async () => {
  endRun();
  await db.clearCardioResume();
});

afterEach(async () => {
  endRun();
  await db.clearCardioResume();
});

describe('⛔ the run is written down as it is earned', () => {
  it('the credited metres, the split and the calories all reach storage', async () => {
    runOneKilometreIndoors();
    await settle();

    const snap = await db.loadCardioResume();
    expect(snap).not.toBeNull();
    expect(Math.round(snap.distM)).toBe(1200);
    expect(snap.splits.map((s) => s.km)).toEqual([1]);
    expect(snap.cal).toBeGreaterThan(0);
    expect(snap.indoor).toBe(true);
  });

  it('⛔ …and the next run folds it back in — the eviction costs the gap, never the kilometres', async () => {
    runOneKilometreIndoors();
    await settle();

    // iOS took the app here. `endRun` never ran; the module singleton is gone with the process.
    beginRun(70, true);
    await settle();

    expect(+snapshot().distanceKm.toFixed(3)).toBe(1.2);
    expect(snapshot().splits.map((s) => s.km)).toEqual([1]);
    expect(snapshot().calories).toBeGreaterThan(0);
  });

  it('⚠️ and it carries on from there rather than re-cutting the kilometre it already cut', async () => {
    runOneKilometreIndoors();
    await settle();
    beginRun(70, true);
    await settle();
    setPaused(false);

    // The source cursor starts fresh — the poll asks Health for the distance since THIS mount.
    ingestStride(0, T0 + 900_000);
    ingestStride(0.9, T0 + 1_500_000);

    expect(+snapshot().distanceKm.toFixed(3)).toBe(2.1);
    expect(snapshot().splits.map((s) => s.km)).toEqual([1, 2]);
  });
});

describe('⛔ and a run that is over does not come back', () => {
  it('finishing clears the snapshot, so the next run starts at zero', async () => {
    runOneKilometreIndoors();
    await settle();

    endRun(); // the ordinary exit — CardioComplete has the activity and has saved it
    await settle();
    expect(await db.loadCardioResume()).toBeNull();

    beginRun(70, true);
    await settle();
    expect(snapshot().distanceKm).toBe(0);
  });

  it('⚠️ a belt’s metres are never folded into a street run', async () => {
    runOneKilometreIndoors();
    await settle();

    beginRun(70, false); // outdoors, next
    await settle();
    expect(snapshot().distanceKm).toBe(0);
  });

  it('⛔ and past the resume window it is a different run, not an interruption', async () => {
    await db.saveCardioResume({
      schema: 1,
      savedAt: Date.now() - CARDIO_RESUME_WINDOW_MS - 60_000,
      indoor: true,
      activeMs: 600_000,
      distM: 5_000,
      cal: 300,
      lastKm: 5,
      splitStartSec: 1_500,
      splits: [],
      hrReadings: [],
      route: [],
    });

    beginRun(70, true);
    await settle();
    expect(snapshot().distanceKm).toBe(0);
    // …and the stale one is not left lying around to be asked about again.
    expect(await db.loadCardioResume()).toBeNull();
  });

  it('⚠️ a run that has already earned something of its own is never overwritten', async () => {
    await db.saveCardioResume({
      schema: 1,
      savedAt: Date.now(),
      indoor: true,
      activeMs: 600_000,
      distM: 5_000,
      cal: 300,
      lastKm: 5,
      splitStartSec: 1_500,
      splits: [],
      hrReadings: [],
      route: [],
    });

    beginRun(70, true);
    setPaused(false);
    // The belt answers before the storage read does — the common ordering, and the dangerous one.
    ingestStride(0, T0);
    ingestStride(0.3, T0 + 300_000);
    await settle();

    expect(+snapshot().distanceKm.toFixed(3)).toBe(0.3);
  });
});
