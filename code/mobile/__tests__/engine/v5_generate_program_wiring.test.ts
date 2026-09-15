/**
 * Engine v5 · Revision 7 — generateProgram is map-driven for the v5 cohort (end-to-end wiring).
 *
 * The pure assembler (v5_program_assembly) is unit-tested; this drives the whole generateProgram
 * pipeline (assembleV5DayLists → dayFromBlueprint → core + time cap) for a profile with a declared
 * band + body map, proving the body map actually shapes the real programme — and that a legacy
 * profile (no band) still gets the split, unchanged.
 */
// @ts-nocheck

// 

import { fixtureModel } from '@/data/api/fixtureModel';
import { muscleOf } from '@/data/exercises';
import { db } from '@/data/local/db';
import type { Profile } from '@/data/local/models';

const profile = (over: Partial<Profile>): Profile => ({
  units: 'kg', daysPerWeek: 4, healthConnected: false, ...over,
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
    // 14 used to be "much larger" than the flat B-2 base of 10. Since B-2 became frequency-aware
    // (2026-08-08) day one already targets 5 × days, so 14 is SMALLER than the day-one shape at 3+
    // days and this test was asserting growth against a shrink. The number has to clear day one for
    // the assertion below to mean what its comment says.
    await db.saveEngineV5({ exercises: {}, volumeByMuscle: { Chest: 34 } });
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

  it('⛔ everything off yields NO workout (S-3) — the belt used to invent one, and that was the bug', async () => {
    /*
     * ⛔ THIS TEST PINNED THE DEFECT, AND IT IS REWRITTEN RATHER THAN DELETED (2026-08-12).
     *
     * It read: *"everything off never crashes — the belt keeps a workout existing (unreachable via
     * validateMap)"*, and it passed for as long as it existed. Both of its premises were wrong.
     *
     *   · NOT UNREACHABLE. `validateMap` guards ONBOARDING. The profile's body-map editor never
     *     learned the rule, so an athlete could switch off all ten muscles there and press save.
     *   · AND "A WORKOUT EXISTING" WAS THE WRONG THING TO WANT. The belt re-ran the assembler with
     *     NO body map, so she was handed three full-body days of seven lifts — every muscle she had
     *     just switched off, trained. S-2 says an off muscle never appears; S-3 says everything off
     *     yields no workout. The belt broke both to avoid an empty array.
     *
     * ⛔ FOUNDER, 2026-08-12: *"אם יש לנו משתמש שלא רוצה לאמן רגליים בכלל, יש לנו אפשרות כזאת?"* —
     * asking about a whole region, which works. The extreme is what this covers.
     *
     * The rule is what the register always said, and the guard on the editor is what makes sure she
     * never sees it. See `theMapSheDrewIsTheWeekSheGets` for both halves.
     */
    const allOff = Object.fromEntries(
      ['Chest', 'Shoulders', 'Back', 'Biceps', 'Triceps', 'Core', 'Quads', 'Hamstrings', 'Glutes', 'Calves'].map((m) => [m, 'off' as const]),
    );
    const p = await fixtureModel.generateProgram(profile({ repBand: '8-10', bodyMap: allOff }));
    expect(p.days.filter((d) => !d.isRest)).toEqual([]);
    // …and it still does not CRASH, which is the half of the original claim that was worth keeping.
    expect(p.frequency).toBeGreaterThan(0);
  });

  it('…but a map with something still ON always builds — the belt was scoped, not deleted', async () => {
    // The belt exists for an assembler defect, not for a decision of hers. That case still catches.
    const p = await fixtureModel.generateProgram(profile({ repBand: '8-10', bodyMap: { Quads: 'off' } as never }));
    expect(p.days.filter((d) => !d.isRest).length).toBeGreaterThan(0);
  });
});
