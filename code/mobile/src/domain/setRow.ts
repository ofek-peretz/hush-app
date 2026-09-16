/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LIFT, IN FIGURES — what she has done, against what she did last time.
 *
 * ⛔ FOUNDER, 2026-08-04, on the set stage: *"during a workout everything has to be maximally clear
 * on the screen. So there can't be a lot of copy and certainly not small type — everything has to be
 * clear and exact in how it is laid out."*
 *
 * That ruling killed two things on that screen and this replaces both.
 *
 *   · THE REP BAND GRAPHIC — 250 px of rule, two ticks and a legend, to say "6 to 8". At arm's
 *     length the graphic carries nothing the two digits do not, and it was spending the widest
 *     element on the stage to do it. It is a number now.
 *   · "LAST TIME · 4 DAYS AGO · 57.5 KG · 8·8·7·6" — a ten-point line at the foot of the screen,
 *     which is the exact type he was objecting to, holding the one comparison that matters.
 *
 * What stands there instead is a row of large figures: her sets this session, with LAST TIME'S
 * directly beneath them. Eight digits carry the whole lift, and the comparison is in place rather
 * than in a sentence — she can see she is a rep down on set 2 without a word being written.
 *
 * ── ⚠️ WHY THE SLOTS ARE THE SET NUMBERS ────────────────────────────────────────────────────────
 * Nothing is labelled. Position IS the set number, which is what lets "SET 3 OF 4" be deleted as
 * well: a row of four with two filled says it larger, and says what happened in them too.
 *
 * Pure & I/O-free, and tested directly, because the interesting cases are the ones a live session
 * cannot be asked to produce — a lift she has never done, a week where the coach changed the set
 * count, and reps landing outside a band that no correction followed.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

// 


/** Where a set's reps fell against her band. The same three the landing mark draws. */
export type SetLanding = 'in' | 'above' | 'below';

export interface SetSlot {
  /** Reps she did this session, or null while the set is still ahead of her. */
  reps: number | null;
  /**
   * Where those reps landed. `null` when the set is not done, and ALSO when there is no band —
   * a hold, a distance, a bodyweight prescription with no window. An absent band must read as
   * "no verdict", never as "landed in".
   */
  landing: SetLanding | null;
  /** The same set, the last time she did this lift. null when that session had no such set. */
  ghost: number | null;
  /** The set she is standing in now. */
  current: boolean;
}

export function landingOf(reps: number, band: [number, number] | null | undefined): SetLanding | null {
  if (!band) return null;
  const [lo, hi] = band;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return null;
  /*
   * ⚠️ THE EDGES ARE INSIDE. Loop 1 corrects on `< lo` and `> hi`, so a set at exactly Tlo met the
   * contract and a set at exactly Thi did too. A row that disagreed with the engine by one rep would
   * be worse than no row at all.
   */
  if (reps < lo) return 'below';
  if (reps > hi) return 'above';
  return 'in';
}

export function setRow(opts: {
  /** How many sets this exercise has today. */
  totalSets: number;
  /** Which one she is on, 0-based. */
  currentSetIndex: number;
  /**
   * Reps she has already logged for this lift THIS session, in order.
   *
   * ⚠️ OPTIONAL, AND THAT IS DELIBERATE. `SessionView.setsSoFar` is a required field, so the app
   * cannot omit it — but five render fixtures build a session object by hand and one of them will
   * always be missing the newest field. A pure function that throws on an absent array turns that
   * into a crash on the set stage, and this screen is the one place a crash is unforgivable.
   */
  done?: number[];
  /** Her immutable band, or null on a step that has none. */
  band?: [number, number] | null;
  /** Every set's reps the last time she did this lift, in order. */
  lastReps?: number[];
}): SetSlot[] {
  const total = Math.max(0, Math.floor(opts.totalSets));
  const done = opts.done ?? [];
  const last = opts.lastReps ?? [];
  return Array.from({ length: total }, (_, i) => {
    /*
     * ⚠️ READ BY POSITION, NOT BY COUNT. `done[i]` rather than "the first `done.length` slots are
     * full" — they are the same until a set is logged out of order or a swap resets the exercise
     * mid-way, and then the count silently fills the wrong slots.
     */
    const reps = i < done.length ? done[i] : null;
    return {
      reps,
      landing: reps == null ? null : landingOf(reps, opts.band),
      /*
       * ⚠️ AND LAST TIME MAY HAVE HAD A DIFFERENT NUMBER OF SETS. The coach changes set counts week
       * to week, so a ghost is simply absent past the end of that session rather than repeated,
       * padded, or squeezed into today's shape — inventing one would be the screen claiming she did
       * a set she never did.
       */
      ghost: i < last.length ? last[i] : null,
      current: i === opts.currentSetIndex,
    };
  });
}

/**
 * ⛔ THE SETS OF THE CURRENT BLOCK ONLY — not every set of this lift today.
 *
 * FOUND IN THE 2026-08-04 HERMETIC PASS. `setsSoFar` is every logged set whose exercise matches the
 * one on the stage, sorted by `setIndex` — and `setIndex` is the round WITHIN A BLOCK, so a lift the
 * coach split across two blocks restarts it at 0. Block two's row then drew block one's reps: three
 * figures that belong to work she finished twenty minutes earlier, presented as this block's.
 *
 * ⚠️ AND IT IS NOT HYPOTHETICAL. The founder's own note on the deleted effort question records it —
 * *"it fired once per BLOCK, so a lift the coach split across two blocks asked twice"* — so the plan
 * genuinely produces this shape.
 *
 * `blockId` cannot do the filtering: it is the BACKEND's id, optional, and absent on a coach-run
 * session. What is always true is the ORDER — the plan is executed front to back, so the current
 * block's sets are the trailing run that begins at the last `setIndex === 0`.
 */
export function currentBlockSets<T extends { setIndex: number }>(sets: T[]): T[] {
  let start = 0;
  for (let i = 0; i < sets.length; i += 1) if (sets[i].setIndex === 0) start = i;
  return sets.slice(start);
}

/**
 * ════ THE BAND, DERIVED ONCE ════
 *
 * ⛔ FOUNDER, 2026-08-05, from a photograph of "SET 3 OF 4 LOGGED · 47 kg × 16 · Set recorded."
 *
 * Sixteen reps against a band of eight to ten, and the screen had no comment. He read that as the
 * landing verdict never having been built. It WAS built — all three states, on 2026-08-04 — and it
 * never fired, because **the beat and the stage derived the band by two different ladders.**
 *
 *   the stage    `repBandLo ?? recommendedReps ?? 8`, then `repBandHi ?? lo`
 *   the beat     `repBandLo != null && repBandHi != null`, or NO BAND AT ALL
 *
 * A coach that prescribes a fixed count writes `reps: [10]`, so `repBandHi` is undefined. The stage
 * drew "× 10" perfectly happily and the beat, one screen later, decided there was no band to land
 * in and fell through to the readback. **Two ladders for one fact, and the shorter one won on the
 * screen that mattered.**
 *
 * So there is one ladder and it lives here. A fixed count is a band of a number to itself, which is
 * what `bandPlacement` already handles — the dot lands mid-span and the load holds.
 */
export function bandOf(
  target: { recommendedReps?: number | null; repBandLo?: number | null; repBandHi?: number | null } | null | undefined,
): [number, number] | null {
  if (!target) return null;
  const lo = target.repBandLo ?? target.recommendedReps ?? null;
  if (lo == null || !Number.isFinite(lo)) return null;
  const hi = target.repBandHi ?? lo;
  return [lo, Math.max(lo, hi)];
}
