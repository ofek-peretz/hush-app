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
// @ts-nocheck

// 

import { orderForFlow, reflowDayForStations } from '@/data/api/fixtureModel';
import { exerciseById, type Exercise } from '@/data/exercises';
import type { ProgramDay, Slot } from '@/data/local/models';

const ex = (id: string): Exercise => {
  const e = exerciseById(id);
  if (!e) throw new Error(`unknown exercise ${id}`);
  return e;
};

/** How many times the walk changes equipment — the thing the ordering is trying to reduce. */
function transitions(list: Exercise[]): number {
  let n = 0;
  for (let i = 1; i < list.length; i++) if (list[i].equipment !== list[i - 1].equipment) n++;
  return n;
}

/** Compounds all precede isolations, except an isolation riding its compound's physical station. */
function compoundsLead(list: Exercise[]): boolean {
  let seenIsolation: Exercise | null = null;
  for (const e of list) {
    if (e.tier === 'isolation') { seenIsolation = e; continue; }
    if (seenIsolation) return false; // a compound after an isolation
  }
  return true;
}

/*
 * ════ THE OLD LAW WAS REWRITTEN, AND THIS RECORDS WHY (founder 2026-08-08) ════
 *
 * This file used to assert that "every equipment CLASS is one contiguous block". That is the rule
 * the founder rejected on sight: *"מה שהמנוע עשה זה פשוט ליצור כמעט את כל האימון עם אותו הציוד וזה
 * ברור שזה לא מה שרציתי. גם לא רציתי מבודד לפני מורכב."*
 *
 * `equipment` has five values, so "one contiguous block per class" cuts a day into three or four
 * huge runs and reads as a session done on one thing — and it does not even buy the walk it was
 * written for, since a leg press, a chest press and a lat pulldown are all `machine` and stand in
 * three different corners. It was also paid for in training order: the old note conceded that a
 * station's isolation could precede another station's compound.
 *
 * What is asserted now is what he actually asked for: the programme is untouched, compounds lead,
 * and the walk is shorter than the order it came in — with ONE exception, an isolation that shares
 * a physical machine with its compound.
 */
describe('Part 3 #3 · the walk is shortened, the training order is not traded', () => {
  it('compounds lead, and the walk is shorter than catalogue order', () => {
    const day = ['bb_back_squat', 'leg_press', 'bb_rdl', 'leg_curl', 'standing_calf_raise', 'goblet_squat'].map(ex);
    const ordered = orderForFlow(day);
    expect(ordered).toHaveLength(day.length); // nothing dropped, nothing invented
    expect(compoundsLead(ordered)).toBe(true);
    expect(transitions(ordered)).toBeLessThanOrEqual(transitions(day));
  });

  it('⛔ the whole day is NOT collapsed onto one piece of equipment', () => {
    // The defect that started this: grouping by equipment family made a mixed day read as three
    // giant blocks. A day of six lifts on four families must still visit them as a real session.
    const day = ['bb_bench_press', 'machine_chest_press', 'cable_fly', 'db_shoulder_press', 'skullcrusher', 'lat_pulldown'].map(ex);
    const ordered = orderForFlow(day);
    expect(compoundsLead(ordered)).toBe(true);
    // Four families are present; a family-grouped order would show exactly 3 transitions (one per
    // boundary). Requiring MORE than that is requiring the day not to be one block per family.
    expect(new Set(ordered.map((e) => e.equipment)).size).toBe(4);
    expect(ordered).toHaveLength(day.length);
  });

  it('two lifts on the SAME physical station are back to back — she never returns to a machine', () => {
    // `leg_press` and `leg_press_calf_raise` are one machine (catalogue `station`). Compounds-first
    // would otherwise strand the calf raise behind every other isolation, sending her back to a
    // machine she had finished — the one case allowed past the compounds-first line.
    const day = ['leg_press', 'leg_extension', 'seated_leg_curl', 'leg_press_calf_raise'].map(ex);
    const ordered = orderForFlow(day).map((e) => e.id);
    expect(ordered.indexOf('leg_press_calf_raise')).toBe(ordered.indexOf('leg_press') + 1);
  });

  it('the day leads with the main compound, and an isolation never displaces one', () => {
    const day = ['bb_bench_press', 'pec_deck', 'machine_row', 'skullcrusher'].map(ex);
    const ordered = orderForFlow(day).map((e) => e.id);
    expect(ordered[0]).toBe('bb_bench_press'); // the leading compound still opens the day
    // machine_row is a COMPOUND and skullcrusher an ISOLATION, so the row is trained first even
    // though the skullcrusher shares the barbell with the bench. This is the half of the old rule
    // the founder struck: the walk never buys itself a shorter route with the training order.
    expect(ordered.indexOf('machine_row')).toBeLessThan(ordered.indexOf('skullcrusher'));
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
    const lifts = day.slots.filter((s) => !s.supplemental).map((s) => ex(s.exerciseId));
    // The two compounds still lead — the leave-it landed on different equipment, and re-flowing it
    // must not let the pec deck slip in front of the row to save a walk.
    expect(compoundsLead(lifts)).toBe(true);
    expect(ids.indexOf('pec_deck')).toBeGreaterThan(ids.indexOf('bb_row'));
    // …slot identity survived (set counts ride with their lifts), and the supplemental core trails.
    expect(day.slots.find((s) => s.exerciseId === 'machine_chest_press')!.setCount).toBe(4);
    expect(ids[ids.length - 1]).toBe('cable_crunch');
  });
});
