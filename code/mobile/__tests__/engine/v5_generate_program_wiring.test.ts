/**
 * Engine v5 · Revision 7 — generateProgram is map-driven for the v5 cohort (end-to-end wiring).
 *
 * The pure assembler (v5_program_assembly) is unit-tested; this drives the whole generateProgram
 * pipeline (assembleV5DayLists → dayFromBlueprint → core + time cap) for a profile with a declared
 * band + body map, proving the body map actually shapes the real programme — and that a legacy
 * profile (no band) still gets the split, unchanged.
 */
import { fixtureModel } from '@/data/api/fixtureModel';
import { muscleOf } from '@/data/exercises';
import { db } from '@/data/local/db';
import type { Profile } from '@/data/local/models';

const profile = (over: Partial<Profile>): Profile => ({
  units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false, ...over,
});
const musclesIn = (p: { days: { slots: { exerciseId: string }[] }[] }) =>
  new Set(p.days.flatMap((d) => d.slots.map((s) => muscleOf(s.exerciseId))));

beforeEach(async () => { await db.clearAll(); });

describe('Rev 7 · generateProgram is map-driven for a v5 profile', () => {
  it('a declared band + body map → the map shapes the programme (legs off ⇒ no lower work)', async () => {
    const p = await fixtureModel.generateProgram(profile({
      repBand: '8-10',
      bodyMap: { Quads: 'off', Hamstrings: 'off', Glutes: 'off', Calves: 'off' },
    }));
    expect(p.days.length).toBe(4);
    for (const d of p.days) expect(d.slots.length).toBeGreaterThan(0); // no empty workout
    // S-2 end-to-end: not a single lower-body lift is programmed.
    for (const m of ['Quads', 'Hamstrings', 'Glutes', 'Calves']) expect(musclesIn(p).has(m as never)).toBe(false);
    // NO slot carries an engine slot id. v5 keys every decision to the EXERCISE — "State is keyed to
    // the exercise, never to a slot" (Loop 2) — and S-29 deletes the `canonicalEngineId` unification
    // that was the key's only consumer. This assertion used to demand the opposite; it was written
    // for v4's slot-keyed progression and outlived it.
    expect(p.days.every((d) => d.slots.every((s) => s.engineSlotId == null))).toBe(true);
  });

  it('emphasis is honoured end-to-end — an emphasised muscle is trained', async () => {
    const p = await fixtureModel.generateProgram(profile({
      repBand: '8-10', daysPerWeek: 3,
      bodyMap: { Chest: 'emphasis' },
    }));
    expect(p.days.length).toBe(3);
    expect(musclesIn(p).has('Chest' as never)).toBe(true); // S-63: emphasis guaranteed ≥1 exercise
  });

  it('a profile with no declared body map → an all-normal assembled programme (no demographic shelf)', async () => {
    const p = await fixtureModel.generateProgram(profile({ sex: 'male' }));
    expect(p.days.length).toBe(4);
    // Map-driven with an all-normal default — every day still has work; the split is deleted (Part 5).
    for (const d of p.days) expect(d.slots.length).toBeGreaterThan(0);
  });

  it('S-2 · Core turned OFF ⇒ no core work is added (the map is the only "off" lever, S-50/S-74)', async () => {
    const coreSlots = (p: { days: { slots: { exerciseId: string }[] }[] }) =>
      p.days.flatMap((d) => d.slots).filter((s) => muscleOf(s.exerciseId) === 'Core').length;
    const off = await fixtureModel.generateProgram(profile({ repBand: '8-10', bodyMap: { Core: 'off' } }));
    expect(coreSlots(off)).toBe(0); // Core off never appears — not even as a supplemental finisher
    const normal = await fixtureModel.generateProgram(profile({ repBand: '8-10', bodyMap: {} }));
    expect(coreSlots(normal)).toBe(1); // normal Core → one supplemental core movement
  });

  it('S-4 · Core EMPHASISED ⇒ a second core movement (the mark is not silently wasted, S-50)', async () => {
    const coreIds = (p: { days: { slots: { exerciseId: string }[] }[] }) =>
      new Set(p.days.flatMap((d) => d.slots).filter((s) => muscleOf(s.exerciseId) === 'Core').map((s) => s.exerciseId));
    const emph = await fixtureModel.generateProgram(profile({ repBand: '8-10', bodyMap: { Core: 'emphasis' } }));
    expect(coreIds(emph).size).toBe(2); // emphasis earns Core a second distinct movement
  });

  it('D · Loop 3 learned volume reshapes the programme — a grown muscle earns MORE exercises', async () => {
    const chestOnly = profile({ repBand: '8-10', bodyMap: { Chest: 'normal' } as never });
    const distinctChest = (p: { days: { slots: { exerciseId: string }[] }[] }) =>
      new Set(p.days.flatMap((d) => d.slots.map((s) => s.exerciseId)).filter((id) => muscleOf(id) === 'Chest')).size;

    const dayOne = await fixtureModel.generateProgram(chestOnly);
    const chest0 = distinctChest(dayOne);

    // Loop 3 has LEARNED a much larger Chest volume over weeks → persist it, then regenerate.
    await db.saveEngineV5({ exercises: {}, volumeByMuscle: { Chest: 14 } });
    const grown = await fixtureModel.generateProgram(chestOnly);
    const chest1 = distinctChest(grown);

    expect(chest1).toBeGreaterThan(chest0); // the earned sets opened new Chest exercises (S-32)
  });

  it('S-71 · a leave-it on a SWAP-ONLY lift still reaches the programme (the assembler pool is not the last word)', async () => {
    // Reachable: she learns a swap to `machine_chest_press` (S-69), the engine later tries to rotate
    // THAT lift away, she swaps back twice → the leave-it anchor is a swap-only id. The assembler's
    // pool excludes swap-only lifts by design (they never generate on their own), so the leave-it
    // cannot LEAD there — `applyLeaveIts` is the door that carries it in, and this pins that door.
    const prefs = await db.loadPreferences();
    await db.savePreferences({ ...prefs, leaveItsByMuscle: { Chest: 'machine_chest_press' } });
    const p = await fixtureModel.generateProgram(profile({ repBand: '8-10', bodyMap: { Chest: 'normal' } as never }));
    expect(p.days.flatMap((d) => d.slots.map((s) => s.exerciseId))).toContain('machine_chest_press');
  });

  it('everything off never crashes — the belt keeps a workout existing (unreachable via validateMap)', async () => {
    const allOff = Object.fromEntries(
      ['Chest', 'Shoulders', 'Back', 'Biceps', 'Triceps', 'Core', 'Quads', 'Hamstrings', 'Glutes', 'Calves'].map((m) => [m, 'off' as const]),
    );
    const p = await fixtureModel.generateProgram(profile({ repBand: '8-10', bodyMap: allOff }));
    expect(p.days.length).toBeGreaterThan(0);
    for (const d of p.days) expect(d.slots.length).toBeGreaterThan(0);
  });
});
