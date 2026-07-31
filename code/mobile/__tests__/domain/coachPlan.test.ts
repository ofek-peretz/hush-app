import {
  parseCoachPlan,
  COACH_PLAN_VERSION,
  COACH_PLAN_SCHEMA,
  type UnreadableReason,
} from '@/domain/coachPlan';
import { coachFacts } from '@/domain/coachFacts';
import { STARTING_INCREMENT } from '@/engine/v5/constants';
import type { Profile, Program, Session, SetLog } from '@/data/local/models';

/**
 * The parse has exactly one job and one non-job.
 *
 *   JOB:     turn a received answer into something the app can write on the programme, or say that
 *            no answer was received.
 *   NON-JOB: judging the answer. A plan this file dislikes is still executed. There is one decider
 *            and it is not this file.
 *
 * So the tests below never assert "a bad plan is rejected" — they assert that a plan the ENGINE
 * would once have overruled goes straight through.
 */

const profile: Profile = {
  sex: 'female', weightKg: 62, units: 'kg', goal: 'hypertrophy',
  daysPerWeek: 4, repBand: '8-12', healthConnected: false,
};

function set(exerciseId: string, i: number, w: number, r: number): SetLog {
  return {
    exerciseId, setIndex: i, recommendedWeight: w, recommendedReps: 8,
    actualWeight: w, actualReps: r, edited: false, restBeforeS: 120,
    persistedAt: new Date(Date.UTC(2026, 6, 26, 17, i * 4)).toISOString(),
  };
}

const history: Session[] = [{
  id: 's1', programDayId: 'd1', programDayName: 'Upper A',
  startedAt: '2026-07-26T17:00:00.000Z', state: 'completed', earlyFinish: false, trained: true,
  sets: [set('bb_bench_press', 0, 30, 12), set('bb_bench_press', 1, 30, 10)],
}];

const program: Program = { id: 'p', frequency: 4, days: [] };
const facts = coachFacts({ profile, program, history, justFinished: history[0] });

const lift = (over: Record<string, unknown> = {}) => ({
  ex: 'bb_bench_press', sets: 4, band: [8, 12], load: 32.5, restS: 120, ...over,
});
const plan = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ v: COACH_PLAN_VERSION, days: [{ name: 'Upper A', lifts: [lift()] }], ...over });

function unreadable(raw: unknown): UnreadableReason {
  const r = parseCoachPlan(raw, facts);
  if (r.ok) throw new Error('expected the response to be unreadable, but it parsed');
  return r.reason;
}

describe('coach plan — reading the answer', () => {
  it('reads a well-formed plan and changes nothing about it', () => {
    const r = parseCoachPlan(plan(), facts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.days).toEqual([
      { name: 'Upper A', lifts: [{ ex: 'bb_bench_press', sets: 4, band: [8, 12], load: 32.5, restS: 120 }] },
    ]);
    expect(r.snapped).toBe(0); // the coach used the grain it was given; the typist did nothing
  });

  it('executes a decision the engine would once have overruled — there is one decider', () => {
    // Every one of these was a rule the old engine enforced: SETS_MIN was 3, Loop 3 owned volume,
    // and a load could only move by one rung. All of it goes through now, unchanged.
    const bold = JSON.stringify({
      v: COACH_PLAN_VERSION,
      days: [{ name: 'Upper A', lifts: [
        { ex: 'bb_bench_press', sets: 1, band: [3, 5], load: 60, restS: 300 },
        { ex: 'bb_row', sets: 9, band: [20, 30], load: 20, restS: 30 },
      ] }],
    });
    const r = parseCoachPlan(bold, facts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.days[0].lifts.map((l) => [l.sets, l.band, l.load])).toEqual([
      [1, [3, 5], 60],
      [9, [20, 30], 20],
    ]);
  });

  it('keeps the notes it can read and never loses a decision over prose', () => {
    const withNotes = plan({
      notes: [
        { ex: 'bb_bench_press', say: 'You cleared 12 at 30, so we go up.' },
        { say: 'No exercise attached, still a sentence.' },
        { ex: 'bb_row' }, // no `say` — a lost sentence
        'not even an object',
      ],
    });
    const r = parseCoachPlan(withNotes, facts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.notes).toEqual([
      { ex: 'bb_bench_press', say: 'You cleared 12 at 30, so we go up.' },
      { say: 'No exercise attached, still a sentence.' },
    ]);
    expect(r.plan.days.length).toBe(1); // the decision survived the broken note
  });

  describe('the typist — a weight that does not exist is not printed', () => {
    it('lands a machine load on a real pin', () => {
      const r = parseCoachPlan(
        JSON.stringify({ v: COACH_PLAN_VERSION, days: [{ name: 'D', lifts: [
          { ex: 'machine_chest_press', sets: 4, band: [8, 12], load: 32.4, restS: 120 },
        ] }] }),
        facts,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const load = r.plan.days[0].lifts[0].load!;
      expect(Math.abs(load % STARTING_INCREMENT.machine)).toBeLessThan(1e-9);
      expect(r.snapped).toBe(1); // counted, so we can see how often a model needs the typist
    });

    it('never puts a barbell under the bar', () => {
      const r = parseCoachPlan(
        JSON.stringify({ v: COACH_PLAN_VERSION, days: [{ name: 'D', lifts: [
          { ex: 'bb_bench_press', sets: 3, band: [8, 12], load: 4, restS: 120 },
        ] }] }),
        facts,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.plan.days[0].lifts[0].load).toBe(20);
    });

    it('leaves a bodyweight lift with no number at all', () => {
      const r = parseCoachPlan(
        JSON.stringify({ v: COACH_PLAN_VERSION, days: [{ name: 'D', lifts: [
          { ex: 'pull_up', sets: 3, band: [5, 8], load: null, restS: 120 },
        ] }] }),
        facts,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.plan.days[0].lifts[0].load).toBeNull();
      expect(r.snapped).toBe(0);
    });
  });

  describe('no answer arrived — the update waits, nothing is written', () => {
    it('names why, in a value that can be counted per model', () => {
      expect(unreadable('{"v":1,"days":[')).toBe('not_json');           // the connection dropped
      expect(unreadable('[]')).toBe('not_an_object');
      expect(unreadable(JSON.stringify({ v: 99, days: [] }))).toBe('wrong_version');
      expect(unreadable(JSON.stringify({ v: COACH_PLAN_VERSION, days: [] }))).toBe('no_days');
      expect(unreadable(JSON.stringify({ v: COACH_PLAN_VERSION, days: [{ name: 'D', lifts: [] }] })))
        .toBe('no_lifts');
      expect(unreadable(plan({ days: [{ name: 'D', lifts: [lift({ ex: 'no_such_lift' })] }] })))
        .toBe('unknown_exercise');
      expect(unreadable(plan({ days: [{ name: 'D', lifts: [lift({ sets: 'four' })] }] })))
        .toBe('not_a_number');
      expect(unreadable(plan({ days: [{ name: 'D', lifts: [lift({ band: [8] })] }] })))
        .toBe('not_a_number');
      expect(unreadable(plan({ days: [{ name: 'D', lifts: [lift({ load: 'heavy' })] }] })))
        .toBe('not_a_number');
    });

    it('refuses to guess which lift a near-miss id meant', () => {
      // 'bb_bench' is one character from a real id. Guessing is how an athlete is handed the wrong
      // movement at a weight chosen for a different one.
      const r = parseCoachPlan(plan({ days: [{ name: 'D', lifts: [lift({ ex: 'bb_bench' })] }] }), facts);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect({ reason: r.reason, at: r.at }).toEqual({ reason: 'unknown_exercise', at: 'bb_bench' });
    });

    it('reads a plan with no facts to hand, just more coarsely', () => {
      const r = parseCoachPlan(plan()); // no sheet — her learned ladder is unavailable
      expect(r.ok).toBe(true);
    });
  });

  describe('the schema is what makes a small model succeed', () => {
    it('closes every object, so an invented field is a schema violation and not a surprise', () => {
      const closed: string[] = [];
      const open: string[] = [];
      const walk = (node: unknown, path: string) => {
        if (node == null || typeof node !== 'object') return;
        const n = node as Record<string, unknown>;
        if (n.type === 'object') (n.additionalProperties === false ? closed : open).push(path);
        for (const key of Object.keys(n)) walk(n[key], `${path}.${key}`);
      };
      walk(COACH_PLAN_SCHEMA, '$');
      expect(open).toEqual([]);
      expect(closed.length).toBeGreaterThan(3);
    });

    it('requires every field the parse requires — the model is told, not tested', () => {
      const liftSchema = COACH_PLAN_SCHEMA.properties.days.items.properties.lifts.items;
      expect([...liftSchema.required].sort()).toEqual(['band', 'ex', 'load', 'restS', 'sets']);
      // A plan missing any required field must be unreadable, or the schema is claiming a
      // constraint the code does not hold.
      for (const field of liftSchema.required) {
        const partial: Record<string, unknown> = lift();
        delete partial[field];
        const r = parseCoachPlan(
          JSON.stringify({ v: COACH_PLAN_VERSION, days: [{ name: 'D', lifts: [partial] }] }),
          facts,
        );
        expect({ field, ok: r.ok }).toEqual({ field, ok: false });
      }
    });

    it('does not enumerate the catalogue — it is already in the prompt once', () => {
      const json = JSON.stringify(COACH_PLAN_SCHEMA);
      expect(json).not.toContain('bb_bench_press');
      // Small enough to sit beside the sheet on every call without being noticed.
      expect(Math.round(json.length / 3.5)).toBeLessThan(400);
    });
  });
});
