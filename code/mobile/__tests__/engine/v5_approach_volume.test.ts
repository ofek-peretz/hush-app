/**
 * Engine v5 · regression — the approach set (S-60) is NEUTRAL to volume, never a penalty.
 *
 * The approach set is set 0 of the N prescribed sets (a light measurement, not an extra set), so an
 * approach occurrence logs 1 approach + (N−1) working sets. Loop 3's completion check must treat the
 * approach set as a performed slot: it OCCUPIES a prescribed set and she really did it. Otherwise
 * (N−1) < N reads as "unfinished" — which would both block S-32 growth and, on a layoff return
 * (S-38), TRIM the muscle. S-60 excludes the approach set from volume EARNING (it never advances),
 * never turns it into a penalty against volume.
 */
// @ts-nocheck

// 

import { advanceV5, getVolumeTargetsV5, resetV5 } from '@/engine/v5/v5Engine';
import { bandFor } from '@/engine/v5/repBand';
import { muscleOf } from '@/data/exercises';
import type { Session, SetLog } from '@/data/local/models';

const BAND = bandFor('8-10'); // [8,10]
const seed = () => 60;
const CHEST = muscleOf('bb_bench_press')!;

const set = (w: number, reps: number, isApproach = false): SetLog => ({
  exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: w, recommendedReps: 8,
  actualWeight: w, actualReps: reps, edited: false, persistedAt: '', restBeforeS: 90,
  ...(isApproach ? { isApproach: true } : {}),
});
const session = (startedAt: string, sets: SetLog[]): Session => ({
  id: `s_${startedAt}`, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false, sets,
});
const T = (n: number) => new Date(2026, 6, 8 + n, 10).toISOString();
const prescribed4 = (id: string) => (id === 'bb_bench_press' ? 4 : 0);

beforeEach(async () => { await resetV5(); });

it('S-60 · a fully-completed approach occurrence still EARNS a set (approach never marks it unfinished)', async () => {
  // Prescribed 4. Set 0 is the LIGHT approach measurement; sets 1–3 are working, all at Tlo → the lift
  // advances. She completed all four prescribed slots, so the muscle is "completed" and earns +1 (S-32).
  const history = [session(T(0), [set(40, 8, /* approach */ true), set(60, 10), set(60, 10), set(60, 10)])];
  await advanceV5(['bb_bench_press'], BAND, history, seed, Date.now(), undefined, prescribed4);
  const vol = await getVolumeTargetsV5();
  expect(vol[CHEST]).toBe(5); // seed 4 → earned one → 5 (NOT held/trimmed by the approach set)
});
