/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH'S LOG — every decision, with the reason it was made, coming back.
 *
 * The founder saw this before I did. I had described consistency-over-months as an unsolved risk
 * and a hole to build; he answered:
 *
 *   > *"Isn't that directly connected to our WHY?"*
 *
 * It is, and the mechanism already exists. The product has always recorded why it changed something
 * and shown it — `changeLog`, the "Why?" sheet, the per-lift change log. What was missing was one
 * direction: **the reason never came back to the thing that made it.** So a decision in month three
 * could contradict a decision in month one, not because the coach is inconsistent, but because it
 * had no memory of having decided.
 *
 * That is the entire fix. Not a subsystem — a return path.
 *
 * ── ONE REASON, NOT TWO ─────────────────────────────────────────────────────────────────────────
 * The obvious design is two fields: a public `say` for the athlete and a private `why` for the
 * coach's own memory. **Rejected, and the reason matters.**
 *
 * Two fields invite a public reason and a real one, and the gap between them is exactly the drift
 * this app was built to make impossible — *"every number comes from something you did; the coach
 * explains, it never invents."* One reason, said out loud and remembered. **If the coach cannot say
 * the real reason to her, the reason is bad**, and a schema that lets it hide that is a schema that
 * helps it.
 *
 * ── WHY IT IS CAPPED ────────────────────────────────────────────────────────────────────────────
 * It travels back on every call, so it is paid for on every call. An unbounded log would grow until
 * a two-year athlete's sheet cost more than everything else in it combined. The cap keeps the
 * recent past — which is what contradicts, and what she remembers being told.
 *
 * Pure and I/O-free.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** How many entries travel back. Enough to cover months of decisions on the lifts she trains most. */
export const COACH_LOG_CAP = 60;

export interface CoachDecision {
  /** ISO instant the decision landed. */
  at: string;
  /** The lift or movement it was about, when it was about one. Absent = the whole programme. */
  ex?: string;
  /**
   * The reason, in the coach's words — the same sentence the athlete reads in the "Why?" sheet.
   * There is no second, private version; see the header.
   */
  say: string;
}

/**
 * Append this plan's decisions to the log, newest last, capped.
 *
 * Same-instant duplicates are kept: two decisions about two different lifts in one plan are two
 * decisions, and de-duplicating on time would silently drop one of them.
 */
export function appendDecisions(
  log: CoachDecision[] | undefined,
  notes: { ex?: string; say: string }[] | undefined,
  at: string,
): CoachDecision[] {
  const added = (notes ?? [])
    .filter((n) => typeof n.say === 'string' && n.say.length > 0)
    .map((n) => ({ at, ...(n.ex ? { ex: n.ex } : {}), say: n.say }));
  if (added.length === 0) return log ?? [];
  const next = [...(log ?? []), ...added];
  return next.length > COACH_LOG_CAP ? next.slice(next.length - COACH_LOG_CAP) : next;
}

/**
 * What the coach is reminded of, newest first.
 *
 * Newest first because that is the order it matters in: the decision most likely to be contradicted
 * is the most recent one about the same lift, and a model reading a long list weighs the top of it
 * most. `forExercise` narrows to one lift's own history when that is the question being asked.
 */
export function recentDecisions(
  log: CoachDecision[] | undefined,
  opts: { limit?: number; forExercise?: string } = {},
): CoachDecision[] {
  const all = [...(log ?? [])].reverse();
  const scoped = opts.forExercise ? all.filter((d) => d.ex === opts.forExercise) : all;
  return opts.limit != null ? scoped.slice(0, opts.limit) : scoped;
}
