/**
 * Lock System (Launch Roadmap item 4) — the athlete-controlled exercise lock.
 *
 * Contract:
 *  - a LOCKED slot is NEVER auto-swapped by the v4 engine (swap.ts I-7), regardless of mismatch /
 *    miss streak / tenure;
 *  - the lock belongs to the SLOT (durable engine slotId) and survives weekly regeneration;
 *  - manual replacement is still allowed, and the lock stays attached to the slot (the new
 *    exercise becomes current, the slot stays locked);
 *  - the lock is purely athlete-controlled — manual replacement no longer implies a lock.
 */
import { fixtureModel } from '@/data/api/fixtureModel';
import { slotIdsByPosition, engineSlotIdAt, getDebugState } from '@/engine/v4/v4Engine';
import { swapAllowed } from '@/engine/v4/swap';
import { db } from '@/data/local/db';
import { exerciseById, exercisesForMuscle } from '@/data/exercises';
import type { Profile, Program, Slot } from '@/data/local/models';
import type { MuscleGroup } from '@/data/exercises';

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

interface EngineSlotRef {
  dayId: string;
  index: number;
  slotId: string;
  slot: Slot;
}

/** The first engine-managed (lockable) slot in a program. */
function firstEngineSlot(program: Program): EngineSlotRef {
  const ids = slotIdsByPosition(program);
  for (const day of program.days) {
    const arr = ids.get(day.id) ?? [];
    for (let i = 0; i < day.slots.length; i++) {
      if (arr[i] != null && !day.slots[i].supplemental) {
        return { dayId: day.id, index: i, slotId: arr[i]!, slot: day.slots[i] };
      }
    }
  }
  throw new Error('no engine slot in program');
}

/** Find a program slot by its durable engine slotId (position may shift across regen). */
function slotById(program: Program, slotId: string): Slot | null {
  const ids = slotIdsByPosition(program);
  for (const day of program.days) {
    const arr = ids.get(day.id) ?? [];
    for (let i = 0; i < day.slots.length; i++) if (arr[i] === slotId) return day.slots[i];
  }
  return null;
}

async function engineLocked(slotId: string): Promise<boolean | undefined> {
  const dbg = await getDebugState();
  return dbg.slots.find((s) => s.slotId === slotId)?.locked;
}

describe('slot id derivation', () => {
  it('gives every engine slot a stable id and leaves core / unmapped slots unlockable', async () => {
    const program = await fixtureModel.generateProgram(profile);
    const ids = slotIdsByPosition(program);
    // At least one engine slot, and the supplemental core slot maps to null (not lockable).
    let engineCount = 0;
    let coreNull = false;
    for (const day of program.days) {
      const arr = ids.get(day.id) ?? [];
      day.slots.forEach((slot, i) => {
        if (slot.supplemental) coreNull = coreNull || arr[i] === null;
        else if (arr[i] != null) engineCount++;
      });
    }
    expect(engineCount).toBeGreaterThan(0);
    expect(coreNull).toBe(true);
    const ref = firstEngineSlot(program);
    expect(engineSlotIdAt(program, ref.dayId, ref.index)).toBe(ref.slotId);
  });
});

describe('default state', () => {
  it('engine slots start unlocked; core slots are not lockable (undefined)', async () => {
    const program = await fixtureModel.generateProgram(profile);
    const ref = firstEngineSlot(program);
    expect(ref.slot.locked).toBe(false);
    const core = program.days.flatMap((d) => d.slots).find((s) => s.supplemental);
    if (core) expect(core.locked).toBeUndefined();
  });
});

describe('locking', () => {
  it('a lock reaches the engine, displays on the slot, and survives regeneration', async () => {
    let program = await fixtureModel.generateProgram(profile);
    await db.saveProgram(program);
    const ref = firstEngineSlot(program);

    await fixtureModel.setSlotLock({ slotId: ref.slotId, locked: true });

    // Re-generate: the lock shows on the slot AND is reconciled into engine state.
    program = await fixtureModel.generateProgram(profile);
    expect(slotById(program, ref.slotId)?.locked).toBe(true);
    expect(await engineLocked(ref.slotId)).toBe(true);

    // A second regeneration keeps it (durable across weeks).
    program = await fixtureModel.generateProgram(profile);
    expect(slotById(program, ref.slotId)?.locked).toBe(true);
  });

  it('a LOCKED slot is never engine-swapped, even when every swap precondition is met', async () => {
    const program = await fixtureModel.generateProgram(profile);
    const ref = firstEngineSlot(program);
    await fixtureModel.setSlotLock({ slotId: ref.slotId, locked: true });
    await fixtureModel.generateProgram(profile); // reconcile engine state

    const dbg = await getDebugState();
    const engineSlot = dbg.slots.find((s) => s.slotId === ref.slotId)!;
    expect(engineSlot.locked).toBe(true);
    // A context that WOULD permit a swap for an unlocked slot — the lock must still block it.
    const swappable = { ...engineSlot, miss_streak: 9, tenure_weeks: 12, weeks_since_swap: 12, calibrating: false };
    expect(swapAllowed(swappable, { available_equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'], trendDown: true, broadCause: false })).toBe(false);
    // Sanity: the SAME slot unlocked, same context, WOULD swap — proving the lock is what blocks it.
    expect(swapAllowed({ ...swappable, locked: false }, { available_equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'], trendDown: true, broadCause: false })).toBe(true);
  });

  it('unlocking clears it everywhere', async () => {
    const program = await fixtureModel.generateProgram(profile);
    const ref = firstEngineSlot(program);
    await fixtureModel.setSlotLock({ slotId: ref.slotId, locked: true });
    await fixtureModel.setSlotLock({ slotId: ref.slotId, locked: false });
    const regenerated = await fixtureModel.generateProgram(profile);
    expect(slotById(regenerated, ref.slotId)?.locked).toBe(false);
    expect(await engineLocked(ref.slotId)).toBe(false);
  });
});

describe('manual replacement', () => {
  it('keeps the lock attached to the slot; the new exercise becomes current', async () => {
    let program = await fixtureModel.generateProgram(profile);
    const ref = firstEngineSlot(program);
    await fixtureModel.setSlotLock({ slotId: ref.slotId, locked: true });

    // Manually replace the locked exercise with another in the SAME muscle (same capability/pattern,
    // so the slot identity is preserved).
    const cur = exerciseById(ref.slot.exerciseId)!;
    const alt = exercisesForMuscle(cur.muscle as MuscleGroup).find((e) => e.id !== cur.id);
    expect(alt).toBeTruthy();
    await fixtureModel.setExercisePreference({ capability: ref.slot.capability, fromExercise: cur.id, toExercise: alt!.id });

    program = await fixtureModel.generateProgram(profile);
    const after = slotById(program, ref.slotId);
    expect(after?.exerciseId).toBe(alt!.id); // new exercise is current
    expect(after?.locked).toBe(true); // lock stayed attached to the slot
  });

  it('does NOT implicitly lock a slot (lock is explicit / athlete-controlled only)', async () => {
    let program = await fixtureModel.generateProgram(profile);
    const ref = firstEngineSlot(program);
    const cur = exerciseById(ref.slot.exerciseId)!;
    const alt = exercisesForMuscle(cur.muscle as MuscleGroup).find((e) => e.id !== cur.id);
    await fixtureModel.setExercisePreference({ capability: ref.slot.capability, fromExercise: cur.id, toExercise: alt!.id });

    program = await fixtureModel.generateProgram(profile);
    expect(slotById(program, ref.slotId)?.locked).toBe(false); // replacement did not lock it
  });
});
