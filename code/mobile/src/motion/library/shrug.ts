/**
 * shrug — the calf raise of the shoulders, and authored with the same move: nothing bends, one
 * girdle translates. Side view; the two members differ only in what hangs from the hands.
 *
 * The card's three cues are the whole rig: "Arms long, no curling" — the elbow angle is held in
 * one near-straight window at BOTH endpoints and capped by `angleNever`, so the arm cannot quietly
 * become a curl (the fault that turns a shrug into an upright row). "Lift the shoulders straight
 * up" — the shoulder is the tracked point on a `vertical` path. "Lower for a full stretch" — the
 * bottom endpoint sits BELOW the neutral shoulder line: the stretch is drawn, not implied.
 *
 * The head rides the girdle (it sits on the traps being trained); the hip, knees and torso angle
 * are pinned — no leg drive, no lean-back. The LOAD rides the hands, which ride the shoulders:
 * the plate's travel IS the shoulders' travel, which is what makes 6 units readable.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barPathTicks, dumbbellSide, floorScene, plateGhost } from '../kit';
import { FLOOR_Y, far, standingCore } from '../bodies';

const X = 178;
const core = standingCore(X);
const DOWN: Vec2 = { x: 1, y: 0 };

/** Shoulder travel: a full stretch below neutral to a full lift above it. ~11u, read at the load. */
const SH_LOW = core.shoulder.y + 4;
const SH_HIGH = core.shoulder.y - 7;

interface ShrugParams {
  id: string;
  implement: 'bar' | 'db';
}

function shrug(p: ShrugParams): Rig {
  const poseAt = (rom: number): Pose => {
    const shY = lerp(SH_LOW, SH_HIGH, rom);
    const shoulder: Vec2 = { x: core.shoulder.x, y: shY };
    const head: Vec2 = { x: core.head.x, y: shY - (core.shoulder.y - core.head.y) };
    /* Arms long: the elbow and hand hang their full canonical lengths off the moving shoulder. */
    const elbow: Vec2 = { x: shoulder.x + 1.5, y: shoulder.y + ATHLETE.upperArm };
    const hand: Vec2 = { x: elbow.x + 0.5, y: elbow.y + ATHLETE.foreArm };
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip: core.hip,
        knee: core.knee,
        ankle: core.ankle,
        heel: core.heel,
        toe: core.toe,
        elbow,
        hand,
        farShoulder: far(shoulder, -6, 1),
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
    const back: Primitive[] = [
      // The range statement rides beside the LOAD's own travel — the readable image of the lift.
      ...barPathTicks(X - 30, SH_LOW + ATHLETE.upperArm + ATHLETE.foreArm, SH_HIGH + ATHLETE.upperArm + ATHLETE.foreArm),
    ];
    const front: Primitive[] =
      p.implement === 'bar'
        ? plateGhost(pose.j.hand)
        : [...dumbbellSide(pose.j.farHand, DOWN), ...dumbbellSide(pose.j.hand, DOWN)];
    return { back, front };
  };

  const longArm = (label: string) => ({
    kind: 'jointAngle' as const,
    joint: 'elbow',
    neighbors: ['shoulder', 'hand'] as [string, string],
    min: 160,
    max: 179,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'contactY', a: 'shoulder', y: SH_LOW, tol: 1.5, label: 'a full stretch — shoulders long' },
      longArm('arms long at the bottom'),
    ],
    end: [
      { kind: 'contactY', a: 'shoulder', y: SH_HIGH, tol: 1.5, label: 'lift the shoulders straight up' },
      longArm('and still long at the top — no curling'),
    ],
    path: { track: 'shoulder', kind: 'vertical', tol: 1 },
    invariants: [
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'no leg drive' },
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'knees still' },
      { kind: 'angleNever', joint: 'elbow', neighbors: ['shoulder', 'hand'], aboveDeg: 179, label: 'no elbow hyperextension' },
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

export const bbShrugRig = shrug({ id: 'bb_shrug', implement: 'bar' });
export const dbShrugRig = shrug({ id: 'db_shrug', implement: 'db' });
