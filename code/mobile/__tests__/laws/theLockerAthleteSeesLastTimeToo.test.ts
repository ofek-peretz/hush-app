// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';
import { buildCoachWatchPlan } from '@/platform/watch/watchPlan';
import type { Session, SetLog } from '@/data/local/models';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ATHLETE WITH HER PHONE IN A LOCKER SEES LAST TIME TOO.
 *
 * ⛔ FOUNDER, 2026-08-04: *"send the history for a standalone workout as well."*
 *
 * The set row shows last time's reps until she replaces them with her own. A MIRRORED session gets
 * them off the live wire; a STANDALONE one gets nothing but the plan — and the plan carried no
 * history, so the wrist drew dashes. I had left that open as "a choice", and he closed it: the
 * phone HAS the history and the phone BUILDS the plan, so it simply has to put it in.
 *
 * ⚠️ WHY IT NEEDS A LAW OF ITS OWN. The standalone runtime is the one path no screen test walks and
 * no simulator reaches without a paired watch — it is exactly where `targetRepsHi` went missing for
 * a whole build, and the comment on that field still records it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const set = (ex: string, w: number | null, reps: number, i: number): SetLog =>
  ({ exerciseId: ex, setIndex: i, recommendedWeight: w, recommendedReps: 8, actualWeight: w,
     actualReps: reps, edited: false, persistedAt: '2026-08-01T10:00:00.000Z' } as SetLog);

const history: Session[] = [
  ({ id: 'a', programDayId: 'd', startedAt: '2026-08-01T10:00:00.000Z', state: 'SAVED',
     earlyFinish: false, trained: true,
     sets: [set('bb_bench_press', 32.5, 9, 0), set('bb_bench_press', 32.5, 8, 1)] } as Session),
];

const sessions = [{
  id: 'w1',
  name: 'Upper A',
  blocks: [{ rounds: 3, items: [{ kind: 'reps' as const, ex: 'bb_bench_press', reps: [6, 8] as [number, number], load: 34 }] }],
}];

const build = (h?: Session[]) =>
  buildCoachWatchPlan({ sessions, nowMs: Date.parse('2026-08-04T10:00:00.000Z'), restInterS: 90, restTransitionS: 120, ...(h ? { history: h } : {}) });

describe('⛔ the plan carries what she did last time', () => {
  it('every set of the lift knows last time’s reps and the load behind them', () => {
    const steps = build(history)!.workouts[0].steps;
    expect(steps).toHaveLength(3);
    for (const s of steps) {
      expect(s.lastReps).toEqual([9, 8]);
      expect(s.lastLoadKg).toBe(32.5);
    }
  });

  it('⚠️ …and it is the load she FINISHED on, so the wrist’s delta measures the same thing the phone’s does', () => {
    // `lastTimeOn` takes the last load performed, not the first — Loop 1 moves it mid-exercise. If
    // the two surfaces disagreed here, the same set would read "↑1.5" on one and nothing on the other.
    const moved: Session[] = [({ ...history[0],
      sets: [set('bb_bench_press', 30, 11, 0), set('bb_bench_press', 32.5, 8, 1)] } as Session)];
    expect(build(moved)!.workouts[0].steps[0].lastLoadKg).toBe(32.5);
  });
});

describe('and it stays quiet when there is nothing to say', () => {
  it('no history at all → the fields are ABSENT, not empty arrays', () => {
    /*
     * An empty array is a claim ("she has done this lift, and did no sets") that the wrist would
     * have to unpick. Absent is the same state as a lift she has never done, which the row already
     * draws as a dash.
     */
    const s = build()!.workouts[0].steps[0];
    expect(s).not.toHaveProperty('lastReps');
    expect(s).not.toHaveProperty('lastLoadKg');
  });

  it('a lift she has never done carries nothing, even when other lifts do', () => {
    const two = [{ ...sessions[0], blocks: [
      sessions[0].blocks[0],
      { rounds: 2, items: [{ kind: 'reps' as const, ex: 'bb_back_squat', reps: [6, 8] as [number, number], load: 60 }] },
    ] }];
    const steps = buildCoachWatchPlan({ sessions: two, nowMs: Date.now(), restInterS: 90, restTransitionS: 120, history })!.workouts[0].steps;
    expect(steps.find((s) => s.exerciseId === 'bb_bench_press')!.lastReps).toEqual([9, 8]);
    expect(steps.find((s) => s.exerciseId === 'bb_back_squat')).not.toHaveProperty('lastReps');
  });
});

describe('the wrist actually reads it', () => {
  it('⛔ the standalone projector takes it off the STEP, not from a history it does not have', () => {
    /*
     * The old code set these to nil with a comment arguing the wrist has no history. True, and the
     * wrong conclusion — the phone has it and builds the plan.
     */
    const eng = read('targets/watch/LocalWorkoutEngine.swift');
    expect(eng).toContain('lastReps: cur.lastReps');
    expect(eng).toContain('lastLoadKg: cur.lastLoadKg');
  });

  it('and the plan step declares them on the Swift side', () => {
    const wire = read('targets/watch/WatchWire.swift');
    const at = wire.indexOf('struct WirePlanStep');
    const decl = wire.slice(at, wire.indexOf('\n}', at));
    expect(decl).toContain('var lastReps: [Int]?');
    expect(decl).toContain('var lastLoadKg: Double?');
  });
});
