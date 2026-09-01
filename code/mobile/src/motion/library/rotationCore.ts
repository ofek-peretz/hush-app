/**
 * rotation — the one plane no rig had drawn: the trunk turning about its own axis, shown FRONT-ON
 * (the fly's rule: a transverse movement needs the camera it happens across). Both members keep
 * the pelvis square — the cue on both cards — so what rotates is the rib cage, drawn as the
 * clasped hands sweeping their arc while the hips hold.
 *
 * ── THE REP IS THE CYCLE ────────────────────────────────────────────────────────────────────────
 * A twist alternates sides; canon demands two identical reps. The rep here is one full cycle —
 * left touch → right touch — so rom 0 and rom 1 are the two ENDS of the sweep and the loop's own
 * eccentric/concentric phrasing carries the return. Two loops = two identical cycles, canon held.
 *
 *   · `russian_twist`  — seated, leaned back, heels light on the floor; the clasped hands sweep a
 *     low arc from hip to hip. "Touch the floor each side" is the arc's own endpoints.
 *   · `cable_woodchop` — standing at the high pulley: arms LONG (the straight-arm rule — bending
 *     the arms turns a chop into a press-down), sweeping the diagonal from high-left to low-right.
 *     The stack rises through the chop.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2, Vec3 } from '../types';
import { lerp } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { twoBoneIK, twoBoneIK3, withinReachOfBoth } from '../geometry';
import { cable, floorScene, pulley, sampledPathTicks } from '../kit';
import { project, type Camera } from '../camera';
import { stackTower } from '../machines';
import { FLOOR_Y, seatedFrontCore, standingFrontCore } from '../bodies';

const CX = 176;

const rotationChains = {
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


/**
 * Both hands on ONE clasp, drawn as two arms that actually reach it.
 *
 * The rotation exercises share a shape: a single point sweeps across the body and both hands hold
 * it. What they used to share was also the defect — each elbow was placed at a fixed FRACTION of
 * the way from its shoulder to the clasp, which makes the arm exactly as long as it needs to be to
 * cover the gap. On the woodchop's finish, past the opposite hip, that gap is 85 units and the
 * upper arm was drawn at 51 against a canonical 25.
 *
 * The clasp is clamped into reach of the FARTHER shoulder first (a lifter who cannot reach stops
 * short; he does not grow), and both elbows then come from two-bone IK on canonical lengths, which
 * cannot stretch by construction. `bend` sends the elbows out to the sides, away from the body,
 * which is where they sit on a chop and on a twist alike.
 */
const claspedArms = (
  shoulderR: Vec2,
  shoulderL: Vec2,
  rawClasp: Vec2,
): { clasp: Vec2; elbowR: Vec2; elbowL: Vec2; handR: Vec2; handL: Vec2 } => {
  const clasp = withinReachOfBoth(shoulderR, shoulderL, rawClasp, REACH);
  /* Each arm solves to ITS OWN hand. Solving both to the shared clasp and then nudging the hands
     a knuckle apart put that nudge straight into the forearm — 25.7 against a canonical 23. */
  const handR = { x: clasp.x + 3, y: clasp.y };
  const handL = { x: clasp.x - 3, y: clasp.y };
  return {
    clasp,
    elbowR: twoBoneIK(shoulderR, handR, ATHLETE.upperArm, ATHLETE.foreArm, 1),
    elbowL: twoBoneIK(shoulderL, handL, ATHLETE.upperArm, ATHLETE.foreArm, -1),
    handR,
    handL,
  };
};

/** A shade under full extension, so the elbows keep a visible bend at the ends of the sweep. */
const REACH = (ATHLETE.upperArm + ATHLETE.foreArm) * 0.94;

/* ── russian_twist ─────────────────────────────────────────────────────────────────────────────── */

/*
 * russian_twist — REBUILT IN THREE DIMENSIONS AND RESTAGED (2026-08-29).
 *
 * Every defining fact about this movement runs along the axis a face-on camera looks down. The
 * LEAN-BACK is a rotation in depth. The KNEES-UP is a rotation in depth. The TWIST itself is a
 * rotation in depth. So the face-on version could state none of them, and it did not: it drew a
 * compact figure with a vertical trunk, both leg bones foreshortened by eye to depths that
 * disagreed by 17u about where the knee was, and hips floating 19 cm off the floor — bench height.
 * It read as a man crouching.
 *
 * Three things fix it, and they only work together:
 *
 *   1. THE HIPS GO DOWN TO THE FLOOR. A viewer decides "seated" or "squatting" from one thing, and
 *      it is where the pelvis is. 10 cm up, not 19.
 *   2. THE BODY IS BUILT IN 3D — the trunk leans back 33° as a real rotation rather than as a
 *      shortened line, the feet are planted 47 cm in front of the hips at a real depth, and both
 *      knees are SOLVED from canonical bones instead of placed.
 *   3. THE CAMERA STEPS ROUND TO 35°, which is what turns all of that into pixels: the shoulders
 *      swing 15u clear of the hips and the feet 24u the other way, so the figure becomes a legible
 *      diagonal — head high on one side, feet low on the other — and the near thigh goes from a
 *      25u stub to 39u drawn.
 *
 * WHY THE ORBIT IS ALLOWED HERE, when it is refused for the bench press and the abductors: those
 * are MIRROR-SYMMETRIC, so an orbit can only take from one limb what it gives the other. A twist is
 * antisymmetric — the whole point is that the two sides do different things — so there is no
 * symmetry to spend. 35° is the balance: far enough that the lean and the legs read, near enough
 * that the hands still travel 25u across the sweep instead of collapsing into the trunk.
 */
export const russianTwist: Rig = (() => {
  /* Seated ON THE FLOOR: the hip joint about 10 cm up. */
  const HIP_Y = 184;
  const LEAN = 33; // degrees the trunk is leaned back from vertical
  const lr = (LEAN * Math.PI) / 180;
  /** Up the trunk, hip → neck: back and up. The orbit axis, and the axis the ribs turn about. */
  const UP: Vec3 = { x: 0, y: -Math.cos(lr), z: -Math.sin(lr) };
  /** Out of the chest, perpendicular to the trunk in the sagittal plane. */
  const OUT: Vec3 = { x: 0, y: -Math.sin(lr), z: Math.cos(lr) };
  const TORSO = ATHLETE.torso;

  const HIP_C: Vec3 = { x: CX, y: HIP_Y, z: 0 };
  const along = (base: Vec3, u: Vec3, d: number): Vec3 => ({ x: base.x + u.x * d, y: base.y + u.y * d, z: base.z + u.z * d });
  const NECK: Vec3 = along(HIP_C, UP, TORSO);
  const HEAD: Vec3 = along(NECK, UP, ATHLETE.neck);

  /*
   * THE RIBS TURN, and the arms come with them. `phi` is the trunk's rotation about its own long
   * axis — ±45°, a real Russian-twist range — and BOTH the shoulder line and the clasped hands are
   * rigidly attached to the chest, so the arms never change shape. That is the cue exactly: the
   * hands do not swing, the ribs turn and carry them. It also makes the clasp reachable, which the
   * flat version could never manage — it kept authoring a hand position 65u from a shoulder with a
   * 48u arm, because reaching the far side needs a trunk that turns, and a flat one cannot.
   */
  const PHI_MAX = 45;
  /** `l` rotated about the trunk axis by `deg`; the axis is UP so this is a plain Rodrigues turn. */
  const turn = (l: Vec3, deg: number): Vec3 => {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    // UP × l, for l in {lateral, out-of-chest} — both perpendicular to UP, so the third term drops
    const k: Vec3 = {
      x: UP.y * l.z - UP.z * l.y,
      y: UP.z * l.x - UP.x * l.z,
      z: UP.x * l.y - UP.y * l.x,
    };
    return { x: l.x * c - k.x * sn, y: l.y * c - k.y * sn, z: l.z * c - k.z * sn };
  };

  const LATERAL: Vec3 = { x: 1, y: 0, z: 0 };
  const SH_HALF = 15.5;
  /** The clasp rides on the chest: 18u down the trunk from the neck, 22u out in front of it. */
  const CLASP_DOWN = 18;
  const CLASP_OUT = 22;

  const bodyAt = (rom: number) => {
    const phi = lerp(-PHI_MAX, PHI_MAX, rom);
    const lat = turn(LATERAL, phi);
    const out = turn(OUT, phi);
    const chest = along(NECK, UP, -CLASP_DOWN);
    const clasp = along(chest, out, CLASP_OUT);
    const shoulderR = along(NECK, lat, SH_HALF);
    const shoulderL = along(NECK, lat, -SH_HALF);
    return { clasp, shoulderR, shoulderL };
  };

  /*
   * THE LEGS. Feet planted well in front of the hips — that depth is the whole reason the knees
   * come up — and each knee solved from two canonical bones rather than placed. They do not move:
   * "the legs are still, no rocking" is an invariant of this exercise, so they are computed once.
   */
  const FOOT_Z = 42;
  const legFor = (side: 1 | -1) => {
    const hip: Vec3 = { x: CX + 9 * side, y: HIP_Y, z: 0 };
    const ankle: Vec3 = { x: CX + 13 * side, y: 186, z: FOOT_Z };
    const knee = twoBoneIK3(hip, ankle, ATHLETE.thigh, ATHLETE.shank, { x: side * 0.55, y: -1, z: 0.2 });
    return { hip, ankle, knee };
  };
  const LEG_R = legFor(1);
  const LEG_L = legFor(-1);

  const CAM: Camera = { azimuth: 35, pivotX: CX };
  const P3 = (q: Vec3): Vec2 => {
    const r = project({ x: q.x, y: q.y }, q.z, CAM);
    return { x: r.x, y: r.y };
  };

  const poseAt = (rom: number): Pose => {
    const { clasp, shoulderR, shoulderL } = bodyAt(rom);
    const elbowR = twoBoneIK3(shoulderR, clasp, ATHLETE.upperArm, ATHLETE.foreArm, { x: 1, y: 0.9, z: 0.2 });
    const elbowL = twoBoneIK3(shoulderL, clasp, ATHLETE.upperArm, ATHLETE.foreArm, { x: -1, y: 0.9, z: 0.2 });
    const flat = (q: Vec3): Vec2 => ({ x: q.x, y: q.y });
    return {
      headR: ATHLETE.headR,
      j: {
        hipC: flat(HIP_C),
        neckBase: flat(NECK),
        head: flat(HEAD),
        shoulderR: flat(shoulderR),
        shoulderL: flat(shoulderL),
        hipR: flat(LEG_R.hip),
        hipL: flat(LEG_L.hip),
        kneeR: flat(LEG_R.knee),
        kneeL: flat(LEG_L.knee),
        ankleR: flat(LEG_R.ankle),
        ankleL: flat(LEG_L.ankle),
        heelR: { x: CX + 9, y: 193 },
        toeR: { x: CX + 20, y: 193 },
        heelL: { x: CX - 9, y: 193 },
        toeL: { x: CX - 20, y: 193 },
        elbowR: flat(elbowR),
        elbowL: flat(elbowL),
        handR: flat(clasp),
        handL: flat(clasp),
      },
      z: {
        neckBase: NECK.z,
        head: HEAD.z,
        shoulderR: shoulderR.z,
        shoulderL: shoulderL.z,
        kneeR: LEG_R.knee.z,
        kneeL: LEG_L.knee.z,
        ankleR: FOOT_Z,
        ankleL: FOOT_Z,
        heelR: FOOT_Z - 4,
        heelL: FOOT_Z - 4,
        toeR: FOOT_Z + 9,
        toeL: FOOT_Z + 9,
        elbowR: elbowR.z,
        elbowL: elbowL.z,
        handR: clasp.z,
        handL: clasp.z,
      },
    };
  };

  const ARC = Array.from({ length: 17 }, (_, i) => P3(bodyAt(i / 16).clasp));

  const decorAt = (): Decor => ({ back: [...sampledPathTicks(ARC)], front: [] });

  const START_X = bodyAt(0).clasp.x;
  const END_X = bodyAt(1).clasp.x;

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [{ kind: 'contactX', a: 'handR', x: START_X, tol: 2, label: 'turned to the left' }],
    end: [{ kind: 'contactX', a: 'handR', x: END_X, tol: 2, label: 'and to the right — rotate from the ribs' }],
    path: { track: 'handR', kind: 'horizontal', tol: 9 },
    invariants: [
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'the pelvis stays square — the ribs do the turning' },
      { kind: 'pointFixed', point: 'hipR', tol: 0.5, label: 'seated and planted' },
      { kind: 'pointFixed', point: 'kneeR', tol: 0.5, label: 'the legs are still — no rocking' },
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 4, label: 'chest tall through the whole cycle' },
      /* "Rotate from the ribs" is guaranteed by CONSTRUCTION here — the clasp and the shoulder line
         are both rigidly attached to the chest, so the arms cannot change shape — and it is
         deliberately not asserted, because `spanFixed` measures the DRAWN span and a rigid arm
         turning in depth is supposed to change that. A validator that reads the page cannot check a
         fact about the room; claiming otherwise would only teach the next author to distrust it. */
    ],
  };

  return { id: 'russian_twist', camera: CAM, chains: rotationChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, CX, 40) };
})();

/* ── cable_woodchop ────────────────────────────────────────────────────────────────────────────── */

export const cableWoodchop: Rig = (() => {
  const core = standingFrontCore(CX);
  const PULLEY: Vec2 = { x: CX - 92, y: 44 };
  /*
   * The clasp sweeps an ARC AT ARM'S LENGTH about the chest — up beside one shoulder, down past the
   * opposite hip — rather than a straight diagonal between two authored points.
   *
   * The diagonal was authored where a chop should finish, and that finish sits 85 units from the far
   * shoulder against a two-handed reach of 45: the trunk has to TURN to get there, and a frontal
   * trunk cannot. Clamping the diagonal into reach fixed the arm lengths and cost the exercise its
   * movement — the hands were dragged in against the chest and the chop read as a hug.
   *
   * An arc keeps the hands OUT, at a radius both shoulders can hold, and spends the whole sweep
   * where the clamp never bites. The travel is smaller than the authored diagonal because a chop
   * drawn without trunk rotation genuinely is smaller; what it is not is a body pulling itself
   * apart to cover the difference.
   */
  /*
   * THE CHOP RUNS AWAY FROM THE MACHINE, and it used to run toward it.
   *
   * The sweep started up on the athlete's RIGHT — the far side from a pulley standing at x 84 — and
   * finished down toward the middle. Two things follow from that, and both were being drawn:
   *
   *   · the cable got SHORTER through the rep, 112u to 92u, while the stack was drawn rising on a
   *     bare `rom * 20`. A cable that shortens is a stack coming DOWN. The clip showed a weight
   *     being lifted by a rope that was feeding slack, which is the one thing a cable machine
   *     cannot do;
   *   · the athlete reached AWAY from the handle to start, so the near arm was folded to 40° at the
   *     moment the card says "arms long", and the far arm was the extended one. Reaching up across
   *     your body extends the arm on the FAR side from the reach — that is the whole shape of a
   *     chop, and it was mirrored.
   *
   * Started up beside the pulley and finished down past the opposite hip, the cable lengthens by
   * 31u, the stack rise is that length rather than a guess, and the leading arm is the long one.
   */
  /*
   * A DIAGONAL, not an arc. Swept as a circle about the chest, the hands went up-left, over the top
   * of the head, and only then down — because 144° to −36° passes through vertical. A chop does not
   * rise; it is a straight line from high on one side to low on the other, and that is what these
   * two points are.
   *
   * The reason the arc existed was that the ORIGINAL authored diagonal finished 85u from the far
   * shoulder, past a 48u arm, and had to be clamped. These endpoints are chosen against that
   * constraint instead of colliding with it: the far shoulder is 44.5u from the finish and the near
   * one 43.6u from the start, both inside a real arm, so the clamp never bites anywhere on the line
   * and the hands travel a full 64u.
   */
  const CHOP_FROM: Vec2 = { x: CX - 24, y: 45 }; // up beside the head, toward the high pulley
  const CHOP_TO: Vec2 = { x: CX + 16, y: 95 }; // down past the opposite hip
  /*
   * THE HANDS ARE OUT IN FRONT, 22u of it, and that is not decoration — it is what stops the far
   * arm from tearing itself apart halfway down.
   *
   * Drawn flat, the chop line passes 4.9u from the athlete's own left shoulder JOINT. A two-bone
   * solve at that distance is nearly degenerate: the elbow angle collapses to 14° and the solution
   * swings right round the shoulder between one frame and the next — the auditor caught it as a
   * 7.6u teleport against a median step of 0.45. In life the hands never go near that joint; they
   * pass in FRONT of it, which is a fact about depth and cannot be said in the plane. Said in three
   * dimensions the same drawn line leaves the far shoulder 22.7u away and the elbow opens to 56°.
   */
  const CHOP_Z = 22;
  const claspAt = (rom: number): Vec2 => ({
    x: lerp(CHOP_FROM.x, CHOP_TO.x, rom),
    y: lerp(CHOP_FROM.y, CHOP_TO.y, rom),
  });

  const ARC = Array.from({ length: 17 }, (_, i) => claspAt(i / 16));

  const armsAt = (rom: number) => {
    const c = claspAt(rom);
    const handR: Vec3 = { x: c.x + 3, y: c.y, z: CHOP_Z };
    const handL: Vec3 = { x: c.x - 3, y: c.y, z: CHOP_Z };
    const shR: Vec3 = { x: core.shoulderR.x, y: core.shoulderR.y, z: 0 };
    const shL: Vec3 = { x: core.shoulderL.x, y: core.shoulderL.y, z: 0 };
    return {
      handR,
      handL,
      elbowR: twoBoneIK3(shR, handR, ATHLETE.upperArm, ATHLETE.foreArm, { x: 1, y: 0.7, z: -0.35 }),
      elbowL: twoBoneIK3(shL, handL, ATHLETE.upperArm, ATHLETE.foreArm, { x: -1, y: 0.7, z: -0.35 }),
    };
  };

  const poseAt = (rom: number): Pose => {
    const a = armsAt(rom);
    const flat = (q: Vec3): Vec2 => ({ x: q.x, y: q.y });
    return {
      headR: ATHLETE.headR,
      j: { ...core, elbowR: flat(a.elbowR), elbowL: flat(a.elbowL), handR: flat(a.handR), handL: flat(a.handL) },
      z: { elbowR: a.elbowR.z, elbowL: a.elbowL.z, handR: CHOP_Z, handL: CHOP_Z },
    };
  };

  /** Cable paid out since the rep started — which IS how far the selected plate has come up. */
  const REST_RUN = Math.hypot(claspAt(0).x - 3 - PULLEY.x, claspAt(0).y - PULLEY.y);

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    // measured, not assumed: the plate rises by exactly the cable the chop has drawn past the pulley
    const risen = Math.max(0, Math.hypot(pose.j.handL.x - PULLEY.x, pose.j.handL.y - PULLEY.y) - REST_RUN);
    const tower = stackTower({ x0: PULLEY.x - 32, x1: PULLEY.x - 6, capY: 36, stackTopY: FLOOR_Y - 34 }, risen);
    return {
      back: [...sampledPathTicks(ARC), ...tower.prims, ...pulley(PULLEY)],
      front: [cable(PULLEY, pose.j.handL)],
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    /* Read off the CLAMPED chop. `TO` was 85 units from the far shoulder — an end position no arm
       reaches — so the declared contact was asserting a place the athlete could only get to by
       growing. The rail is an ARC now for the same reason: clamping into reach bends the diagonal
       into a circle about whichever shoulder is furthest, which is what a real chop does when the
       trunk stops turning. */
    start: [{ kind: 'contactY', a: 'handR', y: ARC[0].y, tol: 2.5, label: 'reached up toward the pulley, arms long' }],
    end: [{ kind: 'contactY', a: 'handR', y: ARC[ARC.length - 1].y, tol: 2.5, label: 'chopped down past the far hip' }],
    path: { track: 'handR', kind: 'arc', tol: 2.5 },
    invariants: [
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'hips square — the rotation is the ribs' },
      { kind: 'pointFixed', point: 'ankleR', tol: 0.5, label: 'planted' },
      { kind: 'pointFixed', point: 'ankleL', tol: 0.5, label: 'planted' },
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 4, label: 'tall through the chop' },
    ],
  };

  return { id: 'cable_woodchop', chains: rotationChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, CX, 40) };
})();
