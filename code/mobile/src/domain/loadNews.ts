/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT CHANGED ABOUT THIS BAR — the one thing the load cannot say on its own.
 *
 * ⛔ FOUNDER, 2026-08-04, on the set screen:
 *
 *   > *"We show how many reps were done, but we are not showing how much weight was lifted last
 *   > time."*
 *
 * He found the one that could mislead her. **"8 · 8 · 7 · 6" from last time means nothing without
 * the weight it was lifted at.** If last week was 32.5 kg and today is 34, a 7 today is BETTER than
 * an 8 was — and a row of reps with no load beside it would have told her she had gone backwards.
 *
 * ── ⚠️ AND THE ANSWER IS NOT LAST TIME'S WEIGHT ─────────────────────────────────────────────────
 * "32.5 last time" is a number she has to subtract from to get the fact. **`↑1.5` IS the fact**, and
 * the previous weight is recoverable from it if she ever wants it — which she can, in one tap, on
 * the edit wheel that opens on the load anyway. So the comparison rides on the load itself, where
 * the thing being compared already is, and it costs no vertical space at all.
 *
 * ── ⚠️ THE COMPARISON CHANGES WITH THE MOMENT, DELIBERATELY ─────────────────────────────────────
 * On the FIRST set it compares to last time; mid-lift it compares to the SET BEFORE, because a
 * Loop 1 correction is the change she has to act on right now — she is standing at a bar that needs
 * re-loading. Both are "what just changed about this bar", which is the only question a delta on a
 * hero can be answering, and **she is never shown both.**
 *
 * ── AND SILENCE IS THE COMMON CASE ──────────────────────────────────────────────────────────────
 * `null` on every set where nothing moved — which is most of them. Not a zero, not a dash: the line
 * is simply not there, and the screen gets quieter as the lift goes on. That is the same rule as
 * the change pill, the landing mark and the reasons: **state it when it is news.**
 *
 * Pure & I/O-free.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 


export interface LoadNews {
  direction: 'up' | 'down';
  /** How much it moved, always positive — the direction carries the sign. In KILOGRAMS. */
  deltaKg: number;
}

/**
 * ⚠️ ROUNDED BEFORE COMPARING. Loads come from plate maths and unit conversion, so two weights that
 * are the same weight can differ by 1e-13 — and a "↑0" on the hero of the set screen is worse than
 * no delta at all. Two decimals is finer than any plate in any gym.
 */
const round2 = (n: number) => Math.round(n * 100) / 100;

export function loadNews(opts: {
  /** What she is about to lift. `null` on a bodyweight lift — there is no load to compare. */
  currentLoadKg: number | null;
  /**
   * The load of the PREVIOUS set of this lift, this session. `null`/absent on the first set, which
   * is what makes this function pick the other comparison.
   */
  previousSetKg?: number | null;
  /** What she FINISHED on the last time she did this lift. Absent on a lift she has never done. */
  lastTimeKg?: number | null;
}): LoadNews | null {
  const cur = opts.currentLoadKg;
  if (cur == null || !Number.isFinite(cur)) return null;

  /*
   * Mid-lift wins when it exists. A correction is a thing that happened thirty seconds ago and
   * requires her to change the bar; last week's weight is context. Context never outranks an
   * instruction on a screen she is reading between sets.
   */
  const against =
    opts.previousSetKg != null && Number.isFinite(opts.previousSetKg)
      ? opts.previousSetKg
      : opts.lastTimeKg != null && Number.isFinite(opts.lastTimeKg)
        ? opts.lastTimeKg
        : null;
  if (against == null) return null;

  const delta = round2(cur) - round2(against);
  if (delta === 0) return null;
  return { direction: delta > 0 ? 'up' : 'down', deltaKg: Math.abs(round2(delta)) };
}

/**
 * Whether the per-side figure is worth a line right now.
 *
 * ⛔ FOUNDER, 2026-08-04, asked whether it should stay at all. It stays — his own ruling is that
 * *"the display is in the equipment's native unit; the athlete never calculates"*, and deleting it
 * puts `(34 − 20) ÷ 2` back in her head at the rack.
 *
 * But **it is not news on every set.** She loads the bar once; on sets two, three and four it is a
 * fact she acted on five minutes ago, occupying a row on the smallest screen in the product.
 *
 * ⚠️ AND THE SECOND CONDITION IS WHAT MAKES THIS CORRECT RATHER THAN MERELY TIDY: when Loop 1 moves
 * the load mid-exercise the bar has to be re-loaded, and the per-side figure is the most useful line
 * on the screen. It comes back for exactly that set.
 */
export function showsPerSide(opts: { setNumber: number; news: LoadNews | null }): boolean {
  return opts.setNumber <= 1 || opts.news != null;
}
