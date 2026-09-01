/**
 * curl — the elbow-flexion family, authored against MOTION_FORM_STANDARD_V1 §4.x. SIDE VIEW, and
 * that is the whole reason this file exists separately from the presses: a curl is a rotation in
 * the SAGITTAL plane. Face-on it folds into depth and the forearm shortens to nothing; from the
 * side it is the plainest arc in the gym — the elbow stays, the hand sweeps up.
 *
 * ── THE TEMPLATE, AND WHY IT IS AN ARC AND NOT A RAIL ───────────────────────────────────────────
 * Every rig before this one tracked a point down a line (a bar, a handle on a machine's rail). A
 * curl has no rail: the hand travels the only path a forearm of fixed length pivoting on a fixed
 * elbow can travel. So `path.kind` is `'arc'`, whose constraint IS the pivot invariant — the
 * `pointFixed` on the elbow below — and the range statement is drawn along the SAMPLED true path
 * (`sampledPathTicks`), the grammar the good-morning established for a tracked point that curves.
 *
 * ── THE TWO ERRORS THE INVARIANTS FORBID ───────────────────────────────────────────────────────
 * A curl is taught almost entirely by what must NOT move, and both of its famous faults are
 * measurable, so both are pinned rather than merely drawn well:
 *
 *   1. **The elbow drifts forward.** Swinging the elbow turns the lift into a half front-raise and
 *      is the reason a curl "stops working". `pointFixed: elbow` fails any keyframe that lets it.
 *   2. **Body english.** Leaning back to throw the weight up. `segmentAngleFixed hip→shoulder` at
 *      3° and `pointFixed: hip` mean the torso cannot help, so the arm has to.
 *
 * The cues in `exercises.ts` say the same two things in words; §0 of the standard is that the
 * animation IS the cues, drawn, and here the drawing cannot disagree with them by construction.
 *
 * rom 0 = arms hanging at the hips (extended, never hyperextended) · rom 1 = curled to the
 * shoulder. Members differ only in the implement and in whether the far arm works too.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { cable, dumbbellEnd, dumbbellSide, floorScene, padStroke, plateGhost, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far, standingCore } from '../bodies';

const X = 178;
const core = standingCore(X);
const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;

/**
 * The elbow hangs one upper-arm below the shoulder, a shade FORWARD of it — where a relaxed arm
 * actually hangs on a standing body, and the position the whole family then refuses to let move.
 */
const ELBOW: Vec2 = { x: core.shoulder.x + 1.5, y: core.shoulder.y + U };

/** Interior elbow angle = 180° − φ, so the endpoints are stated in degrees and drawn from them. */
/*
 * ⚠️ φ IS NOT THE ELBOW ANGLE, IT IS THE FOREARM'S SWEEP. Interior angle ≈ 180° − φ ONLY when
 * the upper arm hangs dead vertical; ours hangs 1.5u forward of the shoulder (where a real arm
 * hangs), which adds ~3.4°. Authoring φ = 4 therefore drew 179.4° and the validator caught it
 * against its own hyperextension ceiling on the first run — which is the mechanism working.
 * φ = 9 lands at ~174°: unmistakably extended, and clear of 179° by a margin the offset cannot
 * eat. THE CEILING IS NOT THE THING TO TUNE.
 */
const PHI_BOTTOM = 9;
const PHI_TOP = 140; // 40° — the forearm past horizontal, hand at the shoulder

const handAt = (phi: number): Vec2 => {
  const r = (phi * Math.PI) / 180;
  return { x: ELBOW.x + F * Math.sin(r), y: ELBOW.y + F * Math.cos(r) };
};

const curlChains = {
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

interface CurlParams {
  id: string;
  /** `cable_neutral` — the rope: a cable to the fist shown END-ON (the hammer disc), the honest
   *  side view of a neutral grip on a rope (the brachialis pair's own grammar, on a pulley). */
  implement: 'bar' | 'db' | 'db_neutral' | 'cable' | 'cable_neutral';
  /** One arm works and the other hangs — the single-arm cable curl. */
  singleArm?: boolean;
  /** The bottom of the range, when the implement will not let the arm hang fully (a bar at the thighs). */
  phiBottom?: number;
  /**
   * The top of the range. Default 140 puts the forearm past horizontal with the hand at the
   * shoulder — a supinated curl's full squeeze.
   *
   * `reverse_curl` overrides it, and that override IS the exercise. A pronated grip puts the
   * biceps at a mechanical disadvantage and the bar simply does not come as high: it finishes with
   * the elbow near 58 degrees rather than 43. Without it the reverse curl rendered byte-identical
   * to `bb_curl` — same builder, same implement, same numbers — and two ids shared one clip.
   */
  phiTop?: number;
  /** Plate radius for bar members. 12 (a 20kg disc) — nobody curls 45s, and a 16 covered the athlete. */
  plateR?: number;
  /** 'ez' draws the cambered bar's zigzag at the fist — §3.5's "the attachment is a word". */
  bar?: 'straight' | 'ez';
  /** A mid-range tick on the arc: the half-way split a 21s protocol turns around. */
  midTick?: boolean;
  /** The 21s protocol: bottom half, top half, then full — drawn as three partial reps. */
  reps21?: boolean;
}

function curl(p: CurlParams): Rig {
  const phiBottom = p.phiBottom ?? PHI_BOTTOM;
  const phiTop = p.phiTop ?? PHI_TOP;
  const bottomHand = handAt(phiBottom);
  const topHand = handAt(phiTop);
  /** The true path, sampled — the arc the hand actually travels, for the range statement. */
  const ARC = Array.from({ length: 17 }, (_, i) => handAt(lerp(phiBottom, phiTop, i / 16)));
  /** The low pulley the cable members are anchored to, behind the athlete's forward foot. */
  const PULLEY: Vec2 = { x: X + 62, y: FLOOR_Y - 12 };

  const poseAt = (rom: number): Pose => {
    const phi = lerp(phiBottom, phiTop, rom);
    const hand = handAt(phi);
    // The far arm mirrors the near one for two-handed work and hangs dead for single-arm work.
    const farPhi = p.singleArm ? phiBottom : phi;
    const farHand = handAt(farPhi);
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
        elbow: ELBOW,
        hand,
        farShoulder: far(core.shoulder, -6, 1),
        farElbow: far(ELBOW, -6, 1),
        farHand: far(farHand, -6, 1),
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
    const hand = pose.j.hand;
    const farHand = pose.j.farHand;
    /** The forearm's own direction — a dumbbell lies across the hand, so it rides this. */
    const phi = lerp(phiBottom, phiTop, rom);
    const dir: Vec2 = { x: Math.cos((phi * Math.PI) / 180), y: -Math.sin((phi * Math.PI) / 180) };

    const back: Primitive[] = [...sampledPathTicks(ARC)];
    if (p.midTick) {
      // the half-way mark the protocol turns around — the same tick grammar as the two endpoints
      const mid = handAt(lerp(phiBottom, phiTop, 0.5));
      const nx = mid.x - ELBOW.x;
      const ny = mid.y - ELBOW.y;
      const n = Math.hypot(nx, ny) || 1;
      back.push({
        kind: 'line',
        a: { x: mid.x - (nx / n) * 4.5, y: mid.y - (ny / n) * 4.5 },
        b: { x: mid.x + (nx / n) * 4.5, y: mid.y + (ny / n) * 4.5 },
        w: 2,
        color: 'ink0',
        cap: 'round',
      });
    }
    let front: Primitive[] = [];

    if (p.implement === 'bar') {
      // Side-on, a barbell IS its plate: one disc at the hand, the bar hidden behind it.
      front = plateGhost(hand, p.plateR ?? 12);
      if (p.bar === 'ez') {
        /*
         * The EZ bar's camber, drawn as its own glyph.
         *
         * Seen end-on the zigzag has nowhere to project — the bends run along the bar, straight
         * into the page — so the shape that names this bar cannot appear by accident. §3.5 Am. 5
         * settles that class of problem the same way every time: the attachment is a WORD, and the
         * word gets drawn. Two bends either side of the fist, in the bar's own ink.
         */
        const w = 11;
        const h = 4.5;
        front.push({
          kind: 'polyline',
          pts: [
            { x: hand.x - w, y: hand.y + h },
            { x: hand.x - w * 0.45, y: hand.y - h },
            { x: hand.x + w * 0.45, y: hand.y - h },
            { x: hand.x + w, y: hand.y + h },
          ],
          w: 3,
          color: 'ink0',
        });
      }
    } else if (p.implement === 'db') {
      front = [...dumbbellSide(farHand, dir), ...dumbbellSide(hand, dir)];
    } else if (p.implement === 'db_neutral') {
      /* A NEUTRAL grip, side-on, shows the dumbbell END-ON — a disc at the fist instead of the
         side profile. That disc IS the drawable truth of "hammer": same arc, rotated grip. */
      front = [...dumbbellEnd(farHand), ...dumbbellEnd(hand)];
    } else {
      /*
       * The resistance MOVES (§3.5): the selected plate rides up as the hand does. A low pulley
       * turns the cable through a right angle, so the plate travels a fraction of the hand's arc
       * rather than matching it — drawn at 0.55, which reads as "connected" without pretending the
       * stack climbs as far as the fist.
       */
      const risen = (bottomHand.y - hand.y) * 0.55;
      const tower = stackTower({ x0: PULLEY.x + 8, x1: PULLEY.x + 34, capY: FLOOR_Y - 98, stackTopY: FLOOR_Y - 34 }, risen);
      back.push(...tower.prims, ...pulley(PULLEY));
      // The rope member ends at a fist shown END-ON (the hammer disc); the straight handle at a
      // dumbbell's side profile. Same arc, same pulley — the grip is the drawable difference.
      front =
        p.implement === 'cable_neutral'
          ? [cable(PULLEY, hand), ...dumbbellEnd(hand)]
          : [cable(PULLEY, hand), ...dumbbellSide(hand, dir, 3, 2.5)];
      if (!p.singleArm) front = [cable(PULLEY, farHand), ...front];
    }
    return { back, front };
  };

  const formspec: FormSpec = {
    tempo: p.reps21
      ? { ...CONCENTRIC_TEMPO, reps: 3, repRanges: [[0, 0.5], [0.5, 1], [0, 1]] as const }
      : CONCENTRIC_TEMPO,
    start: [
      {
        kind: 'jointAngle',
        joint: 'elbow',
        neighbors: ['shoulder', 'hand'],
        min: 160,
        max: 179,
        label: 'arms hanging, extended',
      },
    ],
    end: [
      {
        kind: 'jointAngle',
        joint: 'elbow',
        neighbors: ['shoulder', 'hand'],
        min: 32,
        // The window follows the member's own top. A supinated curl squeezes to about 43 degrees;
        // a pronated one has no business getting there, and `reverse_curl` finishes at 58.
        max: p.phiTop != null && p.phiTop < PHI_TOP ? 62 : 58,
        label: 'curled to the shoulder',
      },
    ],
    path: { track: 'hand', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'elbow', tol: 0.5, label: 'the elbow stays at your side' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'no lean back — the torso does not help' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips still' },
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'no leg drive' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return { id: p.id, chains: curlChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, X, 30) };
}

/** A straight bar hangs at the thighs, not at the wrists' full length — its own bottom stop. */
export const bbCurl = curl({ id: 'bb_curl', implement: 'bar', phiBottom: 8 });
export const dbCurl = curl({ id: 'db_curl', implement: 'db' });
export const cableCurl = curl({ id: 'cable_curl', implement: 'cable' });
export const singleArmCableCurl = curl({ id: 'single_arm_cable_curl', implement: 'cable', singleArm: true });

/*
 * The brachialis pair (2026-08-25) — the SAME arc under a rotated grip, which is the honest
 * side-view statement: a hammer curl's neutral grip shows the dumbbell END-ON (a disc at the
 * fist); a reverse curl's overhand bar is, from the side, the bar-curl silhouette — the wrist
 * fact lives in the written cues, exactly as the sumo stance does. The elbow discipline the
 * pattern exists for ("elbows still") is already this family's first invariant.
 */
export const hammerCurl = curl({ id: 'hammer_curl', implement: 'db_neutral' });
// The pronated grip's own range: the bar finishes at a 58-degree elbow, not 43 — see `phiTop`.
export const reverseCurl = curl({ id: 'reverse_curl', implement: 'bar', phiBottom: 8, phiTop: 125 });

/* THE POSITIONED CURLS — the pad decides the elbow, the elbow decides the lift.
 *
 * preacher, concentration, incline: the same forearm arc as above, but the ELBOW is placed by
 * furniture — a sloped pad, an inner thigh, the empty space behind an incline bench — and the
 * range shifts with it (shortened against a pad, lengthened hanging behind). Each is authored as
 * explicit joints for the seated body + an elbow anchored at its brace, with the arc and the
 * invariants shared: the elbow is pinned WHEREVER it is, and the torso may not swing.
 */

interface PositionedCurlParams {
  id: string;
  /** The static body, side view: everything but the working arm. */
  body: { head: Vec2; shoulder: Vec2; hip: Vec2; knee: Vec2; ankle: Vec2; heel: Vec2; toe: Vec2 };
  /** Where the brace puts the elbow (one canonical upper-arm from the shoulder, by construction). */
  elbow: Vec2;
  /** Forearm sweep from straight-down, degrees, at rom 0 and rom 1. */
  phiFrom: number;
  phiTo: number;
  /** Elbow-angle windows at the endpoints — shortened and lengthened members differ exactly here. */
  startWindow: [number, number];
  endWindow: [number, number];
  furniture: Primitive[];
  singleArm?: boolean;
  /**
   * What is in the hands. Default 'db' — two dumbbells, which is right for the incline and spider
   * members and for the one-armed concentration curl.
   *
   * `preacher_curl` is `equipment: 'machine'` in the catalogue and is a BAR exercise: both hands on
   * one cambered bar over the pad. It was drawing two separate dumbbells, which is a different
   * exercise on different equipment.
   */
  implement?: 'db' | 'ez';
}

function positionedCurl(p: PositionedCurlParams): Rig {
  const handAtE = (phi: number): Vec2 => {
    const r = (phi * Math.PI) / 180;
    return { x: p.elbow.x + F * Math.sin(r), y: p.elbow.y + F * Math.cos(r) };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => handAtE(lerp(p.phiFrom, p.phiTo, i / 16)));

  const poseAt = (rom: number): Pose => {
    const phi = lerp(p.phiFrom, p.phiTo, rom);
    const hand = handAtE(phi);
    const farHand = handAtE(p.singleArm ? p.phiFrom : phi);
    return {
      headR: ATHLETE.headR,
      j: {
        ...p.body,
        elbow: p.elbow,
        hand,
        farShoulder: far(p.body.shoulder, -6, 1),
        farElbow: far(p.elbow, -6, 1),
        farHand: far(farHand, -6, 1),
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
    const phi = lerp(p.phiFrom, p.phiTo, rom);
    const dir: Vec2 = { x: Math.cos((phi * Math.PI) / 180), y: -Math.sin((phi * Math.PI) / 180) };
    return {
      back: [...p.furniture, ...sampledPathTicks(ARC)],
      front:
        p.implement === 'ez'
          ? [
              // one bar, both hands: the plate at the near fist and the camber's own glyph on it
              ...plateGhost(pose.j.hand, 12),
              {
                kind: 'polyline',
                pts: [
                  { x: pose.j.hand.x - 11, y: pose.j.hand.y + 4.5 },
                  { x: pose.j.hand.x - 5, y: pose.j.hand.y - 4.5 },
                  { x: pose.j.hand.x + 5, y: pose.j.hand.y - 4.5 },
                  { x: pose.j.hand.x + 11, y: pose.j.hand.y + 4.5 },
                ],
                w: 3,
                color: 'ink0',
              },
            ]
          : p.singleArm
            ? dumbbellSide(pose.j.hand, dir)
            : [...dumbbellSide(pose.j.farHand, dir), ...dumbbellSide(pose.j.hand, dir)],
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: p.startWindow[0], max: p.startWindow[1], label: 'the honest bottom for this bench' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: p.endWindow[0], max: p.endWindow[1], label: 'curled — and squeezed' },
    ],
    path: { track: 'hand', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'elbow', tol: 0.5, label: 'the brace holds the elbow — it cannot drift' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the body does not help' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'seated and staying seated' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return { id: p.id, chains: curlChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, p.body.hip.x + 20, 36) };
}

/** A canonical upper-arm from `shoulder`, at `deg` forward-of-straight-down. */
const elbowFrom = (shoulder: Vec2, deg: number): Vec2 => ({
  x: shoulder.x + U * Math.sin((deg * Math.PI) / 180),
  y: shoulder.y + U * Math.cos((deg * Math.PI) / 180),
});

/*
 * preacher: LEANED OVER the bench, chest against the pad's top edge, upper arms down its face.
 *
 * He used to sit bolt upright with his arms hanging 35 degrees forward, and at that angle the pad —
 * which must lie UNDER the upper arm, so back-and-down from it — landed inside his own ribcage. A
 * preacher bench does not work that way and cannot be drawn that way: the athlete leans onto the
 * pad, so the shoulder comes forward over the top edge and the arms run down a 45-degree face well
 * clear of the trunk. Torso 15 degrees forward, arm 45, and the slab has somewhere to be.
 */
const PR_LEAN = 15 * (Math.PI / 180);
const PR_HIP: Vec2 = { x: 150, y: 157.5 };
const PR_SHOULDER: Vec2 = { x: PR_HIP.x + ATHLETE.torso * Math.sin(PR_LEAN), y: PR_HIP.y - ATHLETE.torso * Math.cos(PR_LEAN) };
const PR_BODY = {
  head: { x: PR_SHOULDER.x + ATHLETE.neck * Math.sin(PR_LEAN * 0.8), y: PR_SHOULDER.y - ATHLETE.neck * Math.cos(PR_LEAN * 0.8) },
  shoulder: PR_SHOULDER,
  hip: PR_HIP,
  knee: { x: 189, y: 150 },
  ankle: { x: 198, y: 186 },
  heel: { x: 192, y: 193 },
  toe: { x: 217, y: 193 },
};
const PR_ELBOW = elbowFrom(PR_SHOULDER, 45);
/*
 * THE PREACHER BENCH, which the exercise is named after and which was almost not drawn.
 *
 * It was a 24-unit pad stroke tucked under the upper arm and nothing else: the athlete's own arm
 * covered it, and what shipped was a man on a stool curling two dumbbells — no bench, and the wrong
 * implement for a `machine` entry. The pad is the whole mechanism here (it is what pins the upper
 * arm and makes this the SHORTENED curl), so it is built off the arm's own axis and drawn at a size
 * that survives the arm lying on it: the face runs from above the armpit to well past the elbow,
 * the seat and the upright ground it, and the near edge shows down the whole length.
 */
const PR_BENCH: Primitive[] = (() => {
  const ux = PR_ELBOW.x - PR_SHOULDER.x;
  const uy = PR_ELBOW.y - PR_SHOULDER.y;
  const ul = Math.hypot(ux, uy) || 1;
  const U: Vec2 = { x: ux / ul, y: uy / ul }; // down the pad's face, shoulder → elbow
  const n: Vec2 = { x: -U.y, y: U.x };
  const N: Vec2 = n.y >= 0 ? n : { x: -n.x, y: -n.y }; // the side the arm rests ON — under it
  const at = (along: number, out: number): Vec2 => ({
    x: PR_SHOULDER.x + U.x * along + N.x * out,
    y: PR_SHOULDER.y + U.y * along + N.y * out,
  });
  const top = at(-7, 8);
  const bottom = at(ul + 17, 8);
  return [
    ...padStroke(top, bottom, 15),
    // the upright under the pad's low edge, and the frame foot
    { kind: 'line', a: { x: bottom.x + 3, y: bottom.y + 6 }, b: { x: bottom.x + 3, y: 191 }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: bottom.x - 9, y: 191 }, b: { x: bottom.x + 15, y: 191 }, w: 2.5, color: 'ink3', cap: 'round' },
    // the seat he sits on, and its post
    { kind: 'rect', x: 132, y: 162, width: 40, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: 152, y: 169 }, b: { x: 152, y: 191 }, w: 2.5, color: 'ink3' },
    { kind: 'line', a: { x: 140, y: 191 }, b: { x: 164, y: 191 }, w: 2.5, color: 'ink3', cap: 'round' },
  ];
})();
export const preacherCurl = positionedCurl({
  id: 'preacher_curl',
  body: PR_BODY,
  elbow: PR_ELBOW,
  /* The pad blocks the last degrees of extension — the shortened member's honest bottom. */
  /* Interior elbow = 180° − (φ − armTilt); the pad tilts the arm 45°, so φ is chosen FROM the
     target angles: 76 → 149° (the pad's honest partial bottom), 160 → 65° (the squeeze). */
  phiFrom: 76,
  phiTo: 160,
  startWindow: [130, 155],
  endWindow: [40, 68],
  implement: 'ez',
  furniture: PR_BENCH,
});

/* concentration: leaned forward off the bench end, the elbow braced on the inner thigh. */
const CC_SHOULDER: Vec2 = { x: 170, y: 116 };
const CC_BODY = {
  head: { x: 176, y: 101 },
  shoulder: CC_SHOULDER,
  hip: { x: 150, y: 157.5 },
  knee: { x: 189, y: 150 },
  ankle: { x: 198, y: 186 },
  heel: { x: 192, y: 193 },
  toe: { x: 217, y: 193 },
};
const CC_ELBOW = elbowFrom(CC_SHOULDER, 16);
export const concentrationCurl = positionedCurl({
  id: 'concentration_curl',
  body: CC_BODY,
  elbow: CC_ELBOW,
  /* φ starts ABOVE the arm's own 16° tilt — crossing it is a straight (180°) elbow mid-rep,
     which the hyperextension invariant rightly refuses. 30 → 166° long; 145 → 51° squeezed. */
  phiFrom: 30,
  phiTo: 145,
  startWindow: [155, 172],
  endWindow: [40, 60],
  furniture: [
    { kind: 'rect', x: 128, y: 160, width: 44, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: 150, y: 167 }, b: { x: 150, y: 191 }, w: 2.5, color: 'ink3' },
  ],
  singleArm: true,
});

/* incline: sat back on the incline bench, the arm hanging BEHIND the torso — the lengthened member. */
const IN_SHOULDER: Vec2 = { x: 128, y: 118 };
const IN_BODY = {
  head: { x: 124, y: 102 },
  shoulder: IN_SHOULDER,
  hip: { x: 150, y: 157.5 },
  knee: { x: 189, y: 150 },
  ankle: { x: 198, y: 186 },
  heel: { x: 192, y: 193 },
  toe: { x: 217, y: 193 },
};
const IN_ELBOW = elbowFrom(IN_SHOULDER, -8); // hanging a shade BEHIND the reclined trunk
/*
 * The reclined bench. Same fault as the spider's and the chest-supported row's: the pad was drawn
 * ON the spine's own line, so the athlete covered it and the clip showed a man sitting in the air
 * with a post under him. The incline IS the exercise — it is what puts the arm behind the trunk and
 * makes this the LENGTHENED curl — so the pad is offset onto the back side, widened, run past the
 * shoulder into a headrest, and grounded on a seat and a foot.
 */
const IN_BENCH: Primitive[] = (() => {
  const dx = IN_SHOULDER.x - 150;
  const dy = IN_SHOULDER.y - 157.5;
  const l = Math.hypot(dx, dy) || 1;
  const U: Vec2 = { x: dx / l, y: dy / l }; // up the pad, hip → shoulder
  const b: Vec2 = { x: -U.y, y: U.x };
  const B: Vec2 = b.x <= 0 ? b : { x: -b.x, y: -b.y }; // the side he leans BACK onto
  const at = (along: number, out: number): Vec2 => ({ x: 150 + U.x * along + B.x * out, y: 157.5 + U.y * along + B.y * out });
  return [
    ...padStroke(at(-6, 10), at(l + 14, 10), 16),
    { kind: 'rect', x: 132, y: 160, width: 42, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: 140, y: 167 }, b: { x: 140, y: 191 }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: 126, y: 191 }, b: { x: 154, y: 191 }, w: 2.5, color: 'ink3', cap: 'round' },
    { kind: 'line', a: { x: 140, y: 172 }, b: { x: at(l + 10, 10).x + 4, y: at(l + 10, 10).y + 8 }, w: 2.5, color: 'ink3' },
  ];
})();
export const inclineDbCurl = positionedCurl({
  id: 'incline_db_curl',
  body: IN_BODY,
  elbow: IN_ELBOW,
  /* The arm ITSELF hangs 8° behind the trunk — that tilt is the lengthening the incline is for.
     φ starts just forward of the arm line (6 → interior 166°) so the sweep never crosses straight. */
  phiFrom: 6,
  phiTo: 128,
  startWindow: [155, 176],
  endWindow: [36, 64],
  furniture: IN_BENCH,
});

/*
 * ════ THE BODYBUILDING SHELF (founder, 2026-08-26) — choice-only members ════
 *
 * EZ-bar and the 21s ride the standing bar silhouette VERBATIM: side-on, an EZ bar's bends are
 * invisible behind its plate and a 7+7+7 scheme is a COUNT, not a different arc — both facts live
 * in the written cues, exactly where the hammer's grip and the sumo's stance already live. Each
 * still gets its OWN rig id so the demo door lights for it and the validator holds it by name.
 */
export const ezBarCurl = curl({ id: 'ez_bar_curl', implement: 'bar', phiBottom: 8, bar: 'ez' });
export const bbCurl21 = curl({ id: 'bb_curl_21', implement: 'bar', phiBottom: 8, midTick: true, reps21: true });
/** The rope, on the low pulley — the brachialis grip with the stack's resistance. */
export const cableRopeHammerCurl = curl({ id: 'cable_rope_hammer_curl', implement: 'cable_neutral' });

/* spider: chest DOWN on the incline pad's high side, the arm hanging plumb in FRONT of it —
 * the shortened cousin of the preacher with gravity doing the bracing. The pad carries the
 * torso; the arm gets nothing to cheat with. */
const SP_HIP: Vec2 = { x: 148, y: 154 };
const SP_SHOULDER: Vec2 = { x: 181, y: 121 }; // torso ~45° over the pad
const SP_BODY = {
  head: { x: 196, y: 112 },
  shoulder: SP_SHOULDER,
  hip: SP_HIP,
  knee: { x: 127, y: 162 },
  ankle: { x: 120, y: 186 },
  heel: { x: 114, y: 193 },
  toe: { x: 136, y: 193 },
};
const SP_ELBOW = elbowFrom(SP_SHOULDER, 0); // plumb — the whole point of the spider position
/*
 * The steep pad he lies on. It was authored ALONG the spine — from (150,160) to (186,116), which is
 * the torso's own line — so the athlete covered it exactly and the clip showed a man leaning at
 * 45 degrees on nothing at all, with one stray post under him. Offset onto the CHEST side (he is
 * face-down, so his chest faces down-and-forward), widened, and given an upright and a foot, the
 * slab reads down his whole length and the position explains itself.
 */
const SP_BENCH: Primitive[] = (() => {
  const dx = SP_SHOULDER.x - SP_HIP.x;
  const dy = SP_SHOULDER.y - SP_HIP.y;
  const l = Math.hypot(dx, dy) || 1;
  const U: Vec2 = { x: dx / l, y: dy / l };
  const C: Vec2 = { x: -U.y, y: U.x }; // the chest side: down-and-forward for a prone torso
  const at = (along: number, out: number): Vec2 => ({
    x: SP_HIP.x + U.x * along + C.x * out,
    y: SP_HIP.y + U.y * along + C.y * out,
  });
  const low = at(-10, 10);
  const high = at(l + 8, 10);
  return [
    ...padStroke(low, high, 16),
    { kind: 'line', a: { x: low.x + 6, y: low.y + 6 }, b: { x: low.x + 6, y: 191 }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: low.x - 8, y: 191 }, b: { x: low.x + 22, y: 191 }, w: 2.5, color: 'ink3', cap: 'round' },
    { kind: 'line', a: { x: low.x + 6, y: 172 }, b: { x: high.x - 6, y: high.y + 10 }, w: 2.5, color: 'ink3' },
  ];
})();
export const spiderCurl = positionedCurl({
  id: 'spider_curl',
  body: SP_BODY,
  elbow: SP_ELBOW,
  /* The arm hangs dead vertical, so φ starts a shade forward of plumb (6 → interior ~174°) and
     sweeps to the squeeze without the torso ever entering the lift — the pad holds it. */
  phiFrom: 6,
  phiTo: 135,
  startWindow: [158, 178],
  endWindow: [36, 60],
  furniture: SP_BENCH,
});
