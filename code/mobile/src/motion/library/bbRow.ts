/**
 * Barbell Row — Mechanic A benchmark (template: pull_row), the hinged case. The body is anchored
 * in a fixed hip hinge; only the bar travels and the elbow follows.
 *
 * The defining rule of this template is a FROZEN torso: the hinge is set once at 45° and never
 * moves for the whole rep (the fault this demonstration must never teach is a torso that rises and
 * falls — turning a row into a swing). So everything except the bar height is a constant, and the
 * elbow is solved by two-bone IK from the fixed shoulder to the bar — the hand can never leave the
 * bar, and the elbow drives up-and-back by construction.
 *
 * Embodiment (v2): the hinge is now a real body — hips pushed BACK over soft knees (canonical
 * thigh/shank lengths), flat back with the head continuing the spine, and full-length arms
 * (shoulder→wrist = trunk length), which is what makes the dead hang honest: the bar hangs at
 * mid-thigh and travels ~36u into the lower ribs, with a true-scale ghost plate saying "barbell"
 * at first glance.
 *
 * Canon (MOTION_FORM_STANDARD_V1 §2/§4.1): dead hang (elbow ~170°) → bar contacts the torso at the
 * lower-rib line · bar vertical under the shoulder · torso frozen 45° ±3° · knees & feet fixed.
 * rom 0 = dead hang (rep start, arms long); rom 1 = bar at the ribs (working endpoint).
 */

// 

import type { Decor, FormSpec, Pose, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, floorScene, plateGhost } from '../kit';

const FLOOR_Y = 193;

// ── the fixed hinge (torso @ 45°) + planted legs — none of this moves during the rep ──
// Built foot-up at canonical lengths: planted foot → soft knee → hips back → 45° flat back.
const HEEL: Vec2 = { x: 152, y: FLOOR_Y };
const TOE: Vec2 = { x: 177, y: FLOOR_Y };
const ANKLE: Vec2 = { x: 162, y: 186 };
const KNEE: Vec2 = { x: 172, y: 150.5 }; // soft knee (~143°), set once
const HIP: Vec2 = { x: 157, y: 113.5 }; // hips pushed back over the heels
const SHOULDER: Vec2 = { x: 191, y: 79.5 }; // hip + torso·(cos45, −sin45) — the frozen 45° hinge
const HEAD: Vec2 = { x: 200, y: 66 }; // continues the spine (neutral neck, gaze down-forward)
const HEAD_R = 8;

const UPPER = ATHLETE.upperArm; // full canonical arm — this is what makes the hang honest
const FORE = ATHLETE.foreArm;
const BAR_X = SHOULDER.x; // the bar hangs and travels directly under the shoulder (vertical path)

// endpoints on the vertical bar line
const HANG_Y = SHOULDER.y + (UPPER + FORE) * 0.995; // arms long (elbow ~170°) — bar at mid-thigh
const RIB_Y = 97; // where the vertical bar line meets the trunk's front surface (the lower-rib line)

function poseAt(rom: number): Pose {
  const barY = lerp(HANG_Y, RIB_Y, rom);
  const hand: Vec2 = { x: BAR_X, y: barY };
  // bend +1 drives the elbow up-and-back (behind the bar, toward the hip side) as it flexes
  const elbow = twoBoneIK(SHOULDER, hand, UPPER, FORE, 1);

  const far = (p: Vec2, dx: number, dy = 0): Vec2 => ({ x: p.x + dx, y: p.y + dy });
  return {
    headR: HEAD_R,
    j: {
      head: HEAD,
      shoulder: SHOULDER,
      elbow,
      hand,
      hip: HIP,
      knee: KNEE,
      ankle: ANKLE,
      heel: HEEL,
      toe: TOE,
      bar: hand,
      farShoulder: far(SHOULDER, -7, 2),
      farElbow: far(elbow, -7, 2),
      farHand: far(hand, -7, 2),
      farHip: far(HIP, -7, 1),
      farKnee: far(KNEE, -7, 1),
      farAnkle: far(ANKLE, -8),
      farHeel: far(HEEL, -8),
      farToe: far(TOE, -8),
    },
  };
}

function decorAt(rom: number): Decor {
  const bar: Vec2 = { x: BAR_X, y: lerp(HANG_Y, RIB_Y, rom) };
  return {
    back: barPathTicks(BAR_X, HANG_Y, RIB_Y),
    front: plateGhost(bar),
  };
}

const scene = floorScene(FLOOR_Y, 164, 26);

const formspec: FormSpec = {
  tempo: CONCENTRIC_TEMPO,
  start: [
    { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 165, max: 179, label: 'dead hang — arms long (elbow ~170°)' },
  ],
  end: [
    { kind: 'contactY', a: 'bar', y: RIB_Y, tol: 2, label: 'bar to the lower ribs' },
  ],
  path: { track: 'bar', kind: 'vertical', tol: 1.5 },
  invariants: [
    { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'torso frozen at 45° (no swing)' },
    { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips fixed' },
    { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees fixed (soft, set once)' },
    { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'feet planted' },
    { kind: 'pointFixed', point: 'head', tol: 0.5, label: 'neutral neck (head on the spine line)' },
    { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
  ],
};

export const bbRow: Rig = {
  id: 'bb_row',
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
  scene,
};
