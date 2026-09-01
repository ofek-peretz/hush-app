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

// 

import type { Decor, FormSpec, Pose, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, floorScene } from '../kit';
import { latPulldownStation } from '../machines';

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
/**
 * Where the cable drops, and therefore how far in front of the shoulder the hand finishes.
 *
 * It was 151 — 13.5u in front of the shoulder joint, and 8u in front of the face. Two things went
 * wrong there. The bar shaved the nose; and at the collarbone the hand sat 13.6u from its own
 * shoulder, so 48u of arm folded to a 33° elbow and the upper arm came to rest exactly ON the spine
 * line, inside the trunk silhouette. The clip's whole subject — the elbow driving down and back —
 * was drawn inside the torso where nobody can see it.
 *
 * 160 is where a real pulldown pulley hangs: the athlete leans back ~15° and the bar comes down a
 * hand's length clear of the face (17u ≈ 19cm). The hand finishes 22.6u out, the elbow opens to
 * 56°, and the upper arm clears the trunk. The overhead position opens from 16° to 29° off
 * vertical, which is also the truer shape — arms reach up-and-FORWARD to a bar hung in front.
 */
const BAR_X = 160;
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

// ── the complete pulldown station (§3.5 Amendment 4 — recognition first) ─────────
function decorAt(rom: number): Decor {
  const bar: Vec2 = { x: BAR_X, y: lerp(STRETCH_Y, COLLAR_Y, rom) };
  // the cable is 1:1 — the selected plate rises exactly as far as the bar descends
  const lift = bar.y - STRETCH_Y;
  return {
    back: [...latPulldownStation(bar, lift), ...barPathTicks(BAR_X, STRETCH_Y, COLLAR_Y, 5)],
    front: [
      // the wide pulldown bar with its downswept tips — the attachment is a word (§3.5 Am. 5):
      // this exact silhouette is what names the station's handle, so it is drawn, not a tick
      {
        kind: 'polyline',
        pts: [
          { x: bar.x - 15.5, y: bar.y + 4 },
          { x: bar.x - 8.5, y: bar.y },
          { x: bar.x + 8.5, y: bar.y },
          { x: bar.x + 15.5, y: bar.y + 4 },
        ],
        w: 3.5,
        color: 'ink0',
      },
      { kind: 'circle', c: bar, r: 2.5, fill: 'ink0' },
    ],
  };
}

const scene = floorScene(FLOOR_Y, 178, 42);

const formspec: FormSpec = {
  tempo: CONCENTRIC_TEMPO,
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

/*
 * close_grip_pulldown (batch 2, 2026-08-26) — the same seat, the same anchored body, the same
 * vertical cable: what changes at a close grip is the ATTACHMENT, and §3.5 Am. 5 says the handle
 * silhouette is what names it. The wide bar's downswept tips are replaced by the narrow neutral
 * V-handle — a compact triangle under the cable, both fists together on it — and the endpoint
 * label says the chest line the cue asks for. The skeleton is untouched: at a neutral narrow grip
 * the hands ride the same front-of-face line this camera already draws.
 */
function closeGripDecorAt(rom: number): Decor {
  const bar: Vec2 = { x: BAR_X, y: lerp(STRETCH_Y, COLLAR_Y, rom) };
  const lift = bar.y - STRETCH_Y;
  return {
    back: [...latPulldownStation(bar, lift), ...barPathTicks(BAR_X, STRETCH_Y, COLLAR_Y, 5)],
    front: [
      // the narrow neutral V-handle: two short cheeks meeting at the cable's eyelet
      {
        kind: 'polyline',
        pts: [
          { x: bar.x - 6, y: bar.y + 6 },
          { x: bar.x, y: bar.y },
          { x: bar.x + 6, y: bar.y + 6 },
        ],
        w: 3.5,
        color: 'ink0',
      },
      { kind: 'circle', c: bar, r: 2.5, fill: 'ink0' },
    ],
  };
}

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

export const closeGripPulldown: Rig = {
  ...latPulldown,
  id: 'close_grip_pulldown',
  decorAt: closeGripDecorAt,
  formspec: {
    ...formspec,
    end: [{ kind: 'contactY', a: 'bar', y: COLLAR_Y, tol: 2, label: 'handle to the upper chest (never lower)' }],
  },
};
