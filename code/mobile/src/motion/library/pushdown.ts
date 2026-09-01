/**
 * elbow_extension_pushdown — the triceps' own arc, and the curl run backwards. Same camera (SIDE,
 * because it is a sagittal rotation), same pivot (the elbow, pinned), same authoring: the forearm's
 * SWEEP is the parameter and the interior angle falls out of it.
 *
 * ── WHAT MAKES IT A DIFFERENT LIFT AND NOT A MIRRORED CURL ──────────────────────────────────────
 * The direction of travel is the whole exercise. A curl OPENS at extension and closes toward the
 * shoulder; a pushdown OPENS at ~90° and drives DOWN to straight, so `rom 0` is the bent elbow and
 * `rom 1` is lockout. The tempo therefore reads the way the athlete experiences it — the working
 * effort is the concentric to the bottom, not a lift toward the face.
 *
 * ── THE ERROR THIS FAMILY IS ACTUALLY ABOUT ─────────────────────────────────────────────────────
 * Everyone's pushdown fails the same way: the elbows travel forward and the shoulders take over, so
 * the lift becomes a half front-press with the triceps along for the ride. It is the same fault as
 * the curl's swinging elbow and it gets the same treatment — `pointFixed` on the elbow, and a torso
 * that may not lean into the bar. What is left for the arm to do is the exercise.
 *
 * ── THE CABLE IS DRAWN FROM ABOVE ───────────────────────────────────────────────────────────────
 * A high pulley, so the line of pull is down the whole arc. The stack rides UP as the hands go
 * DOWN — opposite to the curl's low pulley, and the one detail that makes the drawing read as a
 * cable machine rather than as a bar in the air.
 *
 * `triceps_kickback` shares this catalogue pattern and needed a different SKELETON, not a
 * parameter — hinged over, upper arm pinned level behind. It waited, and it is authored at the
 * end of this file now (2026-08-25), on exactly that skeleton.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { cable, dumbbellSide, floorScene, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far, seatedCore, standingCore } from '../bodies';

const X = 178;
const core = standingCore(X);
/**
 * The seated body the MACHINE member uses.
 *
 * "Triceps Extension Machine" is `support: 'supported'` — you sit in it, your upper arms brace on a
 * pad and only the forearms move. It was drawn standing, with a lever and a post beside a man in
 * open space: no seat, no back, nothing that says which machine. A cable stack and a lever hanging
 * off a pole is not a station.
 */
const seatedBody = seatedCore(6, 6);
const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;

/** Same hanging elbow as the curl family — one athlete, one anatomy, two lifts. */
const elbowOf = (body: { shoulder: Vec2 }): Vec2 => ({ x: body.shoulder.x + 1.5, y: body.shoulder.y + U });
const ELBOW: Vec2 = elbowOf(core);

/** φ = the forearm's sweep from straight-down; interior elbow angle ≈ 180° − φ (+3.4° of offset). */
const PHI_TOP = 96; // the start: elbow just past square, forearm level and a shade above
const PHI_BOTTOM = 9; // lockout, clear of the 179° hyperextension ceiling — see `curl.ts`

const handAtE = (phi: number, elbow: Vec2): Vec2 => {
  const r = (phi * Math.PI) / 180;
  return { x: elbow.x + F * Math.sin(r), y: elbow.y + F * Math.cos(r) };
};
const handAt = (phi: number): Vec2 => handAtE(phi, ELBOW);

const pushdownChains = {
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

interface PushdownParams {
  id: string;
  /**
   * 'cable' is the straight bar on the high pulley; 'rope' is the same pulley with a ROPE; 'machine'
   * is the lever.
   *
   * `rope_pushdown` used to be declared as 'cable' with a comment saying the rope's split "is a
   * wrist fact and lives in the written cues" — and the two rigs then rendered byte-for-byte the
   * same clip, two ids and one drawing. The split is not a wrist fact: a rope has two TAILS that
   * hang past the fists and swing apart at the lockout, and that silhouette is visible from any
   * camera. §3.5 Amendment 5 already settles this class — the attachment is a word, so it is drawn.
   */
  implement: 'cable' | 'rope' | 'machine';
  /** One arm works and the other rests at the side. */
  singleArm?: boolean;
  /** How far past the bar's stop the sweep runs — a rope lets the hands drive further apart and down. */
  phiBottom?: number;
}

function pushdown(p: PushdownParams): Rig {
  const phiBottom = p.phiBottom ?? PHI_BOTTOM;
  const body = p.implement === 'machine' ? seatedBody : core;
  const elbow0 = elbowOf(body);
  const hand0 = (phi: number) => handAtE(phi, elbow0);
  /** rom 0 → rom 1 is TOP → BOTTOM: the arc is sampled in that order for its range statement. */
  const ARC = Array.from({ length: 17 }, (_, i) => hand0(lerp(PHI_TOP, phiBottom, i / 16)));
  /** The high pulley, above and slightly in front — the line of pull down the whole arc. */
  const PULLEY: Vec2 = { x: X + 46, y: 34 };

  const poseAt = (rom: number): Pose => {
    const phi = lerp(PHI_TOP, phiBottom, rom);
    const hand = hand0(phi);
    const farHand = hand0(p.singleArm ? PHI_TOP : phi);
    return {
      headR: ATHLETE.headR,
      j: {
        head: body.head,
        shoulder: body.shoulder,
        hip: body.hip,
        knee: body.knee,
        ankle: body.ankle,
        heel: body.heel,
        toe: body.toe,
        elbow: elbow0,
        hand,
        farShoulder: far(body.shoulder, -6, 1),
        farElbow: far(elbow0, -6, 1),
        farHand: far(farHand, -6, 1),
        farHip: far(body.hip, -6, 1),
        farKnee: far(body.knee, -6, 1),
        farAnkle: far(body.ankle, -6, 1),
        farHeel: far(body.heel, -6, 0),
        farToe: far(body.toe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const hand = pose.j.hand;
    const farHand = pose.j.farHand;
    const phi = lerp(PHI_TOP, phiBottom, rom);
    /** The bar/handle lies across the fist, square to the forearm. */
    const dir: Vec2 = { x: Math.cos((phi * Math.PI) / 180), y: -Math.sin((phi * Math.PI) / 180) };

    const back: Primitive[] = [...sampledPathTicks(ARC)];
    /*
     * The stack rises as the hands descend — a HIGH pulley, so the two travel in opposite
     * directions. Drawing it the curl's way (stack following the hand down) is the single detail
     * that would make this read as the wrong machine.
     */
    const risen = (hand0(PHI_TOP).y - hand.y) * -0.55;
    const tower = stackTower(
      { x0: PULLEY.x + 8, x1: PULLEY.x + 34, capY: 26, stackTopY: FLOOR_Y - 34 },
      risen,
    );
    back.push(...tower.prims);

    let front: Primitive[];
    if (p.implement === 'rope') {
      back.push(...pulley(PULLEY));
      /*
       * The rope: the cable down to a swivel at the fists, then two TAILS hanging past them, which
       * splay apart as the arms lock out — the one silhouette that separates this from the bar.
       */
      const spread = 14 + 16 * rom; // degrees either side of the hang, opening through the rep
      const tail = (side: 1 | -1, at: Vec2): Primitive[] => {
        const a = ((90 + side * spread) * Math.PI) / 180;
        const end: Vec2 = { x: at.x + Math.cos(a) * 15, y: at.y + Math.sin(a) * 15 };
        return [
          { kind: 'line', a: at, b: end, w: 2.6, color: 'ink2', cap: 'round' },
          { kind: 'circle', c: end, r: 2.4, fill: 'ink2' }, // the knotted end
        ];
      };
      front = [
        cable(PULLEY, hand),
        ...tail(1, hand),
        ...tail(-1, hand),
        { kind: 'circle', c: hand, r: 2.6, fill: 'ink0' }, // the swivel the tails hang from
      ];
      if (!p.singleArm) front = [cable(PULLEY, farHand), ...front];
    } else if (p.implement === 'cable') {
      back.push(...pulley(PULLEY));
      front = [cable(PULLEY, hand), ...dumbbellSide(hand, dir, p.singleArm ? 3 : 9, 2.5)];
      if (!p.singleArm) front = [cable(PULLEY, farHand), ...front];
    } else {
      /*
       * The MACHINE member is a LEVER, not a rope (equipment QC 2026-08-25: it drew the cable
       * members' own pulley-and-rope with a grip glyph swapped in — a twin, which §3.5 Amendment 5
       * forbids even inside a family). A selectorized extension's arm pivots on an axis ALIGNED
       * WITH THE ELBOW — the machines are literally labeled that way — so the pivot pin sits on
       * the elbow's axis and the rigid arm rides the forearm 1:1 to the fixed grips: the drawn
       * machine sweeps the exact arc the FormSpec validates, by construction. The frame post
       * carries the pin from the floor; the stack still rides opposite the hands, routed
       * internally (the shroud license).
       */
      const u = { x: (hand.x - elbow0.x) / F, y: (hand.y - elbow0.y) / F };
      const perp = { x: -u.y, y: u.x }; // away from the body for this right-facing arm
      const pin: Vec2 = { x: elbow0.x + perp.x * 4.5, y: elbow0.y + perp.y * 4.5 };
      const armEnd: Vec2 = { x: hand.x + perp.x * 4.5 + u.x * 4, y: hand.y + perp.y * 4.5 + u.y * 4 };
      back.push(
        /*
         * The seat this exercise is performed IN. `support: 'supported'` is the catalogue's own
         * word for it, and the rig used to draw a standing man beside a lever and a pole: the one
         * thing that identifies the machine was missing entirely. Seat, back pad, and the ARM PAD
         * the upper arms brace against — which is also what makes the pinned elbow true rather than
         * merely asserted.
         */
        { kind: 'rect', x: body.hip.x - 24, y: body.hip.y + 4, width: 50, height: 8, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
        { kind: 'line', a: { x: body.hip.x - 8, y: body.hip.y + 12 }, b: { x: body.hip.x - 8, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
        { kind: 'line', a: { x: body.hip.x - 20, y: FLOOR_Y - 2 }, b: { x: body.hip.x + 14, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
        { kind: 'rect', x: body.shoulder.x - 26, y: body.shoulder.y - 4, width: 18, height: 54, rx: 6, fill: 'paper3', stroke: 'ink3', w: 2 },
        // the arm pad the upper arms lie on, running from under the shoulder out past the elbow
        ...(() => {
          const a = { x: body.shoulder.x - 2, y: body.shoulder.y + 9 };
          const b = { x: elbow0.x + 12, y: elbow0.y + 9 };
          return [
            { kind: 'line' as const, a, b, w: 13, color: 'ink3' as const, cap: 'round' as const },
            { kind: 'line' as const, a, b, w: 9.5, color: 'paper3' as const, cap: 'round' as const },
          ];
        })(),
        { kind: 'line', a: { x: elbow0.x + 27, y: FLOOR_Y - 2 }, b: { x: elbow0.x + 27, y: elbow0.y }, w: 3, color: 'ink3' },
        { kind: 'line', a: { x: elbow0.x + 27, y: elbow0.y }, b: pin, w: 3, color: 'ink3' },
      );
      front = [
        { kind: 'line', a: pin, b: armEnd, w: 3, color: 'ink1', cap: 'round' }, // the lever arm, riding the forearm
        { kind: 'circle', c: pin, r: 2.5, fill: 'ink0' }, // the pin, on the elbow's axis
        { kind: 'line', a: { x: hand.x - 5, y: hand.y - 5 }, b: { x: hand.x + 5, y: hand.y + 5 }, w: 3.5, color: 'ink0', cap: 'round' }, // the fixed grips
      ];
    }
    return { back, front };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      {
        kind: 'jointAngle',
        joint: 'elbow',
        neighbors: ['shoulder', 'hand'],
        min: 76,
        max: 104,
        label: 'elbows at your sides, forearms level',
      },
    ],
    end: [
      {
        kind: 'jointAngle',
        joint: 'elbow',
        neighbors: ['shoulder', 'hand'],
        min: 160,
        max: 179,
        label: 'pressed to straight',
      },
    ],
    path: { track: 'hand', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'elbow', tol: 0.5, label: 'the elbow stays at your side' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'no leaning into the bar' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips still' },
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'no leg drive' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return { id: p.id, chains: pushdownChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, X, 30) };
}

export const tricepsPushdown = pushdown({ id: 'triceps_pushdown', implement: 'cable' });
/** The rope member: two tails past the fists, opening through the rep, and a couple of degrees more
 *  range than the bar's stop allows — see `implement` for why a comment was not enough. */
export const ropePushdown = pushdown({ id: 'rope_pushdown', implement: 'rope', phiBottom: 7 });
export const singleArmPushdown = pushdown({ id: 'single_arm_pushdown', implement: 'cable', singleArm: true });
export const machineTricepsExt = pushdown({ id: 'machine_triceps_ext', implement: 'machine' });

/**
 * triceps_kickback (2026-08-25) — the member this file's header sent away for its own authoring,
 * now authored: the HINGED skeleton it needed. The torso holds an RDL-like forward hinge, the
 * UPPER ARM is pinned parallel to the floor behind her ("upper arm still" — the card's own first
 * cue), and only the forearm sweeps, from hanging straight down to extended straight back. The
 * same elbow discipline as every file-mate; the different skeleton is the whole reason it waited.
 */
export const tricepsKickback: Rig = (() => {
  /* The hinged, braced body: torso ~65° forward of vertical, knees soft, off-hand on the bench. */
  const KB_HIP: Vec2 = { x: 150, y: 130 };
  const KB_SHOULDER: Vec2 = { x: KB_HIP.x + ATHLETE.torso * 0.9, y: KB_HIP.y - ATHLETE.torso * 0.42 };
  const KB_HEAD: Vec2 = { x: KB_SHOULDER.x + 14, y: KB_SHOULDER.y - 7 };
  const KB_KNEE: Vec2 = { x: 155, y: 157 };
  const KB_ANKLE: Vec2 = { x: 160, y: 186 };
  /*
   * The pinned upper arm: straight BACK from the shoulder, level with the floor — and back means
   * toward the hip, which is −x for this figure.
   *
   * It was +x. The spine runs hip → shoulder in +x and the head continues past the shoulder to
   * x = 207, so an elbow at x = 216 was pinned in FRONT of the athlete's own face: the clip showed
   * an arm reaching forward and extending further forward, which is not a kickback and is not any
   * exercise. The docstring above it already said "behind"; only the sign disagreed.
   */
  const KB_ELBOW: Vec2 = { x: KB_SHOULDER.x - ATHLETE.upperArm * 0.92, y: KB_SHOULDER.y + 2 };
  /* Forearm sweep from straight-down (φ=0) to level-behind (φ=88): interior = 90° + φ·(90/88)… no —
     measured directly: at φ=0 interior ≈ 92°, at φ=88 the forearm continues the upper arm ≈ 178°.
     The lockout ceiling (179°) therefore caps the top by 1° of margin, exactly as designed. */
  /* φ=0 hangs the forearm straight down under the elbow; φ grows toward the athlete's BACK. */
  const handAtK = (phi: number): Vec2 => {
    const r = (phi * Math.PI) / 180;
    return { x: KB_ELBOW.x - F * Math.sin(r), y: KB_ELBOW.y + F * Math.cos(r) };
  };
  const PHI_FROM = 4; // hanging under the elbow
  const PHI_TO = 80; // extended back — the measured interior lands ~175°, shy of the window's 178
  const ARC = Array.from({ length: 17 }, (_, i) => handAtK(lerp(PHI_FROM, PHI_TO, i / 16)));

  const poseAt = (rom: number): Pose => {
    const hand = handAtK(lerp(PHI_FROM, PHI_TO, rom));
    const offElbow: Vec2 = { x: KB_SHOULDER.x + 10, y: KB_SHOULDER.y + 18 };
    const offHand: Vec2 = { x: KB_SHOULDER.x + 16, y: KB_SHOULDER.y + 38 };
    return {
      headR: ATHLETE.headR,
      j: {
        head: KB_HEAD,
        shoulder: KB_SHOULDER,
        hip: KB_HIP,
        knee: KB_KNEE,
        ankle: KB_ANKLE,
        heel: { x: KB_ANKLE.x - 8, y: FLOOR_Y },
        toe: { x: KB_ANKLE.x + 15, y: FLOOR_Y },
        elbow: KB_ELBOW,
        hand,
        farShoulder: far(KB_SHOULDER, -6, 1),
        farElbow: far(offElbow, -6, 1),
        farHand: far(offHand, -6, 1),
        farHip: far(KB_HIP, -6, 1),
        farKnee: far(KB_KNEE, -6, 1),
        farAnkle: far(KB_ANKLE, -6, 1),
        farHeel: far({ x: KB_ANKLE.x - 8, y: FLOOR_Y }, -6, 0),
        farToe: far({ x: KB_ANKLE.x + 15, y: FLOOR_Y }, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const phi = lerp(PHI_FROM, PHI_TO, rom);
    const dir: Vec2 = { x: Math.cos((phi * Math.PI) / 180), y: -Math.sin((phi * Math.PI) / 180) };
    return {
      back: [
        /* the bench her off-hand braces on */
        { kind: 'rect', x: KB_SHOULDER.x - 2, y: KB_SHOULDER.y + 40, width: 40, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
        { kind: 'line', a: { x: KB_SHOULDER.x + 18, y: KB_SHOULDER.y + 47 }, b: { x: KB_SHOULDER.x + 18, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
        ...sampledPathTicks(ARC),
      ],
      front: dumbbellSide(pose.j.hand, dir),
    };
  };

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 78, max: 108, label: 'forearm hanging — the honest start' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 155, max: 178, label: 'extended straight back — the squeeze' },
    ],
    path: { track: 'hand', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'elbow', tol: 0.5, label: 'the upper arm is pinned — only the forearm moves' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the hinge holds — no rising out of it' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips still' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return { id: 'triceps_kickback', chains: pushdownChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 168, 36) };
})();
