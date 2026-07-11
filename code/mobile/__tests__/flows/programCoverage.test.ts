/**
 * Hermetic program coverage. Every athlete category — sex × daysPerWeek × goal × age —
 * must receive a complete, well-rounded, valid program, and the catalog invariant that
 * makes muscle-scoped swaps safe (each muscle ⊂ exactly one capability) must hold.
 */
import { fixtureModel } from '@/data/api/fixtureModel';
import { EXERCISES, exerciseById } from '@/data/exercises';
import { db } from '@/data/local/db';
import type { Capability, Goal, Profile, Program } from '@/data/local/models';

// Validates the cold-start seed/reps math (v4's week-1 seed, surfaced through sessionTargets when a
// no-history athlete has no engine slot yet) plus split-library coverage.

const GOALS: Goal[] = ['get_stronger', 'build_muscle', 'general_fitness', 'toning'];
const CAPS: Capability[] = [
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'knee_dominant',
  'hip_dominant',
];

function profile(over: Partial<Profile>): Profile {
  return { units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false, ...over };
}

function firstCompoundSetCount(p: Program): number {
  for (const d of p.days) {
    for (const s of d.slots) {
      if (exerciseById(s.exerciseId)!.tier === 'compound') return s.setCount;
    }
  }
  return 0;
}

// Each test starts with no persisted v4 engine state, so sessionTargets exercises the cold-start
// seed/reps fallback deterministically (generateProgram persists per-slot state; without isolation a
// prior test's slots would leak into a later sessionTargets call).
beforeEach(async () => {
  await db.clearAll();
});

describe('catalog invariant — muscle ⊂ capability (keeps swaps valid)', () => {
  it('each muscle group maps to exactly one capability', () => {
    const seen = new Map<string, Capability>();
    for (const e of EXERCISES) {
      const prev = seen.get(e.muscle);
      if (prev) expect(prev).toBe(e.capability);
      else seen.set(e.muscle, e.capability);
    }
  });

  it('every exercise carries exactly three cues and a muscle group', () => {
    for (const e of EXERCISES) {
      expect(e.cues).toHaveLength(3);
      expect(e.muscle).toBeTruthy();
    }
  });
});

describe('every sex × days × goal yields a complete program', () => {
  for (const sex of ['male', 'female'] as const) {
    for (let days = 1; days <= 6; days++) {
      for (const goal of GOALS) {
        it(`${sex} · ${days}d · ${goal}`, async () => {
          const prog = await fixtureModel.generateProgram(profile({ sex, daysPerWeek: days, goal }));
          expect(prog.days).toHaveLength(days);

          for (const d of prog.days) {
            expect(d.slots.length).toBeGreaterThanOrEqual(4);
            for (const s of d.slots) {
              const ex = exerciseById(s.exerciseId);
              expect(ex).toBeTruthy();
              expect(ex!.capability).toBe(s.capability); // slot contract holds
              expect(s.setCount).toBeGreaterThanOrEqual(3);
              expect(s.setCount).toBeLessThanOrEqual(5);
            }
            expect(d.muscleGroups.length).toBeGreaterThan(0);
          }

          // A 3+ day week trains all five capabilities.
          if (days >= 3) {
            const caps = new Set(prog.days.flatMap((d) => d.slots.map((s) => s.capability)));
            for (const c of CAPS) expect(caps.has(c)).toBe(true);
          }

          // Any multi-day week includes direct core work. Calves are a MEN's-split
          // prescription only (founder 2026-07-10): women's splits spend those slots
          // on the glute / lower-body emphasis instead and never assign calf work.
          if (days >= 2) {
            const muscles = new Set(
              prog.days.flatMap((d) => d.slots.map((s) => exerciseById(s.exerciseId)!.muscle)),
            );
            expect(muscles.has('Calves')).toBe(sex === 'male');
            expect(muscles.has('Core')).toBe(true);
          }
        });
      }
    }
  }
});

describe('goal differentiates volume and reps', () => {
  it('strength & hypertrophy add a compound set; lighter goals stay at 3', async () => {
    const strong = await fixtureModel.generateProgram(profile({ goal: 'get_stronger' }));
    const hyper = await fixtureModel.generateProgram(profile({ goal: 'build_muscle' }));
    const fitness = await fixtureModel.generateProgram(profile({ goal: 'general_fitness' }));
    const lean = await fixtureModel.generateProgram(profile({ goal: 'toning' }));
    expect(firstCompoundSetCount(strong)).toBe(4);
    expect(firstCompoundSetCount(hyper)).toBe(4);
    expect(firstCompoundSetCount(fitness)).toBe(3);
    expect(firstCompoundSetCount(lean)).toBe(3);
  });

  it('compound reps rise strength → hypertrophy → fitness → toning', async () => {
    const repsFor = async (goal: Goal) => {
      await db.saveProfile(profile({ goal }));
      const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 1 });
      return targets.find((x) => x.exerciseId === 'bb_bench_press' && x.setIndex === 0)!.recommendedReps;
    };
    expect(await repsFor('get_stronger')).toBe(5);
    expect(await repsFor('build_muscle')).toBe(8);
    expect(await repsFor('general_fitness')).toBe(10);
    expect(await repsFor('toning')).toBe(12);
  });
});

describe('leg-frequency philosophy (founder-directed 2026-06-21)', () => {
  const isLowerDay = (name: string) => /^(Lower|Legs)/.test(name);
  const isUpperDay = (name: string) => /^(Upper|Push|Pull)/.test(name);

  it('men: a single dedicated leg day per week (two only at 6 days)', async () => {
    for (let days = 1; days <= 6; days++) {
      const prog = await fixtureModel.generateProgram(profile({ sex: 'male', daysPerWeek: days }));
      const legDays = prog.days.filter((d) => isLowerDay(d.name)).length;
      if (days <= 5) expect(legDays).toBeLessThanOrEqual(1);
      else expect(legDays).toBe(2);
    }
  });

  it('women: lower/glute sessions always ≥ upper sessions', async () => {
    for (let days = 1; days <= 6; days++) {
      const prog = await fixtureModel.generateProgram(profile({ sex: 'female', daysPerWeek: days }));
      const lower = prog.days.filter((d) => isLowerDay(d.name)).length;
      const upper = prog.days.filter((d) => isUpperDay(d.name)).length;
      expect(lower).toBeGreaterThanOrEqual(upper);
    }
  });
});

describe('age handling', () => {
  it('older athletes start lighter than younger on the same lift', async () => {
    const seed = async (age: number) => {
      await db.saveProfile(profile({ age, sex: 'male', weightKg: 80, experience: 'intermediate' }));
      const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 1 });
      return targets.find((x) => x.exerciseId === 'bb_back_squat' && x.setIndex === 0)!.recommendedWeight!;
    };
    expect(await seed(68)).toBeLessThan(await seed(30));
  });

  it('60+ gets a joint-friendly rep floor even when chasing strength', async () => {
    await db.saveProfile(profile({ goal: 'get_stronger', age: 66 }));
    const targets = await fixtureModel.sessionTargets({ programDayId: 'd', completedSessions: 1 });
    const benchSet0 = targets.find((x) => x.exerciseId === 'bb_bench_press' && x.setIndex === 0)!;
    expect(benchSet0.recommendedReps).toBeGreaterThanOrEqual(8);
  });

  it('65+ trims one compound set for recovery', async () => {
    const masters = await fixtureModel.generateProgram(profile({ goal: 'get_stronger', age: 70 }));
    const young = await fixtureModel.generateProgram(profile({ goal: 'get_stronger', age: 30 }));
    expect(firstCompoundSetCount(young)).toBe(4);
    expect(firstCompoundSetCount(masters)).toBe(3);
  });
});
