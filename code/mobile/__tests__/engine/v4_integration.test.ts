/**
 * Phase 7b — live integration: fixtureModel sources prescriptions from the durable per-slot v4
 * engine state, advancing at week rollover. This proves the wiring end-to-end.
 */
import { fixtureModel } from '@/data/api/fixtureModel';
import { deriveSlots, getWeeklyUpdate } from '@/engine/v4/v4Engine';
import { resolveLine } from '../helpers/resolveExplain';
import type { SlotState } from '@/engine/v4/types';
import { db } from '@/data/local/db';
import type { Profile, Session, SetLog } from '@/data/local/models';

const profile: Profile = {
  sex: 'male',
  weightKg: 80,
  age: 30,
  units: 'kg',
  goal: 'build_muscle',
  experience: 'intermediate',
  daysPerWeek: 4,
  healthConnected: false,
};

beforeEach(async () => {
  await db.clearAll();
  await db.saveProfile(profile);
});

async function targetWeight(exerciseId: string): Promise<number | null> {
  const targets = await fixtureModel.sessionTargets({ programDayId: 'day_0', completedSessions: 0 });
  const t = targets.find((x) => x.exerciseId === exerciseId);
  return t ? t.recommendedWeight : null;
}

describe('generateProgram seeds durable v4 slot state', () => {
  it('persists engine slots for the program (idempotent)', async () => {
    const program = await fixtureModel.generateProgram(profile);
    const state = await db.loadEngineV4();
    expect(state).not.toBeNull();
    const slots = Object.values(state!.slots);
    expect(slots.length).toBeGreaterThan(0);
    // VERTICAL_PULL exists as its own engine pattern (override §6) — Pull A has a lat pulldown.
    expect((slots as Array<{ pattern: string }>).some((s) => s.pattern === 'VERTICAL_PULL')).toBe(true);
    void program;
  });
});

describe('week rollover advances the prescription from logged work', () => {
  it('a beat-week pushes the bench prescription above its cold-start seed', async () => {
    const program = await fixtureModel.generateProgram(profile);
    await db.saveProgram(program); // the app persists this via appStore; do it here too

    // Week-0 prescriptions (calibrating from seed).
    const seedBench = await targetWeight('bb_bench_press');
    expect(seedBench).not.toBeNull();

    // Simulate ONE completed week: for every non-core slot, log 3 crushing sets at the seed weight.
    const week0 = await fixtureModel.sessionTargets({ programDayId: 'day_0', completedSessions: 0 });
    const weightOf = (id: string) => week0.find((t) => t.exerciseId === id)?.recommendedWeight ?? null;
    const repsOf = (id: string) => week0.find((t) => t.exerciseId === id)?.recommendedReps ?? 8;

    for (const day of program.days) {
      const sets: SetLog[] = [];
      day.slots.forEach((slot, i) => {
        const w = weightOf(slot.exerciseId);
        const target = repsOf(slot.exerciseId);
        for (let s = 0; s < 3; s++) {
          sets.push({
            exerciseId: slot.exerciseId,
            setIndex: i * 3 + s,
            recommendedWeight: w,
            recommendedReps: target,
            actualWeight: w,
            actualReps: target + 4, // crush it → calibration steps the load up
            edited: false,
            persistedAt: new Date().toISOString(),
          });
        }
      });
      const session: Session = {
        id: `wk0_${day.key}`,
        programDayId: day.id,
        startedAt: new Date().toISOString(),
        state: 'SAVED',
        earlyFinish: false,
        sets,
      };
      await db.appendCompletedSession(session);
    }

    // finding 7: the engine advances at the Sat-23:59 roll — simulate a roll by rewinding the
    // anchor, so the next read folds the just-logged week.
    const rolled = (await db.loadEngineV4())!;
    rolled.lastAdvanceWeekOpen = 1;
    await db.saveEngineV4(rolled);

    // Next read triggers the weekly advance → bench load climbs above its seed.
    const advancedBench = await targetWeight('bb_bench_press');
    expect(advancedBench).not.toBeNull();
    expect(advancedBench!).toBeGreaterThan(seedBench!);
  });
});

describe('Weekly Update surfaces explanations for real (post-calibration) changes', () => {
  it('an established slot that progresses produces a Weekly Update entry with a Why', async () => {
    const p: Profile = { ...profile, daysPerWeek: 1 }; // Full Body A — one session = one week
    await db.saveProfile(p);
    const program = await fixtureModel.generateProgram(p);
    await db.saveProgram(program);

    // Force the bench slot to be ESTABLISHED (post-calibration) so a beat-week PROGRESSES
    // (calibration steps are deliberately not surfaced as "changes").
    const benchSlotId = deriveSlots(program).find((d) => d.exerciseId === 'bb_bench_press')!.slotId;
    const state = (await db.loadEngineV4())!;
    const slots = state.slots as Record<string, SlotState>;
    slots[benchSlotId] = { ...slots[benchSlotId], calibrating: false, calib_weeks: 0, tenure_weeks: 6, weeks_since_swap: 12, current_load_kg: 60, rep_target: 8, rep_range: [8, 12] };
    state.lastAdvanceWeekOpen = 1; // finding 7: anchor in the past → the next read rolls the week
    await db.saveEngineV4(state);

    // Log one completed Full Body session beating bench with room.
    const day = program.days[0];
    const sets: SetLog[] = day.slots.map((slot, i) => ({
      exerciseId: slot.exerciseId,
      setIndex: i,
      recommendedWeight: slot.exerciseId === 'bb_bench_press' ? 60 : 40,
      recommendedReps: 8,
      actualWeight: slot.exerciseId === 'bb_bench_press' ? 60 : 40,
      actualReps: 10, // beat with room
      edited: false,
      persistedAt: new Date().toISOString(),
    }));
    await db.appendCompletedSession({ id: 'wk', programDayId: day.id, startedAt: new Date().toISOString(), state: 'SAVED', earlyFinish: false, sets });

    // Trigger the weekly advance, then read the Weekly Update.
    await fixtureModel.sessionTargets({ programDayId: day.id, completedSessions: 1 });
    const update = await getWeeklyUpdate();
    expect(update).not.toBeNull();
    const push = update!.explanations.find((e) => e.pattern === 'HORIZONTAL_PUSH');
    expect(push).toBeTruthy();
    expect(resolveLine(push!.observation)).not.toBe('');
    expect(resolveLine(push!.conclusion)).not.toBe('');
    expect(resolveLine(push!.action)).not.toBe('');
    expect(resolveLine(push!.text).toLowerCase()).not.toContain('fatigue');
  });
});

describe('engine swap reaches the program and survives regen (finding 2)', () => {
  it('a slot the engine swapped shows the new exercise and is NOT reset to the blueprint lift', async () => {
    const p: Profile = { ...profile, daysPerWeek: 1 }; // Full Body A — has bb_bench_press
    await db.saveProfile(p);
    const program = await fixtureModel.generateProgram(p);
    await db.saveProgram(program);

    // The bench slot's durable, stable engine id (decoupled from display order).
    const benchSlot = program.days.flatMap((d) => d.slots).find((s) => s.exerciseId === 'bb_bench_press')!;
    expect(benchSlot.engineSlotId).toBeTruthy();

    // Simulate the engine having swapped bench → machine chest press (same HORIZONTAL_PUSH pattern).
    const state = (await db.loadEngineV4())!;
    const slots = state.slots as Record<string, SlotState>;
    slots[benchSlot.engineSlotId!] = { ...slots[benchSlot.engineSlotId!], current_exercise_id: 'machine_chest_press' };
    await db.saveEngineV4(state);

    // Regenerate: the program must ADOPT the engine's swapped exercise (not revert to bench).
    const regen = await fixtureModel.generateProgram(p);
    const ids = regen.days.flatMap((d) => d.slots).map((s) => s.exerciseId);
    expect(ids).toContain('machine_chest_press');
    expect(ids).not.toContain('bb_bench_press');

    // And the engine state was NOT reset (mistaken for a manual replacement) back to bench.
    const after = (await db.loadEngineV4())!.slots[benchSlot.engineSlotId!] as SlotState;
    expect(after.current_exercise_id).toBe('machine_chest_press');
  });
});

describe('goal change applies the C4-1 transition (rep range/target + load recompute)', () => {
  it('hypertrophy→strength updates an established slot without re-calibrating', async () => {
    const p: Profile = { ...profile, goal: 'build_muscle', daysPerWeek: 1 };
    await db.saveProfile(p);
    // History BEFORE the slot is first created → bench imports ESTABLISHED (calibrating=false).
    for (let w = 0; w < 2; w++) {
      const sets: SetLog[] = [
        { exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: 80, recommendedReps: 8, actualWeight: 80, actualReps: 8, edited: false, persistedAt: new Date().toISOString() },
      ];
      await db.appendCompletedSession({ id: `h${w}`, programDayId: 'd', startedAt: new Date().toISOString(), state: 'SAVED', earlyFinish: false, sets });
    }
    await fixtureModel.generateProgram(p); // ensureSlots → bench established, goal=hypertrophy

    // Change goal → strength and regenerate (ensureSlots applies C4-1).
    await db.saveProfile({ ...p, goal: 'get_stronger' });
    const program = await fixtureModel.generateProgram({ ...p, goal: 'get_stronger' });
    const benchId = deriveSlots(program).find((d) => d.exerciseId === 'bb_bench_press')!.slotId;
    const bench = (await db.loadEngineV4())!.slots[benchId] as SlotState;
    expect(bench.rep_range).toEqual([3, 6]); // strength range
    expect(bench.rep_target).toBe(5);
    expect(bench.calibrating).toBe(false); // NOT a new-athlete path (C4-1)
    expect(bench.current_load_kg).toBeGreaterThan(0); // recomputed from demonstrated, seed not consulted
  });
});
