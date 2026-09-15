/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A PACE IS A DISTANCE OVER THE TIME IT TOOK — NOT OVER THE GAP BETWEEN TWO POLLS.
 *
 * ⛔ THE DEFECT (found 2026-08-18, in `ingestStride`). The indoor source is a CUMULATIVE reading
 * polled every five seconds, and iOS flushes `DistanceWalkingRunning` to HealthKit in BATCHES
 * minutes apart. So poll after poll returns the same figure and then one poll returns half a
 * kilometre — and the pace was computed as `dtS / segKm` with `dtS` being the five-second POLL GAP.
 * On the stage that is **0:10 /km on a treadmill**.
 *
 * ⚠️ AND THE WRONG NUMBER WAS NOT THE WORST OF IT. `kcalForSegment` bills at the pace it is handed,
 * so a batch she WALKED was priced at the running constant (1.03 against 0.55) — an 87% over-count,
 * which is the exact defect the founder had the gait picker removed for on 2026-08-04. The fix put
 * the question to the pace; the pace was lying to it.
 *
 * ⛔ AND ONE BATCH CAN CLOSE THREE KILOMETRES. The split cutter emitted at most one row per credited
 * segment, so the first two of those three never existed and the athlete's list of kilometres opened
 * at "km 3" — with one row wearing the time of all three.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

jest.mock('@/platform/notifications', () => ({ notifier: { kilometre: jest.fn(async () => {}) } }));

import { beginRun, endRun, ingestStride, setPaused, snapshot } from '@/platform/cardio/cardioRun';
import { notifier } from '@/platform/notifications';
import { KCAL_PER_KG_KM } from '@/platform/cardio/cardioMath';

const T0 = Date.parse('2026-08-18T07:00:00.000Z');
const WEIGHT = 70;

/** Move the world's clock, so `elapsedSec` (wall-clock, by design) is the run's real one. */
const at = (ms: number) => jest.setSystemTime(ms);
/** One poll of the belt, exactly as `cardioTracker` makes it: a cumulative reading, on the clock. */
function poll(km: number, atMs: number): void {
  at(atMs);
  ingestStride(km, atMs);
}
/** The five-second poll that `STRIDE_POLL_MS` really runs, over a stretch where Health flushed
 *  nothing at all — which is most of an indoor run. */
function drought(fromS: number, toS: number, km: number): void {
  for (let t = fromS; t <= toS; t += 5) poll(km, T0 + t * 1000);
}

beforeEach(() => {
  jest.useFakeTimers();
  at(T0);
  notifier.kilometre.mockClear();
  beginRun(WEIGHT, true);
  // ⚠️ A RUN BEGINS PAUSED (`EMPTY().paused === true`) — the 3·2·1 countdown is what starts it.
  setPaused(false);
});

afterEach(() => {
  endRun();
  jest.useRealTimers();
});

describe('⛔ the interval is the one the distance was covered in', () => {
  it('a batch flushed after ten minutes of silence reads as ten minutes of walking', () => {
    poll(0, T0 + 5_000); // the first reading is only a cursor
    drought(10, 600, 0); // two minutes of polls, then eight more — nothing has flushed
    poll(0.5, T0 + 605_000); // …and half a kilometre lands at once

    // 0.5 km over the ten minutes since the last reading that carried anything: 1,200 s/km ≈ 3 km/h.
    // Against the poll gap it was 5 s / 0.5 km = 10 s/km — "0:10 /km", on a belt.
    expect(snapshot().paceSec).toBeGreaterThan(1_000);
    expect(snapshot().paceSec).toBeLessThan(1_400);
  });

  it('⛔ …and it is therefore BILLED as the walk it was', () => {
    poll(0, T0 + 5_000);
    drought(10, 600, 0);
    poll(0.5, T0 + 605_000);

    // At the pace she actually covered it: 0.5 × 0.55 × 70 kg.
    expect(snapshot().calories).toBeCloseTo(0.5 * KCAL_PER_KG_KM.walk * WEIGHT, 1);
    // And nowhere near the running constant the poll gap used to hand it.
    expect(snapshot().calories).toBeLessThan(0.5 * KCAL_PER_KG_KM.run * WEIGHT * 0.7);
  });

  it('⚠️ a pause is not charged to the segment that follows it', () => {
    poll(0, T0 + 5_000);
    at(T0 + 300_000);
    setPaused(true);
    poll(0.2, T0 + 305_000); // the walk to the water fountain — real distance, not this run's
    at(T0 + 305_000);
    setPaused(false);
    poll(0.4, T0 + 605_000); // 0.2 km, in the five minutes since the belt started again

    expect(+snapshot().distanceKm.toFixed(3)).toBe(0.2);
    expect(snapshot().paceSec).toBeGreaterThan(1_300); // 300 s / 0.2 km = 1,500 s/km
    expect(snapshot().paceSec).toBeLessThan(1_700);
  });

  it('⚠️ and no human runs a kilometre in five seconds — the source is clamped, not drawn', () => {
    poll(0, T0 + 5_000);
    poll(1, T0 + 10_000); // a flush whose window we cannot see inside
    // 30 km/h is the floor of belief (`FASTEST_PACE_S`). What must never appear is "0:05 /km".
    expect(snapshot().paceSec).toBeGreaterThanOrEqual(120);
  });
});

describe('⛔ every kilometre the batch closed gets its own row', () => {
  it('a 3.2 km flush records km 1, km 2 and km 3 — the list does not open at "km 3"', () => {
    poll(0, T0 + 5_000);
    poll(3.2, T0 + 1_205_000); // twenty minutes of running, delivered in one lump

    const splits = snapshot().splits;
    expect(splits.map((s) => s.km)).toEqual([1, 2, 3]);
    // Each one carries a THIRD of the batch, apportioned by the distance that closed it — never one
    // row wearing all twenty minutes.
    for (const sp of splits) {
      expect(sp.durationSec).toBeGreaterThan(360);
      expect(sp.durationSec).toBeLessThan(390);
      expect(sp.paceSec).toBe(sp.durationSec);
    }
    // …and no kilometre invents time the run never had.
    const sum = splits.reduce((a, sp) => a + sp.durationSec, 0);
    expect(sum).toBeLessThanOrEqual(snapshot().elapsedSec);
  });

  it('⚠️ …and each of them is announced, because each of them happened', () => {
    poll(0, T0 + 5_000);
    poll(3.2, T0 + 1_205_000);
    expect(notifier.kilometre).toHaveBeenCalledTimes(3);
    expect(notifier.kilometre.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
  });

  it('a segment that closes nothing still cuts nothing', () => {
    poll(0, T0 + 5_000);
    poll(0.4, T0 + 305_000);
    expect(snapshot().splits).toEqual([]);
    expect(notifier.kilometre).not.toHaveBeenCalled();
  });
});
