/**
 * Program Ownership Contract in the LIVE model (founder-directed 2026-06-23): athlete swaps
 * and workout order are persisted and HONORED by weekly regeneration, so a fresh week never
 * silently discards the athlete's customizations.
 */
import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import type { Profile } from '@/data/local/models';

const profile: Profile = {
  units: 'kg', goal: 'build_muscle', daysPerWeek: 3, healthConnected: false,
  sex: 'male', weightKg: 80, experience: 'intermediate',
};

beforeEach(async () => {
  await db.clearAll();
  await db.saveProfile(profile);
});

/** The slot index of an exercise's muscle within a day, if present. */
function findByMuscle(programDays: { slots: { exerciseId: string }[] }[], muscle: string) {
  for (const d of programDays) {
    for (const s of d.slots) if (exerciseById(s.exerciseId)?.muscle === muscle) return s.exerciseId;
  }
  return undefined;
}

describe('exercise pins survive regeneration', () => {
  it('a swapped exercise is honored on the next generated program', async () => {
    // Athlete swaps their Chest movement to the incline barbell press.
    await fixtureModel.setExercisePreference({
      capability: 'horizontal_push', fromExercise: 'bb_bench_press', toExercise: 'incline_bb_press',
    });
    const prog = await fixtureModel.generateProgram(profile);
    const chest = prog.days.flatMap((d) => d.slots).find((s) => exerciseById(s.exerciseId)?.muscle === 'Chest');
    expect(chest?.exerciseId).toBe('incline_bb_press');
    // and the pin is durable across a SECOND regeneration (a fresh week).
    const prog2 = await fixtureModel.generateProgram(profile);
    expect(findByMuscle(prog2.days, 'Chest')).toBe('incline_bb_press');
  });

  it('restore clears the pin and the model selects again', async () => {
    await fixtureModel.setExercisePreference({
      capability: 'horizontal_push', fromExercise: 'bb_bench_press', toExercise: 'incline_bb_press',
    });
    await fixtureModel.restoreExercisePreference({ capability: 'horizontal_push' });
    const prog = await fixtureModel.generateProgram(profile);
    expect(findByMuscle(prog.days, 'Chest')).toBe('bb_bench_press'); // back to the blueprint
  });

  it('a pin never duplicates an exercise the day already contains', async () => {
    // Push A already has bench + incline_db; pinning Chest→incline_db must not create a dup.
    await fixtureModel.setExercisePreference({
      capability: 'horizontal_push', fromExercise: 'bb_bench_press', toExercise: 'incline_db_press',
    });
    const prog = await fixtureModel.generateProgram(profile);
    for (const d of prog.days) {
      const ids = d.slots.map((s) => s.exerciseId);
      expect(new Set(ids).size).toBe(ids.length); // no duplicate exercise within a day
    }
  });

  it('a pin preserves capability and muscle (valid slot)', async () => {
    await fixtureModel.setExercisePreference({
      capability: 'knee_dominant', fromExercise: 'bb_back_squat', toExercise: 'hack_squat',
    });
    const prog = await fixtureModel.generateProgram(profile);
    for (const d of prog.days) {
      for (const s of d.slots) expect(exerciseById(s.exerciseId)!.capability).toBe(s.capability);
    }
  });
});

describe('workout order survives regeneration', () => {
  it('the generated week is reordered to the athlete order', async () => {
    const base = await fixtureModel.generateProgram(profile);
    const keys = base.days.map((d) => d.key!);
    const reversed = [...keys].reverse();
    await fixtureModel.setOrder({ scope: 'workout', order: reversed });
    const prog = await fixtureModel.generateProgram(profile);
    expect(prog.days.map((d) => d.key)).toEqual(reversed);
  });
});

describe('within-workout exercise order survives regeneration', () => {
  it('a reordered workout keeps the athlete sequence on the next program', async () => {
    const base = await fixtureModel.generateProgram(profile);
    const day = base.days[0];
    const reversed = [...day.slots.map((s) => s.exerciseId)].reverse();
    await fixtureModel.setOrder({ scope: 'exercise', order: reversed, workoutKey: day.key });
    const prog = await fixtureModel.generateProgram(profile);
    const same = prog.days.find((d) => d.key === day.key)!;
    // Listed exercises lead in the athlete order; any unlisted (e.g. core) trails.
    const listed = same.slots.map((s) => s.exerciseId).filter((id) => reversed.includes(id));
    expect(listed).toEqual(reversed);
  });
});

describe('backups + substitutes persist', () => {
  it('a defined backup is stored and removable', async () => {
    await fixtureModel.setBackup({ primaryExercise: 'bb_bench_press', backupExercise: 'machine_chest_press' });
    expect((await db.loadPreferences()).backups.bb_bench_press).toBe('machine_chest_press');
    await fixtureModel.setBackup({ primaryExercise: 'bb_bench_press', remove: true });
    expect((await db.loadPreferences()).backups.bb_bench_press).toBeUndefined();
  });
});
