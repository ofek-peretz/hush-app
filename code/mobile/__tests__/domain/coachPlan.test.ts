// @ts-nocheck
// 
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
 *   JOB:     turn a received answer into something the app can run, or say no answer was received.
 *   NON-JOB: judging the answer. A plan this file dislikes is executed. One decider, not this file.
 *
 * But the FIRST question is not about the parse at all. It is whether the vocabulary can carry what
 * a coach would actually say — and version 1 of this schema could not express a single line of a
 * marathon plan. So the suite opens by writing the real plans out, in full, and reading them back.
 * A schema is not proved by its edge cases; it is proved by the ordinary thing it exists to say.
 */

const profile: Profile = {
  sex: 'female', weightKg: 62, units: 'kg',
  daysPerWeek: 4, repBand: '8-10', healthConnected: false,
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
  startedAt: '2026-07-26T17:00:00.000Z', state: 'SAVED', earlyFinish: false, trained: true,
  sets: [set('bb_bench_press', 0, 30, 12), set('bb_bench_press', 1, 30, 10)],
}];

const program: Program = { id: 'p', frequency: 4, days: [] };
const facts = coachFacts({ profile, plan: null, history, justFinished: history[0] });

// Every reply says something — see `CoachAnswer`. These fixtures are about the PROGRAMME, so the
// sentence is a constant here; the turns that only speak are their own describe block below.
const wrap = (sessions: unknown) =>
  JSON.stringify({ say: 'Here is your week.', sessions });

function read(raw: unknown) {
  const r = parseCoachPlan(raw, facts);
  if (!r.ok) throw new Error(`expected a readable plan, got ${r.reason}${r.at ? ` at ${r.at}` : ''}`);
  if (!r.answer.plan) throw new Error('expected a programme, got words only');
  return { ...r, plan: r.answer.plan, say: r.answer.say };
}

function unreadable(raw: unknown): UnreadableReason {
  const r = parseCoachPlan(raw, facts);
  if (r.ok) throw new Error('expected the response to be unreadable, but it parsed');
  return r.reason;
}

describe('the vocabulary carries what a coach would actually say', () => {
  it('writes a marathon week — the plan version 1 could not express at all', () => {
    // Every line here was impossible before: no load, no sets, no reps, and the day of the week
    // matters because the whole week is built around the long run.
    const plan = read(wrap([
      { name: 'Easy 5k', day: 'tue', blocks: [
        { rounds: 1, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 5000,
          say: 'At a pace where you could hold a conversation.' }] },
      ] },
      { name: 'Intervals', day: 'thu', blocks: [
        { rounds: 1, items: [{ kind: 'time', ex: 'warm_up', seconds: 600 }] },
        { rounds: 6, restS: 90, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 400,
          say: 'Hard, but the sixth should look like the first.' }] },
        { rounds: 1, items: [{ kind: 'time', ex: 'cool_down', seconds: 600 }] },
      ] },
      { name: 'Long run', day: 'sun', blocks: [
        { rounds: 1, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 18000,
          say: 'Slower than feels right. This one is about time on your feet.' }] },
      ] },
    ])).plan;

    expect(plan.sessions.map((s) => [s.day, s.name])).toEqual([
      ['tue', 'Easy 5k'], ['thu', 'Intervals'], ['sun', 'Long run'],
    ]);
    // The interval block: six rounds of one 400, ninety seconds between. Rounds carry it, not a
    // bespoke "interval" shape.
    const intervals = plan.sessions[1].blocks[1];
    expect({ rounds: intervals.rounds, restS: intervals.restS }).toEqual({ rounds: 6, restS: 90 });
    // The instruction survived — this is the thing the app could never carry.
    const long = plan.sessions[2].blocks[0].items[0];
    expect(long.say).toContain('time on your feet');
  });

  it('writes an ordinary hypertrophy day, where a SET is just a round', () => {
    const plan = read(wrap([
      { name: 'Upper A', blocks: [
        { rounds: 4, restS: 120, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 32.5,
          say: 'Last one to a rep short of failure; stop the others two short.' }] },
        { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'bb_row', reps: [8, 12], load: 40 }] },
        { rounds: 3, restS: 45, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
      ] },
    ])).plan;

    const [bench, row, plank] = plan.sessions[0].blocks;
    expect(bench.rounds).toBe(4); // "4 sets" — no `sets` field exists anywhere
    expect(bench.items[0]).toMatchObject({ kind: 'reps', reps: [8, 12], load: 32.5 });
    expect(row.rounds).toBe(3);
    expect(plank.items[0]).toMatchObject({ kind: 'time', seconds: 45 });
    // A day with no `day` is a day the athlete slots wherever she likes — a gym week does not care.
    expect(plan.sessions[0].day).toBeUndefined();
  });

  it('writes a circuit — three exercises, three times through, one block', () => {
    const plan = read(wrap([
      { name: 'Conditioning', blocks: [
        { rounds: 3, restS: 120, items: [
          { kind: 'reps', ex: 'goblet_squat', reps: [12, 12], load: 16 },
          { kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24 },
          { kind: 'time', ex: 'jump_rope', seconds: 60 },
        ] },
      ] },
    ])).plan;
    const circuit = plan.sessions[0].blocks[0];
    expect(circuit.rounds).toBe(3);
    expect(circuit.items.map((i) => i.kind)).toEqual(['reps', 'distance', 'time']);
    // `[12, 12]` is a fixed count, not a band — one shape covers both.
    expect(circuit.items[0]).toMatchObject({ reps: [12, 12] });
  });

  it('writes a footballer\'s session — sprints, jumps and lifts in one place', () => {
    const plan = read(wrap([
      { name: 'Speed + lower', day: 'wed', blocks: [
        { rounds: 1, items: [{ kind: 'time', ex: 'plank', seconds: 45, say: 'Whatever your hips need today.' }] },
        { rounds: 6, restS: 180, items: [{ kind: 'distance', ex: 'sprint', metres: 30,
          say: 'Full effort. If the sixth is slower than the first, stop at five.' }] },
        { rounds: 4, restS: 120, items: [{ kind: 'reps', ex: 'box_jump', reps: [3, 3], load: null }] },
        { rounds: 3, restS: 150, items: [{ kind: 'reps', ex: 'bb_back_squat', reps: [5, 5], load: 60 }] },
      ] },
    ])).plan;
    // ⛔ `time` where `open` used to be: the open item is deleted, and a footballer's session still
    // needs a shape that is neither a lift nor a distance. A hold is that shape.
    expect(plan.sessions[0].blocks.map((b) => b.items[0].kind)).toEqual(['time', 'distance', 'reps', 'reps']);
    // An `open` item carries no number at all, and that is a complete instruction.
    expect(plan.sessions[0].blocks[0].items[0]).toEqual({
      kind: 'time', ex: 'plank', seconds: 45, say: 'Whatever your hips need today.',
    });
  });

  it('executes a decision the engine would once have overruled — there is one decider', () => {
    // Every one of these was a rule the old engine enforced: SETS_MIN was 3, Loop 3 owned volume,
    // a load could only move by one rung. All of it goes through now, unchanged.
    const plan = read(wrap([
      { name: 'Whatever the coach decided', blocks: [
        { rounds: 1, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [3, 5], load: 60 }] },
        { rounds: 9, restS: 30, items: [{ kind: 'reps', ex: 'bb_row', reps: [20, 30], load: 20 }] },
      ] },
    ])).plan;
    expect(plan.sessions[0].blocks.map((b) => [b.rounds, b.items[0]])).toEqual([
      [1, { kind: 'reps', ex: 'bb_bench_press', reps: [3, 5], load: 60 }],
      [9, { kind: 'reps', ex: 'bb_row', reps: [20, 30], load: 20 }],
    ]);
  });
});

describe('the typist — a weight that does not exist is not printed', () => {
  const one = (item: unknown) => wrap([{ name: 'D', blocks: [{ rounds: 1, items: [item] }] }]);

  it('lands a machine load on a real pin, and counts that it had to', () => {
    const r = read(one({ kind: 'reps', ex: 'machine_chest_press', reps: [8, 12], load: 32.4 }));
    const item = r.plan.sessions[0].blocks[0].items[0] as { load: number };
    expect(Math.abs(item.load % STARTING_INCREMENT.machine)).toBeLessThan(1e-9);
    expect(r.snapped).toBe(1); // a per-model quality signal: how often it ignored the grain it was told
  });

  it('changes nothing when the coach used the grain it was given', () => {
    const r = read(one({ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 32.5 }));
    expect((r.plan.sessions[0].blocks[0].items[0] as { load: number }).load).toBe(32.5);
    expect(r.snapped).toBe(0);
  });

  it('never puts a barbell under the bar', () => {
    const r = read(one({ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 4 }));
    expect((r.plan.sessions[0].blocks[0].items[0] as { load: number }).load).toBe(20);
  });

  it('leaves a MOVEMENT load exactly as written — we do not know what she is carrying', () => {
    const r = read(one({ kind: 'distance', ex: 'farmer_carry', metres: 40, load: 23.5 }));
    expect((r.plan.sessions[0].blocks[0].items[0] as { load: number }).load).toBe(23.5);
    expect(r.snapped).toBe(0); // snapping to a grid we do not have would be inventing one
  });

  it('leaves a bodyweight item with no number at all', () => {
    const r = read(one({ kind: 'reps', ex: 'pull_up', reps: [5, 8], load: null }));
    expect((r.plan.sessions[0].blocks[0].items[0] as { load: number | null }).load).toBeNull();
    expect(r.snapped).toBe(0);
  });
});

describe('no answer arrived — the update waits, nothing is written', () => {
  const item = { kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 30 };
  const one = (over: Record<string, unknown>) =>
    wrap([{ name: 'D', blocks: [{ rounds: 1, items: [{ ...item, ...over }] }] }]);

  it('names why, in a value that can be counted per model', () => {
    expect(unreadable('{"v":2,"sessions":[')).toBe('not_json'); // the connection dropped mid-object
    expect(unreadable('[]')).toBe('not_an_object');
    expect(unreadable(wrap([]))).toBe('no_sessions');
    expect(unreadable(wrap([{ name: 'D', blocks: [] }]))).toBe('no_blocks');
    expect(unreadable(wrap([{ name: 'D', blocks: [{ rounds: 1, items: [] }] }]))).toBe('no_items');
    expect(unreadable(wrap([{ name: 'D', blocks: [{ rounds: 0, items: [item] }] }]))).toBe('not_a_number');
    expect(unreadable(wrap([{ blocks: [{ rounds: 1, items: [item] }] }]))).toBe('session_malformed');
    expect(unreadable(wrap([{ name: 'D', day: 'someday', blocks: [{ rounds: 1, items: [item] }] }])))
      .toBe('session_malformed');
    expect(unreadable(one({ ex: 'no_such_thing' }))).toBe('unknown_exercise');
    expect(unreadable(one({ kind: 'vibes' }))).toBe('unknown_kind');
    /*
     * ⛔ A MALFORMED ITEM IS NO LONGER FATAL — 2026-08-04, found by the first four-week simulation.
     *
     * `required` on an item is `['kind','ex']` and Gemini's schema subset has no `oneOf`, so the
     * model may legally answer `{kind:'time', ex:'warm_up'}` with no `seconds`. **It did** — and the
     * parse threw away a complete, correct four-day programme over one missing warm-up duration.
     * The athlete was told her update was waiting.
     *
     * So these four now PARSE, with the bad item skipped and counted in `snapped`. A dropped warm-up
     * is a smaller harm than a dropped week by an enormous margin, and the alternative was measured
     * at 1 lost reply in 17.
     *
     * ⚠️ THE SHAPE ERRORS ABOVE ARE STILL FATAL, and the line between them is deliberate: a bad
     * `rounds`, a nameless session or an unknown lift are errors about the PROGRAMME's structure —
     * there is no coherent thing left to run. A bad item is one row of it.
     */
    const good = { kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 40 };
    /** A real week: several good items, one broken — the case the simulation actually produced. */
    const withOneBad = (bad: Record<string, unknown>) => wrap([{
      name: 'D',
      blocks: [{ rounds: 3, items: [good, good, good, { kind: 'reps', ex: 'db_row', ...bad }] }],
    }]);
    const survives = (bad: Record<string, unknown>) => {
      const r = parseCoachPlan(withOneBad(bad), facts);
      expect(r.ok).toBe(true);
      return r.ok ? r.snapped : 0;
    };
    expect(survives({ reps: [8] })).toBeGreaterThan(0);
    expect(survives({ load: 'heavy' })).toBeGreaterThan(0);
    expect(survives({ kind: 'time', seconds: 'a while' })).toBeGreaterThan(0);
    expect(survives({ kind: 'distance', metres: null })).toBeGreaterThan(0);
  });

  it('⛔ but a reply that loses MORE than it keeps is refused entirely', () => {
    /*
     * ⚠️ THE FOUR-WEEK SIMULATION CAUGHT THIS, and it caught it in the version of the fix ABOVE.
     * Skipping malformed items without a floor turned a full four-day week into a ONE-PLANK
     * programme, silently, and the run carried on training against it.
     *
     * That is strictly worse than the bug the skipping was added to fix. A discarded reply is
     * VISIBLE — she is told her update is waiting, keeps the good programme she has, and the
     * foreground retry asks again. A mutilated one is invisible and permanent.
     */
    const bad = { kind: 'reps', ex: 'db_row', reps: [8] };
    const mostlyRubble = wrap([{ name: 'D', blocks: [{ rounds: 3, items: [bad, bad, bad, { kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 40 }] }] }]);
    expect(unreadable(mostlyRubble)).toBe('not_a_number');
  });

  it('⛔ and a session that loses a whole block is refused, however small the loss looks', () => {
    // The coach never writes a block it means to be empty. One emptied block is enough of a signal
    // on its own — it is how the one-plank week began.
    const emptied = wrap([{
      name: 'D',
      blocks: [
        { rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 40 }] },
        { rounds: 3, items: [{ kind: 'time', ex: 'plank' }] },
      ],
    }]);
    expect(unreadable(emptied)).toBe('not_a_number');
  });

  it('refuses to guess which lift a near-miss id meant', () => {
    // 'bb_bench' is one character from a real id. Guessing is how an athlete is handed the wrong
    // movement at a weight chosen for a different one.
    const r = parseCoachPlan(one({ ex: 'bb_bench' }), facts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect({ reason: r.reason, at: r.at }).toEqual({ reason: 'unknown_exercise', at: 'bb_bench' });
  });

  it('keeps every note it can read, and never loses a decision over prose', () => {
    const raw = JSON.stringify({
      say: 'One change this week.',
      sessions: [{ name: 'D', blocks: [{ rounds: 1, items: [item] }] }],
      notes: [
        { ex: 'bb_bench_press', say: 'You cleared 12 at 30, so we go up.' },
        { say: 'No exercise attached, still a sentence.' },
        { ex: 'bb_row' },        // no `say` — a lost sentence
        'not even an object',
      ],
    });
    const r = read(raw);
    expect(r.plan.notes).toEqual([
      { ex: 'bb_bench_press', say: 'You cleared 12 at 30, so we go up.' },
      { say: 'No exercise attached, still a sentence.' },
    ]);
    expect(r.plan.sessions.length).toBe(1); // the decision survived the broken note
  });

  it('reads a plan with no facts to hand, just more coarsely', () => {
    expect(parseCoachPlan(one({}))?.ok).toBe(true);
  });
});

describe('the schema is what makes a small model succeed', () => {
  it('closes every object, so an invented field is a violation and not a surprise', () => {
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

  it('names every shape the parse accepts, and no shape it does not', () => {
    const kinds = COACH_PLAN_SCHEMA.properties.sessions.items.properties.blocks.items
      .properties.items.items.properties.kind.enum;
    // ⛔ `open` DELETED 2026-08-12 — see the note on `PlannedItem`.
    expect([...kinds].sort()).toEqual(['distance', 'reps', 'time']);
    // And a kind outside that list must be unreadable, or the schema claims a constraint the code
    // does not hold.
    expect(unreadable(wrap([{ name: 'D', blocks: [{ rounds: 1, items: [{ kind: 'tempo', ex: 'plank' }] }] }])))
      .toBe('unknown_kind');
  });

  it('does not enumerate the catalogue — it is already in the prompt once', () => {
    const json = JSON.stringify(COACH_PLAN_SCHEMA);
    expect(json).not.toContain('bb_bench_press');
    expect(json).not.toContain('run_outdoor');
    /*
     * Small enough to sit beside the sheet on every call without being noticed.
     *
     * ⚠️ RAISED 500 → 600 WHEN `today` LANDED, and raising a budget is normally the wrong move, so
     * here is why this one is not: what this test guards is the schema not becoming a SECOND COPY
     * of the catalogue — the two assertions above are the check, and they are exact. This number is
     * the smell test underneath them, and it moved because a real field arrived (six verbs, four
     * properties) rather than because prose crept in.
     *
     * ⛔ And the schema stopped being printed in the preamble on the same day, so the request got
     * 1,841 characters SHORTER while this grew by 90. Read the two together before touching either.
     */
    expect(Math.round(json.length / 3.5)).toBeLessThan(600);
  });
});

describe('a turn speaks, and only some turns decide', () => {
  /*
   * The gap this closes: for one build the schema REQUIRED `sessions`, which made every possible
   * turn one of two broken things. Ask "why did my bench go down?" and the coach had to emit a whole
   * programme to answer a question. Drop the schema so it could answer in prose, and the intake
   * conversation could never build the programme it was told to build. Neither is a coach.
   */

  it('reads a reply with no programme as an ANSWER, not as a failure', () => {
    const r = parseCoachPlan(
      JSON.stringify({ say: 'It went down because your last two sets stopped at 8.' }),
      facts,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answer.plan).toBeNull();
    expect(r.answer.say).toBe('It went down because your last two sets stopped at 8.');
  });

  it('carries the sentence alongside the programme when a turn does both', () => {
    // The intake's last turn is exactly this: words that say it is ready, and the programme with them.
    const r = read(wrap([{ name: 'Upper A', blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 30 }] }] }]));
    expect(r.say).toBe('Here is your week.');
    expect(r.plan.sessions.length).toBe(1);
  });

  it('refuses a programme that arrives with nothing said', () => {
    // A plan with no sentence attached is the thing this app exists to not be — see the WHY law.
    expect(unreadable(JSON.stringify({
      v: COACH_PLAN_VERSION,
      sessions: [{ name: 'D', blocks: [{ rounds: 1, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] }] }],
    }))).toBe('nothing_said');
    expect(unreadable(JSON.stringify({ say: '   ' }))).toBe('nothing_said');
  });

  it('tells an ABSENT programme apart from an EMPTY one', () => {
    // Absent means it only spoke. Empty means it set out to decide and produced nothing, and a
    // programme of zero sessions is worse than telling her the update is waiting.
    expect(parseCoachPlan(JSON.stringify({ say: 'ok' }), facts).ok).toBe(true);
    expect(unreadable(JSON.stringify({ say: 'ok', sessions: [] }))).toBe('no_sessions');
  });
});

describe('the contract version is ours to stamp, never the coach to guess', () => {
  /*
   * THE FIRST LIVE REPLY DIED HERE. `v` was a required integer with no allowed value in the schema
   * and no mention in the prompt, so the model was being asked for a number it had no way to know.
   * It guessed, and a perfectly good programme came back `wrong_version`. A required field the
   * answerer cannot possibly get right is not a check; it is a trap.
   */
  it('reads a reply that never mentions a version', () => {
    const r = read(JSON.stringify({ say: 'ok', sessions: [{ name: 'D', blocks: [{ rounds: 1, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] }] }] }));
    expect(r.plan.v).toBe(COACH_PLAN_VERSION);
  });

  it('ignores a version the coach invented rather than refusing the plan', () => {
    const r = read(JSON.stringify({ v: 99, say: 'ok', sessions: [{ name: 'D', blocks: [{ rounds: 1, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] }] }] }));
    expect(r.plan.v).toBe(COACH_PLAN_VERSION);
  });

  it('does not ask for one in the schema at all', () => {
    expect((COACH_PLAN_SCHEMA.required as readonly string[]).includes('v')).toBe(false);
    expect('v' in COACH_PLAN_SCHEMA.properties).toBe(false);
  });
});
