/**
 * Barbell Bench Press — the Motion System benchmark (template: press_horizontal), presented
 * FRONT-VIEW from the head-end camera per §3.4 Amendment 7 (the chest family is a frontal
 * identity family by founder directive, 2026-07-08).
 *
 * The head-end frame is the honest camera for a lying press: the stroke is world-VERTICAL, so it
 * lives fully in the drawing plane (rule 5 satisfied face-on — the one frontal staging where a
 * chest press draws its whole path), and the lockout arm is CANONICAL 25/23 in-plane — the old
 * side view's abduction license is no longer needed at the top. The single projected fold sits at
 * the chest endpoint (rule 3): the humerus tucks toward the feet as the bar descends, so its
 * frontal projection shortens 25 → 17 across the rep — which is what lands the elbows just wide
 * of the pad with the forearms stacked vertically under the bar, the classic frontal bottom.
 *
 * What this camera states that the side view never could: SYMMETRY (both arms, both plates, the
 * full bar crossing the frame), the straddle of the legs over the end-on bench, and the RACK —
 * two uprights with J-hooks framing the athlete, the goalpost that names a bench station from
 * the equipment alone (§3.5).
 *
 * Canon (MOTION_FORM_STANDARD_V1 §2, unchanged): bar touches the chest line · straight vertical
 * bar path · feet/hips/shoulders/head fixed · lockout derived from the 172° elbow, never ≥179°.
 */
// @ts-nocheck

// 

import type { Decor, FormSpec, Pose, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, barbellFront, benchEndOn, floorScene, rackUprights } from '../kit';
import { FLOOR_Y, supineFrontCore } from '../bodies';

const CX = 176;
const core = supineFrontCore(CX);

const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;
const U_PROJ = 17; // humerus tucked toward the feet at the chest — the rule-3 projected fold
const LOCKOUT_ANGLE = 172;
const REACH = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos((LOCKOUT_ANGLE * Math.PI) / 180));

const GRIP = 27; // bench grip half-width — hands fixed on the bar, wider than the shoulders
const CHEST_Y = 140; // bar center meeting the chest dome's crest
const LOCK_Y = core.shoulderR.y - Math.sqrt(REACH * REACH - (GRIP - 15.5) ** 2);
const RACK_X = 42; // uprights inside the plates (±62), outside the grip (±27)

function poseAt(rom: number): Pose {
  const handY = lerp(LOCK_Y, CHEST_Y, rom);
  const uEff = lerp(U, U_PROJ, rom); // in-plane at lockout, tucked into depth at the chest
  const handR: Vec2 = { x: CX + GRIP, y: handY };
  const handL: Vec2 = { x: CX - GRIP, y: handY };
  return {
    headR: ATHLETE.headR,
    j: {
      ...core,
      handR,
      handL,
      elbowR: twoBoneIK(core.shoulderR, handR, uEff, F, 1),
      elbowL: twoBoneIK(core.shoulderL, handL, uEff, F, -1),
      bar: { x: CX, y: handY },
    },
  };
}

function decorAt(rom: number): Decor {
  const barY = lerp(LOCK_Y, CHEST_Y, rom);
  return {
    back: [
      ...benchEndOn(CX, 160, FLOOR_Y),
      ...rackUprights(CX, RACK_X, LOCK_Y + 6, FLOOR_Y),
      ...barPathTicks(CX + 52, LOCK_Y, CHEST_Y),
      // the bar is beyond the fists from this camera, so it draws behind the figure; the fists
      // close over it — grip stated by z-order, exactly as the hands read on a real unrack
      ...barbellFront(CX, barY),
    ],
    front: [],
  };
}

const formspec: FormSpec = {
  tempo: DEFAULT_TEMPO,
  start: [
    { kind: 'jointAngle', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], min: 165, max: 179, label: 'elbow lockout (full press) — the unrack' },
  ],
  end: [
    { kind: 'contactY', a: 'bar', y: CHEST_Y, tol: 2, label: 'bar touches the chest line' },
  ],
  path: { track: 'handR', kind: 'vertical', tol: 1.5 },
  invariants: [
    { kind: 'pointFixed', point: 'ankleR', tol: 1.0, label: 'feet planted' },
    { kind: 'pointFixed', point: 'toeR', tol: 1.0, label: 'toes planted' },
    { kind: 'pointFixed', point: 'hipC', tol: 1.0, label: 'hips on the bench' },
    { kind: 'pointFixed', point: 'shoulderR', tol: 1.0, label: 'shoulders on the bench' },
    { kind: 'pointFixed', point: 'head', tol: 1.0, label: 'head still' },
    { kind: 'angleNever', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], aboveDeg: 179, label: 'no elbow hyperextension' },
  ],
};

export const bbBenchPress: Rig = {
  id: 'bb_bench_press',
  chains: {
    torso: ['hipC', 'neckBase'],
    neck: ['neckBase', 'head'],
    head: 'head',
    view: 'front',
    nearArm: ['shoulderR', 'elbowR', 'handR'],
    farArm: ['shoulderL', 'elbowL', 'handL'],
    nearLeg: ['hipR', 'kneeR', 'ankleR'],
    farLeg: ['hipL', 'kneeL', 'ankleL'],
    nearFoot: ['heelR', 'toeR'],
    farFoot: ['heelL', 'toeL'],
  },
  formspec,
  poseAt,
  decorAt,
  scene: floorScene(FLOOR_Y, CX, 62),
};
