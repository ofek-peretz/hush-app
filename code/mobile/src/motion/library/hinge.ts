/**
 * hinge — the family every gym calls "the deadlifts", authored against MOTION_FORM_STANDARD_V1
 * §4.2. Template canon: standing tall → bar below the knee (or the floor, for pulls from the
 * floor) · the bar NEVER drifts from the leg line ("keep the bar close") · knees soft and frozen
 * after setup · back FLAT — the torso is drawn straight, never curled (neutral spine is the
 * silhouette itself, which is built on a straight hip→shoulder spine and cannot round).
 *
 * ── HOW THE MOTION IS AUTHORED, AND WHY THE BAR PATH IS TRUE BY GEOMETRY ────────────────────────
 * Every member drives the BAR (the tracked point) straight down its vertical line and SOLVES the
 * body around it, the same inversion the back squat pioneered:
 *
 *   · The shoulder rides directly above the bar at arm's length — arms hang, so the shoulder's
 *     x IS the bar's x. That makes `path: vertical` a consequence of gravity, not a tuned number.
 *   · The deadlift authors its torso angle (83° standing → 35° at the plates — the real setup
 *     angle canonical proportions give) and the KNEE is solved by two-bone IK between the planted
 *     ankle and the derived hip: shins yield forward exactly as far as the descent demands.
 *   · The RDLs pin the KNEE outright (soft, frozen — the template's own invariant, checkable as
 *     `pointFixed`) and solve the HIP between the fixed knee and the descending shoulder: the
 *     hips travel back and up-to-down along the one arc the two bones allow. "Push the hips
 *     back" falls out of the skeleton instead of being animated onto it.
 *
 * ── WHY THE DEADLIFT OPENS AT THE FLOOR (§3.6) ──────────────────────────────────────────────────
 * The loop opens where the equipment honestly rests. A deadlift's bar rests ON THE FLOOR — the
 * rep's first working action is the pull, so the tempo declares `startAt: 'bottom'` (the one
 * mechanism the standard reserves for exactly this lift). The RDLs unrack standing and lower
 * first, like every barbell press.
 *
 * ── THE GOOD MORNING'S CURVED RANGE STATEMENT ───────────────────────────────────────────────────
 * The bar rides the traps, so its true path is the arc the torso sweeps — the first rig whose
 * tracked point does not travel a rail. The range statement follows the standard's grammar (same
 * pencil, same dash, ticks at the endpoints) drawn along the SAMPLED true path (`sampledPathTicks`)
 * — the drawing states the arc the bar actually travels, not a chord it never touches.
 */

//

import type { Decor, FormSpec, Pose, Rig, Vec2, Vec3 } from '../types';
import { lerp, twoBoneIK, twoBoneIK3, withinReach } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE, PLATE_R } from '../anthro';
import { leads } from '../curves';
import { barbellFront, barPathTicks, cable, dumbbellEnd, floorScene, plateGhost, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { far, FLOOR_Y } from '../bodies';

/** The torso arrives at its setup angle with ~29 % of the descent still to run, and holds. */
const TORSO_LEADS = leads(0.29);

const DEG = Math.PI / 180;
const TORSO = ATHLETE.torso;
const NECK = ATHLETE.neck;
const HEAD_R = ATHLETE.headR;
/** Hanging arm, shoulder→knuckle, drawn a hair short of 25+23 so the elbow keeps a soft bend. */
const ARM = ATHLETE.upperArm + ATHLETE.foreArm - 0.4;

// ── the planted foot every member shares (the squat's stance, the same person) ──────────────────
const HEEL: Vec2 = { x: 168, y: FLOOR_Y };
const TOE: Vec2 = { x: 193, y: FLOOR_Y };
const ANKLE: Vec2 = { x: 178, y: 186 };
const BAR_X = 180; // over the mid-foot — "keep the bar close" as a constant, not a correction
/**
 * Where the range statement's column stands.
 *
 * It used to sit ON the bar line at BAR_X, which is where §3.1 wants it — the bar dot touching its
 * own tick. In this family that puts it straight down the athlete's thigh and shin, and the near
 * leg draws in `ink0` over the top of it: `db_rdl` was rendering its whole range statement inside
 * a black leg, invisible for the entire rep. Offsetting the column clear of the plate (which
 * reaches BAR_X + 16) is the same concession the bench and the machine rows already make, and it
 * keeps both endpoint ticks legible at the two heights that matter.
 */
const TICK_X = BAR_X + 28;

const hingeChains = {
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

/** Neutral-spine head: the neck continues the torso line, biased upright (eyes forward). */
function headOn(shoulder: Vec2, sinLean: number, follow = 0.8): Vec2 {
  const s = sinLean * follow;
  const c = Math.sqrt(1 - s * s);
  return { x: shoulder.x + NECK * s, y: shoulder.y - NECK * c };
}

/** The far-side copy of every joint, offset into depth exactly as the squat offsets them. */
function withFarSide(j: Record<string, Vec2>): Record<string, Vec2> {
  return {
    ...j,
    farHip: far(j.hip, 6, 1),
    farKnee: far(j.knee, 7),
    farAnkle: far(j.ankle, 8),
    farHeel: far(j.heel, 8),
    farToe: far(j.toe, 8),
    farShoulder: far(j.shoulder, 6, 1),
    farElbow: far(j.elbow, 6),
    farHand: far(j.hand, 6),
  };
}

/**
 * The barbell deadlift skeleton: bar on its vertical line barY(top→bottom), shoulder at arm's
 * length above it, torso angle authored, knee solved between the planted ankle and the hip.
 */
function pullFromFloorPose(
  rom: number,
  barTopY: number,
  barBotY: number,
  torsoTopDeg: number,
  torsoBotDeg: number,
  /**
   * How far AHEAD of the bar the shoulder joint sits at the floor. Zero at lockout, where the arms
   * hang plumb; a few units at the setup, which is the cue "shoulders slightly in front of the bar"
   * drawn rather than described.
   *
   * It is also what buys the setup back. This athlete's arm is 47.6u shoulder-to-knuckle, and the
   * bar rests 16u off the floor on its plates, so the shoulder is PINNED at y = 129 the moment the
   * hands are on the bar. Everything else has to fit under that: with the shoulder directly over
   * the bar and a 35-degree torso the hip came out 7.9u BELOW its own knee and the knee closed to
   * 76 degrees — hips under the bar, chest up, which is the squat this demonstration exists to
   * distinguish itself from. Moving the shoulder 6u forward and flattening the torso to 23 lifts
   * the hip back ABOVE the knee and opens the knee to 88, which is the conventional pull.
   */
  aheadBot = 0,
): Pose {
  const barY = lerp(barTopY, barBotY, rom);
  /*
   * The torso reaches its setup angle EARLY and the knees do the rest — a deadlift lowers as a
   * hinge first and a knee bend second. A linear torso made the middle of the descent read as a
   * squat (caught by filmstrip QC, not by the validator: both are legal skeletons; only one is the
   * lift).
   *
   * This used to be written `Math.min(1, rom * 1.4)` right here, and for a long time it was the
   * only sequencing anywhere in the library — one hand-written multiply in one file out of forty.
   * It is `curves.leads(0.29)` now: same shape, but said in the vocabulary every other rig can
   * reach for. See `curves.ts` for why one clock for the whole body was the ceiling on all of this.
   */
  const alpha = lerp(torsoTopDeg, torsoBotDeg, TORSO_LEADS(rom)) * DEG; // torso angle above horizontal
  /* The shoulder rides forward with the torso, and its HEIGHT is then solved so the hanging arm is
     exactly canonical — never stretched to reach a bar it was placed away from. */
  const ahead = lerp(0, aheadBot, TORSO_LEADS(rom));
  const shoulder: Vec2 = { x: BAR_X + ahead, y: barY - Math.sqrt(ARM * ARM - ahead * ahead) };
  const hip: Vec2 = { x: shoulder.x - TORSO * Math.cos(alpha), y: shoulder.y + TORSO * Math.sin(alpha) };
  /*
   * bend = +1, and the sign is the whole correctness of the lift. The mirror solution (-1) is
   * fine while the athlete stands — both branches sit near the straight leg — but as the hip
   * descends toward the ankle it swings the knee BACKWARD AND DOWN, and past ~70 % of the descent
   * the knee passes below its own planted ankle: the athlete finishes the pull KNEELING. The
   * FormSpec could not see it (a kneel is a legal skeleton; only one of the two is the lift) and
   * neither could three sampled roms. `audit.ts` law 6 — "a planted foot implies a standing leg" —
   * exists because of this frame.
   */
  const knee = twoBoneIK(ANKLE, hip, ATHLETE.shank, ATHLETE.thigh, 1); // shin yields FORWARD, knee stays up
  const hand: Vec2 = { x: BAR_X, y: barY };
  const elbow = twoBoneIK(shoulder, hand, ATHLETE.upperArm, ATHLETE.foreArm, 1); // soft bend back
  const head = headOn(shoulder, Math.cos(alpha));
  return {
    headR: HEAD_R,
    j: withFarSide({ head, shoulder, elbow, hand, hip, knee, ankle: ANKLE, heel: HEEL, toe: TOE, bar: { x: BAR_X, y: barY } }),
  };
}

/**
 * The RDL skeleton: knee PINNED (soft, frozen — the family's defining invariant), bar down its
 * vertical line, hip solved between the fixed knee and the descending shoulder — the hips sweep
 * back along the one arc the thigh and torso allow.
 */
/**
 * The RDL's frozen shin, leaning 5 degrees BACK — the knee sits over the heel, not ahead of the toe.
 *
 * It leaned 8 degrees FORWARD, and the difference is the whole lift. With the knee 5u ahead of the
 * ankle, a bar taken past the knee forced the hip DOWN to y = 140 (nine units below its own knee)
 * and closed the knee to 95 degrees with a 42-degree torso: a quarter-squat holding a bar, which is
 * the exact fault an RDL demonstration exists to rule out. Leaning the shin back instead lets the
 * hip travel where it actually travels — 19u ABOVE the knee and well behind it — and the knee stays
 * soft at 120 degrees with the torso down at 30, and the leg is still 175 degrees at the top. Nothing about the shin's stillness changes; only
 * where it is still.
 */
const RDL_KNEE: Vec2 = { x: ANKLE.x - ATHLETE.shank * Math.sin(5 * DEG), y: ANKLE.y - ATHLETE.shank * Math.cos(5 * DEG) };

function rdlPose(rom: number, barTopY: number, barBotY: number): Pose {
  const barY = lerp(barTopY, barBotY, rom);
  const shoulder: Vec2 = { x: BAR_X, y: barY - ARM };
  /*
   * bend = -1, and like the deadlift's own branch this sign IS the exercise.
   *
   * It was +1, with a comment claiming "hips BACK, never forward" — and it did the opposite. The
   * mirror solution swung the pelvis FORWARD of the knee: at the bottom the hip sat at x = 220
   * against a toe at 193, so the athlete's backside hung 27 units past his own foot while his torso
   * stayed vertical. The clip was a pelvic thrust, not a hinge.
   *
   * Nothing could fail it. `pointFixed` on the knee holds (the knee never moves), `contactY` on the
   * bar holds (the bar still runs its line), the feet stay planted, and `audit.ts`'s hinge-inversion
   * law only asks that a joint keeps the SAME bend sign all rep — which a consistently wrong branch
   * does. Same class as the deadlift finishing on its knees: two legal skeletons, one lift.
   */
  const hip = twoBoneIK(RDL_KNEE, shoulder, ATHLETE.thigh, TORSO, -1);
  const hand: Vec2 = { x: BAR_X, y: barY };
  const elbow = twoBoneIK(shoulder, hand, ATHLETE.upperArm, ATHLETE.foreArm, 1);
  const sinLean = Math.max(0, Math.min(1, (shoulder.x - hip.x) / TORSO));
  const head = headOn(shoulder, sinLean);
  return {
    headR: HEAD_R,
    j: withFarSide({ head, shoulder, elbow, hand, hip, knee: RDL_KNEE, ankle: ANKLE, heel: HEEL, toe: TOE, bar: { x: BAR_X, y: barY } }),
  };
}

const plantedFeet = (label: string): FormSpec['invariants'] => [
  { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: `ankle planted (${label})` },
  { kind: 'pointFixed', point: 'heel', tol: 0.5, label: 'heel never leaves the floor' },
  { kind: 'pointFixed', point: 'toe', tol: 0.5, label: 'toe planted' },
];

// ═══ bb_deadlift — the pull from the floor ═════════════════════════════════════════════════════
export const bbDeadlift: Rig = (() => {
  const BAR_TOP = 109.5; // lockout: the bar hangs at the hip from long arms — the standing core's own number
  const BAR_BOT = FLOOR_Y - PLATE_R; // the plate's own radius stands the bar off the floor
  const poseAt = (rom: number) => pullFromFloorPose(rom, BAR_TOP, BAR_BOT, 87, 20, 8);
  const decorAt = (rom: number): Decor => {
    const bar = poseAt(rom).j.bar;
    return { back: barPathTicks(TICK_X, BAR_TOP, BAR_BOT), front: plateGhost(bar) };
  };
  const formspec: FormSpec = {
    // §3.6 — the bar honestly rests on the floor, so the loop opens there and PULLS first.
    tempo: { ...DEFAULT_TEMPO, startAt: 'bottom' },
    start: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 150, max: 179, label: 'lockout — stand tall, never lean back' },
      { kind: 'jointAngle', joint: 'knee', neighbors: ['ankle', 'hip'], min: 150, max: 179, label: 'knees long at the top, never snapped' },
    ],
    end: [
      { kind: 'contactY', a: 'bar', y: BAR_BOT, tol: 1, label: 'the plates rest on the floor' },
      // the one line between a deadlift and a squat with a bar in the way, now asserted
      { kind: 'jointBelow', a: 'knee', b: 'hip', by: 2, label: 'hips ABOVE the knees at the setup — a pull, not a squat' },
    ],
    path: { track: 'bar', kind: 'vertical', tol: 1.5 },
    invariants: [
      ...plantedFeet('the pull is through the floor'),
      { kind: 'angleNever', joint: 'knee', neighbors: ['ankle', 'hip'], aboveDeg: 179, label: 'no knee hyperextension' },
    ],
  };
  return { id: 'bb_deadlift', chains: hingeChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 184, 30) };
})();

// ═══ bb_rdl / db_rdl — the hip hinge with the load in the hands ════════════════════════════════
const RDL_TOP = 111; // a shade below the dead-hang lockout: the hips sit BACK off the knee from rep one (soft knees)
const RDL_BOT = 156; // just below the fixed knee (149.4) — "lower until just past the knee"

function rdlFormspec(): FormSpec {
  return {
    tempo: DEFAULT_TEMPO, // unracked standing → lowers first, like every barbell press
    start: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 150, max: 179, label: 'stand tall' },
    ],
    end: [{ kind: 'contactY', a: 'bar', y: RDL_BOT, tol: 1.5, label: 'the bar reaches just below the knee' }],
    path: { track: 'bar', kind: 'vertical', tol: 1.5 },
    invariants: [
      ...plantedFeet('hinge, not squat'),
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees soft and FROZEN — the shin never travels' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['ankle', 'hip'], aboveDeg: 179, label: 'no knee hyperextension' },
    ],
  };
}

export const bbRdl: Rig = (() => {
  const poseAt = (rom: number) => rdlPose(rom, RDL_TOP, RDL_BOT);
  const decorAt = (rom: number): Decor => {
    const bar = poseAt(rom).j.bar;
    return { back: barPathTicks(TICK_X, RDL_TOP, RDL_BOT), front: plateGhost(bar) };
  };
  return { id: 'bb_rdl', chains: hingeChains, formspec: rdlFormspec(), poseAt, decorAt, scene: floorScene(FLOOR_Y, 184, 30) };
})();

export const dbRdl: Rig = (() => {
  const poseAt = (rom: number) => rdlPose(rom, RDL_TOP, RDL_BOT);
  const decorAt = (rom: number): Decor => {
    const hand = poseAt(rom).j.hand;
    // the honest r8 disc — the size hierarchy alone says dumbbell, not barbell
    return { back: barPathTicks(TICK_X, RDL_TOP, RDL_BOT), front: dumbbellEnd(hand) };
  };
  return { id: 'db_rdl', chains: hingeChains, formspec: rdlFormspec(), poseAt, decorAt, scene: floorScene(FLOOR_Y, 184, 30) };
})();

// ═══ good_morning — the hinge with the bar on the traps ════════════════════════════════════════
export const goodMorning: Rig = (() => {
  const BAR_ABOVE_SHOULDER = 3.5; // the squat's own trap carry — the same person, the same rack
  const ELBOW_DOWN = 20; // a touch deeper than the squat's grip so the folded arm reads through the lean
  const ELBOW_BACK = 5;
  // Thigh from horizontal: hip stacked over the knee, standing tall. 80 rather than 84 because
  // at 84 the leg came out at 179.0 degrees — inside the no-hyperextension cap by a twentieth of a
  // degree, which is not a soft knee, it is a locked one that happens to round down.
  const TAU_TOP = 80;
  const TAU_BOT = 58; // the hips push back and sink as the chest sweeps down
  const THETA_TOP = 4; // torso from vertical
  const THETA_BOT = 64; // chest decisively DOWN — the silhouette must read hinge, not half-squat

  const poseAt = (rom: number): Pose => {
    const tau = lerp(TAU_TOP, TAU_BOT, rom) * DEG;
    const theta = lerp(THETA_TOP, THETA_BOT, rom) * DEG;
    const hip: Vec2 = { x: RDL_KNEE.x - ATHLETE.thigh * Math.cos(tau), y: RDL_KNEE.y - ATHLETE.thigh * Math.sin(tau) };
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    const shoulder: Vec2 = { x: hip.x + TORSO * s, y: hip.y - TORSO * c };
    /*
     * The bar rests ON THE TRAP SLOPE — up-and-BACK of the shoulder joint in the torso's own
     * frame (up-along-spine alone slides the bar onto the skull once the chest sweeps down;
     * filmstrip QC). The blend keeps it on the traps at every lean, the way a bar actually sits.
     */
    const ux = s - c;
    const uy = -c - s;
    const un = Math.hypot(ux, uy);
    const bar: Vec2 = { x: shoulder.x + (BAR_ABOVE_SHOULDER * 1.4 * ux) / un, y: shoulder.y + (BAR_ABOVE_SHOULDER * 1.4 * uy) / un };
    // the grip rides the trunk through the lean — the squat's arm, verbatim
    const hand: Vec2 = { x: bar.x, y: bar.y };
    const elbow: Vec2 = { x: shoulder.x - ELBOW_DOWN * s - ELBOW_BACK * c, y: shoulder.y + ELBOW_DOWN * c - ELBOW_BACK * s };
    const head = headOn(shoulder, s, 0.7);
    return {
      headR: HEAD_R,
      j: withFarSide({ head, shoulder, elbow, hand, hip, knee: RDL_KNEE, ankle: ANKLE, heel: HEEL, toe: TOE, bar }),
    };
  };

  // the range statement along the SAMPLED true arc — see the file header
  const barPath: Vec2[] = [];
  for (let i = 0; i <= 24; i++) barPath.push(poseAt(i / 24).j.bar);
  const ticks = sampledPathTicks(barPath);

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    /*
     * A SMALL-DIAMETER plate, honestly: a good morning is loaded light, on the small discs — and
     * at 45cm the ghost rim rings the athlete's FACE through the whole hinge (filmstrip QC). The
     * r10 disc keeps the loaded-barbell statement and clears the head, so no z-order concession
     * is needed at all.
     */
    /*
     * The small honest disc, WITHOUT the pale sleeve hub: at this proximity to the head the
     * bright hub read as a second face (filmstrip QC). Rim + ghost + bar dot keep the whole
     * loaded-barbell statement; the head re-draws above the rim, the squat's own concession.
     */
    const gm: Decor['front'] = [
      /* The full 45 cm plate, like every other loaded bar in the library — the head is re-drawn
         over it below, which is what keeps the face legible through a ghost at the collarbone. */
      ...plateGhost(pose.j.bar),
      { kind: 'circle', c: pose.j.bar, r: 3, fill: 'ink0' },
      { kind: 'circle', c: pose.j.head, r: pose.headR, fill: 'ink1' },
    ];
    return { back: ticks, front: gm };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 150, max: 179, label: 'stand tall under the bar' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 60, max: 108, label: 'deep hinge — chest swept down, hips pushed back' },
    ],
    path: { track: 'bar', kind: 'arc', tol: 2 },
    invariants: [
      ...plantedFeet('the hinge balances over the mid-foot'),
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees soft and FROZEN' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['ankle', 'hip'], aboveDeg: 179, label: 'no knee hyperextension' },
    ],
  };

  return { id: 'good_morning', chains: hingeChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 184, 30) };
})();

// ═══ THE HINGE, COMPLETED (2026-08-25) — the four members the file was still owed ══════════════

/**
 * sumo_deadlift — restaged FRONT-VIEW (2026-08-25, the frontal directive extended DOWN). The chest
 * and shoulder families present face-on because their identity lives in upper-body symmetry (§3.4
 * Amendment 7); a sumo's identity lives in LOWER-body symmetry — the wide stance, the toes-out,
 * the knees tracking wide, the grip INSIDE the knees. From the side every one of those facts folds
 * into depth and the lift reads as "a slightly taller deadlift" — indistinguishable at the
 * silhouette, which is the exact failure §3.5 Amendment 5 forbids the equipment. Face-on they ARE
 * the silhouette, and the world-vertical pull is fully in-plane, so `path: vertical` stays true by
 * geometry: the hands never leave their vertical lines.
 *
 * Depth is projected honestly (the seated-front license): at the bottom the hips sit back and the
 * knees drive out over the toes, so the thigh projects ~23 of its true 40 and the shin ~29 of 37 —
 * foreshortening, never shrinking. The arms stay straight (a deadlift's arms are ropes): the elbow
 * lies ON the shoulder→hand line at its true fraction. Wide-stance honesty at LOCKOUT too: with
 * the ankles at ±26 the legs form a triangle, so the whole body stands ~2u lower than the narrow
 * standing core — the price of the stance, paid by the skeleton, visible in the drawing. The
 * plates (r16) rest exactly ON the floor at rom 1: 177 + 16 = 193.
 */
export const sumoDeadlift: Rig = (() => {
  const CX = 176;
  const BAR_TOP = 113; // lockout: hands at arm's length under the (2u-lowered) wide-stance shoulders
  const BAR_BOT = FLOOR_Y - PLATE_R; // the plate's own radius: the plates rest on the floor
  const HAND_X = 11; // the grip, INSIDE the knees — the sumo word, stated as a constant
  const SH_X = 15.5; // canonical frontal shoulder joints
  const ARM_DROP = Math.sqrt(ARM * ARM - (SH_X - HAND_X) * (SH_X - HAND_X)); // ≈47.4: straight arms, slightly toed-in
  const ELBOW_T = ATHLETE.upperArm / (ATHLETE.upperArm + ATHLETE.foreArm); // the elbow's true fraction of the rope

  const poseAt = (rom: number): Pose => {
    const barY = lerp(BAR_TOP, BAR_BOT, rom);
    const shY = barY - ARM_DROP;
    const neckBase: Vec2 = { x: CX, y: shY - 2 };
    /* The torso reaches its setup angle early (the family's own descent grammar): its frontal
     * projection shortens from the full 48 to 34.4 (≈46° above horizontal — the side sumo's own
     * ratified angle) as the chest inclines toward the camera. */
    const torsoProj = lerp(TORSO, 34.4, TORSO_LEADS(rom));
    const hipY = neckBase.y + torsoProj;
    /*
     * THE KNEE IS SOLVED, NOT PLACED. Both coordinates used to be authored — `kneeY` ran a plain
     * 150 → 158 — and the shank quietly shrank from 36.6 to 28.6 across the descent while claiming
     * a canonical 37. Nothing could see it: there was no `z` to contradict, and a 22 % shrink sits
     * under the auditor's projection warn.
     *
     * Solved in three dimensions from the fixed ankle and the hip, both leg bones are canonical at
     * every frame and the foreshortening is REPORTED as the depth it is. The hint is the sumo cue
     * itself — the knee tracks OUT over the toe, and travels forward only as much as the closing
     * hip forces it to.
     */
    const hipJ: Vec3 = { x: CX + 9, y: hipY, z: 0 };
    const ankleJ: Vec3 = { x: CX + 26, y: 186, z: 0 };
    const kneeSolved = twoBoneIK3(hipJ, ankleJ, ATHLETE.thigh, ATHLETE.shank, { x: 1, y: -0.15, z: 1.3 });
    const kneeX = kneeSolved.x - CX;
    const kneeY = kneeSolved.y;
    const kneeZ = kneeSolved.z;
    const arm = (side: 1 | -1) => {
      const sh: Vec2 = { x: CX + SH_X * side, y: shY };
      const hand: Vec2 = { x: CX + HAND_X * side, y: barY };
      const elbow: Vec2 = { x: lerp(sh.x, hand.x, ELBOW_T), y: lerp(sh.y, hand.y, ELBOW_T) };
      return { sh, elbow, hand };
    };
    const R = arm(1);
    const L = arm(-1);
    return {
      headR: HEAD_R,
      j: {
        head: { x: CX, y: neckBase.y - NECK },
        neckBase,
        hipC: { x: CX, y: hipY },
        shoulderR: R.sh, elbowR: R.elbow, handR: R.hand,
        shoulderL: L.sh, elbowL: L.elbow, handL: L.hand,
        hipR: { x: CX + 9, y: hipY }, hipL: { x: CX - 9, y: hipY },
        kneeR: { x: CX + kneeX, y: kneeY }, kneeL: { x: CX - kneeX, y: kneeY },
        ankleR: { x: CX + 26, y: 186 }, ankleL: { x: CX - 26, y: 186 },
        heelR: { x: CX + 20, y: FLOOR_Y }, toeR: { x: CX + 36, y: FLOOR_Y },
        heelL: { x: CX - 20, y: FLOOR_Y }, toeL: { x: CX - 36, y: FLOOR_Y },
        bar: { x: CX, y: barY },
      },
      // the knees are the only thing here that leaves the drawing plane, and they say so
      z: { kneeR: kneeZ, kneeL: kneeZ },
    };
  };

  const decorAt = (rom: number): Decor => {
    const barY = poseAt(rom).j.bar.y;
    return {
      back: [...barPathTicks(CX + 96, BAR_TOP, BAR_BOT)],
      front: barbellFront(CX, barY),
    };
  };

  const formspec: FormSpec = {
    tempo: { ...DEFAULT_TEMPO, startAt: 'bottom' },
    start: [
      { kind: 'contactY', a: 'bar', y: BAR_TOP, tol: 1.5, label: 'lockout — stand tall, never lean back' },
      { kind: 'jointAngle', joint: 'kneeR', neighbors: ['ankleR', 'hipR'], min: 150, max: 179, label: 'knees long at the top' },
    ],
    end: [
      { kind: 'contactY', a: 'bar', y: BAR_BOT, tol: 1, label: 'the plates rest on the floor' },
      /* The knee's drawn x is no longer authored — it falls out of the 3D solve — so the predicate
         states the thing that MATTERS instead of the coordinate: the knee ends up outside the
         grip, which is the one word that makes this a sumo. */
      { kind: 'jointRightOf', a: 'kneeR', b: 'handR', by: 12, label: 'knees driven WIDE — outside the grip' },
    ],
    path: { track: 'bar', kind: 'vertical', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'heelR', tol: 0.5, label: 'the wide stance is planted' },
      { kind: 'pointFixed', point: 'toeR', tol: 0.5, label: 'toes out, and they stay out' },
      { kind: 'pointFixed', point: 'heelL', tol: 0.5, label: 'planted left as right' },
      { kind: 'pointFixed', point: 'toeL', tol: 0.5, label: 'both feet through the floor' },
      { kind: 'angleNever', joint: 'kneeR', neighbors: ['ankleR', 'hipR'], aboveDeg: 179, label: 'no knee hyperextension' },
    ],
  };

  return {
    id: 'sumo_deadlift',
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
    scene: floorScene(FLOOR_Y, CX, 42),
  };
})();

/**
 * trap_bar_deadlift — the hex bar's whole point IS this camera's geometry: the grip axis passes
 * through the mid-foot AND the body line, so `hand.x = BAR_X` — which the conventional pull only
 * approximates — is literally true here. The torso sets up between the deadlift's and a squat's,
 * and the frame is drawn as the hexagon's side profile riding the grip.
 */
export const trapBarDeadlift: Rig = (() => {
  const BAR_TOP = 109.5;
  /*
   * The handle rests 28u off the floor, not 16. A hex bar's grips are RAISED — that is the piece of
   * equipment's whole point, and it is what lets the lift be what people choose it for: a more
   * upright torso over a deeper knee bend. Drawn on a barbell's 16u the setup came out with the hip
   * 12u BELOW its own knee at a 65-degree knee angle, which is a deep squat holding a frame. At 28u
   * with a 35-degree torso the hip sits 4u ABOVE the knee at 92 degrees — knee-dominant against the
   * conventional pull's 20-degree torso, which is the honest difference between the two lifts.
   */
  const BAR_BOT = FLOOR_Y - 28;
  const poseAt = (rom: number) => pullFromFloorPose(rom, BAR_TOP, BAR_BOT, 88, 35);
  const decorAt = (rom: number): Decor => {
    const bar = poseAt(rom).j.bar;
    /* The hex frame, side-on: the near strut arcs over the grip, sleeves fore and aft at bar height. */
    const frame: Decor['front'] = [
      { kind: 'quad', a: { x: bar.x - 26, y: bar.y }, c: { x: bar.x, y: bar.y - 14 }, b: { x: bar.x + 26, y: bar.y }, w: 3, color: 'ink0' },
      { kind: 'circle', c: { x: bar.x - 26, y: bar.y }, r: 5.5, fill: 'ink4', fillOpacity: 0.25, stroke: 'ink3', w: 2 },
      { kind: 'circle', c: { x: bar.x + 26, y: bar.y }, r: 5.5, fill: 'ink4', fillOpacity: 0.25, stroke: 'ink3', w: 2 },
    ];
    // clear of the hex frame's front sleeve (bar.x + 26, r 5.5) — behind the athlete the column
    // sat straight on his own glute at the setup
    return { back: barPathTicks(BAR_X + 42, BAR_TOP, BAR_BOT), front: frame };
  };
  const formspec: FormSpec = {
    tempo: { ...DEFAULT_TEMPO, startAt: 'bottom' },
    start: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 150, max: 179, label: 'lockout — stand tall' },
      { kind: 'jointAngle', joint: 'knee', neighbors: ['ankle', 'hip'], min: 150, max: 179, label: 'knees long at the top' },
    ],
    end: [{ kind: 'contactY', a: 'bar', y: BAR_BOT, tol: 1, label: 'the frame rests on the floor' }],
    path: { track: 'bar', kind: 'vertical', tol: 1.5 },
    invariants: [
      ...plantedFeet('the pull is through the floor'),
      { kind: 'angleNever', joint: 'knee', neighbors: ['ankle', 'hip'], aboveDeg: 179, label: 'no knee hyperextension' },
    ],
  };
  return { id: 'trap_bar_deadlift', chains: hingeChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 184, 30) };
})();

/**
 * cable_pull_through — the RDL's skeleton facing AWAY from a low pulley: the hips sweep back on
 * the same pinned-knee arc, but the load's axis is the rope running back-and-down between the
 * legs. The RDL pose is reused verbatim for the BODY; only the hands change — they hold the rope
 * at the hips, so the elbow is re-solved to that grip and the drawn load is the cable's line.
 * The working endpoint is the STAND-TALL (the squeeze), so the rep runs hinge→stand: rom 0 opens
 * in the deep hinge where the machine honestly holds her, and the pull is the concentric.
 */
export const cablePullThrough: Rig = (() => {
  const PT_PULLEY: Vec2 = { x: 258, y: FLOOR_Y - 12 };
  const poseAt = (rom: number): Pose => {
    /* rom 0 = deep hinge (rope long), rom 1 = stood tall — the RDL's rom, reversed. */
    const base = rdlPose(1 - rom, RDL_TOP, RDL_BOT);
    const hip = base.j.hip;
    /* Hands at the hip line, holding the rope back between the legs; elbow re-solved to the grip. */
    /* Clamped into the arm's reach first. Hips-back at the bottom of a pull-through puts the hip
       58 units from the shoulder — a whole arm is 48 — and an out-of-reach IK target leaves the
       forearm spanning the remainder, 33 against a canonical 23. The rope simply does not come all
       the way back to the hip, which is also true of the exercise. */
    const hand = withinReach(base.j.shoulder, { x: hip.x + 6, y: hip.y + 8 }, (ATHLETE.upperArm + ATHLETE.foreArm) * 0.99);
    const elbow = twoBoneIK(base.j.shoulder, hand, ATHLETE.upperArm, ATHLETE.foreArm, 1);
    /* The far arm offsets +6 like every other far joint `withFarSide` produces. It used to offset
       −6 while its own shoulder went +6, so the two ends of the far humerus were pushed 12 units
       APART and the bone measured 35.6 against a canonical 25 — a stretch the auditor caught only
       once the hips started travelling far enough back to expose it. */
    return { headR: base.headR, j: { ...base.j, hand, elbow, farHand: far(hand, 6, 1), farElbow: far(elbow, 6, 1) } };
  };
  const handPath: Vec2[] = [];
  for (let i = 0; i <= 24; i++) handPath.push(poseAt(i / 24).j.hand);
  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const risen = rom * 18;
    const tower = stackTower({ x0: PT_PULLEY.x + 8, x1: PT_PULLEY.x + 34, capY: 64, stackTopY: FLOOR_Y - 34 }, risen);
    return {
      /* The cable draws BEHIND the figure. It runs back and down BETWEEN the legs — that is the
         whole staging of a pull-through — so the near thigh has to cover it. Drawn in front it
         crossed the leg on top and read as a rope lying against the outside of the knee. */
      back: [...sampledPathTicks(handPath), ...tower.prims, ...pulley(PT_PULLEY), cable(PT_PULLEY, pose.j.hand)],
      front: [],
    };
  };
  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 48, max: 115, label: 'hinged back onto the cable — the stretch' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 150, max: 179, label: 'stand tall — squeeze, never lean back' },
    ],
    path: { track: 'hand', kind: 'arc', tol: 2 },
    invariants: [
      ...plantedFeet('planted, facing away from the stack'),
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees soft and FROZEN — the hips do the work' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['ankle', 'hip'], aboveDeg: 179, label: 'no knee hyperextension' },
    ],
  };
  return { id: 'cable_pull_through', chains: hingeChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 184, 30) };
})();
