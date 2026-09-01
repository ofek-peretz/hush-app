/**
 * THE SUPPORT CORE — a body held on locked arms over parallel bars, and the five dips that are
 * that support at five stations: chest_dip · machine_dip · bench_dip · assisted_dip. (The fifth,
 * `diamond_push_up`, turned out to belong to the plank; the catalogue's `press`/`press_decline`
 * groups meet here instead.) Side view: a dip's lean and its elbow travel are sagittal facts.
 *
 * ── THE MECHANISM — THE PULL-UP UPSIDE-DOWN ─────────────────────────────────────────────────────
 * The HANDS are fixed on the bars and the BODY translates vertically between them, exactly the
 * pull-up's inversion of the pulldown: shoulder drops past the grip at the bottom, presses to a
 * lockout above it at the top. The elbow is solved by IK from the fixed hand to the travelling
 * shoulder — driving BACK behind the body, which is what makes a dip read as a dip. The torso
 * carries its member's lean (chest dips lean forward on purpose; the cue says so) and the legs
 * fold back, riding the trunk as constant-shape carriage.
 *
 * ── MEMBERS ─────────────────────────────────────────────────────────────────────────────────────
 *   · `chest_dip`    — bars, forward lean (~18°): "lean slightly forward" is the card's own cue,
 *     drawn as the torso's authored angle rather than as an accident.
 *   · `machine_dip`  — seated at the station: the same press with the body ANCHORED (hips on the
 *     seat) and the HANDLES travelling instead — the lat-pulldown relationship, pressing down.
 *   · `bench_dip`    — heels forward on the floor, hands on the bench behind her; the same elbow
 *     travel with the hips sweeping down in front of the bench.
 *   · `assisted_dip` — the counterweight machine: the knee platform carries part of her, and the
 *     stack rises as she does (the assisted pull-up's mirror, same pedagogy: the assisted version
 *     IS the movement).
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { floorScene, padStroke, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far } from '../bodies';

const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;

/**
 * ⚠️ EVERY VERTICAL OFFSET IN THIS FILE IS SOLVED FROM A TARGET ELBOW ANGLE — the pull-up's
 * lesson, now a file-level rule instead of a per-rig rediscovery: the elbow's measured angle
 * depends on the TRUE shoulder→hand distance, which carries whatever horizontal offset the
 * posture has. Type a vertical drop and the angle lands wherever the hypotenuse says; solve the
 * drop from the angle and the endpoints hold by construction.
 */
const reachAt = (deg: number) => Math.sqrt(U * U + F * F - 2 * U * F * Math.cos((deg * Math.PI) / 180));
const vGapFor = (deg: number, dx: number) => Math.sqrt(Math.max(1, reachAt(deg) ** 2 - dx * dx));

/* ── the bar dips: body travels, grip fixed ───────────────────────────────────────────────────── */

interface BarDipParams {
  id: string;
  /** The fixed grip on the bar. */
  hand: Vec2;
  /** Torso lean forward of vertical, degrees — the chest dip's deliberate angle. */
  leanDeg: number;
  /** Shoulder height RELATIVE TO THE HAND at top and bottom (negative = above the grip). */
  topDrop: number;
  bottomDrop: number;
  assisted?: boolean;
  furniture: Primitive[];
  /** Drawn OVER the athlete — the near rail of a station he stands inside. */
  nearRail?: Primitive[];
}

function barDip(p: BarDipParams): Rig {
  const leanRad = (p.leanDeg * Math.PI) / 180;
  const ARC = Array.from({ length: 17 }, (_, i) => ({
    x: p.hand.x - 4,
    y: p.hand.y + lerp(p.topDrop, p.bottomDrop, i / 16),
  }));

  const poseAt = (rom: number): Pose => {
    const shoulder: Vec2 = { x: p.hand.x - 4, y: p.hand.y + lerp(p.topDrop, p.bottomDrop, rom) };
    /* The trunk hangs at its authored lean; hips back-and-down of the shoulder. */
    const hip: Vec2 = {
      x: shoulder.x - ATHLETE.torso * Math.sin(leanRad) - 2,
      y: shoulder.y + ATHLETE.torso * Math.cos(leanRad),
    };
    /* Legs folded back — constant carriage, the pull-up's own. */
    const knee: Vec2 = { x: hip.x - 6, y: hip.y + ATHLETE.thigh * 0.6 };
    const ankle: Vec2 = { x: knee.x - 15, y: knee.y + ATHLETE.shank * 0.48 };
    const head: Vec2 = { x: shoulder.x + 3 + ATHLETE.neck * Math.sin(leanRad), y: shoulder.y - ATHLETE.neck * Math.cos(leanRad) };
    const elbow = twoBoneIK(shoulder, p.hand, U, F, -1); // the elbow drives BACK
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip,
        knee,
        ankle,
        heel: { x: ankle.x - 5, y: ankle.y + 5 },
        toe: { x: ankle.x + 6, y: ankle.y + 8 },
        elbow,
        hand: p.hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(p.hand, -6, 1),
        farHip: far(hip, -6, 1),
        farKnee: far(knee, -6, 1),
        farAnkle: far(ankle, -6, 1),
        farHeel: far({ x: ankle.x - 5, y: ankle.y + 5 }, -6, 0),
        farToe: far({ x: ankle.x + 6, y: ankle.y + 8 }, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const back: Primitive[] = [...p.furniture, ...sampledPathTicks(ARC)];
    if (p.assisted) {
      const knee = pose.j.knee;
      back.push(
        ...padStroke({ x: knee.x - 4, y: knee.y + 8 }, { x: knee.x + 16, y: knee.y + 8 }, 8),
        { kind: 'line', a: { x: knee.x + 18, y: knee.y + 8 }, b: { x: p.hand.x + 34, y: knee.y + 8 }, w: 2.5, color: 'ink3' },
      );
      const risen = (p.bottomDrop - lerp(p.topDrop, p.bottomDrop, rom)) * 0.4;
      const tower = stackTower({ x0: p.hand.x + 36, x1: p.hand.x + 62, capY: 34, stackTopY: FLOOR_Y - 34 }, risen);
      back.push(...tower.prims);
    }
    return { back, front: p.nearRail ?? [] };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 150, max: 179, label: 'locked out above the bars' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 60, max: 100, label: 'the deep stretch — shoulders past the grip' },
    ],
    path: { track: 'shoulder', kind: 'vertical', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'hand', tol: 0.5, label: 'the grip does not move — the body does' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the lean is set once and held — no swinging through it' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension at lockout' },
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
    scene: floorScene(FLOOR_Y, p.hand.x, 0),
  };
}

/* The bar sits at 100, not 78: at lockout the shoulder rises a solved 47.5u above the grip and
   the head rides another neck above that — at 78 the crown left the frame (the calf's lesson:
   the FormSpec cannot see a frame, but the framing law can, and did). */
const DIP_BAR: Vec2 = { x: 176, y: 100 };
/*
 * The FAR rail and its posts. Parallel bars run fore-and-aft, so from the side they stack one
 * behind the other — and the athlete is BETWEEN them, which is the one thing that makes this a dip
 * station rather than a fence he is standing behind. Drawn wholly in `back` he was in front of both
 * rails; the near rail is drawn over him instead (`DIP_NEAR_RAIL`), and the pair of them read as a
 * station he is standing inside.
 */
const DIP_FURNITURE: Primitive[] = [
  { kind: 'line', a: { x: DIP_BAR.x - 34, y: DIP_BAR.y - 3 }, b: { x: DIP_BAR.x + 34, y: DIP_BAR.y - 3 }, w: 3, color: 'ink3', cap: 'round' },
  { kind: 'line', a: { x: DIP_BAR.x - 28, y: DIP_BAR.y - 3 }, b: { x: DIP_BAR.x - 28, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
  { kind: 'line', a: { x: DIP_BAR.x + 28, y: DIP_BAR.y - 3 }, b: { x: DIP_BAR.x + 28, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
];
/** The NEAR rail — drawn over the athlete, which is what puts him between the two. */
const DIP_NEAR_RAIL: Primitive[] = [
  { kind: 'line', a: { x: DIP_BAR.x - 34, y: DIP_BAR.y }, b: { x: DIP_BAR.x + 34, y: DIP_BAR.y }, w: 3.5, color: 'ink0', cap: 'round' },
  { kind: 'line', a: { x: DIP_BAR.x - 26, y: DIP_BAR.y }, b: { x: DIP_BAR.x - 26, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink2' },
  { kind: 'line', a: { x: DIP_BAR.x + 26, y: DIP_BAR.y }, b: { x: DIP_BAR.x + 26, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink2' },
];

export const chestDipRig = barDip({
  id: 'chest_dip',
  hand: DIP_BAR,
  leanDeg: 18, // "lean slightly forward" — authored, not accidental
  topDrop: -vGapFor(168, 4), // lockout: interior 168° by construction
  bottomDrop: -vGapFor(82, 4), // the stretch: elbows square, shoulders sunk toward the grip
  furniture: DIP_FURNITURE,
  nearRail: DIP_NEAR_RAIL,
});

export const assistedDipRig = barDip({
  id: 'assisted_dip',
  hand: DIP_BAR,
  leanDeg: 10,
  topDrop: -vGapFor(168, 4),
  bottomDrop: -vGapFor(82, 4),
  assisted: true,
  furniture: DIP_FURNITURE,
  nearRail: DIP_NEAR_RAIL,
});

/* bench_dip: the same elbow travel, hands on the bench BEHIND her, heels forward on the floor. */
const BD_BENCH_TOP = FLOOR_Y - 32;
const BD_HAND: Vec2 = { x: 196, y: BD_BENCH_TOP - 2 };

export const benchDipRig: Rig = (() => {
  /** The heels planted forward; the hips slide down the bench's front edge. */
  const HEEL: Vec2 = { x: 118, y: FLOOR_Y };
  const ANKLE: Vec2 = { x: 122, y: FLOOR_Y - ATHLETE.ankleH };
  /* The hip's travel is derived: shoulder = hip − 0.97·torso above, dx to the hand is 10, and the
     two endpoint elbow angles (168° long, 82° square) give the two hip heights by the file's solve. */
  const HIP_DX = BD_HAND.x - 18 - (BD_HAND.x - 8); // shoulder x − hand x
  const hipYAt = (deg: number) => BD_HAND.y - vGapFor(deg, Math.abs(HIP_DX)) + ATHLETE.torso * 0.97;
  const hipAt = (rom: number): Vec2 => ({ x: BD_HAND.x - 18, y: lerp(hipYAt(168), hipYAt(82), rom) });
  const ARC = Array.from({ length: 17 }, (_, i) => hipAt(i / 16));

  const poseAt = (rom: number): Pose => {
    const hip = hipAt(rom);
    const knee = twoBoneIK(ANKLE, hip, ATHLETE.shank, ATHLETE.thigh, -1);
    /* The trunk stays upright-ish, shoulders over the hands behind. */
    const shoulder: Vec2 = { x: BD_HAND.x - 8, y: hip.y - ATHLETE.torso * 0.97 };
    const head: Vec2 = { x: shoulder.x + 2, y: shoulder.y - ATHLETE.neck };
    const elbow = twoBoneIK(shoulder, BD_HAND, U, F, -1);
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip,
        knee,
        ankle: ANKLE,
        heel: HEEL,
        toe: { x: HEEL.x + 14, y: FLOOR_Y },
        elbow,
        hand: BD_HAND,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(BD_HAND, -6, 1),
        farHip: far(hip, -6, 1),
        farKnee: far(knee, -6, 1),
        farAnkle: far(ANKLE, -6, 1),
        farHeel: far(HEEL, -6, 0),
        farToe: far({ x: HEEL.x + 14, y: FLOOR_Y }, -6, 0),
      },
    };
  };

  const decorAt = (): Decor => ({
    back: [
      { kind: 'rect', x: BD_HAND.x - 12, y: BD_BENCH_TOP, width: 52, height: 7, rx: 3, fill: 'paper3', stroke: 'ink3', w: 2 },
      { kind: 'line', a: { x: BD_HAND.x - 4, y: BD_BENCH_TOP + 7 }, b: { x: BD_HAND.x - 4, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
      { kind: 'line', a: { x: BD_HAND.x + 32, y: BD_BENCH_TOP + 7 }, b: { x: BD_HAND.x + 32, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
      ...sampledPathTicks(ARC),
    ],
    front: [],
  });

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 155, max: 179, label: 'arms long, hips at the bench' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 70, max: 95, label: 'lowered until the elbows are square' },
    ],
    path: { track: 'hip', kind: 'vertical', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'hand', tol: 0.5, label: 'hands on the bench behind you' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'heels planted forward' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return {
    id: 'bench_dip',
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
    scene: floorScene(FLOOR_Y, 168, 48),
  };
})();

/* machine_dip: seated — the body anchored and the HANDLES travelling, the pulldown's relation. */
export const machineDipRig: Rig = (() => {
  const HIP: Vec2 = { x: 158, y: 155 };
  const SHOULDER: Vec2 = { x: 158, y: 155 - ATHLETE.torso };
  const HEAD: Vec2 = { x: 159, y: SHOULDER.y - ATHLETE.neck };
  const handAt = (rom: number): Vec2 => ({ x: SHOULDER.x + 14, y: lerp(SHOULDER.y + vGapFor(82, 14), SHOULDER.y + vGapFor(168, 14), rom) });
  const ARC = Array.from({ length: 17 }, (_, i) => handAt(i / 16));

  const poseAt = (rom: number): Pose => {
    const hand = handAt(rom);
    const elbow = twoBoneIK(SHOULDER, hand, U, F, -1);
    return {
      headR: ATHLETE.headR,
      j: {
        head: HEAD,
        shoulder: SHOULDER,
        hip: HIP,
        knee: { x: HIP.x + 38, y: 151 },
        ankle: { x: HIP.x + 46, y: 186 },
        heel: { x: HIP.x + 40, y: FLOOR_Y },
        toe: { x: HIP.x + 64, y: FLOOR_Y },
        elbow,
        hand,
        farShoulder: far(SHOULDER, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(HIP, -6, 1),
        farKnee: far({ x: HIP.x + 38, y: 151 }, -6, 1),
        farAnkle: far({ x: HIP.x + 46, y: 186 }, -6, 1),
        farHeel: far({ x: HIP.x + 40, y: FLOOR_Y }, -6, 0),
        farToe: far({ x: HIP.x + 64, y: FLOOR_Y }, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const risen = rom * 18;
    const tower = stackTower({ x0: 250, x1: 276, capY: 64, stackTopY: FLOOR_Y - 34 }, risen);
    return {
      back: [
        // seat + back pad, and the lever from the overhead pivot to the handle
        { kind: 'rect', x: HIP.x - 20, y: HIP.y + 5, width: 40, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
        { kind: 'line', a: { x: HIP.x, y: HIP.y + 12 }, b: { x: HIP.x, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
        ...padStroke({ x: SHOULDER.x - 9, y: SHOULDER.y - 4 }, { x: SHOULDER.x - 9, y: HIP.y - 2 }, 7),
        { kind: 'circle', c: { x: SHOULDER.x + 34, y: SHOULDER.y - 14 }, r: 3.4, fill: 'paper2', stroke: 'ink3', w: 2 },
        { kind: 'line', a: { x: SHOULDER.x + 34, y: SHOULDER.y - 14 }, b: { x: pose.j.hand.x + 4, y: pose.j.hand.y }, w: 2.5, color: 'ink3' },
        ...tower.prims,
        ...sampledPathTicks(ARC),
      ],
      front: [
        { kind: 'line', a: { x: pose.j.hand.x - 6, y: pose.j.hand.y }, b: { x: pose.j.hand.x + 6, y: pose.j.hand.y }, w: 3.5, color: 'ink0', cap: 'round' },
      ],
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 70, max: 95, label: 'handles at your sides, elbows square' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 155, max: 179, label: 'pressed long — never snapped' },
    ],
    path: { track: 'hand', kind: 'vertical', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'the back stays on the pad' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'seated — the body is anchored, the handles travel' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'no hunching over the press' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return {
    id: 'machine_dip',
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
