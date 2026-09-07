/**
 * calf_bent — the seated calf raise: plantarflexion with the knee at 90°, which is the whole
 * point of the pattern (the bent knee slackens the gastrocnemius and hands the work to the
 * soleus — a different muscle than the standing family trains, which is why the catalogue keeps
 * both). Side view, seated; the HEEL is the moving end and everything above the knee is still.
 *
 * ── THE KNEE RISES, AND IT USED NOT TO (rebuilt 2026-08-29) ─────────────────────────────────────
 *
 * This file used to say that the knee "is held down by the machine's pad, so nothing above the
 * ankle can travel", and it drew exactly that: the heel climbed 22u and the knee stayed where it
 * was. A rigid shin cannot do that, and the drawing did not pretend otherwise — the shank ran
 * 33.2 → 11.7 across the rep, a shin that shortened by two thirds while nobody was looking.
 *
 * The mechanics were backwards, not just the drawing. The pad does not hold the knee down; the pad
 * IS THE LEVER, and driving it UP is the entire exercise. If nothing above the ankle moved, the
 * calf would be lifting nothing at all.
 *
 * So the chain is closed properly now. The ball of the foot is the pivot; the foot turns about it
 * as one rigid piece; the ankle rides on the foot; the shin carries the knee up with it; and the
 * knee is solved where the thigh from a seated hip and the shin from the ankle actually meet. The
 * pad, the lever, the plate and the athlete's own hands all follow the knee, because on a real
 * machine they are bolted to it. The knee travels 19u up, which is the rep.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { bendToward, lerp, lerpV, twoBoneIK, twoBoneIKToward, withinReach } from '../geometry';
import { sticksAt } from '../curves';

/** A single-joint rig still has a sticking point — the last fifth, where the moment arm is longest;
 *  the driver slows there and arrives (iron rule 12, 2026-09-07). Endpoints untouched. */
const STICK = sticksAt(0.85, 0.06);
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, dumbbellSide, floorScene, padStroke, plateGhost } from '../kit';
import { FLOOR_Y, far } from '../bodies';

/** The seated body: upright trunk, thigh level, shin down to the block under the toes. */
const HIP: Vec2 = { x: 150, y: 155 };
const SHOULDER: Vec2 = { x: 150, y: 155 - ATHLETE.torso };
const HEAD: Vec2 = { x: 151, y: SHOULDER.y - ATHLETE.neck };
/** The block under the ball of the foot; the heel hangs behind and below it. */
const BLOCK_TOP = FLOOR_Y - 12;
/*
 * 218, and the number is the KNEE ANGLE. Where the block sits decides how far the ankle is from the
 * seated hip, and that distance is the only thing that sets how bent the knee is — which is the
 * whole pattern ("the bend IS the exercise": a bent knee slackens the gastrocnemius and hands the
 * work to the soleus). At 200 the hip sat 40u from the ankle and the knee folded to 63°. At 218 it
 * is 54.8, and the knee holds 90° across the entire rep.
 */
const TOE: Vec2 = { x: 218, y: BLOCK_TOP };

/**
 * The foot's rotation about the ball, in degrees of heel-above-horizontal. Negative is the stretch
 * — the heel sunk below the block, which is what the third cue asks for and what the block is there
 * to make possible.
 */
const THETA_LOW = -25;
const THETA_HIGH = 30;

/** The foot, turned rigidly about the ball of the foot. Canonical length, at every angle. */
function footAt(theta: number): { heel: Vec2; ankle: Vec2 } {
  const t = (theta * Math.PI) / 180;
  const c = Math.cos(t);
  const sn = Math.sin(t);
  // toe → heel, and the normal standing up out of the foot
  const heel: Vec2 = { x: TOE.x - ATHLETE.foot * c, y: TOE.y - ATHLETE.foot * sn };
  // the ankle sits 5u forward of the heel along the foot and `ankleH` above it, and turns with it
  const ankle: Vec2 = {
    x: heel.x + 5 * c + ATHLETE.ankleH * sn,
    y: heel.y + 5 * sn - ATHLETE.ankleH * c,
  };
  return { heel, ankle };
}

/**
 * The knee, where the thigh from the seated hip and the shin from the ankle actually meet — a
 * two-circle intersection, solved every frame rather than pinned. `bendToward` is resolved once so
 * the branch can never flip mid-rep.
 */
const KNEE_BEND = bendToward(HIP, footAt(THETA_LOW).ankle, ATHLETE.thigh, ATHLETE.shank, { x: 190, y: 148 });
function kneeAt(ankle: Vec2): Vec2 {
  return twoBoneIK(HIP, ankle, ATHLETE.thigh, ATHLETE.shank, KNEE_BEND);
}

const HEEL_LOW = footAt(THETA_LOW).heel.y;
const HEEL_HIGH = footAt(THETA_HIGH).heel.y;
const KNEE_LOW = kneeAt(footAt(THETA_LOW).ankle);
const KNEE_HIGH = kneeAt(footAt(THETA_HIGH).ankle);

interface CalfBentParams {
  id: string;
  /** The machine's knee pad, or dumbbells resting on the knees. */
  implement: 'machine' | 'db';
}

function seatedCalfRaise(p: CalfBentParams): Rig {
  const poseAt = (rom: number): Pose => {
    const { heel, ankle } = footAt(lerp(THETA_LOW, THETA_HIGH, STICK(rom)));
    const KNEE = kneeAt(ankle);
    /* The hands rest on the pad, so they RIDE THE KNEE — they were pinned to a fixed one, and a
       hand that stays put while the thing under it rises is a hand resting on nothing. */
    const hand = withinReach(SHOULDER, { x: KNEE.x - 6, y: KNEE.y - 8 }, (ATHLETE.upperArm + ATHLETE.foreArm) * 0.97);
    const elbow = twoBoneIKToward(SHOULDER, hand, ATHLETE.upperArm, ATHLETE.foreArm, { x: SHOULDER.x + 8, y: SHOULDER.y + ATHLETE.upperArm - 2 });
    return {
      headR: ATHLETE.headR,
      j: {
        head: HEAD,
        shoulder: SHOULDER,
        hip: HIP,
        knee: KNEE,
        ankle,
        heel,
        toe: TOE,
        elbow,
        hand,
        farShoulder: far(SHOULDER, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(HIP, -6, 1),
        farKnee: far(KNEE, -6, 1),
        farAnkle: far(ankle, -6, 1),
        farHeel: far(heel, -6, 0),
        farToe: far(TOE, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const KNEE = pose.j.knee;
    const back: Primitive[] = [
      // the seat and its post
      { kind: 'rect', x: HIP.x - 20, y: HIP.y + 5, width: 40, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
      { kind: 'line', a: { x: HIP.x, y: HIP.y + 12 }, b: { x: HIP.x, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
      // the block under the ball of the foot, with its top edge extended as the reading line
      { kind: 'rect', x: TOE.x - 8, y: BLOCK_TOP, width: 22, height: FLOOR_Y - BLOCK_TOP, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
      { kind: 'dash', a: { x: TOE.x - 34, y: BLOCK_TOP }, b: { x: TOE.x - 8, y: BLOCK_TOP }, w: 1.5, color: 'ink3', dash: [3, 4], opacity: 0.7 },
      ...barPathTicks(TOE.x - 40, HEEL_LOW, HEEL_HIGH),
    ];
    if (p.implement === 'machine') {
      /*
       * The lever the thigh pad hangs on, and the plate it carries.
       *
       * The pad was floating: a lozenge resting on the knees with nothing above or beside it, and
       * no load anywhere in frame. A seated calf machine is a plate-loaded lever — the pad sits on
       * an arm that pivots off a post in front of the shin, and the horn with the discs is what
       * makes it a machine rather than someone kneeling under a cushion.
       */
      /* The lever pivots off a FIXED post — only the pad end travels, which is what makes it a
         lever. Pinning the pivot to the moving knee made the whole machine ride up with the rep. */
      const PIVOT: Vec2 = { x: TOE.x + 26, y: KNEE_LOW.y + 4 };
      const padEnd: Vec2 = { x: KNEE.x - 4, y: KNEE.y - 11 };
      /*
       * The loading horn stands ON THE LEVER, between the pivot and the pad, and the disc rides it
       * up with every rep (audit, 2026-09-03: the horn used to stick out PAST the pivot, fixed in
       * space — the pad rose 14u and the weight moved not at all; and a horn beyond the pivot would
       * have to DROP as the pad rose, a seesaw). 65 % of the way out from the pivot the disc travels
       * ~8.5u, clear of the pad, the shin and the hands.
       */
      const horn: Vec2 = lerpV(PIVOT, padEnd, 0.65);
      back.push(
        { kind: 'line', a: { x: PIVOT.x, y: PIVOT.y }, b: { x: PIVOT.x, y: FLOOR_Y - 2 }, w: 3, color: 'ink3' },
        { kind: 'line', a: { x: PIVOT.x - 10, y: FLOOR_Y - 2 }, b: { x: PIVOT.x + 12, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3', cap: 'round' },
        { kind: 'line', a: PIVOT, b: padEnd, w: 3, color: 'ink3' },
        { kind: 'circle', c: PIVOT, r: 3, fill: 'paper1', stroke: 'ink3', w: 2 },
        { kind: 'line', a: horn, b: { x: horn.x, y: horn.y - 16 }, w: 3, color: 'ink3' },
        ...plateGhost({ x: horn.x, y: horn.y - 20 }, 13),
      );
    }
    const front: Primitive[] =
      p.implement === 'machine'
        ? padStroke({ x: KNEE.x - 12, y: KNEE.y - 9 }, { x: KNEE.x + 10, y: KNEE.y - 9 }, 8)
        : dumbbellSide({ x: KNEE.x - 2, y: KNEE.y - 10 }, { x: 1, y: 0 });
    return { back, front };
  };

  const bentKnee = (label: string) => ({
    kind: 'jointAngle' as const,
    joint: 'knee',
    neighbors: ['hip', 'ankle'] as [string, string],
    min: 70,
    max: 108,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      bentKnee('knee square under the pad — the bend IS the exercise'),
      { kind: 'contactY', a: 'heel', y: HEEL_LOW, tol: 2, label: 'stretch at the bottom — heel below the block' },
      { kind: 'contactY', a: 'knee', y: KNEE_LOW.y, tol: 2, label: 'the pad starts low' },
    ],
    end: [
      bentKnee('and still square at the top — the knee never straightens to help'),
      { kind: 'contactY', a: 'heel', y: HEEL_HIGH, tol: 2, label: 'drive through the toes' },
      { kind: 'contactY', a: 'knee', y: KNEE_HIGH.y, tol: 2, label: 'and the pad is driven up — the calf lifts the load' },
    ],
    /* An ARC, because the heel turns about the ball of the foot and that is a circle, not a line.
       Declared vertical it drifted 3.4u in x and failed its own path check — the heel was never on
       a vertical path; the old rig just moved it down one. */
    path: { track: 'heel', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'toe', tol: 0.5, label: 'the ball of the foot stays on the block' },
      /* NOT `pointFixed` on the knee. The knee is the LOAD here: it rises 19u with the pad, and
         pinning it is what produced a shin that shortened by two thirds. What is fixed is the ball
         of the foot and the seat, which is all a seated calf raise actually holds still. */
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'seated and still' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'the body does not rock' },
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
    scene: floorScene(FLOOR_Y, 168, 34),
  };
}

export const seatedCalfRaiseRig = seatedCalfRaise({ id: 'seated_calf_raise', implement: 'machine' });
export const seatedDbCalfRaiseRig = seatedCalfRaise({ id: 'seated_db_calf_raise', implement: 'db' });
