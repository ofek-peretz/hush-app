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
import { learnedTransitionRestS, restWithSample } from '@/domain/restPrescription';
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
    //
    // ⛔ AND NOT A SECOND MORE. The ramp was in this price from 2026-08-25; the founder's 2026-08-30
    // ruling made the warm-up an offer, so the day is priced as written and a bridge costs the
    // promise nothing until an athlete asks for one (`theWarmupIsABridgeNotAMeasurement` §4).
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

/**
 * ════ A REST SHE PRESSED THROUGH IS NOT A THREE-SECOND REST (founder 2026-08-30) ════
 *
 * *"אני צריך להזין את הסט שביצעתי ואז לדלג ישר על המנוחה כי כבר נחתי פיזית בפועל."*
 *
 * The rest clock starts when the set is LOGGED, not when it ended, so an athlete who forgets to log
 * and then presses on is recording his thumb. Those seconds were a sample in the median that IS his
 * next prescription — and F-17's count gate cannot save him, because for a habitual skipper the
 * skips are the majority. See `isRestSample` for the whole argument.
 */
describe('the rest floor · a declined rest is UNKNOWN, never a small number', () => {
  afterEach(() => refreshLearnedRests([]));

  it('skips do not enter the inter median — three of them leave the bootstrap standing', () => {
    refreshLearnedRests([
      sess([log('bb_bench_press', 0, 130), log('bb_bench_press', 1, 2), log('bb_bench_press', 2, 3), log('bb_bench_press', 3, 1)]),
    ]);
    // Without the floor these three medianed to 2 s and became his prescription on the bench.
    expect(restInterSecondsFor('bb_bench_press')).toBe(REST_COMPOUND_S);
  });

  it('a skip among real rests is dropped, not medianed — the median is of what he actually took', () => {
    refreshLearnedRests([
      sess([
        log('bb_bench_press', 0, 130),
        log('bb_bench_press', 1, 60), log('bb_bench_press', 2, 2), log('bb_bench_press', 3, 62), log('bb_bench_press', 4, 58),
      ]),
    ]);
    expect(restInterSecondsFor('bb_bench_press')).toBe(60); // 58/60/62 — the 2 never counted
  });

  it('⛔ IT IS A FLOOR ON POSSIBILITY, NOT ON VIRTUE — a genuinely fast athlete is learned exactly', () => {
    refreshLearnedRests([
      sess([
        log('lateral_raise', 0, 130),
        log('lateral_raise', 1, 24), log('lateral_raise', 2, 25), log('lateral_raise', 3, 26),
      ]),
    ]);
    expect(restInterSecondsFor('lateral_raise')).toBe(25); // his pace, not a mistake to be corrected
  });

  it('the walk is subject to the same floor — a crossing pressed through is not a two-second walk', () => {
    refreshLearnedRests([
      sess([log('bb_bench_press', 0, 2), log('lat_pulldown', 0, 3), log('leg_press', 0, 1)]),
    ]);
    expect(restTransitionSeconds()).toBe(REST_TRANSITION_S);
    expect(learnedTransitionRestS([sess([log('bb_bench_press', 0, 2), log('lat_pulldown', 0, 3), log('leg_press', 0, 1)])])).toBeNull();
  });

  it('the live sample passes the same gate as a recorded one — one rule, both sides of the write', () => {
    // `restWithSample` feeds the learned-rest beat. A 2-second press-through must not announce a
    // number the store then refuses to bank: the beat and the record are one derivation.
    const history = [
      sess([log('bb_bench_press', 0, 130), log('bb_bench_press', 1, 60), log('bb_bench_press', 2, 62), log('bb_bench_press', 3, 58)]),
    ];
    expect(restWithSample(history, 'bb_bench_press', 2)).toBe(60); // unmoved — the skip is not evidence
    expect(restWithSample(history, 'bb_bench_press', 90)).toBe(61); // a real rest still moves it
  });
});
