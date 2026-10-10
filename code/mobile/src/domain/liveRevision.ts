/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH CHANGES THE WORKOUT SHE IS STANDING IN.
 *
 * ⛔ FOUNDER, 2026-08-02, proposing the chat window in place of the swap disc:
 *
 *   > *"During the workout you can just ask the coach for anything in the chat window and it
 *   > happens. So you can skip an exercise, or anything else."*
 *
 * ── WHAT DID NOT EXIST BEFORE THIS FILE ─────────────────────────────────────────────────────────
 * *"and it happens"* was the part the app could not do. `askCoachToRevise` writes the STORED
 * programme — next week. The running session was built once at `startCoach` and never read the
 * coach's answer again. When she reported pain mid-workout the coach rebuilt next week and told her
 * in words what to do about today; SHE carried it out. Everything else the workout screen offered —
 * swap, defer, edit — was a hard-coded door the app decided in advance she might need.
 *
 * This is the write path. The coach names an edit; the session applies it to the steps she has not
 * reached yet.
 *
 * ── ⚠️ A CLOSED VOCABULARY, AND THAT IS NOT A LEASH ─────────────────────────────────────────────
 * Six verbs. Not because the coach's judgement needs narrowing — the ruling on that is settled
 * ("let him be him") — but because this writes into a machine that is MID-EXECUTION, with sets
 * already logged behind it and a watch mirroring it. Prose cannot be applied to a state machine.
 * The coach decides freely WHAT should change; this is the wire that carries the decision, and a
 * wire has a gauge.
 *
 * If the coach wants something outside these six, it says so in `say` and she does it — exactly as
 * it works today for pain. Nothing regresses; the vocabulary only adds.
 *
 * ── ⛔ THE ONE INVARIANT ────────────────────────────────────────────────────────────────────────
 * **NOTHING BEHIND HER MOVES.** Every transform starts at `fromIndex` — the step she is on — and a
 * logged set is a fact about her body that no answer from a model may rewrite. This is asserted on
 * every verb in `theCoachCanChangeTodayButNotYesterday`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

// 

import type { Step } from '@/state/stores/sessionStore';

/**
 * One change to the rest of today.
 *
 * `ex` is the exercise it is about, so an edit is expressed against the WORKOUT rather than against
 * a step index — the coach is looking at a sheet, not at our array, and an index would be a number
 * it has to guess correctly for the edit to land on the lift it meant.
 *
 * ⚠️ AND THE ARGUMENT IS SPLIT IN TWO — `to` for the one verb that takes a WORD, `n` for the two
 * that take a NUMBER. One field typed `["string","number","null"]` reads perfectly well in JSON
 * Schema and does not survive the trip: `geminiSchema` collapses a union to its first non-null
 * member, so `to` would reach Google as a plain STRING, the model would answer `"3"`, and the parse
 * — which requires a number — would drop every `sets` and `load` edit in silence. The coach would
 * say it had taken two sets off and nothing would move.
 *
 * Found by reading the translator rather than by testing the round trip, which would have passed:
 * our own fixtures are written in JSON Schema, and it is only Google that narrows the type.
 */
export type LiveEdit =
  /** Take it out of today. The commonest ask after "my shoulder is tight". */
  | { do: 'drop'; ex: string }
  /** Move it later in the session — the rack is taken, come back to it. */
  | { do: 'defer'; ex: string }
  /** Fewer (or more) rounds of it. "I've only got twenty minutes." */
  | { do: 'sets'; ex: string; n: number }
  /** A different load from here on. "Take ten kilos off." `null` is bodyweight. */
  | { do: 'load'; ex: string; n: number | null }
  /** Put something in its place. Applied by the session, which owns the target table. */
  | { do: 'swap'; ex: string; to: string }
  /** Stop after the step she is on. */
  | { do: 'end' };

/** Every verb, for the schema and for the tests that hold the two in agreement. */
export const LIVE_EDIT_VERBS = ['drop', 'defer', 'sets', 'load', 'swap', 'end'] as const;

/**
 * Renumber after any structural change.
 *
 * `globalIndex` and `lastSetOfSession` are DERIVED — a plan that has lost or gained steps and kept
 * the old numbers ends the session on the wrong step, or never ends it. `exerciseSetIndex` and
 * `totalSetsInExercise` are rebuilt per contiguous run for the same reason: "SET 2 OF 4" is a lie
 * the moment a set is removed from under it.
 */
function reindex(plan: Step[]): Step[] {
  const runs: Step[][] = [];
  for (const st of plan) {
    const last = runs[runs.length - 1];
    if (last && last[0].exerciseId === st.exerciseId) last.push(st);
    else runs.push([st]);
  }
  const flat: Step[] = [];
  for (const run of runs) {
    run.forEach((st, i) => {
      flat.push({
        ...st,
        exerciseSetIndex: i,
        totalSetsInExercise: run.length,
        lastSetOfExercise: i === run.length - 1,
      });
    });
  }
  return flat.map((st, i) => ({ ...st, globalIndex: i, lastSetOfSession: i === flat.length - 1 }));
}

/** Does this step belong to the exercise the edit names? */
const isEx = (st: Step, ex: string) => st.exerciseId === ex;

/**
 * Apply one edit to the steps from `fromIndex` onward.
 *
 * ⚠️ RETURNS THE PLAN UNCHANGED when the edit cannot be honoured — an unknown exercise, a `sets`
 * count that would empty the session, an edit naming a lift she has already finished. The caller
 * compares by identity and tells her nothing happened, rather than reporting a change that did not
 * occur. That failure mode — announcing a change and not making it — is the one the post-session
 * call already taught us to refuse (`theWorkoutEndsAndTheCoachDecides`).
 */
export function applyLiveEdit(plan: Step[], fromIndex: number, edit: LiveEdit): Step[] {
  if (fromIndex < 0 || fromIndex >= plan.length) return plan;
  const done = plan.slice(0, fromIndex);
  const rest = plan.slice(fromIndex);

  switch (edit.do) {
    case 'end': {
      // She finishes the step she is on and stops. Ending BEFORE it would discard work she is in
      // the middle of, which is a different request and not one anybody made.
      return reindex([...done, rest[0]]);
    }
    case 'drop': {
      const kept = rest.filter((st) => !isEx(st, edit.ex));
      /*
       * ⛔ THE BOUNDARY IS "NOTHING LEFT IN FRONT OF HER", NOT "NOTHING LEFT AT ALL".
       *
       * This guard was `done.length + kept.length === 0` and that is the wrong question. She is on
       * the first set of the LAST exercise; the plan is [bench, row, row] and `setIndex` is 1. Drop
       * the rows: `done` is [bench] so the total is 1, the guard passes, and the plan becomes length
       * 1 while **the cursor stays at 1**. `plan[1]` is undefined — no current exercise, no set
       * label, no last step to finish. The session cannot go on and cannot end.
       *
       * Refusing is also the better answer for her: `sessionCoach.cannotSkip` already says *"that is
       * the last thing left today — skipping it ends the workout"*, which routes her to the verb
       * that actually means that.
       */
      if (kept.length === rest.length || kept.length === 0) return plan;
      return reindex([...done, ...kept]);
    }
    case 'sets': {
      const mine = rest.filter((st) => isEx(st, edit.ex));
      if (mine.length === 0 || edit.n < 1) return plan;
      if (edit.n === mine.length) return plan;
      // Fewer: keep the first `to`. More: repeat the LAST one, which carries the current
      // prescription — a copy of the first would walk her load backwards.
      const wanted =
        edit.n < mine.length
          ? mine.slice(0, edit.n)
          : [...mine, ...Array.from({ length: edit.n - mine.length }, () => mine[mine.length - 1])];
      const out: Step[] = [];
      let placed = false;
      for (const st of rest) {
        if (!isEx(st, edit.ex)) { out.push(st); continue; }
        if (!placed) { out.push(...wanted); placed = true; }
      }
      return reindex([...done, ...out]);
    }
    case 'load': {
      const touched = rest.map((st) =>
        isEx(st, edit.ex) && st.target
          ? { ...st, target: { ...st.target, recommendedWeight: edit.n } }
          : st,
      );
      if (!touched.some((st, i) => st !== rest[i])) return plan;
      // No structural change, so no reindex — the steps are the same steps.
      return [...done, ...touched];
    }
    // `defer` and `swap` are applied by the session, which owns the target table and the run
    // ordering. They are in the vocabulary so the coach can ask for them; see `reviseToday`.
    case 'defer':
    case 'swap':
      return plan;
  }
}

/** Apply a list in order, each on the result of the last. */
export function applyLiveEdits(plan: Step[], fromIndex: number, edits: LiveEdit[]): Step[] {
  return edits.reduce((acc, e) => applyLiveEdit(acc, fromIndex, e), plan);
}
