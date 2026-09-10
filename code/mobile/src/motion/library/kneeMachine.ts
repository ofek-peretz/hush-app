/**
 * knee_extension + knee_flexion, seated — the two machines that sit facing each other in every gym
 * and do the exact opposite thing. One file, because they are one geometry with the sign flipped:
 * the thigh is held still by the seat, the KNEE is the pivot, and the shin swings.
 *
 * Authoring them together is not a convenience. It is what stops them from drifting apart — the
 * same seat, the same thigh line, the same pivot, so an athlete who meets both in one session sees
 * one machine hall rather than two unrelated drawings.
 *
 * ── EXTENSION ──────────────────────────────────────────────────────────────────────────────────
 * rom 0 = shin hanging (knee ~90°) · rom 1 = leg straight, shin horizontal. The pad rides the front
 * of the ankle and travels up and forward with it.
 *
 * ── FLEXION (SEATED CURL) ──────────────────────────────────────────────────────────────────────
 * rom 0 = leg out straight · rom 1 = shin driven DOWN and back under the seat, knee ~35°. The pad
 * sits on the BACK of the ankle and is pushed down. A thigh pad holds the leg on the seat, which is
 * the machine's whole point and the reason the hip may not help.
 *
 * ── WHAT BOTH REFUSE ───────────────────────────────────────────────────────────────────────────
 * The universal cheat on both machines is the same: the hips lift off the seat and the torso throws
 * the weight through. `pointFixed` on the hip AND on the knee, plus a torso angle that may not
 * change, mean the only thing left that can move the pad is the shin. The pad is drawn ON the
 * tracked ankle so the drawing and the constraint are the same fact.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { sticksAt } from '../curves';

/** A single-joint rig still has a sticking point — the last fifth, where the moment arm is longest;
 *  the driver slows there and arrives (iron rule 12, 2026-09-07). Endpoints untouched. */
const STICK = sticksAt(0.85, 0.06);
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { floorScene, machineSeat, padStroke, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far, seatedCore } from '../bodies';

const core = seatedCore(0, 8); // a shade of recline — the seat back she is pressed into
const SHANK = ATHLETE.shank;
const KNEE = core.knee;

/**
 * θ = the shin's angle from straight-DOWN, opening forward. θ=0 is the shin hanging; θ=90 is the
 * leg straight out in front. Interior knee angle rises with θ, so both machines are authored in the
 * one number and their FormSpecs read it back as degrees.
 */
const ankleAt = (theta: number): Vec2 => {
  const r = (theta * Math.PI) / 180;
  return { x: KNEE.x + SHANK * Math.sin(r), y: KNEE.y + SHANK * Math.cos(r) };
};

const THETA_HANG = 4; // shin hanging, just off vertical — the extension machine's start
const THETA_OUT = 88; // leg straight out — extension's end, and flexion's start
const THETA_TUCK = -46; // shin driven back UNDER the seat — flexion's end

const kneeChains = {
  torso: ['hip', 'shoulder'] as [string, string],
  neck: ['shoulder', 'head'] as [string, string],
  head: 'head',
  nearArm: ['shoulder', 'elbow', 'hand'],
  farArm: ['farShoulder', 'farElbow', 'farHand'],
  nearLeg: ['hip', 'knee', 'ankle'],
  nearFoot: ['heel', 'toe'] as [string, string],
  farLeg: ['farHip', 'farKnee', 'farAnkle'],
  farFoot: ['farHeel', 'farToe'] as [string, string],
};

interface KneeParams {
  id: string;
  thetaStart: number;
  thetaEnd: number;
  /** Which side of the ankle the resistance pad presses on. */
  padOn: 'front' | 'back';
  start: FormSpec['start'];
  end: FormSpec['end'];
}

function kneeMachine(p: KneeParams): Rig {
  const ARC = Array.from({ length: 17 }, (_, i) => ankleAt(lerp(p.thetaStart, p.thetaEnd, i / 16)));

  const poseAt = (rom: number): Pose => {
    const theta = lerp(p.thetaStart, p.thetaEnd, STICK(rom));
    const ankle = ankleAt(theta);
    /* The foot keeps its own line off the shin — toes lead, heel trails, whatever the shin does. */
    const r = (theta * Math.PI) / 180;
    const along: Vec2 = { x: Math.sin(r), y: Math.cos(r) };
    const toe: Vec2 = { x: ankle.x + along.y * 13 + along.x * 5, y: ankle.y - along.x * 13 + along.y * 5 };
    const heel: Vec2 = { x: ankle.x - along.y * 8 + along.x * 3, y: ankle.y + along.x * 8 + along.y * 3 };
    /* Hands hold the seat's side grips — still, at the hips, on both machines. */
    const shoulder = core.shoulder;
    const elbow: Vec2 = { x: shoulder.x + 6, y: shoulder.y + ATHLETE.upperArm };
    const hand: Vec2 = { x: core.hip.x + 6, y: core.hip.y - 4 };
    return {
      headR: ATHLETE.headR,
      j: {
        head: core.head,
        shoulder,
        hip: core.hip,
        knee: KNEE,
        ankle,
        heel,
        toe,
        elbow,
        hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(core.hip, -6, 1),
        farKnee: far(KNEE, -6, 1),
        farAnkle: far(ankle, -6, 1),
        farHeel: far(heel, -6, 0),
        farToe: far(toe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const ankle = pose.j.ankle;
    const theta = lerp(p.thetaStart, p.thetaEnd, STICK(rom));
    const r = (theta * Math.PI) / 180;
    /* The pad's normal — perpendicular to the shin, on whichever face takes the load. */
    const sign = p.padOn === 'front' ? 1 : -1;
    const n: Vec2 = { x: sign * Math.cos(r), y: -sign * Math.sin(r) };
    const padC: Vec2 = { x: ankle.x + n.x * 7, y: ankle.y + n.y * 7 };
    /* The pad is a short roller across the shin, and the lever runs from it back to the knee axis. */
    const padA: Vec2 = { x: padC.x + Math.sin(r) * 7, y: padC.y + Math.cos(r) * 7 };
    const padB: Vec2 = { x: padC.x - Math.sin(r) * 7, y: padC.y - Math.cos(r) * 7 };

    /* The stack rises with the work, whichever direction the shin travels. */
    const travelled = Math.abs(theta - p.thetaStart) / Math.abs(p.thetaEnd - p.thetaStart || 1);
    const tower = stackTower({ x0: 246, x1: 272, capY: 74, stackTopY: FLOOR_Y - 34 }, travelled * 26);

    const back: Primitive[] = [
      ...tower.prims,
      /* One machine, not a chair beside a tower: the base rail ties the seat to the stack (2026-09-07). */
      { kind: 'line', a: { x: core.hip.x - 30, y: FLOOR_Y - 3 }, b: { x: 272, y: FLOOR_Y - 3 }, w: 2.5, color: 'ink3', cap: 'round' },
      ...machineSeat(core.hip.x + 4, core.hip.y + 6, FLOOR_Y, { x: core.shoulder.x - 9, y0: core.shoulder.y - 6, y1: core.hip.y }),
      // The THIGH PAD — the bar across the top of the leg that makes the machine a machine.
      ...padStroke({ x: KNEE.x - 26, y: KNEE.y - 11 }, { x: KNEE.x - 6, y: KNEE.y - 11 }, 7),
      // The pivot the whole lever turns on, drawn at the knee because that is where it must be.
      { kind: 'circle', c: KNEE, r: 4, fill: 'paper2', stroke: 'ink3', w: 2 },
      { kind: 'line', a: KNEE, b: padC, w: 2.5, color: 'ink3' },
      ...sampledPathTicks(ARC),
    ];
    return { back, front: padStroke(padA, padB, 8) };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: p.start,
    end: p.end,
    path: { track: 'ankle', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'the knee is the pivot — it does not travel' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips stay on the seat' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the torso does not throw it' },
    ],
  };

  return { id: p.id, chains: kneeChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 180, 34) };
}

const kneeAngle = (min: number, max: number, label: string) => [
  { kind: 'jointAngle' as const, joint: 'knee', neighbors: ['hip', 'ankle'] as [string, string], min, max, label },
];

export const legExtension = kneeMachine({
  id: 'leg_extension',
  thetaStart: THETA_HANG,
  thetaEnd: THETA_OUT,
  padOn: 'front',
  start: kneeAngle(70, 105, 'shins hanging, knees square'),
  end: kneeAngle(150, 179, 'straighten the leg out in front'),
});

export const seatedLegCurl = kneeMachine({
  id: 'seated_leg_curl',
  thetaStart: THETA_OUT,
  thetaEnd: THETA_TUCK,
  padOn: 'back',
  start: kneeAngle(150, 179, 'legs out straight'),
  end: kneeAngle(30, 65, 'drive the heels down and under you'),
});
