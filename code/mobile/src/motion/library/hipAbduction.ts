/**
 * abduction + adduction — the seated pair, one machine sat two ways (the knee machines' rule, and
 * the pec deck's): pads at the knees, and the THIGHS sweep apart — or together. FRONT VIEW, the
 * third time this library has said the same sentence: a frontal-plane sweep vanishes from the
 * side (the thigh would just shorten), and face-on it is the plainest movement the machine hall
 * offers. The seated front core is the body; only the knees and ankles travel.
 *
 * ── MECHANISM ───────────────────────────────────────────────────────────────────────────────────
 * Each leg is a rigid thigh+shank unit swinging about its own fixed hip — the lateral raise's
 * construction, leg-sized, downward. θ is the thigh's spread from straight-down. ABduction runs
 * rom 0→1 as together→apart (the working squeeze is OUT, against the pads on the outer knee);
 * ADduction runs apart→together (pads inside). The two are one parameterised sweep with the
 * direction flipped — sat two ways, like the deck.
 *
 * ── WHAT THE INVARIANTS FORBID ──────────────────────────────────────────────────────────────────
 * The universal cheat: rocking the pelvis and leaning into the frame. `pointFixed` on both hips,
 * the trunk angle frozen, and the shoulders still — the legs sweep, the body is furniture.
 *
 * The cable members (`cable_hip_abduction` / `cable_hip_adduction`) are STANDING single-leg
 * versions of the same sweeps; they ride the same builder with a standing core and one working
 * leg, cuffed to a low pulley at the side.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { cable, floorScene, padStroke, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, seatedFrontCore, standingFrontCore } from '../bodies';

const CX = 176;
const T = ATHLETE.thigh;
const S = ATHLETE.shank;

const abductionChains = {
  torso: ['hipC', 'neckBase'] as [string, string],
  neck: ['neckBase', 'head'] as [string, string],
  head: 'head',
  view: 'front' as const,
  nearArm: ['shoulderR', 'elbowR', 'handR'],
  farArm: ['shoulderL', 'elbowL', 'handL'],
  nearLeg: ['hipR', 'kneeR', 'ankleR'],
  farLeg: ['hipL', 'kneeL', 'ankleL'],
  nearFoot: ['heelR', 'toeR'] as [string, string],
  farFoot: ['heelL', 'toeL'] as [string, string],
};

/* ── the seated pair ──────────────────────────────────────────────────────────────────────────── */

const seated = seatedFrontCore(CX);
/** Seated, the thigh projects short (toward the camera) and the shin hangs; the visible sweep is
 *  the KNEE's lateral travel. Thigh's projected length seated ≈ the core's own knee offset. */
const SEATED_THIGH_PROJ = 26;
const SEATED_SHIN = 34;

function seatedLegAt(theta: number, side: 1 | -1): { knee: Vec2; ankle: Vec2 } {
  const r = (theta * Math.PI) / 180;
  const hip = side === 1 ? seated.hipR : seated.hipL;
  const knee: Vec2 = { x: hip.x + side * SEATED_THIGH_PROJ * Math.sin(r) + side * 6, y: hip.y - 4 };
  return { knee, ankle: { x: knee.x + side * 4, y: knee.y + SEATED_SHIN } };
}

interface SeatedPairParams {
  id: string;
  /** together→apart (abduction) or apart→together (adduction). Degrees of spread per side. */
  thetaFrom: number;
  thetaTo: number;
  /** Which side of the knee the pad presses. */
  padSide: 1 | -1;
}

function seatedSweep(p: SeatedPairParams): Rig {
  const ARC = Array.from({ length: 17 }, (_, i) => seatedLegAt(lerp(p.thetaFrom, p.thetaTo, i / 16), 1).knee);

  const poseAt = (rom: number): Pose => {
    const theta = lerp(p.thetaFrom, p.thetaTo, rom);
    const R = seatedLegAt(theta, 1);
    const L = seatedLegAt(theta, -1);
    /* Hands hold the side grips at the hips. */
    const elbowR: Vec2 = { x: seated.shoulderR.x + 4, y: seated.shoulderR.y + 24 };
    const handR: Vec2 = { x: seated.hipR.x + 10, y: seated.hipR.y - 2 };
    return {
      headR: ATHLETE.headR,
      j: {
        ...seated,
        kneeR: R.knee,
        ankleR: R.ankle,
        heelR: { x: R.ankle.x - 4, y: R.ankle.y + 6 },
        toeR: { x: R.ankle.x + 5, y: R.ankle.y + 7 },
        kneeL: L.knee,
        ankleL: L.ankle,
        heelL: { x: L.ankle.x + 4, y: L.ankle.y + 6 },
        toeL: { x: L.ankle.x - 5, y: L.ankle.y + 7 },
        elbowR,
        handR,
        elbowL: { x: seated.shoulderL.x - 4, y: seated.shoulderL.y + 24 },
        handL: { x: seated.hipL.x - 10, y: seated.hipL.y - 2 },
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    /*
     * The station. It used to be one rounded rectangle behind the trunk and nothing else: a back
     * pad narrower than the athlete, no seat under him, no frame on the floor and no load anywhere.
     * `equipment: 'machine'` has to be a machine (§3.5), so the pad is widened past the trunk, the
     * seat and its posts are grounded, and the stack stands beside the frame and rises with the
     * knees — the resistance moves, which is what separates a station from a chair.
     */
    const spread = Math.abs(pose.j.kneeR.x - pose.j.kneeL.x);
    const spread0 = Math.abs(poseAt(0).j.kneeR.x - poseAt(0).j.kneeL.x);
    const tower = stackTower({ x0: 250, x1: 274, capY: 78, stackTopY: FLOOR_Y - 34 }, Math.abs(spread - spread0) * 0.7);
    const back: Primitive[] = [
      ...tower.prims,
      { kind: 'line', a: { x: CX + 27, y: 96 }, b: { x: 250, y: 96 }, w: 2.5, color: 'ink3' },
      { kind: 'rect', x: CX - 27, y: 62, width: 54, height: 66, rx: 8, fill: 'paper3', stroke: 'ink3', w: 2 },
      { kind: 'rect', x: CX - 30, y: 158, width: 60, height: 8, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
      { kind: 'line', a: { x: CX - 20, y: 166 }, b: { x: CX - 20, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
      { kind: 'line', a: { x: CX + 20, y: 166 }, b: { x: CX + 20, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
      ...sampledPathTicks(ARC),
    ];
    /* The two pads ride the knees, on the working side of each. */
    const front: Primitive[] = [
      ...padStroke(
        { x: pose.j.kneeR.x + p.padSide * 7, y: pose.j.kneeR.y - 8 },
        { x: pose.j.kneeR.x + p.padSide * 7, y: pose.j.kneeR.y + 8 },
        7,
      ),
      ...padStroke(
        { x: pose.j.kneeL.x - p.padSide * 7, y: pose.j.kneeL.y - 8 },
        { x: pose.j.kneeL.x - p.padSide * 7, y: pose.j.kneeL.y + 8 },
        7,
      ),
    ];
    return { back, front };
  };

  const kneeX = (theta: number) => seatedLegAt(theta, 1).knee.x;

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [{ kind: 'contactX', a: 'kneeR', x: kneeX(p.thetaFrom), tol: 2, label: 'settled against the pads' }],
    end: [{ kind: 'contactX', a: 'kneeR', x: kneeX(p.thetaTo), tol: 2, label: 'swept all the way — and held a beat' }],
    path: { track: 'kneeR', kind: 'horizontal', tol: 2 },
    invariants: [
      { kind: 'pointFixed', point: 'hipR', tol: 0.5, label: 'the pelvis does not rock' },
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'seated, and staying seated' },
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 3, label: 'no leaning into the frame' },
      { kind: 'pointFixed', point: 'shoulderR', tol: 0.5, label: 'the shoulders are still' },
    ],
  };

  return { id: p.id, chains: abductionChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, CX, 40) };
}

export const hipAbductionRig = seatedSweep({ id: 'hip_abduction', thetaFrom: 4, thetaTo: 34, padSide: 1 });
export const hipAdductionRig = seatedSweep({ id: 'hip_adduction', thetaFrom: 34, thetaTo: 4, padSide: -1 });

/* ── the standing cable pair: one leg sweeps, cuffed to the low pulley at the side ─────────────── */

const standing = standingFrontCore(CX - 10);

interface CablePairParams {
  id: string;
  /** The working leg's spread from straight-down: small→wide (abduction) or wide→across (adduction). */
  thetaFrom: number;
  thetaTo: number;
  /** Pulley side relative to the sweep: abduction pulls from the OPPOSITE side, adduction from its own. */
  pulleyX: number;
}

function cableSweep(p: CablePairParams): Rig {
  const LEG = (T + S) * 0.97;
  const hip = standing.hipR;
  const legAt = (theta: number): Vec2 => {
    const r = (theta * Math.PI) / 180;
    return { x: hip.x + LEG * Math.sin(r), y: hip.y + LEG * Math.cos(r) };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => legAt(lerp(p.thetaFrom, p.thetaTo, i / 16)));
  const PULLEY: Vec2 = { x: p.pulleyX, y: FLOOR_Y - 10 };

  const poseAt = (rom: number): Pose => {
    const ankle = legAt(lerp(p.thetaFrom, p.thetaTo, rom));
    const knee: Vec2 = { x: lerp(hip.x, ankle.x, T / (T + S)) + 2, y: lerp(hip.y, ankle.y, T / (T + S)) };
    /* One hand steadies on the frame at the pulley's side. */
    const handR: Vec2 = { x: standing.shoulderR.x + 20, y: standing.shoulderR.y + 30 };
    return {
      headR: ATHLETE.headR,
      j: {
        ...standing,
        kneeR: knee,
        ankleR: ankle,
        heelR: { x: ankle.x - 5, y: ankle.y + 6 },
        toeR: { x: ankle.x + 5, y: ankle.y + 7 },
        elbowR: { x: standing.shoulderR.x + 12, y: standing.shoulderR.y + 16 },
        handR,
        elbowL: { x: standing.shoulderL.x - 4, y: standing.shoulderL.y + 24 },
        handL: { x: standing.hipL.x - 8, y: standing.hipL.y + 2 },
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const risen = rom * 16;
    const towerX0 = p.pulleyX > CX ? p.pulleyX + 6 : p.pulleyX - 32;
    const tower = stackTower({ x0: towerX0, x1: towerX0 + 26, capY: FLOOR_Y - 96, stackTopY: FLOOR_Y - 34 }, risen);
    return {
      back: [...sampledPathTicks(ARC), ...tower.prims, ...pulley(PULLEY)],
      front: [cable(PULLEY, pose.j.ankleR)],
    };
  };

  const ankleX = (theta: number) => legAt(theta).x;

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [{ kind: 'contactX', a: 'ankleR', x: ankleX(p.thetaFrom), tol: 2, label: 'the working leg at rest' }],
    end: [{ kind: 'contactX', a: 'ankleR', x: ankleX(p.thetaTo), tol: 2.5, label: 'swept against the cable — squeeze' }],
    path: { track: 'ankleR', kind: 'arc', tol: 2 },
    invariants: [
      { kind: 'pointFixed', point: 'hipR', tol: 0.5, label: 'the hip is the hinge, and it stays' },
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'no hitching the pelvis' },
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 3, label: 'the body stands tall' },
      { kind: 'pointFixed', point: 'ankleL', tol: 0.5, label: 'the stance foot is planted' },
    ],
  };

  return { id: p.id, chains: abductionChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, CX - 10, 38) };
}

export const cableHipAbduction = cableSweep({ id: 'cable_hip_abduction', thetaFrom: 5, thetaTo: 34, pulleyX: CX - 96 });
export const cableHipAdduction = cableSweep({ id: 'cable_hip_adduction', thetaFrom: 30, thetaTo: 2, pulleyX: CX + 84 });
