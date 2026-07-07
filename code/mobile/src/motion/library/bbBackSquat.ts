/**
 * Barbell Back Squat — Mechanic B benchmark (template: squat_bilateral). The whole body is the
 * moving element: this is the pilot's hardest readability test.
 *
 * How the motion is authored so it stays correct AND natural:
 *   • The feet are pinned to the floor (ankle/heel/toe fixed) — heels never leave the ground.
 *   • The legs are driven by two angles — shank-from-vertical and thigh-from-horizontal — each a
 *     hand-tuned curve of `rom`. Because the segment LENGTHS are constant (canonical ATHLETE
 *     lengths), the limbs rotate about their joints; nothing ever stretches. Knee travel is
 *     single-plane by construction.
 *   • The torso lean is not authored — it is SOLVED every frame so the bar (on the traps, directly
 *     above the shoulder) stays over the mid-foot. That makes the canonical vertical bar path true
 *     by geometry, not by a tuned number, exactly as the bench press derives its lockout height.
 *   • Because every joint is a pure function of `rom`, the descent and ascent are mirror images —
 *     the "no good-morning" symmetry (hips and chest rise together) holds automatically.
 *   • The arms are authored in the TORSO's frame (elbow down-and-back of the shoulder, forearm up
 *     to the bar) so the grip rides the trunk through the lean — the athlete visibly holds the bar.
 *
 * Canon (MOTION_FORM_STANDARD_V1 §2/§4.2): stand tall (hip+knee ~extended) → hip crease below the
 * knee · bar vertical over mid-foot · heels planted · no hyperextension at the top.
 */
import type { Decor, FormSpec, Pose, Rig, Vec2 } from '../types';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, floorScene, plateGhost } from '../kit';

const DEG = Math.PI / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── planted foot (fixed all rep) + the balance line ─────────────────────────────
const HEEL: Vec2 = { x: 168, y: 193 };
const TOE: Vec2 = { x: 193, y: 193 };
const ANKLE: Vec2 = { x: 178, y: 186 };
const BAR_X = 180; // over the mid-foot — the balance line the athlete feels
const FLOOR_Y = 193;

// canonical segment lengths (side-view), constant for the whole rep
const L_SHANK = ATHLETE.shank;
const L_THIGH = ATHLETE.thigh;
const L_TORSO = ATHLETE.torso;
const NECK = ATHLETE.neck;
const HEAD_R = ATHLETE.headR;
const BAR_ABOVE_SHOULDER = 3.5; // the bar rides the traps, just above the shoulder joint

// leg drive: shank angle from vertical, thigh angle from horizontal (hip up-&-back of knee)
const SHANK_TOP = 6; // nearly vertical standing
const SHANK_BOT = 32; // knee travels forward over the foot
const THIGH_TOP = 84; // thigh ~vertical, hip stacked over knee (standing tall)
const THIGH_BOT = -5.5; // hip drops below the knee (depth)
const HEAD_FOLLOW = 0.7; // the neck follows the torso lean, biased upright (neutral spine, eyes forward)

// the grip, authored in the torso frame: elbow down-and-back of the shoulder, forearm to the bar
const ELBOW_DOWN = 18;
const ELBOW_BACK = 9;

function poseAt(rom: number): Pose {
  const shank = lerp(SHANK_TOP, SHANK_BOT, rom) * DEG;
  const thigh = lerp(THIGH_TOP, THIGH_BOT, rom) * DEG;

  const knee: Vec2 = { x: ANKLE.x + L_SHANK * Math.sin(shank), y: ANKLE.y - L_SHANK * Math.cos(shank) };
  const hip: Vec2 = { x: knee.x - L_THIGH * Math.cos(thigh), y: knee.y - L_THIGH * Math.sin(thigh) };

  // solve the torso lean so the bar (above the shoulder) sits over the mid-foot: shoulder.x = BAR_X
  const sinLean = Math.max(-0.6, Math.min(0.6, (BAR_X - hip.x) / L_TORSO));
  const cosLean = Math.sqrt(1 - sinLean * sinLean);
  const shoulder: Vec2 = { x: hip.x + L_TORSO * sinLean, y: hip.y - L_TORSO * cosLean };
  const sinHead = sinLean * HEAD_FOLLOW;
  const cosHead = Math.sqrt(1 - sinHead * sinHead);
  const head: Vec2 = { x: shoulder.x + NECK * sinHead, y: shoulder.y - NECK * cosHead };

  // grip: the arm folds in the torso's frame so it rides the lean
  const hand: Vec2 = { x: BAR_X, y: shoulder.y - BAR_ABOVE_SHOULDER };
  const elbow: Vec2 = {
    x: shoulder.x - ELBOW_DOWN * sinLean - ELBOW_BACK * cosLean,
    y: shoulder.y + ELBOW_DOWN * cosLean - ELBOW_BACK * sinLean,
  };

  // far side — same motion, offset into depth (drawn faint for the Duotone read)
  const far = (p: Vec2, dx: number, dy = 0): Vec2 => ({ x: p.x + dx, y: p.y + dy });

  return {
    headR: HEAD_R,
    j: {
      head,
      shoulder,
      elbow,
      hand,
      hip,
      knee,
      ankle: ANKLE,
      heel: HEEL,
      toe: TOE,
      bar: { x: BAR_X, y: shoulder.y - BAR_ABOVE_SHOULDER },
      farHip: far(hip, 6, 1),
      farKnee: far(knee, 7),
      farAnkle: far(ANKLE, 8),
      farHeel: far(HEEL, 8),
      farToe: far(TOE, 8),
      farShoulder: far(shoulder, 6, 1),
      farElbow: far(elbow, 6),
      farHand: far(hand, 6),
    },
  };
}

const BAR_TOP_Y = poseAt(0).j.bar.y;
const BAR_BOT_Y = poseAt(1).j.bar.y;

function decorAt(rom: number): Decor {
  const pose = poseAt(rom);
  const bar = pose.j.bar;
  return {
    back: barPathTicks(BAR_X, BAR_TOP_Y, BAR_BOT_Y),
    // near plate in front (the unmistakable "loaded barbell"), head re-drawn above it so the
    // plate rim never crosses the face — the one z-order concession readability demands
    front: [...plateGhost(bar), { kind: 'circle', c: pose.j.head, r: pose.headR, fill: 'ink1' }],
  };
}

const scene = floorScene(FLOOR_Y, 184, 30);

const formspec: FormSpec = {
  tempo: DEFAULT_TEMPO,
  start: [
    { kind: 'jointAngle', joint: 'knee', neighbors: ['ankle', 'hip'], min: 160, max: 179, label: 'knee near-extended (stand tall)' },
    { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 160, max: 179, label: 'hip near-extended (stand tall)' },
  ],
  end: [
    { kind: 'jointBelow', a: 'hip', b: 'knee', by: 2, label: 'hip crease below the knee (depth)' },
  ],
  path: { track: 'bar', kind: 'vertical', tol: 1.5 },
  invariants: [
    { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'ankle planted' },
    { kind: 'pointFixed', point: 'heel', tol: 0.5, label: 'heel never leaves the floor' },
    { kind: 'pointFixed', point: 'toe', tol: 0.5, label: 'toe planted' },
    { kind: 'angleNever', joint: 'knee', neighbors: ['ankle', 'hip'], aboveDeg: 179, label: 'no knee hyperextension' },
  ],
};

export const bbBackSquat: Rig = {
  id: 'bb_back_squat',
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
