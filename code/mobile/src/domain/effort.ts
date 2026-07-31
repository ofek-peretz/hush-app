/**
 * HOW HARD IT WAS — the record's rule for keeping her answers.
 *
 * One line of logic, lifted out of the session store for one reason: inside the store it lives in a
 * closure that no test can reach without mounting a live workout, and the rule it holds is the kind
 * that breaks silently. An answer counted twice is a lift that looks like it was asked about twice.
 *
 * See `EffortLevel` for why the scale has three rungs and why it is asked once per exercise.
 */
import type { EffortLevel, EffortReport } from '@/data/local/models';

/**
 * Her answer for one exercise, REPLACING any earlier answer for that same exercise.
 *
 * Replace rather than append, because the beat can legitimately be entered twice for one lift — a
 * session resumed after the app was killed re-enters it, and a double tap is a double tap. The last
 * answer is the one she meant; two answers for one lift is a record that cannot be read.
 *
 * Order is preserved for every other lift, so the list still reads in the order she trained.
 */
export function recordEffort(
  existing: EffortReport[] | undefined,
  exerciseId: string,
  level: EffortLevel,
  at: string,
): EffortReport[] {
  const kept = (existing ?? []).filter((e) => e.exerciseId !== exerciseId);
  return [...kept, { exerciseId, level, at }];
}
