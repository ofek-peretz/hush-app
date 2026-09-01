/**
 * The two LONG-ARM sweeps (2026-08-25) — lifts whose whole point is that the elbow does NOT bend:
 * a rigid soft-elbowed arm rotating about the shoulder, with the resistance riding the far end.
 * The lateral raise's construction, third and fourth appearances, at two new stations.
 *
 * ── straight_arm_pulldown ───────────────────────────────────────────────────────────────────────
 * Standing at the high cable, arms long, sweeping the bar from eye height down to the thighs —
 * the lat's own arc with the triceps locked out of it. "Soft elbows, arms long" is the same
 * fixed-bend construction as every raise; the fault this lift polices is BENDING the arm to make
 * it a pushdown, and a rigid arm cannot. High pulley in front; the stack rises through the sweep.
 *
 * ── landmine_press ──────────────────────────────────────────────────────────────────────────────
 * The bar's tail is anchored to the floor pivot behind, so the HAND's true path is the arc the
 * bar's length allows about that anchor — "press up and slightly across" is the arc's own shape,
 * not a cue we aim for. The pressing arm folds and extends (this one DOES bend — it is a press);
 * what makes it a landmine is the PATH, which is drawn from the anchor's geometry: the hand rides
 * the circle about the anchor, the elbow is solved by IK, and the bar is the visible radius.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { cable, dumbbellSide, flatBench, floorScene, plateGhost, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far, standingCore } from '../bodies';

const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;

/* ── straight_arm_pulldown ─────────────────────────────────────────────────────────────────────── */

export const straightArmPulldown: Rig = (() => {
  const X = 162;
  const core = standingCore(X);
  const REACH_E = U * 0.97;
  const REACH_H = (U + F) * 0.96;
  const BEND = 3.6;
  /** θ from straight-down, the arm sweeping FORWARD-UP: ~86° (bar at eye line) down to ~10°. */
  const THETA_FROM = 86;
  const THETA_TO = 10;
  const PULLEY: Vec2 = { x: X + 78, y: 32 };

  const armAt = (theta: number): { elbow: Vec2; hand: Vec2 } => {
    const r = (theta * Math.PI) / 180;
    const s = core.shoulder;
    const ux = Math.sin(r);
    const uy = Math.cos(r);
    const px = Math.cos(r);
    const py = -Math.sin(r);
    return {
      elbow: { x: s.x + REACH_E * ux - BEND * px, y: s.y + REACH_E * uy - BEND * py },
      hand: { x: s.x + REACH_H * ux, y: s.y + REACH_H * uy },
    };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => armAt(lerp(THETA_FROM, THETA_TO, i / 16)).hand);

  const poseAt = (rom: number): Pose => {
    const { elbow, hand } = armAt(lerp(THETA_FROM, THETA_TO, rom));
    return {
      headR: ATHLETE.headR,
      j: {
        head: core.head,
        shoulder: core.shoulder,
        hip: core.hip,
        knee: core.knee,
        ankle: core.ankle,
        heel: core.heel,
        toe: core.toe,
        elbow,
        hand,
        farShoulder: far(core.shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(core.hip, -6, 1),
        farKnee: far(core.knee, -6, 1),
        farAnkle: far(core.ankle, -6, 1),
        farHeel: far(core.heel, -6, 0),
        farToe: far(core.toe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const risen = rom * 20;
    const tower = stackTower({ x0: PULLEY.x + 6, x1: PULLEY.x + 32, capY: 26, stackTopY: FLOOR_Y - 34 }, risen);
    return {
      back: [...sampledPathTicks(ARC), ...tower.prims, ...pulley(PULLEY)],
      front: [
        cable(PULLEY, pose.j.hand),
        { kind: 'line', a: { x: pose.j.hand.x - 7, y: pose.j.hand.y }, b: { x: pose.j.hand.x + 7, y: pose.j.hand.y }, w: 3.5, color: 'ink0', cap: 'round' },
      ],
    };
  };

  const softElbow = (label: string) => ({
    kind: 'jointAngle' as const,
    joint: 'elbow',
    neighbors: ['shoulder', 'hand'] as [string, string],
    min: 150,
    max: 172,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      softElbow('arms long at the top — this is not a pushdown'),
      { kind: 'contactY', a: 'hand', y: armAt(THETA_FROM).hand.y, tol: 2.5, label: 'the bar at eye height' },
    ],
    end: [
      softElbow('and still long at the thighs'),
      { kind: 'contactY', a: 'hand', y: armAt(THETA_TO).hand.y, tol: 2.5, label: 'swept to the thighs' },
    ],
    path: { track: 'hand', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'the shoulder is the hinge' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 4, label: 'no bowing into the sweep' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips still' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 174, label: 'the elbow stays soft, never locked' },
    ],
  };

  return {
    id: 'straight_arm_pulldown',
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
    scene: floorScene(FLOOR_Y, X, 30),
  };
})();

/* ── landmine_press ────────────────────────────────────────────────────────────────────────────── */

export const landminePress: Rig = (() => {
  /*
   * 168, and the athlete moved 18u to get there. Where she stands is not composition here: with a
   * floor-anchored bar, her distance from the anchor is what decides whether the rack sits before
   * or after the arc's turning point — see `TURN_A` — and therefore whether the press presses.
   */
  const X = 168;
  const core = standingCore(X);
  /** The floor anchor, well out in front of her and down at the plate. */
  const ANCHOR: Vec2 = { x: 42, y: FLOOR_Y - 4 };

  /*
   * THE RACK — the bar's end held at the front of the shoulder, ON THE ANCHOR'S SIDE OF IT.
   *
   * That last clause is the whole fix, and the bug it replaces is worth keeping. The hand rides a
   * circle about the anchor; the shoulder is off that circle by some distance; so the circle has a
   * single point of CLOSEST APPROACH to the shoulder, on the ray from the anchor through it. Every
   * frame of the rep has to sit on one side of that point, because the hand's distance from the
   * shoulder — and therefore the elbow angle — turns around there.
   *
   * The rack used to be authored at `shoulder + (17, 8)`: BEHIND the shoulder, 6° short of the
   * turning point. So the first third of the press ran the hand TOWARD her shoulder and the elbow
   * CLOSED — 46° → 14° → 165° across the rep, an arm that folds to nothing before it presses.
   * Neither validator could see it: both bones are canonical the whole way, no joint teleports,
   * and the FormSpec only ever looks at rom 0 and rom 1, which are both fine.
   *
   * Racked in FRONT of the shoulder the rack sits PAST the turning point, and the reach — with the
   * elbow riding on it — only ever opens. Which is what pressing is.
   */
  /** The bar's end racked at the FRONT of the shoulder, and a shade below it. */
  const RACK: Vec2 = { x: core.shoulder.x - 16, y: core.shoulder.y + 4.5 };
  const BAR_LEN = Math.hypot(RACK.x - ANCHOR.x, RACK.y - ANCHOR.y);
  const rackAngle = Math.atan2(ANCHOR.y - RACK.y, RACK.x - ANCHOR.x);
  /**
   * THE TURNING POINT — the ray from the anchor through her shoulder, where the hand's distance
   * from the shoulder stops falling and starts rising.
   *
   * The rack has to sit PAST it, and at X = 168 with the bar racked in front of the shoulder it
   * does: 47.8° against a turn at 45.0°. Racked BEHIND the shoulder, as it used to be, it sat 6°
   * short of the turn — so the first third of the press ran the hand toward her own shoulder and
   * the elbow CLOSED, 46° → 14° → 165° across the rep. Neither validator could see it: both bones
   * are canonical throughout, no joint teleports, and the FormSpec only reads rom 0 and rom 1,
   * which are both correct. It took measuring the drawn hinge THROUGH the rep.
   */
  const TURN_A = Math.atan2(ANCHOR.y - core.shoulder.y, core.shoulder.x - ANCHOR.x);
  /** Reach from the shoulder at lockout, from the ELBOW ANGLE rather than from a guess. */
  const LOCK_REACH = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos((165 * Math.PI) / 180));
  const handOnArc = (t: number): Vec2 => ({
    x: ANCHOR.x + BAR_LEN * Math.cos(t),
    y: ANCHOR.y - BAR_LEN * Math.sin(t),
  });
  /* Lockout: climb from the rack — strictly away from the turning point — until the hand is a
     pressed arm's length from the shoulder, so the reach and the elbow with it only ever open. */
  const lockAngle = (() => {
    const from = Math.max(rackAngle, TURN_A);
    let best = from;
    let bestErr = Infinity;
    for (let t = from; t < from + 1.4; t += 0.002) {
      const h = handOnArc(t);
      const err = Math.abs(Math.hypot(h.x - core.shoulder.x, h.y - core.shoulder.y) - LOCK_REACH);
      if (err < bestErr) {
        bestErr = err;
        best = t;
      }
    }
    return best;
  })();

  const handAt = (rom: number): Vec2 => handOnArc(lerp(rackAngle, lockAngle, rom));
  const ARC = Array.from({ length: 17 }, (_, i) => handAt(i / 16));

  const poseAt = (rom: number): Pose => {
    const hand = handAt(rom);
    // bend -1 — the elbow hangs DOWN and forward under the racked bar and swings up as she
    // presses. +1 put it above and behind her own ear for the whole rep.
    const elbow = twoBoneIK(core.shoulder, hand, U, F, -1);
    return {
      headR: ATHLETE.headR,
      j: {
        head: core.head,
        shoulder: core.shoulder,
        hip: core.hip,
        knee: core.knee,
        ankle: core.ankle,
        heel: core.heel,
        toe: core.toe,
        elbow,
        hand,
        farShoulder: far(core.shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(core.hip, -6, 1),
        farKnee: far(core.knee, -6, 1),
        farAnkle: far(core.ankle, -6, 1),
        farHeel: far(core.heel, -6, 0),
        farToe: far(core.toe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const hand = handAt(rom);
    const back: Primitive[] = [
      ...sampledPathTicks(ARC),
      /* The anchor's hinge block on the floor — the landmine itself. */
      { kind: 'rect', x: ANCHOR.x - 8, y: ANCHOR.y - 4, width: 16, height: 8, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
      { kind: 'circle', c: ANCHOR, r: 3.2, fill: 'paper2', stroke: 'ink3', w: 2 },
    ];
    return {
      back,
      front: [
        /* The bar, the visible radius: anchor → past the hand a shade, with the plate near the anchor. */
        { kind: 'line', a: ANCHOR, b: { x: hand.x + (hand.x - ANCHOR.x) * 0.04, y: hand.y + (hand.y - ANCHOR.y) * 0.04 }, w: 3.5, color: 'ink0', cap: 'round' },
        ...plateGhost({ x: ANCHOR.x + (hand.x - ANCHOR.x) * 0.12, y: ANCHOR.y + (hand.y - ANCHOR.y) * 0.12 }, 9),
      ],
    };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 30, max: 65, label: 'the bar racked at the shoulder' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 155, max: 179, label: 'pressed long up the bar’s own line' },
    ],
    path: { track: 'hand', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'stand tall, brace — no arching under it' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'no leg drive' },
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'the shoulder stays stacked' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return {
    id: 'landmine_press',
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
    scene: floorScene(FLOOR_Y, X, 30),
  };
})();

/* ── db_pullover (batch 2, 2026-08-26) ─────────────────────────────────────────────────────────────
 *
 * The straight-arm pulldown LYING DOWN — the same rigid soft-elbowed arm, the same shoulder hinge,
 * with the bench for a floor and gravity for the cable. The arm sweeps from over the chest to the
 * deep stretch behind the head; the working endpoint IS the stretch (the 2025 lengthened-position
 * case is this lift's whole modern argument), and the pull back over the chest is the concentric.
 *
 * The faults the invariants forbid are the classic pair: ARCHING off the bench to fake a longer
 * stretch (hips pinned, torso angle frozen) and BENDING the elbow to make it a triceps extension
 * (the soft elbow is asserted at both ends and `angleNever` polices the whole rep).
 */
export const dbPullover: Rig = (() => {
  const SHOULDER: Vec2 = { x: 150, y: 150 };
  const HIP: Vec2 = { x: 198, y: 151 };
  const HEAD: Vec2 = { x: 134, y: 149.5 }; // off the bench's head end, on the spine line
  /* Legs along the bench, shins down to planted feet — canonical lengths, honest side view. */
  const KNEE: Vec2 = { x: 236, y: 154 };
  const ANKLE: Vec2 = { x: 241, y: 187 };
  const HEEL: Vec2 = { x: 237, y: FLOOR_Y };
  const TOE: Vec2 = { x: 251, y: FLOOR_Y };

  const REACH_E = U * 0.97;
  const REACH_H = (U + F) * 0.96;
  const BEND = 3.6;
  /** θ from straight-up over the chest, opening BACKWARD over the head (−x): −10° → 95°. */
  const THETA_FROM = -10;
  const THETA_TO = 95;

  const armAt = (theta: number): { elbow: Vec2; hand: Vec2 } => {
    const r = (theta * Math.PI) / 180;
    const ux = -Math.sin(r);
    const uy = -Math.cos(r);
    const px = -Math.cos(r); // the perpendicular the bend rides — the elbow bows toward the feet
    const py = Math.sin(r);
    return {
      elbow: { x: SHOULDER.x + REACH_E * ux - BEND * px, y: SHOULDER.y + REACH_E * uy - BEND * py },
      hand: { x: SHOULDER.x + REACH_H * ux, y: SHOULDER.y + REACH_H * uy },
    };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => armAt(lerp(THETA_FROM, THETA_TO, i / 16)).hand);

  const poseAt = (rom: number): Pose => {
    const { elbow, hand } = armAt(lerp(THETA_FROM, THETA_TO, rom));
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
        elbow,
        hand,
        farShoulder: far(SHOULDER, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(HIP, -6, 1),
        farKnee: far(KNEE, -6, 1),
        farAnkle: far(ANKLE, -6, 1),
        farHeel: far(HEEL, -6, 0),
        farToe: far(TOE, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const { elbow, hand } = armAt(lerp(THETA_FROM, THETA_TO, rom));
    const along = Math.hypot(hand.x - elbow.x, hand.y - elbow.y) || 1;
    const dir: Vec2 = { x: (hand.x - elbow.x) / along, y: (hand.y - elbow.y) / along };
    return {
      back: [...flatBench(138, 234, 158, FLOOR_Y), ...sampledPathTicks(ARC)],
      /* One bell, cupped end-on beyond the fists, its axis riding the forearm's line. */
      front: dumbbellSide(hand, dir, 6.5, 4.5),
    };
  };

  const softElbow = (label: string) => ({
    kind: 'jointAngle' as const,
    joint: 'elbow',
    neighbors: ['shoulder', 'hand'] as [string, string],
    min: 150,
    max: 172,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      softElbow('arms long over the chest — this is a sweep, not a press'),
      { kind: 'contactY', a: 'hand', y: armAt(THETA_FROM).hand.y, tol: 2.5, label: 'the bell over your chest' },
    ],
    end: [
      softElbow('and still long behind the head'),
      { kind: 'contactY', a: 'hand', y: armAt(THETA_TO).hand.y, tol: 2.5, label: 'lowered behind the head — the honest stretch' },
    ],
    path: { track: 'hand', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'the shoulder is the hinge' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'no arching off the bench' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips stay down on the pad' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'feet planted' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 174, label: 'the elbow stays soft, never locked' },
    ],
  };

  return {
    id: 'db_pullover',
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
    scene: floorScene(FLOOR_Y, 190, 44),
  };
})();
