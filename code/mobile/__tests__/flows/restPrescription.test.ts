/**
 * Per-tier rest prescription (S2, approved 2026-07-05). Rest matches the work: compound sets
 * get real recovery, isolation sets don't; transitions stay fixed. The tier mapping is the
 * single source every surface reads (phone view, mirror → watch/Live Activity, plan snapshot).
 */
// @ts-nocheck

// 

import {
  REST_COMPOUND_S,
  REST_ISOLATION_S,
  REST_TRANSITION_S,
  restInterSecondsFor,
  restTransitionSeconds,
  refreshLearnedRests,
} from '@/state/stores/sessionStore';
import { learnedTransitionRestS } from '@/domain/restPrescription';
import { estimateSessionMinutes } from '@/data/api/fixtureModel';
import { EXERCISES } from '@/data/exercises';
import type { ProgramDay, Session, SetLog } from '@/data/local/models';

describe('restInterSecondsFor', () => {
  it('compound lifts rest 150 s, isolation lifts 75 s', () => {
    expect(restInterSecondsFor('bb_back_squat')).toBe(REST_COMPOUND_S);
    expect(restInterSecondsFor('bb_bench_press')).toBe(REST_COMPOUND_S);
    expect(restInterSecondsFor('lateral_raise')).toBe(REST_ISOLATION_S);
    expect(restInterSecondsFor('triceps_pushdown')).toBe(REST_ISOLATION_S);
  });

  it('bodyweight compounds (dips, pull-ups) rest like compounds', () => {
    expect(restInterSecondsFor('chest_dip')).toBe(REST_COMPOUND_S);
    expect(restInterSecondsFor('pull_up')).toBe(REST_COMPOUND_S);
  });

  it('unknown / missing exercise falls back to the compound (safe) rest', () => {
    expect(restInterSecondsFor(null)).toBe(REST_COMPOUND_S);
    expect(restInterSecondsFor('not_a_lift')).toBe(REST_COMPOUND_S);
  });

  it('every catalog exercise resolves to one of the two tiers', () => {
    for (const e of EXERCISES) {
      const s = restInterSecondsFor(e.id);
      expect([REST_COMPOUND_S, REST_ISOLATION_S]).toContain(s);
      expect(s).toBe(e.tier === 'isolation' ? REST_ISOLATION_S : REST_COMPOUND_S);
    }
  });

  it('rest ordering invariant: isolation < transition < compound', () => {
    expect(REST_ISOLATION_S).toBeLessThan(REST_TRANSITION_S);
    expect(REST_TRANSITION_S).toBeLessThan(REST_COMPOUND_S);
  });
});

// ── S-17 · the TWO learned rests, split by the fact the log carries (setIndex) ─────────────────
const log = (exerciseId: string, setIndex: number, restBeforeS?: number): SetLog => ({
  exerciseId, setIndex, recommendedWeight: 40, recommendedReps: 8, actualWeight: 40, actualReps: 8,
  edited: false, persistedAt: '2026-07-20T10:00:00Z',
  ...(restBeforeS != null ? { restBeforeS } : {}),
});
const sess = (sets: SetLog[]): Session => ({
  id: 's', programDayId: 'd', startedAt: '2026-07-20T10:00:00Z', state: 'SAVED', earlyFinish: false, sets,
});

describe('S-17 · her median rest becomes the prescription — inter and transition, each its own fact', () => {
  afterEach(() => refreshLearnedRests([])); // never leak learned state into the tier tests above

  it('a first-set rest is the TRANSITION — it never drags the lift\'s inter median up', () => {
    /*
     * Set 0 arrives after the ~130 s walk+setup; sets 1..3 after her real ~60 s rests. The old
     * single pool put 130 into the bench median; now the inter median is HER between-sets number
     * alone.
     *
     * ⚠️ THREE LIFTS, NOT ONE, SINCE F-17 (2026-08-16). The transition is POOLED, so one walk is one
     * sample — and one sample is not a median (see `theRestIsTheCoachsOrHerOwn`). The subject of
     * this test is the SPLIT, and giving the pooled side enough evidence to speak is what lets the
     * split actually be asserted on both sides of it.
     */
    refreshLearnedRests([
      sess([
        log('bb_bench_press', 0, 128), log('bb_bench_press', 1, 58), log('bb_bench_press', 2, 60), log('bb_bench_press', 3, 62),
        log('lat_pulldown', 0, 130), log('leg_press', 0, 132),
      ]),
    ]);
    expect(restInterSecondsFor('bb_bench_press')).toBe(60); // the walk is nowhere in it
    expect(restTransitionSeconds()).toBe(130); // …and the walks became the transition prescription
  });

  it('the transition is POOLED across lifts — the walk is a fact about her gym, not the lift', () => {
    refreshLearnedRests([
      sess([log('bb_bench_press', 0, 100), log('lat_pulldown', 0, 120), log('leg_press', 0, 140)]),
    ]);
    expect(restTransitionSeconds()).toBe(120);
  });

  it('no samples → the declared bootstraps stand (never a guess, never zero)', () => {
    refreshLearnedRests([sess([log('bb_bench_press', 0), log('bb_bench_press', 1)])]); // rests unknown
    expect(restInterSecondsFor('bb_bench_press')).toBe(REST_COMPOUND_S);
    expect(restTransitionSeconds()).toBe(REST_TRANSITION_S);
    expect(learnedTransitionRestS([])).toBeNull();
  });

  it('S-64 · the budget prices the transition the timer will actually run', () => {
    // One lift, 3 sets, measured: exec 40 s, inter 60 s, transition 120 s. The first set follows the
    // TRANSITION, so the day costs 2×(40+60) + (40+120) — not 3×(40+60).
    const day: ProgramDay = {
      id: 'd', name: 'Push', muscleGroups: ['Chest'], isRest: false, key: '0', completed: false,
      slots: [{ capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 3 }],
    };
    const priced = estimateSessionMinutes(day, () => 60, () => 40, 120);
    expect(priced).toBeCloseTo((2 * (40 + 60) + (40 + 120)) / 60, 5);
    // Omitting the transition keeps the old pricing — every existing caller is untouched.
    expect(estimateSessionMinutes(day, () => 60, () => 40)).toBeCloseTo((3 * (40 + 60)) / 60, 5);
  });
});
