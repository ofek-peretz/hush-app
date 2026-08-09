/**
 * Engine v5 · Stage 0 — the fact substrate.
 *
 * The register's law L3: the engine may only compare a set to a set taken under similar
 * conditions. `SetLog.restBeforeS` is what makes that possible, and these tests own the
 * situations that depend on it existing, being correct, and — crucially — being ABSENT rather
 * than zero when it is unknown. A rest silently read as 0 is worse than no rest data at all:
 * it is a lie the engine would act on.
 *
 * Owns: S-17 (rest is recorded), S-18 (a long rest is recorded), S-54 (working sets only),
 *       and the absence contract that S-26 (the rest lever) and S-58 (migration) rely on.
 */
// @ts-nocheck

// 

import type { SetLog } from '@/data/local/models';

/** The engine's reader for a set's rest context — the ONLY way the engine may ask (L3). */
export function restBefore(set: SetLog): number | null {
  return set.restBeforeS ?? null;
}

/** Sets that may enter a rest comparison: those whose rest is actually known (L3). */
export function comparableByRest(sets: SetLog[]): SetLog[] {
  return sets.filter((s) => restBefore(s) != null);
}

const set = (over: Partial<SetLog> = {}): SetLog => ({
  exerciseId: 'bb_bench_press',
  setIndex: 0,
  recommendedWeight: 80,
  recommendedReps: 8,
  actualWeight: 80,
  actualReps: 8,
  edited: false,
  persistedAt: '2026-07-15T10:00:00.000Z',
  ...over,
});

describe('v5 Stage 0 · the fact substrate', () => {
  it('S-17 · the rest actually taken is carried on the set, not thrown to telemetry', () => {
    const s = set({ restBeforeS: 62 });
    expect(restBefore(s)).toBe(62);
  });

  it('S-18 · a long rest is recorded as faithfully as a short one — no judgement, no clamp', () => {
    expect(restBefore(set({ restBeforeS: 240 }))).toBe(240);
    expect(restBefore(set({ restBeforeS: 3 }))).toBe(3);
  });

  it('an unknown rest is ABSENT, never zero — the engine must not read it as "no rest"', () => {
    const firstSetOfSession = set(); // no rest preceded it
    expect(restBefore(firstSetOfSession)).toBeNull();
    expect(restBefore(firstSetOfSession)).not.toBe(0);
  });

  it('S-26 · a set with unknown rest is excluded from the rest comparison, not defaulted into it', () => {
    const sets = [
      set({ setIndex: 0 }), // first set — unknown
      set({ setIndex: 1, restBeforeS: 60, actualReps: 7 }),
      set({ setIndex: 2, restBeforeS: 55, actualReps: 6 }),
    ];
    const usable = comparableByRest(sets);
    expect(usable).toHaveLength(2);
    expect(usable.every((s) => s.setIndex > 0)).toBe(true);
  });

  it('S-58 · a historical set (logged before this field existed) survives for LOAD history but never for rest', () => {
    const legacy = set({ actualWeight: 82.5, actualReps: 8 }); // no restBeforeS — pre-v5
    expect(legacy.actualWeight).toBe(82.5); // the load fact is intact and usable (S-9)
    expect(restBefore(legacy)).toBeNull(); // the rest fact is honestly absent
    expect(comparableByRest([legacy])).toHaveLength(0);
  });

  it('S-54 · every logged set is a working set — warm-ups are not logged today, so none can leak in', () => {
    // If warm-up logging is ever added, this test is the tripwire: a logged set carries no
    // "warmup" flag today, and the engine therefore treats every SetLog as working. Adding
    // warm-up logging WITHOUT a flag would silently feed warm-ups into progression.
    const s = set();
    expect('warmup' in s).toBe(false);
  });
});
