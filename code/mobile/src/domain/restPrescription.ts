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
import { exerciseById } from '@/data/exercises';
import { learnedRestS } from '@/engine/v5/timeBudget';
import type { Session } from '@/data/local/models';

// Hush-owned day-one rest lengths (not user-adjustable, §10.8). Rest matches the work: a compound
// set needs real recovery, an isolation set doesn't (S2, approved 2026-07-05).
export const REST_COMPOUND_S = 150; // between sets of a compound lift
export const REST_ISOLATION_S = 75; // between sets of an isolation lift
export const REST_TRANSITION_S = 120; // between exercises (the walk + setup)
/** Plan-level fallback for a stale installed watch app (pre-per-step-rest builds). */
export const REST_INTER_S = 90;

/**
 * Her pooled TRANSITION rest — the median of every known rest she took before the FIRST set of a
 * lift (legacy approach sets excluded). Pure; null until she has one real sample.
 */
export function learnedTransitionRestS(history: Session[]): number | null {
  const samples: (number | null | undefined)[] = [];
  for (const s of history) for (const l of s.sets) {
    if (l.isApproach || l.setIndex !== 0) continue;
    samples.push(l.restBeforeS);
  }
  return learnedRestS(samples);
}

const learnedRestByExercise = new Map<string, number>();
let learnedTransitionS: number | null = null;

/** Recompute her learned rests from completed-session history (S-17). Idempotent; cheap. */
export function refreshLearnedRests(history: Session[]): void {
  const byExercise = new Map<string, (number | null | undefined)[]>();
  for (const s of history) for (const l of s.sets) {
    if (l.isApproach) continue; // a measurement is not work, and its rest is not her rest
    if (l.setIndex === 0) continue; // a first-set rest is the TRANSITION — pooled below, never inter
    const arr = byExercise.get(l.exerciseId);
    if (arr) arr.push(l.restBeforeS);
    else byExercise.set(l.exerciseId, [l.restBeforeS]);
  }
  learnedRestByExercise.clear();
  for (const [id, samples] of byExercise) {
    const median = learnedRestS(samples);
    if (median != null) learnedRestByExercise.set(id, Math.round(median));
  }
  const t = learnedTransitionRestS(history);
  learnedTransitionS = t == null ? null : Math.round(t);
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
  return (exerciseId && exerciseById(exerciseId)?.tier === 'isolation') ? REST_ISOLATION_S : REST_COMPOUND_S;
}

/**
 * WHAT THE PRESCRIPTION BECOMES IF THIS REST JOINS IT (v7 2.4d).
 *
 * The athlete cut a rest short, or stretched it. The screen that says so has to show her the
 * consequence — the plan moving from what it was to what her pace just made it — and it must be
 * the SAME number the engine will prescribe, not a rounded impression of it. So this asks the one
 * median rule (`learnedRestS`) the same question, with her new sample added to the same samples.
 *
 * Pure, and deliberately not cached: it answers about a rest that has not been saved yet.
 */
export function restWithSample(history: Session[], exerciseId: string, sampleS: number): number | null {
  const samples: (number | null | undefined)[] = [];
  for (const s of history) for (const l of s.sets) {
    if (l.isApproach || l.setIndex === 0 || l.exerciseId !== exerciseId) continue;
    samples.push(l.restBeforeS);
  }
  samples.push(sampleS);
  const median = learnedRestS(samples);
  return median == null ? null : Math.round(median);
}

/** The between-exercises rest: HER pooled transition median once she has one, else the bootstrap. */
export function restTransitionSeconds(): number {
  return learnedTransitionS ?? REST_TRANSITION_S;
}
