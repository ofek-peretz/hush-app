/**
 * lateral_raise — shoulder ABDUCTION, and the mirror image of the curl's authoring problem. The
 * curl is sagittal and had to be drawn from the side; this is a rotation in the FRONTAL plane, so
 * it can only be drawn face-on (`view: 'front'`). From the side a lateral raise is an arm that
 * shortens and comes back — the movement is invisible.
 *
 * ── THE TEMPLATE ────────────────────────────────────────────────────────────────────────────────
 * rom 0 = arms at the sides · rom 1 = arms level with the shoulder, and NOT past it. The pivot is
 * the shoulder, so `path.kind` is `'arc'` and the range statement rides the sampled true path,
 * exactly as the curl's does.
 *
 * ── THE THREE ERRORS THE INVARIANTS FORBID ──────────────────────────────────────────────────────
 *   1. **Raising past the shoulder.** Above horizontal the trapezius takes the work and the whole
 *      point of the lift is gone. `contactY` on the hand at the shoulder line, ±2, states where the
 *      rep ENDS; going higher fails it.
 *   2. **Locking the elbow, then bending it more to cheat.** The elbow is SOFT and it stays soft:
 *      `angleNever` caps it below straight, and `jointAngle` at both endpoints holds the same
 *      window, so the arm cannot quietly turn into a half upright-row.
 *   3. **Swinging.** `segmentAngleFixed hipC→neckBase` at 3° plus fixed hips and knees: the torso
 *      does not throw the weight up.
 *
 * ── WHY THE ELBOW IS SOLVED, NOT POSED ──────────────────────────────────────────────────────────
 * The arm holds ONE fixed shape (a soft elbow) and rotates about the shoulder as a rigid unit. So
 * the elbow and hand are both placed on the ray from the shoulder at the sweep angle, at their own
 * fixed distances along it, with the elbow lifted very slightly off that ray to draw the bend. The
 * elbow angle is then constant across the whole rep BY CONSTRUCTION — which is precisely what the
 * cue "soft elbows, and keep them soft" asks for.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2, Vec3 } from '../types';
import { lerp, twoBoneIK, twoBoneIK3 } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { cable, dumbbellFront, floorScene, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, seatedFrontCore, standingFrontCore } from '../bodies';

const CX = 176;
const core = standingFrontCore(CX);
/** The machine member is SEATED — see `LateralParams.seated`. */
const seatedCore = seatedFrontCore(CX);
const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;

/** The arm's straight-line reach with a soft elbow — a shade under U + F, which IS the softness. */
const REACH_E = U * 0.97; // shoulder → elbow along the ray
const REACH_H = (U + F) * 0.965; // shoulder → hand along the ray
/** How far the elbow rides off the ray. Small, and constant: the bend never opens or closes. */
const BEND = 3.4;

/** Sweep measured from straight-down at the side. 90° = level with the shoulder. */
const THETA_BOTTOM = 8; // arms hang just clear of the thighs
const THETA_TOP = 90; // level, and the invariants stop it there

const lateralChains = {
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

/** One arm's elbow + hand at sweep θ. `side` is +1 for the athlete's right (screen right). */
function armAt(theta: number, side: 1 | -1, body: typeof core | typeof seatedCore = core): { elbow: Vec2; hand: Vec2 } {
  const r = (theta * Math.PI) / 180;
  const shoulder = side === 1 ? body.shoulderR : body.shoulderL;
  // The ray out from the shoulder: straight down at θ=0, horizontal at θ=90.
  const ux = side * Math.sin(r);
  const uy = Math.cos(r);
  // The perpendicular the bend rides along — the elbow trails BELOW the ray, as a soft elbow does.
  const px = side * Math.cos(r);
  const py = -Math.sin(r);
  /*
   * The hand rides the ray; the ELBOW is solved onto it. Placing both by hand — the elbow at
   * `REACH_E` along the ray and `BEND` off to the side — made the forearm the hypotenuse of that
   * offset, 26.5 against a canonical 23. The bend still trails below the ray, because the sign is
   * resolved once against a point on that side.
   */
  const hand = { x: shoulder.x + REACH_H * ux, y: shoulder.y + REACH_H * uy };
  const elbow = twoBoneIK(shoulder, hand, ATHLETE.upperArm, ATHLETE.foreArm, side === 1 ? -1 : 1);
  return { elbow, hand };
}

interface LateralParams {
  id: string;
  implement: 'db' | 'cable' | 'machine';
  /**
   * Seated on the machine's own seat.
   *
   * `machine_lateral_raise` was drawn STANDING, with two small pads floating beside the arms and a
   * back-rest rectangle hidden behind the trunk — a machine exercise with no seat, no frame and no
   * stack, which §3.5 says is not a station at all. Every lateral-raise machine is a seat you sit
   * in and drive two pads apart with the outsides of your upper arms.
   */
  seated?: boolean;
}

function lateralRaise(p: LateralParams): Rig {
  const body = p.seated ? seatedCore : core;
  const ARC = Array.from({ length: 17 }, (_, i) => armAt(lerp(THETA_BOTTOM, THETA_TOP, i / 16), 1, body).hand);
  /** The low pulleys a cable member crosses over to — one outside each foot. */
  const PULLEY_R: Vec2 = { x: CX + 74, y: FLOOR_Y - 12 };
  const PULLEY_L: Vec2 = { x: CX - 74, y: FLOOR_Y - 12 };

  const poseAt = (rom: number): Pose => {
    const theta = lerp(THETA_BOTTOM, THETA_TOP, rom);
    const R = armAt(theta, 1, body);
    const L = armAt(theta, -1, body);
    return {
      headR: ATHLETE.headR,
      j: { ...body, elbowR: R.elbow, handR: R.hand, elbowL: L.elbow, handL: L.hand },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const handR = pose.j.handR;
    const handL = pose.j.handL;
    const back: Primitive[] = [...sampledPathTicks(ARC)];
    let front: Primitive[] = [];

    if (p.implement === 'db') {
      /*
       * END-ON, because that is what a lateral raise's grip actually presents to this camera.
       *
       * The handle runs perpendicular to the forearm and perpendicular to the palm's normal. Arms
       * at the sides with a neutral grip, or out to the side with the palms down, both put it
       * FRONT-TO-BACK — straight into the screen. It was drawn `spin: 1`, the palms-FORWARD
       * orientation a press has, which laid the bells across the fists and added 14u of implement
       * to each side of an already wide silhouette. The press family keeps `spin: 1`; it is right
       * there and wrong here.
       */
      front = [...dumbbellFront(handL, 0), ...dumbbellFront(handR, 0)];
    } else if (p.implement === 'cable') {
      /*
       * A CROSSOVER, WHICH IS HOW THE LIFT IS ACTUALLY SET UP: the left hand takes the RIGHT-hand
       * pulley and vice versa, so each cable crosses the body and pulls along the whole arc. Drawn
       * that way because drawing it the easy way (each hand to the pulley beside it) shows a setup
       * that goes slack at the bottom, which is the thing the crossover exists to avoid.
       */
      const risenR = (armAt(THETA_BOTTOM, 1, body).hand.y - handR.y) * 0.5;
      const towerR = stackTower({ x0: PULLEY_R.x + 8, x1: PULLEY_R.x + 32, capY: FLOOR_Y - 98, stackTopY: FLOOR_Y - 34 }, risenR);
      const towerL = stackTower({ x0: PULLEY_L.x - 32, x1: PULLEY_L.x - 8, capY: FLOOR_Y - 98, stackTopY: FLOOR_Y - 34 }, risenR);
      back.push(...towerR.prims, ...towerL.prims, ...pulley(PULLEY_R), ...pulley(PULLEY_L));
      front = [cable(PULLEY_L, handR), cable(PULLEY_R, handL)];
    } else {
      /*
       * The machine's pads take the OUTER FOREARM and the arms drive them out — so the resistance
       * meets the arm at the elbow, not the hand, and there is nothing in the fist at all. The two
       * pads and their pivot arms rise with the elbows.
       */
      const elbowR = pose.j.elbowR;
      const elbowL = pose.j.elbowL;
      const PIVOT_Y = body.shoulderR.y + 6;
      const pad = (e: Vec2, side: 1 | -1): Primitive[] => [
        {
          kind: 'rect',
          x: e.x + side * 4 - (side === 1 ? 0 : 11),
          y: e.y - 9,
          width: 11,
          height: 20,
          rx: 4,
          fill: 'paper3',
          stroke: 'ink3',
          w: 2,
        },
        { kind: 'line', a: { x: CX + side * 30, y: PIVOT_Y }, b: { x: e.x + side * 6, y: e.y }, w: 2.5, color: 'ink3' },
        { kind: 'circle', c: { x: CX + side * 30, y: PIVOT_Y }, r: 3.4, fill: 'paper2', stroke: 'ink3', w: 2 },
      ];
      /*
       * The whole station, so the clip names its own machine: a seat with a back pad WIDER than the
       * trunk (at 42 wide the athlete covered every pixel of it), its posts on the floor, the two
       * arm pads on their pivots, and the stack fused to the frame on one side, rising with the
       * arms. The pads take the OUTER upper arm and the arms drive them out — the resistance meets
       * the arm at the elbow, so there is nothing in the fist at all.
       */
      const risen = (armAt(THETA_BOTTOM, 1, body).elbow.y - elbowR.y) * 0.6;
      const tower = stackTower({ x0: 246, x1: 270, capY: PIVOT_Y - 12, stackTopY: FLOOR_Y - 34 }, risen);
      back.push(
        ...tower.prims,
        { kind: 'line', a: { x: CX + 30, y: PIVOT_Y }, b: { x: 246, y: PIVOT_Y }, w: 2.5, color: 'ink3' },
        { kind: 'rect', x: CX - 27, y: 100, width: 54, height: 62, rx: 8, fill: 'paper3', stroke: 'ink3', w: 2 },
        { kind: 'rect', x: CX - 30, y: 162, width: 60, height: 8, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
        { kind: 'line', a: { x: CX - 20, y: 170 }, b: { x: CX - 20, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
        { kind: 'line', a: { x: CX + 20, y: 170 }, b: { x: CX + 20, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
        ...pad(elbowL, -1),
        ...pad(elbowR, 1),
      );
    }
    return { back, front };
  };

  /** One window, asserted at BOTH endpoints — the softness that may not change. */
  const softElbow = (label: string) => ({
    kind: 'jointAngle' as const,
    joint: 'elbowR',
    neighbors: ['shoulderR', 'handR'] as [string, string],
    /* 149.5 deg is what a canonical 25 + 23 arm holds at `REACH_H`, and it is CONSTANT — the arm
       rotates as a rigid unit. The band was 150..170, written when the elbow was placed by hand and
       the bones stretched to suit; a two-degree window round the true value is a far stronger claim
       and the one the cue "keep them soft" actually makes. */
    min: 147.5,
    max: 152,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      softElbow('soft elbows at the start'),
      { kind: 'contactY', a: 'handR', y: armAt(THETA_BOTTOM, 1, body).hand.y, tol: 2, label: 'arms at your sides' },
    ],
    end: [
      softElbow('and still soft at the top — the elbow never bends further'),
      { kind: 'contactY', a: 'handR', y: body.shoulderR.y, tol: 2.5, label: 'level with the shoulder, and no higher' },
    ],
    path: { track: 'handR', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'shoulderR', tol: 0.5, label: 'the shoulder is the hinge, and it stays put' },
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 3, label: 'no swing — the torso does not help' },
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'hips still' },
      { kind: 'pointFixed', point: 'kneeR', tol: 0.5, label: 'no leg drive' },
      { kind: 'angleNever', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], aboveDeg: 174, label: 'the elbow stays soft, never locked' },
    ],
  };

  return { id: p.id, chains: lateralChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, CX, 40) };
}

export const dbLateralRaise = lateralRaise({ id: 'lateral_raise', implement: 'db' });
export const cableLateralRaise = lateralRaise({ id: 'cable_lateral_raise', implement: 'cable' });
export const machineLateralRaise = lateralRaise({ id: 'machine_lateral_raise', implement: 'machine', seated: true });

/*
 * cable_upright_row (batch 2, 2026-08-26) — the family's front camera with the arms FOLDING
 * instead of sweeping: both fists on a short bar riding the midline from the thighs to the chest,
 * elbows flaring up and out to lead the pull. The classic fault list is the lateral raise's own —
 * swinging, shrugging, pulling past the chest line — and the front view is the only camera in
 * which "elbows above the hands" is even a drawable sentence.
 *
 * ── TWO THINGS WERE WRONG, AND THEY WERE THE SAME THING (2026-08-29) ────────────────────────────
 *
 * The bar finished at `shoulder + 6` — six units below the shoulder joint, which is the CHIN, not
 * the chest the card names and the file's own comment claimed. And because the hand ended that
 * close to its own shoulder, no arm could reach it honestly: the elbows were AUTHORED at both ends
 * and then length-capped, which drew a 25u humerus at 18.5 and a 23u forearm at 14.9, folded to a
 * 23° hinge. Two fleshed segments at 23° are one black wing.
 *
 * The header used to defend that, on the grounds that "a full-length planar arm cannot fold to a
 * 6-unit chord without the elbow landing somewhere no upright row has ever put it". True — and the
 * conclusion should have been that a 6-unit chord is the wrong endpoint, not that the arm should be
 * drawn shorter than it is. Pulled to the chest instead, the chord is 22u, the elbow solves in three
 * dimensions with both bones canonical, and it draws 24 and 22 at a 57° hinge with the elbow still
 * above the knuckles — the lift's one non-negotiable cue, now a consequence rather than a patch.
 */
/** A near-straight hanging arm, and the grip's own lateral offset from the shoulder. */
const REACH_LONG = (ATHLETE.upperArm + ATHLETE.foreArm) * 0.985;
const GRIP_DX = 20 - 15.5;

export const cableUprightRow: Rig = (() => {
  /**
   * Grip half-width. 20u ≈ 45cm between the hands — a shade wider than the shoulders.
   *
   * It was 8 (18cm, hands almost touching). Two things went wrong. A very narrow upright row is the
   * variant every coach warns off — it is the one that jams the shoulder into internal rotation at
   * the top — so the demonstration was teaching the version to avoid. And geometrically the hand
   * finished 7.5u INSIDE its own shoulder, which left the elbow at 17 degrees: two fleshed segments
   * folded flat into a solid black wing either side of the chest, with no elbow visible in it.
   * At 20 the hand finishes outside the shoulder, the elbow opens past 50, and the flare reads.
   */
  const GRIP = 20;
  /** Arms hanging: the lowest the bar can be, solved from the arm rather than guessed at 45. */
  const BOT_Y = core.shoulderR.y + Math.sqrt(REACH_LONG * REACH_LONG - GRIP_DX * GRIP_DX);
  /** The chest line — 22u below the shoulder joint, which is where a sternum is. */
  const TOP_Y = core.shoulderR.y + 22;
  const PULLEY: Vec2 = { x: CX, y: FLOOR_Y - 10 };

  const handAt = (rom: number, side: 1 | -1): Vec2 => ({ x: CX + side * GRIP, y: lerp(BOT_Y, TOP_Y, rom) });

  /*
   * THE ELBOW, SOLVED IN THREE DIMENSIONS. An upright row's elbow flares OUT and slightly FORWARD —
   * toward the camera from this staging — and that forward component is why a flat solve could
   * never place it. Given real depth there is nothing to author: both bones stay canonical, the
   * foreshortening is whatever the projection makes it, and `Pose.z` says how much.
   */
  const elbow3 = (rom: number, side: 1 | -1): Vec3 => {
    const hand = handAt(rom, side);
    const shoulder = side === 1 ? core.shoulderR : core.shoulderL;
    return twoBoneIK3(
      { x: shoulder.x, y: shoulder.y, z: 0 },
      { x: hand.x, y: hand.y, z: 0 },
      ATHLETE.upperArm,
      ATHLETE.foreArm,
      { x: side * 1, y: lerp(0.35, -1.2, rom), z: 0.35 },
    );
  };
  const ARC = Array.from({ length: 17 }, (_, i) => handAt(i / 16, 1));

  const poseAt = (rom: number): Pose => {
    const eR = elbow3(rom, 1);
    const eL = elbow3(rom, -1);
    return {
      headR: ATHLETE.headR,
      j: {
        ...core,
        handR: handAt(rom, 1),
        handL: handAt(rom, -1),
        elbowR: { x: eR.x, y: eR.y },
        elbowL: { x: eL.x, y: eL.y },
      },
      // the elbows are the only thing here that leaves the drawing plane, and they say how far
      z: { elbowR: eR.z, elbowL: eL.z },
    };
  };

  const decorAt = (rom: number): Decor => {
    const handR = handAt(rom, 1);
    const handL = handAt(rom, -1);
    const risen = (BOT_Y - handR.y) * 0.5;
    const tower = stackTower({ x0: CX + 66, x1: CX + 90, capY: FLOOR_Y - 98, stackTopY: FLOOR_Y - 34 }, risen);
    return {
      back: [...sampledPathTicks(ARC), ...tower.prims, ...pulley(PULLEY)],
      front: [
        cable(PULLEY, { x: CX, y: handR.y + 2 }),
        { kind: 'line', a: { x: handL.x - 7, y: handL.y }, b: { x: handR.x + 7, y: handR.y }, w: 3.5, color: 'ink0', cap: 'round' },
      ],
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'contactY', a: 'handR', y: BOT_Y, tol: 2, label: 'the bar at your thighs, arms long' },
      { kind: 'jointAngle', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], min: 150, max: 178, label: 'arms near-straight at the hang' },
    ],
    end: [
      { kind: 'contactY', a: 'handR', y: TOP_Y, tol: 2.5, label: 'the bar to the chest line, and no higher' },
      { kind: 'jointAngle', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], min: 45, max: 75, label: 'elbows flared, not jammed shut' },
      { kind: 'jointBelow', a: 'handR', b: 'elbowR', by: 2, label: 'the elbows lead — knuckles below them' },
    ],
    path: { track: 'handR', kind: 'vertical', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'shoulderR', tol: 0.5, label: 'no shrugging the stack up' },
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 3, label: 'no swing — the torso does not help' },
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'hips still' },
      { kind: 'pointFixed', point: 'kneeR', tol: 0.5, label: 'no leg drive' },
    ],
  };

  return { id: 'cable_upright_row', chains: lateralChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, CX, 40) };
})();
