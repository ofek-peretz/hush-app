/**
 * press_horizontal — the five members beyond the bb_bench_press benchmark, ALL FRONT-VIEW per
 * §3.4 Amendment 7 (founder directive 2026-07-08: the chest family is a frontal identity family —
 * its recognition lives in upper-body symmetry, and the frontal presentation is a product
 * decision, not a per-rig trade).
 *
 * Two frontal stagings implement the whole family:
 *
 * 1. LYING MEMBERS — the head-end camera (the spotter's frame). A lying press's stroke is
 *    world-vertical, so face-on it lives fully in the drawing plane: lockout arms are canonical
 *    25/23 in-plane, and the one projected fold (rule 3) is at the chest — the humerus tucks
 *    toward the feet as the implement descends (25 → uProj across the rep), stacking the
 *    forearms vertically under the grip. The camera also states what the side view never could:
 *    both arms, both plates/dumbbells, the straddle over the end-on bench, and (barbell members)
 *    the RACK goalpost. Incline members raise the shoulder line (`raise`) and rest against a
 *    visible reclined back pad; dumbbell members converge slightly to the top — the honest arc —
 *    and carry NO rack.
 *
 * 2. THE SEATED MACHINE — the perspective license (§3.4 Am. 7). Its stroke runs along the camera
 *    axis, where orthographic projection leaves no pixels (proven 2026-07-07); depth is therefore
 *    drawn as SCALE: fists, handles, and press-arm struts grow as they near the viewer, the
 *    elbow flare sweeps from wide to gone-behind-the-fists, and the stack rides 1:1 with the true
 *    3D stroke. Rep anchor per §3.6: the machine opens at the chest and PRESSES first.
 */
import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, lerpV, twoBoneIK } from '../geometry';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE, LIMB_W } from '../anthro';
import {
  barPathTicks,
  barbellFront,
  benchEndOn,
  dumbbellFront,
  floorScene,
  inclineBackPadFront,
  linePathTicks,
  rackUprights,
} from '../kit';
import { chestPressStation } from '../machines';
import { FLOOR_Y, seatedFrontCore, supineFrontCore } from '../bodies';

const CX = 176;
const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;
const LOCKOUT_ANGLE = 172;
const REACH = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos((LOCKOUT_ANGLE * Math.PI) / 180));

// ── the lying members ────────────────────────────────────────────────────────────

interface LyingPressParams {
  id: string;
  /** Shoulder-line elevation for incline benches (0 = flat). */
  raise: number;
  /** Projected humerus length at the chest endpoint (rule-3 fold; 25 in-plane at lockout). */
  uProj: number;
  implement: 'bar' | 'db';
  /** Barbell members: grip half-width (hands fixed on the bar). */
  grip?: number;
  /** Contact height of the implement at the chest endpoint. */
  contactY: number;
  /** Dumbbell members: hand x at the bottom (wide, deep) and at the top (converged). */
  dbBottomX?: number;
  dbTopX?: number;
  contactLabel: string;
}

function lyingPress(p: LyingPressParams): Rig {
  const core = supineFrontCore(CX, p.raise);
  const isDb = p.implement === 'db';
  const bottomDX = (isDb ? p.dbBottomX! : p.grip!) - 15.5;
  const topDX = (isDb ? p.dbTopX! : p.grip!) - 15.5;
  const lockY = core.shoulderR.y - Math.sqrt(REACH * REACH - topDX * topDX);
  const top: Vec2 = { x: CX + (isDb ? p.dbTopX! : p.grip!), y: lockY };
  const bottom: Vec2 = { x: CX + (isDb ? p.dbBottomX! : p.grip!), y: p.contactY };

  const poseAt = (rom: number): Pose => {
    const handR = lerpV(top, bottom, rom);
    const handL: Vec2 = { x: 2 * CX - handR.x, y: handR.y };
    const uEff = lerp(U, p.uProj, rom);
    return {
      headR: ATHLETE.headR,
      j: {
        ...core,
        handR,
        handL,
        elbowR: twoBoneIK(core.shoulderR, handR, uEff, F, 1),
        elbowL: twoBoneIK(core.shoulderL, handL, uEff, F, -1),
        ...(isDb ? {} : { bar: { x: CX, y: handR.y } }),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const handR = lerpV(top, bottom, rom);
    const back: Primitive[] = [...benchEndOn(CX, 160, FLOOR_Y)];
    if (p.raise > 0) back.push(...inclineBackPadFront(CX, 125, 161)); // fused into the bench pad
    if (!isDb) {
      back.push(
        ...rackUprights(CX, 42, lockY + 6, FLOOR_Y),
        ...barPathTicks(CX + 52, lockY, p.contactY),
        ...barbellFront(CX, handR.y), // beyond the fists from this camera — the fists close over it
      );
      return { back, front: [] };
    }
    back.push(...linePathTicks({ x: top.x + 13, y: top.y }, { x: bottom.x + 13, y: bottom.y }));
    return {
      back,
      // both dumbbells travel — the two-implement statement, palms forward (spin 1)
      front: [...dumbbellFront({ x: 2 * CX - handR.x, y: handR.y }), ...dumbbellFront(handR)],
    };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], min: 165, max: 179, label: 'lockout (full press) — the unrack' },
    ],
    end: [{ kind: 'contactY', a: isDb ? 'handR' : 'bar', y: p.contactY, tol: 2, label: p.contactLabel }],
    path: isDb
      ? { track: 'handR', kind: 'line', tol: 1.5, dir: { x: bottom.x - top.x, y: bottom.y - top.y } }
      : { track: 'handR', kind: 'vertical', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'ankleR', tol: 1, label: 'feet planted' },
      { kind: 'pointFixed', point: 'toeR', tol: 1, label: 'toes planted' },
      { kind: 'pointFixed', point: 'hipC', tol: 1, label: 'hips on the bench' },
      { kind: 'pointFixed', point: 'shoulderR', tol: 1, label: 'shoulders on the bench' },
      { kind: 'pointFixed', point: 'head', tol: 1, label: 'head still' },
      { kind: 'angleNever', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return {
    id: p.id,
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
}

export const inclineBbPress = lyingPress({
  id: 'incline_bb_press',
  raise: 12,
  uProj: 17,
  implement: 'bar',
  grip: 27,
  contactY: 131,
  contactLabel: 'bar touches the upper-chest line',
});

export const dbBenchPress = lyingPress({
  id: 'db_bench_press',
  raise: 0,
  uProj: 17,
  implement: 'db',
  dbBottomX: 31, // wider and a touch deeper than the bar — the honest dumbbell stretch
  dbTopX: 22, // dumbbells converge over the chest
  contactY: 141,
  contactLabel: 'dumbbells to the chest line',
});

export const inclineDbPress = lyingPress({
  id: 'incline_db_press',
  raise: 12,
  uProj: 17,
  implement: 'db',
  dbBottomX: 31,
  dbTopX: 22,
  contactY: 132,
  contactLabel: 'dumbbells to the upper-chest line',
});

export const closeGripBench = lyingPress({
  id: 'close_grip_bench',
  raise: 0,
  uProj: 14, // the tuck: upper arms fold along the torso into depth — elbows stay narrow
  implement: 'bar',
  grip: 17,
  contactY: 140,
  contactLabel: 'bar touches the lower-chest line',
});

// ── machine_chest_press — seated FRONT-VIEW under the perspective license (§3.4 Am. 7) ──
// The press stroke travels along the camera axis. Orthographically that leaves no pixels (the
// 2026-07-07 prototype proved it in a strip), so depth is drawn as SCALE: screen = center +
// offset · D/(D−depth). The fists and handles grow with the stroke, the elbow flare sweeps from
// wide-at-the-chest to gone-behind-the-fists, the struts lengthen toward the viewer, and the
// stack rides the TRUE 3D stroke 1:1 — the range ticks live on the tower, the one in-plane
// image of the depth stroke. Rep anchor per §3.6: opens at the chest, PRESSES first.
export const machineChestPress: Rig = (() => {
  const core = seatedFrontCore(CX);
  const C: Vec2 = { x: CX, y: 112 }; // where the press axis pierces the drawing plane
  const D = 72; // perspective camera distance (frame units)
  const STROKE = 30; // the true 3D stroke, chest → lockout
  const f = (depth: number) => D / (D - depth);
  // authored 3D endpoints: lateral offset from the axis, absolute height, depth toward camera
  const FIST = { lx: [20, 17], y: [116, 113], d: [0, STROKE] } as const;
  const ELBOW = { lx: [37, 16], y: [118, 114], d: [-3, 16] } as const;
  const at = (e: { lx: readonly [number, number]; y: readonly [number, number]; d: readonly [number, number] }, rom: number, side: 1 | -1): Vec2 => {
    const s = f(lerp(e.d[0], e.d[1], rom));
    return { x: C.x + side * lerp(e.lx[0], e.lx[1], rom) * s, y: C.y + (lerp(e.y[0], e.y[1], rom) - C.y) * s };
  };
  const fistScale = (rom: number) => f(lerp(FIST.d[0], FIST.d[1], rom));

  const poseAt = (rom: number): Pose => ({
    headR: ATHLETE.headR,
    fistR: LIMB_W.handR * fistScale(rom), // the perspective statement on the body itself
    j: {
      ...core,
      handR: at(FIST, rom, 1),
      handL: at(FIST, rom, -1),
      elbowR: at(ELBOW, rom, 1),
      elbowL: at(ELBOW, rom, -1),
      // the validator's honest depth axis: the true 3D stroke as a measurable pseudo-joint
      stroke: { x: lerp(0, STROKE, rom), y: 0 },
    },
  });

  const handle = (fist: Vec2, s: number): Primitive[] => [
    { kind: 'line', a: { x: fist.x, y: fist.y - 8 * s }, b: { x: fist.x, y: fist.y + 8 * s }, w: 3.2 * s, color: 'ink0', cap: 'round' },
    { kind: 'circle', c: fist, r: 2.5 * s, fill: 'ink0' },
  ];

  const decorAt = (rom: number): Decor => {
    const s = fistScale(rom);
    const fistR = at(FIST, rom, 1);
    const fistL = at(FIST, rom, -1);
    return {
      back: [
        ...chestPressStation(CX, fistR, fistL, s, STROKE * rom),
        // the range statement rides the stack: the plate top touches a tick at each endpoint
        ...barPathTicks(248, 142, 142 - STROKE),
      ],
      front: [...handle(fistL, s), ...handle(fistR, s)],
    };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'contactX', a: 'stroke', x: 0, tol: 0.5, label: 'handles home at the chest — where the machine rests' },
      { kind: 'contactX', a: 'handR', x: CX + 20, tol: 2, label: 'fists beside the chest' },
      { kind: 'contactX', a: 'elbowR', x: CX + 35.7, tol: 2.5, label: 'elbows flared wide — the loaded press (position, per §3.4 rule 4)' },
    ],
    end: [
      { kind: 'contactX', a: 'stroke', x: STROKE, tol: 0.5, label: 'full stroke — lockout toward the viewer' },
      { kind: 'contactX', a: 'handR', x: CX + 29.1, tol: 2, label: 'fists at the shoulder line, nearest the camera' },
    ],
    path: { track: 'stroke', kind: 'horizontal', tol: 0.5 },
    invariants: [
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 3, label: 'back on the pad (no drive-off)' },
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'hips on the seat' },
      { kind: 'pointFixed', point: 'shoulderR', tol: 0.5, label: 'shoulders on the pad' },
      { kind: 'pointFixed', point: 'head', tol: 0.5, label: 'head still' },
      { kind: 'pointFixed', point: 'ankleR', tol: 0.5, label: 'feet planted' },
    ],
  };

  return {
    id: 'machine_chest_press',
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
    scene: floorScene(FLOOR_Y, CX, 42),
  };
})();
