/**
 * Pure 2D geometry for the motion system: vectors, a closed-form two-bone IK solver, joint-angle
 * measurement, and easing. No dependencies — runs identically in RN, jest, and the Node harness.
 */

// 

import type { Vec2, Vec3 } from './types';

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpV = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

const RAD2DEG = 180 / Math.PI;

/** Interior angle (degrees) at `vertex`, between the segments vertex→a and vertex→b. */
export function angleAt(a: Vec2, vertex: Vec2, b: Vec2): number {
  const u = sub(a, vertex);
  const w = sub(b, vertex);
  const du = Math.hypot(u.x, u.y) || 1e-9;
  const dw = Math.hypot(w.x, w.y) || 1e-9;
  const cos = Math.min(1, Math.max(-1, (u.x * w.x + u.y * w.y) / (du * dw)));
  return Math.acos(cos) * RAD2DEG;
}

/** Angle (degrees) of the segment a→b measured from the +x axis, in (-180, 180]. */
export function segAngle(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * RAD2DEG;
}

/**
 * Two-bone inverse kinematics. Given a fixed `root`, a `target` end-effector, and bone lengths
 * `l1` (root→mid) and `l2` (mid→target), return the mid-joint (elbow / knee) position. `bend`
 * (+1 / -1) selects which of the two mirror solutions — i.e. which way the joint flexes. The
 * target is clamped into reach so the solver never returns NaN when the limb is fully extended.
 */
export function twoBoneIK(root: Vec2, target: Vec2, l1: number, l2: number, bend: 1 | -1): Vec2 {
  const EPS = 1e-4;
  const dir0 = sub(target, root);
  let d = Math.hypot(dir0.x, dir0.y) || EPS;
  const dMin = Math.abs(l1 - l2) + EPS;
  const dMax = l1 + l2 - EPS;
  const dc = Math.min(dMax, Math.max(dMin, d));
  const dir = { x: dir0.x / d, y: dir0.y / d };
  // distance from root to the foot of the perpendicular from the mid-joint onto the root→target line
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const foot = { x: root.x + dir.x * a, y: root.y + dir.y * a };
  const perp = { x: -dir.y * bend, y: dir.x * bend };
  return { x: foot.x + perp.x * h, y: foot.y + perp.y * h };
}

/**
 * Pull `target` in along the line from `root` until it is within `reach`, and leave it alone if it
 * already is.
 *
 * This is the fix for a whole family of defects the motion auditor turned up. A rig would author
 * where a hand or a foot HAS to be — on a handle, on a step, on a clasp sweeping across the body —
 * and then place the joint between by interpolating a fixed fraction of the way there. That is fine
 * while the target is reachable and silently catastrophic when it is not: the bones simply grow to
 * cover the distance. `cable_woodchop` was drawing an upper arm at 51.4 units against a canonical
 * 25 — an arm twice its own length — because the chop's end position is further from the far
 * shoulder than a whole arm.
 *
 * Clamping the TARGET rather than stretching the limb states the real constraint: an athlete who
 * cannot reach does not grow, he stops short (and in life, turns his trunk to follow — which is a
 * separate, deliberate authoring decision, not something a renderer may fake).
 */
export function withinReach(root: Vec2, target: Vec2, reach: number): Vec2 {
  const d = dist(root, target);
  if (d <= reach || d < 1e-6) return target;
  const k = reach / d;
  return { x: root.x + (target.x - root.x) * k, y: root.y + (target.y - root.y) * k };
}

/**
 * Two-bone IK that picks the branch landing NEAREST `hint` — the elbow or knee a rig was already
 * drawing, however it was drawing it.
 *
 * Converting a hand-placed joint to IK is otherwise a guess: `bend` is +1 or -1 and the wrong one
 * puts the elbow through the athlete's chest. Passing the old position as a hint makes each
 * conversion mechanical and side-preserving — the limb keeps the shape it was ratified with, and
 * only its LENGTHS become exact.
 *
 * ⚠️ FOR CONSTANTS, NOT FOR EVERY FRAME. Which branch is nearer depends on the geometry, so calling
 * this inside `poseAt` lets the answer CHANGE mid-rep: the elbow snaps to the far side between one
 * frame and the next. Measured, when that mistake was made here: a 45.8-unit step in `cable_crunch`
 * and a bend reversal in `diamond_push_up`, both caught by the motion auditor within a minute.
 * Resolve the side ONCE with `bendToward` and pass the fixed sign to `twoBoneIK` thereafter.
 */
export function twoBoneIKToward(root: Vec2, target: Vec2, l1: number, l2: number, hint: Vec2): Vec2 {
  const a = twoBoneIK(root, target, l1, l2, 1);
  const b = twoBoneIK(root, target, l1, l2, -1);
  return dist(a, hint) <= dist(b, hint) ? a : b;
}

/**
 * The branch `twoBoneIKToward` would pick, resolved ONCE so a rig can hold it fixed for a whole rep.
 * This is the safe way to use a hint inside an animation: decide the side at authoring time, then
 * solve every frame with a constant sign, so the joint can bend and straighten but never snap over.
 */
export function bendToward(root: Vec2, target: Vec2, l1: number, l2: number, hint: Vec2): 1 | -1 {
  const a = twoBoneIK(root, target, l1, l2, 1);
  const b = twoBoneIK(root, target, l1, l2, -1);
  return dist(a, hint) <= dist(b, hint) ? 1 : -1;
}

/** `withinReach` against whichever of two roots is further away — a two-handed grip on one point. */
export function withinReachOfBoth(a: Vec2, b: Vec2, target: Vec2, reach: number): Vec2 {
  const far = dist(a, target) >= dist(b, target) ? a : b;
  return withinReach(far, target, reach);
}

/** Cubic ease-in-out — the motion law's "confirm, never perform" curve. */
export function easeInOut(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * TWO-BONE IK IN THREE DIMENSIONS — the elbow (or knee) placed so BOTH bones are exactly canonical.
 *
 * The 2D solver has two answers and a sign picks between them. In 3D the answers form a whole
 * CIRCLE about the root→target axis, so a direction has to be supplied instead: `hint` is roughly
 * where the joint belongs — out to the side, down, behind — and its component along the axis is
 * removed, so it only ever chooses WHERE ON THE CIRCLE, never how far from the root.
 *
 * This exists because composing a 2D solve with a separately-authored depth does not produce a
 * limb: `fly.ts` did exactly that and its upper arm ran 25 → 33.6 across the sweep while its
 * projection dutifully got shorter. Solve in the space the bones actually live in, project after.
 */
export function twoBoneIK3(
  root: Vec3,
  target: Vec3,
  l1: number,
  l2: number,
  hint: Vec3,
): Vec3 {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dz = target.z - root.z;
  const d = Math.hypot(dx, dy, dz) || 1e-6;
  /* Out of reach is answered by pointing straight at the target, exactly as the 2D solver does:
     a limb that cannot arrive should be drawn straight, never stretched to arrive anyway. */
  const reach = Math.min(d, l1 + l2 - 1e-6);
  const a = (reach * reach + l1 * l1 - l2 * l2) / (2 * reach);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  const uz = dz / d;
  let hx = hint.x;
  let hy = hint.y;
  let hz = hint.z;
  const dot = hx * ux + hy * uy + hz * uz;
  hx -= dot * ux;
  hy -= dot * uy;
  hz -= dot * uz;
  let hn = Math.hypot(hx, hy, hz);
  if (hn < 1e-6) {
    // the hint was parallel to the axis and says nothing — fall back to "down the page"
    hx = -uy * ux;
    hy = 1 - uy * uy;
    hz = -uy * uz;
    hn = Math.hypot(hx, hy, hz) || 1;
  }
  return {
    x: root.x + a * ux + h * (hx / hn),
    y: root.y + a * uy + h * (hy / hn),
    z: root.z + a * uz + h * (hz / hn),
  };
}
