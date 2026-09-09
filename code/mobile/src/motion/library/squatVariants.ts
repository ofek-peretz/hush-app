/**
 * squat, completed — front_squat · goblet_squat · smith_squat, riding the benchmark's own skeleton.
 *
 * `bbBackSquat.squatCore(rom, carryDX)` is the whole story: the legs, the planted foot and the
 * balance line are the benchmark's verbatim, and the torso lean is SOLVED so the CARRY — not the
 * shoulder — stays over the mid-foot. One number per member:
 *
 *   · `front_squat`  carryDX ≈ 5 — the bar in the front rack, and the solve yields the visibly
 *     more upright torso a front squat actually has. Elbows UP: the arm is authored high in front,
 *     forearm near-horizontal, which IS the front-rack cue ("elbows high").
 *   · `goblet_squat` carryDX ≈ 8 — the dumbbell hugged at the sternum, most upright of the three.
 *     Both hands under the bell in front of the chest.
 *   · `smith_squat`  carryDX = −4.5 — the back squat's own carry, but the bar rides the MACHINE's
 *     rail: the two uprights are drawn full-height, and the guaranteed-vertical path is stated by
 *     the machine itself, which is the honest difference (the machine balances; she squats). Its
 *     feet stand 8u in front of the bar (`footDX`), which is what the balancing machine allows.
 *   · `db_sumo_squat` is its own rig at the foot of this file, FACE-ON — the one squat whose
 *     content (the wide stance) the side camera cannot carry.
 *
 * FormSpecs are the benchmark's: stand tall → hip crease below the knee, planted heels, vertical
 * carry path, no hyperextension. What differs is only what the geometry already made different.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { leads } from '../curves';
import { barPathTicks, dumbbellSide, floorScene, plateGhost } from '../kit';
import { SQUAT_ANKLE, SQUAT_BAR_X, SQUAT_HEEL, SQUAT_TOE, squatCore } from './bbBackSquat';

const FLOOR_Y = 193;

interface SquatVariantParams {
  id: string;
  carryDX: number;
  implement: 'front_rack' | 'goblet' | 'smith' | 'bodyweight';
  /** The planted foot slid forward of the balance line — the Smith's stance. See `squatCore`. */
  footDX?: number;
}

function squatVariant(p: SquatVariantParams): Rig {
  /** The carry's own x — by the solve, this is the mid-foot line for every member. */
  const CARRY_X = SQUAT_BAR_X;
  const footDX = p.footDX ?? 0;
  const ANKLE: Vec2 = { x: SQUAT_ANKLE.x + footDX, y: SQUAT_ANKLE.y };
  const HEEL: Vec2 = { x: SQUAT_HEEL.x + footDX, y: SQUAT_HEEL.y };
  const TOE: Vec2 = { x: SQUAT_TOE.x + footDX, y: SQUAT_TOE.y };

  const poseAt = (rom: number): Pose => {
    const { knee, hip, shoulder, head, sinLean, cosLean } = squatCore(rom, p.carryDX, footDX);
    /* The carry point, in front of the shoulder by carryDX (screen x) at its own height. */
    /* The front rack sits ON the front delts — at the shoulder line, not the chin (visual QC
       2026-08-25: carried at −3.5 the 45cm plate ghost RINGED THE FACE through the whole rep).
       +2 → +4 puts the ring's line through the chin rather than the eyes (audit, 2026-09-03). */
    /* The goblet bell sits at the STERNUM, +15 (was +6): at +6 its top plate overlapped the chin
       by 3u and the clip was a snowman — two dark discs stacked on the head (audit, 2026-09-03). */
    const carry: Vec2 = { x: shoulder.x + p.carryDX, y: shoulder.y + (p.implement === 'goblet' ? 15 : 4) };
    /* Arms: front-rack and goblet hold HIGH IN FRONT — elbow forward of the shoulder, forearm up
       to the carry; smith grips the bar on the traps exactly as the back squat does. */
    let elbow: Vec2;
    let hand: Vec2;
    if (p.implement === 'smith') {
      hand = { x: CARRY_X, y: shoulder.y - 3.5 };
      elbow = {
        x: shoulder.x - 18 * sinLean - 12 * cosLean,
        y: shoulder.y + 18 * cosLean - 12 * sinLean,
      };
    } else if (p.implement === 'goblet') {
      /* Elbow tucked at the ribs, forearm FORWARD to a fist cupping the bell from below (elbow
         ~100°, forearm 9u on screen): the arm used to fold to 13° with a 2u forearm — a wedge, no
         hands (audit, 2026-09-03). */
      elbow = { x: shoulder.x - 1, y: shoulder.y + 22 };
      hand = { x: carry.x, y: carry.y + 9 };
    } else if (p.implement === 'bodyweight') {
      /* No implement: the arms reach FORWARD, near-horizontal, as the counterbalance every
         unloaded squat uses — the one cue the bodyweight squat has that the goblet does not. The
         virtual carry (shoulder + 8) still runs the balance solve, so the trunk stands as upright
         as the goblet's; the hands simply hold nothing. (2026-09-10, the bodyweight-only room.) */
      elbow = { x: shoulder.x + 14, y: shoulder.y + 3 };
      hand = { x: shoulder.x + 27, y: shoulder.y + 4 };
    } else {
      /* "ELBOWS HIGH" — the front rack's one cue, and the elbow sat 12u BELOW the shoulder, the
         upper arm 50° under the horizontal: the exact fault the cue warns against. The elbow is
         now at shoulder height, forward, the forearm folding back to the bar (audit, 2026-09-03). */
      elbow = { x: shoulder.x + 15, y: shoulder.y - 1 };
      hand = { x: carry.x + 1, y: carry.y + 1 };
    }
    const far = (pt: Vec2, dx: number, dy = 0): Vec2 => ({ x: pt.x + dx, y: pt.y + dy });
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        elbow,
        hand,
        hip,
        knee,
        ankle: ANKLE,
        heel: HEEL,
        toe: TOE,
        carry,
        farHip: far(hip, 6, 1),
        farKnee: far(knee, 7),
        farAnkle: far(ANKLE, 8),
        farHeel: far(HEEL, 8),
        farToe: far(TOE, 8),
        farShoulder: far(shoulder, 6, 1),
        farElbow: far(elbow, 6),
        farHand: far(hand, 6),
      },
    };
  };

  const CARRY_TOP = poseAt(0).j.carry.y;
  const CARRY_BOT = poseAt(1).j.carry.y;

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const carry = pose.j.carry;
    /* The Smith draws NO dashed range: its rail is the vertical statement, and with the ticks the
       head moved inside a ladder of three lines 9u apart (audit, 2026-09-03). */
    const back: Primitive[] = p.implement === 'smith' ? [] : [...barPathTicks(CARRY_X, CARRY_TOP, CARRY_BOT)];
    let front: Primitive[] = [];
    if (p.implement === 'smith') {
      /* The machine's uprights, full height, either side — the rail IS the vertical statement. */
      back.push(
        /* The gate, END-ON. A Smith's rails sit at the ENDS of the bar, and the bar in this camera
           is end-on: both rails project onto the bar's own x and only DEPTH separates them. Drawn
           at the front-view spacing (±46) one upright ran through the athlete and the other stood
           alone in open space — see `pullRow.smithRow` for the same correction. */
        { kind: 'line', a: { x: CARRY_X - 9, y: 30 }, b: { x: CARRY_X - 9, y: FLOOR_Y - 2 }, w: 3, color: 'ink3', opacity: 0.55 },
        { kind: 'line', a: { x: CARRY_X + 9, y: 30 }, b: { x: CARRY_X + 9, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
        /* The catches, from chest height down (they ran from y 62, beside the face, and read as
           rungs); and the frame's foot on the floor, so two lines read as a machine (audit, 2026-09-03). */
        ...[0, 1, 2, 3].map((i) => ({
          kind: 'line' as const,
          a: { x: CARRY_X + 9, y: 110 + i * 16 },
          b: { x: CARRY_X + 16, y: 110 + i * 16 },
          w: 2,
          color: 'ink3' as const,
        })),
        { kind: 'line', a: { x: CARRY_X - 29, y: FLOOR_Y - 2 }, b: { x: CARRY_X + 29, y: FLOOR_Y - 2 }, w: 3, color: 'ink3', cap: 'round' },
      );
      front = [...plateGhost(carry), { kind: 'circle', c: pose.j.head, r: pose.headR, fill: 'ink1' }];
    } else if (p.implement === 'front_rack') {
      /*
       * THE SAME PLATE AS EVERY OTHER LOADED BAR. It was shrunk to r12 because a full 45 cm ghost
       * at the collarbone rings the face — but the fix for that is already on the next line: the
       * head is RE-DRAWN over the ghost, so the face reads through it. A front squat is loaded with
       * the identical bar as a back squat, and a viewer comparing the two clips should be able to
       * see that. `bb_back_squat` draws the full plate and the same head re-draw.
       */
      front = [
        ...plateGhost(carry),
        { kind: 'circle', c: pose.j.head, r: pose.headR, fill: 'ink1' },
      ];
    } else if (p.implement === 'bodyweight') {
      /* Nothing in the hands, nothing to draw: the body is the load. */
      front = [];
    } else {
      /* Goblet at the sternum. */
      /*
       * A 20 kg dumbbell, at true scale: its plates are 17 cm across — 7.5u of radius, not 5 — and
       * the handle between them 22 cm. Drawn at 5 the bell was a pair of dots at the sternum and
       * the clip said "squatting while holding something small"; at true size it says GOBLET, which
       * is the only thing separating this from every other squat in the catalogue.
       */
      front = dumbbellSide(carry, { x: 0, y: 1 }, 9.5, 7.5);
    }
    return { back, front };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    /*
     * ⚠️ THE HIP CEILING IS 179.5 HERE, NOT THE BENCHMARK'S 179. A front carry pulls the solved
     * torso a shade more upright, and at the top of the goblet the hip measures 179.2° — a person
     * standing perfectly tall with a bell at the sternum, not a hyperextension. The knee keeps the
     * strict ceiling (a snapped knee is the fault that matters); the hip's half-degree is the
     * geometry of carrying in front, and bending the carry to dodge it would draw the lift wrong.
     */
    start: [
      { kind: 'jointAngle', joint: 'knee', neighbors: ['ankle', 'hip'], min: 160, max: 179, label: 'knee near-extended (stand tall)' },
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 160, max: 179.5, label: 'hip near-extended (stand tall)' },
    ],
    end: [{ kind: 'jointBelow', a: 'hip', b: 'knee', by: 2, label: 'hip crease below the knee (depth)' }],
    path: { track: 'carry', kind: 'vertical', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'ankle planted' },
      { kind: 'pointFixed', point: 'heel', tol: 0.5, label: 'heel never leaves the floor' },
      { kind: 'pointFixed', point: 'toe', tol: 0.5, label: 'toe planted' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['ankle', 'hip'], aboveDeg: 179, label: 'no knee hyperextension' },
    ],
  };

  return {
    id: p.id,
    chains: {
      torso: ['hip', 'shoulder'],
      neck: ['shoulder', 'head'],
      head: 'head',
      nearArm: ['shoulder', 'elbow', 'hand'],
      /* The Smith holds the bar exactly as the back squat does, and splits the folded arm the
         same way (see `bbBackSquat`, audit 2026-09-03). */
      ...(p.implement === 'smith' ? { nearArmInk: { upper: 'ink1' as const, fore: 'ink0' as const } } : {}),
      farArm: ['farShoulder', 'farElbow', 'farHand'],
      nearLeg: ['hip', 'knee', 'ankle'],
      nearFoot: ['heel', 'toe'],
      farLeg: ['farHip', 'farKnee', 'farAnkle'],
      farFoot: ['farHeel', 'farToe'],
    },
    formspec,
    poseAt,
    decorAt,
    scene: floorScene(FLOOR_Y, 184 + footDX, 30),
  };
}

export const frontSquatRig = squatVariant({ id: 'front_squat', carryDX: 5, implement: 'front_rack' });
export const gobletSquatRig = squatVariant({ id: 'goblet_squat', carryDX: 8, implement: 'goblet' });
/* The bodyweight squat (2026-09-10): the goblet's upright solve with empty, forward-reaching hands
   — the lift a bodyweight-only room leads its quads with. */
export const bwSquatRig = squatVariant({ id: 'bw_squat', carryDX: 8, implement: 'bodyweight' });
/* carryDX −4.5, the back squat's own correction: the bar rides the TRAPEZIUS SHELF behind the neck,
   not the shoulder joint. At 0 the bar dot sat exactly over the joint with the head drawn directly
   above it, and read as passing through the neck — see `bbBackSquat.BAR_BEHIND_SHOULDER`.
   footDX 8: THE FEET STAND IN FRONT OF THE BAR (audit, 2026-09-03). With the feet under it the clip
   was the back squat word for word — 34° of forward lean at the bottom — and showed nothing the
   machine gives. 8u forward, the solve (the carry still on the rail) makes the trunk 23° at the
   bottom and 1° back of vertical standing: the upright, machine-balanced squat a Smith allows. */
export const smithSquatRig = squatVariant({ id: 'smith_squat', carryDX: -4.5, implement: 'smith', footDX: 8 });

/**
 * db_sumo_squat — FACE-ON (audit, 2026-09-03). It was the goblet's side-view solve with the bell
 * hanging: from the side a wide stance is DEPTH and draws as nothing, so the clip taught a narrow
 * squat holding a dumbbell low — a different exercise. The stance IS the exercise, and the camera
 * a coach checks a sumo from is the front: feet at ±30u (68 cm), toes out, knees driven OUT over
 * the toes as the hips drop, the bell hanging between the knees. The founder's ruling ("the clip
 * outranks the card") turns the old header's "the stance rides the cues" into the defect it was.
 *
 * Built in three dimensions like `hipAbduction`: the thigh and shank keep their canonical lengths,
 * and what the front camera cannot see — the hips travelling BACK, the knees a little forward —
 * is carried in `z`, so the auditor measures true bones while the page shows the honest
 * foreshortening. The hip comes to the knee's height (thighs parallel), which is where a sumo
 * stance bottoms out; the knees lead (they travel out early, `leads(0.2)`) and the hips finish.
 */
export const dbSumoSquatRig: Rig = (() => {
  const CX = 180;
  const T = ATHLETE.thigh;
  const S = ATHLETE.shank;
  const STANCE = 30; // each ankle's distance from the centreline
  const HIP_W = 9; // each hip joint's — the front core's pelvis
  const KNEE_X0 = 20; // standing: the knee on the hip→ankle line, leg near-straight (174°)
  const KNEE_X1 = 32; // bottom: out over the toes
  const KNEE_Z0 = 2;
  const KNEE_Z1 = 10; // a little forward — a wide stance keeps the shins near vertical
  const HIP_Z1 = -22; // the hips sit BACK at the bottom, which the front camera cannot show
  const LEAN1 = (15 * Math.PI) / 180; // the trunk's forward pitch at the bottom, in depth
  const KNEES_LEAD = leads(0.2);

  const legAt = (rom: number) => {
    const kx = CX + (KNEE_X0 + (KNEE_X1 - KNEE_X0) * KNEES_LEAD(rom)); // right knee's screen x
    const kz = KNEE_Z0 + (KNEE_Z1 - KNEE_Z0) * rom;
    const hz = HIP_Z1 * rom;
    const dxK = kx - (CX + STANCE);
    const ky = FLOOR_Y - ATHLETE.ankleH - Math.sqrt(S * S - dxK * dxK - kz * kz);
    const dxH = kx - (CX + HIP_W);
    const dzH = kz - hz;
    const hy = ky - Math.sqrt(Math.max(0, T * T - dxH * dxH - dzH * dzH));
    return { kx, ky, kz, hy, hz };
  };
  const HY_TOP = legAt(0).hy;
  const HY_BOT = legAt(1).hy;

  const poseAt = (rom: number): Pose => {
    const { kx, ky, kz, hy, hz } = legAt(rom);
    const lean = LEAN1 * rom;
    const neckBase: Vec2 = { x: CX, y: hy - ATHLETE.torso * Math.cos(lean) };
    const neckZ = hz + ATHLETE.torso * Math.sin(lean);
    const head: Vec2 = { x: CX, y: neckBase.y - ATHLETE.neck };
    const shoulderR: Vec2 = { x: CX + 15.5, y: neckBase.y + 2 };
    const shoulderL: Vec2 = { x: CX - 15.5, y: neckBase.y + 2 };
    /* Straight arms down to the one bell, both fists meeting at the centreline. */
    const REACH = (ATHLETE.upperArm + ATHLETE.foreArm) * 0.985;
    const handR: Vec2 = { x: CX + 2.5, y: shoulderR.y + Math.sqrt(REACH * REACH - 13 * 13) };
    const handL: Vec2 = { x: CX - 2.5, y: handR.y };
    const k = ATHLETE.upperArm / (ATHLETE.upperArm + ATHLETE.foreArm);
    const elbowR: Vec2 = { x: shoulderR.x + (handR.x - shoulderR.x) * k, y: shoulderR.y + (handR.y - shoulderR.y) * k };
    const elbowL: Vec2 = { x: shoulderL.x + (handL.x - shoulderL.x) * k, y: shoulderL.y + (handL.y - shoulderL.y) * k };
    const ankleY = FLOOR_Y - ATHLETE.ankleH;
    return {
      headR: ATHLETE.headR,
      j: {
        hipC: { x: CX, y: hy },
        neckBase,
        head,
        shoulderR,
        shoulderL,
        elbowR,
        elbowL,
        handR,
        handL,
        /* The bell hangs from the fists by its top plate, so its centre is a plate and a half
           below the hands — below the crotch, between the knees at the bottom. */
        carry: { x: CX, y: handR.y + 11 },
        hipR: { x: CX + HIP_W, y: hy },
        hipL: { x: CX - HIP_W, y: hy },
        kneeR: { x: kx, y: ky },
        kneeL: { x: 2 * CX - kx, y: ky },
        ankleR: { x: CX + STANCE, y: ankleY },
        ankleL: { x: CX - STANCE, y: ankleY },
        /* Toes OUT: the foot line runs from just inside the ankle to well outside it. */
        heelR: { x: CX + STANCE - 2, y: FLOOR_Y },
        toeR: { x: CX + STANCE + 16, y: FLOOR_Y },
        heelL: { x: CX - STANCE + 2, y: FLOOR_Y },
        toeL: { x: CX - STANCE - 16, y: FLOOR_Y },
      },
      z: {
        hipC: hz,
        hipR: hz,
        hipL: hz,
        neckBase: neckZ,
        head: neckZ,
        shoulderR: neckZ,
        shoulderL: neckZ,
        elbowR: neckZ,
        elbowL: neckZ,
        handR: neckZ,
        handL: neckZ,
        kneeR: kz,
        kneeL: kz,
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const c = pose.j.carry;
    /* The bell hangs by one end, its axis vertical: from the front the plates are edge-on slabs,
       the same 20 kg bell the goblet holds (plates r 7.5, handle 19). */
    const front: Primitive[] = [
      { kind: 'line', a: { x: c.x, y: c.y - 9.5 }, b: { x: c.x, y: c.y + 9.5 }, w: 2.5, color: 'ink0', cap: 'round' },
      { kind: 'ellipse', c: { x: c.x, y: c.y - 9.5 }, rx: 7.5, ry: 3.2, fill: 'ink3', opacity: 0.55 },
      { kind: 'ellipse', c: { x: c.x, y: c.y + 9.5 }, rx: 7.5, ry: 3.2, fill: 'ink3', opacity: 0.55 },
    ];
    /* The range statement beside the stance: the hips' own vertical path. */
    return { back: barPathTicks(CX + 58, HY_TOP, HY_BOT), front };
  };

  const formspec: FormSpec = {
    tempo: DEFAULT_TEMPO,
    start: [{ kind: 'contactY', a: 'hipC', y: HY_TOP, tol: 1.5, label: 'stand tall in the wide stance' }],
    end: [
      { kind: 'contactY', a: 'hipC', y: HY_BOT, tol: 1.5, label: 'thighs parallel — hips level with the knees' },
      { kind: 'contactX', a: 'kneeR', x: CX + KNEE_X1, tol: 1.5, label: 'knees driven out over the toes' },
    ],
    path: { track: 'hipC', kind: 'vertical', tol: 1 },
    invariants: [
      { kind: 'pointFixed', point: 'ankleR', tol: 0.5, label: 'feet planted wide' },
      { kind: 'pointFixed', point: 'ankleL', tol: 0.5, label: 'feet planted wide' },
      { kind: 'pointFixed', point: 'heelR', tol: 0.5, label: 'heels down' },
      { kind: 'pointFixed', point: 'toeR', tol: 0.5, label: 'toes out, and still' },
      { kind: 'segmentAngleFixed', a: 'hipC', b: 'neckBase', tolDeg: 2, label: 'no side lean' },
    ],
  };

  return {
    id: 'db_sumo_squat',
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
    scene: floorScene(FLOOR_Y, CX, 46),
  };
})();
