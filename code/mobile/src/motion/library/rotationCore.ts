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

/** `withinReachOfBoth` in three dimensions: the clasp drawn toward whichever shoulder is farther
 *  until that arm can hold it — a lifter who cannot reach stops short, he does not grow. */
const withinReachOfBoth3 = (a: Vec3, b: Vec3, target: Vec3, reach: number): Vec3 => {
  const d3 = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  const root = d3(a, target) >= d3(b, target) ? a : b;
  const d = d3(root, target);
  if (d <= reach) return target;
  const k = reach / d;
  return { x: root.x + (target.x - root.x) * k, y: root.y + (target.y - root.y) * k, z: root.z + (target.z - root.z) * k };
};

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
  /* 30, not 33 (audit, 2026-09-03): the three degrees buy the hands 4u more depth at the hip — at
     33 the far shoulder sat 35u behind the hip plane at full turn and the clasp could not get
     below y 174 without the clamp biting. */
  const LEAN = 30; // degrees the trunk is leaned back from vertical
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
  /**
   * THE HANDS DROP TO THE HIP AT EACH END (audit, 2026-09-03). Rigid to the chest, the clasp rode
   * at chest height for the whole sweep — hand y 147–150, 35u above the pelvis — so "touch the
   * floor each side" was a hand waving in front of the sternum. The clasp is on the chest only at
   * the MIDDLE of the sweep (24u down the trunk, 22u out in front) and blends, with |phi|, toward
   * a point beside the hip on the side of the turn: 18u lateral, y 170, 4u behind the hip plane.
   * That is 14u above the pelvis and 23u above the floor, and it is the lowest the two arms can
   * hold: at full turn the far shoulder is 33u behind the hip plane, and the floor beside the hip
   * is 51u from it against a 45u two-handed reach — so the target is clamped into the farther
   * shoulder's reach in 3D rather than drawn with a stretched forearm. Measured: hand y at the
   * ends 150.4 → 170.0, sweep 25.5 → 29.5u, both elbows ≥ 90° in 3D and ≥ 33° projected.
   */
  const CLASP_DOWN = 24;
  const CLASP_OUT = 22;
  const END_LATERAL = 18;
  const END_Y = 170;
  const END_Z = -4;

  const bodyAt = (rom: number) => {
    const phi = lerp(-PHI_MAX, PHI_MAX, rom);
    const lat = turn(LATERAL, phi);
    const out = turn(OUT, phi);
    const shoulderR = along(NECK, lat, SH_HALF);
    const shoulderL = along(NECK, lat, -SH_HALF);
    const chest = along(NECK, UP, -CLASP_DOWN);
    const mid = along(chest, out, CLASP_OUT);
    const f = Math.abs(phi) / PHI_MAX;
    const end: Vec3 = { x: CX + (phi < 0 ? -END_LATERAL : END_LATERAL), y: END_Y, z: END_Z };
    const raw: Vec3 = { x: lerp(mid.x, end.x, f), y: lerp(mid.y, end.y, f), z: lerp(mid.z, end.z, f) };
    const clasp = withinReachOfBoth3(shoulderR, shoulderL, raw, REACH);
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
    /* Elbows out to the sides and a little forward (audit, 2026-09-03): with the hands dropping to
       the hip, the old down-and-in hint (y 0.9) folded the near upper arm onto the view axis —
       2.5° projected at rom 0.88; out-and-forward keeps every projected bone ≥ 7.7u. */
    const elbowR = twoBoneIK3(shoulderR, clasp, ATHLETE.upperArm, ATHLETE.foreArm, { x: 1, y: 0.2, z: 0.6 });
    const elbowL = twoBoneIK3(shoulderL, clasp, ATHLETE.upperArm, ATHLETE.foreArm, { x: -1, y: 0.2, z: 0.6 });
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
    /* A twist has no loaded direction: left→right and right→left are the same movement, so the
       two phases share the 3.1 s equally instead of one side "fast" (1.1 s) and the other "slow"
       (2.0 s). The cycle stays 4.0 s (audit, 2026-09-03). */
    tempo: { ...CONCENTRIC_TEMPO, eccentricMs: 1550, concentricMs: 1550 },
    start: [{ kind: 'contactX', a: 'handR', x: START_X, tol: 2, label: 'turned to the left' }],
    end: [{ kind: 'contactX', a: 'handR', x: END_X, tol: 2, label: 'and to the right — rotate from the ribs' }],
    /* An arc now, not a horizontal: the hands rise 18u over the chest between the two hip touches. */
    path: { track: 'handR', kind: 'arc', tol: 3 },
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

/*
 * cable_woodchop — REBUILT IN THREE DIMENSIONS AND RESTAGED (audit, 2026-09-03).
 *
 * The flat diagonal broke its own headline. "Arms LONG" was authored as a straight line 22u in
 * front of a trunk that never turned, and the measurement said what that costs: elbowR 47° and
 * elbowL 6.5° mid-chop (rom 0.4–0.6), the arms knotted into an X on the chest — a cross-body
 * press-down, not a chop. That is geometry, not a constant: a hand passing 22u in front of a
 * SQUARE chest is 28u from the near shoulder, and a 48u arm has to fold to hold it.
 *
 * Three things fix it, and only together:
 *
 *   1. THE RIBS TURN. The shoulder line rotates ±40° about the trunk's vertical axis — from facing
 *      the pulley to facing away from it. Pelvis and legs stay square, which is the card's cue.
 *   2. THE HANDS RIDE A SPHERE ABOUT THE GIRDLE. The clasp sits 45u from the centre of the shoulder
 *      line, straight out of the TURNED chest, and only its elevation changes: +28° (beside the
 *      head) → −50° (past the far hip). Both shoulders are then 47.6u from the clasp at every rom,
 *      so both elbows hold ~160° by construction — the arms are long because they cannot be
 *      anything else. The lateral travel is the trunk's, exactly as the cue says.
 *   3. THE CAMERA STEPS ROUND TO −50°. A sphere of straight arms is the fly's problem: at azimuth 0
 *      the arms point at the lens mid-chop and vanish (projected upper arm 0.6u). −50° keeps the
 *      view axis outside the ±40° the arms sweep, so the shortest projected bone is 9.5u and the
 *      chop reads as one diagonal: high beside the pulley (137, 43) → low past the far hip
 *      (171, 97). The machine stands in the athlete's lateral plane and is projected with him, so
 *      the pulley lands on his far side and the cable runs from behind him into his hands.
 *
 * WHY THE ORBIT IS ALLOWED: the twist's rule, above — a rotation is antisymmetric, there is no
 * mirror symmetry for an orbit to spend.
 */
export const cableWoodchop: Rig = (() => {
  const core = standingFrontCore(CX);
  const SH_HALF = 15.5;
  const SH_Y = core.shoulderR.y;
  const PHI_MAX = 35;
  /** 45u from the girdle's centre: √(45² + 15.5²) = 47.6u from each shoulder, an elbow of ~160°. */
  /* 46.5, not 45 (execution pass, 2026-09-03): at 45 the arms held ~160° and the far elbow's
     drawn bend flipped sign as the arm crossed the camera axis (the auditor's 4th law, frame 60);
     at 46.5 the elbows sit inside the straight deadband — which is the cue: arms LONG, the chop is
     a turn of the trunk, not a press-down. */
  const RADIUS = 46.5;
  const ELEV_FROM = 28; // degrees above the shoulder line — beside the head, toward the pulley
  const ELEV_TO = -50; // below it — past the far hip
  const CAM: Camera = { azimuth: -45, pivotX: CX };
  const P3 = (q: Vec3): Vec2 => {
    const r = project({ x: q.x, y: q.y }, q.z, CAM);
    return { x: r.x, y: r.y };
  };
  const d3 = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  /** The high pulley, in the athlete's lateral plane on his left; the stack hangs beyond it. */
  const PULLEY3: Vec3 = { x: CX - 92, y: 44, z: 0 };
  const PULLEY = P3(PULLEY3);
  const px = (x: number) => P3({ x, y: 0, z: 0 }).x;

  const girdleAt = (rom: number) => {
    /* +PHI_MAX at rom 0: the chest turned toward the pulley (−x), the right shoulder forward. */
    const phi = (lerp(PHI_MAX, -PHI_MAX, rom) * Math.PI) / 180;
    const lat: Vec3 = { x: Math.cos(phi), y: 0, z: Math.sin(phi) };
    const fwd: Vec3 = { x: -Math.sin(phi), y: 0, z: Math.cos(phi) };
    const shoulderR: Vec3 = { x: CX + lat.x * SH_HALF, y: SH_Y, z: lat.z * SH_HALF };
    const shoulderL: Vec3 = { x: CX - lat.x * SH_HALF, y: SH_Y, z: -lat.z * SH_HALF };
    const elev = (lerp(ELEV_FROM, ELEV_TO, rom) * Math.PI) / 180;
    const clasp: Vec3 = {
      x: CX + fwd.x * Math.cos(elev) * RADIUS,
      y: SH_Y - Math.sin(elev) * RADIUS,
      z: fwd.z * Math.cos(elev) * RADIUS,
    };
    /* Each hand a knuckle to its own side of the clasp, along the turned shoulder line. */
    const handR: Vec3 = { x: clasp.x + lat.x * 3, y: clasp.y, z: clasp.z + lat.z * 3 };
    const handL: Vec3 = { x: clasp.x - lat.x * 3, y: clasp.y, z: clasp.z - lat.z * 3 };
    /* Elbows OUT along the turned shoulder line, and a little down. The hint only picks a point on
       the IK circle (with ~155° elbows it moves them ~5u), but it has to be chosen with care twice
       over: a hint along the arm's own axis (the arm points forward at rom 0.5) left the side to
       rounding and the elbow jumped 8.7u between frames; a plain 'down' hint kept the elbow under
       an arm that swings from pointing left to pointing right, which is a bend that inverts in the
       authored plane (the auditor's 4th law). Out-to-its-own-side never does either. */
    const elbowR = twoBoneIK3(shoulderR, handR, ATHLETE.upperArm, ATHLETE.foreArm, { x: lat.x, y: 0.3, z: lat.z });
    const elbowL = twoBoneIK3(shoulderL, handL, ATHLETE.upperArm, ATHLETE.foreArm, { x: -lat.x, y: 0.3, z: -lat.z });
    return { clasp, shoulderR, shoulderL, elbowR, elbowL, handR, handL };
  };

  const ARC = Array.from({ length: 17 }, (_, i) => P3(girdleAt(i / 16).clasp));

  /* The feet point forward in depth, so the orbit foreshortens them instead of squeezing them. */
  const TOE_Z = 9;
  const HEEL_Z = -2;

  const poseAt = (rom: number): Pose => {
    const g = girdleAt(rom);
    const flat = (q: Vec3): Vec2 => ({ x: q.x, y: q.y });
    return {
      headR: ATHLETE.headR,
      j: {
        ...core,
        shoulderR: flat(g.shoulderR),
        shoulderL: flat(g.shoulderL),
        elbowR: flat(g.elbowR),
        elbowL: flat(g.elbowL),
        handR: flat(g.handR),
        handL: flat(g.handL),
      },
      z: {
        shoulderR: g.shoulderR.z,
        shoulderL: g.shoulderL.z,
        elbowR: g.elbowR.z,
        elbowL: g.elbowL.z,
        handR: g.handR.z,
        handL: g.handL.z,
        toeR: TOE_Z,
        toeL: TOE_Z,
        heelR: HEEL_Z,
        heelL: HEEL_Z,
      },
    };
  };

  /** Cable paid out since the rep started — which IS how far the selected plate has come up. */
  const REST_RUN = d3(girdleAt(0).handL, PULLEY3);

  const decorAt = (rom: number): Decor => {
    const g = girdleAt(rom);
    // measured in the room, not on the page: the plate rises by the cable the chop has drawn out
    const risen = Math.max(0, d3(g.handL, PULLEY3) - REST_RUN);
    const tower = stackTower({ x0: px(PULLEY3.x - 32), x1: px(PULLEY3.x - 6), capY: 36, stackTopY: FLOOR_Y - 34 }, risen);
    return {
      back: [...sampledPathTicks(ARC), ...tower.prims, ...pulley(PULLEY)],
      front: [cable(PULLEY, P3(g.handL))],
    };
  };

  const START_Y = girdleAt(0).handR.y;
  const END_Y = girdleAt(1).handR.y;

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [{ kind: 'contactY', a: 'handR', y: START_Y, tol: 2.5, label: 'reached up toward the pulley, arms long' }],
    end: [{ kind: 'contactY', a: 'handR', y: END_Y, tol: 2.5, label: 'chopped down past the far hip' }],
    path: { track: 'handR', kind: 'arc', tol: 2.5 },
    invariants: [
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'hips square — the rotation is the ribs' },
      { kind: 'pointFixed', point: 'ankleR', tol: 0.5, label: 'planted' },
      { kind: 'pointFixed', point: 'ankleL', tol: 0.5, label: 'planted' },
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 4, label: 'tall through the chop' },
    ],
  };

  return { id: 'cable_woodchop', camera: CAM, chains: rotationChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, CX, 40) };
})();
