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
  sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false,
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
    const facts = coachFacts({ profile, program, history: [] });
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
    expect(offered.length).toBe(EXERCISES.length + MOVEMENTS.length);
  });

  it('shows the movements at all — the coach cannot prescribe what it was not told exists', () => {
    // The failure this guards is silent and total: leave `movements` out of the sheet and every
    // cardio plan comes back with an unresolvable id, which reads as the model hallucinating when
    // in fact it was never given the list.
    const facts = coachFacts({ profile, program, history: [] });
    expect(facts.movements.length).toBe(MOVEMENTS.length);
    expect(facts.movements.some((m) => m.gps)).toBe(true); // a run is in there
    expect(facts.movements.some((m) => m.loadable)).toBe(true); // and something she can carry
  });

  it('keeps both lists lean enough to sit in the cached half of every call', () => {
    const tok = (o: unknown) => Math.round(JSON.stringify(o).length / 3.5);
    // Measured at 68 lifts + the movements. The bound guards GROWTH: this block is byte-identical
    // for every athlete and read on every call, so a field added here is paid for ever. Growing the
    // catalogue itself is cheap and expected (~45 tokens a lift) — growing the SHAPE is not.
    expect(tok(coachCatalogue()) + tok(coachMovements())).toBeLessThan(4200);
  });
});
