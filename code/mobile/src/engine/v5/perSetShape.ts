/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HUSH ENGINE v5 — WHAT SHE CAN LIFT ON *THIS* SET.
 *
 * ⛔ FOUNDER, 2026-08-16: *"שהמנוע ידע בדיוק מה היכולות של המתאמן וכמה הוא מסוגל להרים בכל תרגיל
 * ובכל סט."*
 *
 * ── THE GAP THIS CLOSES, MEASURED ───────────────────────────────────────────────────────────────
 * `fixtureModel.sessionTargets` computes ONE weight and ONE rep target per exercise and copies it
 * across every set of the slot. Her body does not copy across. Over 1,586 graded sets
 * (`__tests__/audit/thePrescriptionIsAccurate`):
 *
 *     set 1   in band 39.4%   under  8.7%   OVER  51.8%    ← fresh, and the load was set for later
 *     set 2   in band 62.9%
 *     set 3   in band 64.6%
 *     set 4   in band 59.9%   UNDER 32.9%   over   7.2%    ← tired, and the load has not moved
 *
 * Half of every first set is above her band and a third of every fourth set is below it, **from the
 * same correct number**. No improvement in load accuracy can close that; only a per-set load can.
 *
 * ── AND IT IS THE PROXIMITY-TO-FAILURE SIGNAL, WITHOUT ASKING HER ────────────────────────────────
 * The founder refused RIR, and was right to: it is a self-reported latent variable, the one kind of
 * input this engine has systematically purged, and untrained lifters misjudge it by three to five
 * reps in a single direction. But the signal it was wanted for is already in the log:
 *
 *     10 / 10 / 10 / 10 at one load  →  she was nowhere near failure
 *     10 /  9 /  8 /  7 at one load  →  she was
 *
 * The DECAY ACROSS SET POSITIONS is a measurement of how hard the work actually was, and it costs
 * her no taps and carries no ego. This module is that measurement, read as a prescription.
 *
 * ── THE METHOD: ONE e1RM PER SET POSITION ───────────────────────────────────────────────────────
 * No decay curve, no fatigue coefficient, no new constant. Her set-1 sets have an e1RM; her set-4
 * sets have a smaller one. Each position is fitted independently with the SAME estimator the app
 * already displays (`loadMath.epley`), and each position is then prescribed the load that puts THAT
 * position at the middle of her band (`loadForReps`). The descent falls out of her own data.
 *
 * ── ⛔⛔ NOT WIRED — AND THE REASON IS NOT THE ONE ANYONE EXPECTED (2026-08-16) ──────────────────
 *
 * Five wirings were built and measured. The first four each failed for a real, separate mechanism,
 * and all four are worth knowing before a sixth is attempted:
 *
 *     baseline (flat load)                            in band 56.1%
 *     1 · raw ramp, straight into Loop 2                      53.1%
 *     2 · + factors normalised to mean 1                      40.9%
 *     3 · + un-ramp before Loop 2 reads                       38.2%
 *     4 · + un-ramp about the ramp's MEAN, nearest-rung       47.1%
 *     5 · + one POOLED decay rate instead of k free ones      44.7%
 *
 * **1 — the anchor ate it.** L10's anchor is the median of the loads that met `Tlo`, written when
 * every set of a lift shared one load. Give Loop 2 a ramp and the median lands mid-ramp; the next
 * occurrence rebuilds around it and the load walks down a rung a session.
 *
 * **2 — the ramp descended from the wrong centre.** `base` is not position 0's load; Loop 2
 * calibrated it against the whole exercise, so it already sits mid-ramp. Multiplying by factors ≤ 1
 * is a load cut, and 49.2% of sets finished above the band.
 *
 * **3 — the two halves were centred differently.** Un-ramping to position 0 while centring the ramp
 * on the mean multiplies `base` by `f₀` EVERY fold — about 3% a session, compounding. That is a
 * runaway, and it was mistaken for an instability at the time.
 *
 * **4 — snapping leaked.** `snapDown` is always downward, so the ramp's mean sat under `base` and
 * drifted. Nearest-rung snapping makes the error symmetric.
 *
 * **5 — the shape was estimated far too noisily.** One e1RM per position is k free parameters off
 * one sample per occurrence; reps carry ±0.8 of ordinary noise and a factor is a RATIO of two such
 * estimates. A traced leg press fitted a 19% ramp where her true decay was 6%. Pooling every
 * (occurrence, position) pair into ONE rate is the right estimator and is what this file now does.
 *
 * ── ⛔ AND THEN THE CONTROLLED EXPERIMENT SAID THE PREMISE WAS WRONG ─────────────────────────────
 * Running the board with Loop 1 switched off isolates the shape from the in-session corrector:
 *
 *                       Loop 1 ON     Loop 1 OFF
 *       ramp OFF          56.1%          39.5%
 *       ramp ON           44.7%          37.9%
 *
 * The ramp DOES what it was built to do: with Loop 1 off it flattens the profile exactly as
 * intended — 37.6 / 39.8 / 37.8 / 35.1 across the four sets, against 30.5 / 38.9 / 47.0 / 47.5
 * without it. The set-1-to-set-4 skew is gone. **And the total does not move** (39.5% → 37.9%).
 *
 * Equalising the sets redistributes the misses; it does not remove them. Each set's error is
 * dominated not by its POSITION but by how wrong `base` is — and by the rung quantum, which on a
 * 2.5 kg barbell rung at 60 kg is already ±0.8 reps, most of a two-rep band on its own. Loop 1 is
 * worth 16.6 points because it corrects `base` from evidence, in-session, which is the error that
 * actually matters. The ramp then fights it: two controllers moving one load inside one session.
 *
 * ── ⛔⛔ THE ORACLE, AND WHY ITS ANSWER IS NOT THE PRODUCT'S ANSWER (2026-08-16) ─────────────────
 * The paragraph here briefly read *"the per-set spread is NOT the lever"*, then was rewritten to say
 * the opposite on the strength of an oracle, and the oracle was then tested against the live engine.
 * All three steps are kept, because the mistake in the middle is the instructive part.
 *
 * Scoring 1,969 real sets against an engine handed her exact capacity:
 *
 *       perfect knowledge, ONE load per lift .....  63.0%
 *       perfect base + the TRUE fatigue ramp .....  72.0%     ← "a ramp is worth +9"
 *       perfect knowledge, a load per SET ........  83.7%
 *       …with no equipment rungs at all ..........  88.7%     ← physics, not ours
 *
 * ⛔ THAT ORACLE HAS NO LOOP 1 IN IT, AND THAT IS THE WHOLE ERROR. It compares one FIXED load per
 * exercise against per-set loads — but this engine does not deliver a fixed load per exercise.
 * Measured on the same runs: **Loop 1 moves the load inside 57.6% of occurrences, by 2.25 kg on
 * average.** The architecture is already per-set; it is REACTIVE rather than predictive, and the
 * live per-set profile proves it — 40.4 / 65.8 / 65.6 / 68.1 RISES after set 1, which no fixed load
 * against a fatiguing body can do.
 *
 * So the ramp was wired a sixth time and measured, with the true decay and both centrings:
 *
 *       flat (today) ...........  58.3%      s1 40.4  s2 65.8  s3 65.6  s4 68.1
 *       centred ramp · 0.8 .....  53.2%      s1 43.7  s2 60.3  s3 55.5  s4 55.7
 *       anchored ramp · 0.8 ....  53.1%      s1 40.0  s2 61.7  s3 58.3  s4 53.4
 *       anchored · 0.5 / 0.3 ...  50.5 / 46.5%
 *
 * Every arm loses, and it loses on the LATE sets — precisely where Loop 1 has already acted. A
 * predictive ramp lowers what the reactive one has just lowered.
 *
 * ⚠️ AND THE OBVIOUS REMEDY FOR SET 1 WAS TESTED TOO, IN LOOP 2 RATHER THAN HERE. Set 1 is light
 * because S-22 prices the raise from `worstReps`, the most fatigued set. Pricing it from the FIRST
 * set instead makes set 1 worse (40.4% → 34.0%, board 58.3% → 54.6%): a bigger raise more often
 * leaves some set short of Tlo, `allMet` goes false, and the lift holds or backs off. The
 * conservative reading is what keeps the load climbing at all. That note now sits in `loop2`.
 *
 * ── ⛔ 2026-09-10 — THE BASE WAS FIXED, THREE WAYS, AND THE BOARD MOVED 38.5% → 63.5% ────────────
 * The formula report reopened this file's question and a trace answered it in one line per lift:
 * the seed opened at her fresh 8RM (B-10 now errs one rung light), a clear with set 4 exactly on Tlo
 * triggered a raise set 4 then failed (F-21 now wants one rep of headroom), and a two-rep band was
 * narrower than a rung and than the fatigue across four sets (the default is 8–12 now). All three
 * are BASE and BAND fixes, exactly as the paragraph below predicted; the shape stayed unwired.
 *
 * ⚠️ SO THIS MODULE STAYS BUILT AND UNWIRED, AND THE FILE IS NO LONGER WAITING FOR A SIXTH IDEA.
 * The per-set spread is real and it is ALREADY being closed, by Loop 1, from evidence. What is left
 * of it is set 1 — the one position no in-session corrector can reach, because it is the evidence.
 * Closing that needs a better BASE, which is Loop 2's problem and B-1b's, not a shape's.
 *
 * Pure. Reads no wall-clock, no RNG (I-24/25).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { Band, ExerciseMeta, SessionRecord } from './types';
import { median } from './stats';
import { snapDown, nextRung } from './grid';
import { epley } from '@/engine/loadMath';
import { RECENCY_WINDOW_SESSIONS, MIN_PER_SET_SAMPLES } from './constants';

/**
 * Her demonstrated e1RM at ONE position in the exercise (set 1, set 2, …), or null when too few
 * occurrences have reached that position.
 *
 * ⚠️ ONE SAMPLE PER OCCURRENCE, never one per set. Two sets at the same position from the same
 * session do not exist, but a lift trained twice a week would otherwise let a single heavy week
 * outvote a month — the same discipline `repsPerRung` applies for the same reason (L3).
 */
export function e1rmAtPosition(history: SessionRecord[], position: number): number | null {
  const samples: number[] = [];
  for (const rec of history.slice(0, RECENCY_WINDOW_SESSIONS)) {
    const s = rec.sets[position];
    if (!s || s.isApproach) continue;
    if (s.load == null || s.load <= 0 || s.reps <= 0) continue;
    samples.push(epley(s.load, s.reps));
  }
  if (samples.length === 0) return null;
  return median(samples);
}

/**
 * ════ THE SHAPE OF THE EXERCISE — one factor per position, relative to position 0 ════
 *
 * `factor[i]` is what her demonstrated capacity at position `i` is worth as a FRACTION of her
 * capacity at position 0. `factor[0]` is always 1. A lift she has never tired on returns all ones.
 *
 * ⛔ THIS IS THE PIECE THAT LETS A RAMP EXIST WITHOUT REWRITING LOOP 2, and it is the whole design.
 * If the prescription is `load_i = base × factor[i]`, then dividing a performed load by the same
 * factor recovers `base` — so the engine can be handed back exactly the single coherent load it has
 * always read. L10's anchor stays a median of comparable numbers, `metTlo` stays a comparison
 * against one contract, and the mis-key protection is untouched. **The ramp lives only between the
 * prescription and the log.**
 *
 * The first attempt (2026-08-16) skipped this and fed Loop 2 the raw ramp. The anchor — the median
 * of the loads that met `Tlo` — landed mid-ramp, and the load walked itself down a rung a session.
 *
 * ⚠️ MONOTONE BY CONSTRUCTION. A later position fitted stronger than an earlier one is noise (a week
 * where Loop 1 dropped set 1), and a factor that rose would ask her to add weight as she tires — and
 * would then un-normalise into a load she never lifted.
 */
export function decayFactors(history: SessionRecord[], setCount: number): number[] {
  const ones = Array.from({ length: setCount }, () => 1);
  if (setCount <= 0) return ones;

  /*
   * ⛔⛔ ONE RATE, POOLED — NOT ONE e1RM PER POSITION. This is the difference between a ramp that
   * helps and a ramp that hurts, and it is a question about VARIANCE, not about the model.
   *
   * Fitting each position independently gave the shape k free parameters, each estimated from ONE
   * sample per occurrence (a fourth set happens once a session, not once a set). Reps are integers
   * carrying about ±0.8 of ordinary noise, so each position's e1RM was worth roughly its own noise
   * — and the factor is a RATIO of two of them, which compounds it. Traced on a real leg press:
   *
   *     occ 9   92.5 kg(8)   92.5 kg(7)   80 kg(11)   75 kg(12)
   *
   * — a 19% ramp where her true decay was about 6%. Sets 3 and 4 fell so far that she sailed past
   * the band on both, which is the opposite of the defect this exists to close.
   *
   * The real shape has ONE degree of freedom, not four: she loses roughly a constant fraction of her
   * capacity per set. Estimating that single rate from EVERY (occurrence, position) pair pools all
   * the evidence — a four-set occurrence contributes three samples, not one — and the median over
   * that pool is the same robust estimator F-13 already names for the reps-per-rung slope. The
   * variance falls with the whole sample rather than with the count of fourth sets.
   */
  const rates: number[] = [];
  for (const rec of history.slice(0, RECENCY_WINDOW_SESSIONS)) {
    const first = rec.sets[0];
    if (!first || first.isApproach || first.load == null || first.load <= 0 || first.reps <= 0) continue;
    const e0 = epley(first.load, first.reps);
    if (!(e0 > 0)) continue;
    for (let i = 1; i < rec.sets.length; i += 1) {
      const s = rec.sets[i];
      if (!s || s.isApproach || s.load == null || s.load <= 0 || s.reps <= 0) continue;
      rates.push((e0 - epley(s.load, s.reps)) / (e0 * i)); // fractional capacity lost per position
    }
  }
  if (rates.length < MIN_PER_SET_SAMPLES) return ones;
  // Fatigue has a direction: a negative rate is noise, never a fact that she gets stronger as she
  // tires, and prescribing it would ask her to add weight across the exercise.
  const rate = Math.max(0, median(rates));

  const raw: number[] = [1];
  let previous = 1;
  // Every position is fitted from the ONE pooled rate (see above), so every position has evidence
  // and the mean below runs over all of them. (`evidenced` was a per-position leftover that always
  // equalled `setCount`; the note beneath is kept because the rule it states still binds if a
  // per-position fit ever returns.)
  for (let i = 1; i < setCount; i += 1) {
    const f = Math.min(previous, Math.max(0, 1 - rate * i));
    raw.push(f);
    previous = f;
  }

  /*
   * ⛔⛔ THE RAMP REDISTRIBUTES AROUND `base`. IT DOES NOT DESCEND FROM IT.
   *
   * The factors above are relative to POSITION 0, and using them directly makes every set lighter
   * than the flat number — which is wrong, because the flat number was never position 0's load. Loop
   * 2 calibrated it against the whole exercise, so it sits somewhere in the MIDDLE of the ramp: the
   * measured board has sets 2 and 3 landing in the band ~64% of the time while set 1 is 51.8% ABOVE
   * it. Descending from a middle is a load cut.
   *
   * Measured, on the first attempt: in band 56.1% → 40.9%, with 49.2% of all sets ABOVE the band and
   * the miss growing every week — the whole exercise walking downhill.
   *
   * Dividing by the mean puts the ramp's centre of mass exactly where the flat load already was, so
   * set 1 rises, the last set falls, and **the total work of the exercise is unchanged**. Loop 2's
   * calibration is preserved rather than re-litigated, which is the entire point of doing this
   * without touching L10.
   *
   * ⚠️ THE MEAN IS TAKEN OVER THE POSITIONS THAT HAVE EVIDENCE, never the flat tail copied from the
   * last fitted one — a five-set slot on a lift fitted to three positions would otherwise drag its
   * own centre down by repeating the smallest factor twice.
   */
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  if (!(mean > 0)) return ones;
  return raw.map((f) => f / mean);
}

/**
 * ⛔ THE RAMP SNAPS TO THE NEAREST REAL RUNG, NOT DOWN TO ONE.
 *
 * `snapDown` is right for a PRESCRIPTION — S-55 says never ask for iron that does not exist, and
 * erring light is the safe direction. It is wrong for a ramp POSITION, because the un-ramp has to
 * recover `base` from these numbers and an always-downward error does not cancel: it is a systematic
 * leak, one that compounds a little every session. Rounding to the nearest rung makes the error
 * symmetric, so the mean of the ramp is `base` to within noise instead of always under it.
 *
 * The floor still holds — `snapDown` is what decides the bottom, and nothing here may go under it.
 */
function snapNearest(load: number, meta: ExerciseMeta): number {
  const below = snapDown(load, meta.equipment, meta.observedLoads);
  const above = nextRung(below, meta.equipment, meta.observedLoads);
  return load - below <= above - load ? below : above;
}

/**
 * The loads to prescribe for the sets of one lift: `base`, shaped by her measured per-position
 * capacity. **The mean of the result is `base`**, which is the property the un-ramp depends on.
 */
export function rampedLoads(base: number | null, factors: number[], meta: ExerciseMeta): (number | null)[] {
  if (base == null || meta.bodyweight) return factors.map(() => base);
  return factors.map((f) => snapNearest(base * f, meta));
}
