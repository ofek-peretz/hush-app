/**
 * THE STATION LAW (register Part 3 #3): "Enter once, leave it finished."
 *
 * The athlete works one piece of equipment to the end and never leaves and returns to it (founder
 * 2026-07-09 — a taken station on return is the worst experience in a packed gym). The ordering has
 * carried this law since then, but nothing ever PINNED it — the founder asked for the verification
 * (2026-07-21) and the law had no test. Now it does, at all three layers:
 *
 *   1 · every equipment CLASS is one contiguous block (each physical machine is therefore visited
 *       exactly once, since every lift appears once);
 *   2 · two lifts that genuinely share ONE physical station (catalog `station` — the leg press and
 *       its calf raise) are done back to back, or the block's compounds-first order would send her
 *       leg press → leg extension → BACK to the leg press;
 *   3 · an edit made AFTER assembly (`applyLeaveIts` can plant a different-equipment lift mid-block)
 *       is re-flowed, so the law survives substitution too.
 *
 * Free weights are grouped as well — costless, and the barbell genuinely IS a claimed station (a
 * rack/bench); the dumbbell rack being "always available" just means clustering it is free.
 */
import { orderForFlow, reflowDayForStations } from '@/data/api/fixtureModel';
import { exerciseById, type Exercise } from '@/data/exercises';
import type { ProgramDay, Slot } from '@/data/local/models';

const ex = (id: string): Exercise => {
  const e = exerciseById(id);
  if (!e) throw new Error(`unknown exercise ${id}`);
  return e;
};

/** Every equipment class appears as ONE contiguous run — the block law. */
function classesAreContiguous(list: Exercise[]): boolean {
  const seen = new Set<string>();
  let cur: string | null = null;
  for (const e of list) {
    if (e.equipment === cur) continue;
    if (seen.has(e.equipment)) return false; // the class re-appeared after we left it
    seen.add(e.equipment);
    cur = e.equipment;
  }
  return true;
}

describe('Part 3 #3 · one station, fully, before moving on', () => {
  it('every equipment class is one contiguous block, on a realistic mixed day', () => {
    const day = ['bb_back_squat', 'leg_press', 'bb_rdl', 'leg_curl', 'standing_calf_raise', 'goblet_squat'].map(ex);
    const ordered = orderForFlow(day);
    expect(classesAreContiguous(ordered)).toBe(true);
    expect(ordered).toHaveLength(day.length); // nothing dropped, nothing invented
  });

  it('two lifts on the SAME physical station are back to back — she never returns to a machine', () => {
    // Without the station pull, compounds-first puts leg_extension between the leg press and the
    // leg-press calf raise: leave the machine, come back to it. The exact violation the law names.
    const day = ['leg_press', 'leg_extension', 'seated_leg_curl', 'leg_press_calf_raise'].map(ex);
    const ordered = orderForFlow(day).map((e) => e.id);
    expect(ordered.indexOf('leg_press_calf_raise')).toBe(ordered.indexOf('leg_press') + 1);
    expect(classesAreContiguous(orderForFlow(day))).toBe(true);
  });

  it('the day leads with the main compound; free weights cluster like any other station', () => {
    const day = ['bb_bench_press', 'pec_deck', 'machine_row', 'skullcrusher'].map(ex);
    const ordered = orderForFlow(day).map((e) => e.id);
    expect(ordered[0]).toBe('bb_bench_press'); // the earliest compound's station leads
    expect(ordered[1]).toBe('skullcrusher'); // …and the barbell station is finished before moving on
  });

  it('a post-assembly edit (a leave-it on different equipment) is re-flowed — the law survives it', () => {
    // applyLeaveIts swapped the middle machine slot to a BARBELL lift: a barbell lift now sits
    // inside the machine block. Reflow restores contiguity without touching slot identity.
    const slot = (exerciseId: string, setCount = 3, supplemental?: boolean): Slot => ({
      capability: ex(exerciseId).capability,
      exerciseId,
      setCount,
      ...(supplemental ? { supplemental: true } : {}),
    });
    const day: ProgramDay = {
      id: 'd', name: 'Upper A', muscleGroups: ['Chest', 'Back'], isRest: false, key: '0', completed: false,
      slots: [slot('machine_chest_press', 4), slot('bb_row', 4), slot('pec_deck'), slot('cable_crunch', 3, true)],
    };
    reflowDayForStations(day);
    const ids = day.slots.map((s) => s.exerciseId);
    const eqs = day.slots.filter((s) => !s.supplemental).map((s) => ex(s.exerciseId).equipment);
    // The machine block is whole again (the barbell row no longer splits it)…
    expect(eqs.indexOf('machine')).toBeLessThan(eqs.lastIndexOf('machine'));
    expect(eqs.slice(eqs.indexOf('machine'), eqs.lastIndexOf('machine') + 1).every((e) => e === 'machine')).toBe(true);
    // …slot identity survived (set counts ride with their lifts), and the supplemental core trails.
    expect(day.slots.find((s) => s.exerciseId === 'machine_chest_press')!.setCount).toBe(4);
    expect(ids[ids.length - 1]).toBe('cable_crunch');
  });
});
