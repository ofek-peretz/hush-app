/**
 * Engine v5 — reps-per-rung: the estimator that answers "how far do I move the load?"
 *
 * Four declared constants live in this one function and nowhere else, and each is a promise about
 * what the engine will REFUSE to conclude:
 *
 *  · **F-11 — the rest-band width.** Two sets are like-for-like only if their rest is within 45 s
 *    (L3). A set done after a three-minute breather is not evidence about a set done after 45 s.
 *  · **F-12 — the minimum like-for-like pairs.** Below it there is no fitted slope at all, and the
 *    move falls back to **B-5**: ONE cautious rung, tested by the next set. No invented slope ever
 *    moves iron.
 *  · **F-8 — the recency window.** The fit reads her most recent `RECENCY_WINDOW_SESSIONS` sessions
 *    of the lift. Older history is not "her number today."
 *  · **F-13 — Theil–Sen**, the median of all pairwise slopes: one named algorithm, so identical
 *    inputs give an identical answer (I-24) and a single wild set cannot drag the fit.
 */
import { repsPerRung, rungsForHeadroom } from '@/engine/v5/repsPerRung';
import { RECENCY_WINDOW_SESSIONS, REST_BAND_WIDTH_S, MIN_PAIRS_FOR_SLOPE, BOOTSTRAP_RUNGS_PER_MOVE } from '@/engine/v5/constants';
import type { SetPerf, SessionRecord, ExerciseMeta } from '@/engine/v5/types';

const bb: ExerciseMeta = { equipment: 'barbell', bodyweight: false };
const S = (load: number, reps: number, rest = 90): SetPerf => ({ load, reps, restBeforeS: rest, isApproach: false });
const rec = (sets: SetPerf[]): SessionRecord => ({ load: sets[0].load!, sets });

/** A clean −1 rep per 2.5 kg ladder at one steady rest: plenty of pairs, one honest slope. */
const ladder = (rest = 90): SetPerf[] => [S(60, 12, rest), S(62.5, 11, rest), S(65, 10, rest), S(67.5, 9, rest)];

describe('F-13 · Theil–Sen — one named estimator, and a single wild set cannot drag it', () => {
  it('fits her real slope: −1 rep per 2.5 kg rung on a barbell', () => {
    const perRung = repsPerRung(ladder(), [], bb);
    expect(perRung).toBeCloseTo(1, 5); // one rung (2.5 kg) costs one rep
  });

  it('the same input twice gives the same number (I-24 determinism)', () => {
    expect(repsPerRung(ladder(), [], bb)).toBe(repsPerRung(ladder(), [], bb));
  });

  it('one absurd set does not move the median of the pairwise slopes', () => {
    const clean = repsPerRung(ladder(), [], bb)!;
    const withLie = repsPerRung([...ladder(), S(70, 40)], [], bb)!;
    expect(Math.abs(withLie - clean)).toBeLessThan(0.5); // the mis-key is outvoted, not obeyed
  });
});

describe('F-11 · the rest band — a set rested very differently is not evidence about this one', () => {
  it('sets straddling the band produce no fit; the same sets inside it do', () => {
    // Alternating 30 s / 300 s rest: every pair is > 45 s apart, so NOTHING is like-for-like.
    const straddling = [S(60, 12, 30), S(62.5, 11, 300), S(65, 10, 30), S(67.5, 9, 300)];
    expect(repsPerRung(straddling, [], bb)).toBeNull();
    expect(repsPerRung(ladder(90), [], bb)).not.toBeNull(); // identical loads/reps, one steady rest
  });

  it('a difference of exactly the band width still counts — the guard excludes only what exceeds it', () => {
    const atTheEdge = [S(60, 12, 60), S(62.5, 11, 60 + REST_BAND_WIDTH_S), S(65, 10, 60), S(67.5, 9, 60 + REST_BAND_WIDTH_S)];
    expect(repsPerRung(atTheEdge, [], bb)).not.toBeNull();
  });

  it('a set whose rest was never recorded is left out of the fit entirely', () => {
    const unknownRest: SetPerf[] = [{ load: 60, reps: 12, restBeforeS: null, isApproach: false }, { load: 62.5, reps: 11, restBeforeS: null, isApproach: false }];
    expect(repsPerRung(unknownRest, [], bb)).toBeNull();
  });
});

describe('F-12 / B-5 · below the evidence gate there is no slope — one cautious rung instead', () => {
  it('too few like-for-like pairs → null, and the move is B-5', () => {
    const thin = [S(60, 12), S(62.5, 11)]; // 1 pair, below MIN_PAIRS_FOR_SLOPE
    expect(MIN_PAIRS_FOR_SLOPE).toBeGreaterThan(1);
    expect(repsPerRung(thin, [], bb)).toBeNull();
    expect(rungsForHeadroom(9, null)).toBe(BOOTSTRAP_RUNGS_PER_MOVE); // a big overshoot still moves ONE rung
  });

  it('with a fitted slope the move sizes itself to her number, never below one rung', () => {
    const perRung = repsPerRung(ladder(), [], bb)!;
    expect(rungsForHeadroom(3, perRung)).toBe(3); // 3 reps of headroom at 1 rep/rung → 3 rungs
    expect(rungsForHeadroom(0.2, perRung)).toBe(1); // …and never zero
  });
});

describe('F-8 · the recency window — old history is not her number today', () => {
  it('sessions beyond the window do not enter the fit', () => {
    // The window is filled with one flat load at a rest far outside the band, so the filler can pair
    // with nothing (same load with itself, F-11-excluded from the ladder) and the ONLY thing that can
    // produce a slope is the ladder — which sits just past the window's edge. If F-8 were ignored, the
    // ladder would be read and a slope returned.
    const filler: SessionRecord[] = Array.from({ length: RECENCY_WINDOW_SESSIONS }, () => rec([S(60, 10, 300), S(60, 10, 300)]));
    const stale: SessionRecord[] = [rec(ladder())];
    expect(repsPerRung([], [...filler, ...stale], bb)).toBeNull();
    // Move the same ladder INSIDE the window and the very same data now fits.
    expect(repsPerRung([], [...filler.slice(0, RECENCY_WINDOW_SESSIONS - 1), ...stale], bb)).not.toBeNull();
  });
});
