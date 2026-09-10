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

// 

import type { Decor, FormSpec, Pose, Rig, Vec2 } from '../types';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { leads } from '../curves';
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

/**
 * How far BEHIND the shoulder joint the bar sits, in `squatCore`'s `carryDX` sign convention
 * (positive = in front of the shoulder, so a back squat is negative).
 *
 * It was 0, which put the bar dot exactly over the shoulder joint — and since the head is drawn
 * directly above the shoulder too, the bar read as passing THROUGH the neck. A high-bar squat is
 * carried on the trapezius SHELF, behind the neck: about 5cm behind the glenohumeral joint, which
 * is 4.5u here. Moving it there is not decoration. The lean is solved so that the CARRY sits over
 * the mid-foot, so the bar going behind the shoulder pushes the shoulder itself forward of the
 * balance line — and the extra ~7° of forward lean that produces is the lean a high-bar squat
 * actually has. The old number was drawing a squat balanced on a bar it was not holding.
 */
const BAR_BEHIND_SHOULDER = -4.5;

// leg drive: shank angle from vertical, thigh angle from horizontal (hip up-&-back of knee)
const SHANK_TOP = 6; // nearly vertical standing
const SHANK_BOT = 32; // knee travels forward over the foot
const THIGH_TOP = 84; // thigh ~vertical, hip stacked over knee (standing tall)
const THIGH_BOT = -5.5; // hip drops below the knee (depth)
const HEAD_FOLLOW = 0.7; // the neck follows the torso lean, biased upright (neutral spine, eyes forward)

// the grip, authored in the torso frame: elbow down-and-back of the shoulder, forearm to the bar
const ELBOW_DOWN = 18;

/** The shin finishes its forward travel with a fifth of the descent left; the hip keeps going. */
const SHIN_LEADS = leads(0.2);
/* 9 → 12: the elbow now clears the trunk's back line, so the forearm's ink0 rise to the bar is a
   stroke of its own rather than a lump behind the neck. The elbow ANGLE stays ~16° whatever the
   elbow does — the hand is 4.5u behind and 3.5u above the shoulder, and two vectors from one point
   to two points that close cannot open; a wider grip is depth from this camera. The read comes
   from the two-ink split (`nearArmInk`) instead (audit, 2026-09-03). */
const ELBOW_BACK = 12;

/**
 * The squat SKELETON, exported for the variant family (front · goblet · smith, 2026-08-25).
 *
 * `carryDX` is where the load sits horizontally RELATIVE TO THE SHOULDER JOINT, and it is the one
 * number that separates the squats: 0 = on the traps (back squat, smith), positive = in front of
 * the shoulder (front rack ≈ 5, goblet ≈ 8). The torso lean is still SOLVED — the carry point,
 * not the shoulder, stays over the mid-foot — so a front carry yields the visibly more upright
 * torso a front squat actually has, from the same equation rather than from a tuned lean. The leg
 * drive, the planted foot and the balance line are shared verbatim: one squat, four bars.
 */
export function squatCore(rom: number, carryDX = 0, footDX = 0) {
  /*
   * THE KNEE TRAVELS FIRST, AND THEN THE HIP DROPS BETWEEN THE KNEES.
   *
   * Both angles used to be plain `lerp(..., rom)`, so the shin and the thigh swept in lockstep for
   * the whole descent. That is not how a squat is broken down and it is not how one looks: the
   * knees carry most of their forward travel in the first half, and from about there the shin is
   * essentially parked while the hips keep dropping. Sequencing them apart is what separates a
   * squat from a slow fold, and — with the torso lean SOLVED off the hip rather than authored — it
   * costs nothing at either endpoint: the shin arrives at exactly `SHANK_BOT` and the thigh at
   * exactly `THIGH_BOT`, which is what depth, the bar line and the FormSpec are all measured on.
   */
  const shank = lerp(SHANK_TOP, SHANK_BOT, SHIN_LEADS(rom)) * DEG;
  const thigh = lerp(THIGH_TOP, THIGH_BOT, rom) * DEG;

  /* `footDX` slides the planted foot along the floor while the balance line stays put — the Smith
     squat stands its feet in front of the bar, because the machine holds it (audit, 2026-09-03). */
  const knee: Vec2 = { x: ANKLE.x + footDX + L_SHANK * Math.sin(shank), y: ANKLE.y - L_SHANK * Math.cos(shank) };
  const hip: Vec2 = { x: knee.x - L_THIGH * Math.cos(thigh), y: knee.y - L_THIGH * Math.sin(thigh) };

  // solve the torso lean so the CARRY (shoulder + carryDX) sits over the mid-foot line
  const sinLean = Math.max(-0.6, Math.min(0.6, (BAR_X - carryDX - hip.x) / L_TORSO));
  const cosLean = Math.sqrt(1 - sinLean * sinLean);
  const shoulder: Vec2 = { x: hip.x + L_TORSO * sinLean, y: hip.y - L_TORSO * cosLean };
  const sinHead = sinLean * HEAD_FOLLOW;
  const cosHead = Math.sqrt(1 - sinHead * sinHead);
  const head: Vec2 = { x: shoulder.x + NECK * sinHead, y: shoulder.y - NECK * cosHead };
  return { knee, hip, shoulder, head, sinLean, cosLean };
}

export { ANKLE as SQUAT_ANKLE, HEEL as SQUAT_HEEL, TOE as SQUAT_TOE, BAR_X as SQUAT_BAR_X };

function poseAt(rom: number): Pose {
  const { knee, hip, shoulder, head, sinLean, cosLean } = squatCore(rom, BAR_BEHIND_SHOULDER);

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
    /* The folded grip arm in two inks — upper arm in the trunk's, forearm in the near limb's —
       so a 16° elbow reads as a bent arm holding the bar, not as one lump (audit, 2026-09-03). */
    nearArmInk: { upper: 'ink1', fore: 'ink0' },
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
