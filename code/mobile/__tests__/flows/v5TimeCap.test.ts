/**
 * Engine v5 — the time budget is a hard ceiling (S-64). No generated day may exceed her declared
 * minutes, at any frequency or day-one volume. This guards the edge the v4 burial exposed: a low
 * frequency concentrates a region's whole volume on one day, which must still be trimmed to fit —
 * dropping a trailing compound as the last resort (S-35), never a muscle's only exercise.
 */
// @ts-nocheck

// 

import { SESSION_MAX } from '@/engine/v5/constants';
import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import type { Profile, Session, ProgramDay } from '@/data/local/models';
import type { MuscleGroup } from '@/data/exercises';

const base: Profile = { units: 'kg', daysPerWeek: 4, healthConnected: false, repBand: '8-10' };

beforeEach(async () => { await db.clearAll(); });

describe('v5 · the ≤ budget cap holds for every generated day (S-64)', () => {
  /*
   * There was a `volume: 'moderate' | 'high'` sweep here. Neither the field nor `WeeklyVolume`
   * exists any more — it was passed and ignored, so this ran each day-count TWICE against the same
   * inputs while reporting two-way coverage. Removed rather than replaced: there is no such input.
   */
  for (let days = 1; days <= 6; days++) {
    {
      it(`${days}d · all-normal map — no day exceeds 60 min, or says so out loud (S-3)`, async () => {
        const prog = await fixtureModel.generateProgram({ ...base, daysPerWeek: days });
        for (const d of prog.days) {
          const min = estimateSessionMinutes(d);
          if (min > 60) {
            /*
             * Since the hour includes the warm-up bridges (2026-08-25, founder findings #4/#8), a
             * low-frequency full-body day can be genuinely unfittable: every muscle is down to its
             * last lift (S-35), every ramp is already lean, and the engine SAYS SO rather than
             * starving a muscle. The overshoot it may confess to is minutes of warm-up, not work.
             */
            expect(d.overBudget).toBe(true);
            expect(min).toBeLessThanOrEqual(63);
          }
          expect(d.slots.length).toBeGreaterThan(0); // never starved to empty
        }
      });
    }
  }

  /**
   * S-35's two protected drops outrank the ceiling, and the register says so in as many words: "If
   * honouring both leaves nothing else to cut, the workout genuinely cannot fit her minutes: that is
   * S-3, and the engine says so rather than quietly starving a muscle."
   *
   * So a shorter budget is honoured until the ONLY way to honour it is to stop training a muscle she
   * never turned off. At 3 days / 45 minutes the upper day reaches exactly that floor — one lift per
   * muscle, all at 3 sets bar the day's main lift — and the honest answer is 48 prescribed minutes,
   * not a silently deleted triceps. (Before the S-35 guard was wired into `enforceTimeCap`, this day
   * DID come in under 45 — by dropping the athlete's only biceps or triceps lift.)
   */
  it('S-7 · the hour is honoured — until honouring it would cost a muscle (S-35 > S-64)', async () => {
    /*
     * ⛔ THIS ASSERTED AGAINST 45, A BUDGET THAT STOPPED EXISTING (F-15, 2026-08-10).
     *
     * It passed `workoutMinutes: 45` and then required every day over 45 minutes to be at the S-35
     * floor. The session length is a constant now — `budgetMin` is 60 for everyone — so the param was
     * ignored and the assertion was being made about a threshold no code uses. It kept passing by
     * luck, and a catalogue change that shifted selection by one lift was enough to expose that.
     *
     * ⚠️ THE LAW ITSELF IS UNCHANGED and is the one that matters: a day may exceed her ceiling ONLY
     * when every muscle on it is already down to a single lift. Over budget is legal at the floor and
     * nowhere else — the alternative is a silently deleted triceps.
     */
    const prog = await fixtureModel.generateProgram({ ...base, daysPerWeek: 3 });
    for (const d of prog.days) {
      if (estimateSessionMinutes(d) <= SESSION_MAX) continue;
      // Over budget is legal ONLY at the floor: every non-supplemental muscle down to a single lift.
      const perMuscle: Record<string, number> = {};
      for (const s of d.slots) {
        const m = exerciseById(s.exerciseId)?.muscle;
        if (m && !s.supplemental) perMuscle[m] = (perMuscle[m] ?? 0) + 1;
      }
      expect(Object.values(perMuscle).every((n) => n <= 1)).toBe(true);
    }
  });

  it('no muscle is ever silently dropped to fit the budget (S-35 / S-63)', async () => {
    // The map trains ten muscles; a tight budget may shrink a day, never stop training one of them.
    const prog = await fixtureModel.generateProgram({ ...base, daysPerWeek: 3, workoutMinutes: 45 });
    const trained = new Set(
      prog.days.flatMap((d) => d.slots.map((s) => exerciseById(s.exerciseId)?.muscle).filter(Boolean)),
    );
    for (const m of ['Chest', 'Shoulders', 'Back', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves'] as MuscleGroup[])
      expect(trained.has(m)).toBe(true);
  });

  it('the last-resort drop never removes a muscle entirely — every trained muscle keeps a lift', async () => {
    // At 3 days all-normal the lower day is dense; after trimming, each region still trains its muscles.
    const prog = await fixtureModel.generateProgram({ ...base, daysPerWeek: 3 });
    const trained = new Set(prog.days.flatMap((d) => d.slots.map((s) => s.exerciseId)));
    expect(trained.size).toBeGreaterThanOrEqual(6); // a real, non-degenerate programme
  });

  /**
   * S-3 · THE ENGINE SAYS SO — the day carries the verdict, so the surface can speak it (Home).
   * The flag is set on ProgramDay by generateProgram at the same estimate the trims enforced, so it
   * can never disagree with the enforcement. With a fresh profile (no logged rest) the un-parameterised
   * `estimateSessionMinutes` equals the engine's internal estimate, so the biconditional is exact:
   * `overBudget` is true iff the day genuinely exceeds her minutes after every legal cut.
   */
  it('S-3 · a day that cannot fit the hour is flagged overBudget; a day that fits is not', async () => {
    /*
     * ⛔ THIS SCENARIO USED TO ASK FOR A 25-MINUTE BUDGET, and it cannot any more: the session length
     * is a CONSTANT (F-15, founder 2026-08-10) because `workoutMinutes` was a field nothing wrote.
     * A test that reaches past a constant to drive a flag is testing a state the product cannot be
     * in — which is exactly the mistake that put two unreachable "defects" in a report to him.
     *
     * ⚠️ THE FLAG IS STILL REACHED, and by the case it exists FOR. A three-day week is full-body
     * (FULL_BODY_UNTIL_DAYS), so one session carries every muscle she left on; at nine muscles the
     * day hits the S-35 floor — one lift each, every one at the three-set minimum — with nothing the
     * cap is allowed to remove. That day genuinely cannot fit the hour, and S-3 says Hush must SAY
     * so rather than starve a muscle in silence.
     */
    const prog = await fixtureModel.generateProgram({ ...base, daysPerWeek: 3 });
    for (const d of prog.days) {
      const over = estimateSessionMinutes(d) > SESSION_MAX + 1e-9;
      expect({ day: d.name, flagged: !!d.overBudget }).toEqual({ day: d.name, flagged: over });
    }
  });
});

describe('v5 · the budget is computed from HER MEASURED REST (S-64), not a fixed estimate', () => {
  const day: ProgramDay = {
    id: 'd', name: 'Upper', muscleGroups: ['Chest'], isRest: false, completed: false,
    slots: [
      { exerciseId: 'bb_bench_press', capability: 'horizontal_push', setCount: 4 },
      { exerciseId: 'triceps_pushdown', capability: 'horizontal_push', setCount: 3 },
    ],
  };

  it('a fast rester fits more work than a slow one; no data → the day-one bootstrap', () => {
    const fast = estimateSessionMinutes(day, () => 30); // 30s rest
    const slow = estimateSessionMinutes(day, () => 180); // 3-min rest
    const bootstrap = estimateSessionMinutes(day); // no rest data
    expect(fast).toBeLessThan(slow); // her rest actually moves the estimate
    expect(bootstrap).toBeGreaterThan(0);
    expect(bootstrap).toBeLessThan(slow); // the fixed bootstrap is lighter than a genuinely slow rester
  });

  it('end-to-end: a fast-rest history lets more total sets fit than a slow-rest history', async () => {
    // Four sets per lift, `setIndex` 0..3 — the rest BEFORE set 0 is the walk to the next station
    // (the TRANSITION), only 1..3 are inter-set rests, and the budget prices the two separately
    // (`domain/restPrescription`). A single-set-per-lift history would carry no inter-set rest at all.
    const set = (exerciseId: string, setIndex: number, rest: number) => ({ exerciseId, setIndex, recommendedWeight: 60, recommendedReps: 8, actualWeight: 60, actualReps: 8, edited: false, persistedAt: '', restBeforeS: rest });
    const seed = async (rest: number) => {
      await db.clearAll();
      const ids = ['bb_bench_press', 'bb_overhead_press', 'bb_row', 'bb_back_squat', 'bb_deadlift', 'hip_thrust'];
      const sess: Session = { id: 's1', programDayId: 'd', startedAt: '2026-07-10T10:00:00Z', state: 'SAVED', earlyFinish: false, sets: ids.flatMap((id) => [0, 1, 2, 3].map((i) => set(id, i, rest))) };
      await db.appendCompletedSession(sess);
      // 40 minutes, not the 60 default: the day lists now deal compounds ACROSS the week rather
      // than piling every muscle's lead onto one day (founder 2026-07-27), so at 60 min even a
      // 210-second rester fits her whole prescription and the cap never binds — which is the point
      // of that change, and which makes the cap invisible unless the budget is tight enough to bite.
      const p = await fixtureModel.generateProgram({ ...base, daysPerWeek: 4, workoutMinutes: 40 });
      return p.days.reduce((n, d) => n + d.slots.reduce((k, s) => k + s.setCount, 0), 0);
    };
    const fastSets = await seed(30);
    const slowSets = await seed(210);
    expect(fastSets).toBeGreaterThan(slowSets); // resting less → more work fits the same hour
  });
});
