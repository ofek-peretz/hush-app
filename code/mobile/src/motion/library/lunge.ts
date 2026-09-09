/**
 * lunge — the split-stance family: one leg in front carrying the work, one behind, and the body
 * sinking between them. Side view, because a split stance IS a side-view fact — from the front the
 * two legs collapse into one another.
 *
 * ── THE ONE MOVEMENT UNDER ALL FOUR NAMES ───────────────────────────────────────────────────────
 * Every member holds the same canon, and it is the cue printed on every card in this family: the
 * body sinks BETWEEN the feet, never forward onto the knee. "Drop straight down" (bulgarian,
 * reverse lunge) means the hip does not drift out over the toes — the fault that makes lunges
 * hurt — and it is asserted as a corridor about the hip's chord, not as a vertical rail: descending
 * into a split with the shin tilting over the foot takes the hip BACK as it goes down, because the
 * thigh has to go somewhere. The torso stays tall, and the drive is "through the front heel": the
 * front foot is `pointFixed` and the rep is the hip rising off it.
 *
 * ── HOW THE SKELETON IS SOLVED (rebuilt for the audit, 2026-09-03) ──────────────────────────────
 * The front SHIN is the driver, and the hip follows it. The shin's forward tilt runs from a soft
 * 4° standing to `shinLeanDeg` at the bottom on `leads(0.3)` — the knee travels out over the toes
 * first and settles by rom 0.7 (iron rule 12: the knee leads a lunge) — and the hip is then SOLVED
 * one thigh behind the knee at the height the rep gives it. Solved that way the knee's path is
 * monotonic by construction. It used to be the other way round — the hip on a straight line, the
 * knee by IK from the planted foot — and the knee then bowed 10u forward at rom 0.4 and came 12u
 * back by the bottom: a leg pumping inside one descent, measured on every member.
 * The BACK knee is IK from the rear anchor (bend −1: it folds down and under, toward the floor).
 *
 * The STEP is its own clock. On the stepping members the travelling foot leaves the floor on an
 * arc (6u at its apex), lands by rom 0.45 (`leads(0.55)`) and stays put, and the body sinks after
 * it. Before this it slid along the floor for the whole 2 s of the eccentric, in step with the hip
 * — a foot that never lifted, on a movement whose whole coaching point is the step.
 *
 * ── MEMBERS, AND WHAT ACTUALLY DIFFERS ──────────────────────────────────────────────────────────
 *   · `bulgarian_split_squat` — the rear foot is ELEVATED on the bench (its anchor is up at pad
 *     height, toes down on it); the front leg carries nearly everything, and the torso inclines
 *     12° at the bottom — the mass has to sit over the working foot, not over the bench.
 *   · `reverse_lunge` — the front foot is planted; the REAR foot steps back and lands on its ball.
 *   · `walking_lunge` — the rear foot stays; the FRONT foot steps out and the body travels over
 *     it (an in-place forward lunge: canon films the rep, not the walk between reps).
 *   · `curtsy_lunge` — a reverse lunge whose rear foot lands ACROSS the midline. Depth carries the
 *     cross (see the member note): the rear leg is built in 3D and the camera stands 35° round.
 *   · `step_up` — NOT here, deliberately: its rear foot must LEAVE the floor, and this family's
 *     model pins both feet. See the note at the end of this file for what the validator caught.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2, Vec3 } from '../types';
import { lerp, twoBoneIK, twoBoneIK3 } from '../geometry';
import { leads, lags } from '../curves';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, dumbbellSide, floorScene } from '../kit';
import { FLOOR_Y, far } from '../bodies';
import { project, type Camera } from '../camera';

const T = ATHLETE.thigh;
const S = ATHLETE.shank;
const DOWN: Vec2 = { x: 1, y: 0 };
const deg = (d: number): number => (d * Math.PI) / 180;

/** The knee leads: the front shin reaches its bottom tilt at rom 0.7 and the hip finishes under it. */
const SHIN_LEADS = leads(0.3);
/** The stepping foot lands by rom 0.45, and the descent is what follows the landing. */
const STEP = leads(0.55);
/** The torso holds tall through the first fifth of the descent and inclines as the bottom nears. */
const LEAN_LAGS = lags(0.2);
/** The front shin standing: a soft 4° over the foot, not a locked plumb line. */
const SHIN_TOP_DEG = 4;
/** The stepping foot's arc apex — a step clears the floor, it does not skate along it. */
const STEP_LIFT = 6;

interface LungeParams {
  id: string;
  /** The rear anchor: on the floor behind her, or up on the bench (bulgarian). */
  rearAnchor: Vec2;
  /** Rear-knee fold direction: −1 folds down-and-under (lunges), +1 folds behind (step-up trail). */
  rearBend: 1 | -1;
  /** The front foot's plant. */
  frontAnkle: Vec2;
  /**
   * How bent the FRONT knee is at the bottom, in degrees (interior angle). With the shin tilted
   * `shinLeanDeg` forward, a horizontal thigh is `90 − shinLeanDeg`.
   */
  bottomKneeDeg: number;
  /** The front shin's forward tilt at the bottom — the knee out over the toes, as every card cues. */
  shinLeanDeg: number;
  /** How far the torso inclines at the bottom, degrees from vertical. */
  leanDeg: number;
  /**
   * Standing, the hip sits this much below the straight-leg top. The bulgarian needs 3: with the
   * rear foot up behind on the bench the rear leg cannot reach a fully locked stand (81u wanted of
   * a 77u leg), and a soft front knee at the top — 154°, which is how one actually stands on a
   * bulgarian — brings the anchor into reach without pulling the foot off the pad.
   */
  softTop?: number;
  /** The bench under the bulgarian's elevated rear foot. */
  bench?: { x0: number; x1: number; top: number };
  /**
   * WHICH FOOT ARRIVES — the one thing that separates a reverse lunge from a walking one.
   *
   * A reverse lunge STEPS BACK: the front foot is planted and the rear one travels to meet the
   * floor behind. A walking lunge STEPS FORWARD: the rear foot is the one that stays, the front
   * foot arrives out in front, and the body travels over it. Omitted, both feet are placed once
   * and never move — the split squats.
   */
  stepping?: 'front' | 'rear';
  /**
   * The curtsy's cross, in depth. The rear foot lands `crossZ` toward the camera of the working
   * leg's plane (past it — that is the cross), the far hip sits a true half-pelvis behind, the
   * rear leg is solved in 3D between them, and the camera orbits by `azimuth` so the cross reads.
   */
  cross?: { crossZ: number; azimuth: number };
  implement: 'db' | 'bodyweight';
  /** The range statement's distance left of the hip's leftmost x — clear of the trunk (±6u). */
  ticksLeft: number;
}

/** A true half-pelvis, hip joint to hip joint, for the one member that builds its rear leg in 3D. */
const HALF_PELVIS = 14;

function lunge(p: LungeParams): Rig {
  /*
   * ── THE BOTTOM, STATED THE WAY A COACH STATES IT ──────────────────────────────────────────────
   * The front shin tilted `shinLeanDeg` over the planted foot, the knee bent to `bottomKneeDeg`.
   * The thigh's direction falls out of those two angles, so the hip lands where it has to: for a
   * 15° shin and an 80° knee that is a thigh 5° above horizontal, and a hip 30u behind the ankle.
   */
  const lamB = deg(p.shinLeanDeg);
  const kb = deg(p.bottomKneeDeg);
  const KNEE_BOTTOM: Vec2 = { x: p.frontAnkle.x + S * Math.sin(lamB), y: p.frontAnkle.y - S * Math.cos(lamB) };
  const HIP_BOTTOM: Vec2 = {
    x: KNEE_BOTTOM.x - T * Math.sin(lamB + kb),
    y: KNEE_BOTTOM.y + T * Math.cos(lamB + kb),
  };
  /** Standing: the hip at the straight-leg top (less `softTop`), solved a thigh behind the 4° shin. */
  const HIP_TOP_Y = FLOOR_Y - ATHLETE.ankleH - S - T + 1 + (p.softTop ?? 0);
  const kneeFor = (ankle: Vec2, lam: number): Vec2 => ({ x: ankle.x + S * Math.sin(lam), y: ankle.y - S * Math.cos(lam) });
  const hipBehind = (knee: Vec2, y: number): Vec2 => ({ x: knee.x - Math.sqrt(Math.max(0, T * T - (y - knee.y) * (y - knee.y))), y });
  const HIP_TOP: Vec2 = hipBehind(kneeFor(p.frontAnkle, deg(SHIN_TOP_DEG)), HIP_TOP_Y);

  /*
   * The rear foot's landing is the authored anchor, unclamped. It used to be pulled into reach
   * along the ray from the STANDING hip — and on the stepping members the standing hip is 90u from
   * where the foot lands, so the clamp lifted the anchor 12u off the floor (184 → 172.4) and every
   * lunge in the family kneeled on air, rear toes 13.6u up. The foot lands when the hip is already
   * on its way down and 34u closer; the anchors below are placed so that moment is in reach
   * (measured: 66u of a 76u leg at rom 0.45), and the bulgarian's `softTop` does the same for the
   * one member whose foot never moves. (audit, 2026-09-03)
   */
  const REAR_FOOT = p.rearAnchor;

  /** Where each foot is at rom 0, before the step that this member is named for. */
  const REAR_START: Vec2 = p.stepping === 'rear' ? { x: HIP_TOP.x - 4, y: p.frontAnkle.y } : REAR_FOOT;
  const FRONT_START: Vec2 = p.stepping === 'front' ? { x: REAR_FOOT.x + 15, y: p.frontAnkle.y } : p.frontAnkle;
  const HIP_START_X = p.stepping === 'front' ? REAR_FOOT.x + 7 : HIP_TOP.x;

  /** The curtsy's camera — a pure spin about the vertical, declared so a leaning trunk cannot tilt it. */
  const CAM: Camera | undefined = p.cross ? { azimuth: p.cross.azimuth, pivotX: 176, axis: { x: 0, y: -1 } } : undefined;

  const poseAt = (rom: number): Pose => {
    /* rom 0 = TALL (the rep opens standing and lowers first); rom 1 = the bottom. */
    const st = STEP(rom);
    const lift = STEP_LIFT * Math.sin(Math.PI * st);
    const frontAnkle: Vec2 = p.stepping === 'front' ? { x: lerp(FRONT_START.x, p.frontAnkle.x, st), y: p.frontAnkle.y - lift } : p.frontAnkle;
    const rearFoot: Vec2 = p.stepping === 'rear' ? { x: lerp(REAR_START.x, REAR_FOOT.x, st), y: lerp(REAR_START.y, REAR_FOOT.y, st) - lift } : REAR_FOOT;
    const hipY = lerp(HIP_TOP.y, HIP_BOTTOM.y, rom);
    let hip: Vec2;
    let frontKnee: Vec2;
    if (p.stepping === 'front') {
      /*
       * The walking member's hip travels FORWARD with the step — the body goes over the arriving
       * foot — so its x rides the step's own lead and the knee is IK from the flying ankle; solved
       * behind a shin that is still in the air, the hip would sit still while the foot flew and
       * then lurch 30u at the landing. With the step carrying the knee forward, it is monotonic
       * here too (145.8 → 205.6, measured at 20 samples).
       */
      hip = { x: lerp(HIP_START_X, HIP_BOTTOM.x, SHIN_LEADS(rom)), y: hipY };
      frontKnee = twoBoneIK(hip, frontAnkle, T, S, -1);
    } else {
      const lam = deg(lerp(SHIN_TOP_DEG, p.shinLeanDeg, SHIN_LEADS(rom)));
      frontKnee = kneeFor(frontAnkle, lam);
      hip = hipBehind(frontKnee, hipY);
    }
    /* The trailing leg is solved from the FAR hip, which is the joint it is actually drawn from. */
    const farHipJ = p.cross ? { x: hip.x, y: hip.y + 1 } : far(hip, -6, 1);
    let rearKnee: Vec2;
    let z: Record<string, number> | undefined;
    if (p.cross) {
      /*
       * THE CROSS. The far hip is a true half-pelvis behind the working leg's plane; the rear foot
       * starts beside the near one, under its own hip, and lands `crossZ` PAST the working leg —
       * toward the camera. The leg between them is solved in 3D on canonical bones (a 2D solve with
       * a depth painted on would draw a shank 28u of depth longer than it is), and the knee folds
       * forward-and-down, tucked behind the front calf, which is the curtsy's kneel.
       */
      const fz = lerp(-HALF_PELVIS + 2, p.cross.crossZ, st);
      const hip3: Vec3 = { x: farHipJ.x, y: farHipJ.y, z: -HALF_PELVIS };
      const foot3: Vec3 = { x: rearFoot.x, y: rearFoot.y, z: fz };
      const knee3 = twoBoneIK3(hip3, foot3, T, S, { x: 0.8, y: 0.6, z: 0 });
      rearKnee = { x: knee3.x, y: knee3.y };
      z = { farHip: hip3.z, farKnee: knee3.z, farAnkle: fz, farHeel: fz, farToe: fz };
    } else {
      rearKnee = twoBoneIK(farHipJ, rearFoot, T, S, p.rearBend);
    }
    /* The torso: tall, inclining to `leanDeg` late in the descent — the mass comes over the working foot. */
    const lean = deg(lerp(0, p.leanDeg, LEAN_LAGS(rom)));
    const shoulder: Vec2 = { x: hip.x + 2 + ATHLETE.torso * Math.sin(lean), y: hip.y - ATHLETE.torso * Math.cos(lean) };
    const head: Vec2 = { x: shoulder.x + 1, y: shoulder.y - ATHLETE.neck };
    /* Arms hang plumb with the load at the sides, riding the body's descent. */
    const elbow: Vec2 = { x: shoulder.x + 3, y: shoulder.y + ATHLETE.upperArm };
    const hand: Vec2 = { x: elbow.x + 1, y: elbow.y + ATHLETE.foreArm };
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip,
        knee: frontKnee,
        ankle: frontAnkle,
        heel: { x: frontAnkle.x - 8, y: frontAnkle.y + ATHLETE.ankleH },
        toe: { x: frontAnkle.x + 14, y: frontAnkle.y + ATHLETE.ankleH },
        elbow,
        hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: farHipJ,
        farKnee: rearKnee,
        farAnkle: rearFoot,
        farHeel: { x: rearFoot.x - 4, y: rearFoot.y + 6 },
        farToe: { x: rearFoot.x + 8, y: rearFoot.y + 7 },
      },
      ...(z ? { z } : {}),
    };
  };

  /** A flat point through the member's camera (identity without one) — the equipment is scene knowledge. */
  const P = (q: Vec2): Vec2 => {
    if (!CAM) return q;
    const r = project(q, 0, CAM);
    return { x: r.x, y: r.y };
  };

  const decorAt = (rom: number, j?: Record<string, Vec2>): Decor => {
    const J = j ?? poseAt(rom).j;
    /*
     * The range statement stands clear of the body. It sat at HIP_TOP.x − 30, which on the
     * walking member — whose hip starts 53u further back — was inside the trunk for the whole rep,
     * and on the split members was covered by the descending torso from rom 0.75. Left of the
     * hip's leftmost x by `ticksLeft` it is on paper at every rom. (audit, 2026-09-03)
     */
    const tx = Math.min(HIP_START_X, HIP_BOTTOM.x) - p.ticksLeft;
    const back: Primitive[] = [...barPathTicks(P({ x: tx, y: 0 }).x, HIP_TOP.y, HIP_BOTTOM.y)];
    if (p.bench) {
      back.push(
        { kind: 'rect', x: p.bench.x0, y: p.bench.top, width: p.bench.x1 - p.bench.x0, height: 8, rx: 3, fill: 'paper3', stroke: 'ink3', w: 2 },
        { kind: 'line', a: { x: p.bench.x0 + 5, y: p.bench.top + 8 }, b: { x: p.bench.x0 + 5, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
        { kind: 'line', a: { x: p.bench.x1 - 5, y: p.bench.top + 8 }, b: { x: p.bench.x1 - 5, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
      );
    }
    /* Neutral grip at the side: the handle runs front-to-back, so side-on it shows its length with
       a plate at each end — the farmer's-carry silhouette. End-on is what a FRONT camera sees. */
    const front: Primitive[] =
      p.implement === 'db' ? [...dumbbellSide(J.farHand, DOWN), ...dumbbellSide(J.hand, DOWN)] : [];
    return { back, front };
  };

  /*
   * THE CORRIDOR. The hip's honest path is not a rail: with the knee leading, the hip goes BACK
   * first (the shin tilts, the thigh has to go somewhere) and then down, bowing behind the chord
   * from standing to the bottom by up to 8u (measured; the walking member's step carries it 7u
   * the other way). The predicate holds it within that bow of the chord — forward of the chord by
   * the same amount would be the fault, the hip diving out over the knee.
   */
  const CHORD_TOL = 9;

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'contactY', a: 'hip', y: HIP_TOP.y, tol: 2, label: 'standing tall' },
    ],
    end: [
      { kind: 'contactY', a: 'hip', y: HIP_BOTTOM.y, tol: 2, label: 'sink between the feet — the back knee toward the floor' },
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 70, max: 115, label: 'front knee square, tracking the toes' },
    ],
    path: { kind: 'line', track: 'hip', tol: CHORD_TOL, dir: { x: HIP_BOTTOM.x - HIP_START_X, y: HIP_BOTTOM.y - HIP_TOP.y } },
    invariants: [
      /* The planted foot is the one that ISN'T stepping — and which one that is IS the exercise. */
      ...(p.stepping === 'front'
        ? [{ kind: 'pointFixed' as const, point: 'farAnkle', tol: 0.5, label: 'the rear foot stays put — the FRONT foot is the one that steps' }]
        : [{ kind: 'pointFixed' as const, point: 'ankle', tol: 0.5, label: 'the front foot is planted — the drive is through its heel' }]),
      ...(p.stepping == null
        ? [{ kind: 'pointFixed' as const, point: 'farAnkle', tol: 0.5, label: 'the rear foot stays where it was placed' }]
        : []),
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: p.leanDeg + 2, label: 'torso tall — no diving over the knee' },
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
    ...(CAM ? { camera: CAM } : {}),
    formspec,
    poseAt,
    decorAt,
    scene: floorScene(FLOOR_Y, 176, 42),
  };
}

/** The floor lunges: front foot planted ahead, rear foot's ball on the floor behind. */
const FRONT_PLANT: Vec2 = { x: 196, y: FLOOR_Y - ATHLETE.ankleH };
/*
 * The rear plant: 66u behind the front (a 75 cm split). It was 138 — and at 138 the rear knee
 * folded to 55° at the bottom, under the angle at which two fleshed limbs merge into one wedge.
 * At 130 it bottoms at 75°, and the landing is still in reach of the descending hip. (audit, 2026-09-03)
 */
const REAR_PLANT: Vec2 = { x: 130, y: FLOOR_Y - ATHLETE.ankleH - 2 }; // on the ball, heel up
/** Bench pad height for the bulgarian's elevated rear foot. */
const PAD_TOP = FLOOR_Y - 32;

/*
 * The bottom, shared by the floor members: shin 15° over the toes, knee 80° — a thigh 5° above
 * parallel and the hip 30u behind the ankle. The shin was vertical at 90°, and vertical is what
 * made the knee bow out and back inside one descent (see the header). (audit, 2026-09-03)
 */
const SHIN_LEAN = 15;
const BOTTOM_KNEE = 80;

export const reverseLungeRig = lunge({
  id: 'reverse_lunge',
  stepping: 'rear', // the front foot is planted; the REAR foot is the one that travels back
  rearAnchor: REAR_PLANT,
  rearBend: -1,
  frontAnkle: FRONT_PLANT,
  bottomKneeDeg: BOTTOM_KNEE,
  shinLeanDeg: SHIN_LEAN,
  leanDeg: 5, // a lunge's torso is tall; five degrees is the natural counterbalance, not a hinge
  implement: 'db',
  ticksLeft: 26,
});

export const walkingLungeRig = lunge({
  id: 'walking_lunge',
  stepping: 'front', // she steps FORWARD onto the front foot and the body travels over it
  rearAnchor: REAR_PLANT,
  rearBend: -1,
  frontAnkle: FRONT_PLANT,
  bottomKneeDeg: BOTTOM_KNEE,
  shinLeanDeg: SHIN_LEAN,
  leanDeg: 5,
  implement: 'db',
  ticksLeft: 26,
});

/*
 * curtsy_lunge (batch 2, 2026-08-26; restaged in depth for the audit, 2026-09-03) — the reverse
 * lunge with the rear foot reaching BACK AND ACROSS the midline. The cross is a frontal-plane
 * fact, and from the pure side view it folded into nothing: the audit measured this clip 1.3u
 * from reverse_lunge on average — two ids, one drawing. So the rear leg is built in 3D — the foot
 * lands 14u past the working leg's plane, 31u behind the front foot (a curtsy tucks closer than a
 * reverse lunge steps), the far hip a true half-pelvis behind — and the camera stands 35° toward
 * her front, where the crossing leg is seen going behind the working one and the kneel tucks its
 * knee behind the front calf. Negative azimuth, not positive: from behind, the crossed foot's depth
 * carries the whole rear leg in FRONT of the working leg and the duotone swaps the legs' inks.
 */
export const curtsyLungeRig = lunge({
  id: 'curtsy_lunge',
  stepping: 'rear', // a curtsy is a reverse lunge that crosses — the rear foot is what travels
  rearAnchor: { x: 165, y: FLOOR_Y - ATHLETE.ankleH - 2 },
  rearBend: -1,
  frontAnkle: FRONT_PLANT,
  bottomKneeDeg: 78, // a curtsy finishes a shade deeper
  shinLeanDeg: SHIN_LEAN,
  leanDeg: 5,
  cross: { crossZ: 14, azimuth: -35 },
  implement: 'db',
  ticksLeft: 26,
});

/*
 * split_squat (2026-09-10, the bodyweight-only room) — the reverse lunge's bottom without the step:
 * both feet planted the whole rep, rear heel up on the ball, and the body sinks BETWEEN them. No
 * implement: the hands ride at the hips. It is the unilateral quad lift a room with nothing in it
 * still has, and the one a beginner learns before she is handed a dumbbell.
 */
export const splitSquatRig = lunge({
  id: 'split_squat',
  /* The rear foot is planted for the WHOLE rep, so it stands closer than a lunge steps (46u behind
     the front plant, not 66): at the reverse lunge's distance the rear shank measured 50.9 against a
     canonical 37 at the top — a leg that cannot reach the floor from a locked hip. `softTop` is the
     bulgarian's own allowance for the same fact: the rear leg never fully locks in a split stance. */
  rearAnchor: { x: 150, y: FLOOR_Y - ATHLETE.ankleH - 2 },
  rearBend: -1,
  frontAnkle: FRONT_PLANT,
  bottomKneeDeg: BOTTOM_KNEE,
  shinLeanDeg: SHIN_LEAN,
  leanDeg: 5,
  softTop: 3,
  implement: 'bodyweight',
  ticksLeft: 26,
});

export const bulgarianSplitSquatRig = lunge({
  id: 'bulgarian_split_squat',
  /*
   * The rear foot rests ON the pad, toes down, 76u behind the front plant: at 128 the rear knee
   * folded to 53° at the bottom (the merge threshold is 55°); at 124, with the front foot at 200,
   * it bottoms at 64°. The bench moved back with it. (audit, 2026-09-03)
   */
  rearAnchor: { x: 124, y: PAD_TOP - 3 },
  rearBend: -1,
  frontAnkle: { x: 200, y: FLOOR_Y - ATHLETE.ankleH },
  bottomKneeDeg: BOTTOM_KNEE,
  shinLeanDeg: SHIN_LEAN,
  leanDeg: 12, // the mass over the working foot: a bulgarian's torso inclines, it does not stay plumb
  softTop: 3,
  bench: { x0: 104, x1: 144, top: PAD_TOP },
  implement: 'db',
  ticksLeft: 40, // past the rear shank, which crosses a 26u line at the very height the ticks end
});

/*
 * ⛔ `step_up` IS NOT IN THIS FILE, AND THE VALIDATOR IS WHY. The first authoring pinned BOTH feet
 * (this family's model) with the front foot on the box — and a step-up's rear foot LEAVES the
 * floor; holding it planted made "standing tall on the box" geometrically impossible (rear-leg
 * span 103u on a 77u leg), the IK stretched, and the head left the frame. The framing law and the
 * FormSpec caught all of it. A step-up needs a travelling rear foot — its own mechanism, its own
 * authoring — and drawing it wrong to fill a slot is exactly what §0 forbids. It stays uncovered
 * until it can be drawn true.
 */
