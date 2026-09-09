// @ts-nocheck
// 
import { EXERCISES } from '@/data/exercises';
import { MOVEMENTS } from '@/data/movements';
import { coachFacts, coachCatalogue, coachMovements } from '@/domain/coachFacts';
import { parseCoachPlan, COACH_PLAN_VERSION } from '@/domain/coachPlan';
import type { Profile, Program } from '@/data/local/models';

/**
 * ════ EVERY PRESCRIBABLE THING HAS EXACTLY ONE ID ════
 *
 * The coach can prescribe from two lists — 68 LIFTS (`data/exercises`) and the things that are not
 * lifts (`data/movements`). Two lists is the right shape: a run has no capability class and no
 * muscle worth naming, and dressing it as a lift would let the swap pool offer it as a substitute
 * for a squat. But two lists share one namespace, and that is where this can go wrong quietly.
 *
 * `parseCoachPlan` resolves an id against lifts FIRST. If both lists ever held `row`, a plan that
 * said "row 2000 m" would silently resolve to the barbell row — a lift, with a load, prescribed for
 * a distance. Nothing would throw. The athlete would just get the wrong thing.
 *
 * So: the two namespaces may never overlap, and every id the coach is shown must be one the parse
 * can actually resolve. The second half matters as much as the first — a catalogue entry the parse
 * rejects is a lift the coach can see and never use, which reads to the model as its own mistake.
 */

const profile: Profile = {
  sex: 'female', weightKg: 62, units: 'kg', daysPerWeek: 4, healthConnected: false,
};
const program: Program = { id: 'p', frequency: 4, days: [] };

describe('every prescribable thing has exactly one id', () => {
  it('never lets a movement id collide with a lift id', () => {
    const lifts = new Set(EXERCISES.map((e) => e.id));
    const collisions = MOVEMENTS.filter((m) => lifts.has(m.id)).map((m) => m.id);
    expect(collisions).toEqual([]);
  });

  it('has no duplicate inside either list', () => {
    for (const [label, ids] of [
      ['exercises', EXERCISES.map((e) => e.id)],
      ['movements', MOVEMENTS.map((m) => m.id)],
    ] as const) {
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect({ label, dupes }).toEqual({ label, dupes: [] });
    }
  });

  it('can prescribe EVERY id the sheet shows — nothing on offer is unusable', () => {
    const facts = coachFacts({ profile, plan: null, history: [] });
    const offered = [
      ...facts.catalogue.map((c) => ({ id: c.id, kind: 'reps' as const })),
      // A movement is offered for the shapes `measures` names; `reps` stands in for the rest since
      // the parse does not read `measures` — it is a hint to the coach, never a rule.
      ...facts.movements.map((m) => ({ id: m.id, kind: 'reps' as const })),
    ];
    const rejected: string[] = [];
    for (const { id, kind } of offered) {
      const r = parseCoachPlan(
        JSON.stringify({
          say: 'x',
          sessions: [{ name: 'D', blocks: [{ rounds: 1, items: [{ kind, ex: id, reps: [8, 12], load: null }] }] }],
        }),
        facts,
      );
      if (!r.ok) rejected.push(`${id} → ${r.reason}`);
    }
    expect(rejected).toEqual([]);
    expect(offered.length).toBe(EXERCISES.length + coachMovements().length);
  });

  it('shows the movements at all — the coach cannot prescribe what it was not told exists', () => {
    // The failure this guards is silent and total: leave `movements` out of the sheet and every
    // cardio plan comes back with an unresolvable id, which reads as the model hallucinating when
    // in fact it was never given the list.
    const facts = coachFacts({ profile, plan: null, history: [] });
    expect(facts.movements.length).toBe(coachMovements().length);
    // ⛔ `gps` → `tracked` (2026-08-12): the coach is told HOW a movement is measured, and there are
    // three answers now — the satellite, the phone's own motion, or nothing.
    expect(facts.movements.some((m) => m.tracked === 'gps')).toBe(true); // a run outdoors
    expect(facts.movements.some((m) => m.tracked === 'motion')).toBe(true); // …and one on a belt
    expect(facts.movements.some((m) => m.loadable)).toBe(true); // and something she can carry
  });

  it('⛔ the cardio machines are FILTERED from the offer, not deleted from the catalogue', () => {
    /*
     * FOUNDER SCOPE CALL, 2026-08-03: *"for the cardio, at the start it is enough to do just walking
     * / running, and not deal with all the other things we added."*
     *
     * Each of them measures differently, records differently, and is a screen we have not designed —
     * offering the coach a vocabulary the app cannot execute is how it prescribes a 2 km row onto a
     * stage with no way to log it.
     *
     * ⚠️ AND THE DISTINCTION IS THE POINT. Deleting them from `MOVEMENTS` would break the display of
     * every session an athlete has ALREADY recorded against one; history is not a catalogue we get
     * to edit. So they stay resolvable and stop being offered — widening it later is one line.
     */
    const offeredIds = new Set(coachMovements().map((m) => m.id));
    const catalogueIds = new Set(MOVEMENTS.map((m) => m.id));
    for (const gone of ['row_erg', 'cycle_stationary', 'elliptical', 'stair_climber', 'swim', 'jump_rope', 'cycle_outdoor']) {
      expect({ id: gone, offered: offeredIds.has(gone), resolvable: catalogueIds.has(gone) })
        .toEqual({ id: gone, offered: false, resolvable: true });
    }
    // …and what a first release DOES do is still there.
    for (const kept of ['run_outdoor', 'run_treadmill', 'walk_outdoor']) {
      expect({ id: kept, offered: offeredIds.has(kept) }).toEqual({ id: kept, offered: true });
    }
  });

  it('keeps both lists lean enough to sit in the cached half of every call', () => {
    /*
     * ⚠️ THE BUDGET IS PER ENTRY, NOT PER LIST — founder, 2026-08-01: *"keep the ceiling we talked
     * about (~159 bytes per exercise in the cached prefix)"*.
     *
     * It used to be one number for the whole block (4,200 tokens, measured at 68 lifts), and that
     * number cannot tell the two kinds of growth apart. Adding a LIFT is the point of the catalogue
     * and costs one entry; adding a FIELD is paid on every entry, on every call, for every athlete,
     * for ever. A total that fails on the 69th lift would have stopped the cheap kind and said
     * nothing about the expensive one.
     *
     * Measured at 116 lifts: 161.8 bytes each, which is the same shape the 68 were — `id`, `name`,
     * `muscle`, `capability`, `pattern`, `equipment`, `tier`. The slack is for names, not fields.
     */
    const per = (o: unknown[], n: number) => JSON.stringify(o).length / n;
    expect(per(coachCatalogue(), EXERCISES.length)).toBeLessThan(170);
    expect(per(coachMovements(), MOVEMENTS.length)).toBeLessThan(80);
  });
});
