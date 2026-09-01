/**
 * leg_raise — the legs as the lever: a rigid soft-kneed pair swinging about the hip while
 * everything above the pelvis is FIXED by what the athlete hangs from or braces on. Three
 * stations, one sweep — the glute kickback's construction pointed forward, with the trunk held
 * by furniture instead of by discipline:
 *
 *   · `hanging_leg_raise`   — full hang from the bar: the pull-up's fixed grip and hanging trunk,
 *     with the LEGS doing the moving instead of the body.
 *   · `captains_chair_raise` — forearms on the chair's pads, back against its pad: the same sweep
 *     from a braced trunk; the station is why a beginner meets this one first.
 *   · `lying_leg_raise`     — supine on the floor, hands tucked under; the sweep runs floor → up.
 *
 * ── THE FAULT THE FAMILY POLICES ────────────────────────────────────────────────────────────────
 * Swinging. On every station the cheat is momentum from the trunk — so the SHOULDER and HIP are
 * `pointFixed` (the furniture's whole job), and the legs alone travel. The knee holds one soft
 * bend across the rep (`jointAngle` at both ends), because a bend that opens and closes is a kick,
 * not a raise. "Slow, controlled" is the tempo's job; the geometry's job is that nothing else CAN
 * move.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { floorScene, padStroke, sampledPathTicks } from '../kit';
import { FLOOR_Y, far } from '../bodies';

const T = ATHLETE.thigh;
const S = ATHLETE.shank;
/** The rigid working leg: thigh + shank at one soft knee bend, swinging as a unit. */
const LEG = (T + S) * 0.93;
const KNEE_FRAC = (T * 0.97) / LEG;
const KNEE_OFF = 4; // the soft bend's sagitta — the knee rides this far off the hip→ankle chord

interface LegRaiseParams {
  id: string;
  /** The scene's own floor. The HANGING members drop it 18u (the calf raise's trick): a full leg
   *  hanging from an in-frame bar reaches BELOW the canonical floor line, and brushing the ground
   *  is the one thing a hanging raise must never draw (visual QC, 2026-08-25). */
  floorY: number;
  /** The fixed upper body: everything the furniture holds still. */
  body: { head: Vec2; shoulder: Vec2; hip: Vec2; elbow: Vec2; hand: Vec2 };
  /** The sweep, degrees from straight-DOWN for the hanging members / from along-the-floor for the
   *  lying one — measured as "the legs' direction from the hip", 0 = hanging plumb. */
  thetaFrom: number;
  thetaTo: number;
  /** Which way the legs point at θ=0: down (hanging) or along the floor (+x, lying). */
  zero: 'down' | 'forward';
  furniture: Primitive[];
}

function legRaise(p: LegRaiseParams): Rig {
  const hip = p.body.hip;
  const legAt = (theta: number): { knee: Vec2; ankle: Vec2 } => {
    const r = (theta * Math.PI) / 180;
    /* zero 'down': θ sweeps forward-up from plumb. zero 'forward': θ sweeps up from the floor. */
    const ux = p.zero === 'down' ? Math.sin(r) : Math.cos(r);
    const uy = p.zero === 'down' ? Math.cos(r) : -Math.sin(r);
    const ankle: Vec2 = { x: hip.x + LEG * ux, y: hip.y + LEG * uy };
    /* The knee rides the chord, pushed a constant sagitta toward the ceiling of the fold. */
    const px = -uy;
    const py = ux;
    return {
      knee: { x: lerp(hip.x, ankle.x, KNEE_FRAC) + KNEE_OFF * px, y: lerp(hip.y, ankle.y, KNEE_FRAC) + KNEE_OFF * py },
      ankle,
    };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => legAt(lerp(p.thetaFrom, p.thetaTo, i / 16)).ankle);

  const poseAt = (rom: number): Pose => {
    const { knee, ankle } = legAt(lerp(p.thetaFrom, p.thetaTo, rom));
    return {
      headR: ATHLETE.headR,
      j: {
        ...p.body,
        knee,
        ankle,
        heel: { x: ankle.x - 5, y: ankle.y + 5 },
        toe: { x: ankle.x + 7, y: ankle.y + 6 },
        farShoulder: far(p.body.shoulder, -6, 1),
        farElbow: far(p.body.elbow, -6, 1),
        farHand: far(p.body.hand, -6, 1),
        farHip: far(hip, -6, 1),
        farKnee: far(knee, -6, 1),
        farAnkle: far(ankle, -6, 1),
        farHeel: far({ x: ankle.x - 5, y: ankle.y + 5 }, -6, 0),
        farToe: far({ x: ankle.x + 7, y: ankle.y + 6 }, -6, 0),
      },
    };
  };

  const decorAt = (): Decor => ({ back: [...p.furniture, ...sampledPathTicks(ARC)], front: [] });

  const softKnee = (label: string) => ({
    kind: 'jointAngle' as const,
    joint: 'knee',
    neighbors: ['hip', 'ankle'] as [string, string],
    min: 148,
    max: 174,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      softKnee('legs long at the hang'),
      { kind: 'contactY', a: 'ankle', y: legAt(p.thetaFrom).ankle.y, tol: 2.5, label: 'the honest bottom — no half start' },
    ],
    end: [
      softKnee('and the same soft knee at the top — a raise, not a kick'),
      { kind: 'contactY', a: 'ankle', y: legAt(p.thetaTo).ankle.y, tol: 2.5, label: 'raised with control' },
    ],
    path: { track: 'ankle', kind: 'arc', tol: 2 },
    invariants: [
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'the pelvis is the pivot — the furniture holds it' },
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'no swinging from the trunk' },
      { kind: 'pointFixed', point: 'hand', tol: 0.5, label: 'the grip/brace does not move' },
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
    scene: floorScene(p.floorY, p.body.hip.x + 10, p.zero === 'forward' ? 56 : 0),
  };
}

/* ── hanging: the pull-up's bar and hanging trunk, arms long overhead ─────────────────────────── */
const HANG_BAR: Vec2 = { x: 168, y: 40 };
const HANG_SHOULDER: Vec2 = { x: HANG_BAR.x - 2, y: HANG_BAR.y + (ATHLETE.upperArm + ATHLETE.foreArm) * 0.98 };
const HANG_BODY = {
  head: { x: HANG_SHOULDER.x + 2, y: HANG_SHOULDER.y - ATHLETE.neck },
  shoulder: HANG_SHOULDER,
  hip: { x: HANG_SHOULDER.x + 2, y: HANG_SHOULDER.y + ATHLETE.torso },
  elbow: { x: HANG_BAR.x - 1, y: HANG_BAR.y + ATHLETE.foreArm },
  hand: HANG_BAR,
};

export const hangingLegRaise = legRaise({
  id: 'hanging_leg_raise',
  floorY: FLOOR_Y + 18,
  body: HANG_BODY,
  thetaFrom: 6,
  thetaTo: 86, // thighs to horizontal — the honest strict raise
  zero: 'down',
  furniture: [
    { kind: 'line', a: { x: HANG_BAR.x - 44, y: HANG_BAR.y }, b: { x: HANG_BAR.x + 44, y: HANG_BAR.y }, w: 3.5, color: 'ink0', cap: 'round' },
    { kind: 'line', a: { x: HANG_BAR.x - 38, y: HANG_BAR.y }, b: { x: HANG_BAR.x - 38, y: 26 }, w: 2.5, color: 'ink3' },
    { kind: 'line', a: { x: HANG_BAR.x + 38, y: HANG_BAR.y }, b: { x: HANG_BAR.x + 38, y: 26 }, w: 2.5, color: 'ink3' },
  ],
});

/* ── captain's chair: forearms on the pads, back against the pad — the braced hang ────────────── */
const CH_SHOULDER: Vec2 = { x: 160, y: 74 };
const CH_BODY = {
  head: { x: CH_SHOULDER.x + 2, y: CH_SHOULDER.y - ATHLETE.neck },
  shoulder: CH_SHOULDER,
  hip: { x: CH_SHOULDER.x + 3, y: CH_SHOULDER.y + ATHLETE.torso },
  elbow: { x: CH_SHOULDER.x + 6, y: CH_SHOULDER.y + ATHLETE.upperArm - 3 },
  hand: { x: CH_SHOULDER.x + 26, y: CH_SHOULDER.y + ATHLETE.upperArm - 5 },
};

export const captainsChairRaise = legRaise({
  id: 'captains_chair_raise',
  floorY: FLOOR_Y + 18,
  body: CH_BODY,
  thetaFrom: 6,
  thetaTo: 86,
  zero: 'down',
  furniture: [
    /* the chair: back pad, the forearm pads either side, and the frame down to the floor */
    ...padStroke({ x: CH_SHOULDER.x - 9, y: CH_SHOULDER.y - 4 }, { x: CH_SHOULDER.x - 9, y: CH_SHOULDER.y + 44 }, 7),
    ...padStroke({ x: CH_SHOULDER.x + 6, y: CH_SHOULDER.y + ATHLETE.upperArm + 1 }, { x: CH_SHOULDER.x + 30, y: CH_SHOULDER.y + ATHLETE.upperArm + 1 }, 7),
    { kind: 'line', a: { x: CH_SHOULDER.x + 28, y: CH_SHOULDER.y + ATHLETE.upperArm + 4 }, b: { x: CH_SHOULDER.x + 28, y: FLOOR_Y + 16 }, w: 2.5, color: 'ink3' },
  ],
});

/* ── lying: supine on the floor, hands tucked under the hips ──────────────────────────────────── */
const LY_HIP: Vec2 = { x: 172, y: FLOOR_Y - 9 };
const LY_SHOULDER: Vec2 = { x: LY_HIP.x - ATHLETE.torso, y: FLOOR_Y - 10 };
const LY_BODY = {
  head: { x: LY_SHOULDER.x - 15, y: LY_SHOULDER.y - 2 },
  shoulder: LY_SHOULDER,
  hip: LY_HIP,
  elbow: { x: LY_SHOULDER.x + 18, y: FLOOR_Y - 7 },
  hand: { x: LY_SHOULDER.x + 36, y: FLOOR_Y - 6 },
};

export const lyingLegRaise = legRaise({
  id: 'lying_leg_raise',
  floorY: FLOOR_Y,
  body: LY_BODY,
  thetaFrom: 4, // heels a breath off the floor — the honest bottom, never resting
  thetaTo: 78, // up toward vertical
  zero: 'forward',
  furniture: [],
});
