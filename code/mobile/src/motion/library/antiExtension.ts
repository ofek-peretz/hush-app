/**
 * anti_extension — the two lifts whose exercise IS the invariant: the spine refusing to arch
 * while the limbs try to make it. Side view for both; nothing here has a "load path" in the
 * gym sense — the tracked point is simply the part that reaches.
 *
 * ── ab_wheel ────────────────────────────────────────────────────────────────────────────────────
 * Kneeling rollout. The knees are pinned; the HIP ANGLE is the driver (folded kneel → long body),
 * the arms stay near-straight on the wheel, and the wheel's position on the floor FALLS OUT of
 * the geometry — the athlete does not push the wheel, she unfolds and the wheel is where her
 * straight arms meet the floor. "Roll out only as far as you control" is the endpoint window;
 * the pull back is the concentric.
 *
 * ── dead_bug ────────────────────────────────────────────────────────────────────────────────────
 * Supine, lower back pressed into the floor (the trunk is `pointFixed` at both ends — that IS
 * the exercise), while the OPPOSITE arm and leg reach away and return. The near-side pair is the
 * moving pair; the far-side arm and leg hold their start position, drawn faint — which is
 * exactly what a dead bug looks like from the side.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIK } from '../geometry';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { floorScene, sampledPathTicks } from '../kit';
import { FLOOR_Y, far } from '../bodies';

const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;
const T = ATHLETE.thigh;
const S = ATHLETE.shank;

/* ── ab_wheel ──────────────────────────────────────────────────────────────────────────────────── */

export const abWheel: Rig = (() => {
  /** The pinned kneel: knees on the floor, shins back, toes tucked. */
  const KNEE: Vec2 = { x: 148, y: FLOOR_Y - 5 };
  const ANKLE: Vec2 = { x: KNEE.x - S * 0.9, y: FLOOR_Y - 6 };
  /** The hip's fold about the knee: τ = thigh's angle above the floor. Kneeling tall ≈ 82°;
   *  rolled out ≈ 28° — "as far as you control", deliberately shy of flat. */
  /*
   * ⚠️ THE KNEEL IS FOLDED, NOT TALL — the geometry insisted. Kneeling upright (thigh 82°, trunk
   * 74°) puts the shoulder ~70u above the floor, and a 46.6u arm cannot reach a wheel down there:
   * the solve clamped, the IK snapped to 179.8°, and the validator refused it. A real rollout
   * start is piked — thigh ~60°, trunk pitched down to ~18° — which is also what the position
   * actually looks like: hips over knees, hands below the chest on the wheel.
   */
  const TAU_IN = 60;
  const TAU_OUT = 28;
  const ARM = (U + F) * 0.97; // near-straight on the wheel, by the long-arm rule

  const jointsAt = (rom: number) => {
    const tau = (lerp(TAU_IN, TAU_OUT, rom) * Math.PI) / 180;
    const hip: Vec2 = { x: KNEE.x + T * Math.cos(tau), y: KNEE.y - T * Math.sin(tau) };
    /*
     * The trunk continues the unfold: its angle above the floor eases from upright toward the
     * hip's own line as she reaches — a single smooth curve from kneel to long body.
     */
    const trunkDeg = lerp(12, 6, rom); // low enough that the 46.6u arm truly reaches the wheel
    const tr = (trunkDeg * Math.PI) / 180;
    const shoulder: Vec2 = { x: hip.x + ATHLETE.torso * Math.cos(tr), y: hip.y - ATHLETE.torso * Math.sin(tr) };
    /* The wheel is where the straight arms meet the floor — solved, not pushed. */
    const wheelX = shoulder.x + Math.sqrt(Math.max(1, ARM * ARM - (FLOOR_Y - 6 - shoulder.y) ** 2));
    const hand: Vec2 = { x: wheelX, y: FLOOR_Y - 6 };
    return { hip, shoulder, hand };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => jointsAt(i / 16).hand);

  const poseAt = (rom: number): Pose => {
    const { hip, shoulder, hand } = jointsAt(rom);
    const head: Vec2 = {
      x: shoulder.x + (shoulder.x - hip.x) * (ATHLETE.neck / ATHLETE.torso),
      y: shoulder.y + (shoulder.y - hip.y) * (ATHLETE.neck / ATHLETE.torso),
    };
    const elbow = twoBoneIK(shoulder, hand, U, F, 1);
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip,
        knee: KNEE,
        ankle: ANKLE,
        heel: { x: ANKLE.x - 5, y: FLOOR_Y - 8 },
        toe: { x: ANKLE.x - 11, y: FLOOR_Y },
        elbow,
        hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(hip, -6, 1),
        farKnee: far(KNEE, -6, 1),
        farAnkle: far(ANKLE, -6, 1),
        farHeel: far({ x: ANKLE.x - 5, y: FLOOR_Y - 8 }, -6, 0),
        farToe: far({ x: ANKLE.x - 11, y: FLOOR_Y }, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const { hand } = jointsAt(rom);
    return {
      back: [...sampledPathTicks(ARC)],
      front: [
        /* the wheel under the fists, with its axle dot */
        { kind: 'circle', c: { x: hand.x, y: hand.y + 1 }, r: 6.5, fill: 'ink4', fillOpacity: 0.2, stroke: 'ink0', w: 2.5 },
        { kind: 'circle', c: { x: hand.x, y: hand.y + 1 }, r: 1.8, fill: 'ink0' },
      ],
    };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 125, max: 150, label: 'piked over the wheel — hips over the knees' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 150, max: 176, label: 'rolled long — only as far as you control' },
    ],
    path: { track: 'hand', kind: 'horizontal', tol: 2 },
    invariants: [
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees planted — the rollout unfolds from them' },
      { kind: 'pointFixed', point: 'toe', tol: 0.5, label: 'toes tucked and still' },
      { kind: 'angleNever', joint: 'hip', neighbors: ['knee', 'shoulder'], aboveDeg: 178, label: 'never sag through — the brace holds the line' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 178, label: 'arms long but never snapped' },
    ],
  };

  return {
    id: 'ab_wheel',
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
    scene: floorScene(FLOOR_Y, 190, 58),
  };
})();

/* ── dead_bug ──────────────────────────────────────────────────────────────────────────────────── */

export const deadBug: Rig = (() => {
  /** Supine: the trunk flat on the floor and PINNED — the exercise is that it stays there. */
  const HIP: Vec2 = { x: 178, y: FLOOR_Y - 9 };
  const SHOULDER: Vec2 = { x: HIP.x - ATHLETE.torso, y: FLOOR_Y - 10 };
  const HEAD: Vec2 = { x: SHOULDER.x - 15, y: SHOULDER.y - 3 };

  /** The moving pair: the near ARM sweeps from vertical to reached-overhead-low; the near LEG
   *  from table-top (thigh vertical, shin level) to extended long and low. */
  const armAt = (rom: number): { elbow: Vec2; hand: Vec2 } => {
    /*
     * From straight UP (φ = 0) sweeping BACK over the head (φ → 78°) until the hand reaches long
     * and low past the crown — the head is at −x of the shoulder, so "overhead-back" is −x, −y.
     * (The first authoring had the trig backwards and the arm swept toward the FEET and up —
     * exactly inverted; visual QC caught what the validator, which only checks the leg, cannot.)
     */
    const phi = (lerp(0, 78, rom) * Math.PI) / 180;
    const reach = (U + F) * 0.96;
    const hand: Vec2 = { x: SHOULDER.x - reach * Math.sin(phi), y: SHOULDER.y - reach * Math.cos(phi) };
    return { elbow: { x: lerp(SHOULDER.x, hand.x, U / reach), y: lerp(SHOULDER.y, hand.y, U / reach) + 1.5 }, hand };
  };
  const legAt = (rom: number): { knee: Vec2; ankle: Vec2 } => {
    /* Table-top → long: the knee angle opens as the thigh lowers. */
    const thighDeg = lerp(84, 18, rom); // above the floor
    const kneeDeg = lerp(88, 158, rom); // interior at the knee
    const tr = (thighDeg * Math.PI) / 180;
    const knee: Vec2 = { x: HIP.x + T * Math.cos(tr), y: HIP.y - T * Math.sin(tr) };
    const shinDeg = thighDeg - (180 - kneeDeg);
    const sr = (shinDeg * Math.PI) / 180;
    return { knee, ankle: { x: knee.x + S * Math.cos(sr), y: knee.y - S * Math.sin(sr) } };
  };
  const ARC = Array.from({ length: 17 }, (_, i) => legAt(i / 16).ankle);

  /* The far side HOLDS the start — the other half of the bug, faint and still. */
  const FAR_ARM = armAt(0);
  const FAR_LEG = legAt(0);

  const poseAt = (rom: number): Pose => {
    const { elbow, hand } = armAt(rom);
    const { knee, ankle } = legAt(rom);
    return {
      headR: ATHLETE.headR,
      j: {
        head: HEAD,
        shoulder: SHOULDER,
        hip: HIP,
        knee,
        ankle,
        heel: { x: ankle.x - 3, y: ankle.y + 5 },
        toe: { x: ankle.x + 7, y: ankle.y + 3 },
        elbow,
        hand,
        farShoulder: far(SHOULDER, -6, 1),
        farElbow: far(FAR_ARM.elbow, -6, 1),
        farHand: far(FAR_ARM.hand, -6, 1),
        farHip: far(HIP, -6, 1),
        farKnee: far(FAR_LEG.knee, -6, 1),
        farAnkle: far(FAR_LEG.ankle, -6, 1),
        farHeel: far({ x: FAR_LEG.ankle.x - 3, y: FAR_LEG.ankle.y + 5 }, -6, 0),
        farToe: far({ x: FAR_LEG.ankle.x + 7, y: FAR_LEG.ankle.y + 3 }, -6, 0),
      },
    };
  };

  const decorAt = (): Decor => ({ back: [...sampledPathTicks(ARC)], front: [] });

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 78, max: 100, label: 'table-top — knee square over the hip' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['hip', 'ankle'], min: 145, max: 172, label: 'reached long and low — never touching down' },
    ],
    path: { track: 'ankle', kind: 'arc', tol: 3 },
    invariants: [
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'the lower back stays pressed — the pelvis does not tilt' },
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'shoulders down on the floor' },
      { kind: 'pointFixed', point: 'farHand', tol: 0.5, label: 'the other arm holds — dead still' },
      { kind: 'pointFixed', point: 'farKnee', tol: 0.5, label: 'the other leg holds its table-top' },
    ],
  };

  return {
    id: 'dead_bug',
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
    scene: floorScene(FLOOR_Y, 172, 55),
  };
})();
