/**
 * THE HARD TAIL (2026-08-25) — the lifts each excised earlier under the honesty rule ("open until
 * drawable true"), authored now that the library owns the mechanisms they were waiting for.
 *
 * ── nordic_curl ─────────────────────────────────────────────────────────────────────────────────
 * The whole BODY is the lever: ankles anchored under the pad, and the knee→head line falls
 * forward from vertical as one rigid unit — the hamstrings paying out the descent, which is the
 * entire exercise ("lower as slowly as you can"). The catch: the hands meet the floor at the
 * bottom, drawn exactly where the falling line puts them. rom 0 = tall on the knees; rom 1 = the
 * caught bottom. The eccentric IS the work, and `startAt: 'top'` phrases it so.
 *
 * ── single_leg_rdl ──────────────────────────────────────────────────────────────────────────────
 * The back-extension's see-saw, free-standing: the trunk tips down about the stance hip while the
 * FREE LEG rises behind as its counterweight — one straight line from crown to raised heel, tilting
 * on the hip. The stance knee is soft and FROZEN (the RDL's own invariant), the load hangs from
 * the near hand down the stance line.
 *
 * ── pike_push_up ────────────────────────────────────────────────────────────────────────────────
 * The plank core's named exception, authored on its own fold: the body holds an inverted V (a
 * FIXED hip fold — the legs' line and the trunk's line meet at ~100° and never change), and the
 * rep bends the ELBOWS: the crown lowers toward the floor between the hands and presses back —
 * the overhead press's pattern with the floor as the ceiling. The colinearity the plank enforces
 * moves to hip–shoulder–hand: the PRESSING line is the straight one here.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK, withinReach } from '../geometry';
import { lags } from '../curves';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { dumbbellSide, floorScene, padStroke, sampledPathTicks } from '../kit';
import { FLOOR_Y, far } from '../bodies';

const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;
const T = ATHLETE.thigh;
const S = ATHLETE.shank;

/* ── nordic_curl ───────────────────────────────────────────────────────────────────────────────── */

export const nordicCurl: Rig = (() => {
  /** The anchored shins: knees on the pad, ankles clamped behind. */
  const KNEE: Vec2 = { x: 150, y: FLOOR_Y - 6 };
  const ANKLE: Vec2 = { x: KNEE.x - S * 0.92, y: FLOOR_Y - 7 };
  /** The falling line: knee → hip → shoulder → head, rigid; θ above the floor, 88° → 26°. */
  const THETA_TALL = 88;
  const THETA_CAUGHT = 26;
  const HIP_D = T;
  const SHOULDER_D = T + ATHLETE.torso;

  const lineAt = (theta: number) => {
    const r = (theta * Math.PI) / 180;
    const dir: Vec2 = { x: Math.cos(r), y: -Math.sin(r) };
    const hip: Vec2 = { x: KNEE.x + HIP_D * dir.x, y: KNEE.y + HIP_D * dir.y };
    const shoulder: Vec2 = { x: KNEE.x + SHOULDER_D * dir.x, y: KNEE.y + SHOULDER_D * dir.y };
    const head: Vec2 = { x: shoulder.x + ATHLETE.neck * dir.x, y: shoulder.y + ATHLETE.neck * dir.y };
    return { hip, shoulder, head };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => lineAt(lerp(THETA_TALL, THETA_CAUGHT, i / 16)).shoulder);

  /** Where the hands first meet the floor — solved once, so the catch is a plant and not a slide. */
  const PLANT_X: number = (() => {
    const reach = (U + F) * 0.96;
    for (let i = 0; i <= 400; i++) {
      const rom = i / 400;
      const sh = lineAt(lerp(THETA_TALL, THETA_CAUGHT, rom)).shoulder;
      if (sh.y + reach > FLOOR_Y - 3) {
        const dy = FLOOR_Y - 3 - sh.y;
        return sh.x + Math.sqrt(Math.max(1, reach * reach - dy * dy)) * (rom * 0.9 + 0.1);
      }
    }
    return lineAt(THETA_CAUGHT).shoulder.x + reach;
  })();

  const poseAt = (rom: number): Pose => {
    const theta = lerp(THETA_TALL, THETA_CAUGHT, rom);
    const { hip, shoulder, head } = lineAt(theta);
    /*
     * The catch, honestly staged: the arms come forward THROUGH the fall — hanging at the sides
     * when tall, reaching for the floor by the bottom, where the hands land exactly where the
     * geometry puts a hand at arm's length below the falling shoulder (clamped to the floor).
     */
    const reach = (U + F) * 0.96;
    /*
     * THE HANDS PLANT WHERE THEY LAND. The reach used to be re-solved every frame against a hand
     * height clamped to the floor, so once the hands touched down they went on SLIDING outward —
     * 6.5 units in a single frame near the end of the fall, which the auditor caught as a step
     * five times the joint's own median. A catch is a catch: past the frame the hands reach the
     * floor, they stay exactly where they first touched it.
     */
    const freeHandY = shoulder.y + reach;
    const planted = freeHandY > FLOOR_Y - 3;
    const handY = planted ? FLOOR_Y - 3 : freeHandY;
    const handX = planted
      ? PLANT_X
      : shoulder.x + Math.sqrt(Math.max(1, reach * reach - (handY - shoulder.y) ** 2)) * (rom * 0.9 + 0.1);
    const hand: Vec2 = { x: handX, y: handY };
    const elbow = twoBoneIK(shoulder, hand, U, F, 1);
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip,
        knee: KNEE,
        ankle: ANKLE,
        heel: { x: ANKLE.x - 4, y: FLOOR_Y - 9 },
        toe: { x: ANKLE.x - 11, y: FLOOR_Y },
        elbow,
        hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(hip, -6, 1),
        farKnee: far(KNEE, -6, 1),
        farAnkle: far(ANKLE, -6, 1),
        farHeel: far({ x: ANKLE.x - 4, y: FLOOR_Y - 9 }, -6, 0),
        farToe: far({ x: ANKLE.x - 11, y: FLOOR_Y }, -6, 0),
      },
    };
  };

  const decorAt = (): Decor => ({
    back: [
      /* the ankle clamp — the anchor the exercise hangs from */
      ...padStroke({ x: ANKLE.x - 6, y: ANKLE.y - 8 }, { x: ANKLE.x + 6, y: ANKLE.y - 10 }, 7),
      { kind: 'line', a: { x: ANKLE.x, y: ANKLE.y - 11 }, b: { x: ANKLE.x, y: FLOOR_Y - 1 }, w: 2.5, color: 'ink3' },
      ...sampledPathTicks(ARC),
    ],
    front: [],
  });

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 165, max: 180, label: 'tall on the knees — hips locked, one line' },
    ],
    end: [
      { kind: 'contactY', a: 'hand', y: FLOOR_Y - 3, tol: 2, label: 'the catch — hands meet the floor' },
    ],
    path: { track: 'shoulder', kind: 'arc', tol: 2 },
    invariants: [
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees on the pad — the lever’s pivot' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'ankles clamped — the anchor' },
      /* The exercise: the hip NEVER breaks. A folding hip is a sit-back, not a nordic. The line
         ROTATES — so the check is colinearity of knee–hip–shoulder, not a frozen segment angle. */
      { kind: 'colinear', a: 'knee', b: 'hip', c: 'shoulder', tolDeg: 3, label: 'hips locked — the body falls as one line' },
    ],
  };

  return {
    id: 'nordic_curl',
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
    scene: floorScene(FLOOR_Y, 185, 52),
  };
})();

/* ── single_leg_rdl ────────────────────────────────────────────────────────────────────────────── */

export const singleLegRdl: Rig = (() => {
  /** The stance: one foot planted, its knee soft and FROZEN — the RDL's own rule. */
  const ANKLE: Vec2 = { x: 172, y: 186 };
  const KNEE: Vec2 = { x: ANKLE.x + 3, y: ANKLE.y - S * 0.97 };
  const HIP: Vec2 = { x: KNEE.x - 3, y: KNEE.y - T * 0.98 };
  /** The see-saw: trunk angle above horizontal 84° → 22°; the free leg mirrors it behind. */
  const TH_TALL = 84;
  const TH_HINGED = 22;

  const seesawAt = (theta: number) => {
    const r = (theta * Math.PI) / 180;
    const shoulder: Vec2 = { x: HIP.x + ATHLETE.torso * Math.cos(r), y: HIP.y - ATHLETE.torso * Math.sin(r) };
    /* The free leg rises exactly opposite: same line, other side of the hip, leg-length. */
    const freeAnkle: Vec2 = { x: HIP.x - (T + S) * 0.93 * Math.cos(r), y: HIP.y + (T + S) * 0.93 * Math.sin(r) };
    const freeKnee: Vec2 = { x: lerp(HIP.x, freeAnkle.x, 0.52), y: lerp(HIP.y, freeAnkle.y, 0.52) - 2 };
    return { shoulder, freeKnee, freeAnkle };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => seesawAt(lerp(TH_TALL, TH_HINGED, i / 16)).shoulder);

  const poseAt = (rom: number): Pose => {
    const theta = lerp(TH_TALL, TH_HINGED, rom);
    const { shoulder, freeKnee, freeAnkle } = seesawAt(theta);
    const r = (theta * Math.PI) / 180;
    const head: Vec2 = { x: shoulder.x + ATHLETE.neck * Math.cos(r) * 0.9, y: shoulder.y - ATHLETE.neck * Math.sin(r) * 0.9 };
    /* The load hangs plumb from the near hand, down the stance line. */
    const reach = (U + F) * 0.97;
    const hand: Vec2 = { x: shoulder.x + 2, y: shoulder.y + reach };
    const elbow = twoBoneIK(shoulder, hand, U, F, 1);
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip: HIP,
        knee: KNEE,
        ankle: ANKLE,
        heel: { x: ANKLE.x - 8, y: FLOOR_Y },
        toe: { x: ANKLE.x + 15, y: FLOOR_Y },
        elbow,
        hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(HIP, -6, 1),
        /* The FREE leg is the far side — rising behind as the counterweight. */
        farKnee: freeKnee,
        farAnkle: freeAnkle,
        farHeel: { x: freeAnkle.x - 5, y: freeAnkle.y - 4 },
        farToe: { x: freeAnkle.x - 11, y: freeAnkle.y + 2 },
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    return {
      back: [...sampledPathTicks(ARC)],
      front: [
        /* the honest r8 disc at the hanging hand — a dumbbell, side-on */
        { kind: 'circle', c: pose.j.hand, r: 8, fill: 'ink4', fillOpacity: 0.22, stroke: 'ink0', w: 2.2 },
        { kind: 'circle', c: pose.j.hand, r: 2.2, fill: 'ink0' },
      ],
    };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 160, max: 179, label: 'standing tall on one leg' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 85, max: 120, label: 'hinged — crown to raised heel, one line' },
    ],
    path: { track: 'shoulder', kind: 'arc', tol: 2 },
    invariants: [
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'the stance foot is planted' },
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'the stance knee is soft and FROZEN' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'the hip is the see-saw’s pivot' },
    ],
  };

  return {
    id: 'single_leg_rdl',
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
    scene: floorScene(FLOOR_Y, 172, 40),
  };
})();

/* ── pike_push_up ──────────────────────────────────────────────────────────────────────────────── */

export const pikePushUp: Rig = (() => {
  /** The fixed fold: toes planted, hips HIGH, the trunk's line running down toward the hands. */
  const TOES: Vec2 = { x: 252, y: FLOOR_Y - 2 };
  /** The legs' line and the trunk's line meet at the hip at a FIXED pike (~95°). The legs are
   *  near-straight from toes to hip; the trunk aims down-forward; only the elbows bend. */
  const LEG_LINE = (S + T) * 0.96;
  const LEG_DEG = 52; // legs' angle above the floor
  const HIP: Vec2 = {
    x: TOES.x - LEG_LINE * Math.cos((LEG_DEG * Math.PI) / 180),
    y: TOES.y - LEG_LINE * Math.sin((LEG_DEG * Math.PI) / 180),
  };
  /** The trunk's fixed direction: down-forward from the hip toward the hands. */
  const TRUNK_DEG = 38; // below horizontal
  const TR = (TRUNK_DEG * Math.PI) / 180;
  const TRUNK_DIR: Vec2 = { x: -Math.cos(TR), y: Math.sin(TR) };
  const SHOULDER0: Vec2 = { x: HIP.x + ATHLETE.torso * TRUNK_DIR.x, y: HIP.y + ATHLETE.torso * TRUNK_DIR.y };
  /*
   * THE HAND IS SOLVED, THE SHOULDER TRAVELS TOWARD IT (the file's angle rule, applied to a
   * press): the plant sits where a long arm (165°) meets the floor from the pike's shoulder, and
   * the rep runs the shoulder DOWN THE SHOULDER→HAND LINE until the elbow reads ~75° — so both
   * endpoint angles hold by construction, and the trunk/press lines agree to within a few degrees
   * (which is what makes it a pike push-up and not a bent-armed plank).
   */
  const reachAt = (deg: number) => Math.sqrt(U * U + F * F - 2 * U * F * Math.cos((deg * Math.PI) / 180));
  const dropToFloor = FLOOR_Y - 2 - SHOULDER0.y;
  const HAND: Vec2 = {
    x: SHOULDER0.x - Math.sqrt(Math.max(1, reachAt(165) ** 2 - dropToFloor ** 2)),
    y: FLOOR_Y - 2,
  };
  const PRESS_DIR: Vec2 = (() => {
    const d = Math.hypot(HAND.x - SHOULDER0.x, HAND.y - SHOULDER0.y);
    return { x: (HAND.x - SHOULDER0.x) / d, y: (HAND.y - SHOULDER0.y) / d };
  })();
  const TRAVEL = reachAt(165) - reachAt(75);
  const shoulderAt = (rom: number): Vec2 => ({
    x: SHOULDER0.x + PRESS_DIR.x * TRAVEL * rom,
    y: SHOULDER0.y + PRESS_DIR.y * TRAVEL * rom,
  });
  const ARC = Array.from({ length: 17 }, (_, i) => shoulderAt(i / 16));

  const poseAt = (rom: number): Pose => {
    const shoulder = shoulderAt(rom);
    /* The hip rides back along the leg line just enough to keep the leg length true. */
    const hipY = shoulder.y - ATHLETE.torso * TRUNK_DIR.y;
    const hipX = shoulder.x - ATHLETE.torso * TRUNK_DIR.x;
    const hip: Vec2 = { x: hipX, y: hipY };
    /* On the leg line, at EXACTLY a thigh from the hip. Interpolating by `T / LEG_LINE` was only
       right while the hip-to-toe distance stayed equal to `LEG_LINE`, and the pike's hip travels. */
    const toToes = { x: TOES.x - hip.x, y: TOES.y - hip.y };
    const toToesLen = Math.hypot(toToes.x, toToes.y) || 1;
    const knee: Vec2 = {
      x: hip.x + (toToes.x / toToesLen) * ATHLETE.thigh + 1.5,
      y: hip.y + (toToes.y / toToesLen) * ATHLETE.thigh,
    };
    const head: Vec2 = { x: shoulder.x + ATHLETE.neck * TRUNK_DIR.x, y: shoulder.y + ATHLETE.neck * TRUNK_DIR.y };
    /* +1, so the elbow flares AWAY from the floor. The other branch swung it down past its own
       supporting hand and six units under the ground at the bottom of the pike. */
    const elbow = twoBoneIK(shoulder, HAND, U, F, 1);
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip,
        knee,
        ankle: { x: TOES.x - 4, y: TOES.y - ATHLETE.ankleH },
        heel: { x: TOES.x + 4, y: TOES.y - 7 },
        toe: TOES,
        elbow,
        hand: HAND,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(HAND, -6, 1),
        farHip: far(hip, -6, 1),
        farKnee: far(knee, -6, 1),
        farAnkle: far({ x: TOES.x - 4, y: TOES.y - ATHLETE.ankleH }, -6, 1),
        farHeel: far({ x: TOES.x + 4, y: TOES.y - 7 }, -6, 0),
        farToe: far(TOES, -6, 0),
      },
    };
  };

  const decorAt = (): Decor => ({ back: [...sampledPathTicks(ARC)], front: [] });

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 150, max: 179, label: 'arms long in the pike' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 60, max: 90, label: 'crown lowered between the hands' },
    ],
    path: { track: 'shoulder', kind: 'line', tol: 2, dir: PRESS_DIR },
    invariants: [
      { kind: 'pointFixed', point: 'toe', tol: 0.5, label: 'toes planted' },
      { kind: 'pointFixed', point: 'hand', tol: 0.5, label: 'hands planted' },
      /* THE PIKE: hip–shoulder–hand near-straight — the pressing line is the straight one here. */
      { kind: 'colinear', a: 'hip', b: 'shoulder', c: 'hand', tolDeg: 14, label: 'the trunk presses down its own line' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return {
    id: 'pike_push_up',
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
    scene: floorScene(FLOOR_Y, 200, 60),
  };
})();

/* ── step_up ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * step_up (2026-08-25) — the lunge file's named exile, authored on the mechanism it was owed: a
 * TRAVELLING rear foot. The front foot is planted on the box and the hip drives vertically over
 * it (the lunge's own canon); the rear foot leaves the floor as the hip rises, riding an arc from
 * its floor plant to a trail beside the box — solved by IK from the travelling hip the whole way,
 * so the leg's bones never stretch. rom 0 = standing tall ON the box (the rep opens at the top
 * and lowers first, like every press); rom 1 = the controlled bottom, rear toe touching down.
 */
export const stepUpRig: Rig = (() => {
  /*
   * ⚠️ THE SCENE SITS 18u LOWER — the calf raise's fix, for the calf raise's reason: an athlete
   * standing TALL ON A BOX is taller than the media field from the canonical floor, and the frame
   * has ~20u of unused room beneath it. The floor drops, the box rides it, the crown clears the
   * top edge by its radius, and no proportion is touched.
   */
  /* +15, not +18 (audit, 2026-09-03): at +18 the floor line sat 2.5u from the frame's bottom edge
     and the ground strip was cut; at +15 it shows, and the crown still clears the top edge by 5u. */
  const SU_FLOOR = FLOOR_Y + 15;
  /* 22, not 28. At 28 the front ankle sits so high that the trailing foot's landing is 78 units
     below the hip at any readable depth — one more than a whole leg — so the only geometry that let
     the rear toe touch was a hip dropped into a near-pistol squat. A shorter box is a step-up that
     still looks like one. */
  const BOX_TOP = SU_FLOOR - 22;
  const FRONT_ANKLE: Vec2 = { x: 196, y: BOX_TOP - ATHLETE.ankleH };
  /**
   * THE HIP SITS BACK AND THE KNEE TRACKS FORWARD (audit, 2026-09-03). The hip used to be pinned at
   * one x with the front knee solved on the BACKWARD branch: at the bottom the knee sat 34u behind
   * the ankle with the shank lying 23° above horizontal on a flat foot — 65° of plantar-flexion
   * past neutral, a body sitting back into a chair that is not there. The only frame that taught
   * the movement taught it backwards. Now the knee takes the forward branch (over the toes, as a
   * step-up's does), the hip travels 20u back as it lowers so the standing foot stays under the
   * mass, and the trunk inclines ~22° to balance it. Measured at the bottom: knee 14u ahead of the
   * ankle, shank 22° forward of vertical, knee 85°.
   */
  const HIP_X_TOP = FRONT_ANKLE.x - 4;
  const HIP_BACK = 20;
  const hipXAt = (rom: number) => HIP_X_TOP - HIP_BACK * rom;
  /** Hip travel: tall on the box → lowered until the rear toe meets the floor. */
  const HIP_TOP = FRONT_ANKLE.y - (S + T) * 0.98;
  /** The rear foot: from trailing over the box's edge (up, at rom 0) to its floor touch (rom 1).
   *  Over the edge, not 34u behind it: a foot hanging behind the box read as one left dangling. */
  const REAR_UP: Vec2 = { x: FRONT_ANKLE.x - 22, y: BOX_TOP - 6 };
  const REAR_DOWN: Vec2 = { x: FRONT_ANKLE.x - 40, y: SU_FLOOR - ATHLETE.ankleH };
  /**
   * THE BOTTOM IS WHERE THE REAR LEG CAN ACTUALLY REACH THE FLOOR, not a fraction picked in
   * advance. It used to be `FRONT_ANKLE.y - (S + T) * 0.72`, which put the hip 83 units above the
   * rear foot's landing — further than a whole leg (77). The trailing leg simply could not get
   * there, and the shank stretched to 56 against a canonical 37 to cover the gap.
   *
   * Solving the height from the reach means the rear toe touches down BECAUSE the geometry allows
   * it, which is also the honest reading of the cue: you lower until it touches.
   */
  const HIP_BOTTOM = Math.max(
    /* the readable depth: about two-thirds of the front leg */
    FRONT_ANKLE.y - (S + T) * 0.68,
    /* never higher than the trailing leg can reach its landing from */
    REAR_DOWN.y - Math.sqrt(Math.max(1, Math.pow((S + T) * 0.97, 2) - Math.pow(hipXAt(1) - REAR_DOWN.x, 2))),
  );
  const HIP_PATH = Array.from({ length: 17 }, (_, i) => ({ x: hipXAt(i / 16), y: lerp(HIP_TOP, HIP_BOTTOM, i / 16) }));
  const HIP_DIR: Vec2 = (() => {
    const d = Math.hypot(HIP_PATH[16].x - HIP_PATH[0].x, HIP_PATH[16].y - HIP_PATH[0].y);
    return { x: (HIP_PATH[16].x - HIP_PATH[0].x) / d, y: (HIP_PATH[16].y - HIP_PATH[0].y) / d };
  })();
  /** Trunk incline at the bottom, as the shoulder's lead over the hip: ~22° from vertical. */
  const LEAN_X = 20;
  /* The trunk lags the legs (iron rule 12): it stays tall through the first fifth of the descent
     and is the first thing home on the drive — a lifter who leans at the bottom, not from the top. */
  const LEAN_LAGS = lags(0.2);

  const poseAt = (rom: number): Pose => {
    const hip: Vec2 = { x: hipXAt(rom), y: lerp(HIP_TOP, HIP_BOTTOM, rom) };
    /* −1: the knee's forward branch, over the toes. */
    const frontKnee = twoBoneIK(hip, FRONT_ANKLE, T, S, -1);
    /* The trailing foot is CLAMPED into the leg's reach (execution pass, 2026-09-03): trailing
       over the box's edge at the top, the raw target sat 78.6u from the hip against a 77u leg and
       the shank stretched to 38.6. A foot that cannot reach hangs a unit higher; it does not grow. */
    const rearAnkle = withinReach(hip, { x: lerp(REAR_UP.x, REAR_DOWN.x, rom), y: lerp(REAR_UP.y, REAR_DOWN.y, rom) }, (T + S) * 0.985);
    const rearKnee = twoBoneIK(hip, rearAnkle, T, S, -1);
    const lean = 2 + LEAN_X * LEAN_LAGS(rom);
    /* The trunk is a BONE: the shoulder sits on the circle of `ATHLETE.torso` about the hip, the
       lean spent as x and the rest as height — authored as (+lean, −torso) it measured 52.8u at
       the bottom (execution pass, 2026-09-03). */
    const shoulder: Vec2 = { x: hip.x + lean, y: hip.y - Math.sqrt(ATHLETE.torso * ATHLETE.torso - lean * lean) };
    const trunkLen = ATHLETE.torso;
    /* The head continues the trunk's line. */
    const head: Vec2 = { x: shoulder.x + (lean / trunkLen) * ATHLETE.neck, y: shoulder.y - ((hip.y - shoulder.y) / trunkLen) * ATHLETE.neck };
    /* The dumbbells hang plumb from the shoulders whatever the trunk does. */
    const elbow: Vec2 = { x: shoulder.x + 3, y: shoulder.y + ATHLETE.upperArm };
    const hand: Vec2 = { x: elbow.x + 1, y: elbow.y + ATHLETE.foreArm };
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip,
        knee: frontKnee,
        ankle: FRONT_ANKLE,
        heel: { x: FRONT_ANKLE.x - 8, y: BOX_TOP },
        toe: { x: FRONT_ANKLE.x + 14, y: BOX_TOP },
        elbow,
        hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(hip, -6, 1),
        farKnee: rearKnee,
        farAnkle: rearAnkle,
        farHeel: { x: rearAnkle.x - 6, y: rearAnkle.y + 5 },
        farToe: { x: rearAnkle.x + 8, y: rearAnkle.y + 7 },
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    return {
      back: [
        { kind: 'rect', x: 176, y: BOX_TOP, width: 48, height: SU_FLOOR - BOX_TOP, rx: 3, fill: 'paper3', stroke: 'ink3', w: 2 },
        /* The hip's own path, drawn 26u to its left — outside the figure in every frame. */
        ...sampledPathTicks(HIP_PATH.map((p) => ({ x: p.x - 26, y: p.y }))),
        /* The card says dumbbell (audit, 2026-09-03): the hands used to hang empty, so a 2×10 kg
           step-up read as bodyweight. Side-on, handle along x, the far one behind the figure. */
        ...dumbbellSide(pose.j.farHand, { x: 1, y: 0 }),
      ],
      front: [...dumbbellSide(pose.j.hand, { x: 1, y: 0 })],
    };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'contactY', a: 'hip', y: HIP_TOP, tol: 2, label: 'tall on the box — drive through the top foot' },
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 155, max: 179, label: 'the top leg long' },
    ],
    end: [
      { kind: 'contactY', a: 'farAnkle', y: REAR_DOWN.y, tol: 2, label: 'lowered under control to the floor touch' },
      /* THE KNEE OVER THE TOES at the bottom — the fact the backward branch got wrong. */
      { kind: 'jointRightOf', a: 'knee', b: 'ankle', by: 8, label: 'the top knee tracks forward over the foot' },
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 70, max: 105, label: 'the top knee bent to a step-up depth' },
    ],
    /* The hip drops AND sits back: a line, not a vertical. */
    path: { track: 'hip', kind: 'line', tol: 1.5, dir: HIP_DIR },
    invariants: [
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'the top foot never leaves the box' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['hip', 'ankle'], aboveDeg: 179, label: 'no knee snap at the top' },
    ],
  };

  return {
    id: 'step_up',
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
    scene: floorScene(SU_FLOOR, 190, 46),
  };
})();

/* ── bicycle_crunch ────────────────────────────────────────────────────────────────────────────── */

/**
 * bicycle_crunch (2026-08-25) — the last excision, unlocked by the russian twist's rule: THE REP
 * IS THE CYCLE. One rep = one full pedal — near knee tucked & far leg long, through the middle,
 * to near leg long & far knee tucked — so the alternation that made it undrawable under
 * two-identical-reps is simply what one rep IS. Side view, the dead bug's camera: the crossing
 * of elbow toward opposite knee reads as the tucked knee rising to meet the bowed trunk.
 *
 * What never changes is the exercise: the shoulders are held OFF the floor the whole cycle
 * (the trunk is bowed and PINNED — "lower back flat, shoulders up" is the posture, not a phase),
 * the hands stay at the ears, and the hips never rock. The legs pedal; everything else is a
 * held crunch.
 */
export const bicycleCrunch: Rig = (() => {
  /** Supine, trunk bowed and held: shoulders lifted off the floor, hips down, hands at the ears. */
  const HIP: Vec2 = { x: 176, y: FLOOR_Y - 9 };
  const SHOULDER: Vec2 = { x: HIP.x - ATHLETE.torso * 0.96, y: FLOOR_Y - 22 }; // held up — the crunch
  const HEAD: Vec2 = { x: SHOULDER.x - 12, y: SHOULDER.y - 9 };
  const ELBOW: Vec2 = { x: SHOULDER.x + 6, y: SHOULDER.y - 12 };
  const HAND: Vec2 = { x: HEAD.x + 7, y: HEAD.y - 2 }; // at the ear, and it stays there

  /** One leg's pedal: t = 0 tucked (knee to the chest), t = 1 long and low. */
  const legAt = (t: number): { knee: Vec2; ankle: Vec2 } => {
    const thighDeg = lerp(96, 16, t); // above the floor
    const kneeDeg = lerp(52, 152, t); // interior at the knee
    const tr = (thighDeg * Math.PI) / 180;
    const knee: Vec2 = { x: HIP.x + T * 0.92 * Math.cos(tr), y: HIP.y - T * 0.92 * Math.sin(tr) };
    const shinDeg = thighDeg - (180 - kneeDeg);
    const sr = (shinDeg * Math.PI) / 180;
    return { knee, ankle: { x: knee.x + S * 0.92 * Math.cos(sr), y: knee.y - S * 0.92 * Math.sin(sr) } };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => legAt(i / 16).ankle);

  const poseAt = (rom: number): Pose => {
    /* The pedal: the near leg runs tucked→long as rom runs 0→1; the far leg runs the mirror. */
    const near = legAt(rom);
    const fr = legAt(1 - rom);
    return {
      headR: ATHLETE.headR,
      trunkBow: 6, // bowed the WHOLE cycle — the held crunch
      j: {
        head: HEAD,
        shoulder: SHOULDER,
        hip: HIP,
        knee: near.knee,
        ankle: near.ankle,
        heel: { x: near.ankle.x - 3, y: near.ankle.y + 5 },
        toe: { x: near.ankle.x + 7, y: near.ankle.y + 3 },
        elbow: ELBOW,
        hand: HAND,
        farShoulder: far(SHOULDER, -6, 1),
        farElbow: far(ELBOW, -6, 1),
        farHand: far(HAND, -6, 1),
        farHip: far(HIP, -6, 1),
        farKnee: far(fr.knee, -6, 1),
        farAnkle: far(fr.ankle, -6, 1),
        farHeel: far({ x: fr.ankle.x - 3, y: fr.ankle.y + 5 }, -6, 0),
        farToe: far({ x: fr.ankle.x + 7, y: fr.ankle.y + 3 }, -6, 0),
      },
    };
  };

  const decorAt = (): Decor => ({ back: [...sampledPathTicks(ARC)], front: [] });

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 42, max: 68, label: 'near knee tucked to the chest' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 140, max: 168, label: 'pedalled long and low — never touching down' },
    ],
    path: { track: 'ankle', kind: 'arc', tol: 3.5 },
    invariants: [
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'lower back pressed — the pelvis does not rock' },
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'shoulders HELD off the floor — the crunch never drops' },
      { kind: 'pointFixed', point: 'hand', tol: 0.5, label: 'hands at the ears — never pulling the neck' },
      { kind: 'pointFixed', point: 'elbow', tol: 0.5, label: 'the elbows ride the held trunk, nothing else' },
    ],
  };

  return {
    id: 'bicycle_crunch',
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
    scene: floorScene(FLOOR_Y, 172, 55),
  };
})();
