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

// 

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2, Vec3 } from '../types';
import { lerp, lerpV, twoBoneIK, twoBoneIK3, twoBoneIKToward } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import {
  barPathTicks,
  floorScene,
  linePathTicks,
  padStroke,
  plateGhost,
  sampledPathTicks,
} from '../kit';
import { CHEST_PRESS, chestPressStation, INCLINE_PRESS, type PressStationSpec } from '../machines';
import { FLOOR_Y, supineFrontCore } from '../bodies';

const CX = 176;
const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;
const TORSO = ATHLETE.torso;
const LOCKOUT_ANGLE = 172;
const REACH = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos((LOCKOUT_ANGLE * Math.PI) / 180));

// ── the lying members ────────────────────────────────────────────────────────────

/**
 * ── THE LYING PRESSES, SHOT FROM THE SIDE (restaged 2026-08-29) ─────────────────────────────────
 *
 * This family spent a year at the head end, and the reasoning for moving it is written out in full
 * on `bb_bench_press`. The short of it: a clip in this app is the whole instruction, because nobody
 * reads the cue text — so it is not enough that a viewer can NAME the exercise from the picture,
 * they have to be able to DO it. The head-end camera looks straight down the axis the bar path, the
 * touch point, the elbow tuck and the bench itself all live on.
 *
 * The two members that gained most are the ones the old camera could say least about. An INCLINE
 * and a DECLINE differ from a flat press by a rotation in exactly that axis: end-on, all the clip
 * could do was raise the shoulder line a few units and hope, and its own file admitted the raised
 * line "on its own says only sitting up". From the side the pad simply is at an angle, and you can
 * see which one.
 */
interface LyingPressParams {
  id: string;
  /** Bench angle above horizontal: 0 flat, positive incline, negative decline. */
  inclineDeg: number;
  implement: 'bar' | 'db';
  /**
   * Half the grip, IN DEPTH — 35 is the competition width (≈78 cm). From this camera the grip is
   * entirely depth, which is what makes the arm a real diagonal rather than a flat triangle: the
   * hand rides 19.5u nearer the viewer than its own shoulder joint.
   */
  gripZ: number;
  /** What the bar was lifted off. Dumbbells get neither. */
  rack: 'uprights' | 'rails' | 'none';
  /**
   * How far toward the FEET the elbow is driven — the tuck, as the hint that picks the elbow off
   * its circle. Bigger is a tighter tuck; `close_grip_bench` is the member that is about this.
   */
  tuck: number;
  contactLabel: string;
}

const SH_Z = 15.5;
/** Arms 99 % extended at the top: locked out, not snapped. */
const LOCK_REACH = (U + F) * 0.99;

/** The bench, in profile: a seat, and a back pad lying under the athlete along his own trunk. */
function benchSide(hip: Vec2, u: Vec2, headEnd: Vec2): Primitive[] {
  const n = { x: -u.y, y: u.x }; // out of the chest
  const padA = { x: hip.x - n.x * 9, y: hip.y - n.y * 9 };
  const padB = { x: headEnd.x - n.x * 9, y: headEnd.y - n.y * 9 };
  const legTop = { x: hip.x + 6, y: Math.min(hip.y + 10, FLOOR_Y - 20) };
  return [
    ...padStroke(padA, padB, 9),
    // the frame: an upright under the hip end and a foot running back under the head end
    { kind: 'line', a: legTop, b: { x: legTop.x + 4, y: FLOOR_Y }, w: 3, color: 'ink3' },
    { kind: 'line', a: padB, b: { x: padB.x + 4, y: FLOOR_Y }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: padB.x - 6, y: FLOOR_Y }, b: { x: legTop.x + 14, y: FLOOR_Y }, w: 2.5, color: 'ink3', cap: 'round' },
  ];
}

/**
 * TWO DUMBBELLS, SEEN END-ON — which from this camera is what a dumbbell is.
 *
 * Drawn side-on (a handle with a plate at each end) it read as a little totem stood on the
 * athlete's chest, and at the top of the rep it stacked on top of his head. Turned the right way it
 * is a disc, small enough not to hide the body the way a 45 has to be ghosted to avoid.
 *
 * The far one is drawn behind and a shade offset, in the far ink. It has to be: both hands are at
 * the same height on the same path, so a single disc would say "barbell" — and the one thing a
 * viewer must take from this clip rather than the flat-bench one is that there are TWO of them.
 */
function dumbbellsEndOn(c: Vec2): Primitive[] {
  const far = { x: c.x - 5, y: c.y + 3 };
  return [
    { kind: 'circle', c: far, r: 8, fill: 'ink3' },
    { kind: 'circle', c, r: 8.5, fill: 'ink1', stroke: 'ink0', w: 1.5 },
    { kind: 'circle', c, r: 2.6, fill: 'ink0' }, // the handle, end-on
  ];
}

/** A free-weight rack, in profile: one post with the J-hook the bar came off. */
function rackSide(x: number, hookY: number): Primitive[] {
  return [
    { kind: 'line', a: { x, y: hookY - 14 }, b: { x, y: FLOOR_Y }, w: 3.5, color: 'ink3' },
    { kind: 'line', a: { x: x - 11, y: FLOOR_Y }, b: { x: x + 11, y: FLOOR_Y }, w: 2.5, color: 'ink3', cap: 'round' },
    { kind: 'polyline', pts: [{ x, y: hookY - 4 }, { x: x + 8, y: hookY - 4 }, { x: x + 8, y: hookY - 9 }], w: 2.5, color: 'ink3' },
  ];
}

/**
 * A Smith machine's gate, in profile: the single rail the bar is captive on, running the full
 * height beside the lifter, with the hook lug at the rack height. One rail, not two — from the side
 * the far rail stands exactly behind the near one, and drawing both put a second post through the
 * athlete's chest.
 */
function smithRailSide(x: number, lockY: number): Primitive[] {
  return [
    { kind: 'line', a: { x, y: 32 }, b: { x, y: FLOOR_Y }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: x - 10, y: FLOOR_Y }, b: { x: x + 10, y: FLOOR_Y }, w: 2.5, color: 'ink3', cap: 'round' },
    { kind: 'line', a: { x, y: lockY + 6 }, b: { x: x + 7, y: lockY + 6 }, w: 2.5, color: 'ink3' },
  ];
}

function lyingPress(p: LyingPressParams): Rig {
  const rad = (p.inclineDeg * Math.PI) / 180;
  /** Along the trunk, hip → shoulder. Flat, that is straight toward the head end. */
  const u: Vec2 = { x: -Math.cos(rad), y: -Math.sin(rad) };
  /** Out of the chest — up, for a flat bench; up-and-toward-the-feet on an incline. */
  const n: Vec2 = { x: -u.y, y: u.x };

  const HIP: Vec2 = { x: 198, y: 147 };
  const SHOULDER: Vec2 = { x: HIP.x + u.x * TORSO, y: HIP.y + u.y * TORSO };
  const HEAD: Vec2 = { x: SHOULDER.x + u.x * ATHLETE.neck, y: SHOULDER.y + u.y * ATHLETE.neck };
  /* Where the implement touches: 13u back down the trunk from the shoulder joint, and 12u out of
     the chest, because a lying chest stands proud of the joint it is measured from. On an incline
     that same offset walks the touch point up toward the collarbone, which is where an incline
     press touches — and it does so because the CHEST turned, not because anyone typed a number. */
  const CHEST: Vec2 = {
    x: SHOULDER.x - u.x * 13 + n.x * 12,
    y: SHOULDER.y - u.y * 13 + n.y * 12,
  };

  const dz = p.gripZ - SH_Z;
  const LOCK: Vec2 = { x: SHOULDER.x, y: SHOULDER.y - Math.sqrt(LOCK_REACH * LOCK_REACH - dz * dz) };

  const barAt = (rom: number): Vec2 => lerpV(LOCK, CHEST, rom);
  const BAR_PATH: Vec2[] = Array.from({ length: 13 }, (_, i) => barAt(i / 12));

  /* The legs: hips on the pad, knee bent, foot planted BACK under the knee — the setup that lets a
     press drive off the floor. Solved once from the planted ankle so both bones are canonical. */
  const ANKLE: Vec2 = { x: 228, y: 186 };
  const KNEE = twoBoneIK(HIP, ANKLE, ATHLETE.thigh, ATHLETE.shank, -1);
  const HEEL: Vec2 = { x: 222, y: FLOOR_Y };
  const TOE: Vec2 = { x: 244, y: FLOOR_Y };

  const armAt = (rom: number, side: 1 | -1): { elbow: Vec3; hand: Vec3 } => {
    const bar = barAt(rom);
    const hand: Vec3 = { x: bar.x, y: bar.y, z: side * p.gripZ };
    const shoulder: Vec3 = { x: SHOULDER.x, y: SHOULDER.y, z: side * SH_Z };
    const elbow = twoBoneIK3(shoulder, hand, U, F, { x: p.tuck, y: 1, z: side * 0.12 });
    return { elbow, hand };
  };

  const poseAt = (rom: number): Pose => {
    const near = armAt(rom, 1);
    const far = armAt(rom, -1);
    const bar = barAt(rom);
    const flat = (q: Vec3): Vec2 => ({ x: q.x, y: q.y });
    const behind = (q: Vec2, dx: number, dy = 0): Vec2 => ({ x: q.x + dx, y: q.y + dy });
    return {
      headR: ATHLETE.headR,
      j: {
        head: HEAD,
        shoulder: SHOULDER,
        hip: HIP,
        knee: KNEE,
        ankle: ANKLE,
        heel: HEEL,
        toe: TOE,
        elbow: flat(near.elbow),
        hand: flat(near.hand),
        bar,
        farShoulder: SHOULDER,
        farElbow: flat(far.elbow),
        farHand: flat(far.hand),
        // a uniform translate, so every far bone is exactly its near twin's length
        farHip: behind(HIP, -4, 2),
        farKnee: behind(KNEE, -4, 2),
        farAnkle: behind(ANKLE, -4, 2),
        farHeel: behind(HEEL, -4),
        farToe: behind(TOE, -4),
      },
      /* Depth is declared RELATIVE TO THE DRAWN SHOULDER. A side-view skeleton is the athlete's
         midline — head and spine sit on it — while the arm hangs off a joint 15.5u out toward the
         viewer, and the two facts cannot share one number: put the shoulder at its true +15.5 and
         the NECK measures 22.3 against a canonical 16. Measuring the arm from its own root keeps
         every bone true and leaves the spine on the line it is drawn on. */
      z: {
        elbow: near.elbow.z - SH_Z,
        hand: p.gripZ - SH_Z,
        farElbow: far.elbow.z + SH_Z,
        farHand: -p.gripZ + SH_Z,
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const bar = barAt(rom);
    const back: Primitive[] = [...benchSide(HIP, u, HEAD), ...sampledPathTicks(BAR_PATH)];
    if (p.rack === 'uprights') back.unshift(...rackSide(HEAD.x - 16, LOCK.y + 6));
    if (p.rack === 'rails') back.unshift(...smithRailSide(HEAD.x - 16, LOCK.y));
    /* The plate is a GHOST and has to be: end-on it is a 32u disc sitting exactly where the chest
       is, and drawn solid it would erase the half of the rep this camera exists to show. */
    const front: Primitive[] = p.implement === 'bar' ? plateGhost(bar) : dumbbellsEndOn(bar);
    return { back, front };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 158, max: 179, label: 'lockout (full press) — the unrack' },
    ],
    end: [
      { kind: 'contactY', a: 'bar', y: CHEST.y, tol: 2, label: p.contactLabel },
      { kind: 'jointBelow', a: 'elbow', b: 'shoulder', by: 4, label: 'the elbow drops below the shoulder line at the bottom' },
    ],
    path: { track: 'bar', kind: 'line', tol: 1.5, dir: { x: CHEST.x - LOCK.x, y: CHEST.y - LOCK.y } },
    invariants: [
      { kind: 'pointFixed', point: 'ankle', tol: 1, label: 'feet planted' },
      { kind: 'pointFixed', point: 'toe', tol: 1, label: 'toes planted' },
      { kind: 'pointFixed', point: 'hip', tol: 1, label: 'hips on the bench' },
      { kind: 'pointFixed', point: 'shoulder', tol: 1, label: 'shoulders on the bench' },
      { kind: 'pointFixed', point: 'head', tol: 1, label: 'head still' },
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
      farLeg: ['farHip', 'farKnee', 'farAnkle'],
      nearFoot: ['heel', 'toe'],
      farFoot: ['farHeel', 'farToe'],
    },
    formspec,
    poseAt,
    decorAt,
    scene: floorScene(FLOOR_Y, 180, 70),
  };
}

/** The competition grip, ≈78 cm between the hands — the flat benchmark's own width. */
const WIDE_GRIP_Z = 35;
/**
 * THE TUCK, CALIBRATED — this hint is chosen so the humerus comes out at 56° to the torso, which is
 * the competition bench-press tuck. It is a direction, not an angle, so it was swept against the
 * angle it actually produces rather than guessed: 0.2 → 56°, 0.55 → 44°, 1.5 → 27°.
 *
 * The tuck matters more from this camera than from the old one, and it is the whole reason
 * `close_grip_bench` is still a distinguishable clip. Grip WIDTH is pure depth from the side and
 * cannot be drawn at all — but grip width and tuck are locked together in life, and the tuck is
 * what the close-grip card asks for by name.
 */
const WIDE_TUCK = 0.2;

export const inclineBbPress = lyingPress({
  id: 'incline_bb_press',
  inclineDeg: 32,
  implement: 'bar',
  gripZ: WIDE_GRIP_Z,
  rack: 'uprights',
  tuck: WIDE_TUCK,
  contactLabel: 'bar touches the upper chest',
});

export const dbBenchPress = lyingPress({
  id: 'db_bench_press',
  inclineDeg: 0,
  implement: 'db',
  // wider than the barbell's grip, because a dumbbell is free to travel outside the ribs and that
  // extra stretch is the reason to choose it over a bar
  gripZ: 40,
  rack: 'none',
  tuck: WIDE_TUCK,
  contactLabel: 'dumbbells to the chest line',
});

export const inclineDbPress = lyingPress({
  id: 'incline_db_press',
  inclineDeg: 32,
  implement: 'db',
  gripZ: 40,
  rack: 'none',
  tuck: WIDE_TUCK,
  contactLabel: 'dumbbells to the upper chest',
});

export const closeGripBench = lyingPress({
  id: 'close_grip_bench',
  inclineDeg: 0,
  implement: 'bar',
  // ≈57 cm between the hands: shoulder-width-and-a-bit, which is what a close-grip bench IS, and
  // unmistakable against the 78 cm competition grip the flat member uses
  gripZ: 26,
  rack: 'uprights',
  /* THE tuck — 27° of humerus-to-torso against the flat bench's 56°, and the whole reason this
     variant is still its own clip from this camera. Grip width is depth from here and invisible;
     the elbows folding down along the ribs is not, and it is what cue #2 asks for by name. */
  tuck: 1.5,
  contactLabel: 'bar touches the lower chest',
});

export const smithBenchPress = lyingPress({
  id: 'smith_bench_press',
  inclineDeg: 0,
  implement: 'bar',
  gripZ: WIDE_GRIP_Z,
  rack: 'rails',
  tuck: WIDE_TUCK,
  contactLabel: 'bar touches the chest',
});

export const smithInclinePress = lyingPress({
  id: 'smith_incline_press',
  inclineDeg: 32,
  implement: 'bar',
  gripZ: WIDE_GRIP_Z,
  rack: 'rails',
  tuck: WIDE_TUCK,
  contactLabel: 'bar touches the upper chest',
});

/*
 * decline_bb_press — the pad tilted the OTHER way, and from this camera that is simply visible.
 *
 * End-on it was not: a decline's tilt ran along the old camera's axis and left no pixels, so the
 * member had to state itself with a lowered contact line and a pair of hooked legs and hope. Here
 * the bench is at −18° and the legs hook up over the roller pads, which is the whole picture.
 */
export const declineBbPress: Rig = (() => {
  const base = lyingPress({
    id: 'decline_bb_press',
    inclineDeg: -18,
    implement: 'bar',
    gripZ: WIDE_GRIP_Z,
    rack: 'uprights',
    tuck: WIDE_TUCK,
    contactLabel: 'bar touches the lower chest',
  });
  /*
   * Knees hooked over the roller pads, shins hanging down behind them — the decline's anchor, and
   * the reason its hips can sit above its shoulders at all.
   *
   * Both bones are placed at canonical LENGTH from the joint before them rather than at coordinates
   * that looked right: hand-placed, the thigh came out 34.5 against a canonical 40.
   */
  const KNEE: Vec2 = { x: 198 + ATHLETE.thigh * 0.966, y: 147 - ATHLETE.thigh * 0.256 };
  const ANKLE: Vec2 = { x: KNEE.x - ATHLETE.shank * 0.15, y: KNEE.y + ATHLETE.shank * 0.989 };
  const HEEL: Vec2 = { x: ANKLE.x - 6, y: ANKLE.y + 7 };
  const TOE: Vec2 = { x: ANKLE.x + 14, y: ANKLE.y + 4 };
  const poseAt = (rom: number): Pose => {
    const base0 = base.poseAt(rom);
    const behind = (q: Vec2, dx: number, dy = 0): Vec2 => ({ x: q.x + dx, y: q.y + dy });
    return {
      ...base0,
      j: {
        ...base0.j,
        knee: KNEE,
        ankle: ANKLE,
        heel: HEEL,
        toe: TOE,
        farKnee: behind(KNEE, -4, 2),
        farAnkle: behind(ANKLE, -4, 2),
        farHeel: behind(HEEL, -4),
        farToe: behind(TOE, -4),
      },
    };
  };
  const decorAt = (rom: number): Decor => {
    const d = base.decorAt(rom);
    return {
      back: [
        ...d.back,
        // the roller pads the knees hook over
        ...padStroke({ x: KNEE.x - 7, y: KNEE.y - 7 }, { x: KNEE.x + 7, y: KNEE.y - 7 }, 8),
        { kind: 'line', a: { x: KNEE.x, y: KNEE.y }, b: { x: KNEE.x, y: FLOOR_Y }, w: 3, color: 'ink3' },
      ],
      front: d.front,
    };
  };
  const fs = base.formspec;
  return {
    ...base,
    poseAt,
    decorAt,
    formspec: {
      ...fs,
      invariants: fs.invariants.map((inv) =>
        inv.kind === 'pointFixed' && (inv.point === 'ankle' || inv.point === 'toe')
          ? { ...inv, label: 'the legs stay hooked over the rollers' }
          : inv,
      ),
    },
  };
})();

interface SeatedPressParams {
  id: string;
  /** Torso angle from vertical; negative reclines away from the press. */
  lean: number;
  /** The hand's y offset from the shoulder at the stretch (positive = below). */
  startDY: number;
  /** Degrees above horizontal that the handle travels. */
  pathDeg: number;
  station: PressStationSpec;
  startLabel: string;
  endLabel: string;
}

function seatedMachinePress(p: SeatedPressParams): Rig {
  const DEG = Math.PI / 180;
  const HIP: Vec2 = { x: 141, y: 157 };
  const SHOULDER: Vec2 = { x: HIP.x + ATHLETE.torso * Math.sin(p.lean * DEG), y: HIP.y - ATHLETE.torso * Math.cos(p.lean * DEG) };
  const HEAD: Vec2 = {
    x: SHOULDER.x + ATHLETE.neck * Math.sin(p.lean * 0.7 * DEG),
    y: SHOULDER.y - ATHLETE.neck * Math.cos(p.lean * 0.7 * DEG),
  };
  const ANKLE: Vec2 = { x: 193, y: 186 };
  /* The knee is SOLVED from the hip and the planted ankle, never authored as a third fixed point:
     three hand-placed points cannot all be right at once, and the first draft of this rig carried
     a 45.5 thigh against a canonical 40 — caught by the auditor, not by the eye. */
  const KNEE: Vec2 = twoBoneIKToward(HIP, ANKLE, ATHLETE.thigh, ATHLETE.shank, { x: 186, y: 150 });
  const HEEL: Vec2 = { x: 187, y: FLOOR_Y };
  const TOE: Vec2 = { x: 212, y: FLOOR_Y };

  /** The hand-to-shoulder span that puts the elbow at `deg`, by the cosine rule on canonical bones. */
  const spanFor = (deg: number) => Math.sqrt(U * U + F * F - 2 * U * F * Math.cos(deg * DEG));
  const START_SPAN = spanFor(58); // open enough for two fleshed segments to read apart
  const END_SPAN = spanFor(168); // lockout, short of straight (never 179)
  const START: Vec2 = {
    x: SHOULDER.x + Math.sqrt(START_SPAN * START_SPAN - p.startDY * p.startDY),
    y: SHOULDER.y + p.startDY,
  };
  /* Travel along the press ray until the arm reaches its lockout span. The endpoint is SOLVED from
     the elbow angle rather than authored as a number that happens to look right, which is the same
     discipline the bench press uses for its lockout height. */
  const RAY: Vec2 = { x: Math.cos(p.pathDeg * DEG), y: -Math.sin(p.pathDeg * DEG) };
  const V: Vec2 = { x: START.x - SHOULDER.x, y: START.y - SHOULDER.y };
  const B = V.x * RAY.x + V.y * RAY.y;
  const C = V.x * V.x + V.y * V.y - END_SPAN * END_SPAN;
  const T = -B + Math.sqrt(B * B - C);
  const END: Vec2 = { x: START.x + T * RAY.x, y: START.y + T * RAY.y };

  const handAt = (rom: number): Vec2 => lerpV(START, END, rom);

  const poseAt = (rom: number): Pose => {
    const hand = handAt(rom);
    // bend -1 hangs the elbow BELOW the shoulder-to-hand line — the elbow of a press, not of a row
    const elbow = twoBoneIK(SHOULDER, hand, U, F, -1);
    const off = (q: Vec2, ddx: number, ddy = 0): Vec2 => ({ x: q.x + ddx, y: q.y + ddy });
    return {
      headR: ATHLETE.headR,
      j: {
        head: HEAD, shoulder: SHOULDER, elbow, hand, hip: HIP, bar: hand,
        knee: KNEE, ankle: ANKLE, heel: HEEL, toe: TOE,
        farShoulder: off(SHOULDER, -7, 2), farElbow: off(elbow, -7, 2), farHand: off(hand, -7, 2),
        farHip: off(HIP, -7, 1), farKnee: off(KNEE, -7, 1), farAnkle: off(ANKLE, -7, 1),
        farHeel: off(HEEL, -8), farToe: off(TOE, -8),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const hand = handAt(rom);
    return {
      back: [
        // 1:1 — the plate rises exactly as far as the handle travels
        ...chestPressStation(hand, Math.hypot(hand.x - START.x, hand.y - START.y), p.station),
        ...linePathTicks(START, END),
      ],
      front: [
        { kind: 'line', a: { x: hand.x, y: hand.y - 8 }, b: { x: hand.x, y: hand.y + 8 }, w: 3.5, color: 'ink0', cap: 'round' },
        { kind: 'circle', c: hand, r: 2.5, fill: 'ink0' },
      ],
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 50, max: 70, label: p.startLabel },
    ],
    end: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 160, max: 175, label: p.endLabel },
    ],
    path: { track: 'bar', kind: 'line', tol: 1.5, dir: { x: END.x - START.x, y: END.y - START.y } },
    invariants: [
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'back on the pad (no drive-off)' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips on the seat' },
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'shoulders on the pad' },
      { kind: 'pointFixed', point: 'head', tol: 0.5, label: 'head still' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'feet planted' },
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
    scene: floorScene(FLOOR_Y, 150, 60),
  };
}

export const machineChestPress = seatedMachinePress({
  id: 'machine_chest_press',
  lean: -6,
  startDY: 8.7, // handles at the sternum line
  pathDeg: 0,
  station: CHEST_PRESS,
  startLabel: 'handles home at the chest — elbows behind, the loaded stretch',
  endLabel: 'full press — elbows long, never straight',
});

export const inclineMachinePress = seatedMachinePress({
  id: 'incline_machine_press',
  lean: -22, // laid back on the incline pad — the machine's whole difference from the flat member
  startDY: 2, // handles level with the shoulder, beside the upper chest
  pathDeg: 32, // and the press runs UP and forward
  station: INCLINE_PRESS,
  startLabel: 'handles at the upper chest — elbows behind, the loaded stretch',
  endLabel: 'full press up and forward — elbows long, never straight',
});
