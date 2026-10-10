/**
 * hinge_isolated — the 45° back extension: the good morning turned into furniture. The pelvis is
 * CLAMPED by the bench's pad, the legs are locked down the machine's line, and the trunk hinges
 * about the fixed hip — which is the whole point of "isolated": the machine removes every joint
 * but the one being trained.
 *
 * Side view. The trunk sweeps from hanging-down (the stretch over the pad's edge) to one line
 * with the legs — and NOT past it: the finishing fault on this bench is hyperextending at the
 * top, and the trunk's sweep simply stops at the body line, with the endpoint predicate holding
 * it there. Arms crossed at the chest, riding the trunk.
 */

//

import type { Decor, FormSpec, Pose, Primitive, Rig, Vec2 } from '../types';
import { bendToward, lerp, twoBoneIK } from '../geometry';
import { CONCENTRIC_TEMPO, DEFAULT_TEMPO } from '../timeline';
import { ATHLETE } from '../anthro';
import { floorScene, padStroke, sampledPathTicks } from '../kit';
import { FLOOR_Y, far } from '../bodies';

/** The bench's line: feet anchored low at the rear, the hip pad high at the front, ~40°. */
const HIP: Vec2 = { x: 168, y: 128 };
const KNEE: Vec2 = { x: 196, y: 152 };
const ANKLE: Vec2 = { x: 218, y: 172 };

/** Trunk angle from the leg line's CONTINUATION: 0 = one straight line, 90 = hanging straight down. */
const THETA_TOP = 4; // finished: the body one line, a shade shy of dead straight
/* 86, from 78: the hip closes to 94° at the stretch — a real 45° hyper hangs to about a right
   angle at the hip, and 78 stopped 12° short of it (audit, 2026-09-03). */
const THETA_BOTTOM = 86;

/** The leg line's direction, hip → beyond (up-forward at the bench's angle). */
const LEG_RAD = Math.atan2(ANKLE.y - HIP.y, ANKLE.x - HIP.x); // pointing down-back

/**
 * The trunk's direction at θ, and its ANTERIOR normal — the side the chest is on. The lifter is
 * prone: face-down along the bench, so the front of the body faces the floor at the top and
 * swings to face the bench's post as the trunk hangs. The crossed arms ride that side.
 */
function trunkAt(theta: number): { shoulder: Vec2; head: Vec2; front: Vec2 } {
  /*
   * The trunk continues the leg line when θ=0 and folds DOWN toward the floor as θ grows — which
   * is MINUS θ from the continuation. It shipped as PLUS θ for months: the trunk then swung UP off
   * the leg line, a 78° hyperextension arcing down to neutral, and the athlete read as leaning
   * back off the bench. The hip-angle predicates could not see it, because an interior angle has
   * no side (audit, 2026-09-03).
   */
  const r = LEG_RAD + Math.PI - (theta * Math.PI) / 180;
  const shoulder: Vec2 = { x: HIP.x + ATHLETE.torso * Math.cos(r), y: HIP.y + ATHLETE.torso * Math.sin(r) };
  const head: Vec2 = { x: shoulder.x + ATHLETE.neck * Math.cos(r), y: shoulder.y + ATHLETE.neck * Math.sin(r) };
  return { shoulder, head, front: { x: Math.sin(r), y: -Math.cos(r) } };
}

export const backExtensionRig: Rig = (() => {
  const ARC = Array.from({ length: 17 }, (_, i) => trunkAt(lerp(THETA_BOTTOM, THETA_TOP, i / 16)).shoulder);

  const ARM_BEND: 1 | -1 = (() => {
    const t = trunkAt(THETA_BOTTOM);
    const hand: Vec2 = { x: lerp(HIP.x, t.shoulder.x, 0.7) + t.front.x * 6, y: lerp(HIP.y, t.shoulder.y, 0.7) + t.front.y * 6 };
    return bendToward(t.shoulder, hand, ATHLETE.upperArm, ATHLETE.foreArm, { x: lerp(HIP.x, t.shoulder.x, 0.55) + t.front.x * 9, y: lerp(HIP.y, t.shoulder.y, 0.55) + t.front.y * 9 });
  })();
  const poseAt = (rom: number): Pose => {
    /* rom 0 = the stretch (hanging), rom 1 = the finish (one line) — the lift is the raise. */
    const { shoulder, head, front } = trunkAt(lerp(THETA_BOTTOM, THETA_TOP, rom));
    /* Arms crossed at the chest: hands ride the trunk two-thirds up it, on its FRONT — offset along
       the anterior normal rather than straight down the page, so they stay on the chest through
       the whole 82° sweep instead of drifting to the back as the trunk hangs (audit, 2026-09-03). */
    /* Hands crossed on the chest are the authored end; the elbow is solved, so the upper arm keeps
       its canonical 25 instead of being however far the two landed apart (30.6). */
    const hand: Vec2 = { x: lerp(HIP.x, shoulder.x, 0.7) + front.x * 6, y: lerp(HIP.y, shoulder.y, 0.7) + front.y * 6 };
    /* The side is resolved ONCE (bendToward at the hang) and held: solved per frame, the crossed
       arm's branch flipped mid-sweep and the elbow teleported 49.7u (2026-09-07). */
    const elbow = twoBoneIK(shoulder, hand, ATHLETE.upperArm, ATHLETE.foreArm, ARM_BEND);
    return {
      headR: ATHLETE.headR,
      j: {
        head,
        shoulder,
        hip: HIP,
        knee: KNEE,
        ankle: ANKLE,
        heel: { x: ANKLE.x + 5, y: ANKLE.y + 6 },
        toe: { x: ANKLE.x - 5, y: ANKLE.y + 9 },
        elbow,
        hand,
        farShoulder: far(shoulder, -6, 1),
        farElbow: far(elbow, -6, 1),
        farHand: far(hand, -6, 1),
        farHip: far(HIP, -6, 1),
        farKnee: far(KNEE, -6, 1),
        farAnkle: far(ANKLE, -6, 1),
        farHeel: far({ x: ANKLE.x + 5, y: ANKLE.y + 6 }, -6, 0),
        farToe: far({ x: ANKLE.x - 5, y: ANKLE.y + 9 }, -6, 0),
      },
    };
  };

  const decorAt = (): Decor => ({
    back: [
      /* The bench: the sloped spine from the floor to the hip pad, the pad itself, and the
         ankle rollers that lock her in. */
      { kind: 'line', a: { x: ANKLE.x + 8, y: FLOOR_Y - 2 }, b: { x: HIP.x - 2, y: HIP.y + 12 }, w: 3, color: 'ink3' },
      ...padStroke({ x: HIP.x - 8, y: HIP.y + 8 }, { x: HIP.x + 12, y: HIP.y + 12 }, 8),
      ...padStroke({ x: ANKLE.x - 4, y: ANKLE.y - 8 }, { x: ANKLE.x + 8, y: ANKLE.y - 10 }, 7),
      { kind: 'line', a: { x: HIP.x + 4, y: HIP.y + 14 }, b: { x: HIP.x + 4, y: FLOOR_Y - 2 }, w: 2.5, color: 'ink3' },
      ...sampledPathTicks(ARC),
    ],
    front: [],
  });

  const formspec: FormSpec = {
    tempo: CONCENTRIC_TEMPO,
    start: [
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 88, max: 120, label: 'the stretch — trunk hanging over the pad' },
      /* The angle above has no side: it was 101° while the trunk pointed at the ceiling. This one
         has — the shoulder hangs BELOW the hip at the stretch, or it is not a stretch (audit, 2026-09-03). */
      { kind: 'jointBelow', a: 'shoulder', b: 'hip', by: 20, label: 'hanging — the shoulders below the hips, toward the floor' },
    ],
    end: [
      /* One line, and NOT past it: the finish window's ceiling IS the anti-hyperextension cue. */
      { kind: 'jointAngle', joint: 'hip', neighbors: ['knee', 'shoulder'], min: 160, max: 178, label: 'one line from heels to head — and no higher' },
    ],
    path: { track: 'shoulder', kind: 'arc', tol: 2 },
    invariants: [
      { kind: 'pointFixed', point: 'hip', tol: 0.5, label: 'the pad clamps the pelvis — the hinge is the only joint' },
      { kind: 'pointFixed', point: 'knee', tol: 0.5, label: 'legs locked down the bench' },
      { kind: 'pointFixed', point: 'ankle', tol: 0.5, label: 'ankles under the rollers' },
      { kind: 'angleNever', joint: 'hip', neighbors: ['knee', 'shoulder'], aboveDeg: 179, label: 'never hyperextend at the top' },
    ],
  };

  return {
    id: 'back_extension',
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
    scene: floorScene(FLOOR_Y, 190, 36),
  };
})();
