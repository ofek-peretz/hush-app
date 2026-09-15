/**
 * calf_straight — plantarflexion with the knee straight, the largest single pattern left in the
 * catalogue (five members) and the one whose whole range is smaller than a plate.
 *
 * ── THE AUTHORING PROBLEM: A REP YOU CAN BARELY SEE ─────────────────────────────────────────────
 * A calf raise moves the body about 12 units. Drawn honestly at the athlete's scale it is a figure
 * that twitches, and a demonstration nobody can read teaches nothing — which is exactly the failure
 * §0 forbids. Every other rig in this library solves that by being big; this one solves it by being
 * FRAMED: the whole body rises off a raised block, so the eye has a fixed edge — the block's top —
 * to measure the heel against. The range statement ticks the heel's travel beside it. The motion is
 * small and the READING of it is not, and no proportion is exaggerated to get there.
 *
 * ── THE PIVOT IS THE BALL OF THE FOOT, AND THE BODY RIDES THE ANKLE ────────────────────────────
 * Nothing above the ankle bends. The foot turns as one rigid piece about the ball resting on the
 * block's edge, the ankle rides on the foot, and every joint above it — knee, hip, shoulder, head —
 * rises by the ankle's own rise, because that is what standing on your toes does. Authoring it as
 * "turn the foot, carry the body on the ankle" is both simpler and truer than posing an ankle: the
 * skeleton is built once at the bottom and translated, so the segment lengths cannot drift.
 *
 * ── THE TWO CUES, BOTH MEASURABLE ───────────────────────────────────────────────────────────────
 *   1. **The knee stays straight** — bending it turns the lift into a half squat and takes the
 *      gastrocnemius out of it. `jointAngle` at BOTH endpoints holds one window, so the knee cannot
 *      quietly help.
 *   2. **All the way down** — the stretch under the block is the half of the range people skip.
 *      `contactY` on the heel at the bottom states it, below the block's own top edge.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp, twoBoneIKToward } from '../geometry';
import { sticksAt } from '../curves';

/** A single-joint rig still has a sticking point — the last fifth, where the moment arm is longest;
 *  the driver slows there and arrives (iron rule 12, 2026-09-07). Endpoints untouched. */
const STICK = sticksAt(0.85, 0.06);
import { CONCENTRIC_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, dumbbellSide, floorScene, groundShadow } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far, standingCore } from '../bodies';

const X = 178;

/**
 * ⚠️ THE WHOLE SCENE SITS LOWER IN THE FRAME, AND IT HAS TO (geometry QC, 2026-08-25).
 *
 * This is the only rig whose athlete RISES as a rigid body. Authored at the canonical standing
 * height her head reached y≈19.5 at the peak against a viewbox that starts at 26 — the crown
 * clipped off the top of the media field on every rep, on all five members. The FormSpec passed
 * the whole time, and correctly: it asks whether the TECHNIQUE is right, and the technique was.
 * Nothing in it can see a frame.
 *
 * The fix is not a smaller rep. The floor has ~20 units of unused frame beneath it, so the entire
 * scene — athlete, block, floor line, shadow — is drawn `DROP` units lower and the rise spends that
 * headroom instead of the crown. The range is untouched; only the camera moved.
 *
 * (audit, 2026-09-03) The rise was 26u — the heel's own travel — because the pivot sat at the TOE
 * tip and the body was translated by the heel's rise. The pivot is the ball now and the body rides
 * the ankle, whose true rise is ~8.5u; the frame is no longer tight, and DROP stays where the frame
 * law put it.
 */
const DROP = 19; // 16 left the crown's halo 1.7u past the top edge at the peak (audit, 2026-09-03)
const SCENE_FLOOR = FLOOR_Y + DROP;
const raw = standingCore(X);
const base = {
  ...raw,
  head: { x: raw.head.x, y: raw.head.y + DROP },
  shoulder: { x: raw.shoulder.x, y: raw.shoulder.y + DROP },
  hip: { x: raw.hip.x, y: raw.hip.y + DROP },
  knee: { x: raw.knee.x, y: raw.knee.y + DROP },
  ankle: { x: raw.ankle.x, y: raw.ankle.y + DROP },
  heel: { x: raw.heel.x, y: raw.heel.y + DROP },
  toe: { x: raw.toe.x, y: raw.toe.y + DROP },
};

/** The block she stands on: the ball of the foot is supported, the heel hangs off the back. */
const BLOCK_TOP = SCENE_FLOOR - 13;
const BLOCK_X0 = X + 2;
const BLOCK_X1 = X + 34;

/**
 * THE PIVOT IS THE BALL OF THE FOOT, NOT THE TOE TIP (audit, 2026-09-03).
 *
 * The foot used to turn about its toe tip on a 25u radius, and the heel travelled 26u ≈ 29cm —
 * twice what a calf raise does (an elite ankle, 20° dorsiflexion to 50° plantarflexion over a
 * ~20cm heel-to-ball lever, moves the heel ~22cm ≈ 19.6u). A real foot bends at the metatarsal
 * heads: the ball rests on the block's edge, the toes lie flat on the block past it, and the heel
 * swings about the ball on a `HEEL_R` lever. 20u of heel travel is the honest number, and the
 * block edge still makes it read.
 */
const TOE_PAST = 6; // the toes, flat on the block beyond the ball
const HEEL_R = ATHLETE.foot - TOE_PAST; // heel → ball, the lever the calf actually works
const BALL: Vec2 = { x: BLOCK_X1 - 8, y: BLOCK_TOP };
/** The toes, flat on the block past the ball — the one point that never moves. */
const TOE: Vec2 = { x: BALL.x + TOE_PAST, y: BLOCK_TOP };
/** Heel travel: below the block at the stretch, above its top at the peak. A true 20u range. */
const HEEL_LOW = BLOCK_TOP + 8;
const HEEL_HIGH = BLOCK_TOP - 12;
/** The ankle on the rigid foot: this far forward of the heel along the sole, `ankleH` up its normal. */
const ANKLE_FWD = base.ankle.x - base.heel.x;

/**
 * THE FOOT IS ONE RIGID PIECE, turned about the ball (audit, 2026-09-03). The heel used to be
 * solved on a circle about the toe tip while the ankle sat at a FIXED offset above it, so the
 * ankle→toe distance grew from 13.0u to 24.2u inside a rep — a foot triangle that stretched. Now
 * the sole's tilt is read off the heel's height, and the ankle is carried on the sole's own frame.
 */
function footAt(rom: number): { heel: Vec2; ankle: Vec2 } {
  const heelY = lerp(HEEL_LOW, HEEL_HIGH, STICK(rom));
  const s = (heelY - BALL.y) / HEEL_R; // sine of the sole's tilt: positive = heel below the block
  const c = Math.sqrt(1 - s * s);
  const heel: Vec2 = { x: BALL.x - HEEL_R * c, y: heelY };
  return {
    heel,
    ankle: { x: heel.x + ANKLE_FWD * c - ATHLETE.ankleH * s, y: heel.y - ANKLE_FWD * s - ATHLETE.ankleH * c },
  };
}

/**
 * THE HIP STAYS OVER THE BALL (audit, 2026-09-03). Rotating the foot swings the ankle ~8.6u
 * FORWARD across the rep (the ankle sits 7u above the sole, and the sole tilts 64°). A body
 * translated by the ankle would drift its shoulders 8.6u forward — impossible under a Smith bar
 * or a machine's pads, both of which travel a vertical rail, and untrue of a free lifter too:
 * standing on the ball of one foot, the centre of mass stays over the ball, which is FIXED. So the
 * hip's x is pinned where the leg is vertical midway through the ankle's swing (rom 0.62 — the
 * sole's tilt is a sine, so the ankle's x is not linear in rom) and the rigid leg tilts ±~3.5°
 * about the ankle as the ankle swings under it. The trunk stays plumb; the knee angle cannot change.
 */
const HIP_X = footAt(0.62).ankle.x + (base.hip.x - base.ankle.x);
/** hip → ankle, the rigid leg as one link. */
const LEG_LEN = Math.hypot(base.hip.x - base.ankle.x, base.hip.y - base.ankle.y);

const calfChains = {
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

interface CalfParams {
  id: string;
  /** What she is holding, if anything. `bodyweight` leaves the arms hanging. */
  implement: 'bodyweight' | 'db' | 'bar' | 'machine';
  /** One leg works; the other is tucked back out of the way. */
  singleLeg?: boolean;
}

/**
 * THE HIGH-BAR CARRY, seen from the side (audit, 2026-09-03). The Smith member used to borrow the
 * back squat's constants — bar 3.5u above the shoulder joint, elbow 9 back and 18 down — which
 * put the hand 3.5u from the shoulder on a 25+23 arm: a 3.9° elbow, and two fleshed limbs below
 * ~55° are one dark wedge. The bar sits on the traps BEHIND the neck now, the elbow flares out
 * toward the camera (z 21) as a squat elbow does, and the forearm comes back in to the bar (z 2):
 * 25/23 in three dimensions, 52° as projected — and the two inks below keep the fold legible.
 */
const BAR_CARRY = { back: 9, above: 7, elbowBack: 11.7, elbowDown: 5.7, elbowZ: 21, handZ: 2 };

function calfRaise(p: CalfParams): Rig {
  const poseAt = (rom: number): Pose => {
    const { heel, ankle } = footAt(rom);
    /* The rigid leg from the pinned hip x down to the swinging ankle; the knee rides the leg's tilt. */
    const dx = HIP_X - ankle.x;
    const hip: Vec2 = { x: HIP_X, y: ankle.y - Math.sqrt(LEG_LEN * LEG_LEN - dx * dx) };
    const tilt = Math.atan2(dx, ankle.y - hip.y) - Math.atan2(base.hip.x - base.ankle.x, base.ankle.y - base.hip.y);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const kx = base.knee.x - base.ankle.x;
    const ky = base.knee.y - base.ankle.y;
    const knee: Vec2 = { x: ankle.x + kx * ct - ky * st, y: ankle.y + kx * st + ky * ct };
    /* Everything above the hip translates with it — the trunk stays plumb. */
    const up = (v: Vec2): Vec2 => ({ x: v.x + hip.x - base.hip.x, y: v.y + hip.y - base.hip.y });
    const shoulder = up(base.shoulder);
    /*
     * Arms: hanging for the free members; on the machine, gripping the handles at chest height in
     * front (audit, 2026-09-03: they hung at the hips under a shoulder pad, which no machine asks);
     * on the Smith, the high-bar carry above.
     */
    const elbow: Vec2 =
      p.implement === 'bar'
        ? { x: shoulder.x - BAR_CARRY.elbowBack, y: shoulder.y + BAR_CARRY.elbowDown }
        : p.implement === 'machine'
          ? { x: shoulder.x + 10, y: shoulder.y + 22.9 } // |upper arm| 25, elbow 68° at the handle
          : { x: shoulder.x + 1.5, y: shoulder.y + ATHLETE.upperArm };
    const hand: Vec2 =
      p.implement === 'bar'
        ? { x: shoulder.x - BAR_CARRY.back, y: shoulder.y - BAR_CARRY.above }
        : p.implement === 'machine'
          ? { x: shoulder.x + 26, y: shoulder.y + 6.4 } // |forearm| 23
          : { x: elbow.x, y: elbow.y + ATHLETE.foreArm };
    /*
     * The free leg of the single-leg member hangs from the hip, knee bent ~115°, foot tucked back
     * and clear of the floor (audit, 2026-09-03: it was a straight leg with its toe pinned in mid
     * air, a foot that swung 74° about nothing and a heel 10u off the floor that read as a rear
     * foot planted behind the block). The foot is one rigid piece on the free ankle.
     */
    const farHip = far(hip, -6, 1);
    const freeAnkle: Vec2 = { x: hip.x - 30, y: hip.y + 55 }; // thigh ~vertical, shin ~23° below level: knee ≈100°, toe ≥20u off the floor
    const freeKnee = p.singleLeg ? twoBoneIKToward(farHip, freeAnkle, ATHLETE.thigh, ATHLETE.shank, { x: hip.x + 5, y: hip.y + 40 }) : far(knee, -6, 1);
    /* The free foot hangs off its shank at the standing foot's own offsets, rotated with the shank —
       the toes point down, hooked behind the working calf, and the foot is 25u at every rom. */
    const shank = { x: freeKnee.x - freeAnkle.x, y: freeKnee.y - freeAnkle.y };
    const sl = Math.hypot(shank.x, shank.y) || 1;
    const ux = shank.x / sl;
    const uy = shank.y / sl;
    const onShank = (fx: number, fy: number): Vec2 => ({ x: freeAnkle.x - uy * fx - ux * fy, y: freeAnkle.y + ux * fx - uy * fy });
    return {
      headR: ATHLETE.headR,
      j: {
        head: up(base.head),
        shoulder,
        hip,
        knee,
        ankle,
        heel,
        toe: TOE,
        elbow,
        hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip,
        farKnee: freeKnee,
        farAnkle: p.singleLeg ? freeAnkle : far(ankle, -6, 1),
        farHeel: p.singleLeg ? onShank(base.heel.x - base.ankle.x, ATHLETE.ankleH) : far(heel, -6, 0),
        farToe: p.singleLeg ? onShank(base.toe.x - base.ankle.x, ATHLETE.ankleH) : far(TOE, -6, 0),
      },
      ...(p.implement === 'bar'
        ? { z: { elbow: BAR_CARRY.elbowZ, hand: BAR_CARRY.handZ, farElbow: -BAR_CARRY.elbowZ, farHand: -BAR_CARRY.handZ } }
        : {}),
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const hand = pose.j.hand;
    const farHand = pose.j.farHand;
    /* The Smith's gate stands BEHIND the block, so the block hides the front rail's foot (audit,
       2026-09-03: drawn after the block, the rail ran down through the block's face and the toe). */
    const rails: Primitive[] = [];
    const block: Primitive[] = [
      { kind: 'rect', x: BLOCK_X0, y: BLOCK_TOP, width: BLOCK_X1 - BLOCK_X0, height: SCENE_FLOOR - BLOCK_TOP, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
      // The block's TOP EDGE, extended back as a hairline — the fixed line the heel is read against.
      { kind: 'dash', a: { x: BLOCK_X0 - 34, y: BLOCK_TOP }, b: { x: BLOCK_X0, y: BLOCK_TOP }, w: 1.5, color: 'ink3', dash: [3, 4], opacity: 0.7 },
    ];
    let front: Primitive[] = [];
    const DOWN: Vec2 = { x: 1, y: 0 };

    if (p.implement === 'db') front = [...dumbbellSide(farHand, DOWN), ...dumbbellSide(hand, DOWN)];
    else if (p.implement === 'bar') {
      /*
       * The SMITH member draws its machine (equipment QC 2026-08-25: it drew a floating plate and
       * no rails — a Smith calf raise without the Smith). The gate silhouette is the Smith's
       * reserved signature (§3.5 Amendment 5): both uprights full height, a faint crossbar riding
       * at the bar's height, and the bar ON the traps at the high-bar carry — rising with the
       * body, which is the honest picture: on a Smith, the BAR is what travels the rail.
       */
      const bar: Vec2 = hand;
      /* The rails are FIXED — the hip is pinned in x, so the bar's x is the same at every rom.
         Both stand just BEHIND the bar (audit, 2026-09-03: at bar.x ± 9 the front one rose out of
         the crown like an antenna once the bar moved to the traps), the near one darker. */
      const RAIL_FRONT = bar.x - 2;
      const RAIL_BACK = bar.x - 12;
      rails.push(
        { kind: 'line', a: { x: RAIL_BACK, y: 40 }, b: { x: RAIL_BACK, y: SCENE_FLOOR - 2 }, w: 3, color: 'ink3', opacity: 0.55 },
        { kind: 'line', a: { x: RAIL_FRONT, y: 40 }, b: { x: RAIL_FRONT, y: SCENE_FLOOR - 2 }, w: 3, color: 'ink3' },
        ...[0, 1, 2, 3].map((i) => ({
          kind: 'line' as const,
          a: { x: RAIL_BACK, y: 66 + i * 16 },
          b: { x: RAIL_BACK - 7, y: 66 + i * 16 },
          w: 2,
          color: 'ink3' as const,
        })),
        // the crossbar the comment always promised: the carriage, riding the rails at the bar
        { kind: 'dash', a: { x: RAIL_BACK - 4, y: bar.y }, b: { x: RAIL_FRONT + 4, y: bar.y }, w: 2, color: 'ink3', dash: [2, 3], opacity: 0.7 },
      );
      /*
       * NO PLATE RING (audit, 2026-09-03). A `plateGhost` of r 20 at the bar spanned the whole
       * skull — an astronaut's helmet in every frame, with the head redrawn on top to rescue it —
       * and a lower-rim arc read as a bib across the chest. The rails, the catches and the
       * carriage already say Smith; the bar's sleeve collar around the fist says the bar is held.
       */
      front = [{ kind: 'circle', c: bar, r: 5.5, stroke: 'ink3', w: 2.2 }];
    } else if (p.implement === 'machine') {
      /*
       * The shoulder pad rides the TRAPS — behind the neck, below the head (visual QC 2026-08-25:
       * drawn at head height it read as headgear, not as a machine). One pad bar across the
       * shoulder line, on a CARRIAGE that slides up the mast with her.
       */
      const sj = pose.j.shoulder;
      /*
       * The frame: a mast grounded behind her, and the carriage — pad, arm and handles — riding it
       * (audit, 2026-09-03: the arm used to be a FIXED beam at y=34 that the head rose into at the
       * top of every rep, and the mast's x was read off the drifting shoulder, so the mast moved).
       * The stack stands behind the mast and rises with her.
       */
      const MAST_X = sj.x - 42;
      const tower = stackTower({ x0: MAST_X - 30, x1: MAST_X - 6, capY: 46, stackTopY: SCENE_FLOOR - 34 }, (HEEL_LOW - pose.j.heel.y) * 0.8);
      rails.push(
        ...tower.prims,
        { kind: 'line', a: { x: MAST_X, y: 34 }, b: { x: MAST_X, y: SCENE_FLOOR - 2 }, w: 3.5, color: 'ink3' },
        { kind: 'line', a: { x: MAST_X - 10, y: SCENE_FLOOR - 2 }, b: { x: MAST_X + 12, y: SCENE_FLOOR - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
        { kind: 'line', a: { x: MAST_X - 8, y: 46 }, b: { x: MAST_X, y: 46 }, w: 2.5, color: 'ink3' },
        // the carriage: a sleeve on the mast, the arm out to the pad at shoulder height
        { kind: 'rect', x: MAST_X - 3.5, y: sj.y - 9, width: 7, height: 18, rx: 1.5, fill: 'paper3', stroke: 'ink3', w: 2 },
        { kind: 'line', a: { x: MAST_X, y: sj.y }, b: { x: sj.x - 13, y: sj.y }, w: 3, color: 'ink3' },
        { kind: 'rect', x: sj.x - 13, y: sj.y - 4, width: 26, height: 8, rx: 4, fill: 'paper3', stroke: 'ink3', w: 2 },
        // the handle bracket forward off the pad, and the handle itself in the implement's ink
        { kind: 'line', a: { x: sj.x + 11, y: sj.y + 2 }, b: { x: hand.x, y: hand.y }, w: 2.5, color: 'ink3' },
        { kind: 'line', a: { x: hand.x - 4, y: hand.y }, b: { x: hand.x + 4, y: hand.y }, w: 3.5, color: 'ink0', cap: 'round' },
      );
    }
    const back: Primitive[] = [...rails, ...block, ...barPathTicks(BLOCK_X0 - 30, HEEL_LOW, HEEL_HIGH)];
    return { back, front };
  };

  const straightKnee = (label: string) => ({
    kind: 'jointAngle' as const,
    joint: 'knee',
    neighbors: ['hip', 'ankle'] as [string, string],
    min: 168,
    max: 180,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    /* startAt 'bottom': the rep OPENS in the stretch below the block, which is where she stands. */
    start: [
      straightKnee('knee straight at the stretch'),
      { kind: 'contactY', a: 'heel', y: HEEL_LOW, tol: 2, label: 'all the way down — the heel below the block' },
    ],
    end: [
      straightKnee('and still straight at the top — the knee never helps'),
      { kind: 'contactY', a: 'heel', y: HEEL_HIGH, tol: 2, label: 'all the way up onto the toes' },
    ],
    /*
     * An ARC, not a vertical. The heel is the far end of a rigid foot pivoting on the ball, so its
     * path is a circle of radius `HEEL_R` about that ball — and the constraint that makes it true
     * is the pivot holding still, which is the `pointFixed` on the toe below (the toes lie flat on
     * the block past the ball and never move). Declaring it `vertical` was only ever true of the
     * old stretching foot, whose heel slid straight down because its length was free to change.
     */
    path: { track: 'heel', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'toe', tol: 0.5, label: 'the ball of the foot is the pivot, and it stays' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the body stays tall — no dip' },
      { kind: 'angleNever', joint: 'knee', neighbors: ['hip', 'ankle'], aboveDeg: 180.5, label: 'no knee hyperextension' },
    ],
  };

  return {
    id: p.id,
    chains: p.implement === 'bar' ? { ...calfChains, nearArmInk: { upper: 'ink1' as const, fore: 'ink0' as const } } : calfChains,
    formspec,
    poseAt,
    decorAt,
    scene: [...floorScene(SCENE_FLOOR, HIP_X, 26), groundShadow(HIP_X, 26, SCENE_FLOOR)],
  };
}

export const standingCalfRaise = calfRaise({ id: 'standing_calf_raise', implement: 'machine' });
export const smithCalfRaise = calfRaise({ id: 'smith_calf_raise', implement: 'bar' });
export const dbCalfRaise = calfRaise({ id: 'db_calf_raise', implement: 'db' });
export const singleLegCalfRaise = calfRaise({ id: 'single_leg_calf_raise', implement: 'bodyweight', singleLeg: true });
// leg_press_calf_raise moved to `legPress.ts` (equipment QC 2026-08-25): its noun is the SLED —
// drawn standing with a trap pad it wore the standing machine's signature, which §3.5 forbids.
