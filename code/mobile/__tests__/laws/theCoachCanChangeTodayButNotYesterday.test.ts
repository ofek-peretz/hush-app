import fs from 'fs';
import path from 'path';
import { applyLiveEdit, applyLiveEdits, LIVE_EDIT_VERBS, type LiveEdit } from '@/domain/liveRevision';
import { COACH_PLAN_SCHEMA, parseCoachPlan } from '@/domain/coachPlan';
import { geminiSchema } from '@/domain/geminiSchema';
import type { Step } from '@/state/stores/sessionStore';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH CHANGES THE WORKOUT SHE IS IN — AND NEVER THE ONE SHE HAS ALREADY DONE.
 *
 * ⛔ FOUNDER, 2026-08-02: *"During the workout you can just ask the coach for anything in the chat
 * window and it happens."*
 *
 * *"and it happens"* is the half that did not exist. `askCoachToRevise` wrote the STORED programme —
 * next week. The running session was built once at `startCoach` and never read a coach answer
 * again: when she reported pain mid-workout, the coach rebuilt next week and told her in words what
 * to do about today, and SHE carried it out.
 *
 * ── ⛔ THE INVARIANT THAT MAKES THIS SAFE ───────────────────────────────────────────────────────
 * **A LOGGED SET IS A FACT ABOUT HER BODY.** Nothing an answer from a model contains may rewrite
 * one. Every verb is asserted against that below, individually, because a single transform that
 * forgot `fromIndex` would silently rewrite her record and every other test here would still pass.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const step = (ex: string, i: number, setIdx: number, total: number, load = 40): Step => ({
  exerciseId: ex,
  globalIndex: i,
  exerciseSetIndex: setIdx,
  totalSetsInExercise: total,
  target: { exerciseId: ex, setIndex: setIdx, recommendedWeight: load, recommendedReps: 8 },
  lastSetOfExercise: setIdx === total - 1,
  lastSetOfSession: false,
});

/** Bench ×3, row ×3, plank ×2 — eight steps, three exercises. */
const plan = (): Step[] => {
  const out = [
    ...[0, 1, 2].map((i) => step('bb_bench_press', i, i, 3)),
    ...[0, 1, 2].map((i) => step('db_row', 3 + i, i, 3, 22)),
    ...[0, 1].map((i) => step('plank', 6 + i, i, 2, 0)),
  ];
  out[out.length - 1] = { ...out[out.length - 1], lastSetOfSession: true };
  return out;
};

/** She is on set 2 of the bench: one set logged behind her. */
const HERE = 1;

describe('nothing behind her moves — every verb, separately', () => {
  it.each(LIVE_EDIT_VERBS.filter((v) => v !== 'defer' && v !== 'swap'))(
    '`%s` leaves the steps she has already done untouched',
    (verb) => {
      const before = plan();
      const edit = {
        drop: { do: 'drop', ex: 'bb_bench_press' },
        sets: { do: 'sets', ex: 'bb_bench_press', n: 1 },
        load: { do: 'load', ex: 'bb_bench_press', n: 20 },
        end: { do: 'end' },
      }[verb as 'drop' | 'sets' | 'load' | 'end'] as LiveEdit;

      const after = applyLiveEdit(before, HERE, edit);
      /*
       * ⚠️ THE FIRST DRAFT OF THIS ASSERTED OBJECT IDENTITY — `expect(after[0]).toBe(before[0])` —
       * and it failed on three verbs, which sent me to read `reindex` and work out which of us was
       * wrong. It was the test.
       *
       * A completed step is renumbered on purpose. Drop the rest of the bench and the set she
       * already did is now the whole of her bench work — "SET 1 OF 1" is the TRUE label, and
       * freezing the old "SET 1 OF 3" would leave a count on her screen referring to sets that no
       * longer exist. What is being protected is not the object; it is the WORK.
       *
       * And her record is not here at all: a logged set is a `SetLog`, written at the time and
       * never derived from the plan. `Step` is what she is being asked to do.
       */
      expect(after.slice(0, HERE).map((s) => s.exerciseId)).toEqual(before.slice(0, HERE).map((s) => s.exerciseId));
      expect(after[0].target?.recommendedWeight).toBe(40);
      expect(after[0].exerciseId).toBe('bb_bench_press');
    },
  );

  it('⚠️ dropping the lift she is ON keeps the sets of it she has already done', () => {
    // The sharpest case of the invariant: "skip this" on set 2 of the bench must take away sets 2
    // and 3 and leave set 1 exactly where it is. A filter over the WHOLE plan would erase it.
    const after = applyLiveEdit(plan(), HERE, { do: 'drop', ex: 'bb_bench_press' });
    expect(after.filter((s) => s.exerciseId === 'bb_bench_press')).toHaveLength(1);
    expect(after[0].globalIndex).toBe(0);
  });

  it('⚠️ ending the session keeps everything behind her', () => {
    const after = applyLiveEdit(plan(), 4, { do: 'end' });
    expect(after.map((s) => s.exerciseId)).toEqual([
      'bb_bench_press', 'bb_bench_press', 'bb_bench_press', 'db_row', 'db_row',
    ]);
  });

  it('⚠️ refuses an edit at all when the index is outside the plan', () => {
    // A stale index from a screen that re-rendered mid-flight. Returning `plan` is the only honest
    // answer; guessing where she is would apply a change to the wrong lift.
    const p = plan();
    expect(applyLiveEdit(p, -1, { do: 'drop', ex: 'db_row' })).toBe(p);
    expect(applyLiveEdit(p, 99, { do: 'drop', ex: 'db_row' })).toBe(p);
  });
});

describe('what each verb does', () => {
  it('drop takes the lift out of what is left', () => {
    const after = applyLiveEdit(plan(), HERE, { do: 'drop', ex: 'db_row' });
    expect(after.map((s) => s.exerciseId)).toEqual([
      'bb_bench_press', 'bb_bench_press', 'bb_bench_press', 'plank', 'plank',
    ]);
    // …and the session still knows where it ends.
    expect(after.filter((s) => s.lastSetOfSession)).toHaveLength(1);
    expect(after[after.length - 1].lastSetOfSession).toBe(true);
  });

  it('⚠️ drop renumbers, so "SET 2 OF 4" does not become a lie', () => {
    // The bug this prevents is invisible in the array and loud on the stage: remove a set and the
    // remaining ones keep saying they are 1-of-3 out of a run that is now 2 long.
    const after = applyLiveEdit(plan(), 0, { do: 'drop', ex: 'bb_bench_press' });
    const rows = after.filter((s) => s.exerciseId === 'db_row');
    expect(rows.map((s) => s.globalIndex)).toEqual([0, 1, 2]);
    expect(rows.every((s) => s.totalSetsInExercise === 3)).toBe(true);
  });

  it('sets trims the remaining rounds, counting only what is ahead of her', () => {
    // She is ON bench set 2, so two remain. Asking for one leaves one AFTER the logged set.
    const after = applyLiveEdit(plan(), HERE, { do: 'sets', ex: 'bb_bench_press', n: 1 });
    expect(after.filter((s) => s.exerciseId === 'bb_bench_press')).toHaveLength(2);
  });

  it('sets can also add, and the added round carries the CURRENT prescription', () => {
    const after = applyLiveEdit(plan(), HERE, { do: 'sets', ex: 'db_row', n: 5 });
    const rows = after.filter((s) => s.exerciseId === 'db_row');
    expect(rows).toHaveLength(5);
    expect(rows.every((s) => s.target?.recommendedWeight === 22)).toBe(true);
    // Copying the FIRST round instead would walk her load backwards on every added set.
    expect(rows[4].exerciseSetIndex).toBe(4);
  });

  it('load changes what is ahead and nothing behind', () => {
    const after = applyLiveEdit(plan(), HERE, { do: 'load', ex: 'bb_bench_press', n: 30 });
    expect(after.slice(0, 1).map((s) => s.target?.recommendedWeight)).toEqual([40]);
    expect(after.slice(1, 3).map((s) => s.target?.recommendedWeight)).toEqual([30, 30]);
  });

  it('load takes null — a lift the coach has just taken the weight off', () => {
    const after = applyLiveEdit(plan(), HERE, { do: 'load', ex: 'bb_bench_press', n: null });
    expect(after[2].target?.recommendedWeight).toBeNull();
  });

  it('end stops AFTER the step she is on, not instead of it', () => {
    // Ending before it would discard work she is in the middle of — a different request, and one
    // nobody made.
    const after = applyLiveEdit(plan(), HERE, { do: 'end' });
    expect(after).toHaveLength(2);
    expect(after[1].lastSetOfSession).toBe(true);
  });

  it('applies a list in order', () => {
    const after = applyLiveEdits(plan(), HERE, [
      { do: 'drop', ex: 'plank' },
      { do: 'load', ex: 'db_row', n: 18 },
    ]);
    expect(after.some((s) => s.exerciseId === 'plank')).toBe(false);
    expect(after.filter((s) => s.exerciseId === 'db_row').every((s) => s.target?.recommendedWeight === 18)).toBe(true);
  });
});

describe('it never claims a change it did not make', () => {
  it('⚠️ returns the SAME plan when the edit cannot land', () => {
    /*
     * Compared by identity on purpose. The caller's whole "did anything happen?" test is
     * `next !== before`, and a transform that returned an equal-but-new array would report every
     * impossible edit as a success — the coach saying "I've taken the rows out" with the rows still
     * on her screen.
     */
    const p = plan();
    expect(applyLiveEdit(p, HERE, { do: 'drop', ex: 'not_in_this_session' })).toBe(p);
    expect(applyLiveEdit(p, HERE, { do: 'sets', ex: 'not_in_this_session', n: 2 })).toBe(p);
    expect(applyLiveEdit(p, HERE, { do: 'load', ex: 'not_in_this_session', n: 30 })).toBe(p);
    // A count that changes nothing is not a change.
    expect(applyLiveEdit(p, HERE, { do: 'sets', ex: 'db_row', n: 3 })).toBe(p);
    // Zero rounds is `drop` said badly. Honouring it as a drop would be us deciding what it meant.
    expect(applyLiveEdit(p, HERE, { do: 'sets', ex: 'db_row', n: 0 })).toBe(p);
  });

  it('⚠️ refuses to empty the session', () => {
    // Dropping the only thing left is "end the workout", which is a different verb with a different
    // consequence — the session must not be left with nothing to execute.
    const only = [step('plank', 0, 0, 1)];
    expect(applyLiveEdit(only, 0, { do: 'drop', ex: 'plank' })).toBe(only);
  });

  it('the screen tells her when nothing landed', () => {
    // The domain refusing is only half of it; the other half is her being told. Silence here lets
    // her walk away believing her workout changed.
    const src = read('src/screens/session/SessionCoach.tsx');
    expect(src).toContain('if (update.today?.length && landed === 0) speak');
    expect(src).toContain("t('sessionCoach.nothingChanged')");
  });
});

describe('the wire carries what the coach writes', () => {
  it('parses a live edit off a real answer', () => {
    const r = parseCoachPlan(JSON.stringify({
      say: 'Taking the rows out and dropping the bench to 30.',
      today: [{ do: 'drop', ex: 'db_row' }, { do: 'load', ex: 'bb_bench_press', n: 30 }],
    }));
    expect(r.ok).toBe(true);
    expect(r.ok && r.answer.today).toEqual([
      { do: 'drop', ex: 'db_row' },
      { do: 'load', ex: 'bb_bench_press', n: 30 },
    ]);
  });

  it('⚠️ drops ONE bad edit, not the whole list', () => {
    // Three asked for and one malformed should be two applied, not none. A list rejected wholesale
    // is invisible from her side, because `say` still describes all three.
    const r = parseCoachPlan(JSON.stringify({
      say: 'x',
      today: [{ do: 'drop', ex: 'db_row' }, { do: 'sets', ex: 'plank' }, { do: 'end' }],
    }));
    expect(r.ok && r.answer.today).toEqual([{ do: 'drop', ex: 'db_row' }, { do: 'end' }]);
  });

  it('⚠️ the numeric argument survives the trip to Google', () => {
    /*
     * ⛔ THE BUG THIS CAUGHT BEFORE IT SHIPPED. `to` was first declared as one field holding either
     * a word or a number — `["string","number","null"]`, which reads perfectly well in JSON Schema.
     * `geminiSchema` collapses a union to its FIRST non-null member, so it would have reached
     * Google as a bare STRING: the model answers `"3"`, the parse requires a number and drops it,
     * and the coach says it took two sets off while nothing moves.
     *
     * Two fields, two types. This asserts the translated schema, which is the artefact Google
     * actually enforces — our own JSON Schema would have passed the whole way through.
     */
    const t = geminiSchema(COACH_PLAN_SCHEMA) as { properties: Record<string, { items: { properties: Record<string, { type: string; nullable?: boolean }> } }> };
    const props = t.properties.today.items.properties;
    expect(props.n).toEqual({ type: 'NUMBER', nullable: true });
    expect(props.to).toEqual({ type: 'STRING' });
  });

  it('the prompt names every verb the parse accepts', () => {
    // A verb in the code and absent from the prompt is a capability the coach does not know it has.
    const p = read('src/domain/coachPrompt.ts');
    for (const verb of LIVE_EDIT_VERBS) {
      expect({ verb, told: p.includes(`"do":"${verb}"`) }).toEqual({ verb, told: true });
    }
  });

  it('⚠️ a mid-session turn is NOT asked for a whole programme', () => {
    /*
     * `askCoachToRevise` sends `COACH_DECISION_SCHEMA`, where `sessions` is REQUIRED — right for
     * "she now trains four days", and badly wrong for a question asked from inside a workout: it
     * would answer "the rack is taken" with a rewritten month, every time and at the price of one.
     * This is the mistake `COACH_PLAN_SCHEMA` exists to prevent, and reusing `revise` would have
     * reintroduced it precisely because the two asks look so alike.
     */
    const src = read('src/platform/coach/afterSession.ts');
    expect(src).toContain("occasion.kind === 'in_session' ? COACH_PLAN_SCHEMA : COACH_DECISION_SCHEMA");
    expect(COACH_PLAN_SCHEMA.required).toEqual(['say']);
  });

  it('the live session is the only thing that applies an edit', () => {
    /*
     * `afterSession` carries `today` back rather than applying it: it runs when a session has ENDED
     * and, on a cold start, with no screen mounted at all. Only the live session knows whether the
     * lift is still ahead of her.
     */
    expect(read('src/platform/coach/afterSession.ts')).not.toContain('reviseToday');
    expect(read('src/screens/session/SessionCoach.tsx')).toContain('session.reviseToday(update.today)');
  });
});
