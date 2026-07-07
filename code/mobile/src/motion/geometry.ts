/**
 * Pure 2D geometry for the motion system: vectors, a closed-form two-bone IK solver, joint-angle
 * measurement, and easing. No dependencies — runs identically in RN, jest, and the Node harness.
 */
import type { Vec2 } from './types';

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

/** Cubic ease-in-out — the motion law's "confirm, never perform" curve. */
export function easeInOut(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
