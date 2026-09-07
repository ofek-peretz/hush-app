/**
 * pull_row — the remaining five members (bb_row is the standalone benchmark). Template canon
 * (§4.1): arms long (elbow ~170°) → handle contacts the torso landmark · path vertical (hinged)
 * or horizontal (seated/supported) · TORSO ANGLE FROZEN ±3° for the whole rep · knees fixed.
 *
 * Bodies: the benchmark's 45° hinge (t_bar_row) · a bench-supported flat-back body facing LEFT
 * (db_row — three points of contact: knee and hand on the bench, foot planted) · an upright
 * seated body (cable_row, machine_row) · the standing core (face_pull). Every member is the
 * template + a contact landmark + an implement drawing.
 */

// 

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2, Vec3 } from '../types';
import { lerp, lerpV, twoBoneIK, twoBoneIK3, twoBoneIKToward, withinReach } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { lags } from '../curves';
import { barPathTicks, dumbbellEnd, flatBench, floorScene, leverBar, linePathTicks, plateGhost, padStroke, sampledPathTicks } from '../kit';
import { facePullStation, machineRowStation, seatedRowStation } from '../machines';
import { far, FLOOR_Y, standingFrontCore } from '../bodies';
import { project, type Camera } from '../camera';

const UPPER = ATHLETE.upperArm;
const FORE = ATHLETE.foreArm;

/*
 * THE ELBOW LEADS, THE SHOULDER-LINE FINISHES LAST (iron rule 12, audit 2026-09-03).
 *
 * Every hinged member of this family has two drivers — the handle and the torso's honest hip
 * drive — and they used to run on one clock, so the trunk rose in lock-step with the hand and the
 * row read as a mechanism. A real row starts with the elbow: the arm has bent well before the
 * trunk moves, and the trunk arrives last. So the torso sits still for the first fifth of the pull
 * (and, mirrored, finishes its return before the arm has finished reaching). Same endpoints; only
 * the middle of the rep tells the difference. The frozen-torso members have one driver and get no
 * curve — there is no second joint to sequence until the shoulder girdle exists.
 */
const TORSO_LAGS = lags(0.2);

const rowChains = {
  torso: ['hip', 'shoulder'] as [string, string],
  neck: ['shoulder', 'head'] as [string, string],
  head: 'head',
  nearArm: ['shoulder', 'elbow', 'hand'],
  farArm: ['farShoulder', 'farElbow', 'farHand'],
  nearLeg: ['hip', 'knee', 'ankle'],
  nearFoot: ['heel', 'toe'] as [string, string],
  farLeg: ['farHip', 'farKnee', 'farAnkle'],
  farFoot: ['farHeel', 'farToe'] as [string, string],
};

const rowInvariants = (headLabel = 'neutral neck (head on the spine line)'): FormSpec['invariants'] => [
  { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'torso frozen (no swing)' },
  { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips fixed' },
  { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees fixed' },
  { kind: 'pointFixed', point: 'head', tol: 0.5, label: headLabel },
  { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
];

// ── t_bar_row — hinged over the floor-anchored lever, WITH the hip-drive contribution ──
// Unlike the strict bb_row (torso frozen — its defining cue), a t-bar row shows the hips
// helping: the torso rises a controlled 8° through the pull and lowers on the return, pivoting
// about fixed hips. The invariant caps the swing at 10° — hip drive, never body English.
export const tBarRow: Rig = (() => {
  const HEEL: Vec2 = { x: 152, y: FLOOR_Y };
  const TOE: Vec2 = { x: 177, y: FLOOR_Y };
  const ANKLE: Vec2 = { x: 162, y: 186 };
  const KNEE: Vec2 = { x: 172, y: 150.5 };
/*
   * The KNEE is solved from the hip and the planted ankle rather than authored as a third fixed
   * point. Three hand-placed constants cannot all be right at once: the seated rows had a thigh of
   * 45.5 and 56.6 against a canonical 40, because the knee was simply put where it looked good
   * between two points that were already spoken for. Two-bone IK on canonical lengths cannot do that,
   * and `twoBoneIKToward` keeps whichever side the authored knee was on so the pose does not flip.
   */
  const HIP: Vec2 = { x: 157, y: 113.5 };
  const TORSO_HANG = 45; // deg above horizontal at the dead hang
  const TORSO_RISE = 8; // the authored hip-drive arc
  const DEG = Math.PI / 180;

  const torsoAt = (rom: number): number => (TORSO_HANG + TORSO_RISE * TORSO_LAGS(rom)) * DEG;
  const shoulderAt = (rom: number): Vec2 => {
    const th = torsoAt(rom);
    return { x: HIP.x + ATHLETE.torso * Math.cos(th), y: HIP.y - ATHLETE.torso * Math.sin(th) };
  };
  const SHOULDER0 = shoulderAt(0);
  /* 4u behind the shoulder, not under it: on the shoulder's own vertical the elbow spent rom
     0.36–0.55 within 1.3° of the trunk line — an arm growing out of the belly for two frames.
     Hung slightly back, it crosses the trunk line earlier and clears it sooner (audit, 2026-09-03). */
  const BAR_X = SHOULDER0.x - 4;
  const HANG_Y = SHOULDER0.y + Math.sqrt(((UPPER + FORE) * 0.993) ** 2 - (SHOULDER0.x - BAR_X) ** 2);
  const ANCHOR: Vec2 = { x: 46, y: 190 };

  /*
   * THE HANDLE RIDES THE BAR'S ARC, BECAUSE THE BAR IS RIGID.
   *
   * It used to travel straight up a vertical from the dead hang to a fixed `CHEST_Y = 94`, with the
   * far end pinned to the floor anchor — so the lever ran 157.9 units long at the bottom and 173.8
   * at the top. It grew 16 units, a tenth of itself, every rep. Nothing caught it: the auditor's
   * no-bone-stretches law is about the ATHLETE, and a vertical path constraint is satisfied by
   * exactly the motion that breaks the bar.
   *
   * A landmine handle is on a circle about its anchor, and over a 25u rise that circle moves it
   * about 14u back toward the anchor — the real T-bar path, which is why the handle finishes tight
   * under the chest rather than out in front of it. The radius is taken from the dead hang so the
   * bottom of the rep is unchanged, and `spanFixed` now holds the lever rigid in the validator.
   */
  const R = Math.hypot(BAR_X - ANCHOR.x, HANG_Y - ANCHOR.y);
  /** The handle's height at the endpoint: where its own arc meets the trunk's front surface —
   *  105, not 102: the lower 3u keep the elbow out of the trunk silhouette (audit, 2026-09-03). */
  const CHEST_Y = 105;
  const handAt = (rom: number): Vec2 => {
    const y = lerp(HANG_Y, CHEST_Y, rom);
    return { x: ANCHOR.x + Math.sqrt(Math.max(1, R * R - (ANCHOR.y - y) ** 2)), y };
  };
  /* The plates ride the lever BEYOND the handle — 12u further along it, away from the anchor —
     where a T-bar's loaded end actually is. Concentric with the fist, the ring covered the
     handle-to-chest contact and the whole range arc (audit, 2026-09-03). */
  const platesAt = (rom: number): Vec2 => {
    const bar = handAt(rom);
    const d = Math.hypot(bar.x - ANCHOR.x, bar.y - ANCHOR.y) || 1;
    return { x: bar.x + ((bar.x - ANCHOR.x) / d) * 12, y: bar.y + ((bar.y - ANCHOR.y) / d) * 12 };
  };

  const poseAt = (rom: number): Pose => {
    const th = torsoAt(rom);
    const shoulder = shoulderAt(rom);
    // the head rides the spine, biased upright (neutral neck, eyes forward-down)
    const head: Vec2 = {
      x: shoulder.x + ATHLETE.neck * Math.cos(th + 10 * DEG),
      y: shoulder.y - ATHLETE.neck * Math.sin(th + 10 * DEG),
    };
    const hand: Vec2 = handAt(rom);
    const elbow = twoBoneIK(shoulder, hand, UPPER, FORE, 1);
    return {
      headR: 8,
      j: {
        head, shoulder, elbow, hand, hip: HIP, bar: hand,
        // the floor anchor, carried as a joint so the FormSpec can hold the lever rigid
        pivot: ANCHOR,
        knee: twoBoneIKToward(HIP, ANKLE, ATHLETE.thigh, ATHLETE.shank, KNEE), ankle: ANKLE, heel: HEEL, toe: TOE,
        farShoulder: far(shoulder, -7, 2), farElbow: far(elbow, -7, 2), farHand: far(hand, -7, 2),
        farHip: far(HIP, -7, 1), farKnee: far(twoBoneIKToward(HIP, ANKLE, ATHLETE.thigh, ATHLETE.shank, KNEE), -7, 1), farAnkle: far(ANKLE, -7, 1),
        farHeel: far(HEEL, -8), farToe: far(TOE, -8),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const bar = handAt(rom);
    return {
      // the shaft draws in the BAR voice (§3.5): floor anchor → hinge pin → solid lever
      back: [
        ...leverBar(ANCHOR, platesAt(rom)),
        // the range statement follows the ARC, because that is the path the handle actually takes
        ...sampledPathTicks(Array.from({ length: 13 }, (_, i) => handAt(i / 12))),
      ],
      front: [...plateGhost(platesAt(rom), 12), { kind: 'circle', c: bar, r: 2.5, fill: 'ink0' }], // the fist on the handle
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [{ kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 165, max: 179, label: 'dead hang — arms long' }],
    end: [{ kind: 'contactY', a: 'bar', y: CHEST_Y, tol: 2, label: 'handle to the chest' }],
    path: { track: 'bar', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'pivot', tol: 0.01, label: 'the landmine pivot is bolted to the floor' },
      { kind: 'spanFixed', a: 'pivot', b: 'bar', tol: 0.5, label: 'the bar is a rigid lever' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 10, label: 'controlled hip drive (≤10°, no body English)' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips fixed — the pivot' },
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees fixed' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'feet planted' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return { id: 't_bar_row', chains: rowChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 164, 26) };
})();

// ── db_row — bench-supported, facing LEFT, dumbbell to the waistline ─────────────
export const dbRow: Rig = (() => {
  const HIP: Vec2 = { x: 192, y: 124 };
  const SHOULDER: Vec2 = { x: 144, y: 116 }; // flat back, ~9° above horizontal
  const HEAD: Vec2 = { x: 128, y: 113 };
  const KNEE: Vec2 = { x: 200, y: 161 }; // standing support leg, planted well back
  const ANKLE: Vec2 = { x: 227, y: 186 };
  const HEEL: Vec2 = { x: 222, y: FLOOR_Y };
  const TOE: Vec2 = { x: 246, y: FLOOR_Y };
  const FAR_KNEE: Vec2 = { x: 198, y: 156 }; // kneeling on the pad
  const FAR_ANKLE: Vec2 = { x: 232, y: 152 }; // shin resting along the bench
  /* Planted a foot ahead of the bell's hang: at x 136 the support fist sat 9.8u from the dumbbell
     ring at the dead hang and for the first 15 % of the rep nobody could tell which hand held the
     weight. At 124 the gap is 20.8u, and the support arm locks out straight — the setup every
     coach teaches (audit, 2026-09-03). */
  const SUPPORT_HAND: Vec2 = { x: 124, y: 158 };
  const HANG_Y = SHOULDER.y + (UPPER + FORE) * 0.995;
  /*
   * WHERE THE DUMBBELL FINISHES, AND WHY IT IS NOT STRAIGHT UP.
   *
   * The hand used to travel a vertical from the dead hang to y = 131 at the SHOULDER's own x —
   * that is a pull to the armpit, not a row. It also left the hand 15u directly below its own
   * shoulder with 48u of arm to fold into that gap, so the elbow closed to 36 degrees and the upper
   * arm came to rest along the trunk line where nothing about it could be seen.
   *
   * A one-arm row finishes at the LOWER RIBS, up and BACK toward the hip, with the elbow driven
   * past the torso. So the endpoint is derived: 60 % of the way along the spine from the shoulder,
   * then out to the trunk's underside. That lands the hand 30.5u from its shoulder, opens the elbow
   * to 79 degrees, and puts the elbow 13u above the trunk line where the drive is legible.
   */
  const START: Vec2 = { x: SHOULDER.x, y: HANG_Y };
  const SPINE: Vec2 = { x: HIP.x - SHOULDER.x, y: HIP.y - SHOULDER.y };
  const SPINE_L = Math.hypot(SPINE.x, SPINE.y);
  const UNDER: Vec2 = { x: -SPINE.y / SPINE_L, y: SPINE.x / SPINE_L }; // the trunk's down-facing side
  const END: Vec2 = {
    x: SHOULDER.x + SPINE.x * 0.6 + UNDER.x * 9,
    y: SHOULDER.y + SPINE.y * 0.6 + UNDER.y * 9,
  };

  const poseAt = (rom: number): Pose => {
    const hand: Vec2 = lerpV(START, END, rom);
    // mirrored figure → mirrored bend: −1 drives the elbow up-and-back toward the hip
    const elbow = twoBoneIK(SHOULDER, hand, UPPER, FORE, -1);
    const farShoulder = far(SHOULDER, 6, 2);
    /* Clamped: the bench the support hand rests on sits 51.5 from that shoulder, past a 48 arm. */
    const supportGrip = withinReach(farShoulder, SUPPORT_HAND, (UPPER + FORE) * 0.99);
    const farElbow = twoBoneIK(farShoulder, supportGrip, UPPER, FORE, 1);
    return {
      headR: 8,
      j: {
        head: HEAD, shoulder: SHOULDER, elbow, hand, hip: HIP, bar: hand,
        knee: twoBoneIKToward(HIP, ANKLE, ATHLETE.thigh, ATHLETE.shank, KNEE), ankle: ANKLE, heel: HEEL, toe: TOE,
        farShoulder, farElbow, farHand: supportGrip,
        farHip: far(HIP, 5, 1), farKnee: FAR_KNEE, farAnkle: FAR_ANKLE,
      },
    };
  };

  const bench = flatBench(114, 258, 160, FLOOR_Y);

  const decorAt = (rom: number): Decor => {
    const db: Vec2 = lerpV(START, END, rom);
    return {
      back: [...bench, ...linePathTicks(START, END)],
      front: dumbbellEnd(db),
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [{ kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 165, max: 179, label: 'dead hang — arm long' }],
    end: [
      { kind: 'contactY', a: 'bar', y: END.y, tol: 2, label: 'dumbbell to the lower ribs' },
      { kind: 'contactX', a: 'bar', x: END.x, tol: 2, label: 'and back toward the hip, not up to the armpit' },
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 68, max: 92, label: 'elbow driven past the torso' },
    ],
    path: { track: 'bar', kind: 'line', tol: 1.5, dir: { x: END.x - START.x, y: END.y - START.y } },
    invariants: [
      ...rowInvariants('neutral neck (eyes on the pad)'),
      { kind: 'pointFixed', point: 'farHand', tol: 0.5, label: 'support hand planted on the bench' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'support foot planted' },
    ],
  };

  return {
    id: 'db_row',
    chains: { ...rowChains, facing: -1, farFoot: undefined },
    formspec,
    poseAt,
    decorAt,
    scene: floorScene(FLOOR_Y, 190, 80),
  };
})();

// ── the seated horizontal pulls (cable_row, machine_row) ─────────────────────────
// The two are DELIBERATELY different bodies in motion: machine_row has a chest pad, so its
// torso is frozen (±3°); cable_row has no pad, so it shows the small controlled hip-hinge of
// real technique — reaching slightly forward into the stretch, finishing slightly tall-back.
interface SeatedRowParams {
  id: string;
  handleY: number;
  endX: number;
  endLabel: string;
  /** The complete station (§3.5 Amendment 4): receives the moving handle + the stack lift. */
  station: (hand: Vec2, lift: number) => Primitive[];
  /** The attachment in the fist (§3.5 Amendment 5 — the attachment is a word): the cable row's
   *  V-grip (yoke apex toward the cable, where the cable honestly attaches) vs the machine
   *  row's fixed handle. */
  grip: 'v' | 'machine';
  /** Torso lean from vertical (deg, + = toward the machine): at the stretch → at the finish.
   *  Equal values = braced/frozen torso (chest pad). */
  lean: { start: number; end: number };
  legs: { knee: Vec2; ankle: Vec2; heel: Vec2; toe: Vec2 };
  shadow: { cx: number; rx: number };
  /**
   * One arm works and the other rests on its own thigh.
   *
   * `single_arm_cable_row` was built from this same builder with nothing set, so BOTH arms rowed:
   * the far arm is normally a `far()` copy of the near one, and the clip was a two-arm cable row
   * with a different handle drawn on it — pixel-for-pixel the same demonstration as `cable_row`.
   * The one thing the exercise's name promises was the one thing missing.
   */
  singleArm?: boolean;
}

function seatedRow(p: SeatedRowParams): Rig {
  const HIP: Vec2 = { x: 141, y: 157 };
  /* Each member hands in a knee, an ankle and a foot; the knee is re-solved from the hip and that
     ankle so the thigh is exactly canonical. Authored straight through, `machine_row` carried a
     45.5 thigh and `single_arm_cable_row` a 56.6, against 40. */
  /* The ankle is clamped into the leg's reach first: `single_arm_cable_row` planted its support
     foot 79.8 units from the hip against a whole leg of 77, and IK answers an out-of-reach target
     by letting the shank span the remainder. */
  const PLANTED = withinReach(HIP, p.legs.ankle, (ATHLETE.thigh + ATHLETE.shank) * 0.99);
  const SOLVED_KNEE = twoBoneIKToward(HIP, PLANTED, ATHLETE.thigh, ATHLETE.shank, p.legs.knee);
  const DEG = Math.PI / 180;
  const hinged = p.lean.start !== p.lean.end;

  // the hinged members sequence the trunk behind the arm (TORSO_LAGS); a braced trunk has no clock
  const leanAt = (rom: number): number => lerp(p.lean.start, p.lean.end, hinged ? TORSO_LAGS(rom) : rom) * DEG;
  const shoulderAt = (rom: number): Vec2 => {
    const th = leanAt(rom);
    return { x: HIP.x + ATHLETE.torso * Math.sin(th), y: HIP.y - ATHLETE.torso * Math.cos(th) };
  };
  const SHOULDER0 = shoulderAt(0);
  const startX = SHOULDER0.x + Math.sqrt(((UPPER + FORE) * 0.995) ** 2 - (p.handleY - SHOULDER0.y) ** 2);

  const poseAt = (rom: number): Pose => {
    const th = leanAt(rom);
    const shoulder = shoulderAt(rom);
    const head: Vec2 = {
      x: shoulder.x + ATHLETE.neck * Math.sin(th * 0.7),
      y: shoulder.y - ATHLETE.neck * Math.cos(th * 0.7),
    };
    const hand: Vec2 = { x: lerp(startX, p.endX, rom), y: p.handleY };
    const elbow = twoBoneIK(shoulder, hand, UPPER, FORE, 1);
    return {
      headR: 8,
      j: {
        head, shoulder, elbow, hand, hip: HIP, bar: hand,
        knee: SOLVED_KNEE, ankle: PLANTED, heel: p.legs.heel, toe: p.legs.toe,
        ...(p.singleArm
          ? (() => {
              /* The idle arm: its hand rests on its own thigh, half way to the knee, and the elbow
                 solves from there — so it hangs at the side instead of mirroring the pull. */
              const fs = far(shoulder, 7, 2);
              const rest = withinReach(
                fs,
                { x: (HIP.x + SOLVED_KNEE.x) / 2 + 7, y: (HIP.y + SOLVED_KNEE.y) / 2 - 4 },
                (ATHLETE.upperArm + ATHLETE.foreArm) * 0.99,
              );
              return { farShoulder: fs, farElbow: twoBoneIK(fs, rest, UPPER, FORE, 1), farHand: rest };
            })()
          : { farShoulder: far(shoulder, 7, 2), farElbow: far(elbow, 7, 2), farHand: far(hand, 7, 2) }),
        farHip: far(HIP, 7, 1), farKnee: far(SOLVED_KNEE, 7, 1), farAnkle: far(PLANTED, 7, 1),
        farHeel: far(p.legs.heel, 8), farToe: far(p.legs.toe, 8),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const hand: Vec2 = { x: lerp(startX, p.endX, rom), y: p.handleY };
    // the V-grip's yoke apex is where the cable honestly attaches — the station's cable is drawn
    // to the apex, never 6u short of it
    const attach: Vec2 = p.grip === 'v' ? { x: hand.x + 6, y: hand.y } : hand;
    const back: Primitive[] = [
      ...p.station(attach, startX - hand.x), // 1:1 cable — the plate rises as far as the handle travels
      { kind: 'dash', a: { x: startX, y: p.handleY }, b: { x: p.endX, y: p.handleY }, w: 2, color: 'ink0', dash: [1.5, 6.5], opacity: 0.9 },
      { kind: 'line', a: { x: startX, y: p.handleY - 4.5 }, b: { x: startX, y: p.handleY + 4.5 }, w: 2, color: 'ink0', cap: 'round' },
      { kind: 'line', a: { x: p.endX, y: p.handleY - 4.5 }, b: { x: p.endX, y: p.handleY + 4.5 }, w: 2, color: 'ink0', cap: 'round' },
    ];
    const front: Primitive[] =
      p.grip === 'v'
        ? [
            // the V-grip: vertical grip bar in the fist, yoke converging to the cable apex
            { kind: 'line', a: { x: hand.x, y: hand.y - 7 }, b: { x: hand.x, y: hand.y + 7 }, w: 3.5, color: 'ink0', cap: 'round' },
            { kind: 'polyline', pts: [{ x: hand.x, y: hand.y - 7 }, attach, { x: hand.x, y: hand.y + 7 }], w: 2.2, color: 'ink0' },
            { kind: 'circle', c: attach, r: 2, fill: 'ink0' },
          ]
        : [
            { kind: 'line', a: { x: hand.x, y: hand.y - 8 }, b: { x: hand.x, y: hand.y + 8 }, w: 3.5, color: 'ink0', cap: 'round' },
            { kind: 'circle', c: hand, r: 2.5, fill: 'ink0' },
          ];
    return { back, front };
  };

  const swing = Math.abs(p.lean.end - p.lean.start);
  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [{ kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 165, max: 179, label: 'arms long — full stretch' }],
    end: [{ kind: 'contactX', a: 'bar', x: p.endX, tol: 2, label: p.endLabel }],
    path: { track: 'bar', kind: 'horizontal', tol: 1.5 },
    invariants: [
      hinged
        ? { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: swing + 3, label: `controlled hinge (≤${swing + 3}°, no swing)` }
        : { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'torso braced on the pad' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips fixed on the seat' },
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees fixed' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'feet braced' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return { id: p.id, chains: rowChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 175, 55) };
}

export const cableRow = seatedRow({
  id: 'cable_row',
  // 134, not 132: two units lower the elbow crosses the trunk line sooner and lies on it for
  // less of the rep — it spent rom 0.5–0.75 within 3.4° of the spine (audit, 2026-09-03)
  handleY: 134,
  // 150, not 158: the trunk's front surface at handle height is x = 147, so at 158 the handle
  // finished a fist-and-a-half OFF the body and the row never made contact. 150 lands it on the
  // abdomen and opens the elbow from 82 to 68 degrees on the way.
  endX: 150,
  endLabel: 'handle to the waist',
  lean: { start: 9, end: -6 }, // reach into the stretch, finish slightly tall-back — no pad
  station: seatedRowStation,
  grip: 'v',
  legs: { knee: { x: 181, y: 166 }, ankle: { x: 214, y: 178 }, heel: { x: 217, y: 184 }, toe: { x: 231, y: 171 } },
  shadow: { cx: 178, rx: 62 },
});

/*
 * machine_row's handle finishes LOWER and CLOSER than it did (118/168 → 124/163), because at the
 * old endpoint the elbow never passed the trunk: hip-shoulder-elbow ran 77.8° → 19.0° with the
 * elbow 6.5u IN FRONT of the shoulder line at rom 1, and the card's own cue ("drive the elbows
 * back") was not drawn. The endpoint is bounded by the station, not the athlete: the pull arm is
 * two 38u links from a pivot at (210,64), so the handle cannot come nearer than 76u to it — the
 * audit's 130/154 needs 85u. 124/163 is the closest the arm honestly reaches; lengthening the
 * links to 42 (machines.ts) would let the handle finish at 126/160 with the elbow 8° past the
 * trunk (audit, 2026-09-03).
 */
export const machineRow = seatedRow({
  id: 'machine_row',
  handleY: 126, // with the station's 42u links the handle reaches 160/126 and the elbow finishes 8° behind the trunk (2026-09-03)
  endX: 160,
  endLabel: 'handle back, elbows to the torso line',
  lean: { start: 2, end: 2 }, // braced into the chest pad — the torso does not move (2°: the chest meets the pad's face)
  station: machineRowStation,
  grip: 'machine',
  legs: { knee: { x: 186, y: 150 }, ankle: { x: 193, y: 186 }, heel: { x: 187, y: FLOOR_Y }, toe: { x: 212, y: FLOOR_Y } },
  shadow: { cx: 172, rx: 50 },
});

// ── face_pull — FRONT-VIEW: the goalpost IS the exercise ─────────────────────────
// The defining recognition cue — both elbows flared at shoulder height, forearms up, hands
// beside the head — is a TWO-ARM FRONTAL silhouette; no side-view arm can produce it (it kept
// reading as a curl). Per §3.4 rule 2 the camera follows the cue: standing, face-on, fists
// together on the rope at face height, pulled apart and back into the goalpost. The start
// predicates are stated in the drawing plane (§3.4 rule 4 — the reach is a projected fold, so
// it asserts hand POSITION, not arm length).
/**
 * smith_row (2026-08-25) — the barbell row ON RAILS: the t-bar's hinged body (45 deg, the card's
 * own number) with a straight vertical bar path and the smith's two uprights. The rails erase the
 * t-bar's arc — which is the honest difference between the two machines, drawn as exactly that.
 */
export const smithRow: Rig = (() => {
  const HEEL: Vec2 = { x: 152, y: FLOOR_Y };
  const TOE: Vec2 = { x: 177, y: FLOOR_Y };
  const ANKLE: Vec2 = { x: 162, y: 186 };
  const KNEE: Vec2 = { x: 172, y: 150.5 };
  const HIP: Vec2 = { x: 157, y: 113.5 };
  const DEG2 = Math.PI / 180;
  const TH = 45 * DEG2; // the hinge, frozen — "hinge to about 45"
  const SHOULDER: Vec2 = { x: HIP.x + ATHLETE.torso * Math.cos(TH), y: HIP.y - ATHLETE.torso * Math.sin(TH) };
  const HEAD: Vec2 = { x: SHOULDER.x + ATHLETE.neck * Math.cos(TH + 10 * DEG2), y: SHOULDER.y - ATHLETE.neck * Math.sin(TH + 10 * DEG2) };
  /*
   * The shoulders stand 9u IN FRONT of the bar — the Smith-row setup cue itself. Directly under
   * the shoulder, the rails' vertical path carried the elbow into the trunk from rom 0.55 to the
   * end (hip-shoulder-elbow ≤ 10.9°, the elbow 4.7u off the spine inside a 13u half-width) and the
   * last third of the rep drew an arm growing from the belly. Nine units back the elbow finishes
   * 29.5° behind the trunk line and opens to 64°; the dead hang leans 11° off vertical, which is
   * what a bar on rails and a hinged athlete honestly look like together. Nine, not more, because
   * the near rail (at BAR_X + 9) must clear the head: at 191 it grazes the back of the skull
   * instead of running through the face (audit, 2026-09-03).
   */
  const BAR_X = SHOULDER.x - 9;
  const HANG_Y = SHOULDER.y + Math.sqrt(((UPPER + FORE) * 0.99) ** 2 - (SHOULDER.x - BAR_X) ** 2);
  const RIB_Y = SHOULDER.y + 24; // pulled to the lower ribs

  const poseAt = (rom: number): Pose => {
    const hand: Vec2 = { x: BAR_X, y: lerp(HANG_Y, RIB_Y, rom) };
    const elbow = twoBoneIK(SHOULDER, hand, UPPER, FORE, 1);
    return {
      headR: 8,
      j: {
        head: HEAD, shoulder: SHOULDER, elbow, hand, hip: HIP, bar: hand,
        knee: twoBoneIKToward(HIP, ANKLE, ATHLETE.thigh, ATHLETE.shank, KNEE), ankle: ANKLE, heel: HEEL, toe: TOE,
        farShoulder: far(SHOULDER, -7, 2), farElbow: far(elbow, -7, 2), farHand: far(hand, -7, 2),
        farHip: far(HIP, -7, 1), farKnee: far(twoBoneIKToward(HIP, ANKLE, ATHLETE.thigh, ATHLETE.shank, KNEE), -7, 1), farAnkle: far(ANKLE, -7, 1),
        farHeel: far(HEEL, -8), farToe: far(TOE, -8),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const bar: Vec2 = { x: BAR_X, y: lerp(HANG_Y, RIB_Y, rom) };
    return {
      back: [
        /*
         * THE GATE, SEEN END-ON.
         *
         * The uprights were at BAR_X +/- 52 — the FRONT-view spacing of a Smith machine, a metre
         * apart, used in a SIDE view. One of them ran straight through the athlete's back and the
         * other stood a foot clear of everything, so the clip showed two unexplained posts instead
         * of a machine. A Smith's rails sit at the ENDS of the bar, and the bar in this camera is
         * end-on: both rails project onto the bar's own x, and all that separates them is depth.
         * Nine units apart is that depth, and the athlete is drawn between them — which is exactly
         * where he stands.
         */
        { kind: 'line', a: { x: BAR_X - 9, y: 40 }, b: { x: BAR_X - 9, y: FLOOR_Y - 2 }, w: 3, color: 'ink3', opacity: 0.55 },
        { kind: 'line', a: { x: BAR_X + 9, y: 40 }, b: { x: BAR_X + 9, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
        // the hook ladder on the near rail — the peg row is what names a Smith from any angle
        ...[0, 1, 2, 3].map((i) => ({
          kind: 'line' as const,
          a: { x: BAR_X + 9, y: 96 + i * 14 },
          b: { x: BAR_X + 16, y: 96 + i * 14 },
          w: 2,
          color: 'ink3' as const,
        })),
        ...barPathTicks(BAR_X + 30, HANG_Y, RIB_Y),
        /* The plate ring drops BEHIND the athlete once the bar is above the hip line: in front, the
           r16 ring covered the whole lower trunk from rom 0.5 on and hid the exact bar-to-ribs
           contact it exists to show. The bar-point stays in front (audit, 2026-09-03). */
        ...(bar.y < 115 ? plateGhost(bar) : []),
      ],
      front: bar.y < 115 ? [{ kind: 'circle', c: bar, r: 2.5, fill: 'ink0' }] : plateGhost(bar),
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 160, max: 179, label: 'the dead hang — arms long on the rails' },
    ],
    end: [
      { kind: 'contactY', a: 'bar', y: RIB_Y, tol: 1.5, label: 'pulled to the lower ribs' },
    ],
    path: { track: 'bar', kind: 'vertical', tol: 1 },
    invariants: [
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'the hinge holds — no standing up with the row' },
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'the torso is frozen at 45' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'planted' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension at the hang' },
    ],
  };

  return {
    id: 'smith_row',
    chains: {
      torso: ['hip', 'shoulder'], neck: ['shoulder', 'head'], head: 'head',
      nearArm: ['shoulder', 'elbow', 'hand'], farArm: ['farShoulder', 'farElbow', 'farHand'],
      nearLeg: ['hip', 'knee', 'ankle'], nearFoot: ['heel', 'toe'],
      farLeg: ['farHip', 'farKnee', 'farAnkle'], farFoot: ['farHeel', 'farToe'],
    },
    formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 184, 30),
  };
})();

/**
 * incline_db_row — the chest-SUPPORTED row ("Chest-Supported Dumbbell Row"): the body lies prone on
 * an incline pad, which IS the machine here. It deletes the hinge as a thing she maintains, and
 * with it the cheat this family polices — standing up with the row. The torso is furniture at the
 * pad's own angle; both arms hang past its edge, and only they move.
 *
 * WHAT THIS WAS, AND WHY IT WAS REDRAWN. The pad was authored 8 units behind the spine and drawn
 * in the far plane, so the athlete covered every pixel of it: the one piece of equipment the
 * exercise is NAMED after was invisible. What was left on screen was a man on all fours on the
 * floor holding a dumbbell — knees folded to 60 degrees, hips 41u up, no bench, one bell. It read
 * as a bear crawl.
 *
 * Three things fix it, and all three are geometry rather than decoration:
 *   - The hips ride at the pad's real height (55u, about 63cm), which is what lets the legs come
 *     out nearly straight (165 degrees) BEHIND the body instead of folding under it.
 *   - The pad is offset onto the CHEST side of the spine and runs past the head, so a hand's width
 *     of upholstery shows down the whole length of him, with its upright and strut grounded.
 *   - Both bells are drawn. It is a two-dumbbell exercise and one of them was missing.
 */
export const inclineDbRow: Rig = (() => {
  const PAD_DEG = 32 * (Math.PI / 180);
  const DIR: Vec2 = { x: Math.cos(PAD_DEG), y: -Math.sin(PAD_DEG) }; // up the pad, hip to head
  const CHEST: Vec2 = { x: -DIR.y, y: DIR.x }; // the side he lies ON
  const HIP: Vec2 = { x: 132, y: 138 };
  const SHOULDER: Vec2 = { x: HIP.x + ATHLETE.torso * DIR.x, y: HIP.y + ATHLETE.torso * DIR.y };
  const HEAD: Vec2 = { x: SHOULDER.x + ATHLETE.neck * DIR.x, y: SHOULDER.y + ATHLETE.neck * DIR.y };
  /* The legs continue the body line and reach the floor nearly straight — the prone stance. */
  const KNEE_HINT: Vec2 = { x: HIP.x - ATHLETE.thigh * DIR.x, y: HIP.y - ATHLETE.thigh * DIR.y };
  const ANKLE: Vec2 = { x: 72.6, y: 186 };
  const KNEE: Vec2 = twoBoneIKToward(HIP, ANKLE, ATHLETE.thigh, ATHLETE.shank, KNEE_HINT);
  /* On the balls of the feet behind the bench: flat on the floor, the shank at 47° from vertical
     put the ankle at 23° of dorsiflexion (knee-ankle-toe 66.8°, the physiological limit). The toe
     comes back under the ankle and the heel rides 4u up — the foot is steep, as it is when a real
     athlete stands on the toes here; knee-ankle-toe opens to 86° (audit, 2026-09-03). */
  const HEEL: Vec2 = { x: ANKLE.x - 16.6, y: FLOOR_Y - 4 };
  const TOE: Vec2 = { x: ANKLE.x + 7.4, y: FLOOR_Y };

  /* The hang is solved from its angle (the file rule elsewhere): dx = 2 to the hand, target 168. */
  const HANG_REACH = Math.sqrt(UPPER * UPPER + FORE * FORE - 2 * UPPER * FORE * Math.cos((168 * Math.PI) / 180));
  const HANG_Y = SHOULDER.y + Math.sqrt(HANG_REACH * HANG_REACH - 4);
  const TOP_Y = SHOULDER.y + 22; // the bells to the lower ribs — 22, not 26: 4u above the pad's edge, where the ring no longer merges with the upholstery outline (audit, 2026-09-03)
  /*
   * THE HAND COMES BACK, not just up.
   *
   * It used to ride a fixed x — a purely vertical pull ending directly under the shoulder — while
   * the elbow travelled 19u behind it. That leaves the forearm pointing FORWARD and down from the
   * elbow, wrist trailing, which is the shape of a shrug-and-bend rather than a row. Rowing to the
   * lower ribs on a 40° pad means the hand finishes back along the torso as well as up, and 14u is
   * where the ribs are; the elbow then solves above and behind it and the forearm hangs the way a
   * loaded forearm has to.
   *
   * −20, not −14 (audit, 2026-09-03): at −14 the elbow finished 7.3u off the spine — inside the
   * trunk's 13u half-width — and at rom 0.75 lay within 1.9° of the back line, so the one thing a
   * chest-supported row is for, the elbow drive, was a bump on the back. Six units further back the
   * elbow clears the back line by 13.2u (hip-shoulder-elbow 31.8°) at the same 72° fold.
   */
  const TOP_DX = -20;

  const handAt = (rom: number): Vec2 => ({
    x: SHOULDER.x + 2 + lerp(0, TOP_DX, rom),
    y: lerp(HANG_Y, TOP_Y, rom),
  });

  const poseAt = (rom: number): Pose => {
    const hand = handAt(rom);
    const elbow = twoBoneIK(SHOULDER, hand, UPPER, FORE, 1);
    return {
      headR: 8,
      j: {
        head: HEAD, shoulder: SHOULDER, elbow, hand, hip: HIP, bar: hand,
        knee: KNEE, ankle: ANKLE, heel: HEEL, toe: TOE,
        farShoulder: far(SHOULDER, -7, 2), farElbow: far(elbow, -7, 2), farHand: far(hand, -7, 2),
        farHip: far(HIP, -7, 1), farKnee: far(KNEE, -7, 1), farAnkle: far(ANKLE, -7, 1),
        farHeel: far(HEEL, -8), farToe: far(TOE, -8),
      },
    };
  };

  /** The pad, offset onto the chest side so it reads past the body, plus its frame. */
  const PAD_A: Vec2 = { x: HIP.x - 10 * DIR.x + 18 * CHEST.x, y: HIP.y - 10 * DIR.y + 18 * CHEST.y };
  // the pad stops at the collarbone so the head hangs free over its top edge, which is what a
  // chest-support bench is for; running it past the head read as his face resting on upholstery
  /* 18 off the body axis, not 10. The athlete's own trunk is 13 wide from that axis, so a pad
     centred at 10 left five units of upholstery showing and the clip read as a bear crawl again —
     the fault this rig was rebuilt for once already. At 18 a hand's width of pad runs down the
     whole chest, which is the one mark that says CHEST-SUPPORTED. */
  const PAD_B: Vec2 = { x: SHOULDER.x + 7 * DIR.x + 18 * CHEST.x, y: SHOULDER.y + 7 * DIR.y + 18 * CHEST.y };
  const bench: Primitive[] = [
    ...padStroke(PAD_A, PAD_B, 17),
    { kind: 'line', a: { x: PAD_A.x + 4, y: PAD_A.y + 4 }, b: { x: PAD_A.x + 4, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: PAD_A.x - 12, y: FLOOR_Y - 2 }, b: { x: PAD_A.x + 30, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
    // the strut up to the pad's high end — the triangle that says "incline bench", not "wall"
    { kind: 'line', a: { x: PAD_A.x + 4, y: 170 }, b: { x: PAD_B.x - 3, y: PAD_B.y + 9 }, w: 2.5, color: 'ink3' },
  ];

  const decorAt = (rom: number): Decor => {
    const hand = handAt(rom);
    return {
      back: [...bench, ...dumbbellEnd(far(hand, -7, 2)), ...barPathTicks(SHOULDER.x + 30, HANG_Y, TOP_Y)],
      front: dumbbellEnd(hand),
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 158, max: 179, label: 'lower fully — the honest hang off the pad' },
    ],
    end: [
      { kind: 'contactY', a: 'hand', y: TOP_Y, tol: 1.5, label: 'row to your lower ribs' },
    ],
    /* A LINE, not a vertical: the hand rows back along the torso as well as up, which is what
       rowing to the ribs is. Declared vertical, the assertion was pinning the fault. */
    path: { kind: 'line', track: 'bar', tol: 1.5, dir: { x: TOP_DX, y: TOP_Y - HANG_Y } },
    invariants: [
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'the pad owns the torso — it cannot rise with the row' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips on the pad' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'feet planted' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension at the hang' },
    ],
  };

  return {
    id: 'incline_db_row',
    chains: {
      torso: ['hip', 'shoulder'], neck: ['shoulder', 'head'], head: 'head',
      nearArm: ['shoulder', 'elbow', 'hand'], farArm: ['farShoulder', 'farElbow', 'farHand'],
      nearLeg: ['hip', 'knee', 'ankle'], nearFoot: ['heel', 'toe'],
      farLeg: ['farHip', 'farKnee', 'farAnkle'], farFoot: ['farHeel', 'farToe'],
    },
    formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 120, 60),
  };
})();

/**
 * single_arm_cable_row (2026-08-25) — the seated cable row's own builder, one arm. The card's
 * cue "let the shoulder travel forward" IS the builder's hinged lean: start leaned toward the
 * stack (the reach), finish pulled tall — the same numbers the two-arm cable row uses, with the
 * V-grip swapped for the single D-handle.
 */
export const singleArmCableRow = seatedRow({
  id: 'single_arm_cable_row',
  singleArm: true,
  handleY: 141,
  endX: 149, // to the waist, and touching it — see `cable_row` for the same correction

  endLabel: 'pull to your waist',
  station: seatedRowStation,
  grip: 'machine',
  // 10 → −4, not 14 → −4: the 18° swing out-swung the two-arm row (15°) and taught body English;
  // the card's "let the shoulder travel forward" is scapular protraction, undrawable while the
  // girdle is shared, and this 14° lean stands in for it (audit, 2026-09-03)
  lean: { start: 10, end: -4 },
  legs: { knee: { x: 197, y: 149 }, ankle: { x: 219, y: 174 }, heel: { x: 214, y: 181 }, toe: { x: 231, y: 186 } },
  shadow: { cx: 175, rx: 52 },
});

/*
 * face_pull (restaged in three dimensions, 2026-08-29)
 *
 * WHAT WAS WRONG. This movement is almost entirely a DEPTH movement: the hands travel about 60 cm
 * toward the athlete's own face and the elbows finish behind the plane of his torso. Drawn flat,
 * none of that is travel — so the old rig hand-authored two "foreshortened stubs" for the reach (an
 * elbow 20u out at y 59, a fist 8u out at y 52) and hoped the eye would read a shortened arm rather
 * than a short one. Measured, the upper arm swung 75 % of its own length across the rep, which is
 * the auditor's signature for a bone not living in the plane it is drawn in. And the station this
 * exercise is named after — mast, carriage, pulley, stack — stood on the athlete's own centre line,
 * so the body erased all of it: a cable exercise with no visible cable machine (§3.5 Am. 5).
 *
 * WHAT IT IS NOW. The arm is authored in three dimensions and solved with `twoBoneIK3`, so both
 * bones are canonical at every rom and the foreshortening is COMPUTED rather than guessed. The
 * camera then steps 35° round the athlete, which is the single move that converts that depth into
 * visible travel — the hand's drawn path roughly doubles — and swings the whole column clear of the
 * body at the same time. The finish is the goalpost the cue asks for: elbows at shoulder height and
 * BACK past the torso (positive z, toward the camera), forearms up, elbow ~83° as drawn.
 *
 * The attachment is modelled honestly too. One CARABINER rides the cable and the rope's two halves
 * run from it to the fists at a fixed 40u each, so the rope is a rigid object rather than two
 * strands that happen to meet at a pulley — and the stack rises by the CARABINER's travel, which is
 * what a real payout is. The flat version summed both hand distances and lifted twice as fast.
 */
export const facePull: Rig = (() => {
  const CX = 176;
  const core = standingFrontCore(CX);
  /*
   * 42°, and the number was measured rather than chosen. Two things fight over this azimuth and
   * they pull opposite ways. The REACH points almost straight down the depth axis, so it wants a
   * big angle to get its length back — at 25° the extended arm draws 11u of upper arm and reads as
   * folded, not as reaching. The GOALPOST points out to the side, so it wants a small one, and the
   * far arm there is worse than a shortening: its lateral and its rearward components cancel in
   * projection and it can vanish entirely. Sweeping the eight numbers that matter — two arms, two
   * bones, two ends — the worst of them peaks at 42°, where nothing in the clip is ever drawn
   * shorter than 14u and every elbow stays above 70°.
   */
  const CAM: Camera = { azimuth: 46, pivotX: CX };
  const P3 = (q: Vec3): Vec2 => {
    const r = project({ x: q.x, y: q.y }, q.z, CAM);
    return { x: r.x, y: r.y };
  };

  const SH: Vec3 = { x: core.shoulderR.x, y: core.shoulderR.y, z: 0 };

  /*
   * THE ARM IS TWO BONE DIRECTIONS, SLERPED — not a hand path with an elbow solved under it.
   *
   * The hand-path version of this rig is instructive about why. Its two endpoints are 107° apart as
   * seen from the shoulder, and every way of joining them is wrong in a different way: a straight
   * chord passes 21u from the shoulder, closer than the finish, so the elbow CLOSES to 52° in the
   * middle and reopens — a shrug; and a great-circle slerp of the hand's direction arcs the fist up
   * to y 33, a foot over the athlete's own crown, because both endpoints contribute their upward
   * component at once. Interpolating the BONES instead cannot do either. Each direction turns at a
   * constant rate about its own joint — which is what a shoulder and an elbow actually do — and
   * both bones are exactly canonical at every frame by construction, with no solve to get wrong.
   *
   * Offsets are written as they read: how far out, how far up, how far back.
   */
  const norm = (q: Vec3): Vec3 => {
    const d = Math.hypot(q.x, q.y, q.z) || 1;
    return { x: q.x / d, y: q.y / d, z: q.z / d };
  };
  // rom 0 — the reach: arms long down the cable, elbow 159°, fists meeting on the rope
  const UPPER_0 = norm({ x: -4.9, y: -3.0, z: -24.75 });
  const FORE_0 = norm({ x: -4.9, y: -10.2, z: -19.1 });
  // rom 1 — the goalpost: elbows wide at shoulder height, forearms up, fists at the forehead
  const UPPER_1 = norm({ x: 24.6, y: -1.5, z: 4.0 });
  const FORE_1 = norm({ x: -10.1, y: -21.5, z: 4.0 });

  /*
   * The inboard lean of the reach is split EVENLY between the two bones (4.9u each), and that is a
   * drawing decision with a number behind it. Both arms point down the depth axis there, so each
   * bone's lateral component ADDS to the projection on one side and SUBTRACTS on the other: load
   * the whole lean onto the upper arm and the far one draws 9.8u, load it onto the forearm and the
   * far forearm draws 11.6u. Halved, the worst-drawn bone in the whole rep is 13.2u.
   */

  const slerp3 = (u: Vec3, w: Vec3, t: number): Vec3 => {
    const dot = Math.min(1, Math.max(-1, u.x * w.x + u.y * w.y + u.z * w.z));
    const om = Math.acos(dot);
    if (om < 1e-4) return u;
    const s0 = Math.sin((1 - t) * om) / Math.sin(om);
    const s1 = Math.sin(t * om) / Math.sin(om);
    return { x: u.x * s0 + w.x * s1, y: u.y * s0 + w.y * s1, z: u.z * s0 + w.z * s1 };
  };

  /*
   * LEAD WITH THE ELBOWS — the card's own second cue, and the one thing a face pull is most often
   * done wrong. So the two bones do not run on the same clock: the upper arm is most of the way
   * round before the forearm has done half its turn, which is exactly what "the elbows go first"
   * looks like. Same endpoints either way; only the middle of the rep tells the difference.
   */
  const armAt = (rom: number): { elbow: Vec3; hand: Vec3 } => {
    const u = slerp3(UPPER_0, UPPER_1, Math.pow(rom, 0.72));
    const f = slerp3(FORE_0, FORE_1, Math.pow(rom, 1.35));
    const elbow: Vec3 = { x: SH.x + UPPER * u.x, y: SH.y + UPPER * u.y, z: SH.z + UPPER * u.z };
    return { elbow, hand: { x: elbow.x + FORE * f.x, y: elbow.y + FORE * f.y, z: elbow.z + FORE * f.z } };
  };
  const handAt = (rom: number): Vec3 => armAt(rom).hand;
  const HAND_0 = handAt(0);
  const HAND_1 = handAt(1);

  // the left arm is the right one mirrored in x about the athlete's own centre line
  const mirror = (q: Vec3): Vec3 => ({ x: 2 * CX - q.x, y: q.y, z: q.z });

  const poseAt = (rom: number): Pose => {
    const { elbow: elbowR, hand: handR } = armAt(rom);
    const handL = mirror(handR);
    const elbowL = mirror(elbowR);
    return {
      headR: 8,
      j: {
        ...core,
        elbowR: { x: elbowR.x, y: elbowR.y },
        handR: { x: handR.x, y: handR.y },
        elbowL: { x: elbowL.x, y: elbowL.y },
        handL: { x: handL.x, y: handL.y },
        bar: { x: handR.x, y: handR.y },
      },
      z: {
        elbowR: elbowR.z,
        handR: handR.z,
        elbowL: elbowL.z,
        handL: handL.z,
        bar: handR.z,
      },
    };
  };

  // ── the station, in the athlete's space ──────────────────────────────────────
  /*
   * The column stands 80u in front of the athlete (about 92 cm), which is not a staging preference:
   * the rope's two halves are 40u each, so the pulley has to be at least a rope-length from where
   * the fists meet at the reach, or the carabiner would have to sit BEYOND the pulley to keep the
   * rope rigid. 80 is that minimum plus a little air.
   */
  const STATION_Z = -80;
  /*
   * The pulley rides at the top of the frame — 167u above the floor, which at this scale is a 1.92 m
   * high pulley and about as high as a real one. It has to be up there for the cable to have any
   * SLOPE at all: with the pulley at head height the whole cable-and-rope run comes out within 6u
   * of horizontal across 92u of depth, and the clip draws a bar across the athlete's forehead
   * instead of a cable coming down to him.
   */
  const PULLEY: Vec3 = { x: CX, y: 31, z: STATION_Z }; // 27 drew the pulley 3u past the top edge (audit, 2026-09-03); the slope survives 4u
  const ROPE_HALF = 40;

  /*
   * The carabiner: the one point where the rope meets the cable. It sits on the plane of symmetry,
   * dropped from the fists' midpoint toward the pulley by exactly as much as keeps BOTH rope halves
   * at `ROPE_HALF` — so as the hands spread apart at the goalpost the V flattens and the carabiner
   * is drawn further out, which is why the stack keeps rising after the hands have stopped
   * travelling in depth.
   */
  const carabinerAt = (handR: Vec3): Vec3 => {
    const spread = Math.abs(handR.x - CX);
    const drop = Math.sqrt(Math.max(0, ROPE_HALF * ROPE_HALF - spread * spread));
    const dy = PULLEY.y - handR.y;
    const dz = PULLEY.z - handR.z;
    const d = Math.hypot(dy, dz) || 1;
    return { x: CX, y: handR.y + (dy / d) * drop, z: handR.z + (dz / d) * drop };
  };
  const payoutAt = (handR: Vec3): number => {
    const c = carabinerAt(handR);
    return Math.hypot(PULLEY.y - c.y, PULLEY.z - c.z);
  };
  const PAYOUT_REST = payoutAt(HAND_0);

  const decorAt = (rom: number): Decor => {
    const handR = handAt(rom);
    const handL = mirror(handR);
    const car = carabinerAt(handR);
    const carP = P3(car);
    const lift = Math.max(0, payoutAt(handR) - PAYOUT_REST);

    /* One rope half, split where it crosses the athlete's own plane: the part still out at the
       machine is drawn behind him, the part that has come back past his shoulders in front. A
       single strand in one layer is what made the old goalpost look like the rope ran through his
       head. */
    const strand = (hand: Vec3): { back: Primitive[]; front: Primitive[] } => {
      const W = 2.2;
      if (car.z >= 0 === hand.z >= 0) {
        const line: Primitive = { kind: 'line', a: carP, b: P3(hand), w: W, color: 'ink2' };
        return hand.z >= 0 ? { back: [], front: [line] } : { back: [line], front: [] };
      }
      const t = -car.z / (hand.z - car.z);
      const cross = P3({ x: lerp(car.x, hand.x, t), y: lerp(car.y, hand.y, t), z: 0 });
      return {
        back: [{ kind: 'line', a: carP, b: cross, w: W, color: 'ink2' }],
        front: [{ kind: 'line', a: cross, b: P3(hand), w: W, color: 'ink2' }],
      };
    };
    // the rope's rubber ball-end, just past the fist along its own strand — the attachment is a
    // word (§3.5 Am. 5): a ball-ended rope is what names this clip "face pull" at a glance
    const ball = (hand: Vec3): Primitive[] => {
      const dx = hand.x - car.x;
      const dy = hand.y - car.y;
      const dz = hand.z - car.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const past = P3({ x: hand.x + (dx / d) * 3.6, y: hand.y + (dy / d) * 3.6, z: hand.z + (dz / d) * 3.6 });
      return [
        { kind: 'circle', c: past, r: 2.7, fill: 'ink0' },
        { kind: 'circle', c: P3(hand), r: 2.5, fill: 'ink0' }, // the fist on the rope
      ];
    };

    const sR = strand(handR);
    const sL = strand(handL);
    const near = (hand: Vec3): Primitive[] => (hand.z >= 0 ? ball(hand) : []);
    const far3 = (hand: Vec3): Primitive[] => (hand.z >= 0 ? [] : ball(hand));

    return {
      back: [
        ...facePullStation({ cam: CAM, cx: CX, z: STATION_Z, pulley: PULLEY, carabiner: car, lift }),
        ...sR.back,
        ...sL.back,
        ...far3(handR),
        ...far3(handL),
        /* NO drawn range mark, and deliberately. Every other rig gets one, but this hand's sweep
           passes straight across the athlete's own face, so the ticks land on his forehead and read
           as debris — and the rope is already lying along the same path, saying the same thing. */
      ],
      front: [...sR.front, ...sL.front, ...near(handR), ...near(handL)],
    };
  };

  const ELBOW_1 = armAt(1).elbow;

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'contactX', a: 'handR', x: HAND_0.x, tol: 2, label: 'hands together on the rope' },
      { kind: 'contactY', a: 'handR', y: HAND_0.y, tol: 2, label: 'reaching at face height, toward the machine' },
    ],
    end: [
      { kind: 'contactY', a: 'elbowR', y: ELBOW_1.y, tol: 2.5, label: 'elbows flared at shoulder height — the goalpost' },
      { kind: 'jointBelow', a: 'shoulderR', b: 'elbowR', by: 1, label: 'elbows never below the shoulders at the finish' },
      { kind: 'contactX', a: 'handR', x: HAND_1.x, tol: 2, label: 'hands outside and above the elbows, palms forward' },
    ],
    path: { track: 'handR', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'shoulderR', tol: 0.5, label: 'shoulder is the arc pivot' },
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 3, label: 'torso tall (no layback)' },
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'hips fixed' },
      { kind: 'pointFixed', point: 'kneeR', tol: 0.5, label: 'knees soft, fixed' },
      { kind: 'pointFixed', point: 'head', tol: 0.5, label: 'head still — the rope comes to you' },
      { kind: 'angleNever', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return {
    id: 'face_pull',
    camera: CAM,
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
    // the orbit narrows the stance from 42u wide to 29u, and the contact shadow is a statement
    // about where the feet ARE — so it narrows with them
    scene: floorScene(FLOOR_Y, CX, 26),
  };
})();

/*
 * meadows_row (batch 2, 2026-08-26) — the t-bar's one-arm cousin: the athlete stands BESIDE the
 * landmine bar's loaded end and rows it with the outside hand, elbow driving high and back. The
 * t-bar's own grammar carries it — hinged torso with the same capped 10° of honest hip drive,
 * lever from the floor anchor, plates riding at the handle — at a much flatter hinge (25°: the
 * lift is taken low, which is where its stretch lives). The perpendicular stance is a depth fact
 * this camera folds away (the sumo rule); what the side view says truthfully is the flat hinge,
 * the long hang, the elbow's high-and-back drive, and the FREE HAND BRACED ON THE KNEE, which is
 * the setup every coach teaches and the far arm draws.
 */
export const meadowsRow: Rig = (() => {
  const HEEL: Vec2 = { x: 166, y: FLOOR_Y };
  const TOE: Vec2 = { x: 191, y: FLOOR_Y };
  const ANKLE: Vec2 = { x: 176, y: 186 };
  const KNEE: Vec2 = { x: 186, y: 150.5 };
  const HIP: Vec2 = { x: 171, y: 118 };
  const TORSO_HANG = 25; // a flat hinge — flatter than the t-bar's 45
  const TORSO_RISE = 8; // the same capped, honest hip-drive arc
  const DEG = Math.PI / 180;

  const torsoAt = (rom: number): number => (TORSO_HANG + TORSO_RISE * TORSO_LAGS(rom)) * DEG;
  const shoulderAt = (rom: number): Vec2 => {
    const th = torsoAt(rom);
    return { x: HIP.x + ATHLETE.torso * Math.cos(th), y: HIP.y - ATHLETE.torso * Math.sin(th) };
  };
  const SHOULDER0 = shoulderAt(0);
  const BAR_X = SHOULDER0.x;
  const HANG_Y = SHOULDER0.y + (UPPER + FORE) * 0.995;
  /*
   * ── RESTAGED THREE-QUARTER (execution pass, 2026-09-07) ─────────────────────────────────────
   * A Meadows row is done standing BESIDE the sleeve, perpendicular to the bar: the bar runs
   * ACROSS the athlete's plane, not along it. Side-on that bar projects to a point, and what the
   * clip drew instead was the t-bar's one-arm cousin with the bar between the legs — a landmine
   * row, which is a different exercise (the review's c12 finding). The camera now orbits 25° about
   * the vertical, and the bar is stated in depth: its anchor sits BAR_DEPTH behind the sleeve, the
   * plates ride inboard of the fist along it, and the athlete stands beside the whole thing — the
   * stance the card's first cue names.
   *
   * The rigid link is kept in three dimensions. The sleeve's arc about the anchor lies in the
   * plane the bar and the vertical share — perpendicular to the athlete — so in his own plane the
   * sleeve's path is a true vertical, and the arc shows as the fist drifting BAR_DEPTH − √(L²−dy²)
   * into depth as it rises (13.8u at the ribs). The arm is solved in three dimensions to that
   * hand so both bones stay canonical (twoBoneIK3, the sumo's own device).
   */
  const AZ = 25;
  const BAR_DEPTH = 150; // the sleeve to the landmine's floor anchor, along the bar — a 2.2 m bar less the loaded sleeve
  const ANCHOR_Y = 190;
  const BAR_LEN = Math.hypot(BAR_DEPTH, ANCHOR_Y - HANG_Y); // the link's true length, set at the hang (z 0)
  const RIB_Y = 115; // the plates finish beside the ribs — the elbow high and back
  const handAt = (rom: number): Vec2 => ({ x: BAR_X, y: lerp(HANG_Y, RIB_Y, rom) });
  /** How far the sleeve has come toward the anchor (into depth) at this height — the arc's own account. */
  const handZ = (y: number): number => -(BAR_DEPTH - Math.sqrt(Math.max(1, BAR_LEN * BAR_LEN - (ANCHOR_Y - y) ** 2)));
  const ANCHOR3: Vec3 = { x: BAR_X, y: ANCHOR_Y, z: -BAR_DEPTH };
  const CAM: Camera = { azimuth: AZ, pivotX: 176, axis: { x: 0, y: -1 } }; // about the VERTICAL: a hinged athlete's spine is no orbit axis
  /* The free hand braced on the knee — the setup's own tripod. */
  const BRACE: Vec2 = { x: KNEE.x - 2, y: KNEE.y - 5 };
  /* Clamped ONCE, against the rom where that shoulder is furthest from the pad — a per-frame clamp
     let the planted hand creep 0.52 as the torso rose, and `pointFixed` on it is what makes this a
     braced row rather than a free one. */
  const BRACE_GRIP: Vec2 = (() => {
    const far0 = far(shoulderAt(0), -7, 2);
    const far1 = far(shoulderAt(1), -7, 2);
    const pick =
      Math.hypot(far0.x - BRACE.x, far0.y - BRACE.y) >= Math.hypot(far1.x - BRACE.x, far1.y - BRACE.y) ? far0 : far1;
    return withinReach(pick, BRACE, (UPPER + FORE) * 0.99);
  })();

  const poseAt = (rom: number): Pose => {
    const th = torsoAt(rom);
    const shoulder = shoulderAt(rom);
    const head: Vec2 = {
      x: shoulder.x + ATHLETE.neck * Math.cos(th + 10 * DEG),
      y: shoulder.y - ATHLETE.neck * Math.sin(th + 10 * DEG),
    };
    const hand = handAt(rom);
    const hz = handZ(hand.y);
    /* The flat solution names the bend (elbow up and BACK past the trunk); the 3D solve keeps
       both bones canonical to a fist that has drifted into depth. */
    const flat = twoBoneIK(shoulder, hand, UPPER, FORE, 1);
    const e3 = twoBoneIK3({ x: shoulder.x, y: shoulder.y, z: 0 }, { x: hand.x, y: hand.y, z: hz }, UPPER, FORE, {
      x: flat.x - (shoulder.x + hand.x) / 2,
      y: flat.y - (shoulder.y + hand.y) / 2,
      z: 0,
    });
    const elbow: Vec2 = { x: e3.x, y: e3.y };
    /* The plates sit INBOARD of the fist along the bar — 12u toward the anchor. */
    const toAnchor = { x: 0, y: ANCHOR_Y - hand.y, z: -BAR_DEPTH - hz };
    const tl = Math.hypot(toAnchor.y, toAnchor.z) || 1;
    const plate3: Vec3 = { x: hand.x, y: hand.y + (toAnchor.y / tl) * 12, z: hz + (toAnchor.z / tl) * 12 };
    const farShoulder = far(shoulder, -7, 2);
    return {
      headR: 8,
      j: {
        head, shoulder, elbow, hand, hip: HIP, bar: hand,
        pivot: { x: ANCHOR3.x, y: ANCHOR3.y }, // the floor anchor, carried as a joint (with its depth) so the decor can draw the projected lever
        plate: { x: plate3.x, y: plate3.y },
        knee: twoBoneIKToward(HIP, ANKLE, ATHLETE.thigh, ATHLETE.shank, KNEE), ankle: ANKLE, heel: HEEL, toe: TOE,
        farShoulder,
        /* The bracing arm is SOLVED, not halved. A midpoint between shoulder and brace makes both
           bones half that gap — 27.8 and 24.2 against 25 and 23 — and the gap is not the arm. */
        farElbow: twoBoneIK(farShoulder, BRACE_GRIP, UPPER, FORE, 1),
        farHand: BRACE_GRIP,
        farHip: far(HIP, -7, 1), farKnee: far(twoBoneIKToward(HIP, ANKLE, ATHLETE.thigh, ATHLETE.shank, KNEE), -7, 1), farAnkle: far(ANKLE, -7, 1),
        farHeel: far(HEEL, -8), farToe: far(TOE, -8),
      },
      // the bar leaves the plane — and says so
      z: { hand: hz, bar: hz, elbow: e3.z, pivot: ANCHOR3.z, plate: plate3.z },
    };
  };

  /* The range statement stands beside the sleeve's path, in the athlete's plane, projected once. */
  const TICK_X = project({ x: BAR_X + 22, y: HANG_Y }, 0, CAM).x;
  const decorAt = (rom: number, pj?: Record<string, Vec2>): Decor => {
    const j = pj ?? poseAt(rom).j;
    const bar = j.bar;
    const anchor = j.pivot;
    const plate = j.plate;
    return {
      back: [
        ...leverBar(anchor, bar),
        /* the plates, deeper than the fist and drawn behind it */
        ...plateGhost(plate, 12),
        ...barPathTicks(TICK_X, HANG_Y, RIB_Y),
      ],
      front: [],
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [{ kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 165, max: 179, label: 'dead hang off the sleeve — the full stretch' }],
    end: [{ kind: 'contactY', a: 'bar', y: RIB_Y, tol: 2, label: 'plates to the ribs — elbow high and back' }],
    /* vertical, in the athlete's plane: the sleeve's arc about the anchor lies ACROSS that plane
       (see the restage note), so its projection here is a plumb line; the rigid link is held by
       construction in depth (BAR_LEN), which a two-dimensional spanFixed cannot read. */
    path: { track: 'bar', kind: 'vertical', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'pivot', tol: 0.01, label: 'the landmine pivot is bolted to the floor' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 10, label: 'controlled hip drive (≤10°, no body English)' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips fixed — the pivot' },
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees fixed' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'feet planted' },
      { kind: 'pointFixed', point: 'farHand', tol: 0.5, label: 'the free hand braces on the knee' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return { id: 'meadows_row', chains: rowChains, camera: CAM, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 176, 30) };
})();
