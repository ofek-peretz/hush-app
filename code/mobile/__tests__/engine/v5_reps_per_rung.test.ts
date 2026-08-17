/**
 * Engine v5 — reps-per-rung: the estimator that answers "how far do I move the load?"
 *
 * Four declared constants live in this one function and nowhere else, and each is a promise about
 * what the engine will REFUSE to conclude:
 *
 *  · **F-11 — the rest-band width.** Two sets are like-for-like only if their rest is within 45 s
 *    (L3). A set done after a three-minute breather is not evidence about a set done after 45 s.
 *  · **F-12 — the minimum like-for-like pairs.** Below it there is no fitted slope at all, and the
 *    move falls back to **B-5**, which is priced from the e1RM model the app already displays —
 *    still no invented slope, but no longer a flat rung either (revised 2026-08-16; see the B-5
 *    block below for the founder's reading and what it measured).
 *  · **F-16 — where the load–rep continuum ends.** Past twenty reps the set is limited by endurance
 *    rather than by the weight, so more reps are not more evidence about iron.
 *  · **F-8 — the recency window.** The fit reads her most recent `RECENCY_WINDOW_SESSIONS` sessions
 *    of the lift. Older history is not "her number today."
 *  · **F-13 — Theil–Sen**, the median of all pairwise slopes: one named algorithm, so identical
 *    inputs give an identical answer (I-24) and a single wild set cannot drag the fit.
 */
// @ts-nocheck

// 

import { repsPerRung, rungsForHeadroom, bootstrapPerRung } from '@/engine/v5/repsPerRung';
import { RECENCY_WINDOW_SESSIONS, REST_BAND_WIDTH_S, MIN_PAIRS_FOR_SLOPE, BOOTSTRAP_RUNGS_PER_MOVE, EPLEY_VALID_REPS } from '@/engine/v5/constants';
import type { SetPerf, SessionRecord, ExerciseMeta } from '@/engine/v5/types';

const bb: ExerciseMeta = { equipment: 'barbell', bodyweight: false };
const S = (load: number, reps: number, rest = 90): SetPerf => ({ load, reps, restBeforeS: rest, isApproach: false });
const rec = (sets: SetPerf[]): SessionRecord => ({ load: sets[0].load!, sets });

/**
 * A clean −1 rep per 2.5 kg ladder at one steady rest: plenty of pairs, one honest slope.
 *
 * SPREAD ACROSS OCCURRENCES (2026-07-27), because that is how the evidence actually accrues and
 * because the fit now refuses within-occurrence pairs. Inside ONE session the load only moves when
 * Loop 1 corrects it, and a corrected pair carries the session's accumulated fatigue alongside the
 * load change — the two are confounded, and in the direction Loop 1 corrects most often (down) the
 * confound INVERTS the slope. The rungs are the same four; they are simply four days, not four sets.
 */
const ladder = (rest = 90): SetPerf[] => [S(60, 12, rest), S(62.5, 11, rest), S(65, 10, rest), S(67.5, 9, rest)];

/** The same ladder as her HISTORY — one rung per occurrence, newest first. */
const ladderSessions = (rest = 90): SessionRecord[] => ladder(rest).map((set) => rec([set]));

describe('F-13 · Theil–Sen — one named estimator, and a single wild set cannot drag it', () => {
  it('fits her real slope: −1 rep per 2.5 kg rung on a barbell', () => {
    const perRung = repsPerRung([], ladderSessions(), bb);
    expect(perRung).toBeCloseTo(1, 5); // one rung (2.5 kg) costs one rep
  });

  it('the same input twice gives the same number (I-24 determinism)', () => {
    expect(repsPerRung([], ladderSessions(), bb)).toBe(repsPerRung([], ladderSessions(), bb));
  });

  it('one absurd set does not move the median of the pairwise slopes', () => {
    const clean = repsPerRung([], ladderSessions(), bb)!;
    const withLie = repsPerRung([], [...ladderSessions(), rec([S(70, 40)])], bb)!;
    expect(Math.abs(withLie - clean)).toBeLessThan(0.5); // the mis-key is outvoted, not obeyed
  });
});

describe('F-11 · the rest band — a set rested very differently is not evidence about this one', () => {
  it('sets straddling the band produce no fit; the same sets inside it do', () => {
    // Alternating 30 s / 300 s rest: every pair is > 45 s apart, so NOTHING is like-for-like.
    const straddling = [S(60, 12, 30), S(62.5, 11, 300), S(65, 10, 30), S(67.5, 9, 300)].map((set) => rec([set]));
    expect(repsPerRung([], straddling, bb)).toBeNull();
    expect(repsPerRung([], ladderSessions(90), bb)).not.toBeNull(); // identical loads/reps, one steady rest
  });

  it('a difference of exactly the band width still counts — the guard excludes only what exceeds it', () => {
    const atTheEdge = [S(60, 12, 60), S(62.5, 11, 60 + REST_BAND_WIDTH_S), S(65, 10, 60), S(67.5, 9, 60 + REST_BAND_WIDTH_S)].map((set) => rec([set]));
    expect(repsPerRung([], atTheEdge, bb)).not.toBeNull();
  });

  it('a set whose rest was never recorded is left out of the fit entirely', () => {
    const unknownRest: SetPerf[] = [{ load: 60, reps: 12, restBeforeS: undefined, isApproach: false }, { load: 62.5, reps: 11, restBeforeS: undefined, isApproach: false }];
    expect(repsPerRung(unknownRest, [], bb)).toBeNull();
  });
});

describe('F-12 / B-5 · below the evidence gate there is no fitted slope — the model prices the move', () => {
  it('too few like-for-like pairs → null, and with nothing to price the step it is B-5\'s one rung', () => {
    const thin = [S(60, 12), S(62.5, 11)]; // 1 pair, below MIN_PAIRS_FOR_SLOPE
    expect(MIN_PAIRS_FOR_SLOPE).toBeGreaterThan(1);
    expect(repsPerRung(thin, [], bb)).toBeNull();
    // No fitted slope AND no modelled one (no load to price a rep against) → the flat rung stands.
    expect(rungsForHeadroom(9, null)).toBe(BOOTSTRAP_RUNGS_PER_MOVE);
  });

  it('with a fitted slope the move sizes itself to her number, never below one rung', () => {
    const perRung = repsPerRung([], ladderSessions(), bb)!;
    expect(rungsForHeadroom(3, perRung)).toBe(3); // 3 reps of headroom at 1 rep/rung → 3 rungs
    expect(rungsForHeadroom(0.2, perRung)).toBe(1); // …and never zero
  });

  /*
   * ⛔ B-5, DERIVED (founder 2026-08-16): *"if a trainee performed 20 reps or 12 we raise them the
   * same."* Before this, both moved one rung and so did a 1-rep miss. The bootstrap is now priced
   * from the e1RM model the app already displays, so the SIZE of the miss reaches the iron on day
   * one — and the two directions round opposite ways, because the two errors are not the same size.
   */
  describe('B-5 · the size of the miss moves the load, before any slope is fitted', () => {
    const band = { lo: 8, hi: 10 };
    // A 10 kg dumbbell: the default rung is 1 kg, and one rep of headroom at the top of her band is
    // worth 10/(30+10) = 0.25 kg — so a rung costs her 4 reps.
    const up = bootstrapPerRung(10, band.hi, { equipment: 'dumbbell', bodyweight: false });
    const down = bootstrapPerRung(10, band.lo, { equipment: 'dumbbell', bodyweight: false });

    it('the modelled slope is the rung divided by what one rep of headroom costs', () => {
      expect(up).toBeCloseTo(4, 6); //  1 kg rung ÷ (10/(30+10)) kg per rep
      expect(down).toBeCloseTo(3.8, 6); // 1 kg rung ÷ (10/(30+8))
    });

    it('a 20-rep set and a 12-rep set no longer raise the load by the same amount', () => {
      expect(rungsForHeadroom(12 - band.hi, null, 'up', up)).toBe(1); // 2 reps over → still one rung
      expect(rungsForHeadroom(20 - band.hi, null, 'up', up)).toBe(2); // 10 reps over → two
    });

    it('and a 1-rep set and a 7-rep set no longer drop it by the same amount', () => {
      expect(rungsForHeadroom(band.lo - 7, null, 'down', down)).toBe(1); // 1 rep short → one rung
      expect(rungsForHeadroom(band.lo - 1, null, 'down', down)).toBe(2); // 7 reps short → two
    });

    it('the rounding is asymmetric — a raise rounds down, a drop rounds up', () => {
      // The same 5 reps of headroom against the same modelled slope, read each way.
      expect(rungsForHeadroom(5, null, 'up', 4)).toBe(1); // floor(1.25)
      expect(rungsForHeadroom(5, null, 'down', 4)).toBe(2); // ceil(1.25) — the lighter rung
    });

    it('F-16 · past the end of the continuum, extra reps are not more evidence', () => {
      // 20 reps and 60 reps (a mis-key) read the same: the headroom is taken at the edge.
      expect(rungsForHeadroom(EPLEY_VALID_REPS, null, 'up', up)).toBe(
        rungsForHeadroom(EPLEY_VALID_REPS * 3, null, 'up', up),
      );
    });

    it('it scales with the equipment, because it is a proportion of her load', () => {
      // The same 10-rep overshoot on a 60 kg barbell (2.5 kg rungs) — the model still lands on the
      // load that makes it a 10-rep set: 60 × (1+20/30) / (1+10/30) = 75 kg, six 2.5 kg rungs up.
      const bbUp = bootstrapPerRung(60, band.hi, { equipment: 'barbell', bodyweight: false });
      expect(rungsForHeadroom(20 - band.hi, null, 'up', bbUp)).toBe(6);
    });

    it('a step the model cannot price falls back to the flat rung', () => {
      expect(bootstrapPerRung(0, band.hi, { equipment: 'dumbbell', bodyweight: false })).toBeNull();
      expect(bootstrapPerRung(null, band.hi, { equipment: 'dumbbell', bodyweight: false })).toBeNull();
      // bodyweight has no rung at all
      expect(bootstrapPerRung(10, band.hi, { equipment: 'bodyweight', bodyweight: true })).toBeNull();
      expect(rungsForHeadroom(12, null, 'up', null)).toBe(BOOTSTRAP_RUNGS_PER_MOVE);
    });
  });
});

describe('F-8 · the recency window — old history is not her number today', () => {
  it('sessions beyond the window do not enter the fit', () => {
    // The window is filled with one flat load at a rest far outside the band, so the filler can pair
    // with nothing (same load with itself, F-11-excluded from the ladder) and the ONLY thing that can
    // produce a slope is the ladder — which sits just past the window's edge. If F-8 were ignored, the
    // ladder would be read and a slope returned.
    const filler: SessionRecord[] = Array.from({ length: RECENCY_WINDOW_SESSIONS }, () => rec([S(60, 10, 300)]));
    const stale: SessionRecord[] = ladderSessions();
    expect(repsPerRung([], [...filler, ...stale], bb)).toBeNull();
    // Move the same ladder INSIDE the window and the very same data now fits.
    expect(repsPerRung([], [...filler.slice(0, RECENCY_WINDOW_SESSIONS - stale.length), ...stale], bb)).not.toBeNull();
  });
});

describe('L3 · a pair must come from two different occurrences', () => {
  it('a within-session ladder produces NO fit, however clean it looks', () => {
    // Four rungs inside one session is not four measurements of the load response — it is one
    // measurement plus the session's own accumulating fatigue, and the two cannot be separated.
    expect(repsPerRung(ladder(), [], bb)).toBeNull();
  });

  it('the Loop-1 easing pair — less weight AND fewer reps — is refused outright', () => {
    // The dangerous shape, isolated: Loop 1 eased her mid-session and fatigue took the reps down
    // WITH the load, so as a pair it reads as a POSITIVE slope. Unchecked, pairs like this drag the
    // median toward zero, shrink perRung, and — since a move is headroom ÷ perRung — make every
    // later correction BIGGER than her real number warrants. It is not down-weighted; it is refused.
    expect(repsPerRung([S(40, 9), S(37.5, 7)], [], bb)).toBeNull();
  });

});
