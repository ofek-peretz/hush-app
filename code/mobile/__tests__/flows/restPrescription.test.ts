/**
 * Per-tier rest prescription (S2, approved 2026-07-05). Rest matches the work: compound sets
 * get real recovery, isolation sets don't; transitions stay fixed. The tier mapping is the
 * single source every surface reads (phone view, mirror → watch/Live Activity, plan snapshot).
 */
import {
  REST_COMPOUND_S,
  REST_ISOLATION_S,
  REST_TRANSITION_S,
  restInterSecondsFor,
} from '@/state/stores/sessionStore';
import { EXERCISES } from '@/data/exercises';

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
