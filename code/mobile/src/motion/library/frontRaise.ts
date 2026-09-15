/**
 * front_raise — the lateral raise's own arc, swung into the SAGITTAL plane, which flips the
 * camera: a raise to the FRONT is invisible face-on (the arm points at the lens and shortens to
 * a fist — the fly's projection rule yet again) and is the plainest arc in profile. So this
 * family is drawn from the SIDE, with the curl's standing body, and the lateral raise's exact
 * discipline: a rigid soft-elbowed arm rotating about a fixed shoulder, to shoulder height and
 * NOT past it, with the torso forbidden from rocking back to throw the weight up.
 *
 * The rear-anchored cable member is the honest reason the machine version exists: with the pulley
 * LOW AND BEHIND her, the cable's pull stays against the movement through the whole arc — at the
 * bottom, where a dumbbell rests, the cable is already working. The stack rises as the arm does.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { sticksAt } from '../curves';

/** Same law as the lateral raise: the struggle is the last fifth, level with the shoulder (2026-09-07). */
const STICK = sticksAt(0.85, 0.06);
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { cable, dumbbellEnd, dumbbellSide, floorScene, pulley, sampledPathTicks } from '../kit';
import { stackTower } from '../machines';
import { FLOOR_Y, far, standingCore } from '../bodies';

const X = 168;
const core = standingCore(X);
const U = ATHLETE.upperArm;
const F = ATHLETE.foreArm;

/** The lateral raise's rigid arm, verbatim: near-full reach, a constant soft bend below the ray. */
const REACH_E = U * 0.97;
const REACH_H = (U + F) * 0.965;
const BEND = 3.4;

/** θ from straight-down, sweeping FORWARD (+x): 0 = hanging at the thigh, 90 = shoulder height. */
const THETA_BOTTOM = 8;
const THETA_TOP = 90;

function armAt(theta: number): { elbow: Vec2; hand: Vec2 } {
  const r = (theta * Math.PI) / 180;
  const s = core.shoulder;
  const ux = Math.sin(r);
  const uy = Math.cos(r);
  /* The bend hangs off the ray toward the floor — a soft elbow trails under the line of the arm. */
  const px = Math.cos(r);
  const py = -Math.sin(r);
  return {
    elbow: { x: s.x + REACH_E * ux - BEND * px, y: s.y + REACH_E * uy - BEND * py },
    hand: { x: s.x + REACH_H * ux, y: s.y + REACH_H * uy },
  };
}

interface FrontRaiseParams {
  id: string;
  implement: 'db' | 'cable';
}

function frontRaise(p: FrontRaiseParams): Rig {
  const ARC = Array.from({ length: 17 }, (_, i) => armAt(lerp(THETA_BOTTOM, THETA_TOP, i / 16)).hand);
  const PULLEY: Vec2 = { x: X - 44, y: FLOOR_Y - 12 }; // low and BEHIND — the card's own cue

  const poseAt = (rom: number): Pose => {
    const { elbow, hand } = armAt(lerp(THETA_BOTTOM, THETA_TOP, STICK(rom)));
    return {
      headR: ATHLETE.headR,
      j: {
        head: core.head,
        shoulder: core.shoulder,
        hip: core.hip,
        knee: core.knee,
        ankle: core.ankle,
        heel: core.heel,
        toe: core.toe,
        elbow,
        hand,
        farShoulder: far(core.shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(core.hip, -6, 1),
        farKnee: far(core.knee, -6, 1),
        farAnkle: far(core.ankle, -6, 1),
        farHeel: far(core.heel, -6, 0),
        farToe: far(core.toe, -6, 0),
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const theta = lerp(THETA_BOTTOM, THETA_TOP, STICK(rom));
    const r = (theta * Math.PI) / 180;
    const dir: Vec2 = { x: Math.cos(r), y: -Math.sin(r) };
    const back: Primitive[] = [...sampledPathTicks(ARC)];
    let front: Primitive[];
    if (p.implement === 'db') {
      /* A front raise is PRONATED (palms down): from the side that is a plate end-on, and one —
         the far bell hides behind the near one. dumbbellSide was the hammer grip (2026-09-07). */
      front = [...dumbbellEnd(pose.j.hand, 6)];
    } else {
      const risen = (armAt(THETA_BOTTOM).hand.y - pose.j.hand.y) * 0.5;
      const tower = stackTower({ x0: PULLEY.x - 34, x1: PULLEY.x - 8, capY: FLOOR_Y - 98, stackTopY: FLOOR_Y - 34 }, risen);
      back.push(...tower.prims, ...pulley(PULLEY));
      /* The cable runs BEHIND the near leg from a low pulley behind her — so it draws in back and
         disappears into the fist, instead of lying across the thigh in front (2026-09-07). */
      back.push(cable(PULLEY, pose.j.hand));
      front = [...dumbbellSide(pose.j.hand, dir, 3, 2.5)];
    }
    return { back, front };
  };

  const softElbow = (label: string) => ({
    kind: 'jointAngle' as const,
    joint: 'elbow',
    neighbors: ['shoulder', 'hand'] as [string, string],
    min: 150,
    max: 172,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      softElbow('soft elbows at the hang'),
      { kind: 'contactY', a: 'hand', y: armAt(THETA_BOTTOM).hand.y, tol: 2, label: 'the weight at the thigh' },
    ],
    end: [
      softElbow('and still soft at the top'),
      { kind: 'contactY', a: 'hand', y: core.shoulder.y, tol: 2.5, label: 'raise to shoulder height — and no higher' },
    ],
    path: { track: 'hand', kind: 'arc', tol: 1.5 },
    invariants: [
      { kind: 'pointFixed', point: 'shoulder', tol: 0.5, label: 'the shoulder is the hinge, and it stays' },
      { kind: 'segmentAngleFixed', a: 'hip', b: 'shoulder', tolDeg: 3, label: 'no rocking back — the torso does not throw it' },
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'hips still' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 174, label: 'the elbow stays soft, never locked' },
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
    scene: floorScene(FLOOR_Y, X, 30),
  };
}

export const dbFrontRaise = frontRaise({ id: 'db_front_raise', implement: 'db' });
export const cableFrontRaise = frontRaise({ id: 'cable_front_raise', implement: 'cable' });
