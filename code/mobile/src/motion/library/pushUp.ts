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
import { lerp, twoBoneIK, twoBoneIK3 } from '../geometry';
import { lags, sticksAt } from '../curves';

/** The plank's sticking point is a third of the way up (iron rule 12, 2026-09-07): rom 1 is the
 *  bottom, so the dwell sits at rom 0.65 read from the top. Endpoints untouched. */
const STICK = sticksAt(0.65, 0.06);
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
  /** The planted hand. With `handBehindShoulder` set, only its y is authored — see below. */
  hand: Vec2;
  /**
   * HANDS UNDER THE SHOULDERS, solved rather than typed (audit, 2026-09-03). The plain push-up's
   * hand sat 15u ahead of the top shoulder, so at the bottom the shoulder was BEHIND the wrist and
   * the only elbow the IK could draw pointed at the head — a forearm leaning 48° forward, which is
   * not a push-up. The hand's x is bisected so that at the top it sits this many units toward the
   * toes of the shoulder (8 = the hand at the lower chest, where every coach puts it); the body
   * then pivots forward over it and the elbow lands behind the wrist by construction.
   */
  handBehindShoulder?: number;
  /**
   * The elbow's flare out of the side plane at the bottom, in degrees (audit, 2026-09-03). A
   * push-up's elbow sits ~25° off the ribs; a diamond's stays on them (0). It is the plank's one
   * real second joint, and it carries the per-joint timing: `lags(0.2)`, so on the way down the
   * elbow stays tucked for the first fifth and on the way UP it is the first thing home.
   */
  flareDeg?: number;
  /** The elbow angle at the TOP (arms long) — the height is solved from it. */
  topAngle: number;
  /** Shoulder height above/below the hand at the BOTTOM (chest low / chest at the bar). */
  bottomReach: number;
  /** The row runs the rep the other way: rom 0 hangs LONG and pulls UP. */
  pull?: boolean;
  furniture: Primitive[];
  /** Draw the hands' diamond on the floor (the diamond push-up's one side-on mark). */
  diamond?: boolean;
}

function plankPress(p: PlankPressParams): Rig {
  /** The shoulder rides the circle of radius BODY about the toes; its height above the hand is
   *  the driven number, and its x falls out of the rigid body. */
  const shoulderFor = (hand: Vec2, reach: number): Vec2 => {
    /* Pressing, the shoulder rides ABOVE the planted hand; pulling (the inverted row), BELOW the
       bar — same circle about the toes, the reach's sign flipped. */
    const y = p.pull ? hand.y + reach : hand.y - reach;
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
  const heightFor = (hand: Vec2, targetDeg: number): number => {
    const target = reachAt(targetDeg);
    let lo = 6;
    let hi = U + F - 0.5;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const sh = shoulderFor(hand, mid);
      const d = Math.hypot(sh.x - hand.x, sh.y - hand.y);
      if (d > target) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  /* The hand's x and the top shoulder's x depend on each other (the top height is solved from the
     hand); a few fixed-point passes settle them to well under 0.01u. */
  const HAND: Vec2 = (() => {
    if (p.handBehindShoulder === undefined) return p.hand;
    let hand = p.hand;
    for (let i = 0; i < 24; i++) hand = { x: shoulderFor(hand, heightFor(hand, p.topAngle)).x + p.handBehindShoulder, y: p.hand.y };
    return hand;
  })();
  const shoulderAt = (reach: number): Vec2 => shoulderFor(HAND, reach);
  const fromReach = heightFor(HAND, p.topAngle); // rom 0: long arms, at the angle the card means
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
    /* The ROW's elbow goes BACK, past the ribs (audit, 2026-09-03). −1 closed it in front of the
       bar — 16u toward the head at the top, a curl to the face; +1 is the branch behind the trunk,
       hip–shoulder–elbow 21° at the top, the elbow 24u under the bar and never above it. */
    if (p.pull) return 1;
    /* Whichever sign keeps the elbow highest across the WHOLE rep, not at one sampled position.
       A pike push-up's most-bent frame is not at the same end as a flat one's, and picking the
       branch there left the elbow six units under the floor at the other. */
    const deepest = (bend: 1 | -1) => {
      let worst = -Infinity;
      for (let i = 0; i <= 16; i++) {
        const sh = shoulderAt(lerp(fromReach, toReach, i / 16));
        worst = Math.max(worst, twoBoneIK(sh, HAND, U, F, bend).y);
      }
      return worst;
    };
    return deepest(1) <= deepest(-1) ? 1 : -1;
  })();

  const FLARE_LAGS = lags(0.2);
  const poseAt = (rom: number): Pose => {
    const shoulder = shoulderAt(lerp(fromReach, toReach, STICK(rom)));
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
    const flat = twoBoneIK(shoulder, HAND, U, F, ELBOW_BEND);
    /*
     * The flare is solved in three dimensions and drawn flat: the hint is the flat solution's own
     * bend direction tipped out of the page by the flare angle, so both bones stay canonical while
     * the drawn elbow slides a little toward the arm's line — exactly what a flared elbow does from
     * the side. No `Pose.z` is published: at azimuth 0 it would only invite the near/far resolver
     * to swap the arms on a tie.
     */
    const flare = (((p.flareDeg ?? 0) * Math.PI) / 180) * FLARE_LAGS(rom);
    const axLen = Math.hypot(HAND.x - shoulder.x, HAND.y - shoulder.y) || 1;
    const ax = { x: (HAND.x - shoulder.x) / axLen, y: (HAND.y - shoulder.y) / axLen };
    const along = (flat.x - shoulder.x) * ax.x + (flat.y - shoulder.y) * ax.y;
    const perp = { x: flat.x - shoulder.x - along * ax.x, y: flat.y - shoulder.y - along * ax.y };
    const perpLen = Math.hypot(perp.x, perp.y);
    const bendDir = perpLen > 1e-6 ? { x: perp.x / perpLen, y: perp.y / perpLen } : { x: 0, y: -1 };
    const e3 = twoBoneIK3(
      { x: shoulder.x, y: shoulder.y, z: 0 },
      { x: HAND.x, y: HAND.y, z: 0 },
      U,
      F,
      { x: bendDir.x * Math.cos(flare), y: bendDir.y * Math.cos(flare), z: Math.sin(flare) },
    );
    const elbow: Vec2 = flare > 0 ? { x: e3.x, y: e3.y } : flat;
    /* The foot stands on its toes at 60° (audit, 2026-09-03): heel→toe 12u drawn instead of 8.5 —
       the plank's pivot, visible. The row stands on its HEEL, toes up. */
    const heel: Vec2 = p.pull ? { x: p.toes.x + 1, y: p.toes.y + 2 } : { x: p.toes.x + 6, y: p.toes.y - 10.4 };
    const toe: Vec2 = p.pull ? { x: p.toes.x - 7, y: p.toes.y - 10 } : p.toes;
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip,
        knee,
        ankle,
        heel,
        toe,
        elbow,
        hand: HAND,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(HAND, -6, 1),
        farHip: far(hip, -6, 1),
        farKnee: far(knee, -6, 1),
        farAnkle: far(ankle, -6, 1),
        farHeel: far(heel, -6, 0),
        farToe: far(toe, -6, 0),
      },
    };
  };

  const decorAt = (): Decor => ({ back: [...(p.diamond ? [{ kind: 'poly' as const, pts: [{ x: p.hand.x - 13, y: FLOOR_Y - 1 }, { x: p.hand.x - 5, y: FLOOR_Y - 1 }, { x: p.hand.x - 9, y: FLOOR_Y - 8 }], fill: 'ink2' as const }] : []), ...p.furniture, ...sampledPathTicks(ARC)], front: [] });

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
/* 22, not 13 (audit, 2026-09-03): a fist of chest above the floor is a shoulder ~25 cm up, and at
   13 the arm had to fold to 36° with the elbow ahead of the wrist. Measured at 22 with the hand
   8u behind the shoulder: elbow 68°, forearm 25° off vertical, the elbow 9.7u behind the wrist. */
const PU_BOTTOM = 22;

export const pushUpRig = plankPress({
  id: 'push_up',
  toes: PU_TOES,
  hand: PU_HAND,
  handBehindShoulder: 8,
  flareDeg: 25,
  topAngle: 168,
  bottomReach: PU_BOTTOM,
  furniture: [],
});

export const diamondPushUpRig = plankPress({
  id: 'diamond_push_up',
  toes: PU_TOES,
  /* The hands drawn together UNDER the sternum: side-on, the plant moves 6u further back toward
     the toes than the push-up's, and the elbows stay ON the ribs (no flare) — measured at the
     bottom: elbow ~77°, forearm near vertical, which is the diamond's whole side-on difference.
     The bottom is 2u deeper than the push-up's: chest to the hands, as the diamond is done. */
  hand: PU_HAND,
  handBehindShoulder: 14,
  flareDeg: 0,
  /* The diamond itself, drawn: thumbs and index fingers meet under the sternum — a small triangle
     on the floor just ahead of the fist, the one glyph a side camera can give this member (2026-09-07). */
  diamond: true,
  topAngle: 168,
  bottomReach: PU_BOTTOM - 2,
  furniture: [],
});

/* Decline: the feet UP on the bench — same line, tilted head-down. */
const DECLINE_BENCH_TOP = FLOOR_Y - 30;
export const declinePushUpRig = plankPress({
  id: 'decline_push_up',
  toes: { x: 268, y: DECLINE_BENCH_TOP - 2 },
  hand: { x: 128, y: FLOOR_Y - 2 },
  /* 12 behind, not 8: feet up, the shoulder circle drifts further ahead over the hand at the
     bottom, so the hand sits a little further back to keep the elbow behind the wrist. */
  handBehindShoulder: 12,
  flareDeg: 25,
  topAngle: 168,
  bottomReach: PU_BOTTOM,
  furniture: [
    { kind: 'rect', x: 246, y: DECLINE_BENCH_TOP, width: 44, height: 7, rx: 3, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: 254, y: DECLINE_BENCH_TOP + 7 }, b: { x: 254, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
    { kind: 'line', a: { x: 282, y: DECLINE_BENCH_TOP + 7 }, b: { x: 282, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
  ],
});

/* The inverted row: the plank slung UNDER the bar, heels down, chest pulling up to it. */
/*
 * THE BAR IS OVER THE CHEST, NOT THE FACE (audit, 2026-09-03). At (158, 96) the bar sat 14.5u UP
 * the spine from the top shoulder — over the throat — so no elbow branch could row: one folded to
 * the face, the other rose above the bar. Moved 18u toward the feet and 6u lower (a hip-high pin,
 * 91u ≈ 103 cm), the bar is 5u down the spine from the shoulder at the top; with the elbow's
 * back branch that is measured elbow 58°, hip–shoulder–elbow 21°, elbow 24u under the bar. The
 * cost is the hang: the arms lean 37° off vertical at rom 0, which the rigid body about the heels
 * cannot avoid once the top is right — a body 125u long swings 12u in x over this rise.
 *
 * THE HEELS 10u FURTHER OUT (execution pass, 2026-09-07). The hang was 36° because the shoulder
 * sat 17u ahead of the bar even at the TOP: the body-circle about the toes put it there. With the
 * toes at 272 the shoulder finishes 7u ahead of the bar (the bar over the upper chest, as the
 * paragraph above wants) and the hang leans ~25° — the swing of the rigid body, and no more. The
 * reach at the top is 17, not 16: with the shoulder nearly under the bar the arm folds to 37° at
 * 16, under the 55° readability floor; a unit more keeps the row's finish a legible V (~44°).
 */
const IR_BAR: Vec2 = { x: 176, y: 102 };
export const invertedRowRig = plankPress({
  id: 'inverted_row',
  toes: { x: 272, y: FLOOR_Y - 4 },
  hand: IR_BAR,
  /* Hanging long at rom 0, chest at the bar at rom 1 — the row runs toward the hand. */
  topAngle: 165,
  /* 17 (was 12, then 16): the shoulder joint a hand's depth under the bar when the chest touches it. */
  bottomReach: 17,
  pull: true,
  furniture: [
    { kind: 'line', a: { x: IR_BAR.x - 44, y: IR_BAR.y }, b: { x: IR_BAR.x + 44, y: IR_BAR.y }, w: 3.5, color: 'ink0', cap: 'round' },
    /* The uprights run to the frame's top edge (26) — a structure that continues, not one that
       stops 4u short and reads as cut (audit, 2026-09-03). */
    { kind: 'line', a: { x: IR_BAR.x - 38, y: IR_BAR.y }, b: { x: IR_BAR.x - 38, y: 26 }, w: 2.5, color: 'ink3' },
    { kind: 'line', a: { x: IR_BAR.x + 38, y: IR_BAR.y }, b: { x: IR_BAR.x + 38, y: 26 }, w: 2.5, color: 'ink3' },
  ],
});
