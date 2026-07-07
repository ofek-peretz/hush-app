/**
 * Barbell Bench Press — the first Motion System benchmark (template: press_horizontal).
 *
 * The ONLY thing the timeline drives is the bar height. Everything else is anchored, and the
 * elbow is solved by two-bone IK from the fixed shoulder to the bar — so the hand can never leave
 * the bar and the forearm stacks under it by construction. The lockout height is derived from a
 * target elbow angle, so the "full press" predicate holds by geometry, not by a hand-tuned number.
 *
 * Embodiment (v2): the athlete LIES ON the bench — the trunk silhouette's glutes and upper back
 * meet the pad (the lumbar hollow reads as the arch), the head rests on the pad, the legs take the
 * real ATHLETE lengths with feet planted wide of the bench, and the plate is a true-scale 45cm
 * ghost. Arm segments remain SIDE-VIEW projections (shorter than canonical — the humerus abducts
 * into depth on a bench) per the documented anthro exception.
 *
 * Canon (MOTION_FORM_STANDARD_V1 §2): bar touches the chest line · straight vertical bar path ·
 * feet/hips/shoulders/head fixed · elbow near-straight at the top, never hyperextended.
 */
import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { DEFAULT_TEMPO } from '../timeline';
import { barPathTicks, floorScene, plateGhost } from '../kit';

// ── tuned constants (frame units; 352×220 media frame, athlete lying head-left) ──
const FLOOR_Y = 193;
const BENCH_TOP = 160; // pad surface — the contact plane the trunk is laid onto

const SHOULDER: Vec2 = { x: 114, y: 151 }; // spine centerline ~9u above the pad → back meets pad
const HIP: Vec2 = { x: 172, y: 151.5 };
const HEAD: Vec2 = { x: 99, y: 151.5 }; // resting ON the pad (head bottom ≈ pad surface)
const HEAD_R = 8;
const UPPER = 20; // shoulder → elbow, projected (humerus abducted into depth)
const FORE = 22; // elbow → hand, near-plane
const BAR_X = 130; // over the chest peak of the trunk silhouette — vertical path, clear of the face
const LOCKOUT_ANGLE = 172; // elbow angle (deg) at the top of the press
const CHEST_Y = 140; // bar center at chest contact (trunk chest surface ≈ 142 + bar radius)

/** Hand height on the x=BAR_X line that puts the elbow at a given angle (hand above the shoulder). */
function handYForElbowAngle(deg: number): number {
  const rad = (deg * Math.PI) / 180;
  const d = Math.sqrt(UPPER * UPPER + FORE * FORE - 2 * UPPER * FORE * Math.cos(rad));
  const dx = BAR_X - SHOULDER.x;
  const dy = Math.sqrt(Math.max(0, d * d - dx * dx));
  return SHOULDER.y - dy;
}

const LOCKOUT_Y = handYForElbowAngle(LOCKOUT_ANGLE);

// static (anchored) legs — canonical lengths, feet planted past the bench end
const KNEE: Vec2 = { x: 211, y: 152.5 };
const ANKLE: Vec2 = { x: 224, y: 186 };
const HEEL: Vec2 = { x: 218, y: FLOOR_Y };
const TOE: Vec2 = { x: 243, y: FLOOR_Y };
const FAR_HIP: Vec2 = { x: 177, y: 153 };
const FAR_KNEE: Vec2 = { x: 216, y: 154 };
const FAR_ANKLE: Vec2 = { x: 229, y: 187 };
const FAR_HEEL: Vec2 = { x: 223, y: FLOOR_Y };
const FAR_TOE: Vec2 = { x: 248, y: FLOOR_Y };

function poseAt(rom: number): Pose {
  const handY = lerp(LOCKOUT_Y, CHEST_Y, rom);
  const hand: Vec2 = { x: BAR_X, y: handY };
  const elbow = twoBoneIK(SHOULDER, hand, UPPER, FORE, 1);
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
      farHip: FAR_HIP,
      farKnee: FAR_KNEE,
      farAnkle: FAR_ANKLE,
      farHeel: FAR_HEEL,
      farToe: FAR_TOE,
    },
  };
}

// ── decoration: bench + plate + bar-path + range ticks ──────────────────────────
const bench: Primitive[] = [
  { kind: 'line', a: { x: 92, y: BENCH_TOP + 10 }, b: { x: 92, y: FLOOR_Y }, w: 3, color: 'ink3' },
  { kind: 'line', a: { x: 172, y: BENCH_TOP + 10 }, b: { x: 172, y: FLOOR_Y }, w: 3, color: 'ink3' },
  { kind: 'rect', x: 74, y: BENCH_TOP, width: 112, height: 10, rx: 4, fill: 'paper3', stroke: 'ink3', w: 2 },
];

function decorAt(rom: number): Decor {
  const bar: Vec2 = { x: BAR_X, y: lerp(LOCKOUT_Y, CHEST_Y, rom) };
  return {
    back: [...bench, ...barPathTicks(BAR_X, LOCKOUT_Y, CHEST_Y)],
    front: plateGhost(bar),
  };
}

const scene: Primitive[] = floorScene(FLOOR_Y, 168, 92);

const formspec: FormSpec = {
  tempo: DEFAULT_TEMPO,
  start: [
    { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 165, max: 179, label: 'elbow lockout (full press)' },
  ],
  end: [
    { kind: 'contactY', a: 'hand', y: CHEST_Y, tol: 2, label: 'bar touches the chest line' },
  ],
  path: { track: 'hand', kind: 'vertical', tol: 1.5 },
  invariants: [
    { kind: 'pointFixed', point: 'ankle', tol: 1.0, label: 'near foot planted' },
    { kind: 'pointFixed', point: 'toe', tol: 1.0, label: 'near toe planted' },
    { kind: 'pointFixed', point: 'hip', tol: 1.0, label: 'hips on the bench' },
    { kind: 'pointFixed', point: 'shoulder', tol: 1.0, label: 'shoulders on the bench' },
    { kind: 'pointFixed', point: 'head', tol: 1.0, label: 'head still' },
    { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
  ],
};

export const bbBenchPress: Rig = {
  id: 'bb_bench_press',
  chains: {
    torso: ['hip', 'shoulder'],
    neck: ['shoulder', 'head'],
    head: 'head',
    nearArm: ['shoulder', 'elbow', 'hand'],
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
