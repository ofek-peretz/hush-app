/**
 * shrug — the calf raise of the shoulders, and authored with the same move: nothing bends, one
 * girdle translates. The two members differ only in what hangs from the hands.
 *
 * ── RESTAGED FACE-ON (execution pass, 2026-09-07) ───────────────────────────────────────────────
 * It was a side view, and from the side a shrug is 9 units of a shoulder sliding up a trunk that
 * hides the other shoulder entirely — the audit scored its camera and its clarity at 7 and the
 * reviewer proposed the front. Face-on is the view every coach uses for this lift, because the
 * lift IS the two shoulders rising toward the ears together: both girdles visible, the neck
 * visibly shortening between them, the bar or the two bells across the thighs. The trunk's top
 * (`neckBase`) and the head stay put; the two shoulder joints ride up and the arms hang long from
 * them, which is exactly the skeleton's own account of a shrug.
 *
 * The card's three cues are the whole rig: "Arms long, no curling" — the elbow angle is held in
 * one near-straight window at BOTH endpoints and capped by `angleNever`, so the arm cannot quietly
 * become a curl (the fault that turns a shrug into an upright row). "Lift the shoulders straight
 * up" — the shoulder is the tracked point on a `vertical` path. "Lower for a full stretch" — the
 * bottom endpoint sits BELOW the neutral shoulder line: the stretch is drawn, not implied.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { lerp } from '../geometry';
import { sticksAt } from '../curves';
import { CONCENTRIC_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { barbellFront, barPathTicks, dumbbellFront, floorScene } from '../kit';
import { FLOOR_Y, standingFrontCore } from '../bodies';

const X = 176;
const core = standingFrontCore(X);

/** Shoulder travel: a full stretch below neutral to a full lift above it — 9u, read against the fixed head. */
const SH_LOW = core.shoulderR.y + 3;
const SH_HIGH = core.shoulderR.y - 6;
/** The squeeze at the top is where a shrug is held (iron rule 12). */
const STICK = sticksAt(0.85, 0.08);

interface ShrugParams {
  id: string;
  implement: 'bar' | 'db';
}

function shrug(p: ShrugParams): Rig {
  const poseAt = (rom: number): Pose => {
    const shY = lerp(SH_LOW, SH_HIGH, STICK(rom));
    const shoulderR: Vec2 = { x: core.shoulderR.x, y: shY };
    const shoulderL: Vec2 = { x: core.shoulderL.x, y: shY };
    /* Arms long: the elbow and hand hang their full canonical lengths off the moving shoulders,
       a shade inboard so the fists meet the bar in front of the thighs. */
    /* A soft elbow (~165°): the upper arm falls 9° inboard, the forearm 6° back out to the bar —
       dead straight (179.8°) tripped the hyperextension ceiling and reads as a mannequin. */
    const elbowR: Vec2 = { x: shoulderR.x - 4, y: shoulderR.y + ATHLETE.upperArm };
    const elbowL: Vec2 = { x: shoulderL.x + 4, y: shoulderL.y + ATHLETE.upperArm };
    const handR: Vec2 = { x: elbowR.x + 2.5, y: elbowR.y + ATHLETE.foreArm };
    const handL: Vec2 = { x: elbowL.x - 2.5, y: elbowL.y + ATHLETE.foreArm };
    return {
      headR: ATHLETE.headR,
      j: {
        ...core,
        shoulderR,
        shoulderL,
        elbowR,
        elbowL,
        handR,
        handL,
      },
    };
  };

  const decorAt = (rom: number): Decor => {
    const pose = poseAt(rom);
    const back: Primitive[] = [
      /* The range statement rides beside the near shoulder — the tracked point and the joint that
         moves — stated against the fixed head. */
      ...barPathTicks(X + 34, SH_LOW, SH_HIGH),
    ];
    const front: Primitive[] =
      p.implement === 'bar'
        ? barbellFront(X, pose.j.handR.y)
        : [...dumbbellFront(pose.j.handL, 0), ...dumbbellFront(pose.j.handR, 0)];
    return { back, front };
  };

  const longArm = (label: string) => ({
    kind: 'jointAngle' as const,
    joint: 'elbowR',
    neighbors: ['shoulderR', 'handR'] as [string, string],
    min: 160,
    max: 179,
    label,
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'contactY', a: 'shoulderR', y: SH_LOW, tol: 1.5, label: 'a full stretch — shoulders long' },
      longArm('arms long at the bottom'),
    ],
    end: [
      { kind: 'contactY', a: 'shoulderR', y: SH_HIGH, tol: 1.5, label: 'lift the shoulders straight up' },
      longArm('and still long at the top — no curling'),
    ],
    path: { track: 'shoulderR', kind: 'vertical', tol: 1 },
    invariants: [
      { kind: 'pointFixed', point: 'hipC', tol: 0.5, label: 'no leg drive' },
      { kind: 'pointFixed', point: 'kneeR', tol: 0.5, label: 'knees still' },
      { kind: 'pointFixed', point: 'head', tol: 0.5, label: 'the head stays — the shoulders come to it' },
      { kind: 'angleNever', joint: 'elbowR', neighbors: ['shoulderR', 'handR'], aboveDeg: 179, label: 'no elbow hyperextension' },
    ],
  };

  return {
    id: p.id,
    chains: {
      view: 'front',
      torso: ['hipC', 'neckBase'],
      neck: ['neckBase', 'head'],
      head: 'head',
      nearArm: ['shoulderR', 'elbowR', 'handR'],
      farArm: ['shoulderL', 'elbowL', 'handL'],
      nearLeg: ['hipR', 'kneeR', 'ankleR'],
      nearFoot: ['heelR', 'toeR'],
      farLeg: ['hipL', 'kneeL', 'ankleL'],
      farFoot: ['heelL', 'toeL'],
    },
    formspec,
    poseAt,
    decorAt,
    scene: floorScene(FLOOR_Y, X, 30),
  };
}

export const bbShrugRig = shrug({ id: 'bb_shrug', implement: 'bar' });
export const dbShrugRig = shrug({ id: 'db_shrug', implement: 'db' });
