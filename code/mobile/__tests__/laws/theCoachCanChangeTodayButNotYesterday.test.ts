// @ts-nocheck
// 
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

  it('⛔ AND THE SCREEN THAT SAID SO IS GONE — the refusal now lives only in the domain', () => {
    /*
     * ⛔ TWICE REWRITTEN, AND THE SECOND TIME IT LOST ITS SUBJECT (founder, 2026-08-12: *"תמחק אותם
     * בבקשה"*).
     *
     * First this pinned a CHAT — the model's answer applied to the running session. Then it pinned
     * the SKIP chip that replaced it, and the line the sheet spoke when the drop was refused. Now
     * the sheet is deleted too: swap already sits on the stage at the first set and on every
     * transition rest, and **a lift she wants gone is a lift she wants replaced.**
     *
     * ⚠️ WHAT SURVIVES IS THE HALF THAT MATTERED. `applyLiveEdit` still refuses to leave her with
     * nothing in front of her — asserted directly above, on the domain, where it cannot be lost to
     * a screen being deleted. There is no longer any surface that can ask it for a drop, so there
     * is nothing left to tell her about.
     */
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'src/screens/session/SessionCoach.tsx'))).toBe(false);
    for (const loc of ['en', 'he']) {
      const copy = JSON.parse(read(`src/i18n/locales/${loc}.json`)) as Record<string, unknown>;
      expect(copy.sessionCoach).toBeUndefined(); // the whole block, not one dead key
    }
  });
});

describe('⛔ and the door itself is gone', () => {
  /*
   * ⛔ THIS BLOCK GUARDED THREE HOLES OF ONE KIND — a control offered where it cannot act, or an act
   * with no control. All three are moot: the sheet that held the controls was deleted on 2026-08-12.
   *
   * ⚠️ ONE OF THEM IS A REAL LOSS AND IS RECORDED RATHER THAN QUIETLY DROPPED. "The machine is
   * taken" (`markEquipmentOccupied`) had exactly one door on the phone and it was that sheet. The
   * WRIST keeps its own (`watchBridge.markEquipmentOccupied`), so the action survives; on the phone
   * it does not. That is the founder's call to reopen, and it is written here so it can be found.
   */
  const flow = () => read('src/screens/session/SessionFlow.tsx');

  it('nothing on the phone opens a mid-workout sheet', () => {
    expect(flow()).not.toContain("setOverlay('coach')");
    expect(read('src/components/PausedStage.tsx')).not.toContain('onCoach');
  });

  it('⚠️ …and the phone has its door to "the machine is taken" BACK — by the board (founder, 2026-09-07)', () => {
    /*
     * The loss recorded above was the founder's to reopen, and he reopened it with the plan that
     * makes a crowded gym the ordinary case: "busy" on any set presses the same verb the
     * wrist presses (`markEquipmentOccupied`), and the session map starts any
     * lift still ahead (`startExerciseNow`). Neither is a coach sheet — the sheet stays gone.
     */
    // The phone's own door is the map (start any lift still ahead) and swap on every set — the founder's
    // ruling on glass, 2026-09-08: "יש swap ויש פקד שמציג את התרגילים הנותרים". `markEquipmentOccupied`
    // (push it to the end) stays the wrist's verb; the phone never needed a fourth control for it.
    expect(flow()).toContain('startExerciseNow');
    expect(read('src/platform/watch/watchBridge.ts')).toContain('markEquipmentOccupied');
  });
});

describe('⛔ the wire no longer carries a change to today, because nothing applied one', () => {
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * THIS BLOCK TESTED A FIELD THE APP NEVER ACTED ON, AND IT IS DELETED WITH IT (2026-08-26).
   *
   * It held five tests over `today` — the parse, the drop-one-bad-edit rule, the Gemini type
   * translation, the prompt naming every verb, and the mid-session schema choice. All five were
   * correct about the wire and none of them could see the thing that mattered: **`CoachUpdate.today`
   * had no reader.** `reviseToday` survives on the session store and its only driver is the LOCAL
   * pain table in `PainWhere`; no coach edit has ever reached a running session.
   *
   * ⚠️ THE FIELD WAS NOT MERELY DEAD. The ask that carried it told the coach *"put it in 'today'
   * and say what you changed"* — so a coach that believed it had dropped her last two sets wrote
   * exactly that in `say`, which she reads, on a screen where nothing had changed. Carrying a
   * decision and discarding it is worse than never asking for it.
   *
   * ⚠️ AND ONE OF THESE TESTS DESERVES A HEADSTONE. *"The numeric argument survives the trip to
   * Google"* caught a real bug before it shipped — a `["string","number","null"]` union that
   * `geminiSchema` would have collapsed to a bare STRING. That lesson is not lost: it is held by
   * `geminiSchema`'s own tests, over the collapse rule rather than over this one field.
   *
   * WHAT SURVIVES, AND IS TESTED BELOW: `LiveEdit`, `applyLiveEdit`, `applyLiveEdits` and the
   * plan-shrink guard. Those are the PAIN path's machinery, they have a live caller, and the guard
   * is the one that stops a session being emptied out from under the cursor.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('the coach cannot ask for one — the field is off the schema entirely', () => {
    expect(Object.keys(COACH_PLAN_SCHEMA.properties)).not.toContain('today');
    expect(read('src/domain/coachPlan.ts')).not.toContain('function readToday(');
    expect(read('src/platform/coach/afterSession.ts')).not.toContain('parsed.answer.today');
  });

  it('⚠️ …and the parse simply ignores one if a model volunteers it', () => {
    const r = parseCoachPlan(JSON.stringify({
      say: 'Taking the rows out and dropping the bench to 30.',
      today: [{ do: 'drop', ex: 'db_row' }],
    }));
    expect(r.ok).toBe(true);
    expect(r.ok && (r.answer as Record<string, unknown>).today).toBeUndefined();
  });

  it('⛔ the live-edit machinery the PAIN path uses is untouched', () => {
    /* One live caller, and it is the one where being wrong is dangerous rather than slow. */
    expect(read('src/screens/pain/PainWhere.tsx')).toContain("session.reviseToday(gone.map((ex) => ({ do: 'drop', ex }) as const))");
    expect(read('src/domain/liveRevision.ts')).toContain('export function applyLiveEdits(');
    expect(LIVE_EDIT_VERBS).toContain('drop');
  });

  it('the live session is the only thing that applies an edit', () => {
    /*
     * `afterSession` never applied one and now cannot receive one. Only the live session knows
     * whether the lift is still ahead of her.
     */
    /* Comments blanked: the deletion note there NAMES `reviseToday` to say what still drives it,
       and a law a file cannot explain itself under is a law that gets worked around. */
    const afterSession = read('src/platform/coach/afterSession.ts')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
    expect(afterSession).not.toContain('reviseToday');
    /*
     * ⛔ AND THE MODEL IS NOT CALLED FROM INSIDE A WORKOUT AT ALL — the load-bearing half. Nothing
     * on the stage can hand the running workout to a model or to anything else.
     */
    const flowSrc = read('src/screens/session/SessionFlow.tsx');
    expect(flowSrc).not.toContain('askCoachInSession');
    expect(flowSrc).not.toContain('askCoach');
    expect(flowSrc).not.toContain('reviseToday');
    /* …and the function that reached it is gone from the app, not merely unreferenced by the stage. */
    expect(read('src/platform/coach/afterSession.ts')).not.toContain('export async function askCoachInSession');
  });
});

describe('⛔ the plan can never shrink out from under the cursor', () => {
  /*
   * FOUND BY READING, IN THE AUDIT. `drop` guards against emptying the WHOLE plan
   * (`done.length + kept.length === 0`) — and that is the wrong boundary.
   *
   * She is on the first set of the LAST exercise. `machine.setIndex` is 1; the plan is
   * [bench, row, row]. Drop the rows: `done` is [bench], `kept` is [] — the total is 1, so the guard
   * passes and the plan becomes length 1. **`setIndex` is still 1.** `plan[1]` is undefined, so
   * `currentExercise` is null, `setLabel` is null, and the session has nothing to execute and no
   * last step to finish — it cannot end, and it cannot go on.
   *
   * The right boundary is "nothing left AT OR AFTER where she is standing", and the app already has
   * the sentence for it: `sessionCoach.cannotSkip` — *"that is the last thing left today; skipping
   * it ends the workout."* Refusing routes her to the verb that actually means that: `end`.
   */
  const threeStep = (): Step[] => [
    step('bb_bench_press', 0, 0, 1),
    step('db_row', 1, 0, 2, 22),
    { ...step('db_row', 2, 1, 2, 22), lastSetOfSession: true },
  ];

  it('refuses a drop that would leave nothing in front of her', () => {
    const p = threeStep();
    expect(applyLiveEdit(p, 1, { do: 'drop', ex: 'db_row' })).toBe(p);
  });

  it('every verb leaves at least one step at or after the cursor', () => {
    // The invariant stated once, over the whole vocabulary — the guard above is one instance of it.
    const edits: LiveEdit[] = [
      { do: 'drop', ex: 'db_row' },
      { do: 'drop', ex: 'bb_bench_press' },
      { do: 'sets', ex: 'db_row', n: 1 },
      { do: 'load', ex: 'db_row', n: 10 },
      { do: 'end' },
    ];
    for (let here = 0; here < 3; here += 1) {
      for (const e of edits) {
        const after = applyLiveEdit(threeStep(), here, e);
        expect({ edit: e.do, here, remaining: after.length - here }).toEqual(
          expect.objectContaining({ edit: e.do, here }),
        );
        expect(after.length).toBeGreaterThan(here);
      }
    }
  });
});
