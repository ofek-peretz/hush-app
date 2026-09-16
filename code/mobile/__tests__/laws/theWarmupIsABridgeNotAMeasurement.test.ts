/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WARM-UP IS A BRIDGE, NOT A MEASUREMENT — founder ruling, 2026-08-24.
 *
 * Rev 8 (2026-07-16) deleted the APPROACH SET: a light measurement that replaced the working
 * prescription and made the product look broken. That ruling stands. What the founder approved
 * today is a RAMP — labelled bridge sets that carry a cold muscle up to a heavy working weight —
 * and this law holds the four promises that keep it from ever becoming the dead mechanism again:
 *
 *   1 · the ramp NEVER touches the working prescription — same sets, same loads, with or without;
 *   2 · it exists only where it earns its place — compounds with a real external load;
 *   3 · a warm-up log is excluded from EVERY decision and EVERY celebrated figure by construction
 *       (`isApproach` + `isWarmup`, negative setIndex);
 *   4 · the hour stays honest — the promise is NOT charged for a bridge nobody asked for, and the
 *       walk (transition rest) is learned from the ramp's first touch, never from the breath after;
 *   5 · ⛔ AND IT IS OFFERED, NOT PRESCRIBED (founder, 2026-08-30) — *"לא לקבוע מראש לאף אחד חימום
 *       ומי שרוצה שילחץ על הפקד"*. No builder writes a bridge; the athlete inserts one at the
 *       station, on a compound, and the four promises above hold identically for what she inserts.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';
import { warmupRamp, warmupCountFor, WARMUP_REST_S, WARMUP_EXEC_S } from '@/domain/warmupRamp';
import { buildPlan, warmupOffer, insertWarmup } from '@/state/stores/sessionStore';
import { sessionTonnageKg, sessionHasLoggedWork } from '@/domain/sessionMetrics';
import { sessionTrained } from '@/domain/completion';
import { learnedTransitionRestS } from '@/domain/restPrescription';
import { estimateSessionMinutes } from '@/data/api/fixtureModel';
import { perSetSeconds } from '@/domain/restPrescription';
import { exerciseById } from '@/data/exercises';
import type { ProgramDay, Session, SetLog, SetTarget } from '@/data/local/models';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const BENCH = 'bb_bench_press'; // barbell compound
const BENCH2 = 'bb_back_squat'; // a second compound, for the lean-day price
const bench = exerciseById(BENCH)!;

const day = (slots: { exerciseId: string; setCount: number }[]): ProgramDay =>
  ({ id: 'd1', name: 'Upper A', isRest: false, slots }) as unknown as ProgramDay;

const targetsFor = (exerciseId: string, weight: number | null, sets = 4): SetTarget[] =>
  Array.from({ length: sets }, (_, s) => ({
    exerciseId,
    setIndex: s,
    recommendedWeight: weight,
    recommendedReps: 8,
    repBandLo: 8,
    repBandHi: 10,
  }));

/** The plan as the athlete gets it once she has pressed the disc — the ONE path a ramp now
 *  reaches a session by (`warmupOffer` decides, `insertWarmup` performs). */
const withRamp = (plan: ReturnType<typeof buildPlan>, at = 0) => {
  const offer = warmupOffer(plan, at);
  return offer ? insertWarmup(plan, offer.at, offer.ramp) : plan;
};

describe('1 · the working prescription is untouched', () => {
  it('the working steps are byte-identical with and without the ramp', () => {
    const bare = buildPlan(day([{ exerciseId: BENCH, setCount: 4 }]), targetsFor(BENCH, 60));
    const plan = withRamp(bare);
    const work = plan.filter((s) => !s.warmup);
    expect(work).toHaveLength(4);
    // …and "byte-identical" is asserted as such: everything but the re-derived position is equal.
    work.forEach((s, i) => expect({ ...s, globalIndex: 0 }).toEqual({ ...bare[i], globalIndex: 0 }));
    work.forEach((s, i) => {
      expect(s.exerciseSetIndex).toBe(i);
      expect(s.target?.recommendedWeight).toBe(60);
      expect(s.target?.repBandLo).toBe(8);
    });
    expect(work[3].lastSetOfExercise).toBe(true);
    expect(work[3].lastSetOfSession).toBe(true);
  });

  it('a warm-up step is negative-indexed, capped by a fixed breath, and never "last"', () => {
    const plan = withRamp(buildPlan(day([{ exerciseId: BENCH, setCount: 4 }]), targetsFor(BENCH, 60)));
    const ramp = plan.filter((s) => s.warmup);
    expect(ramp).toHaveLength(2);
    expect(ramp.map((s) => s.exerciseSetIndex)).toEqual([-2, -1]);
    ramp.forEach((s) => {
      expect(s.restAfterS).toBe(WARMUP_REST_S);
      expect(s.lastSetOfExercise).toBe(false);
      expect(s.lastSetOfSession).toBe(false);
    });
    // …and the ramp comes FIRST — the road to the number, before the number.
    expect(plan.findIndex((s) => s.warmup)).toBe(0);
    expect(plan[2].exerciseSetIndex).toBe(0);
  });
});

describe('2 · it exists only where it earns its place', () => {
  it('a compound with a real load: two bridges first, one for later compounds', () => {
    expect(warmupRamp(bench, 60, true)).toEqual([
      { weightKg: 30, reps: 5 },
      { weightKg: 45, reps: 3 },
    ]);
    expect(warmupRamp(bench, 60, false)).toEqual([{ weightKg: 40, reps: 3 }]);
  });

  it('an isolation lift, a bodyweight lift and an empty bar get none', () => {
    expect(warmupRamp({ tier: 'isolation', equipment: 'cable' }, 40, true)).toEqual([]);
    expect(warmupRamp({ tier: 'compound', equipment: 'bodyweight' }, null, true)).toEqual([]);
    expect(warmupRamp(bench, 20, true)).toEqual([]); // the empty bar IS the warm-up
  });

  it('a barbell bridge never goes below the empty bar', () => {
    for (const w of warmupRamp(bench, 45, true)) expect(w.weightKg).toBeGreaterThanOrEqual(20);
  });
});

describe('3 · excluded from every decision and every celebrated figure, by construction', () => {
  const warmupLog: SetLog = {
    exerciseId: BENCH,
    setIndex: -1,
    recommendedWeight: 30,
    recommendedReps: 5,
    actualWeight: 30,
    actualReps: 5,
    edited: false,
    isApproach: true,
    isWarmup: true,
    persistedAt: '2026-08-24T10:00:00.000Z',
  };
  const workLog: SetLog = { ...warmupLog, setIndex: 0, recommendedWeight: 60, actualWeight: 60, actualReps: 8, isApproach: undefined, isWarmup: undefined };
  const session = (sets: SetLog[]): Session =>
    ({ id: 's1', programDayId: 'd1', startedAt: '2026-08-24T10:00:00.000Z', sets }) as unknown as Session;

  it('the log carries BOTH marks — the standing exclusion and the honest label', () => {
    const src = read('src/state/stores/sessionStore.tsx');
    expect(src).toContain('...(current.warmup ? { isApproach: true, isWarmup: true } : {})');
  });

  it('Loop 1 and the carry-forward step over a bridge', () => {
    const src = read('src/state/stores/sessionStore.tsx');
    const guard = src.indexOf('if (current.warmup) {');
    /* Loop 1 left the live session (founder, 2026-08-26) — what remains after the guard is the
       CARRY, and a bridge must still never feed it. */
    const loop1 = src.indexOf('carryWeightForward(plan, current.globalIndex');
    expect(guard).toBeGreaterThan(-1);
    expect(loop1).toBeGreaterThan(guard); // the guard returns before Loop 1 can read a bridge
  });

  it('tonnage celebrates the work, not the road to it', () => {
    expect(sessionTonnageKg(session([warmupLog, workLog]))).toBe(60 * 8);
  });

  it('a session of only bridges is a workout she walked away from, not a record', () => {
    expect(sessionHasLoggedWork(session([warmupLog]))).toBe(false);
    expect(sessionHasLoggedWork(session([warmupLog, workLog]))).toBe(true);
  });

  it('bridges can never carry a session over the trained threshold', () => {
    const bridges = [-1, -2, -3, -4].map((i) => ({ ...warmupLog, setIndex: i }));
    const s = { ...session([...bridges, workLog]), prescribed: 10 } as unknown as Session;
    expect(sessionTrained(s, undefined)).toBe(false); // 1 working set of 10, not 5 of 10
  });
});

describe('4 · the hour and the walk stay honest', () => {
  it('⛔ the promise is NOT charged for a bridge nobody asked for (founder 2026-08-30)', () => {
    /*
     * Priced 2026-08-25, unpriced 2026-08-30, and the reversal is not a return to the 2026-08-24
     * position. That one said the governor's slack absorbs the ramp, and the founder's own session
     * disproved it — he rests the full prescribed time. This says something the earlier round could
     * not: there is no ramp to price, because no ramp exists until an athlete presses for one.
     *
     * ⚠️ THE FAULT IT CLOSES IS THE ONE THE 2026-08-24 NOTE PREDICTED AND THE 2026-08-25 REVERSAL
     * ACCEPTED — the cap shedding a WORKING SET to pay for a bridge. Acceptable while every loaded
     * compound was certainly going to be warmed up; not acceptable for a request nobody has made.
     */
    const d = day([{ exerciseId: BENCH, setCount: 3 }]);
    const perSet = perSetSeconds(BENCH, { compound: true, restS: null, execS: null }) / 60;
    expect(estimateSessionMinutes(d)).toBeCloseTo(3 * perSet, 6); // the session as written, no ramp
    // A second compound adds its own sets and NOT a bridge — the charge is gone, not relocated.
    const two = day([{ exerciseId: BENCH, setCount: 3 }, { exerciseId: BENCH2, setCount: 3 }]);
    const perSet2 = perSetSeconds(BENCH2, { compound: true, restS: null, execS: null }) / 60;
    expect(estimateSessionMinutes(two)).toBeCloseTo(3 * perSet + 3 * perSet2, 6);
    // The structural count survives as the shape of the OFFER; it simply prices nothing.
    expect(warmupCountFor(bench, true)).toBe(2);
    expect(warmupCountFor(bench, false)).toBe(1);
    expect(WARMUP_EXEC_S).toBeGreaterThan(0); // still the named cost, for whoever prices a proposal
  });

  it('the transition is learned from the ramp’s first touch, never from the breath after it', () => {
    const mk = (n: number): Session =>
      ({
        id: `s${n}`,
        programDayId: 'd1',
        startedAt: `2026-08-2${n}T10:00:00.000Z`,
        sets: [
          { exerciseId: BENCH, setIndex: -1, recommendedWeight: 30, recommendedReps: 5, actualWeight: 30, actualReps: 5, edited: false, isApproach: true, isWarmup: true, persistedAt: `2026-08-2${n}T10:00:00.000Z`, restBeforeS: 120 },
          { exerciseId: BENCH, setIndex: 0, recommendedWeight: 60, recommendedReps: 8, actualWeight: 60, actualReps: 8, edited: false, persistedAt: `2026-08-2${n}T10:02:00.000Z`, restBeforeS: WARMUP_REST_S },
        ],
      }) as unknown as Session;
    const history = [mk(1), mk(2), mk(3)];
    expect(learnedTransitionRestS(history)).toBe(120); // the walk, not the 45-second breath
  });

  it('…and a LEGACY approach set (isApproach without isWarmup) still teaches nothing', () => {
    const mk = (n: number): Session =>
      ({
        id: `s${n}`,
        programDayId: 'd1',
        startedAt: `2026-08-2${n}T10:00:00.000Z`,
        sets: [
          { exerciseId: BENCH, setIndex: 0, recommendedWeight: 30, recommendedReps: 5, actualWeight: 30, actualReps: 5, edited: false, isApproach: true, persistedAt: `2026-08-2${n}T10:00:00.000Z`, restBeforeS: 300 },
        ],
      }) as unknown as Session;
    expect(learnedTransitionRestS([mk(1), mk(2), mk(3)])).toBeNull();
  });
});

describe('3b · the hunt of 2026-08-24 — five leaks, each pinned where it was found', () => {
  const warmupSteps = () => buildPlan(day([{ exerciseId: BENCH, setCount: 3 }]), targetsFor(BENCH, 60, 3));
  const logFor = (st: { exerciseSetIndex: number; target?: { recommendedWeight: number | null; recommendedReps: number } }): SetLog => ({
    exerciseId: BENCH,
    setIndex: st.exerciseSetIndex,
    recommendedWeight: st.target?.recommendedWeight ?? null,
    recommendedReps: st.target?.recommendedReps ?? 8,
    actualWeight: st.target?.recommendedWeight ?? null,
    actualReps: st.target?.recommendedReps ?? 8,
    edited: false,
    ...(st.exerciseSetIndex < 0 ? { isApproach: true, isWarmup: true } : {}),
    persistedAt: '2026-08-24T10:00:00.000Z',
  });

  it('progressedLiftCount never reads the ramp as a raise — the 30→60 climb is the PLAN, not progress', () => {
    const { progressedLiftCount } = require('@/state/stores/sessionStore');
    const plan = warmupSteps();
    const sets = plan.map(logFor);
    expect(progressedLiftCount(plan, sets)).toBe(0); // flat 60 across the working sets = nothing rose
  });

  it('correctionsIn never draws a Loop 1 arrow on the bridge→work jump', () => {
    const { correctionsIn } = require('@/domain/liveCorrections');
    const sets = warmupSteps().map(logFor); // 30, 45, then 60·60·60
    expect(correctionsIn(sets)).toEqual([]);
  });

  it('a session of only bridges is NOT STARTED — never saved, never a record', () => {
    const src = read('src/state/stores/sessionStore.tsx');
    expect(src).toContain("session.sets.every((s) => s.isApproach) && !session.items?.length");
  });

  it('the soFar block excludes bridges, so "the set before" is never a planned climb', () => {
    const src = read('src/state/stores/sessionStore.tsx');
    expect(src).toContain('x.exerciseId === exerciseId && !x.isApproach');
  });

  it('the stage prints no load news on a bridge — half weight by design is not a delta', () => {
    const src = read('src/screens/session/SessionFlow.tsx');
    expect(src).toMatch(/session\.setLabel\?\.warmup\s*\?\s*null\s*:\s*loadNews\(\{/);
  });

  it("Loop 3's completion count never counts a bridge against the prescription", () => {
    const src = read('src/engine/v5/v5Engine.ts');
    expect(src).toContain('if (!log0.isWarmup) performedByEx[log0.exerciseId]');
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * 5 · OFFERED, NOT PRESCRIBED — founder, 2026-08-30.
 *
 *   > *"אני חושב שרק בתרגילי הקומפאונד צריך להופיע האפשרות לפקד חימום ובשאר לא. לא לקבוע מראש
 *   > לאף אחד חימום ומי שרוצה שילחץ על הפקד."*
 *
 * Two halves, both load-bearing: NOTHING is written into a plan, and the OFFER exists on compounds
 * and nowhere else. A disc that opens onto an empty ramp is the same defect as a ramp nobody asked
 * for, one screen earlier.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('5 · offered, not prescribed', () => {
  it('⛔ NO BUILDER WRITES A BRIDGE — a plan is the session as written', () => {
    const plan = buildPlan(day([{ exerciseId: BENCH, setCount: 4 }]), targetsFor(BENCH, 60));
    expect(plan.filter((s) => s.warmup)).toHaveLength(0);
    expect(plan).toHaveLength(4);
    expect(plan[0].exerciseSetIndex).toBe(0); // she starts on working set 1, not on a ramp
  });

  it('the offer is a COMPOUND’s alone — an isolation lift gets no disc at all', () => {
    const iso = buildPlan(day([{ exerciseId: 'lateral_raise', setCount: 3 }]), targetsFor('lateral_raise', 12, 3));
    expect(warmupOffer(iso, 0)).toBeNull();
    const comp = buildPlan(day([{ exerciseId: BENCH, setCount: 3 }]), targetsFor(BENCH, 60, 3));
    expect(warmupOffer(comp, 0)?.ramp).toHaveLength(2);
  });

  it('and only at the START of the exercise — never once a working set is behind her', () => {
    const plan = buildPlan(day([{ exerciseId: BENCH, setCount: 3 }]), targetsFor(BENCH, 60, 3));
    expect(warmupOffer(plan, 0)).not.toBeNull();
    expect(warmupOffer(plan, 1)).toBeNull();
    expect(warmupOffer(plan, 2)).toBeNull();
  });

  it('a later compound is offered ONE bridge — the ramp’s shape is about a cold body, not a press', () => {
    const plan = buildPlan(
      day([{ exerciseId: BENCH, setCount: 3 }, { exerciseId: BENCH2, setCount: 3 }]),
      [...targetsFor(BENCH, 60, 3), ...targetsFor(BENCH2, 100, 3)],
    );
    expect(warmupOffer(plan, 0)?.ramp).toHaveLength(2); // the day's first compound
    expect(warmupOffer(plan, 3)?.ramp).toHaveLength(1); // already half-warm
  });

  it('no offer where no distinct bridge exists — an empty-bar squat has no road to it', () => {
    const plan = buildPlan(day([{ exerciseId: BENCH, setCount: 3 }]), targetsFor(BENCH, 20, 3));
    expect(warmupOffer(plan, 0)).toBeNull();
  });

  it('⛔ pressing twice does not stack — the offer closes behind the ramp it inserted', () => {
    const plan = buildPlan(day([{ exerciseId: BENCH, setCount: 3 }]), targetsFor(BENCH, 60, 3));
    const once = insertWarmup(plan, 0, warmupOffer(plan, 0)!.ramp);
    expect(once.filter((s) => s.warmup)).toHaveLength(2);
    // The cursor has not moved; index 0 is now the first BRIDGE, and a bridge offers nothing.
    expect(warmupOffer(once, 0)).toBeNull();
    // Nor does the working set behind them re-open the door (its run no longer starts the exercise).
    expect(warmupOffer(once, 2)).toBeNull();
  });

  it('⛔ THE INSERT RENUMBERS, OR THE SESSION RUNS OFF THE END OF ITSELF', () => {
    /*
     * The machine's cursor IS a `globalIndex` and the view reads the same number as an array
     * position — two readings that agree only while the two are equal. A plan that gains steps and
     * keeps the old numbers ends the session on the wrong step, or never ends it.
     */
    const plan = buildPlan(day([{ exerciseId: BENCH, setCount: 3 }]), targetsFor(BENCH, 60, 3));
    const out = insertWarmup(plan, 0, warmupOffer(plan, 0)!.ramp);
    out.forEach((st, i) => expect(st.globalIndex).toBe(i));
    expect(out.filter((s) => s.lastSetOfSession)).toHaveLength(1);
    expect(out[out.length - 1].lastSetOfSession).toBe(true);
    // …and the bridges keep their NEGATIVE indices: this is not `liveRevision`'s reindex, which
    // would flatten them into working sets 1 and 2 of the lift.
    expect(out.filter((s) => s.warmup).map((s) => s.exerciseSetIndex)).toEqual([-2, -1]);
    expect(out.filter((s) => !s.warmup).map((s) => s.exerciseSetIndex)).toEqual([0, 1, 2]);
  });
});

describe('the label exists in both of her languages', () => {
  const en = JSON.parse(read('src/i18n/locales/en.json'));
  const he = JSON.parse(read('src/i18n/locales/he.json'));
  it('the stage line and the wrist word', () => {
    expect(en.workout.warmupOfM).toBeTruthy();
    expect(he.workout.warmupOfM).toBeTruthy();
    expect(en.watch.warmupWord).toBeTruthy();
    expect(he.watch.warmupWord).toBeTruthy();
  });
});
