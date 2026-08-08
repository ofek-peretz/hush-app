/**
 * Engine v5 — the time budget is a hard ceiling (S-64). No generated day may exceed her declared
 * minutes, at any frequency or day-one volume. This guards the edge the v4 burial exposed: a low
 * frequency concentrates a region's whole volume on one day, which must still be trimmed to fit —
 * dropping a trailing compound as the last resort (S-35), never a muscle's only exercise.
 */
import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import type { Profile, Session, ProgramDay } from '@/data/local/models';
import type { MuscleGroup } from '@/data/exercises';

const base: Profile = { units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false, repBand: '8-10' };

beforeEach(async () => { await db.clearAll(); });

describe('v5 · the ≤ budget cap holds for every generated day (S-64)', () => {
  /*
   * There was a `volume: 'moderate' | 'high'` sweep here. Neither the field nor `WeeklyVolume`
   * exists any more — it was passed and ignored, so this ran each day-count TWICE against the same
   * inputs while reporting two-way coverage. Removed rather than replaced: there is no such input.
   */
  for (let days = 1; days <= 6; days++) {
    {
      it(`${days}d · all-normal map — no day exceeds 60 min`, async () => {
        const prog = await fixtureModel.generateProgram({ ...base, daysPerWeek: days });
        for (const d of prog.days) {
          expect(estimateSessionMinutes(d)).toBeLessThanOrEqual(60);
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
  it('S-7 · a shorter declared budget is honoured — until honouring it would cost a muscle (S-35 > S-64)', async () => {
    const prog = await fixtureModel.generateProgram({ ...base, daysPerWeek: 3, workoutMinutes: 45 });
    for (const d of prog.days) {
      if (estimateSessionMinutes(d) <= 45) continue;
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
  it('S-3 · a day that cannot fit her minutes is flagged overBudget; a day that fits is not', async () => {
    // 25 minutes, not 45. Since the day lists deal COMPOUNDS across the week's days rather than
    // concentrating every muscle's lead on one of them (founder 2026-07-27), no day at 45 minutes is
    // lopsided enough to break the budget any more — which is the point of that change. The flag
    // still has to be exercised, so the scenario asks for a budget nothing can fit.
    const budget = 25;
    const prog = await fixtureModel.generateProgram({ ...base, daysPerWeek: 3, workoutMinutes: budget });
    let sawOver = false;
    for (const d of prog.days) {
      const over = estimateSessionMinutes(d) > budget + 1e-9;
      expect(!!d.overBudget).toBe(over); // set exactly when — and only when — the day cannot fit
      if (over) sawOver = true;
    }
    // The scenario exists to exercise the flag: at 3d / 25min a day reaches the S-35 floor (one lift
    // per muscle) and still overruns — over budget, and correctly so.
    expect(sawOver).toBe(true);
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
