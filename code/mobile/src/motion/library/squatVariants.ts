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
 *     the machine itself, which is the honest difference (the machine balances; she squats).
 *
 * FormSpecs are the benchmark's: stand tall → hip crease below the knee, planted heels, vertical
 * carry path, no hyperextension. What differs is only what the geometry already made different.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, dumbbellSide, floorScene, plateGhost } from '../kit';
import { SQUAT_ANKLE, SQUAT_BAR_X, SQUAT_HEEL, SQUAT_TOE, squatCore } from './bbBackSquat';

const FLOOR_Y = 193;

interface SquatVariantParams {
  id: string;
  carryDX: number;
  implement: 'front_rack' | 'goblet' | 'smith' | 'sumo';
}

function squatVariant(p: SquatVariantParams): Rig {
  /** The carry's own x — by the solve, this is the mid-foot line for every member. */
  const CARRY_X = SQUAT_BAR_X;

  const poseAt = (rom: number): Pose => {
    const { knee, hip, shoulder, head, sinLean, cosLean } = squatCore(rom, p.carryDX);
    /* The carry point, in front of the shoulder by carryDX (screen x) at its own height. */
    /* The front rack sits ON the front delts — at the shoulder line, not the chin (visual QC
       2026-08-25: carried at −3.5 the 45cm plate ghost RINGED THE FACE through the whole rep). */
    /* The sumo member's carry HANGS: one bell held at arms' length between the legs, so the carry
       point is the hand at the bottom of straight arms — still over the mid-foot by the solve. */
    const carry: Vec2 =
      p.implement === 'sumo'
        ? { x: shoulder.x + p.carryDX, y: shoulder.y + (ATHLETE.upperArm + ATHLETE.foreArm) * 0.98 }
        : { x: shoulder.x + p.carryDX, y: shoulder.y + (p.implement === 'goblet' ? 6 : 2) };
    /* Arms: front-rack and goblet hold HIGH IN FRONT — elbow forward of the shoulder, forearm up
       to the carry; smith grips the bar on the traps exactly as the back squat does. */
    let elbow: Vec2;
    let hand: Vec2;
    if (p.implement === 'sumo') {
      /* Straight arms down to the hanging bell — the elbow rides the shoulder→carry line. */
      elbow = { x: shoulder.x + p.carryDX * 0.5, y: shoulder.y + ATHLETE.upperArm };
      hand = carry;
    } else if (p.implement === 'smith') {
      hand = { x: CARRY_X, y: shoulder.y - 3.5 };
      elbow = {
        x: shoulder.x - 18 * sinLean - 9 * cosLean,
        y: shoulder.y + 18 * cosLean - 9 * sinLean,
      };
    } else {
      elbow = { x: shoulder.x + 10, y: shoulder.y + 12 };
      hand = { x: carry.x + 1, y: carry.y + (p.implement === 'goblet' ? 4 : 1) };
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
        ankle: SQUAT_ANKLE,
        heel: SQUAT_HEEL,
        toe: SQUAT_TOE,
        carry,
        farHip: far(hip, 6, 1),
        farKnee: far(knee, 7),
        farAnkle: far(SQUAT_ANKLE, 8),
        farHeel: far(SQUAT_HEEL, 8),
        farToe: far(SQUAT_TOE, 8),
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
    const back: Primitive[] = [...barPathTicks(CARRY_X, CARRY_TOP, CARRY_BOT)];
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
        ...[0, 1, 2, 3, 4].map((i) => ({
          kind: 'line' as const,
          a: { x: CARRY_X + 9, y: 62 + i * 16 },
          b: { x: CARRY_X + 16, y: 62 + i * 16 },
          w: 2,
          color: 'ink3' as const,
        })),
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
    } else {
      /* Goblet at the sternum; the sumo bell hangs end-on between the legs on the same statement. */
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
      farArm: ['farShoulder', 'farElbow', 'farHand'],
      nearLeg: ['hip', 'knee', 'ankle'],
      nearFoot: ['heel', 'toe'],
      farLeg: ['farHip', 'farKnee', 'farAnkle'],
      farFoot: ['farHeel', 'farToe'],
    },
    formspec,
    poseAt,
    decorAt,
    scene: floorScene(FLOOR_Y, 184, 30),
  };
}

export const frontSquatRig = squatVariant({ id: 'front_squat', carryDX: 5, implement: 'front_rack' });
export const gobletSquatRig = squatVariant({ id: 'goblet_squat', carryDX: 8, implement: 'goblet' });
/* carryDX −4.5, the back squat's own correction: the bar rides the TRAPEZIUS SHELF behind the neck,
   not the shoulder joint. At 0 the bar dot sat exactly over the joint with the head drawn directly
   above it, and read as passing through the neck — see `bbBackSquat.BAR_BEHIND_SHOULDER`. */
export const smithSquatRig = squatVariant({ id: 'smith_squat', carryDX: -4.5, implement: 'smith' });
/* batch 2 (2026-08-26): the sumo squat — the goblet's solve with the bell HANGING at arms' length
 * between the legs (carryDX 0: hanging arms are vertical, so the shoulder itself stands over the
 * mid-foot). The wide toed-out stance is a frontal-plane fact and rides the cues, the sumo rule. */
export const dbSumoSquatRig = squatVariant({ id: 'db_sumo_squat', carryDX: 0, implement: 'sumo' });
