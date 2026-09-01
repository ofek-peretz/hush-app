/**
 * THE PLANK CORE — a straight body on its hands, and the five lifts that are that body at five
 * angles: push_up · diamond_push_up · decline_push_up · pike_push_up · inverted_row. One new
 * skeleton, reused the way `squatCore` is: the BODY is a rigid line from ankles to shoulders
 * (the plank the cues demand — "body in a straight line" is the construction, not a hope), the
 * hands are planted, and the rep is the shoulder line dropping toward them and pressing away.
 *
 * ── THE MECHANISM ───────────────────────────────────────────────────────────────────────────────
 * Anchors: the TOES (on the floor or the bench) and the HANDS (on the floor or the bar). The body
 * line pivots about the toes as the elbows bend — the shoulder is solved on the arc the rigid body
 * allows, the elbow by IK between the planted hand and the travelling shoulder. `colinear` — the
 * predicate the standard shipped for exactly this ("the push-up plank line, drawn as a rule") —
 * holds ankle–hip–shoulder straight across the WHOLE rep, so sag and pike both fail the build.
 *
 * ── THE MEMBERS ─────────────────────────────────────────────────────────────────────────────────
 *   · `push_up`         — hands under the shoulders, body low over the floor.
 *   · `diamond_push_up` — the same plank, hands drawn together under the sternum (side-on the
 *     visible truth is the hand under the chest's midline; the touching thumbs are the cue's).
 *   · `decline_push_up` — feet UP on the bench: the same line, tilted head-down, harder.
 *   · `pike_push_up`    — ⛔ NOT here: its body is folded at the hips ON PURPOSE (an inverted V),
 *     which breaks this file's one law — the `colinear` plank. A pike needs its own folded pose
 *     with the colinearity moved to hip–shoulder–hand; drawing it on the plank core would hold
 *     the exact line the pike exists to break. The step-up rule: open until drawable true.
 *   · `inverted_row`    — the plank UNDER the bar: same rigid line, heels on the floor, and the
 *     CHEST pulls to the bar instead of pressing away — the row's mirror of the push-up.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK, bendToward } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { floorScene, sampledPathTicks } from '../kit';
import { FLOOR_Y, far } from '../bodies';

const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;
/** Ankle → shoulder along the plank line: shank+thigh+torso, rigid by construction. */
const BODY = ATHLETE.shank + ATHLETE.thigh + ATHLETE.torso;

interface PlankPressParams {
  id: string;
  /** The planted toes. */
  toes: Vec2;
  /** The planted hand. */
  hand: Vec2;
  /** The elbow angle at the TOP (arms long) — the height is solved from it. */
  topAngle: number;
  /** Shoulder height above/below the hand at the BOTTOM (chest low / chest at the bar). */
  bottomReach: number;
  /** The row runs the rep the other way: rom 0 hangs LONG and pulls UP. */
  pull?: boolean;
  furniture: Primitive[];
}

function plankPress(p: PlankPressParams): Rig {
  /** The shoulder rides the circle of radius BODY about the toes; its height above the hand is
   *  the driven number, and its x falls out of the rigid body. */
  const shoulderAt = (reach: number): Vec2 => {
    /* Pressing, the shoulder rides ABOVE the planted hand; pulling (the inverted row), BELOW the
       bar — same circle about the toes, the reach's sign flipped. */
    const y = p.pull ? p.hand.y + reach : p.hand.y - reach;
    const dx = Math.sqrt(Math.max(1, BODY * BODY - (p.toes.y - y) ** 2));
    return { x: p.toes.x - dx, y };
  };
  /*
   * ⚠️ THE TOP IS SOLVED, NOT TYPED — the pull-up's lesson, third appearance. The elbow's measured
   * angle depends on the true shoulder→hand distance, and the shoulder carries a horizontal offset
   * that itself depends on its height (it rides the body-circle about the toes). A typed vertical
   * reach put the plain push-up 0.7u OVER the arm's length (IK clamped at 179.8°) while the
   * diamond, whose hand sits under the chest, landed at 147°. So the top height is bisected from
   * the target elbow angle per member, and the endpoints hold by construction.
   */
  const reachAt = (deg: number) => Math.sqrt(U * U + F * F - 2 * U * F * Math.cos((deg * Math.PI) / 180));
  const heightFor = (targetDeg: number): number => {
    const target = reachAt(targetDeg);
    let lo = 6;
    let hi = U + F - 0.5;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const sh = shoulderAt(mid);
      const d = Math.hypot(sh.x - p.hand.x, sh.y - p.hand.y);
      if (d > target) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const fromReach = heightFor(p.topAngle); // rom 0: long arms, at the angle the card means
  const toReach = p.bottomReach; // rom 1
  const ARC = Array.from({ length: 17 }, (_, i) => shoulderAt(lerp(fromReach, toReach, i / 16)));

  /*
   * THE ELBOW STAYS ABOVE THE HAND, and the side is resolved ONCE.
   *
   * Pressing members hold their hands ON THE FLOOR, so the branch that swings the elbow downward
   * buries it: at the bottom of a diamond push-up it reached 6 units under the ground, below its
   * own supporting hand. Resolving the branch per frame instead fixed that and broke something
   * worse — the choice flipped mid-rep and the elbow snapped 11 units across between two frames.
   * So the side is decided here, at the most-bent position where the two branches are furthest
   * apart and the answer is least ambiguous, and then held constant for the whole rep.
   */
  const ELBOW_BEND: 1 | -1 = (() => {
    if (p.pull) return -1;
    /* Whichever sign keeps the elbow highest across the WHOLE rep, not at one sampled position.
       A pike push-up's most-bent frame is not at the same end as a flat one's, and picking the
       branch there left the elbow six units under the floor at the other. */
    const deepest = (bend: 1 | -1) => {
      let worst = -Infinity;
      for (let i = 0; i <= 16; i++) {
        const sh = shoulderAt(lerp(fromReach, toReach, i / 16));
        worst = Math.max(worst, twoBoneIK(sh, p.hand, U, F, bend).y);
      }
      return worst;
    };
    return deepest(1) <= deepest(-1) ? 1 : -1;
  })();

  const poseAt = (rom: number): Pose => {
    const shoulder = shoulderAt(lerp(fromReach, toReach, rom));
    /* The rigid line from toes to shoulder places every joint at its own fraction. */
    const at = (dist: number): Vec2 => ({
      x: lerp(p.toes.x, shoulder.x, dist / BODY),
      y: lerp(p.toes.y, shoulder.y, dist / BODY),
    });
    const ankle = at(ATHLETE.ankleH + 2);
    const knee = at(ATHLETE.shank);
    const hip = at(ATHLETE.shank + ATHLETE.thigh);
    /* The head continues the line — eyes down the plank, no craning. */
    const head: Vec2 = {
      x: shoulder.x + (shoulder.x - p.toes.x) * (ATHLETE.neck / BODY),
      y: shoulder.y + (shoulder.y - p.toes.y) * (ATHLETE.neck / BODY),
    };
    /*
     * THE ELBOW STAYS ABOVE THE HAND. Pressing members hold their hands ON THE FLOOR, so the branch
     * that swings the elbow downward buries it: at the bottom of a diamond push-up it reached 6
     * units under the ground, below its own supporting hand. A push-up's forearm is near vertical
     * and the elbow sits beside the ribs, above the wrist — so the solution is picked toward a
     * point above the hand rather than by a fixed sign. `pull` members hang UNDER their bar and
     * keep the opposite branch, which for them is the one that is above the hand too.
     */
    const elbow = twoBoneIK(shoulder, p.hand, U, F, ELBOW_BEND);
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip,
        knee,
        ankle,
        heel: { x: p.toes.x + 6, y: p.toes.y - 6 },
        toe: p.toes,
        elbow,
        hand: p.hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(p.hand, -6, 1),
        farHip: far(hip, -6, 1),
        farKnee: far(knee, -6, 1),
        farAnkle: far(ankle, -6, 1),
        farHeel: far({ x: p.toes.x + 6, y: p.toes.y - 6 }, -6, 0),
        farToe: far(p.toes, -6, 0),
      },
    };
  };

  const decorAt = (): Decor => ({ back: [...p.furniture, ...sampledPathTicks(ARC)], front: [] });

  const formspec: FormSpec = {
    /* The plank presses lower to the floor at rom 1 — eccentric first. The inverted ROW pulls its
       chest UP to the bar there, so its slow phase is the other one (`Tempo.endpointIsConcentric`). */
    tempo: p.pull ? CONCENTRIC_TEMPO : DEFAULT_TEMPO,
    start: [
      {
        kind: 'jointAngle',
        joint: 'elbow',
        neighbors: ['shoulder', 'hand'],
        min: p.pull ? 150 : 155,
        max: 179,
        label: p.pull ? 'hanging long under the bar' : 'arms long at the top',
      },
    ],
    end: [
      {
        kind: 'jointAngle',
        joint: 'elbow',
        neighbors: ['shoulder', 'hand'],
        min: 35,
        max: 80,
        label: p.pull ? 'chest pulled to the bar' : 'chest lowered to the floor',
      },
    ],
    path: { track: 'shoulder', kind: 'arc', tol: 2 },
    invariants: [
      { kind: 'pointFixed', point: 'toe', tol: 0.5, label: 'toes planted — the body pivots there' },
      { kind: 'pointFixed', point: 'hand', tol: 0.5, label: 'hands planted' },
      /* THE PLANK, held the whole rep — the predicate the standard shipped for this exact line. */
      { kind: 'colinear', a: 'ankle', b: 'hip', c: 'shoulder', tolDeg: 6, label: 'body in a straight line — no sag, no pike' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return {
    id: p.id,
    chains: {
      torso: ['hip', 'shoulder'],
      neck: ['shoulder', 'head'],
      head: 'head',
      nearArm: ['shoulder', 'elbow', 'hand'],
      farArm: ['farShoulder', 'farElbow', 'farHand'],
      nearLeg: ['hip', 'knee', 'ankle'],
      nearFoot: ['heel', 'toe'],
      farLeg: ['farHip', 'farKnee', 'farAnkle'],
      farFoot: ['farHeel', 'farToe'],
    },
    formspec,
    poseAt,
    decorAt,
    scene: floorScene(FLOOR_Y, 176, 60),
  };
}

/* The floor push-ups: toes right, hands left, the body low over the floor. */
const PU_TOES: Vec2 = { x: 264, y: FLOOR_Y - 2 };
const PU_HAND: Vec2 = { x: 132, y: FLOOR_Y - 2 };

export const pushUpRig = plankPress({
  id: 'push_up',
  toes: PU_TOES,
  hand: PU_HAND,
  topAngle: 168,
  bottomReach: 13,
  furniture: [],
});

export const diamondPushUpRig = plankPress({
  id: 'diamond_push_up',
  toes: PU_TOES,
  /* The hands drawn together UNDER the sternum: side-on, the plant moves back toward the toes. */
  hand: { x: PU_HAND.x + 16, y: PU_HAND.y },
  topAngle: 168,
  bottomReach: 13,
  furniture: [],
});

/* Decline: the feet UP on the bench — same line, tilted head-down. */
const DECLINE_BENCH_TOP = FLOOR_Y - 30;
export const declinePushUpRig = plankPress({
  id: 'decline_push_up',
  toes: { x: 268, y: DECLINE_BENCH_TOP - 2 },
  hand: { x: 128, y: FLOOR_Y - 2 },
  topAngle: 168,
  bottomReach: 13,
  furniture: [
    { kind: 'rect', x: 246, y: DECLINE_BENCH_TOP, width: 44, height: 7, rx: 3, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: 254, y: DECLINE_BENCH_TOP + 7 }, b: { x: 254, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
    { kind: 'line', a: { x: 282, y: DECLINE_BENCH_TOP + 7 }, b: { x: 282, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
  ],
});

/* The inverted row: the plank slung UNDER the bar, heels down, chest pulling up to it. */
const IR_BAR: Vec2 = { x: 158, y: 96 };
export const invertedRowRig = plankPress({
  id: 'inverted_row',
  toes: { x: 262, y: FLOOR_Y - 4 },
  hand: IR_BAR,
  /* Hanging long at rom 0, chest at the bar at rom 1 — the row runs toward the hand. */
  topAngle: 165,
  bottomReach: 12,
  pull: true,
  furniture: [
    { kind: 'line', a: { x: IR_BAR.x - 44, y: IR_BAR.y }, b: { x: IR_BAR.x + 44, y: IR_BAR.y }, w: 3.5, color: 'ink0', cap: 'round' },
    { kind: 'line', a: { x: IR_BAR.x - 38, y: IR_BAR.y }, b: { x: IR_BAR.x - 38, y: 30 }, w: 2.5, color: 'ink3' },
    { kind: 'line', a: { x: IR_BAR.x + 38, y: IR_BAR.y }, b: { x: IR_BAR.x + 38, y: 30 }, w: 2.5, color: 'ink3' },
  ],
});
