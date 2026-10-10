/**
 * ════ A SUPERSET, AS THE ATHLETE NEEDS IT TOLD ════
 *
 * Founder, 2026-10-11, after a walk of the live app: *"לגבי סופרסט — שזה יהיה מוצג אחרת לגמרי כי כרגע
 * זה לא ברור בכלל. אולי צריך מסך שכתוב סופרסט עם התראה וסרטון של שני התרגילים שצריך לבצע."*
 *
 * The plan has always RUN a superset correctly (`planRun`: no rest inside a round, the rest between
 * rounds). What the screens had to say about it was one word and a second name on the FIRST lift
 * only. The second lift arrived with nothing saying it was the other half; the rest between rounds
 * announced the first lift again as "a new exercise"; and the count above the name flipped between
 * "exercise 4 of 6" and "exercise 5 of 6" every set.
 *
 * Everything those screens now say is read from here — one description of where she stands:
 * WHICH lifts are done back to back, which of them she is on, and which round of how many.
 *
 * ⚠️ READ FROM THE STEPS, NOT FROM A LABEL. A round is the run of steps the plan joins with no rest
 * (`straightOn` — the same line the machine uses to skip the rest screen), so a pair the coach
 * wrote, a pair the model wrote and a three-lift circuit are all described by the one rule, and a
 * plan that carries no block bookkeeping at all is still read correctly.
 */

export interface SupersetStep {
  exerciseId: string;
  /** A warm-up bridge is never half of a round. */
  warmup?: unknown;
}

export interface SupersetView {
  /** The lifts of one round, in the order she performs them. Two for a superset; more for a circuit. */
  exerciseIds: string[];
  /** 1-based: which of them the step is. */
  position: number;
  /** 1-based round, and how many rounds the block runs. */
  round: number;
  rounds: number;
  /** Where this round's first step stands in the plan — so a caller can read each lift's own
   *  prescription (`plan[first + k]`) without walking the plan a second time. */
  first: number;
}

/**
 * The superset the step at `index` belongs to, or null when it stands alone.
 *
 * `straightOn(step)` answers "does the next step follow this one with no rest?" — the caller's own
 * rule, so this file needs neither the clock nor the store.
 */
export function supersetAt<S extends SupersetStep>(
  plan: readonly S[],
  index: number,
  straightOn: (step: S) => boolean,
): SupersetView | null {
  if (index < 0 || index >= plan.length) return null;
  /** Step `i` flows into step `i + 1`: no rest between them, and they are different lifts. */
  const flows = (i: number): boolean =>
    i >= 0 &&
    i < plan.length - 1 &&
    !plan[i].warmup &&
    !plan[i + 1].warmup &&
    plan[i].exerciseId !== plan[i + 1].exerciseId &&
    straightOn(plan[i]);

  /** The round containing step `i`, as [first, last] indices. */
  const roundAround = (i: number): [number, number] => {
    let first = i;
    while (flows(first - 1)) first -= 1;
    let last = i;
    while (flows(last)) last += 1;
    return [first, last];
  };

  const [first, last] = roundAround(index);
  if (last === first) return null;
  const ids = plan.slice(first, last + 1).map((s) => s.exerciseId);
  const sameRound = (from: number, to: number): boolean =>
    to - from === last - first && ids.every((id, k) => plan[from + k]?.exerciseId === id);

  // The rounds before this one and after it: the same lifts, in the same order, back to back.
  let before = 0;
  for (let end = first - 1; end >= 0; ) {
    const [f, l] = roundAround(end);
    if (l !== end || !sameRound(f, l)) break;
    before += 1;
    end = f - 1;
  }
  let after = 0;
  for (let start = last + 1; start < plan.length; ) {
    const [f, l] = roundAround(start);
    if (f !== start || !sameRound(f, l)) break;
    after += 1;
    start = l + 1;
  }

  return { exerciseIds: ids, position: index - first + 1, round: before + 1, rounds: before + 1 + after, first };
}
