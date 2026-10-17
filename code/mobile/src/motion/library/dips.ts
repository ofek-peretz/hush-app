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
import { lags } from '../curves';
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
  /** Torso lean forward of vertical, degrees, at lockout and at the bottom — the chest dip's
   *  deliberate angle, and it GROWS through the descent (audit, 2026-09-03: held at one angle the
   *  shoulder could only drop plumb, and the bottom drew the upper arm 50° below horizontal). */
  leanTop: number;
  leanBottom: number;
  /** The elbow's interior angle at lockout and at the bottom — the heights are solved from them. */
  topAngle: number;
  bottomAngle: number;
  /** How far the shoulder drifts FORWARD of its lockout station by the bottom: the lean's own
   *  travel. A chest dip's shoulders go well past the grip; a machine-assisted one less. */
  forwardShift: number;
  assisted?: boolean;
  furniture: Primitive[];
  /** Drawn OVER the athlete — the near rail of a station he stands inside. */
  nearRail?: Primitive[];
}

/*
 * THE ELBOW LEADS ON THE WAY UP (audit, 2026-09-03 — iron rule 12). Two drivers, two clocks: the
 * elbow angle and the shoulder's forward drift. On the eccentric the lean goes first — "lean
 * slightly forward" IS the first thing that happens — and the elbow starts bending a fifth of the
 * rep later; on the concentric the elbow is locked out by rom 0.2 while the body is still coming
 * back over the bars. One clock drew a hinge; this draws a dip.
 */
const ELBOW_CLOCK = lags(0.2);

function barDip(p: BarDipParams): Rig {
  const leanAt = (rom: number) => (lerp(p.leanTop, p.leanBottom, rom) * Math.PI) / 180;
  /** The shoulder sits 4u behind the grip at lockout: the elbow-back branch needs the shoulder
   *  BEHIND the hand, or the forearm leans forward (audit, 2026-09-03). */
  const DX_TOP = -4;
  const shoulderAt = (rom: number): Vec2 => {
    const dx = lerp(DX_TOP, DX_TOP + p.forwardShift, rom);
    const deg = lerp(p.topAngle, p.bottomAngle, ELBOW_CLOCK(rom));
    return { x: p.hand.x + dx, y: p.hand.y - vGapFor(deg, dx) };
  };
  /* The range statement stands 28u behind the grip — off the trunk's silhouette. Under the
     shoulder it was drawn and never seen (hasTicks=false; audit, 2026-09-03). */
  const ARC = Array.from({ length: 17 }, (_, i) => ({ x: p.hand.x - 28, y: shoulderAt(i / 16).y }));

  const poseAt = (rom: number): Pose => {
    const shoulder = shoulderAt(rom);
    const leanRad = leanAt(rom);
    /* The trunk hangs at its lean; hips back-and-down of the shoulder. */
    const hip: Vec2 = {
      x: shoulder.x - ATHLETE.torso * Math.sin(leanRad) - 2,
      y: shoulder.y + ATHLETE.torso * Math.cos(leanRad),
    };
    /*
     * The legs are FOLDED, not hung (audit, 2026-09-03: a 153.9° knee read as a man hanging from a
     * bar). On the bars the knees bend to ~110° with the shins swept back; on the assisted station
     * the shins lie flat along the knee pad — a kneel, the one thing that says "assisted".
     */
    const knee: Vec2 = p.assisted
      ? { x: hip.x - 2, y: hip.y + ATHLETE.thigh * 0.95 }
      : { x: hip.x - 4, y: hip.y + ATHLETE.thigh * 0.9 };
    const ankle: Vec2 = p.assisted ? { x: knee.x - 36, y: knee.y + 2 } : { x: knee.x - 30, y: knee.y + 8 };
    /* The foot hangs plantar-flexed off the swept-back shin — toes down and back. */
    const heel: Vec2 = { x: ankle.x - 2, y: ankle.y + 4 };
    const toe: Vec2 = { x: ankle.x - 5, y: ankle.y + 13 };
    /* The head carries the lean plus 10° of its own — eyes ahead, not down the chest — at exactly a
       neck's length (the old +3u offset stretched it to 17.6 once the lean grew; audit, 2026-09-03). */
    const head: Vec2 = { x: shoulder.x + ATHLETE.neck * Math.sin(leanRad + 0.17), y: shoulder.y - ATHLETE.neck * Math.cos(leanRad + 0.17) };
    /* +1 sends the elbow BACK (−x; the athlete faces +x). −1 folded it forward of the shoulder —
       20u ahead at the bottom, a press on a bar in front, not a dip (audit, 2026-09-03). */
    const elbow = twoBoneIK(shoulder, p.hand, U, F, 1);
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip,
        knee,
        ankle,
        heel,
        toe,
        elbow,
        hand: p.hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(p.hand, -6, 1),
        farHip: far(hip, -6, 1),
        farKnee: far(knee, -6, 1),
        farAnkle: far(ankle, -6, 1),
        farHeel: far(heel, -6, 0),
        farToe: far(toe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const back: Primitive[] = [...p.furniture, ...sampledPathTicks(ARC)];
    if (p.assisted) {
      const knee = pose.j.knee;
      /* The knee pad lies UNDER the shin, ankle to just past the knee, so the shin (knee.y+2) rests
         on its top face. It used to sit 8u ahead of the shin and touched nothing (audit,
         2026-09-03). Its arm runs forward to the tower it hangs from. */
      back.push(
        ...padStroke({ x: knee.x - 34, y: knee.y + 7 }, { x: knee.x + 5, y: knee.y + 7 }, 8),
        { kind: 'line', a: { x: knee.x + 7, y: knee.y + 7 }, b: { x: p.hand.x + 34, y: knee.y + 7 }, w: 2.5, color: 'ink3' },
      );
      /* The counterweight RISES as the platform — and the athlete on it — goes down: the pad
         hangs from the stack. It used to rise at the top and rest at the bottom (audit, 2026-09-03). */
      const risen = (pose.j.shoulder.y - shoulderAt(0).y) * 0.4;
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
    /* An arc, not a vertical: the shoulder drifts `forwardShift` forward as it drops — the lean's
       own travel, which a vertical rail forbade (audit, 2026-09-03). */
    path: { track: 'shoulder', kind: 'arc', tol: 2 },
    invariants: [
      { kind: 'pointFixed', point: 'hand', tol: 0.5, label: 'the grip does not move — the body does' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension at lockout' },
    ],
  };
  /* The lean GROWS into the bottom — the shoulders end forward of the grip. `segmentAngleFixed`
     (±3°) asserted the opposite and pinned the plumb drop (audit, 2026-09-03). */
  formspec.end.push({ kind: 'jointRightOf', a: 'shoulder', b: 'hand', by: p.forwardShift - 5, label: 'shoulders forward of the grip — the lean, arrived' });

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
const DIP_BAR: Vec2 = { x: 176, y: 105 }; // 100 put the crown 0.5u past the top edge at the lockout (audit, 2026-09-03); 105 once the arm grew to 27/25 (2026-09-07)
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
  leanTop: 12, // "lean slightly forward" — authored, not accidental…
  leanBottom: 28, // …and deepening into the stretch (audit, 2026-09-03)
  topAngle: 168, // lockout: interior 168° by construction
  bottomAngle: 82, // the stretch: elbows square, shoulders sunk toward the grip
  forwardShift: 18, // shoulders 14u past the grip at the bottom: upper arm ~17° below level, forearm ~25° off plumb (audit, 2026-09-03)
  furniture: DIP_FURNITURE,
  nearRail: DIP_NEAR_RAIL,
});

export const assistedDipRig = barDip({
  id: 'assisted_dip',
  hand: DIP_BAR,
  leanTop: 6,
  leanBottom: 16, // kneeling on the platform the body travels nearer to plumb (audit, 2026-09-03)
  topAngle: 168,
  bottomAngle: 82,
  forwardShift: 12,
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
      /* The bench's edge 4u in front of the hands — "hands on the bench EDGE" drawn, not 12u in
         from it (audit, 2026-09-03). */
      { kind: 'rect', x: BD_HAND.x - 4, y: BD_BENCH_TOP, width: 44, height: 7, rx: 3, fill: 'paper3', stroke: 'ink3', w: 2 },
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
  /*
   * THE LEVER IS RIGID (the T-bar's law; audit, 2026-09-03: on a straight vertical rail it grew
   * 45→62u across the rep). The pivot stands in front of the chest, the arm reaches back to the
   * handle beside the ribs, and the handle rides the circle about that pivot — down and a little
   * forward, the way a seated-dip arm swings. Both endpoint elbow angles are solved ON the circle.
   */
  const PIVOT: Vec2 = { x: SHOULDER.x + 70, y: SHOULDER.y + 10 }; // its post stands clear of the toes (222) at 228
  /* The start: the handle 4u forward of the shoulder, beside the ribs — not 14u out in front,
     which drew a pushdown with the upper arm level (audit, 2026-09-03). */
  const START_HAND: Vec2 = { x: SHOULDER.x + 4, y: SHOULDER.y + vGapFor(82, 4) };
  const LEVER = Math.hypot(START_HAND.x - PIVOT.x, START_HAND.y - PIVOT.y);
  const handOn = (theta: number): Vec2 => ({ x: PIVOT.x + LEVER * Math.cos(theta), y: PIVOT.y + LEVER * Math.sin(theta) });
  const THETA_TOP = Math.atan2(START_HAND.y - PIVOT.y, START_HAND.x - PIVOT.x);
  /** Where on the circle the arm reaches 168° — bisected between the start and the circle's
   *  lowest point (θ = 90°), along which the shoulder→handle distance grows monotonically. */
  const THETA_BOT = (() => {
    const target = reachAt(168);
    let lo = Math.PI / 2;
    let hi = THETA_TOP;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const h = handOn(mid);
      if (Math.hypot(h.x - SHOULDER.x, h.y - SHOULDER.y) > target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  })();
  const handAt = (rom: number): Vec2 => handOn(lerp(THETA_TOP, THETA_BOT, rom));
  /* The range statement 32u behind the handle path: under the hand it lay across the trunk and
     the near thigh and was never seen (audit, 2026-09-03). */
  const ARC = Array.from({ length: 17 }, (_, i) => ({ x: handAt(i / 16).x - 32, y: handAt(i / 16).y }));

  const poseAt = (rom: number): Pose => {
    const hand = handAt(rom);
    /* +1: the elbow drives BACK behind the ribs — a dip. −1 put it 24u in front of the shoulder
       at the start, a chest press (audit, 2026-09-03). */
    const elbow = twoBoneIK(SHOULDER, hand, U, F, 1);
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
        /* the pivot on its post, and the rigid arm to the handle */
        { kind: 'line', a: PIVOT, b: { x: PIVOT.x, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
        { kind: 'circle', c: PIVOT, r: 3.4, fill: 'paper2', stroke: 'ink3', w: 2 },
        { kind: 'line', a: PIVOT, b: pose.j.hand, w: 2.5, color: 'ink3' },
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
    path: { track: 'hand', kind: 'arc', tol: 1.5 },
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
