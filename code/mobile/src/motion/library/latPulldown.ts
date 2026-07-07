/**
 * Lat Pulldown — Mechanic A benchmark (template: pull_vertical). The cable/machine case: it retires
 * the "can the equipment kit read?" risk alongside the two barbell lifts.
 *
 * Seated and anchored: glutes on the seat (the trunk silhouette meets the pad), thighs under the
 * pad, a fixed slight back-lean. Only the bar travels — vertically, in front of the face — and the
 * elbows follow by two-bone IK from the fixed shoulder, driving down-and-back. Full canonical arms
 * make the overhead stretch real: the bar starts 46u above the shoulder and stops at the collarbone
 * line, never lower (a chest-bounce endpoint would contradict the cue "Pull to the collarbone").
 *
 * Canon (MOTION_FORM_STANDARD_V1 §2/§4.1): full overhead stretch (elbow ~170°) → bar at the
 * collarbone, never lower · bar vertical in front of the face · torso lean frozen ~15° (no swing) ·
 * hips on the seat, thighs under the pad. rom 0 = overhead stretch (rep start); rom 1 = collarbone.
 */
import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, floorScene } from '../kit';

const FLOOR_Y = 193;

// ── seated, anchored body (torso leans back ~15°) — none of this moves during the rep ──
const HIP: Vec2 = { x: 150, y: 157.5 }; // glutes meet the seat pad
const SHOULDER: Vec2 = { x: 137.5, y: 111 };
const HEAD: Vec2 = { x: 135, y: 95 }; // continues the spine — tall chest, slight back lean
const HEAD_R = 8;
const KNEE: Vec2 = { x: 189, y: 150 }; // canonical thigh, knee under the pad
const ANKLE: Vec2 = { x: 198, y: 186 };
const HEEL: Vec2 = { x: 192, y: FLOOR_Y };
const TOE: Vec2 = { x: 217, y: FLOOR_Y };

const UPPER = ATHLETE.upperArm;
const FORE = ATHLETE.foreArm;
const BAR_X = 151; // the bar travels vertically, in front of the face
const COLLAR_Y = 113; // the collarbone line — the working endpoint (never lower)

// overhead stretch: hand reaches up to the bar with the elbow ~straight (arms long overhead)
const REACH = (UPPER + FORE) * 0.997;
const STRETCH_Y = SHOULDER.y - Math.sqrt(Math.max(0, REACH * REACH - (BAR_X - SHOULDER.x) ** 2));

function poseAt(rom: number): Pose {
  const barY = lerp(STRETCH_Y, COLLAR_Y, rom);
  const hand: Vec2 = { x: BAR_X, y: barY };
  // bend +1 drives the elbow down-and-back as it flexes — the lat-pulldown path
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
      farShoulder: far(SHOULDER, 7, 2),
      farElbow: far(elbow, 7, 2),
      farHand: far(hand, 7, 2),
      farHip: far(HIP, 7, 1),
      farKnee: far(KNEE, 7),
      farAnkle: far(ANKLE, 8),
      farHeel: far(HEEL, 8),
      farToe: far(TOE, 8),
    },
  };
}

// ── the cable machine (same stroke grammar as the barbell kit) ───────────────────
const PULLEY: Vec2 = { x: BAR_X, y: 44 };
const machine: Primitive[] = [
  { kind: 'line', a: { x: 118, y: 40 }, b: { x: 210, y: 40 }, w: 3, color: 'ink3' }, // top beam
  { kind: 'line', a: { x: 208, y: 40 }, b: { x: 208, y: FLOOR_Y }, w: 3, color: 'ink3' }, // stack tower
  { kind: 'circle', c: PULLEY, r: 4, stroke: 'ink3', w: 2, fill: 'paper1' }, // pulley
  // seat + post under the glutes
  { kind: 'rect', x: 134, y: 162, width: 38, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
  { kind: 'line', a: { x: 153, y: 169 }, b: { x: 153, y: 190 }, w: 2.5, color: 'ink3' },
  // thigh pad holding the legs down
  { kind: 'rect', x: 168, y: 136, width: 32, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
];

function decorAt(rom: number): Decor {
  const bar: Vec2 = { x: BAR_X, y: lerp(STRETCH_Y, COLLAR_Y, rom) };
  return {
    back: [...machine, { kind: 'line', a: PULLEY, b: bar, w: 1.5, color: 'ink2' }, ...barPathTicks(BAR_X, STRETCH_Y, COLLAR_Y, 5)],
    front: [
      { kind: 'line', a: { x: bar.x - 14, y: bar.y }, b: { x: bar.x + 14, y: bar.y }, w: 3.5, color: 'ink0', cap: 'round' }, // the wide bar (edge-on)
      { kind: 'circle', c: bar, r: 2.5, fill: 'ink0' },
    ],
  };
}

const scene = floorScene(FLOOR_Y, 178, 42);

const formspec: FormSpec = {
  tempo: DEFAULT_TEMPO,
  start: [
    { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 165, max: 179, label: 'full overhead stretch (elbow ~170°)' },
  ],
  end: [
    { kind: 'contactY', a: 'bar', y: COLLAR_Y, tol: 2, label: 'bar to the collarbone (never lower)' },
  ],
  path: { track: 'bar', kind: 'vertical', tol: 2 },
  invariants: [
    { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'torso lean frozen ~15° (no swing)' },
    { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips on the seat' },
    { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'thighs under the pad' },
    { kind: 'pointFixed', point: 'head', tol: 0.5, label: 'neutral neck (head on the spine line)' },
    { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
  ],
};

export const latPulldown: Rig = {
  id: 'lat_pulldown',
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
