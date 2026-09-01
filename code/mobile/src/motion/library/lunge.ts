/**
 * lunge — the split-stance family: one leg in front carrying the work, one behind, and the body
 * dropping STRAIGHT DOWN between them. Side view, because a split stance IS a side-view fact — from
 * the front the two legs collapse into one another.
 *
 * ── THE ONE MOVEMENT UNDER ALL FOUR NAMES ───────────────────────────────────────────────────────
 * Every member holds the same canon, and it is the cue printed on every card in this family: the
 * body travels VERTICALLY. "Drop straight down" (bulgarian, reverse lunge) is drawn as the hip's
 * tracked path being `vertical` — not forward onto the knee, which is the fault that makes lunges
 * hurt. The front shin stays near its plant, the torso stays tall, and the drive is "through the
 * front heel": the front foot is `pointFixed` and the rep is the hip rising off it.
 *
 * ── HOW THE SKELETON IS SOLVED ──────────────────────────────────────────────────────────────────
 * The two feet are anchors. The hip descends its vertical line; the FRONT knee is solved by IK from
 * the planted front ankle (bend +1: it folds forward over the foot, tracking the toes), and the
 * BACK knee by IK from the rear anchor (bend −1: it folds down and under, toward the floor). Depth
 * bottoms out where the back knee approaches the floor — the honest bottom of a lunge — asserted by
 * `jointBelow` on the front hip vs its own start rather than by a posed frame.
 *
 * ── MEMBERS, AND WHAT ACTUALLY DIFFERS ──────────────────────────────────────────────────────────
 *   · `bulgarian_split_squat` — the rear foot is ELEVATED on the bench (its anchor is up at pad
 *     height, toes down on it); deepest member, and the front leg carries nearly everything.
 *   · `reverse_lunge` / `walking_lunge` — both feet on the floor. The STEP that distinguishes them
 *     happens between reps, not during the working rep, and canon (§0, two identical reps) films
 *     the rep itself: in-place they are the same drawing, and drawing the walk would be animating
 *     the rest, not the work. Both carry dumbbells at the sides.
 *   · `step_up` — NOT here, deliberately: its rear foot must LEAVE the floor, and this family's
 *     model pins both feet. See the note at the end of this file for what the validator caught.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, lerpV, twoBoneIK, withinReach } from '../geometry';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, dumbbellSide, floorScene, padStroke } from '../kit';
import { FLOOR_Y, far } from '../bodies';

const T = ATHLETE.thigh;
const S = ATHLETE.shank;
const DOWN: Vec2 = { x: 1, y: 0 };

interface LungeParams {
  id: string;
  /** The rear anchor: on the floor behind her, or up on the bench (bulgarian). */
  rearAnchor: Vec2;
  /** Rear-knee fold direction: −1 folds down-and-under (lunges), +1 folds behind (step-up trail). */
  rearBend: 1 | -1;
  /** The front foot's plant. */
  frontAnkle: Vec2;
  /**
   * How bent the FRONT knee is at the bottom, in degrees. Everything about where the hip finishes
   * follows from it — see `HIP_BOTTOM`.
   */
  bottomKneeDeg: number;
  /** The bench under the bulgarian's elevated rear foot. */
  bench?: { x0: number; x1: number; top: number };
  /**
   * WHICH FOOT ARRIVES — the one thing that separates a reverse lunge from a walking one, and the
   * one thing neither clip was drawing.
   *
   * `reverse_lunge` and `walking_lunge` were declared with byte-identical parameter sets: same
   * anchors, same hip travel, same implement. Two ids, one drawing, and the difference between them
   * is not decoration — it is the whole coaching point. A reverse lunge STEPS BACK: the front foot
   * is planted and the rear one travels to meet the floor behind. A walking lunge STEPS FORWARD:
   * the rear foot is the one that stays, the front foot arrives out in front, and the body travels
   * over it. Omitted, both feet are placed once and never move — the split squats.
   */
  stepping?: 'front' | 'rear';
  implement: 'db' | 'bodyweight';
}

function lunge(p: LungeParams): Rig {
  /*
   * ── WHERE THE HIP GOES, AND WHY IT IS SOLVED RATHER THAN TYPED (rebuilt 2026-08-29) ────────────
   *
   * The hip used to be two authored numbers — an x pinned 12u behind the front plant for the whole
   * rep, and a y lerped between two constants. Both were wrong, and the second hid the first.
   *
   * At the bottom the front SHIN ended up leaning BACKWARDS: the knee sat 32u behind its own ankle,
   * because a hip only 12u back cannot get a 40u thigh and a 37u shank down to a planted foot any
   * other way. That is the opposite of the cue every one of these four cards carries — "knee tracks
   * the toes", "drive through the front heel" — and it is the position that makes lunges hurt.
   *
   * Solved, the bottom is stated the way a coach states it: the front shin VERTICAL over the planted
   * foot, and the knee bent to `bottomKneeDeg`. The thigh's direction falls out of that angle, so
   * the hip lands where it has to — for 90° that is a horizontal thigh, one thigh-length behind the
   * ankle and at knee height. The hip therefore travels BACK as it descends, which is what stepping
   * back into a lunge actually is, and what a hip pinned in x could never show.
   */
  const kb = (p.bottomKneeDeg * Math.PI) / 180;
  /** The front knee at the bottom: directly above the planted foot, a shank up. */
  const KNEE_BOTTOM: Vec2 = { x: p.frontAnkle.x, y: p.frontAnkle.y - S };
  /** And the hip, one thigh from it in the direction that opens the knee to `bottomKneeDeg`. */
  const HIP_BOTTOM: Vec2 = {
    x: KNEE_BOTTOM.x - T * Math.sin(kb),
    y: KNEE_BOTTOM.y + T * Math.cos(kb),
  };
  /** Standing tall, hips over the planted foot: the top of the rep, not a shade into it. */
  const HIP_TOP: Vec2 = { x: p.frontAnkle.x - 6, y: FLOOR_Y - ATHLETE.ankleH - S - T + 1 };
  const HIP_X = HIP_BOTTOM.x;

  /*
   * The rear foot is clamped into the trailing leg's reach ONCE, against the tallest position of
   * the rep, and then it never moves again.
   *
   * The authored anchor is where the foot ought to land, and on the walking and curtsy members that
   * landing sits 79 and 82 units from the hip against a whole leg of 77. `twoBoneIK` answers an
   * out-of-reach target by putting the knee a true thigh from the hip and letting the shank span
   * whatever is left — 42.9 and 46.4 against a canonical 37.
   *
   * Clamping per FRAME would fix the shank and break something worse: the foot would creep as the
   * hip descended and the anchor came back into range, and `pointFixed` on the rear ankle — "the
   * rear foot stays where it was placed" — is the invariant that makes a lunge a lunge. Clamping
   * against the top of the rep, where the hip is furthest away, gives one static foot that every
   * lower position can also reach.
   */
  const REAR_FOOT = withinReach(HIP_TOP, p.rearAnchor, (T + S) * 0.99);

  /** Where each foot is at rom 0, before the step that this member is named for. */
  const REAR_START: Vec2 = p.stepping === 'rear' ? { x: HIP_TOP.x - 4, y: p.frontAnkle.y } : REAR_FOOT;
  const FRONT_START: Vec2 = p.stepping === 'front' ? { x: REAR_FOOT.x + 15, y: p.frontAnkle.y } : p.frontAnkle;
  const HIP_START_X = p.stepping === 'front' ? REAR_FOOT.x + 7 : HIP_TOP.x;

  const poseAt = (rom: number): Pose => {
    /* rom 0 = TALL (the rep opens standing and lowers first); rom 1 = the bottom. */
    const hip: Vec2 = { x: lerp(HIP_START_X, HIP_BOTTOM.x, rom), y: lerp(HIP_TOP.y, HIP_BOTTOM.y, rom) };
    const frontAnkle: Vec2 = lerpV(FRONT_START, p.frontAnkle, rom);
    const rearFoot: Vec2 = lerpV(REAR_START, REAR_FOOT, rom);
    /* bend −1 — the branch that puts the knee OVER the foot. +1 put it behind the ankle, which
       is the fault, not the lift. */
    const frontKnee = twoBoneIK(hip, frontAnkle, T, S, -1);
    /* The trailing leg is solved from the FAR hip, which is the joint it is actually drawn from.
       Solved from the near hip it came out a thigh long between the wrong two points — 42.2 against
       a canonical 40 once the walking member's hip started travelling, and quietly off before that. */
    const farHipJ = far(hip, -6, 1);
    const rearKnee = twoBoneIK(farHipJ, rearFoot, T, S, p.rearBend);
    const shoulder: Vec2 = { x: hip.x + 2, y: hip.y - ATHLETE.torso };
    const head: Vec2 = { x: shoulder.x + 1, y: shoulder.y - ATHLETE.neck };
    /* Arms hang with the load at the sides, riding the body's descent. */
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
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const back: Primitive[] = [
      // The hip's own travel is the range statement — the "straight down" made visible.
      ...barPathTicks(HIP_TOP.x - 30, HIP_TOP.y, HIP_BOTTOM.y),
    ];
    if (p.bench) {
      back.push(
        { kind: 'rect', x: p.bench.x0, y: p.bench.top, width: p.bench.x1 - p.bench.x0, height: 8, rx: 3, fill: 'paper3', stroke: 'ink3', w: 2 },
        { kind: 'line', a: { x: p.bench.x0 + 5, y: p.bench.top + 8 }, b: { x: p.bench.x0 + 5, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
        { kind: 'line', a: { x: p.bench.x1 - 5, y: p.bench.top + 8 }, b: { x: p.bench.x1 - 5, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
      );
    }
    const front: Primitive[] =
      p.implement === 'db' ? [...dumbbellSide(pose.j.farHand, DOWN), ...dumbbellSide(pose.j.hand, DOWN)] : [];
    return { back, front };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'contactY', a: 'hip', y: HIP_TOP.y, tol: 2, label: 'standing tall' },
    ],
    end: [
      { kind: 'contactY', a: 'hip', y: HIP_BOTTOM.y, tol: 2, label: 'drop straight down — the back knee toward the floor' },
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 70, max: 115, label: 'front knee square, tracking the toes' },
    ],
    /*
     * THE CANON: the hip travels vertically. Forward drift onto the knee is the family's fault —
     * for the SPLIT members, which is what the canon was written about. A walking lunge's hip is
     * supposed to travel: she is stepping forward onto the front foot and the body goes with her,
     * so its path is the step's own line and the vertical rule would forbid the exercise.
     */
    /*
     * A LINE, for every member. It was `vertical` for the non-stepping ones, on the strength of the
     * cue "drop straight down" — but that cue means "do not let the hip drift forward over the
     * toes", not "the hip does not move". Descending into a split with the shin vertical takes the
     * hip 34u BACK, because the thigh has to go somewhere, and declaring a vertical path was the
     * assertion that hid a front knee sitting behind its own ankle.
     */
    path: { kind: 'line', track: 'hip', tol: 1.5, dir: { x: HIP_BOTTOM.x - HIP_START_X, y: HIP_BOTTOM.y - HIP_TOP.y } },
    invariants: [
      /* The planted foot is the one that ISN'T stepping — and which one that is IS the exercise. */
      ...(p.stepping === 'front'
        ? [{ kind: 'pointFixed' as const, point: 'farAnkle', tol: 0.5, label: 'the rear foot stays put — the FRONT foot is the one that steps' }]
        : [{ kind: 'pointFixed' as const, point: 'ankle', tol: 0.5, label: 'the front foot is planted — the drive is through its heel' }]),
      ...(p.stepping == null
        ? [{ kind: 'pointFixed' as const, point: 'farAnkle', tol: 0.5, label: 'the rear foot stays where it was placed' }]
        : []),
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 4, label: 'torso tall — no diving over the knee' },
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
    scene: floorScene(FLOOR_Y, 176, 42),
  };
}

/** The floor lunges: front foot planted ahead, rear foot's ball on the floor behind. */
const FRONT_PLANT: Vec2 = { x: 196, y: FLOOR_Y - ATHLETE.ankleH };
const REAR_PLANT: Vec2 = { x: 138, y: FLOOR_Y - ATHLETE.ankleH - 2 }; // on the ball, heel up
/** Bench pad height for the bulgarian's elevated rear foot. */
const PAD_TOP = FLOOR_Y - 32;

export const reverseLungeRig = lunge({
  id: 'reverse_lunge',
  stepping: 'rear', // the front foot is planted; the REAR foot is the one that travels back
  rearAnchor: REAR_PLANT,
  rearBend: -1,
  frontAnkle: FRONT_PLANT,
  bottomKneeDeg: 90, // front thigh parallel, shin vertical — the depth every lunge cue means
  implement: 'db',
});

export const walkingLungeRig = lunge({
  id: 'walking_lunge',
  stepping: 'front', // she steps FORWARD onto the front foot and the body travels over it
  rearAnchor: REAR_PLANT,
  rearBend: -1,
  frontAnkle: FRONT_PLANT,
  bottomKneeDeg: 90,
  implement: 'db',
});

/*
 * curtsy_lunge (batch 2, 2026-08-26) — the reverse lunge with the rear foot reaching BACK AND
 * ACROSS the midline. The cross is a frontal-plane fact and folds into depth from this camera
 * (the sumo rule: the drawing carries the shape, the written cues carry the stance); what the
 * side view CAN say truthfully is the longer rear reach and the slightly deeper bottom, so the
 * rear plant sits 6u further back and the hip finishes 2u lower than the reverse lunge's.
 */
export const curtsyLungeRig = lunge({
  id: 'curtsy_lunge',
  stepping: 'rear', // a curtsy is a reverse lunge that crosses — the rear foot is what travels
  rearAnchor: { x: 132, y: FLOOR_Y - ATHLETE.ankleH - 2 },
  rearBend: -1,
  frontAnkle: FRONT_PLANT,
  bottomKneeDeg: 86, // a curtsy finishes a shade deeper
  implement: 'db',
});

export const bulgarianSplitSquatRig = lunge({
  id: 'bulgarian_split_squat',
  rearAnchor: { x: 128, y: PAD_TOP - 3 }, // the rear foot rests ON the pad, toes down
  rearBend: -1,
  frontAnkle: { x: 200, y: FLOOR_Y - ATHLETE.ankleH },
  bottomKneeDeg: 88,
  bench: { x0: 108, x1: 148, top: PAD_TOP },
  implement: 'db',
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
