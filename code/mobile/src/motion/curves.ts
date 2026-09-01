/**
 * PER-JOINT TIMING — the small layer that lets one part of the body finish before another.
 *
 * Everything in this system runs off a single scalar. `timeline.ts` eases time into `rom`, and then
 * every rig writes every angle as `lerp(from, to, rom)`. One clock, and every joint bolted to it:
 * they all start together, they all reach their endpoint together, and the concentric is an exact
 * mirror of the eccentric. Lifting is none of those things.
 *
 * What that costs is not prettiness. It is the ability to draw the DIFFERENCE between a good rep
 * and the common fault, which is most of what a demonstration is for. Hips that shoot up out of a
 * squat before the chest, a deadlift that becomes a squat because the knees and hips bend in step,
 * a bar that drifts because the elbow leads — every one of those is a TIMING fault between two
 * joints, and a body on one clock cannot express any of them, right or wrong.
 *
 * The library had exactly one piece of sequencing before this file: `hinge.ts` multiplied its torso
 * angle by `rom * 1.4` so the deadlift's torso would reach its setup angle before the knees finished
 * bending, with a comment explaining that a linear torso "made the middle of the descent read as a
 * squat (caught by filmstrip QC, not by the validator: both are legal skeletons; only one is the
 * lift)". That is exactly right, and it was one hand-written multiply in one file out of forty.
 * This file is that idea, named and made available to every rig.
 *
 * A curve REMAPS ROM FOR ONE DRIVER. It is a pure function [0,1] → [0,1], and it must fix both
 * endpoints — `c(0) = 0` and `c(1) = 1` — because the rep's start and its working endpoint are what
 * the FormSpec asserts and what the range ticks are drawn against. A curve may change how a joint
 * gets between them; it may never change where it arrives. `assertEndpoints` is exported so a test
 * can hold that line.
 */

//

/** Remaps the rep fraction for one driver. Must satisfy c(0) = 0 and c(1) = 1. */
export type Curve = (rom: number) => number;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Everything moves together — the behaviour of every rig before curves existed. */
export const together: Curve = (rom) => rom;

/**
 * Arrives EARLY and waits. `by` is the fraction of the rep it has left over at the end: `leads(0.3)`
 * finishes at rom 0.7 and holds there.
 *
 * This is the deadlift's shape. The torso reaches its setup angle in the first two-thirds of the
 * descent and then simply stays there while the knees finish — which is what makes the lift read as
 * a hinge with a knee bend in it rather than as a squat with a bar in the way.
 */
export const leads =
  (by: number): Curve =>
  (rom) =>
    clamp01(rom / (1 - by));

/**
 * WAITS, then catches up. `by` is the fraction of the rep it sits still for at the start.
 * The complement of `leads`, for the joint that is being waited on.
 */
export const lags =
  (by: number): Curve =>
  (rom) =>
    clamp01((rom - by) / (1 - by));

/**
 * Fast away from the start, slow into the finish — the shape of a joint working against gravity
 * that runs out of leverage. `k` in (0, 1] is how hard: 1 is linear, 0.5 is a pronounced grind.
 */
export const grindsIn =
  (k: number): Curve =>
  (rom) =>
    Math.pow(clamp01(rom), k);

/** Slow off the start, then quick — a joint that has to be unstuck before it will move. */
export const easesOut =
  (k: number): Curve =>
  (rom) =>
    1 - Math.pow(1 - clamp01(rom), k);

/**
 * A curve that pauses mid-rep: it reaches `at` on schedule, dwells for `hold` of the rep, then runs
 * on. The sticking point — the place a real lifter slows to nothing and the place a demonstration
 * should linger, because it is where the rep is won or lost.
 */
export const sticksAt =
  (at: number, hold: number): Curve =>
  (rom) => {
    const r = clamp01(rom);
    const start = at * (1 - hold);
    const end = start + hold;
    if (r <= start) return (r / start) * at;
    if (r <= end) return at;
    return at + ((r - end) / (1 - end)) * (1 - at);
  };

/**
 * Every curve must fix both endpoints. Exported so a law can assert it over whatever the library
 * grows to hold — a curve that moved an endpoint would silently move a FormSpec contact point and
 * a range tick with it.
 */
export function assertEndpoints(c: Curve, tol = 1e-9): boolean {
  return Math.abs(c(0)) < tol && Math.abs(c(1) - 1) < tol;
}
