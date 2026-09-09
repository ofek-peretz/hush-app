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
 *   · The deadlift authors its torso angle at the two ENDPOINTS (87° standing → 20° at the plates
 *     — the real setup angle canonical proportions give) and, between them, interpolates the KNEE
 *     angle and solves the hip: the knee closes monotonically and the torso angle falls out (audit,
 *     2026-09-03 — a torso-driven middle re-opened the knee mid-descent; see `pullFromFloorPose`).
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
import { angleAt, dist, lerp, twoBoneIK, twoBoneIK3, withinReach } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE, PLATE_R } from '../anthro';
import { type Curve, easesOut, leads } from '../curves';
import { barbellFront, barPathTicks, cable, dumbbellEnd, floorScene, kettlebellHang, plateGhost, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { far, FLOOR_Y } from '../bodies';

/** The sumo's torso arrives at its setup angle with ~29 % of the descent still to run, and holds. */
const TORSO_LEADS = leads(0.29);
/**
 * The pulls from the floor (audit, 2026-09-03): the KNEE waits — rom^1.5 — so the first third of
 * the descent is a hinge (knee still at 154 at rom 0.25) and the knee closes as the bar passes it.
 * Smooth at both ends, so the knee has no velocity corner anywhere in the rep; see
 * `pullFromFloorPose` for why the knee, not the torso, is the interpolated joint.
 */
const KNEE_WAITS: Curve = (rom) => Math.pow(rom, 1.5);
/** "Shoulders slightly in front of the bar" develops early, with the lean, and settles smoothly. */
const SHOULDERS_AHEAD = easesOut(2);

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
  /* The shoulder rides forward with the torso, and its HEIGHT is then solved so the hanging arm is
     exactly canonical — never stretched to reach a bar it was placed away from. */
  const ahead = lerp(0, aheadBot, SHOULDERS_AHEAD(rom));
  const shoulder: Vec2 = { x: BAR_X + ahead, y: barY - Math.sqrt(ARM * ARM - ahead * ahead) };
  /*
   * THE TWO ENDPOINTS ARE AUTHORED BY TORSO ANGLE; THE REP BETWEEN THEM IS AUTHORED BY THE KNEE.
   *
   * The lockout and the setup are the two poses a coach states — "stand tall", "35 degrees at the
   * plates" — so they stay written as torso angles, exactly as before, and the hip and knee are
   * derived from them. What changed (audit, 2026-09-03) is how the body gets between them. The
   * torso used to be interpolated on `leads(0.29)` and the knee solved from wherever the hip landed,
   * and the knee was NOT monotonic: 163 → 120 (rom 0.33) → back OPEN to 135 (rom 0.71) → 93, with
   * a velocity corner at rom 0.71 where the ramp hit its clamp (135.0 → 127.2 in one 0.04 step).
   * The reason is geometric, not a tuning miss: while the torso lays down, the hip swings BACK and
   * its distance from the planted ankle grows, which straightens the knee mid-descent — no torso
   * curve can stop it (linear, `easesOut`, a smoothstep were all measured: every one re-opens the
   * knee or keeps the corner).
   *
   * So the KNEE ANGLE is the interpolated quantity now — the one joint that must simply close —
   * and the HIP is solved as the middle joint of an ankle→hip→shoulder chain (leg length from the
   * knee angle, torso 48). The torso angle falls out. Its shape is the honest descent: the knee
   * waits (`KNEE_WAITS`, rom^1.5) so the first eighth is a hinge — hips back 18u with the knee
   * still at 160 — and the knee closes as the bar passes it. Measured over 25 samples: knee 163 →
   * 93 monotonic and torso 87 → 20 monotonic (a steeper exponent re-opened the torso by 1° late).
   */
  const endpoint = (y: number, torsoDeg: number, ax: number): Vec2 => {
    const sh = { x: BAR_X + ax, y: y - Math.sqrt(ARM * ARM - ax * ax) };
    return { x: sh.x - TORSO * Math.cos(torsoDeg * DEG), y: sh.y + TORSO * Math.sin(torsoDeg * DEG) };
  };
  const kneeDegOf = (hipAt: Vec2) => angleAt(hipAt, twoBoneIK(ANKLE, hipAt, ATHLETE.shank, ATHLETE.thigh, 1), ANKLE);
  const kneeDeg = lerp(kneeDegOf(endpoint(barTopY, torsoTopDeg, 0)), kneeDegOf(endpoint(barBotY, torsoBotDeg, aheadBot)), KNEE_WAITS(rom));
  // the leg's chord for that knee angle — law of cosines on the canonical thigh and shank
  const legChord = Math.sqrt(ATHLETE.thigh ** 2 + ATHLETE.shank ** 2 - 2 * ATHLETE.thigh * ATHLETE.shank * Math.cos(kneeDeg * DEG));
  /* bend = -1 puts the hip BEHIND the ankle→shoulder line — hips back, the hinge. The mirror
     solution is a pelvis thrust forward of the bar (the RDL's own recorded fault). */
  const hip = twoBoneIK(ANKLE, shoulder, legChord, TORSO, -1);
  const alpha = Math.atan2(hip.y - shoulder.y, shoulder.x - hip.x); // torso angle above horizontal, derived
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

/**
 * THE SHOULDER FINISHES AHEAD OF THE BAR (execution pass, 2026-09-07). With the shoulder pinned
 * over the bar the arm hung plumb, and the only way the hips could travel back was for the knee
 * to fold: 132° at the bottom, and the torso at 40° — a half-squat with straight arms. In a real
 * RDL the lats hold the bar against the shins while the shoulders travel OVER it; the arm hangs
 * ~15° back from the vertical, which is what lets the hips go back with a soft knee. Measured
 * (hinge scan): at 14u ahead and the bar at 144 the knee is 150°, the torso 27° above the floor,
 * the hip 10u above and 22u behind the knee. It reaches its lean with the bar, so the top is still
 * the plumb standing carry.
 */
const RDL_SHOULDER_AHEAD = 14;

function rdlPose(rom: number, barTopY: number, barBotY: number): Pose {
  const barY = lerp(barTopY, barBotY, rom);
  const ahead = RDL_SHOULDER_AHEAD * rom;
  const shoulder: Vec2 = { x: BAR_X + ahead, y: barY - Math.sqrt(ARM * ARM - ahead * ahead) };
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
  const BAR_TOP = 61.5 + ARM; // lockout: the bar hangs where the arm ends: derived from the standing shoulder (61.5) + ARM, not typed — the arm grew to 27/25 on 2026-09-07 and every typed 109.5 stretched the torso
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
const RDL_TOP = 61.5 + ARM + 1.5; // a shade below the dead-hang lockout: the hips sit BACK off the knee from rep one (soft knees); the bar hangs where the arm ends: derived from the standing shoulder (61.5) + ARM, not typed — the arm grew to 27/25 on 2026-09-07 and every typed 109.5 stretched the torso
/**
 * The bar stops ON the kneecap (knee at 149.4), not 7u below it. At 156 the 47.6u arm dragged the
 * hip down to 17u above the knee and closed the knee to 119.7° — a half-squat at the bottom of the
 * lift whose first cue is "soft knees". At 146 the knee holds 128.6°, the torso reaches 37° and the
 * hip stays 22u above the knee; the arm is the ceiling on this (lengthening it is rejected
 * catalogue-wide) (audit, 2026-09-03).
 */
const RDL_BOT = 144; // the bar reaches the knee cap (149) — a plate's rim below it; 146 with the plumb arm folded the knee to 132° (2026-09-07)

function rdlFormspec(): FormSpec {
  return {
    tempo: DEFAULT_TEMPO, // unracked standing → lowers first, like every barbell press
    start: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 150, max: 179, label: 'stand tall' },
    ],
    end: [
      { kind: 'contactY', a: 'bar', y: RDL_BOT, tol: 1.5, label: 'the bar reaches the knee' },
      // the line between a soft knee and a half-squat, now asserted (audit, 2026-09-03)
      { kind: 'jointAngle', joint: 'knee', neighbors: ['ankle', 'hip'], min: 145, max: 179, label: 'knees SOFT at the bottom — a hinge, not a squat' }, // 145, not 125: the soft knee is now measured at 150 (2026-09-07)
    ],
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
  /*
   * Balance (audit, 2026-09-03). At TAU_BOT 58 / THETA_BOT 64 the bar travelled 30u forward while
   * the hips gave back only 14u, and at the bottom the bar stood at x 198.3 — 5.3u PAST THE TOES
   * (193). A loaded bar in front of the toes cannot be held; the athlete would fall forward, and the
   * clip taught "bend over" rather than "push the hips back". At 38 / 50 the bar finishes at x 180.5
   * — on BAR_X, the family's own mid-foot — with the hips 24.5u back, the torso 40° above the floor
   * and the knee at 133°. The knee gives 42° for it: with the shin frozen, hips that go back far
   * enough to counterweight the bar can only do so by sinking, which is what a good morning under
   * load actually does.
   */
  /* 55 / 40, not 38 / 50 (execution pass, 2026-09-07): at 38 the knee closed to 133° — the good
     morning had become a squat-hinge. At 55 the knee holds 150° (soft, not folded), the hips go
     back 23u, and the chest comes down to 40° from vertical: at 42 the bar finished 9.3u inboard
     of the toes and the mid-foot law asks for 10, so the chest stops one notch higher — the
     balance rule this constant exists for, measured. */
  const TAU_BOT = 55;
  const THETA_TOP = 4; // torso from vertical
  const THETA_BOT = 40; // chest decisively DOWN — and not one degree past where the hips can balance it

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
      // the bar is furthest forward here, and it is still behind the toes — the balance the whole
      // lift hangs on (audit, 2026-09-03)
      { kind: 'jointRightOf', a: 'toe', b: 'bar', by: 10, label: 'the bar stays over the mid-foot, never past the toes' },
    ],
    path: { track: 'bar', kind: 'arc', tol: 2 },
    invariants: [
      ...plantedFeet('the hinge balances over the mid-foot'),
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees soft and FROZEN' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['ankle', 'hip'], aboveDeg: 179, label: 'no knee hyperextension' },
    ],
  };

  return {
    id: 'good_morning',
    /* The bar-on-back hold folds the elbow to ~10°; in one ink that arm was a pin under the plate.
       Upper arm in the trunk's ink, forearm in the near ink — two segments (audit, 2026-09-03). */
    chains: { ...hingeChains, nearArmInk: { upper: 'ink1', fore: 'ink0' } },
    formspec,
    poseAt,
    decorAt,
    scene: floorScene(FLOOR_Y, 184, 30),
  };
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
  const BAR_TOP = 65 + ARM; // lockout: hands at arm's length under the wide-stance shoulders, 3.5u below standing so the hip-ankle span (77.2 at 64.5, longer than thigh+shank) shortens and the knee stays soft (~170°); the bar hangs where the arm ends: derived from the standing shoulder (61.5) + ARM, not typed — the arm grew to 27/25 on 2026-09-07 and every typed 109.5 stretched the torso
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
    /* 28, not 34.4 (audit, 2026-09-03): a sumo sets up MORE upright than the conventional pull, and
       at 34.4 (46°) the hip sat so low that the 3D knee closed to 50° with the knee 28u toward the
       camera — a deep squat. At 28 (36°) the hip rises 6.4u and the true knee opens to ~60°. */
    const torsoProj = lerp(TORSO, 28, TORSO_LEADS(rom));
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
    /* The hint is OUT, not toward the camera (audit, 2026-09-03): {1, −0.15, 1.3} sent the knee
       28u into depth (a 40° shin, the squat look); {1.4, −0.15, 0.5} keeps it under 15u deep and
       drives it wide past the toe — "knees out", the sumo cue, is where the bend goes. */
    const kneeSolved = twoBoneIK3(hipJ, ankleJ, ATHLETE.thigh, ATHLETE.shank, { x: 1.4, y: -0.15, z: 0.5 });
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
  const BAR_TOP = 61.5 + ARM; // the bar hangs where the arm ends: derived from the standing shoulder (61.5) + ARM, not typed — the arm grew to 27/25 on 2026-09-07 and every typed 109.5 stretched the torso
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
    /*
     * The hex frame, side-on (audit, 2026-09-03). The sleeves of a trap bar are LOW — the frame's
     * plane sits at plate-centre height, and the raised handles stand 12u above it — so the frame
     * is drawn 12u under the grip, fore and aft of the feet, with the 45 cm plate end-on at the
     * mid-foot exactly as the conventional pull draws it: at rom 1 the plate's centre is at 177 and
     * its rim rests on the floor (193). It used to draw r5.5 rings at grip height, 22u off the
     * floor at the "rest" — a 12 cm disc floating, against the plate that is this catalogue's
     * scale reference. The near strut rises from the low frame to the handle: the raised grip,
     * stated as geometry.
     */
    const frameY = bar.y + 12;
    const frame: Decor['front'] = [
      ...plateGhost({ x: bar.x, y: frameY }),
      { kind: 'line', a: { x: bar.x - 26, y: frameY }, b: { x: bar.x + 26, y: frameY }, w: 3, color: 'ink0', cap: 'round' },
      { kind: 'quad', a: { x: bar.x - 9, y: frameY }, c: { x: bar.x - 4, y: bar.y - 1 }, b: { x: bar.x, y: bar.y }, w: 3, color: 'ink0' },
      { kind: 'quad', a: { x: bar.x + 9, y: frameY }, c: { x: bar.x + 4, y: bar.y - 1 }, b: { x: bar.x, y: bar.y }, w: 3, color: 'ink0' },
      { kind: 'circle', c: bar, r: 2.2, fill: 'ink0' }, // the handle, end-on, in the fist
    ];
    // clear of the frame's front corner (bar.x + 26) — behind the athlete the column sat straight
    // on his own glute at the setup
    return { back: barPathTicks(BAR_X + 34, BAR_TOP, BAR_BOT), front: frame };
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
  /*
   * The stack stands BEHIND the athlete (audit, 2026-09-03). It stood at x 258 — in front of her
   * face — so the rope ran from the front down through the thighs, the hands gripped 6u ahead of
   * the hip line, and the cable SHORTENED 120 → 109u as she stood while the stack was drawn rising
   * 18u: a cable RDL facing the machine, the opposite of the exercise, under a FormSpec whose own
   * label said "facing away from the stack". At x 72 the pulley is 106u behind her heels, the
   * tower (38–64) stands inside the left edge of the frame, and the cable lengthens as she stands.
   */
  const PT_PULLEY: Vec2 = { x: 72, y: FLOOR_Y - 12 };
  const poseAt = (rom: number): Pose => {
    /* rom 0 = deep hinge (rope long), rom 1 = stood tall — the RDL's rom, reversed. */
    const base = rdlPose(1 - rom, RDL_TOP, RDL_BOT);
    const hip = base.j.hip;
    /*
     * The hands hold the rope BETWEEN THE LEGS: at the hinge they reach back and down past the hip
     * line (−10, +14 — the grip disappears behind the near thigh, which is the staging of a
     * pull-through), and at the stand they finish 4u ahead of the hip with the arm angled back
     * toward the pulley by the rope's own pull. Clamped into the arm's reach first: hips-back at the
     * bottom puts the hip 58 units from the shoulder — a whole arm is 48 — and an out-of-reach IK
     * target leaves the forearm spanning the remainder, 33 against a canonical 23. The rope simply
     * does not come all the way back to the hip, which is also true of the exercise.
     */
    const hand = withinReach(base.j.shoulder, { x: hip.x + lerp(-10, 4, rom), y: hip.y + lerp(14, 6, rom) }, (ATHLETE.upperArm + ATHLETE.foreArm) * 0.99);
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
    /* The selected plate rises by exactly what the cable paid out — measured from the pulley to the
       hand, not assumed from rom: 83u of rope at the hinge, 119u at the stand, so the plate climbs
       36u (audit, 2026-09-03). */
    const risen = dist(PT_PULLEY, pose.j.hand) - dist(PT_PULLEY, handPath[0]);
    const tower = stackTower({ x0: PT_PULLEY.x - 34, x1: PT_PULLEY.x - 8, capY: 64, stackTopY: FLOOR_Y - 34 }, risen);
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

/*
 * kb_rdl (2026-09-10, the home-gym family) — the RDL's own skeleton, with a bell in each hand.
 *
 * The pose is `bb_rdl`'s and `db_rdl`'s verbatim: the same hinge, the same planted feet, the same
 * bar line, the same FormSpec. What differs is the only thing that differs in the room — the mass
 * hangs BELOW the grip instead of sitting in line with it, which is the whole of why a kettlebell
 * is its own family (see `kit.kettlebellHang`).
 */
export const kbRdl: Rig = (() => {
  const poseAt = (rom: number) => rdlPose(rom, RDL_TOP, RDL_BOT);
  const decorAt = (rom: number): Decor => {
    const hand = poseAt(rom).j.hand;
    return { back: barPathTicks(TICK_X, RDL_TOP, RDL_BOT), front: kettlebellHang(hand, { x: 0, y: 1 }) };
  };
  return { id: 'kb_rdl', chains: hingeChains, formspec: rdlFormspec(), poseAt, decorAt, scene: floorScene(FLOOR_Y, 184, 30) };
})();

/*
 * ═══ kb_swing — the hinge that throws (2026-09-10, the home-gym family) ═══════════════════════
 *
 * The kettlebell's signature lift, and the one movement in the family a dumbbell drawing would
 * teach WRONG: the mass hangs below the grip and travels on an arc pinned at the shoulder, which is
 * the whole of why a swing swings.
 *
 * ── WHAT IS BORROWED, AND WHY THAT IS THE HONEST PART ───────────────────────────────────────────
 * The BODY is `rdlPose`'s, verbatim: the same planted feet, the same frozen soft knee, the same
 * hip-hinge solve that three audits have already been through. A swing IS a hip hinge — the founder's
 * own family note for this file — and re-authoring the hinge to draw it would have been two skeletons
 * for one movement, the defect `bbRdl`'s own header warns about.
 *
 * ── WHAT IS RE-AUTHORED: THE ARM, AND NOTHING ELSE ──────────────────────────────────────────────
 * An RDL's arm hangs plumb for the whole rep; a swing's arm is a RIGID SPOKE that rotates about the
 * shoulder. So the hand is placed at `ARM` from the shoulder at an angle φ measured from straight
 * down, positive toward the front:
 *
 *     rom 0 (the top)      φ = 78°   — arms near-horizontal, the bell at chest height, hips through
 *     rom 1 (the backswing) φ = −34°  — the arm behind vertical, the bell between and behind the legs
 *
 * The elbow sits ON the spoke (a straight arm has no bend to solve) at its own bone ratio, so the
 * skin reads as one long limb rather than a folded one, and `spanFixed` asserts what the cue says:
 * **the arms never bend.** The bell's own arc is then the pivot's, which is what `path.kind: 'arc'`
 * declares — its constraint is the pivot invariant, not an axis (see `types.FormSpec`).
 *
 * ⚠️ THE ARM LEADS AND THE HIPS FOLLOW, and the order is the coaching. `leads(0.22)` puts the spoke
 * most of the way back before the hinge finishes: the bell is thrown by the hips and CAUGHT by the
 * backswing, not lowered by the arms. Authored in lockstep the clip read as a front raise performed
 * while bending over.
 */
/**
 * ⛔ THE TOP OF A SWING IS STANDING, AND THE RDL'S TOP IS NOT (measured, 2026-09-10).
 *
 * `RDL_TOP` is the standing shoulder plus 1.5 — a deliberate offset so an RDL opens with the hips
 * already sitting back off the knee (soft knees, rep one). Driven from it the swing measured
 * **hip 157.3°, trunk 13.8° from vertical at rom 0**: an athlete bent over at the moment the lift
 * is defined by being locked out.
 *
 * The endpoints below are the swing's own. The BOTTOM is the RDL's, measured off it rather than
 * retyped — hip 23.3 units behind the frozen knee, trunk 62.3° from vertical — because the bottom
 * of a swing and the bottom of an RDL are the same hinge in the room, and two files guessing at one
 * position is how this library's audits keep finding two skeletons for one movement.
 */
/** The hip's travel behind the frozen knee, and the trunk's lean, top → bottom. */
const SWING_HIP_BACK_TOP = 6;
const SWING_HIP_BACK_BOT = 23.3;
const SWING_LEAN_TOP = 4;
const SWING_LEAN_BOT = 62.3;
const SWING_PHI_TOP = 78 * DEG;
const SWING_PHI_BOT = -34 * DEG;
const SWING_ARM_LEADS = leads(0.22);

export const kbSwing: Rig = (() => {
  const poseAt = (rom: number): Pose => {
    /*
     * ⛔ THE BODY IS SOLVED IN THE SWING'S OWN TERMS, NOT FROM A BAR HEIGHT (measured, 2026-09-10).
     *
     * The first authoring drove `rdlPose` with a higher top so the hips would finish through, and it
     * walked the two-bone IK straight through its own singularity: between shoulder-y 61.75 and 62.5
     * the solved hip swings far enough back that the KNEE opens to **179.5°** — past the
     * no-hyperextension cap — and then closes again. A non-monotone knee inside one descent, on a lift
     * whose knee is supposed to be frozen. `RDL_TOP`'s +1.5 offset exists precisely to start an RDL
     * clear of that region, which is why the RDL never met it.
     *
     * A swing is not defined by where a bar hangs; it is defined by the HIP. So the hip is placed
     * directly on the thigh from the frozen knee (`back` = how far behind the knee it travels), the
     * trunk is placed on the torso from the hip at its own lean, and both are lerped. No IK, no
     * branch, no singularity — and the endpoints are the RDL's own measured numbers, so the bottom
     * of a swing and the bottom of an RDL are the same hinge, as they are in the room.
     */
    const back = lerp(SWING_HIP_BACK_TOP, SWING_HIP_BACK_BOT, rom);
    const lean = lerp(SWING_LEAN_TOP, SWING_LEAN_BOT, TORSO_LEADS(rom)) * DEG;
    const hip: Vec2 = { x: RDL_KNEE.x - back, y: RDL_KNEE.y - Math.sqrt(Math.max(1, ATHLETE.thigh * ATHLETE.thigh - back * back)) };
    const shoulder: Vec2 = { x: hip.x + TORSO * Math.sin(lean), y: hip.y - TORSO * Math.cos(lean) };
    const head = headOn(shoulder, Math.sin(lean));
    const phi = lerp(SWING_PHI_TOP, SWING_PHI_BOT, SWING_ARM_LEADS(rom));
    /* The spoke, from the shoulder: φ from straight down, positive toward the front (+x). */
    const u: Vec2 = { x: Math.sin(phi), y: Math.cos(phi) };
    const hand: Vec2 = { x: shoulder.x + u.x * ARM, y: shoulder.y + u.y * ARM };
    const elbow: Vec2 = {
      x: shoulder.x + u.x * ATHLETE.upperArm,
      y: shoulder.y + u.y * ATHLETE.upperArm,
    };
    return {
      headR: HEAD_R,
      j: withFarSide({ head, shoulder, elbow, hand, hip, knee: RDL_KNEE, ankle: ANKLE, heel: HEEL, toe: TOE, bar: hand }),
    };
  };

  const decorAt = (rom: number): Decor => {
    const hand = poseAt(rom).j.hand;
    /* The arc the bell actually travels — sampled, because a swing's path is neither a line nor a
       vertical and a straight tick ladder would state a path the movement does not have. */
    const arc = Array.from({ length: 13 }, (_, i) => poseAt(i / 12).j.hand);
    return { back: sampledPathTicks(arc), front: kettlebellHang(hand, { x: 0, y: 1 }) };
  };

  const formspec: FormSpec = {
    /* The rep STARTS at the top (hips through, bell floating) and the backswing is the eccentric —
       the same reading `bb_deadlift` uses for a lift that begins standing. */
    tempo: DEFAULT_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 164, max: 179, label: 'hips through — standing tall at the top' },
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 172, max: 180, label: 'arms long — the bell floats, it is not lifted' },
    ],
    end: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['ankle', 'hip'], min: 145, max: 179, label: 'knees SOFT in the backswing — a hinge, not a squat' },
      { kind: 'jointAngle', joint: 'elbow', neighbors: ['shoulder', 'hand'], min: 172, max: 180, label: 'and still long at the bottom' },
    ],
    path: { track: 'bar', kind: 'arc', tol: 1.5 },
    invariants: [
      ...plantedFeet('hinge, not squat'),
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees soft and FROZEN — the shin never travels' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['ankle', 'hip'], aboveDeg: 179, label: 'no knee hyperextension' },
      /* THE ONE CUE OF THE LIFT, ASSERTED: the arm is a rope, and its length never changes. */
      { kind: 'spanFixed', a: 'shoulder', b: 'hand', tol: 0.5, label: 'the arms never bend — the hips throw the bell' },
    ],
  };

  return { id: 'kb_swing', chains: hingeChains, formspec, poseAt, decorAt, scene: floorScene(FLOOR_Y, 184, 30) };
})();
