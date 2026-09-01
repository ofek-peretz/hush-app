/**
 * elbow_extension_overhead — the triceps at its longest: the upper arm points UP (by the ears, or
 * straight off a lying shoulder) and the forearm hinges behind the head. Side view — the third
 * elbow-arc family, and the one whose whole point is the STRETCH: overhead, the long head is
 * lengthened, which neither the pushdown nor the kickback can do.
 *
 * ── THE SHARED MECHANISM ────────────────────────────────────────────────────────────────────────
 * The ELBOW is fixed high — one canonical upper-arm along its member's direction from the
 * shoulder — and only the forearm sweeps, from the deep stretch behind the head to a lockout shy
 * of the hyperextension ceiling. "Elbows by your ears" / "elbows pointed up" is `pointFixed` on
 * the elbow plus the fixed upper-arm direction; flaring is the fault, and a fixed pivot cannot
 * flare.
 *
 * ── MEMBERS ─────────────────────────────────────────────────────────────────────────────────────
 *   · `overhead_triceps_ext`    — standing at the low cable, rope overhead; stack behind-below.
 *   · `db_overhead_triceps_ext` — standing, both hands under one dumbbell's plate.
 *   · `skullcrusher`            — LYING: the body goes horizontal on the bench, the upper arm
 *     points straight up off the lying shoulder, and the forearm lowers to the forehead — which
 *     is the same sweep rotated 90° with the head at its bottom. The bar is drawn at the fist.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIKToward } from '../geometry';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { cable, dumbbellSide, floorScene, flatBench, plateGhost, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far } from '../bodies';

const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;

interface OverheadParams {
  id: string;
  /** The full static body minus the working arm. */
  body: { head: Vec2; shoulder: Vec2; hip: Vec2; knee: Vec2; ankle: Vec2; heel: Vec2; toe: Vec2 };
  /** The upper arm's direction from the shoulder, degrees from straight-up, leaning BACK positive. */
  upperArmDeg: number;
  /** Forearm sweep about the fixed elbow: degrees from the upper arm's own line (0 = folded onto
   *  it is impossible; measured as the interior elbow angle at the endpoints instead). */
  phiFrom: number;
  phiTo: number;
  implement: 'cable' | 'db' | 'bar';
  furniture: Primitive[];
  /** Where the cable's pulley sits (cable member only). */
  pulleyAt?: Vec2;
}

function overheadExt(p: OverheadParams): Rig {
  const armRad = (p.upperArmDeg * Math.PI) / 180;
  /* The fixed elbow: one upper-arm from the shoulder, pointing up (tilted back by upperArmDeg). */
  const ELBOW: Vec2 = {
    x: p.body.shoulder.x - U * Math.sin(armRad),
    y: p.body.shoulder.y - U * Math.cos(armRad),
  };
  /* The forearm's direction at sweep φ, measured from the CONTINUATION of the upper arm (so
     φ = 0 is a straight elbow): the hand folds BACK behind the head as φ grows. */
  const handAt = (phi: number): Vec2 => {
    /* φ = 0 continues the upper arm PAST the elbow (a straight arm, interior 180°); growing φ
       folds the hand back down behind the head. Interior elbow = 180° − φ, by construction. */
    const r = armRad + (phi * Math.PI) / 180;
    return { x: ELBOW.x - F * Math.sin(r), y: ELBOW.y - F * Math.cos(r) };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => handAt(lerp(p.phiFrom, p.phiTo, i / 16)));

  const poseAt = (rom: number): Pose => {
    const hand = handAt(lerp(p.phiFrom, p.phiTo, rom));
    return {
      headR: ATHLETE.headR,
      j: {
        ...p.body,
        elbow: ELBOW,
        hand,
        farShoulder: far(p.body.shoulder, -6, 1),
        farElbow: far(ELBOW, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(p.body.hip, -6, 1),
        farKnee: far(p.body.knee, -6, 1),
        farAnkle: far(p.body.ankle, -6, 1),
        farHeel: far(p.body.heel, -6, 0),
        farToe: far(p.body.toe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const back: Primitive[] = [...p.furniture, ...sampledPathTicks(ARC)];
    let front: Primitive[] = [];
    if (p.implement === 'cable' && p.pulleyAt) {
      const travelled = rom;
      const tower = stackTower(
        { x0: p.pulleyAt.x - 30, x1: p.pulleyAt.x - 6, capY: FLOOR_Y - 96, stackTopY: FLOOR_Y - 34 },
        travelled * 18,
      );
      back.push(...tower.prims, ...pulley(p.pulleyAt));
      front = [cable(p.pulleyAt, pose.j.hand)];
    } else if (p.implement === 'db') {
      front = dumbbellSide(pose.j.hand, { x: 0, y: 1 }, 6.5, 4);
    } else {
      front = plateGhost(pose.j.hand, 9);
    }
    return { back, front };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      {
        kind: 'jointAngle',
        joint: 'elbow',
        neighbors: ['shoulder', 'hand'],
        min: 160,
        max: 179,
        label: 'lockout overhead — long, never snapped',
      },
    ],
    end: [
      {
        kind: 'jointAngle',
        joint: 'elbow',
        neighbors: ['shoulder', 'hand'],
        min: 38,
        max: 72,
        label: 'the deep stretch behind the head',
      },
    ],
    path: { track: 'hand', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'elbow', tol: 0.5, label: 'elbows by your ears — the pivot never flares' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the body holds still' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'no drive from below' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
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
    scene: floorScene(FLOOR_Y, p.body.hip.x + 10, 34),
  };
}

/*
 * ⚠️ SEATED, NOT STANDING — for two reasons that agree. Standing, an overhead lockout puts the
 * fist at y ≈ 15 against a frame that starts at 26: a 152u athlete plus a full arm overhead is
 * simply taller than the media field, and the framing law said so on the first run. And the
 * seated version IS the gym's canonical form of this lift — the bench takes the lower back out
 * of it, which is why every card and coach defaults there. The frame and the form agree.
 */
const OT_HIP: Vec2 = { x: 172, y: 155 };
const OT_SHOULDER: Vec2 = { x: 172, y: 155 - ATHLETE.torso };
const SEATED_BODY = {
  head: { x: OT_SHOULDER.x + 1, y: OT_SHOULDER.y - ATHLETE.neck },
  shoulder: OT_SHOULDER,
  hip: OT_HIP,
  knee: { x: OT_HIP.x + 38, y: 151 },
  ankle: { x: OT_HIP.x + 46, y: 186 },
  heel: { x: OT_HIP.x + 40, y: FLOOR_Y },
  toe: { x: OT_HIP.x + 65, y: FLOOR_Y },
};
const OT_BENCH: Primitive[] = [
  { kind: 'rect', x: OT_HIP.x - 20, y: OT_HIP.y + 5, width: 40, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
  { kind: 'line', a: { x: OT_HIP.x, y: OT_HIP.y + 12 }, b: { x: OT_HIP.x, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
];

export const overheadTricepsExt = overheadExt({
  id: 'overhead_triceps_ext',
  body: SEATED_BODY,
  upperArmDeg: 12,
  phiFrom: 8, // lockout: interior ≈ 172°
  phiTo: 122, // the stretch: interior ≈ 58°
  implement: 'cable',
  pulleyAt: { x: OT_HIP.x - 56, y: FLOOR_Y - 10 },
  furniture: OT_BENCH,
});

export const dbOverheadTricepsExt = overheadExt({
  id: 'db_overhead_triceps_ext',
  body: SEATED_BODY,
  upperArmDeg: 12,
  phiFrom: 8,
  phiTo: 122,
  implement: 'db',
  furniture: OT_BENCH,
});

/**
 * The skullcrusher's LYING body: horizontal on the bench, head to the left, the working shoulder
 * up at bench height. The upper arm points straight UP off the lying shoulder (upperArmDeg 0
 * relative to vertical — the same "by the ears" in a rotated frame), and the stretch lowers the
 * bar toward the forehead, which sits exactly where the arc's bottom lands.
 */
const BENCH_TOP = FLOOR_Y - 34;
const SK_SHOULDER: Vec2 = { x: 168, y: BENCH_TOP - 8 };
const SK_BODY = {
  head: { x: SK_SHOULDER.x - 16, y: SK_SHOULDER.y - 1 },
  shoulder: SK_SHOULDER,
  hip: { x: SK_SHOULDER.x + ATHLETE.torso, y: BENCH_TOP - 7 },
  /* Solved, not authored. Lying on the bench with the feet on the floor, the hip and the ankle are
     both fixed by the scene, and a third hand-placed knee between them cannot also be right: the
     shin came out at 52.9 against a canonical 37. */
  knee: twoBoneIKToward(
    { x: SK_SHOULDER.x + ATHLETE.torso, y: BENCH_TOP - 7 },
    { x: SK_SHOULDER.x + ATHLETE.torso + 34, y: FLOOR_Y - ATHLETE.ankleH },
    ATHLETE.thigh,
    ATHLETE.shank,
    { x: SK_SHOULDER.x + ATHLETE.torso + 20, y: BENCH_TOP - 24 },
  ),
  ankle: { x: SK_SHOULDER.x + ATHLETE.torso + 34, y: FLOOR_Y - ATHLETE.ankleH },
  heel: { x: SK_SHOULDER.x + ATHLETE.torso + 29, y: FLOOR_Y },
  toe: { x: SK_SHOULDER.x + ATHLETE.torso + 43, y: FLOOR_Y },
};

export const skullcrusher = overheadExt({
  id: 'skullcrusher',
  body: SK_BODY,
  /* Lying, "up" off the shoulder is 90° from standing — the same tilt convention, rotated: the
     upper arm points at the ceiling with a whisper of lean toward the head. */
  upperArmDeg: 8,
  phiFrom: 8,
  phiTo: 116, // the bar arrives over the forehead — the honest "skull" the name warns about
  implement: 'bar',
  furniture: flatBench(SK_SHOULDER.x - 30, SK_SHOULDER.x + ATHLETE.torso + 16, BENCH_TOP, FLOOR_Y),
});
