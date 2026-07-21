/**
 * Engine v5 — the gaps a hermetic register↔code audit found (2026-07-21), each now closed and each
 * pinned here by the situation that demanded it. Every case below FAILED before the fix.
 *
 *  · S-11 / L11 — an in-session RAISE was never clamped to the rail, though S-11 says "always inside
 *    the rail" and S-14 calls the rail absolute. Only Loop 2 honoured it.
 *  · S-25.1  — the back-off target could equal the load she was stalled at, so "back off and
 *    re-climb" backed off nowhere and the lift froze at that load for ever.
 *  · S-17    — her measured median rest fed the time BUDGET but was never the rest PRESCRIPTION.
 *  · S-47    — an unreadable engine state rebuilt itself from history in total silence.
 */
import { correctInSession } from '@/engine/v5/loop1';
import { applyLoop1, type LiveStep } from '@/engine/v5/liveSession';
import { decideExercise } from '@/engine/v5/loop2';
import type { ExerciseMeta, ExerciseState } from '@/engine/v5/types';
import { railCeilingFor } from '@/engine/v5/v5Engine';
import { prevRung, snapDown, moveRungs, loadFloor } from '@/engine/v5/grid';
import { BAR_KG } from '@/engine/loadMath';
import { refreshLearnedRests, restInterSecondsFor, REST_COMPOUND_S } from '@/state/stores/sessionStore';
import { learnedExecS } from '@/engine/v5/timeBudget';
import type { Session } from '@/data/local/models';

const barbell: ExerciseMeta = { equipment: 'barbell', bodyweight: false };
const band = { lo: 8, hi: 10 };

// ── S-11 / L11 · the rail binds the LIVE loop too ────────────────────────────────────────────────
describe('S-11 / L11 · an in-session raise may never pass one rung above her own record', () => {
  const wildOvershoot = {
    currentLoad: 40,
    band,
    repsJustDone: 40, // an implausible rep count — a mis-key, or a prescription corrupted low
    correctionsSoFar: 0,
    isLastSet: false,
    meta: barbell,
    perRung: 0.5, // her fitted slope makes 30 reps of headroom worth 60 rungs
  };

  it('without a rail (a lift she has never completed at Tlo) the correction is free — S-49', () => {
    const r = correctInSession(wildOvershoot);
    expect(r.nextLoad!).toBeGreaterThan(100); // nothing to clamp against; her own eyes are the guard
  });

  it('with a rail, the raise stops one rung past her heaviest completed-at-Tlo load', () => {
    const r = correctInSession({ ...wildOvershoot, railCeiling: 42.5 });
    expect(r.nextLoad).toBe(42.5);
    expect(r.corrected).toBe(true);
  });

  it('the rail only ever cancels a raise — it can never pull the load DOWN', () => {
    // A rail below the load she is actually on (she is mid-session above her settled record).
    const r = correctInSession({ ...wildOvershoot, currentLoad: 60, railCeiling: 42.5 });
    expect(r.nextLoad).toBe(60);
    expect(r.corrected).toBe(false);
  });

  it('a DROP is never railed — the rail is a ceiling (S-12)', () => {
    const r = correctInSession({ ...wildOvershoot, repsJustDone: 3, railCeiling: 42.5 });
    expect(r.direction).toBe('down');
    expect(r.nextLoad!).toBeLessThan(40);
  });

  it('applyLoop1 passes the rail through to the plan the phone and the watch both read', () => {
    const plan: LiveStep[] = [0, 1, 2].map((g) => ({
      exerciseId: 'bb_bench_press',
      globalIndex: g,
      target: { recommendedWeight: 40, recommendedReps: 8, repBandLo: 8, repBandHi: 10, perRung: 0.5 },
    }));
    const railed = applyLoop1(plan, 0, 40, 40, 0, undefined, 42.5);
    expect(railed.plan[1].target.recommendedWeight).toBe(42.5);
    const free = applyLoop1(plan, 0, 40, 40, 0);
    expect(free.plan[1].target.recommendedWeight!).toBeGreaterThan(42.5);
  });
});

describe('L11 · railCeilingFor reads her real history', () => {
  const sess = (startedAt: string, sets: { w: number; r: number }[]): Session => ({
    id: startedAt,
    programDayId: 'd',
    startedAt,
    sets: sets.map((s, i) => ({
      exerciseId: 'bb_bench_press', setIndex: i,
      recommendedWeight: s.w, recommendedReps: 8, actualWeight: s.w, actualReps: s.r,
      persistedAt: startedAt,
    })),
  });

  it('one rung above the heaviest load she completed at ≥ Tlo', () => {
    const h = [sess('2026-07-01T10:00:00Z', [{ w: 60, r: 8 }, { w: 62.5, r: 5 }])];
    expect(railCeilingFor('bb_bench_press', 8, h)).toBe(62.5); // 62.5 was NOT met at Tlo → base 60
  });

  it('null when she has never completed a set at Tlo — the rail is inactive (S-49/S-60)', () => {
    const h = [sess('2026-07-01T10:00:00Z', [{ w: 60, r: 4 }])];
    expect(railCeilingFor('bb_bench_press', 8, h)).toBeNull();
  });

  it('a bodyweight lift has no load axis and therefore no rail (S-51)', () => {
    expect(railCeilingFor('pull_up', 8, [])).toBeNull();
  });
});

// ── S-25.1 · a back-off must actually back OFF ───────────────────────────────────────────────────
describe('S-25.1 · the back-off target is read strictly BELOW the wall she is stalled at', () => {
  /**
   * The freeze, exactly as it happened: she cleared 40 (→ 42.5), failed 42.5 twice (→ back to 40),
   * then failed 40 twice. Her window still holds the old 40 CLEAR, so "the heaviest load at which
   * all sets met Tlo" answered 40 — the load she was stuck on. The load never moved; `isRepeatedStall`
   * never fired either (it needs an occurrence LOWER than the current load, and 42.5 is not lower).
   */
  const frozen: ExerciseState = {
    exerciseId: 'bb_bench_press',
    load: 40,
    band,
    sets: 4,
    history: [
      { load: 40, sets: [{ load: 40, reps: 8 }, { load: 40, reps: 5 }] }, // failed the wall
      { load: 42.5, sets: [{ load: 42.5, reps: 6 }] },
      { load: 42.5, sets: [{ load: 42.5, reps: 6 }] },
      { load: 40, sets: [{ load: 40, reps: 8 }, { load: 40, reps: 8 }] }, // the old clear at the wall
      { load: 37.5, sets: [{ load: 37.5, reps: 9 }, { load: 37.5, reps: 9 }] },
    ],
  };

  it('a stall at a wall she once cleared still steps DOWN, never sideways onto itself', () => {
    const out = decideExercise({
      state: frozen,
      session: [{ load: 40, reps: 8 }, { load: 40, reps: 4 }],
      meta: { ...barbell, observedLoads: [37.5, 40, 42.5] },
    });
    expect(out.decision).toBe('stall_backoff');
    expect(out.load).toBe(37.5); // her heaviest proven load BELOW the wall
    expect(out.load!).toBeLessThan(frozen.load!); // the property that matters: it is a back-OFF
  });

  it('with no proven lighter load it falls back to one honest rung down', () => {
    const noLighter: ExerciseState = {
      ...frozen,
      history: [
        { load: 40, sets: [{ load: 40, reps: 5 }] },
        { load: 40, sets: [{ load: 40, reps: 8 }, { load: 40, reps: 8 }] },
      ],
    };
    const out = decideExercise({
      state: noLighter,
      session: [{ load: 40, reps: 5 }],
      meta: { ...barbell, observedLoads: [40] },
    });
    expect(out.decision).toBe('stall_backoff');
    expect(out.load!).toBeLessThan(40);
  });
});

// ── S-55 · the bar is the floor on the ENGINE's own grid, not just the seed's ────────────────────
describe('S-55 · a prescription never falls below the lightest weight that physically exists', () => {
  it('a barbell down-correction cannot walk under the empty bar', () => {
    // The exact bug `barIsTheFloor` was written to kill — killed in `normalizeLoad` (the cold-start
    // seed's path) and left alive in `engine/v5/grid`, which is what Loop 1 and Loop 2 actually walk.
    expect(prevRung(20, 'barbell')).toBe(BAR_KG);
    expect(prevRung(22.5, 'barbell')).toBe(BAR_KG);
    expect(snapDown(17.5, 'barbell')).toBe(BAR_KG);
    expect(moveRungs(25, -4, 'barbell')).toBe(BAR_KG);
  });

  it('above the bar nothing changes — a floor, not a rule', () => {
    expect(prevRung(60, 'barbell')).toBe(57.5);
    expect(snapDown(61, 'barbell', [20, 60, 62.5])).toBe(60);
  });

  it('it is a BARBELL fact — a 5 kg dumbbell and a 5 kg cable are perfectly real', () => {
    expect(prevRung(6, 'dumbbell')).toBe(5);
    expect(snapDown(5, 'cable')).toBe(5);
    expect(loadFloor('dumbbell')).toBe(1);
  });

  it('her lightest PERFORMED load is not a floor — that is what froze the back-off', () => {
    // A lift she has only ever done at 40 kg. Treating 40 as the floor made `max(floor, prevRung)`
    // a no-op, so a stall could never step down (S-25.1).
    expect(loadFloor('machine', [40])).toBe(2.5);
    expect(prevRung(40, 'machine', [40])).toBe(37.5);
  });

  it('a bodyweight lift has no load axis and no floor to trip over (S-51)', () => {
    expect(loadFloor('bodyweight')).toBe(0);
    expect(prevRung(0, 'bodyweight')).toBe(0);
  });
});

// ── B-4 · her SET DURATIONS replace the day-one work bootstrap ───────────────────────────────────
describe('B-4 · the per-set cost is replaced by BOTH facts it names, not just the rest', () => {
  const at = (iso: string, restBeforeS?: number, exerciseId = 'bb_bench_press', sessionId = 's1') =>
    ({ exerciseId, sessionId, atMs: Date.parse(iso), restBeforeS });

  it('exec = the gap between two sets, minus the rest that separated them', () => {
    // 10:00:00 → 10:02:30 is 150 s; 120 s of it was rest, so the set itself took 30 s.
    expect(learnedExecS([at('2026-07-01T10:00:00Z'), at('2026-07-01T10:02:30Z', 120)])).toBe(30);
  });

  it('an unknown rest is never read as zero — it would turn her whole rest into "work" (L3)', () => {
    expect(learnedExecS([at('2026-07-01T10:00:00Z'), at('2026-07-01T10:02:30Z')])).toBeNull();
  });

  it('a pair across two exercises, or across two sessions, is not a set duration', () => {
    expect(learnedExecS([at('2026-07-01T10:00:00Z'), at('2026-07-01T10:02:30Z', 120, 'bb_row')])).toBeNull();
    expect(learnedExecS([at('2026-07-01T10:00:00Z'), at('2026-07-01T10:02:30Z', 120, 'bb_bench_press', 's2')])).toBeNull();
  });

  it('she put the phone down mid-exercise — that gap is dropped, not clamped', () => {
    expect(learnedExecS([at('2026-07-01T10:00:00Z'), at('2026-07-01T12:00:00Z', 120)])).toBeNull();
  });

  it('the median of her real pairs is her number', () => {
    expect(learnedExecS([
      at('2026-07-01T10:00:00Z'),
      at('2026-07-01T10:02:20Z', 120), // 20 s
      at('2026-07-01T10:04:50Z', 120), // 30 s
      at('2026-07-01T10:07:30Z', 120), // 40 s
    ])).toBe(30);
  });
});

// ── S-17 · her median rest IS the prescription ───────────────────────────────────────────────────
describe('S-17 · the rest timer is her own measured median, not a constant she fights', () => {
  const restHistory = (restS: number): Session[] => [
    {
      id: 's1', programDayId: 'd', startedAt: '2026-07-01T10:00:00Z',
      sets: [0, 1, 2, 3].map((i) => ({
        exerciseId: 'bb_bench_press', setIndex: i,
        recommendedWeight: 60, recommendedReps: 8, actualWeight: 60, actualReps: 8,
        restBeforeS: restS, persistedAt: '2026-07-01T10:00:00Z',
      })),
    },
  ];

  afterEach(() => refreshLearnedRests([]));

  it('no rest data yet → the day-one tier bootstrap stands', () => {
    refreshLearnedRests([]);
    expect(restInterSecondsFor('bb_bench_press')).toBe(REST_COMPOUND_S);
  });

  it('a 45-second rester gets a 45-second timer', () => {
    refreshLearnedRests(restHistory(45));
    expect(restInterSecondsFor('bb_bench_press')).toBe(45);
  });

  it('a slow rester is credited too — it follows her either way, up or down', () => {
    refreshLearnedRests(restHistory(240));
    expect(restInterSecondsFor('bb_bench_press')).toBe(240);
  });

  it('an unknown rest is never read as zero (L3) — an all-unknown history leaves the bootstrap', () => {
    const h = restHistory(60);
    for (const s of h[0].sets) delete (s as { restBeforeS?: number }).restBeforeS;
    refreshLearnedRests(h);
    expect(restInterSecondsFor('bb_bench_press')).toBe(REST_COMPOUND_S);
  });

  it('a lift she has never rested on keeps the bootstrap while another lift is learned', () => {
    refreshLearnedRests(restHistory(45));
    expect(restInterSecondsFor('bb_bench_press')).toBe(45);
    expect(restInterSecondsFor('bb_row')).toBe(REST_COMPOUND_S);
  });
});
