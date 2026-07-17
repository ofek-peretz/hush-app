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
import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, dumbbellEnd, flatBench, floorScene, leverBar, linePathTicks, plateGhost } from '../kit';
import { facePullStation, machineRowStation, seatedRowStation } from '../machines';
import { far, FLOOR_Y, standingFrontCore } from '../bodies';

const UPPER = ATHLETE.upperArm;
const FORE = ATHLETE.foreArm;

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
  const HIP: Vec2 = { x: 157, y: 113.5 };
  const TORSO_HANG = 45; // deg above horizontal at the dead hang
  const TORSO_RISE = 8; // the authored hip-drive arc
  const DEG = Math.PI / 180;

  const shoulderAt = (rom: number): Vec2 => {
    const th = (TORSO_HANG + TORSO_RISE * rom) * DEG;
    return { x: HIP.x + ATHLETE.torso * Math.cos(th), y: HIP.y - ATHLETE.torso * Math.sin(th) };
  };
  const SHOULDER0 = shoulderAt(0);
  const BAR_X = SHOULDER0.x;
  const HANG_Y = SHOULDER0.y + (UPPER + FORE) * 0.995;
  const CHEST_Y = 94; // t-bar contacts higher than the bb_row — the chest pad line
  const ANCHOR: Vec2 = { x: 46, y: 190 };

  const poseAt = (rom: number): Pose => {
    const th = (TORSO_HANG + TORSO_RISE * rom) * DEG;
    const shoulder = shoulderAt(rom);
    // the head rides the spine, biased upright (neutral neck, eyes forward-down)
    const head: Vec2 = {
      x: shoulder.x + ATHLETE.neck * Math.cos(th + 10 * DEG),
      y: shoulder.y - ATHLETE.neck * Math.sin(th + 10 * DEG),
    };
    const hand: Vec2 = { x: BAR_X, y: lerp(HANG_Y, CHEST_Y, rom) };
    const elbow = twoBoneIK(shoulder, hand, UPPER, FORE, 1);
    return {
      headR: 8,
      j: {
        head, shoulder, elbow, hand, hip: HIP, bar: hand,
        knee: KNEE, ankle: ANKLE, heel: HEEL, toe: TOE,
        farShoulder: far(shoulder, -7, 2), farElbow: far(elbow, -7, 2), farHand: far(hand, -7, 2),
        farHip: far(HIP, -7, 1), farKnee: far(KNEE, -7, 1), farAnkle: far(ANKLE, -8),
        farHeel: far(HEEL, -8), farToe: far(TOE, -8),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const bar: Vec2 = { x: BAR_X, y: lerp(HANG_Y, CHEST_Y, rom) };
    return {
      // the shaft draws in the BAR voice (§3.5): floor anchor → hinge pin → solid lever
      back: [...leverBar(ANCHOR, bar), ...barPathTicks(BAR_X, HANG_Y, CHEST_Y)],
      front: plateGhost(bar, 12), // t-bar plates ride close to the handle
    };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [{ kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 165, max: 179, label: 'dead hang — arms long' }],
    end: [{ kind: 'contactY', a: 'bar', y: CHEST_Y, tol: 2, label: 'handle to the chest' }],
    path: { track: 'bar', kind: 'vertical', tol: 1.5 },
    invariants: [
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
  const SUPPORT_HAND: Vec2 = { x: 136, y: 158 }; // planted on the pad
  const HANG_Y = SHOULDER.y + (UPPER + FORE) * 0.995;
  const WAIST_Y = 131; // dumbbell meets the torso's underside at the waistline

  const poseAt = (rom: number): Pose => {
    const hand: Vec2 = { x: SHOULDER.x, y: lerp(HANG_Y, WAIST_Y, rom) };
    // mirrored figure → mirrored bend: −1 drives the elbow up-and-back toward the hip
    const elbow = twoBoneIK(SHOULDER, hand, UPPER, FORE, -1);
    const farShoulder = far(SHOULDER, 6, 2);
    const farElbow = twoBoneIK(farShoulder, SUPPORT_HAND, UPPER, FORE, 1);
    return {
      headR: 8,
      j: {
        head: HEAD, shoulder: SHOULDER, elbow, hand, hip: HIP, bar: hand,
        knee: KNEE, ankle: ANKLE, heel: HEEL, toe: TOE,
        farShoulder, farElbow, farHand: SUPPORT_HAND,
        farHip: far(HIP, 5, 1), farKnee: FAR_KNEE, farAnkle: FAR_ANKLE,
      },
    };
  };

  const bench = flatBench(114, 258, 160, FLOOR_Y);

  const decorAt = (rom: number): Decor => {
    const db: Vec2 = { x: SHOULDER.x, y: lerp(HANG_Y, WAIST_Y, rom) };
    return {
      back: [...bench, ...barPathTicks(SHOULDER.x, HANG_Y, WAIST_Y)],
      front: dumbbellEnd(db),
    };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [{ kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 165, max: 179, label: 'dead hang — arm long' }],
    end: [{ kind: 'contactY', a: 'bar', y: WAIST_Y, tol: 2, label: 'dumbbell to the waistline' }],
    path: { track: 'bar', kind: 'vertical', tol: 1.5 },
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
}

function seatedRow(p: SeatedRowParams): Rig {
  const HIP: Vec2 = { x: 141, y: 157 };
  const DEG = Math.PI / 180;
  const hinged = p.lean.start !== p.lean.end;

  const shoulderAt = (rom: number): Vec2 => {
    const th = lerp(p.lean.start, p.lean.end, rom) * DEG;
    return { x: HIP.x + ATHLETE.torso * Math.sin(th), y: HIP.y - ATHLETE.torso * Math.cos(th) };
  };
  const SHOULDER0 = shoulderAt(0);
  const startX = SHOULDER0.x + Math.sqrt(((UPPER + FORE) * 0.995) ** 2 - (p.handleY - SHOULDER0.y) ** 2);

  const poseAt = (rom: number): Pose => {
    const th = lerp(p.lean.start, p.lean.end, rom) * DEG;
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
        knee: p.legs.knee, ankle: p.legs.ankle, heel: p.legs.heel, toe: p.legs.toe,
        farShoulder: far(shoulder, 7, 2), farElbow: far(elbow, 7, 2), farHand: far(hand, 7, 2),
        farHip: far(HIP, 7, 1), farKnee: far(p.legs.knee, 7), farAnkle: far(p.legs.ankle, 8),
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
    tempo: DEFAULT_TEMPO,
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
  handleY: 132,
  endX: 158,
  endLabel: 'handle to the waist',
  lean: { start: 9, end: -6 }, // reach into the stretch, finish slightly tall-back — no pad
  station: seatedRowStation,
  grip: 'v',
  legs: { knee: { x: 181, y: 166 }, ankle: { x: 214, y: 178 }, heel: { x: 217, y: 184 }, toe: { x: 231, y: 171 } },
  shadow: { cx: 178, rx: 62 },
});

export const machineRow = seatedRow({
  id: 'machine_row',
  handleY: 118,
  endX: 168,
  endLabel: 'handle back, elbows past the torso',
  lean: { start: 4, end: 4 }, // braced into the chest pad — the torso does not move
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
export const facePull: Rig = (() => {
  const CX = 176;
  const core = standingFrontCore(CX);
  const DEG = Math.PI / 180;
  // STAGING (§3.5 Amendment 4): the athlete FACES the station and the camera stands behind them —
  // the frontal figure is unchanged (the head has no features), and the complete cable column
  // draws in the far plane: mast, height carriage, high pulley above the head, rope V to the
  // fists, stack visible where the legs honestly do not occlude it.
  // The FINISH is fully in-plane (the goalpost): upper arm 85° from vertical — elbows flared at
  // shoulder height — forearm near-vertical, hands beside the head. Derived from real lengths.
  const E1: Vec2 = { x: core.shoulderR.x + UPPER * Math.sin(85 * DEG), y: core.shoulderR.y - UPPER * Math.cos(85 * DEG) };
  const H1: Vec2 = { x: E1.x - FORE * Math.sin(12 * DEG), y: E1.y - FORE * Math.cos(12 * DEG) };
  // The START reaches TOWARD THE CAMERA: both arm segments are foreshortened by honest
  // projection (documented license, like the seated-front thighs and the bench humerus) —
  // fists together on the rope at face height, elbow stubs just below-outside. Segment length
  // grows back to canonical as the arm rotates into the frontal plane across the pull.
  const E0: Vec2 = { x: CX + 20, y: 59 };
  const H0: Vec2 = { x: CX + 8, y: 52.5 };

  const armAt = (rom: number, side: 1 | -1): { elbow: Vec2; hand: Vec2 } => ({
    elbow: { x: CX + side * (lerp(E0.x, E1.x, rom) - CX), y: lerp(E0.y, E1.y, rom) },
    hand: { x: CX + side * (lerp(H0.x, H1.x, rom) - CX), y: lerp(H0.y, H1.y, rom) },
  });
  const HAND0 = H0;
  const HAND1 = H1;
  const ELBOW1 = E1;

  const poseAt = (rom: number): Pose => {
    const R = armAt(rom, 1);
    const L = armAt(rom, -1);
    return {
      headR: 8,
      j: {
        ...core,
        elbowR: R.elbow,
        handR: R.hand,
        elbowL: L.elbow,
        handL: L.hand,
        bar: R.hand,
      },
    };
  };

  const REST_R: Vec2 = HAND0;
  const REST_L: Vec2 = { x: CX - (HAND0.x - CX), y: HAND0.y };

  const PULLEY: Vec2 = { x: CX, y: 31 }; // must match facePullStation's high pulley
  // the rope's rubber ball-end, just past the fist along the strand — the attachment is a word
  // (§3.5 Am. 5): the ball-ended rope is what names a cable exercise "face pull" at a glance
  const ballEnd = (hand: Vec2): Primitive[] => {
    const d = Math.hypot(hand.x - PULLEY.x, hand.y - PULLEY.y) || 1;
    const u = { x: (hand.x - PULLEY.x) / d, y: (hand.y - PULLEY.y) / d };
    return [
      { kind: 'circle', c: { x: hand.x + u.x * 3.6, y: hand.y + u.y * 3.6 }, r: 2.7, fill: 'ink0' },
      { kind: 'circle', c: hand, r: 2.5, fill: 'ink0' }, // the fist on the rope
    ];
  };

  const decorAt = (rom: number): Decor => {
    const R = armAt(rom, 1);
    const L = armAt(rom, -1);
    return {
      back: [
        ...facePullStation(CX, R.hand, L.hand, REST_R, REST_L), // the station the athlete faces
        ...linePathTicks(HAND0, HAND1), // range chord of the right hand's sweep
      ],
      front: [...ballEnd(R.hand), ...ballEnd(L.hand)],
    };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'contactX', a: 'handR', x: HAND0.x, tol: 2, label: 'hands together on the rope' },
      { kind: 'contactY', a: 'handR', y: HAND0.y, tol: 2, label: 'reaching at face height, toward the machine' },
    ],
    end: [
      { kind: 'contactY', a: 'elbowR', y: ELBOW1.y, tol: 2.5, label: 'elbows flared at shoulder height — the goalpost' },
      { kind: 'jointBelow', a: 'shoulderR', b: 'elbowR', by: 1, label: 'elbows never below the shoulders at the finish' },
      { kind: 'contactX', a: 'handR', x: HAND1.x, tol: 2, label: 'hands beside the head, palms forward' },
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
    scene: floorScene(FLOOR_Y, CX, 34),
  };
})();
