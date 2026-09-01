/**
 * The MOTION AUDITOR — the universal laws, the ones no rig declares.
 *
 * `formspec.validate` checks what a rig SAYS about itself: its start position, its endpoint, its
 * tracked path, its invariants. That is the right shape for exercise-specific correctness, and it
 * is blind by construction to everything a rig never thought to declare. A rig cannot fail a
 * predicate it does not have.
 *
 * This file is the other half: truths that hold for every one of the rigs because they are true of
 * BODIES, checked over the real timeline rather than at three sampled roms. Nothing here is
 * configurable per exercise — that is the point. If a rig needs an exemption it must earn it in
 * code review, not by omitting a line.
 *
 * The laws:
 *
 *   1. NO BONE STRETCHES. A rig may foreshorten a segment — a humerus abducting into depth
 *      projects shorter than it is — but a projection can only ever be SHORTER than the bone.
 *      A projected length that exceeds the canonical `ATHLETE` length is a rig pulling a joint to
 *      a target it cannot reach, and it is always a bug.
 *   2. NO BONE BREATHES WITHOUT MEANING. Projected length may change across a rep (that IS
 *      rotation into depth), but a segment that swings wildly is either rotating hard — which the
 *      author must have intended — or being stretched and snapped back. Reported, not failed.
 *   3. NO JOINT TELEPORTS. Between adjacent timeline frames every joint moves less than a
 *      threshold. A jump means a discontinuity in the rig's own maths — a branch, a clamp firing,
 *      an IK solution flipping sides.
 *   4. NO KNEE OR ELBOW INVERTS. The hinge joints keep the SAME bend sign for the whole rep. A
 *      sign flip is the two-bone IK choosing the mirror solution mid-rep, which reads as the limb
 *      snapping inside out.
 *   5. NOBODY SINKS THROUGH THE FLOOR. No joint travels below the floor line, with the single
 *      allowance for a deliberate deficit (a calf raise off a block) which must be declared here.
 *
 * Sampling is uniform in `rom`. The timeline that maps time → rom is a C1 ease and cannot itself
 * introduce a discontinuity, so `poseAt` is the only thing worth probing, and probing it directly
 * keeps every law here independent of frame rate and tempo.
 */

//

import type { Pose, Rig, Vec2 } from './types';
import { FLAT, project, type Camera } from './camera';
import { ATHLETE } from './anthro';
import { angleAt, dist } from './geometry';

export interface AuditFinding {
  rig: string;
  law: string;
  detail: string;
  /** `warn` is reported and not failed — a shape a human must look at, not a proven defect. */
  severity: 'fail' | 'warn';
}

/** The canonical floor (`bodies.FLOOR_Y`) — the fallback when a rig draws no floor of its own. */
const DEFAULT_FLOOR_Y = 193;

/**
 * A rig's OWN floor, read off the line `kit.floorScene` puts in its scene.
 *
 * Not every scene stands on 193. `step_up` drops its ground 18 units so the box has somewhere to
 * sit, and against a hard-coded 193 its trailing foot looked like it was 18 units underground —
 * a false positive, and exactly the kind that discredits a law. Reading the floor the rig actually
 * drew is both correct and self-maintaining: a scene that moves its ground takes its own laws with
 * it.
 */
function floorOf(rig: Rig): number {
  let y = -Infinity;
  for (const p of rig.scene) {
    if (p.kind === 'line' && Math.abs(p.a.y - p.b.y) < 0.01 && Math.abs(p.a.x - p.b.x) > 200) {
      y = Math.max(y, p.a.y);
    }
  }
  return y === -Infinity ? DEFAULT_FLOOR_Y : y;
}

/**
 * Rigs whose athlete legitimately stands below the floor line, and by how much. A calf raise is
 * performed off a block: the heel drops into a deficit by design, and the block is drawn under the
 * forefoot. Anything not on this list that goes under the floor is falling through it.
 */
const DEFICIT_ALLOWANCE: Record<string, number> = {
  standing_calf_raise: 16,
  smith_calf_raise: 16,
  db_calf_raise: 16,
  single_leg_calf_raise: 16,
  seated_calf_raise: 16,
  seated_db_calf_raise: 16,
  leg_press_calf_raise: 200, // performed in the sled, nowhere near the floor line
  hack_squat: 200,
  leg_press: 200,
  single_leg_press: 200,
};

/** Floor on the outlier test, so a joint that barely moves all rep cannot trip on rounding. */
const TELEPORT_LIMIT = 6;

/** Slack on a canonical bone length before a projection counts as a stretch. */
const STRETCH_TOL = 1.5;

/**
 * The one bone that is allowed to grow, and only where growing it IS the exercise.
 *
 * `ATHLETE.torso` is hip joint → shoulder joint, and everywhere else in the library that distance
 * is a bone. A SHRUG is the exception: the movement is scapular elevation, the shoulder girdle
 * riding up the rib cage, so the hip→shoulder distance genuinely lengthens — about 8 cm at the top,
 * which is the 7 units measured here. Refusing to draw that would be refusing to draw the exercise.
 *
 * This is a list of two, deliberately. Anything added to it is a claim that a body part changes
 * length, and there is exactly one part of one movement in this catalogue that does.
 */
const SCAPULAR_ELEVATION: Record<string, number> = {
  bb_shrug: 8,
  db_shrug: 8,
};

interface Bone {
  a: string;
  b: string;
  /** canonical length from `ATHLETE`; a projection may be shorter but never longer */
  max: number;
  name: string;
}

/** Every bone the chains expose, near side and far, derived rather than hand-listed. */
function bonesOf(rig: Rig): Bone[] {
  const c = rig.chains;
  const out: Bone[] = [];
  const arm = (ch: string[] | undefined, side: string) => {
    if (!ch || ch.length < 3) return;
    out.push({ a: ch[0], b: ch[1], max: ATHLETE.upperArm, name: `${side} upper arm` });
    out.push({ a: ch[1], b: ch[2], max: ATHLETE.foreArm, name: `${side} forearm` });
  };
  const leg = (ch: string[] | undefined, side: string) => {
    if (!ch || ch.length < 3) return;
    out.push({ a: ch[0], b: ch[1], max: ATHLETE.thigh, name: `${side} thigh` });
    out.push({ a: ch[1], b: ch[2], max: ATHLETE.shank, name: `${side} shank` });
  };
  arm(c.nearArm, 'near');
  arm(c.farArm, 'far');
  leg(c.nearLeg, 'near');
  leg(c.farLeg, 'far');
  out.push({ a: c.torso[0], b: c.torso[1], max: ATHLETE.torso, name: 'torso' });
  out.push({ a: c.neck[0], b: c.neck[1], max: ATHLETE.neck, name: 'neck' });
  if (c.nearFoot) out.push({ a: c.nearFoot[0], b: c.nearFoot[1], max: ATHLETE.foot, name: 'near foot' });
  if (c.farFoot) out.push({ a: c.farFoot[0], b: c.farFoot[1], max: ATHLETE.foot, name: 'far foot' });
  return out;
}

/**
 * Which way a three-point chain bends, and only when it MEANS it. Measured as the interior angle
 * rather than a raw cross product, because the cross product scales with segment length and there
 * is no length-independent threshold to put on it.
 *
 * `0` means "no opinion": the limb is within `STRAIGHT_DEG` of straight. That deadband is the
 * whole law. A limb that locks out and comes off the lock a degree the other way — a knee at 179°
 * in a single-leg RDL, an arm at 177° in a russian twist — has not inverted, it has passed through
 * straight, and calling that a defect buries the real ones.
 */
const STRAIGHT_DEG = 15;

function bendSign(a: Vec2, b: Vec2, c: Vec2): number {
  if (angleAt(a, b, c) > 180 - STRAIGHT_DEG) return 0;
  const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  return Math.sign(z);
}

/** Audit one rig over its own timeline. `frames` samples across one full loop. */
export function auditRig(id: string, rig: Rig, frames = 96): AuditFinding[] {
  const found: AuditFinding[] = [];
  // Sampled UNIFORMLY IN ROM, not over the eased clock. The timeline is provably smooth
  // (`easeInOut` is C1), so the only thing that can be discontinuous is `poseAt` itself — and
  // testing it directly is what makes the continuity law frame-rate independent. Sampling the
  // clock instead made every short concentric look like a teleport: 16 unrelated rigs all
  // "jumped" at exactly frame 42, which is the signature of a measuring error, not 16 bugs.
  const poses = Array.from({ length: frames + 1 }, (_, i) => rig.poseAt(i / frames));
  const bones = bonesOf(rig);
  const deficit = DEFICIT_ALLOWANCE[id] ?? 1.5;
  const FLOOR_Y = floorOf(rig);

  /*
   * TRUE length, not drawn length. `dist` measures the page, and for a flat rig the page IS the
   * athlete — but a rig with depth draws a foreshortened bone on purpose, and measuring only that
   * would let a humerus grow to any length at all so long as it pointed at the lens while it did
   * it. The stretch law therefore reads `Pose.z`. The projection-swing WARN below keeps the flat
   * measure, because a swing in projection is exactly what that one is reporting.
   */
  const len3 = (pose: Pose, a: string, b: string): number => {
    const p = pose.j[a];
    const q = pose.j[b];
    const dz = (pose.z?.[a] ?? 0) - (pose.z?.[b] ?? 0);
    return Math.hypot(p.x - q.x, p.y - q.y, dz);
  };

  /*
   * DRAWN length — the bone as it reaches the page, through the rig's own camera.
   *
   * The swing warn is a statement about the PROJECTION, so it has to measure the projection that
   * actually ships. Reading the authored x/y instead was fine while every rig was flat and wrong
   * the moment one was not: `face_pull` was reported at an 88 % swing on an upper arm that the
   * shipped 35° camera never draws below 61 %, because the authored plane is edge-on to a movement
   * staged to come out of it. The camera axis is derived exactly as `frame.ts` derives it — off the
   * athlete's own torso chain — so the number here and the number on the page are the same number.
   */
  const cam: Camera = rig.camera ?? FLAT;
  const camAt = (pose: Pose): Camera => {
    const hipA = pose.j[rig.chains.torso[0]];
    const shA = pose.j[rig.chains.torso[1]];
    const spine =
      hipA && shA && Math.hypot(shA.x - hipA.x, shA.y - hipA.y) > 1
        ? { x: shA.x - hipA.x, y: shA.y - hipA.y }
        : { x: 0, y: -1 };
    return { ...cam, axis: cam.axis ?? spine };
  };
  const drawn = (pose: Pose, a: string, b: string): number => {
    if (cam.azimuth === 0) return dist(pose.j[a], pose.j[b]);
    const c = camAt(pose);
    const p = project(pose.j[a], pose.z?.[a] ?? 0, c);
    const q = project(pose.j[b], pose.z?.[b] ?? 0, c);
    return Math.hypot(p.x - q.x, p.y - q.y);
  };

  // ── 1 + 2: bones ────────────────────────────────────────────────────────────
  for (const bone of bones) {
    let min = Infinity;
    let max = -Infinity;
    let trueMax = -Infinity;
    let worstAt = 0;
    for (let i = 0; i < poses.length; i++) {
      const a = poses[i].j[bone.a];
      const b = poses[i].j[bone.b];
      if (!a || !b) continue;
      const d = drawn(poses[i], bone.a, bone.b);
      const t = len3(poses[i], bone.a, bone.b);
      if (t > trueMax) {
        trueMax = t;
        worstAt = i;
      }
      if (d > max) max = d;
      if (d < min) min = d;
    }
    if (max === -Infinity) continue;
    const slack = bone.name === 'torso' ? (SCAPULAR_ELEVATION[id] ?? 0) + STRETCH_TOL : STRETCH_TOL;
    if (trueMax > bone.max + slack) {
      found.push({
        rig: id,
        law: 'no bone stretches',
        severity: 'fail',
        detail: `${bone.name} (${bone.a}→${bone.b}) reaches ${trueMax.toFixed(1)} against a canonical ${bone.max} at frame ${worstAt}/${frames}`,
      });
    }
    // a projection that loses more than a third of its length is rotating hard into depth
    if (min < max * 0.66 && max > 6) {
      found.push({
        rig: id,
        law: 'bone swings in projection',
        severity: 'warn',
        detail: `${bone.name} projects ${min.toFixed(1)}…${max.toFixed(1)} across the rep (${(100 - (min / max) * 100).toFixed(0)}% swing)`,
      });
    }
  }

  // ── 3: continuity ───────────────────────────────────────────────────────────
  // Measured against the joint's OWN typical step, not an absolute distance. An eased rep spends
  // its middle frames moving fast on purpose — a fixed threshold flags the concentric of every
  // deadlift as a teleport, which is how the first version of this law lied. A real discontinuity
  // is an OUTLIER: one step far larger than the median step of the same joint in the same rep.
  const names = Object.keys(poses[0].j);
  for (const n of names) {
    const steps: number[] = [];
    for (let i = 1; i < poses.length; i++) {
      const p = poses[i].j[n];
      const q = poses[i - 1].j[n];
      if (p && q) steps.push(dist(p, q));
    }
    if (steps.length < 8) continue;
    const sorted = [...steps].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    const limit = Math.max(TELEPORT_LIMIT, median * 5);
    let worst = 0;
    let at = 0;
    steps.forEach((d, i) => {
      if (d > worst) {
        worst = d;
        at = i + 1;
      }
    });
    if (worst > limit) {
      found.push({
        rig: id,
        law: 'no joint teleports',
        severity: 'fail',
        detail: `${n} steps ${worst.toFixed(1)} at rom ${(at / frames).toFixed(3)} against a median step of ${median.toFixed(2)}`,
      });
    }
  }

  // ── 4: hinge joints keep their sign ─────────────────────────────────────────
  const hinges: Array<{ ch: string[] | undefined; name: string; full: number }> = [
    { ch: rig.chains.nearArm, name: 'near elbow', full: ATHLETE.upperArm + ATHLETE.foreArm },
    { ch: rig.chains.farArm, name: 'far elbow', full: ATHLETE.upperArm + ATHLETE.foreArm },
    { ch: rig.chains.nearLeg, name: 'near knee', full: ATHLETE.thigh + ATHLETE.shank },
    { ch: rig.chains.farLeg, name: 'far knee', full: ATHLETE.thigh + ATHLETE.shank },
  ];
  for (const h of hinges) {
    if (!h.ch || h.ch.length < 3) continue;
    // `bendSign` returns 0 inside the straight deadband, so both `seen` and `s` below are already
    // MEANINGFUL bends — a flip between them is a limb that was bent one way, and is now bent the
    // other, which is a limb turning inside out.
    let seen = 0;
    let flippedAt = -1;
    for (let i = 0; i < poses.length; i++) {
      const [a, b, c] = h.ch.map((n) => poses[i].j[n]);
      if (!a || !b || !c) continue;
      // A limb turned into depth has no readable bend: its projected span collapses and the three
      // joints go collinear, so the sign it reports is about the camera, not the joint. Only judge
      // a limb that is still substantially IN PLANE — the same reason `spanNever` replaced the
      // fly family's `angleNever`.
      if (dist(a, c) < h.full * 0.5) continue;
      const s = bendSign(a, b, c);
      if (s === 0) continue;
      if (seen === 0) seen = s;
      else if (s !== seen && flippedAt < 0) flippedAt = i;
    }
    if (flippedAt >= 0) {
      found.push({
        rig: id,
        law: 'no hinge inverts',
        severity: 'fail',
        detail: `${h.name} reverses its bend direction at frame ${flippedAt}/${frames}`,
      });
    }
  }

  // ── 5: the floor ────────────────────────────────────────────────────────────
  let deepest = 0;
  let deepestName = '';
  for (const p of poses) {
    for (const [n, pt] of Object.entries(p.j)) {
      const below = pt.y - FLOOR_Y;
      if (below > deepest) {
        deepest = below;
        deepestName = n;
      }
    }
  }
  if (deepest > deficit) {
    found.push({
      rig: id,
      law: 'nobody sinks through the floor',
      severity: 'fail',
      detail: `${deepestName} reaches ${deepest.toFixed(1)} below the floor (allowance ${deficit})`,
    });
  }

  // ── 6: a planted foot implies a standing leg ────────────────────────────────
  // The law that caught the deadlift. When heel AND toe are both on the floor line the leg is
  // bearing weight, and a weight-bearing knee is above its own ankle — always. Below it, the shin
  // has rotated through the ground and the athlete is kneeling, whatever the exercise claims.
  const legs: Array<{ leg: string[] | undefined; foot: [string, string] | undefined; name: string }> = [
    { leg: rig.chains.nearLeg, foot: rig.chains.nearFoot, name: 'near' },
    { leg: rig.chains.farLeg, foot: rig.chains.farFoot, name: 'far' },
  ];
  for (const L of legs) {
    if (!L.leg || L.leg.length < 3 || !L.foot) continue;
    let worst = 0;
    let at = -1;
    for (let i = 0; i < poses.length; i++) {
      const j = poses[i].j;
      const heel = j[L.foot[0]];
      const toe = j[L.foot[1]];
      const knee = j[L.leg[1]];
      const ankle = j[L.leg[2]];
      if (!heel || !toe || !knee || !ankle) continue;
      const planted = Math.abs(heel.y - FLOOR_Y) < 2.5 && Math.abs(toe.y - FLOOR_Y) < 2.5;
      if (!planted) continue;
      const under = knee.y - ankle.y;
      if (under > worst) {
        worst = under;
        at = i;
      }
    }
    if (worst > 2) {
      found.push({
        rig: id,
        law: 'a planted foot implies a standing leg',
        severity: 'fail',
        detail: `${L.name} knee sits ${worst.toFixed(1)} BELOW its own ankle at frame ${at}/${frames} while the foot is flat on the floor`,
      });
    }
  }

  return found;
}

/** Audit every rig in a registry. */
export function auditAll(registry: Record<string, Rig>, frames = 96): AuditFinding[] {
  return Object.entries(registry).flatMap(([id, rig]) => auditRig(id, rig, frames));
}
