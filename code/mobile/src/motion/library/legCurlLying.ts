/**
 * knee_flexion, completed — the two members the seated machine could not cover, because their
 * BODIES are different, not their joint: lying face-down (leg_curl) and standing at the single-leg
 * station (standing_leg_curl). The knee is still the pivot and the shin still swings; what changes
 * is everything that holds still. (`nordic_curl` remains open: its knee is the pivot but the whole
 * BODY is the lever falling forward — a different mechanism, the step-up rule again.)
 *
 * ── leg_curl (lying) ────────────────────────────────────────────────────────────────────────────
 * Face-down along the bench, hips pressed into the pad ("Hips down." — the card's first cue,
 * pinned as the invariant it is: the cheat on this machine is the butt rising to help). The shin
 * sweeps from straight back to curled upright, the pad riding the ankle's back.
 *
 * ── standing_leg_curl ───────────────────────────────────────────────────────────────────────────
 * Upright at the station, thigh pressed to the pad, one shin curling the heel toward the glute
 * while the stance leg carries her. The same sweep, hung from a standing thigh.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { floorScene, padStroke, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far, standingCore } from '../bodies';

const S = ATHLETE.shank;

/* ── lying ────────────────────────────────────────────────────────────────────────────────────── */

const BENCH_TOP = FLOOR_Y - 30;
/** Face-down: head left, hips at the pad's hump, the working knee just off the bench's end. */
const LY_SHOULDER: Vec2 = { x: 120, y: BENCH_TOP - 8 };
const LY_HIP: Vec2 = { x: LY_SHOULDER.x + ATHLETE.torso, y: BENCH_TOP - 9 };
const LY_KNEE: Vec2 = { x: LY_HIP.x + ATHLETE.thigh * 0.98, y: BENCH_TOP - 6 };

/** The shin's sweep about the lying knee: 0 = straight back along the bench, 90+ = curled upright. */
const LY_FROM = 6;
const LY_TO = 108;

/** An offset in the SHIN'S frame at θ=0 (x on along the shin, y across it), turned with the shin. */
function lyingShinFrame(v: Vec2, theta: number): Vec2 {
  const r = (theta * Math.PI) / 180;
  return { x: v.x * Math.cos(r) + v.y * Math.sin(r), y: -v.x * Math.sin(r) + v.y * Math.cos(r) };
}

function lyingAnkleAt(theta: number): Vec2 {
  /* θ=0 points on along the body line (+x); the curl folds the heel up and over the knee. */
  const d = lyingShinFrame({ x: S, y: 0 }, theta);
  return { x: LY_KNEE.x + d.x, y: LY_KNEE.y + d.y };
}

/*
 * The foot and the roller, in the shin's frame. Both used to be fixed page offsets from the ankle,
 * so while the shin turned 102° the foot stayed pointing down the bench — knee-ankle-toe ran
 * 129° → 27°, a foot folded onto its own shin at the top — and the roller stayed a vertical bar
 * that ended up lying ALONG the raised shin instead of across its back (audit, 2026-09-03).
 * Heel behind-and-up, toe forward-and-down: a prone foot, plantar-flexed a little, all the way round.
 */
const LY_HEEL: Vec2 = { x: -1, y: -6 };
const LY_TOE: Vec2 = { x: 6, y: 6 };
/** The roller's centre: on the calf's back (up, when prone), just behind the ankle. */
const LY_ROLLER: Vec2 = { x: -1, y: -7 };

export const legCurlLying: Rig = (() => {
  const ARC = Array.from({ length: 17 }, (_, i) => lyingAnkleAt(lerp(LY_FROM, LY_TO, i / 16)));

  const poseAt = (rom: number): Pose => {
    const theta = lerp(LY_FROM, LY_TO, rom);
    const ankle = lyingAnkleAt(theta);
    const h = lyingShinFrame(LY_HEEL, theta);
    const t = lyingShinFrame(LY_TOE, theta);
    const heel: Vec2 = { x: ankle.x + h.x, y: ankle.y + h.y };
    const toe: Vec2 = { x: ankle.x + t.x, y: ankle.y + t.y };
    const head: Vec2 = { x: LY_SHOULDER.x - 15, y: LY_SHOULDER.y - 1 };
    /* Arms folded forward under the chest, gripping the bench's handles. */
    const elbow: Vec2 = { x: LY_SHOULDER.x - 4, y: BENCH_TOP + 6 };
    const hand: Vec2 = { x: LY_SHOULDER.x - 20, y: BENCH_TOP + 8 };
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder: LY_SHOULDER,
        hip: LY_HIP,
        knee: LY_KNEE,
        ankle,
        heel,
        toe,
        elbow,
        hand,
        farShoulder: far(LY_SHOULDER, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(LY_HIP, -6, 1),
        farKnee: far(LY_KNEE, -6, 1),
        farAnkle: far(ankle, -6, 1),
        farHeel: far(heel, -6, 0),
        farToe: far(toe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const theta = lerp(LY_FROM, LY_TO, rom);
    const risen = rom * 16;
    const tower = stackTower({ x0: 268, x1: 294, capY: 74, stackTopY: FLOOR_Y - 34 }, risen);
    /* The roller rides the calf's back, square to the shin; its lever runs from the machine's axle
       at the knee — the same pivot the shin turns about, so the link keeps one length all rep. */
    const rc = lyingShinFrame(LY_ROLLER, theta);
    const roller: Vec2 = { x: pose.j.ankle.x + rc.x, y: pose.j.ankle.y + rc.y };
    const ra = lyingShinFrame({ x: LY_ROLLER.x - 3.5, y: LY_ROLLER.y }, theta);
    const rb = lyingShinFrame({ x: LY_ROLLER.x + 3.5, y: LY_ROLLER.y }, theta);
    return {
      back: [
        /* the bench with its hip hump, its legs, and the machine's stack behind the foot end */
        { kind: 'rect', x: LY_SHOULDER.x - 28, y: BENCH_TOP, width: LY_KNEE.x - LY_SHOULDER.x + 24, height: 7, rx: 3, fill: 'paper3', stroke: 'ink3', w: 2 },
        ...padStroke({ x: LY_HIP.x - 10, y: BENCH_TOP - 2 }, { x: LY_HIP.x + 10, y: BENCH_TOP - 2 }, 6),
        { kind: 'line', a: { x: LY_SHOULDER.x - 18, y: BENCH_TOP + 7 }, b: { x: LY_SHOULDER.x - 18, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
        { kind: 'line', a: { x: LY_KNEE.x - 12, y: BENCH_TOP + 7 }, b: { x: LY_KNEE.x - 12, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
        /*
         * The machine, which the roller used to float without: the lever from the knee axle to
         * the roller, and the base rail that ties the bench to the stack — one station, not a
         * bench beside a tower (audit, 2026-09-03).
         */
        { kind: 'line', a: LY_KNEE, b: roller, w: 3, color: 'ink3', cap: 'round' },
        { kind: 'line', a: { x: LY_KNEE.x - 12, y: FLOOR_Y - 2 }, b: { x: 268, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
        ...tower.prims,
        ...sampledPathTicks(ARC),
      ],
      front: [
        /* the roller pad on the BACK of the ankle, riding the curl */
        ...padStroke({ x: pose.j.ankle.x + ra.x, y: pose.j.ankle.y + ra.y }, { x: pose.j.ankle.x + rb.x, y: pose.j.ankle.y + rb.y }, 7),
        /* the axle's hub, outboard of the knee — the one mark that says the lever turns HERE */
        { kind: 'circle', c: LY_KNEE, r: 2.6, fill: 'paper2', stroke: 'ink3', w: 1.5 },
      ],
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 158, max: 179, label: 'legs long along the bench' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 48, max: 82, label: 'curl fully — the heel toward you' },
    ],
    path: { track: 'ankle', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'the knee is the pivot — it does not travel' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips DOWN — the pad holds them, and they help nothing' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the trunk lies still' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['hip', 'ankle'], aboveDeg: 179, label: 'no knee hyperextension' },
    ],
  };

  return {
    id: 'leg_curl',
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
    scene: floorScene(FLOOR_Y, 175, 45),
  };
})();

/* ── standing ─────────────────────────────────────────────────────────────────────────────────── */

const ST = standingCore(168);
/** The working knee hangs at the stance knee's height; the shin curls back and up behind her. */
/* A true thigh below the hip. `ST.knee + (6, 1)` nudged the pad clear of the standing leg and put
   the thigh at 42 against a canonical 40 — small, and still a bone that changed length. */
const ST_KNEE: Vec2 = (() => {
  const want = { x: ST.knee.x + 6, y: ST.knee.y + 1 };
  const d = Math.hypot(want.x - ST.hip.x, want.y - ST.hip.y) || 1;
  return { x: ST.hip.x + ((want.x - ST.hip.x) / d) * ATHLETE.thigh, y: ST.hip.y + ((want.y - ST.hip.y) / d) * ATHLETE.thigh };
})();
const ST_FROM = 8; // hanging near-straight beside the stance leg
const ST_TO = 116; // the heel driven up toward the glute

/** An offset in the hanging SHIN'S frame at θ=0 (x forward, y down the shin), turned with the shin. */
function standingShinFrame(v: Vec2, theta: number): Vec2 {
  const r = (theta * Math.PI) / 180;
  return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) };
}

function standingAnkleAt(theta: number): Vec2 {
  /* θ=0 hangs straight down; the curl folds the heel BACK (−x) and up. */
  const d = standingShinFrame({ x: 2, y: S }, theta);
  return { x: ST_KNEE.x + d.x, y: ST_KNEE.y + d.y };
}

/* The foot and the roller in the shin's frame — the lying member's fix, standing: the toes used to
   point at the knee at the top (knee-ankle-toe 126° → 18°) because the foot never turned with the
   shin (audit, 2026-09-03). Heel behind-below, toe forward-below: a relaxed hanging foot. */
const ST_HEEL: Vec2 = { x: -3, y: 5 };
const ST_TOE: Vec2 = { x: 7, y: 6 };
/** The roller's centre: behind the ankle, on the calf. */
const ST_ROLLER: Vec2 = { x: -7, y: 0 };

export const standingLegCurl: Rig = (() => {
  const ARC = Array.from({ length: 17 }, (_, i) => standingAnkleAt(lerp(ST_FROM, ST_TO, i / 16)));

  const poseAt = (rom: number): Pose => {
    const theta = lerp(ST_FROM, ST_TO, rom);
    const ankle = standingAnkleAt(theta);
    const h = standingShinFrame(ST_HEEL, theta);
    const t = standingShinFrame(ST_TOE, theta);
    /* Hands forward on the station's rest, steadying — the trunk leans a whisper into the pad. */
    const elbow: Vec2 = { x: ST.shoulder.x + 12, y: ST.shoulder.y + 18 };
    const hand: Vec2 = { x: ST.shoulder.x + 26, y: ST.shoulder.y + 26 };
    return {
      headR: ATHLETE.headR,
      j: {
        head: ST.head,
        shoulder: ST.shoulder,
        hip: ST.hip,
        /* The WORKING leg is the near side; the stance leg is the far side, planted. */
        knee: ST_KNEE,
        ankle,
        heel: { x: ankle.x + h.x, y: ankle.y + h.y },
        toe: { x: ankle.x + t.x, y: ankle.y + t.y },
        elbow,
        hand,
        farShoulder: far(ST.shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(ST.hip, -6, 1),
        farKnee: far(ST.knee, -6, 1),
        farAnkle: far(ST.ankle, -6, 1),
        farHeel: far(ST.heel, -6, 0),
        farToe: far(ST.toe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const theta = lerp(ST_FROM, ST_TO, rom);
    const risen = rom * 14;
    const tower = stackTower({ x0: 244, x1: 270, capY: 70, stackTopY: FLOOR_Y - 34 }, risen);
    /* The roller square to the shin on the calf's back, and its lever from the axle at the knee —
       the pivot the shin itself turns about, so the link never changes length. */
    const rc = standingShinFrame(ST_ROLLER, theta);
    const roller: Vec2 = { x: pose.j.ankle.x + rc.x, y: pose.j.ankle.y + rc.y };
    const ra = standingShinFrame({ x: ST_ROLLER.x, y: ST_ROLLER.y - 3.5 }, theta);
    const rb = standingShinFrame({ x: ST_ROLLER.x, y: ST_ROLLER.y + 3.5 }, theta);
    return {
      back: [
        /* the thigh pad she presses into, and the arm rest her hands hold */
        ...padStroke({ x: ST_KNEE.x + 9, y: ST_KNEE.y - 14 }, { x: ST_KNEE.x + 9, y: ST_KNEE.y + 2 }, 7),
        ...padStroke({ x: ST.shoulder.x + 22, y: ST.shoulder.y + 28 }, { x: ST.shoulder.x + 34, y: ST.shoulder.y + 28 }, 6),
        { kind: 'line', a: { x: ST.shoulder.x + 28, y: ST.shoulder.y + 31 }, b: { x: ST.shoulder.x + 28, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
        /* The machine the roller used to float without: the lever from the knee axle, the post the
           thigh pad mounts on, and the base rail to the stack (audit, 2026-09-03). */
        { kind: 'line', a: ST_KNEE, b: roller, w: 3, color: 'ink3', cap: 'round' },
        { kind: 'line', a: { x: ST_KNEE.x + 9, y: ST_KNEE.y + 2 }, b: { x: ST_KNEE.x + 9, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
        { kind: 'line', a: { x: ST_KNEE.x + 9, y: FLOOR_Y - 2 }, b: { x: 244, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
        ...tower.prims,
        ...sampledPathTicks(ARC),
      ],
      front: [
        ...padStroke({ x: pose.j.ankle.x + ra.x, y: pose.j.ankle.y + ra.y }, { x: pose.j.ankle.x + rb.x, y: pose.j.ankle.y + rb.y }, 7),
        /* the axle's hub at the knee, outboard of the leg */
        { kind: 'circle', c: ST_KNEE, r: 2.6, fill: 'paper2', stroke: 'ink3', w: 1.5 },
      ],
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 150, max: 178, label: 'the working leg hanging long' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 40, max: 76, label: 'curl the heel to the glute' },
    ],
    path: { track: 'ankle', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'the thigh stays on the pad — the knee does not travel' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips against the pad' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'standing tall, not rocking' },
      { kind: 'pointFixed', point: 'farAnkle', tol: 0.5, label: 'the stance foot is planted' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['hip', 'ankle'], aboveDeg: 179, label: 'no knee hyperextension' },
    ],
  };

  return {
    id: 'standing_leg_curl',
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
    scene: floorScene(FLOOR_Y, 168, 34),
  };
})();
