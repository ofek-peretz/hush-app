/**
 * THE REST PRESCRIPTION — one home for every number a rest timer runs (S-17).
 *
 * "She hammers SKIP on the rest. Recorded. **Her median rest becomes the prescription.**" This
 * module owns both halves of that sentence for BOTH kinds of rest, and it is the ONE answer the
 * phone screen, the watch mirror, and the standalone watch plan all read (the swap-pool lesson:
 * one rule, one place, or the surfaces drift).
 *
 * TWO kinds of rest, split by a FACT the log already carries (`setIndex`):
 *
 *   · INTER — the rest before set 2..N of a lift (`setIndex > 0`). Learned PER EXERCISE (her squat
 *     rest and her curl rest are different numbers), median over her recorded `restBeforeS`.
 *   · TRANSITION — the rest before set 1 of a lift (`setIndex === 0`): the walk, the setup, the
 *     plate change. Learned as ONE pooled median across lifts — the walk between stations is a fact
 *     about her gym and her pace, not about the lift she is walking to.
 *
 * The split closes a real (if small) corruption both directions: transition rests are longer, so a
 * lift's inter median was dragged up by its own first-set samples — the engine measured her, then
 * prescribed a timer she never took — and the pooled transition was not learned at all (a fixed
 * 120 s). L3 holds throughout: an unknown rest is ABSENT, never zero, and never enters a median.
 *
 * Day-one bootstraps (B-4 family, §10.8): compound 150 s / isolation 75 s between sets, 120 s
 * between exercises — each replaced by her own median the moment one exists.
 */
// @ts-nocheck

// 

import { exerciseById } from '@/data/exercises';
import { learnedRestS } from '@/engine/v5/timeBudget';
import { RECENCY_WINDOW_SESSIONS, MIN_REST_SAMPLES } from '@/engine/v5/constants';
import type { Session } from '@/data/local/models';

// Hush-owned day-one rest lengths (not user-adjustable, §10.8). Rest matches the work: a compound
// set needs real recovery, an isolation set doesn't (S2, approved 2026-07-05).
export const REST_COMPOUND_S = 150; // between sets of a compound lift
export const REST_ISOLATION_S = 75; // between sets of an isolation lift
export const REST_TRANSITION_S = 120; // between exercises (the walk + setup)
/** Plan-level fallback for a stale installed watch app (pre-per-step-rest builds). */
export const REST_INTER_S = 90;

/**
 * ════ WHAT ONE SET COSTS THE HOUR, BEFORE SHE HAS PERFORMED ANY (B-4, the day-one bootstrap) ════
 *
 * ⛔ MOVED HERE FROM `fixtureModel` ON 2026-08-11, BECAUSE THERE WERE TWO ANSWERS AND SHE COULD SEE
 * BOTH. The engine builds the week against these numbers — `enforceTimeCap` cuts a day until it
 * fits `SESSION_MAX` priced this way — and `coachWeek` priced the SAME session at a flat
 * `EXEC_S + DEFAULT_REST_S` for every lift. Measured over twenty-four generated sessions, Today
 * overstated every one of them and by up to nine minutes:
 *
 *     female · 5 days · Upper A     engine 60 min      Today said 66 min
 *
 * A session the engine capped at sixty, announced to her as sixty-six, on the screen where the
 * founder has already caught this exact class of defect once ("the home screen still shows about 35
 * minutes for a longer workout"). Neither number was wrong on its own terms; there were simply two
 * of them, which L5 does not allow for a fact one module already owns.
 *
 * These bundle the whole set cycle — the walk, the loading, the reps, the writing down, and the
 * rest — so a caller pricing with them must NOT also charge a transition on top. Her MEASURED rest
 * and set durations replace them per lift the moment she has any (S-64/S-17).
 */
export const COMPOUND_SET_MIN = 3;
export const ISOLATION_SET_MIN = 2;

/** The WORK half of a set, before her measured duration replaces it (B-4). */
export const SET_EXEC_SECONDS = { compound: 45, isolation: 30 } as const;

/**
 * ════ WHAT ONE SET COSTS, IN SECONDS — ONE ANSWER, TWO CALLERS ════
 *
 * ⛔ THERE WERE TWO, AND A LAW EXISTS BECAUSE OF IT. `todayDrawsTheEngineWeek` asserts *"THE MINUTES
 * ARE THE ENGINE'S MINUTES — one answer, not two"*, written after Today announced sixty-six minutes
 * for a session the engine had capped at sixty. The two arithmetics were reconciled then — and each
 * kept its own COPY of the calculation, so they were free to drift again. They did, the moment the
 * engine learned that a one-sided set is performed twice: `fixtureModel` charged for both legs and
 * `coachWeek` did not, and the same law caught it on eighteen sessions.
 *
 * ⚠️ A ONE-SIDED SET DOUBLES THE WORK, NOT THE SET. She does the left side, then the right, then
 * rests — so the rest is taken once. Doubling the whole set would over-price a leg day by as much as
 * ignoring it under-priced one.
 *
 * ⚠️ AND HER MEASURED `execS` ALREADY CONTAINS BOTH SIDES. `learnedExecS` derives the work from the
 * gap between two logged sets, and she logs a one-sided set once, after both legs. So the doubling
 * applies to the BOOTSTRAP only, which is a per-side estimate.
 */
export function perSetSeconds(
  exerciseId: string,
  opts: { compound: boolean; restS: number | null; execS: number | null },
): number {
  /*
   * ════ THE SECOND SIDE IS CHARGED. THE DECISION, AND THE NUMBERS THAT MADE IT (2026-08-16) ════
   *
   * `unilateral` is carried on 21 of 111 generatable lifts and was read in ONE place in the whole
   * app — the swap score — never by the clock. A day of one-sided work was priced as if she trained
   * one leg and went home.
   *
   * This shipped OFF for one turn, because charging honestly means less work fits the hour and four
   * balance ratchets moved against it. That was an argument, not a decision. The founder asked for a
   * decision backed by numbers. Here it is — 50 athletes (both sexes, 2-6 days, five body maps),
   * 200 generated days, each priced on the SAME honest ruler in both arms:
   *
   *                            OFF          ON
   *     days over the hour     74 / 200     0 / 200      ← and NONE of the 74 was marked
   *     minutes overrun        224          0
   *     worst single day       +6.8 min     +0.0
   *     days under 45 min      0            0            ← the floor is not breached either way
   *     weekly sets            4327         4205         −2.8%
   *     muscles below MEV      62 / 450     62 / 450     ← IDENTICAL. not one muscle demoted.
   *     MEV debt (sets)        132          137          +5, over 450 muscle-weeks
   *     share inversions       172 / 1650   184 / 1650   +0.8 points
   *
   * ── ⛔ WHY THIS DOES NOT REST ON B-4 BEING RIGHT ────────────────────────────────────────────────
   * The 45 s second side is a declared constant, not her measurement, so the same 200 days were
   * re-priced at every plausible cost for the second side:
   *
   *      0 s →   0 days over        15 s →  63 days over        30 s →  67 days over
   *      5 s →  59 days over        20 s →  63 days over        45 s →  74 days over
   *
   * At ZERO the engine is flawless — `enforceTimeCap` lands every one of the 200 days at or under the
   * hour, 123 of them within thirty seconds of it. That is the whole finding: the days are packed
   * hard against the ceiling, so the second side has to cost *literally nothing* for the old pricing
   * to be honest. There is no value of the constant that rescues it. The direction is certain even
   * where the magnitude is not, which is why this is switched on and not left to a better estimate.
   *
   * ── WHAT THE BALANCE RATCHETS WERE ACTUALLY MEASURING ───────────────────────────────────────────
   * They got worse and it costs her nothing: the same 62 muscle-weeks sit under MEV in both arms, and
   * the debt on them grows by five sets spread over 450. An inversion is a RELATIVE rank between two
   * muscles; it moved because the week is 2.8% smaller, not because a muscle stopped being trained.
   * The 122 sets removed are sets that never fit in the hour she was promised.
   */
  const CHARGE_BOTH_SIDES = true;
  const sides = CHARGE_BOTH_SIDES && exerciseById(exerciseId)?.unilateral ? 2 : 1;
  const workBootstrap = SET_EXEC_SECONDS[opts.compound ? 'compound' : 'isolation'];
  // No rest fact → the whole-set bootstrap (it already bundles work + rest); only the work doubles.
  if (opts.restS == null) {
    const bundled = (opts.compound ? COMPOUND_SET_MIN : ISOLATION_SET_MIN) * 60;
    return sides === 1 ? bundled : bundled + workBootstrap;
  }
  if (opts.execS != null) return opts.execS + opts.restS; // hers — both sides already inside it
  return workBootstrap * sides + opts.restS;
}

/**
 * ════ WHAT THE CLOCK RUNS WHEN THE COACH DID NOT SAY ════
 *
 * A CONSTANT, and that is the whole point of it (founder, 2026-08-02).
 *
 * Everything above this line learns: her median rest per lift, her pooled median between lifts.
 * That was written when the ENGINE composed programmes, and under the founder's ruling it is a
 * second decider — *"the AI makes every decision about the athlete; the engine passes the record
 * along at the end of a session and corrects a load if she leaves the rep range. That is all."*
 *
 * So the learning is not deleted, it is DEMOTED out of the decision — his words: *"make it the dumb
 * constant, in case something goes wrong."* A constant decides nothing: same number for everyone,
 * stated to the coach in the prompt, and overridden by any coach that cares. Ninety seconds sits
 * between the old tier pair (150 compound / 75 isolation) — long enough not to rush a heavy set,
 * short enough not to strand her at a machine after a curl.
 *
 * It lives HERE rather than in the session store because the prompt has to quote it, and a pure
 * prompt may not import React state.
 */
export const REST_UNSTATED_S = 90;

/**
 * ════ ONE IMPLEMENTATION OF "HER REST ON THIS LIFT" ════
 *
 * ⛔ THERE WERE THREE, AND THEY DID NOT AGREE. `refreshLearnedRests`, `restWithSample` and
 * `fixtureModel.restSecFor` each walked the history and medianed the `setIndex > 0` rests by hand —
 * three copies of one rule, in the module whose own header promises *"the ONE answer"*. The budget
 * priced a session with one of them while the beat showed her another. They call this now.
 *
 * ⚠️ AND IT APPLIES F-8, WHICH IT NEVER DID. The register names the rest median explicitly among the
 * statistics the recency window scopes — *"reps-per-rung, N, the rest median (S-17), and the rail"* —
 * and this was the one that read her whole life. A rest she took in January is not her pace today,
 * and it outvoted the pace she has actually been keeping, for ever, because a median does not decay.
 * The window is the lift's own most recent sessions (a COUNT, per F-8's own wording), so a lift she
 * trains rarely still gets its real history.
 *
 * `extraSample` folds in a rest that has not been written to history yet — what `restWithSample`
 * needs to show her the consequence of the rest she just took.
 */
function interRestSamples(history: Session[], exerciseId: string, extraSample?: number): number[] {
  const out: number[] = [];
  let sessions = 0;
  for (const s of history) { // newest first
    let sawLift = false;
    for (const l of s.sets) {
      if (l.exerciseId !== exerciseId) continue;
      if (l.isApproach) continue; // a measurement is not work, and its rest is not her rest
      if (l.setIndex === 0) continue; // a first-set rest is the TRANSITION — pooled, never inter
      sawLift = true;
      if (typeof l.restBeforeS === 'number' && l.restBeforeS >= 0) out.push(l.restBeforeS);
    }
    if (sawLift && ++sessions >= RECENCY_WINDOW_SESSIONS) break; // F-8
  }
  if (extraSample != null) out.push(extraSample);
  return out;
}

/**
 * Her measured between-sets rest on ONE lift (S-17), or null when the evidence does not yet support
 * one. Windowed by F-8 and gated by F-17. Pure — the cached `refreshLearnedRests` map and the live
 * `restWithSample` beat are both this function, so the timer and the screen cannot disagree.
 */
export function learnedInterRestS(history: Session[], exerciseId: string, extraSample?: number): number | null {
  const samples = interRestSamples(history, exerciseId, extraSample);
  if (samples.length < MIN_REST_SAMPLES) return null; // F-17
  const m = learnedRestS(samples);
  return m == null ? null : Math.round(m);
}

/**
 * Her pooled TRANSITION rest — the median of the known rests she took before the FIRST set of a lift
 * (legacy approach sets excluded). Pooled across lifts because the walk between stations is a fact
 * about her gym and her pace, not about the lift she is walking to. Scoped by F-8 (her most recent
 * sessions, not her whole life) and gated by F-17. Pure; null until the evidence supports one.
 */
export function learnedTransitionRestS(history: Session[]): number | null {
  const samples: number[] = [];
  for (const s of history.slice(0, RECENCY_WINDOW_SESSIONS)) for (const l of s.sets) {
    if (l.isApproach || l.setIndex !== 0) continue;
    if (typeof l.restBeforeS === 'number' && l.restBeforeS >= 0) samples.push(l.restBeforeS);
  }
  if (samples.length < MIN_REST_SAMPLES) return null; // F-17
  const m = learnedRestS(samples);
  return m == null ? null : Math.round(m);
}

const learnedRestByExercise = new Map<string, number>();
let learnedTransitionS: number | null = null;

/** Recompute her learned rests from completed-session history (S-17). Idempotent; cheap. */
export function refreshLearnedRests(history: Session[]): void {
  learnedRestByExercise.clear();
  const lifts = new Set<string>();
  for (const s of history) for (const l of s.sets) if (!l.isApproach && l.setIndex > 0) lifts.add(l.exerciseId);
  for (const id of lifts) {
    const m = learnedInterRestS(history, id);
    if (m != null) learnedRestByExercise.set(id, m);
  }
  learnedTransitionS = learnedTransitionRestS(history);
}

/**
 * WT5 · REST — LEARNED. Is the timer running HER number, or the tier bootstrap?
 *
 * The seconds have been hers since S-17 shipped; nothing ever SAID so. The wrist's rest screen puts
 * a quiet "your pace" beside the clock exactly when this is true — never as a decoration, because
 * on a lift she has not rested through yet the claim would be false.
 */
export function restIsLearnedFor(exerciseId: string | null | undefined): boolean {
  return !!exerciseId && learnedRestByExercise.has(exerciseId);
}

/**
 * The between-sets rest for an exercise: HER measured median on that lift (S-17) once she has any,
 * else the tier bootstrap. Unknown exercise → compound, the safe long side.
 */
export function restInterSecondsFor(exerciseId: string | null | undefined): number {
  if (exerciseId) {
    const learned = learnedRestByExercise.get(exerciseId);
    if (learned != null) return learned;
  }
  return tierRestS(exerciseId);
}

/** The day-one tier bootstrap for a lift (B-4). Unknown exercise → compound, the safe long side. */
function tierRestS(exerciseId: string | null | undefined): number {
  return (exerciseId && exerciseById(exerciseId)?.tier === 'isolation') ? REST_ISOLATION_S : REST_COMPOUND_S;
}

/**
 * WHAT THE PRESCRIPTION BECOMES IF THIS REST JOINS IT (v7 2.4d).
 *
 * The athlete cut a rest short, or stretched it. The screen that says so has to show her the
 * consequence — the plan moving from what it was to what her pace just made it — and it must be
 * the SAME number the engine will prescribe, not a rounded impression of it.
 *
 * ⛔ SO IT RETURNS THE PRESCRIPTION, NOT THE MEDIAN. It used to return the raw median and `null`
 * when there was none, and the screen then drew `now ?? took` — the rest she had JUST TAKEN — under
 * the words **NEXT TIME**. Before F-17 that was merely optimistic; with an evidence gate it would be
 * flatly false, because a lift under the gate runs the tier bootstrap and nothing else. This asks
 * the same two-tier question `restInterSecondsFor` asks, with her new sample folded in, so the
 * number on the beat is the number on the next clock by construction.
 *
 * ⚠️ THE COACH'S OWN REST IS NOT CONSIDERED, deliberately: this beat is about what HER PACE did to
 * the plan, and on a coach-written step her pace changes nothing. The caller only shows the beat
 * where the plan is the engine's.
 *
 * Pure, and deliberately not cached: it answers about a rest that has not been saved yet.
 */
export function restWithSample(history: Session[], exerciseId: string, sampleS: number): number {
  return learnedInterRestS(history, exerciseId, sampleS) ?? tierRestS(exerciseId);
}

/** The between-exercises rest: HER pooled transition median once she has one, else the bootstrap. */
export function restTransitionSeconds(): number {
  return learnedTransitionS ?? REST_TRANSITION_S;
}

/**
 * ════ WHAT SHE ACTUALLY RESTED ════
 *
 * The number the learned-rest beat reports, and the sample her median moves on.
 *
 * ⚠️ IT HAS TO ADD BACK THE SECONDS SHE ADDED, and that is the whole of founder C.10 — *"adding
 * +15 s shows nothing, so the learning looks one-directional."* Two correct rules met and produced
 * a wrong number:
 *
 *   · `restTotalS` NEVER GROWS when she presses +15. That is the fill-forward law, and it is what
 *     makes the ring sweep by a visible slice instead of nudging imperceptibly.
 *   · the elapsed rest was read as `total - remaining`, off that same deliberately frozen total.
 *
 * So every second she ADDED was invisible to the measurement. She stretched her rest, the beat
 * reported the old duration, her median did not move, and the one direction the feature could not
 * learn was the one she had just demonstrated with her thumb.
 *
 * The clock she actually watched is `total + extra`.
 */
export function restedSeconds(totalS: number, remainingS: number, extraS: number): number {
  // Never negative: a resume across a clock change can hand back more remaining than total.
  return Math.max(0, totalS + extraS - remainingS);
}
