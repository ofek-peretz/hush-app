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
    // Engine-managed slots carry a durable engine slot id (progression keying).
    expect(p.days.some((d) => d.slots.some((s) => s.engineSlotId != null))).toBe(true);
  });

  it('emphasis is honoured end-to-end — an emphasised muscle is trained', async () => {
    const p = await fixtureModel.generateProgram(profile({
      repBand: '8-10', daysPerWeek: 3,
      bodyMap: { Chest: 'emphasis' },
    }));
    expect(p.days.length).toBe(3);
    expect(musclesIn(p).has('Chest' as never)).toBe(true); // S-63: emphasis guaranteed ≥1 exercise
  });

  it('a legacy profile (no declared band) still gets the split, unchanged', async () => {
    const p = await fixtureModel.generateProgram(profile({ sex: 'male' }));
    expect(p.days.length).toBe(4);
    // The split trains legs (Push/Pull/Legs/Upper) — the demographic path is untouched.
    for (const d of p.days) expect(d.slots.length).toBeGreaterThan(0);
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
