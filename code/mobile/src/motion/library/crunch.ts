/**
 * crunch — spinal flexion about a fixed pelvis, in the three postures a gym offers it: lying
 * (sit_up), kneeling under a cable (cable_crunch), and seated at the machine (machine_crunch).
 * One mechanism: the TRUNK rotates about a pinned hip while `Pose.trunkBow` — the field the
 * standard carved out for exactly this pattern — bows the silhouette toward its front, so the
 * figure visibly CURLS rather than folding like a hinge. A crunch drawn with a straight trunk is
 * a hip flexor exercise, which is precisely the fault the cues warn against.
 *
 * ── THE SHARED CANON ────────────────────────────────────────────────────────────────────────────
 * "Hips fixed" (the cable card's own words): the hip is `pointFixed` and it is the pivot. The
 * shoulder is the tracked point on the arc the trunk sweeps; the bow rises with the flexion and
 * leaves with it. The legs are furniture — planted (sit_up), knelt (cable), or seated (machine) —
 * and every leg joint is pinned.
 *
 * ── MEMBERS ─────────────────────────────────────────────────────────────────────────────────────
 *   · `sit_up`         — supine, knees bent, feet planted; trunk sweeps floor → upright-ish.
 *                        Hands held at the chest (the honest default; behind-the-head invites
 *                        neck-pulling, which the drawing must not model).
 *   · `cable_crunch`   — kneeling, rope held at the head, high pulley behind-and-above; the trunk
 *                        bows DOWN. The stack rises as she curls — resistance from above.
 *   · `machine_crunch` — seated, chest on the pad; same downward bow, the machine's lever arc.
 *   · `bicycle_crunch` — ⛔ NOT HERE. It alternates sides with a twist toward the opposite knee —
 *                        a two-sided, rotating movement this one-plane mechanism cannot say
 *                        truthfully (the step-up's lesson, again). Its own authoring, later.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, bendToward, twoBoneIK } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { cable, floorScene, padStroke, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far } from '../bodies';

const T = ATHLETE.torso;

interface CrunchParams {
  id: string;
  /** The fixed pelvis. */
  hip: Vec2;
  /** Trunk angle from vertical, degrees, at rom 0 and rom 1. Positive leans FORWARD (screen +x). */
  angleFrom: number;
  angleTo: number;
  /** How hard the silhouette bows at full flexion (`Pose.trunkBow` units). */
  bowMax: number;
  /** The fixed legs, supplied whole by each posture. */
  legs: Record<string, Vec2>;
  furniture: (pose: Pose, rom: number) => { back: Primitive[]; front: Primitive[] };
}

function crunch(p: CrunchParams): Rig {
  const shoulderAt = (deg: number): Vec2 => {
    const r = (deg * Math.PI) / 180;
    return { x: p.hip.x + T * Math.sin(r), y: p.hip.y - T * Math.cos(r) };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => shoulderAt(lerp(p.angleFrom, p.angleTo, i / 16)));

  /* The elbow's side, resolved once at the most-flexed position and held for the whole rep. */
  const ELBOW_BEND = (() => {
    const sh = shoulderAt(p.angleTo);
    const hand = { x: lerp(p.hip.x, sh.x, 0.78) + 9, y: lerp(p.hip.y, sh.y, 0.78) };
    return bendToward(sh, hand, ATHLETE.upperArm, ATHLETE.foreArm, {
      x: lerp(p.hip.x, sh.x, 0.62) + 12,
      y: lerp(p.hip.y, sh.y, 0.62) - 12,
    });
  })();

  const poseAt = (rom: number): Pose => {
    const deg = lerp(p.angleFrom, p.angleTo, rom);
    const shoulder = shoulderAt(deg);
    /* The head continues the trunk line — and bows WITH it: at full flexion the chin tucks. */
    const r = (deg * Math.PI) / 180;
    const bow = p.bowMax * rom;
    const head: Vec2 = {
      x: shoulder.x + (ATHLETE.neck - bow * 0.4) * Math.sin(r + (bow * Math.PI) / 90),
      y: shoulder.y - (ATHLETE.neck - bow * 0.4) * Math.cos(r + (bow * Math.PI) / 90),
    };
    /* Hands held at the chest/head: riding the trunk, halfway up it, a shade in front. */
    /* Arms folded across the chest: the HAND is the authored end and the elbow is solved, so the
       upper arm stops being however far apart the two happened to land (30.6 against 25). */
    const hand: Vec2 = { x: lerp(p.hip.x, shoulder.x, 0.78) + 9, y: lerp(p.hip.y, shoulder.y, 0.78) };
    /* Hinted ABOVE the trunk line, not below it: the elbow of a lifter lying on the floor has
       nowhere to go downward, and the old hint put it 3 units under the ground. */
    /* Fixed sign, resolved once below — a per-frame hint made this elbow jump 45.8 units mid-rep. */
    const elbow = twoBoneIK(shoulder, hand, ATHLETE.upperArm, ATHLETE.foreArm, ELBOW_BEND);
    return {
      headR: ATHLETE.headR,
      trunkBow: bow,
      j: {
        head,
        shoulder,
        hip: p.hip,
        elbow,
        hand,
        ...p.legs,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(p.hip, -6, 1),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const extra = p.furniture(pose, rom);
    return { back: [...sampledPathTicks(ARC), ...extra.back], front: extra.front };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'contactY', a: 'shoulder', y: shoulderAt(p.angleFrom).y, tol: 2, label: 'open — the abs long' },
    ],
    end: [
      { kind: 'contactY', a: 'shoulder', y: shoulderAt(p.angleTo).y, tol: 2, label: 'crunched — through the abs, not the hips' },
    ],
    path: { track: 'shoulder', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips fixed — the pelvis is the pivot, not a passenger' },
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'the legs are furniture' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'feet stay planted' },
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
    scene: floorScene(FLOOR_Y, p.hip.x, 40),
  };
}

/* ── sit_up: supine, knees bent, feet planted ─────────────────────────────────────────────────── */
const SU_HIP: Vec2 = { x: 150, y: FLOOR_Y - 10 };
const SU_LEGS: Record<string, Vec2> = {
  knee: { x: SU_HIP.x + 30, y: FLOOR_Y - 34 },
  ankle: { x: SU_HIP.x + 46, y: FLOOR_Y - ATHLETE.ankleH },
  heel: { x: SU_HIP.x + 41, y: FLOOR_Y },
  toe: { x: SU_HIP.x + 56, y: FLOOR_Y },
  farKnee: { x: SU_HIP.x + 24, y: FLOOR_Y - 33 },
  farAnkle: { x: SU_HIP.x + 40, y: FLOOR_Y - ATHLETE.ankleH - 1 },
  farHeel: { x: SU_HIP.x + 35, y: FLOOR_Y - 1 },
  farToe: { x: SU_HIP.x + 50, y: FLOOR_Y - 1 },
};

export const sitUpRig = crunch({
  id: 'sit_up',
  hip: SU_HIP,
  /* Lying back (−78° from vertical: the trunk almost flat behind the hip) → sat up (−8°). */
  angleFrom: -78,
  angleTo: -8,
  bowMax: 5,
  legs: SU_LEGS,
  furniture: () => ({ back: [], front: [] }),
});

/* ── cable_crunch: kneeling under the high pulley ─────────────────────────────────────────────── */
const KN_HIP: Vec2 = { x: 168, y: FLOOR_Y - 42 };
const KN_LEGS: Record<string, Vec2> = {
  knee: { x: KN_HIP.x + 2, y: FLOOR_Y - 6 },
  ankle: { x: KN_HIP.x - 28, y: FLOOR_Y - 5 },
  heel: { x: KN_HIP.x - 33, y: FLOOR_Y - 7 },
  toe: { x: KN_HIP.x - 40, y: FLOOR_Y },
  farKnee: { x: KN_HIP.x - 4, y: FLOOR_Y - 5 },
  farAnkle: { x: KN_HIP.x - 34, y: FLOOR_Y - 4 },
  farHeel: { x: KN_HIP.x - 39, y: FLOOR_Y - 6 },
  farToe: { x: KN_HIP.x - 46, y: FLOOR_Y - 1 },
};
const KN_PULLEY: Vec2 = { x: 236, y: 34 };

export const cableCrunchRig = crunch({
  id: 'cable_crunch',
  hip: KN_HIP,
  /* Tall on the knees, leaning slightly toward the stack (18°) → bowed down hard (62°). */
  angleFrom: 18,
  angleTo: 62,
  bowMax: 7,
  legs: KN_LEGS,
  furniture: (pose, rom) => {
    const risen = rom * 20;
    const tower = stackTower({ x0: KN_PULLEY.x + 10, x1: KN_PULLEY.x + 36, capY: 26, stackTopY: FLOOR_Y - 34 }, risen);
    return {
      back: [...tower.prims, ...pulley(KN_PULLEY)],
      front: [cable(KN_PULLEY, pose.j.hand)],
    };
  },
});

/* ── machine_crunch: seated, chest on the pad ─────────────────────────────────────────────────── */
const MC_HIP: Vec2 = { x: 168, y: FLOOR_Y - 37 };
const MC_LEGS: Record<string, Vec2> = {
  knee: { x: MC_HIP.x + 34, y: FLOOR_Y - 40 },
  ankle: { x: MC_HIP.x + 42, y: FLOOR_Y - ATHLETE.ankleH },
  heel: { x: MC_HIP.x + 37, y: FLOOR_Y },
  toe: { x: MC_HIP.x + 52, y: FLOOR_Y },
  farKnee: { x: MC_HIP.x + 28, y: FLOOR_Y - 39 },
  farAnkle: { x: MC_HIP.x + 36, y: FLOOR_Y - ATHLETE.ankleH - 1 },
  farHeel: { x: MC_HIP.x + 31, y: FLOOR_Y - 1 },
  farToe: { x: MC_HIP.x + 46, y: FLOOR_Y - 1 },
};

export const machineCrunchRig = crunch({
  id: 'machine_crunch',
  hip: MC_HIP,
  angleFrom: 6,
  angleTo: 52,
  bowMax: 7,
  legs: MC_LEGS,
  furniture: (pose, rom) => {
    /* The seat, the chest pad riding the trunk, and the stack rising with the curl. */
    const chest: Vec2 = { x: lerp(pose.j.hip.x, pose.j.shoulder.x, 0.7) + 10, y: lerp(pose.j.hip.y, pose.j.shoulder.y, 0.7) };
    const tower = stackTower({ x0: 248, x1: 274, capY: 60, stackTopY: FLOOR_Y - 34 }, rom * 18);
    return {
      back: [
        ...tower.prims,
        /*
         * The frame, which the pad and the stack had nothing between them but empty air. A pivot on
         * a mast behind the seat, the swing arm from it down to the chest pad, and a beam across to
         * the tower: one machine, not three parts standing near each other (§3.5).
         */
        { kind: 'line', a: { x: MC_HIP.x - 34, y: 74 }, b: { x: MC_HIP.x - 34, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
        { kind: 'line', a: { x: MC_HIP.x - 46, y: FLOOR_Y - 2 }, b: { x: 248, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
        { kind: 'line', a: { x: MC_HIP.x - 34, y: 84 }, b: { x: 248, y: 84 }, w: 2.5, color: 'ink3' },
        { kind: 'line', a: { x: MC_HIP.x - 34, y: 78 }, b: { x: chest.x + 2, y: chest.y - 6 }, w: 3, color: 'ink3' },
        { kind: 'circle', c: { x: MC_HIP.x - 34, y: 78 }, r: 3, fill: 'paper1', stroke: 'ink3', w: 2 },
        { kind: 'rect', x: MC_HIP.x - 22, y: MC_HIP.y + 4, width: 44, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
        { kind: 'line', a: { x: MC_HIP.x, y: MC_HIP.y + 11 }, b: { x: MC_HIP.x, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
      ],
      front: padStroke({ x: chest.x, y: chest.y - 8 }, { x: chest.x + 4, y: chest.y + 10 }, 7),
    };
  },
});
