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

// 

import { exerciseById } from '@/data/exercises';
import { learnedRestS } from '@/engine/v5/timeBudget';
import { RECENCY_WINDOW_SESSIONS, MIN_REST_SAMPLES } from '@/engine/v5/constants';
import type { Session } from '@/data/local/models';

// Hush-owned day-one rest lengths (not user-adjustable, §10.8). Rest matches the work: a compound
// set needs real recovery, an isolation set doesn't (S2, approved 2026-07-05).
export const REST_COMPOUND_S = 150; // between sets of a compound lift
export const REST_ISOLATION_S = 75; // between sets of an isolation lift

/**
 * ════ B-11 · AND THE REST MATCHES THE PRESCRIPTION, NOT ONLY THE LIFT (2026-09-10) ════
 *
 * The two numbers above read ONE fact — is this lift a compound — and the founder's line for them is
 * *"rest matches the work"*. It did not: a set of five and a set of fifteen on the same barbell were
 * given the same 150 seconds, because the only thing the bootstrap could see was the exercise.
 *
 * Since 2026-09-07 the model writes a REP RANGE per lift (`Slot.repBand`, from her own words on the
 * builder — *"twelve weeks to a half marathon"*, *"I want to get strong"*), and the engine already
 * obeys it end to end: `coachDraft` keeps it, `materializeTemplate` writes it, `slotBandOf` lets it
 * outrank her profile band in the fold and in the prescription. **The one thing that never followed
 * it was the clock.** So the goal she typed shaped every load and every rep in her week and left her
 * resting ninety seconds before a heavy triple.
 *
 * The band's FLOOR is the intensity: a prescription that starts at five reps is near-maximal work
 * and needs minutes; one that starts at twelve is metabolic and needs less. The factor is applied to
 * the tier bootstrap only — the moment she has `MIN_REST_SAMPLES` of her own (F-17), her measured
 * median is the whole answer and this table is never consulted again. Same discipline as every
 * other B-*: a guess that a fact of hers replaces within three sets.
 *
 *     band floor      factor      compound       isolation
 *       ≤ 5            1.5         225 s          113 s        a true strength set
 *       ≤ 7            1.25        188 s           94 s
 *       8 … 11         1.0         150 s           75 s        the hypertrophy default (8-12)
 *       ≥ 12           0.8         120 s           60 s        metabolic work
 */
export const REST_BAND_FACTORS: readonly { maxFloor: number; factor: number }[] = [
  { maxFloor: 5, factor: 1.5 },
  { maxFloor: 7, factor: 1.25 },
  { maxFloor: 11, factor: 1.0 },
  { maxFloor: Infinity, factor: 0.8 },
];

/** The bootstrap multiplier for a prescription that starts at `bandLo` reps. Absent band → 1. */
export function restBandFactor(bandLo?: number | null): number {
  if (bandLo == null || !Number.isFinite(bandLo)) return 1;
  return REST_BAND_FACTORS.find((r) => bandLo <= r.maxFloor)!.factor;
}
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
  opts: {
    compound: boolean;
    restS: number | null;
    execS: number | null;
    /** The prescription's floor, when the seat carries one (B-11). Shapes only the BOOTSTRAP rest —
     *  a measured `restS` is hers and is never scaled. Absent → the tier number, as before. */
    bandLo?: number | null;
  },
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
    /*
     * B-11 — the bundle carries a REST inside it, and a prescription that starts at five reps needs
     * a longer one. The band's factor is charged as the DELTA on the tier's rest, so the work half
     * of the bundle is untouched and the ordinary 8-12 seat prices exactly as it always did.
     */
    const tier = opts.compound ? REST_COMPOUND_S : REST_ISOLATION_S;
    const bandDelta = Math.round(tier * restBandFactor(opts.bandLo)) - tier;
    const bundled = (opts.compound ? COMPOUND_SET_MIN : ISOLATION_SET_MIN) * 60 + bandDelta;
    return sides === 1 ? bundled : bundled + workBootstrap;
  }
  if (opts.execS != null) return opts.execS + opts.restS; // hers — both sides already inside it
  return workBootstrap * sides + opts.restS;
}

/**
 * ════ WHAT A SUPERSET SAVES, PER ROUND (founder mandate 2026-08-26) ════
 *
 * Two paired lifts rest ONCE per round, after both. Priced serially each partner carries its own
 * rest inside `perSetSeconds`; paired, the round keeps the LONGER partner's rest and the shorter
 * one's is the saving. Conservative on purpose — the clock never promises time the gym floor
 * cannot deliver. Rest resolution mirrors `perSetSeconds` exactly: her measured rest when it
 * exists, else the bootstrap's own rest share (the bundled set minute minus its work seconds), so
 * the saving and the price can never be read off two different rulers.
 */
export function pairedRestSavedS(
  aId: string,
  bId: string,
  restFor?: (id: string) => number | null,
): number {
  const restShare = (id: string): number => {
    const measured = restFor?.(id) ?? null;
    if (measured != null) return measured;
    const compound = exerciseById(id)?.tier === 'compound';
    return (compound ? COMPOUND_SET_MIN : ISOLATION_SET_MIN) * 60 - SET_EXEC_SECONDS[compound ? 'compound' : 'isolation'];
  };
  return Math.max(0, Math.min(restShare(aId), restShare(bId)));
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
      // A declined rest is not a short rest — see `isRestSample`. The lift still counts as SEEN, so
      // the F-8 window walks the same sessions it always did; only the false number is refused.
      if (isRestSample(l.restBeforeS)) out.push(l.restBeforeS);
    }
    if (sawLift && ++sessions >= RECENCY_WINDOW_SESSIONS) break; // F-8
  }
  /* The live sample passes the SAME floor as a recorded one, and it must, or the two halves of one
     rule disagree in the worst possible place: `restWithSample` feeds the learned-rest beat, so a
     rest pressed through in two seconds would have announced *"REST · LEARNED"* over a number the
     store then refused to bank. One gate, both sides of the write. */
  if (isRestSample(extraSample)) out.push(extraSample);
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
  for (const s of history.slice(0, RECENCY_WINDOW_SESSIONS)) {
    /*
     * ⚠️ THE WARM-UP RAMP MOVED WHERE THE WALK LIVES (2026-08-24). The transition is the rest
     * before the FIRST THING she does at a station. Without a ramp that is working set 0, as it
     * always was. With one, the walk precedes WARM-UP −n, and working set 0's `restBeforeS` is the
     * fixed 45-second breath after the last bridge — sampling it would teach the walk to shrink
     * toward a number she never walked. So: per exercise, the chronologically first log (minimum
     * `setIndex`; warm-ups are negative) supplies the sample — a warm-up first-touch counts (its
     * rest IS the walk), a working set 0 counts only when no ramp preceded it, and a LEGACY
     * approach set (isApproach without isWarmup) still never counts.
     */
    const firstBySetIndex = new Map<string, (typeof s.sets)[number]>();
    for (const l of s.sets) {
      if (l.isApproach && !l.isWarmup) continue; // legacy Build-#33 measurement — never evidence
      const cur = firstBySetIndex.get(l.exerciseId);
      if (!cur || l.setIndex < cur.setIndex) firstBySetIndex.set(l.exerciseId, l);
    }
    for (const l of firstBySetIndex.values()) {
      if (!l.isWarmup && l.setIndex !== 0) continue; // a mid-exercise resume gap is not a walk
      // The walk between stations is subject to the same floor: a crossing pressed through in two
      // seconds is a station she was already standing at, not a two-second walk (`isRestSample`).
      if (isRestSample(l.restBeforeS)) samples.push(l.restBeforeS);
    }
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

/** The crossing's twin: is the walk between stations her pooled median (`learnedTransitionRestS`)
 *  rather than the bootstrap? The wrist's "your pace" on a transition rest asks this (2026-09-09). */
export function restTransitionIsLearned(): boolean {
  return learnedTransitionS != null;
}

/**
 * The between-sets rest for an exercise: HER measured median on that lift (S-17) once she has any,
 * else the tier bootstrap. Unknown exercise → compound, the safe long side.
 */
export function restInterSecondsFor(exerciseId: string | null | undefined, bandLo?: number | null): number {
  if (exerciseId) {
    const learned = learnedRestByExercise.get(exerciseId);
    if (learned != null) return learned; // her own median outranks every guess (S-17 / F-17)
  }
  return tierRestS(exerciseId, bandLo);
}

/** The day-one tier bootstrap for a lift (B-4), shaped by the prescription's own floor (B-11).
 *  Unknown exercise → compound, the safe long side. */
function tierRestS(exerciseId: string | null | undefined, bandLo?: number | null): number {
  const tier = (exerciseId && exerciseById(exerciseId)?.tier === 'isolation') ? REST_ISOLATION_S : REST_COMPOUND_S;
  return Math.round(tier * restBandFactor(bandLo));
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

/**
 * ════ A REST THAT WAS NOT A REST IS NOT EVIDENCE (founder 2026-08-30) ════
 *
 * *"אני צריך להזין את הסט שביצעתי ואז לדלג ישר על המנוחה כי כבר נחתי פיזית בפועל."*
 *
 * The rest clock starts when the set is LOGGED (`completeSet` stamps `restStartedAtRef`), not when
 * the set physically ended — the phone cannot know the second. So an athlete who finishes a set,
 * stands for four minutes, then remembers to log, opens a full rest he has already taken and
 * presses straight through it. Correct behaviour on his part, and the app then wrote the two
 * seconds his thumb took as `restBeforeS` — **his rest, measured.**
 *
 * That number is not small, it is FALSE, and it does not stay in one place:
 *
 *   · it is a sample in his learned inter-set median (S-17), which IS his next prescription;
 *   · the median feeds `enforceTimeCap` through the time budget, so an engine that believes he
 *     rests three seconds will pack more sets into the same hour;
 *   · `repsPerRung` carries it as the rest a set was performed under — the covariate that says
 *     whether a rung was fresh or fatigued;
 *   · L3's comparability window (`constants`) decides two sets are alike by how close their rests
 *     are, and a false zero makes a heavy set look like it was taken cold.
 *
 * ⚠️ F-17 IS NOT THIS GUARD, though it was written against the same word. Its note names *"a
 * mis-tapped skip"* and answers it with a COUNT — three samples before a median is trusted — which
 * defends against ONE bad value among good ones. It cannot help here, because for an athlete who
 * skips as a habit the skips are the majority: the median of five skips is a skip. A count gate
 * asks *how many*; this asks *whether the thing is a rest at all*, and both are needed.
 *
 * TEN SECONDS, AND IT IS A FLOOR ON POSSIBILITY, NOT ON VIRTUE. This is not a judgement that a
 * short rest is bad training — a fast-paced athlete who genuinely turns around in twenty-five
 * seconds is training that way, that IS his pace, and the engine must learn it exactly. Below ten
 * the screen has barely finished arriving; he cannot have used it as rest, whatever he did with the
 * time. So the honest record is UNKNOWN — which is L3's own answer, written at the top of this
 * file: *"an unknown rest is ABSENT, never zero, and never enters a median."*
 *
 * ⛔ SUPERSETS DO NOT COME THROUGH HERE AT ALL, and must not be mistaken for what this drops: a
 * step with no rest never reaches a rest screen (`REST_SKIP_THRESHOLD_S`, §1.14), so its next set's
 * `restBeforeS` is absent already. This only ever sees a rest that was OFFERED and declined.
 */
export const REST_SAMPLE_FLOOR_S = 10;

/**
 * Is this recorded `restBeforeS` evidence about her pace? The ONE answer, asked by the writer
 * (`endRest`, so the falsehood is never persisted) and by every reader of history below (so the
 * sessions already on the device are read honestly too — a gate at the write cannot reach them).
 */
export function isRestSample(restBeforeS: number | null | undefined): restBeforeS is number {
  return typeof restBeforeS === 'number' && restBeforeS >= REST_SAMPLE_FLOOR_S;
}
