/**
 * The FormSpec validator — correctness as data. It samples a rig's timeline and asserts every
 * predicate on the resulting poses: the start position, the working endpoint, the path constraint,
 * and the whole-rep invariants. A keyframe that violates the exercise's category template makes
 * this fail, in jest, on every commit. This is the mechanism that stops the demonstration from
 * ever contradicting Hush's own cues (MOTION_FORM_STANDARD_V1 §1).
 */
import type { FormSpec, Invariant, Pose, PosePredicate, Rig } from './types';
import { angleAt, dist } from './geometry';

export interface Violation {
  where: string;
  detail: string;
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
}

function need(pose: Pose, name: string): { x: number; y: number } {
  const p = pose.j[name];
  if (!p) throw new Error(`FormSpec references joint "${name}" absent from the pose`);
  return p;
}

function checkPredicate(pose: Pose, p: PosePredicate): string | null {
  if (p.kind === 'jointAngle') {
    const a = angleAt(need(pose, p.neighbors[0]), need(pose, p.joint), need(pose, p.neighbors[1]));
    if (p.min != null && a < p.min) return `${p.label ?? p.joint} angle ${a.toFixed(1)}° < min ${p.min}°`;
    if (p.max != null && a > p.max) return `${p.label ?? p.joint} angle ${a.toFixed(1)}° > max ${p.max}°`;
    return null;
  }
  if (p.kind === 'contactY') {
    const a = need(pose, p.a);
    if (Math.abs(a.y - p.y) > p.tol) return `${p.label ?? p.a} y=${a.y.toFixed(1)} not within ${p.tol} of contact line ${p.y}`;
    return null;
  }
  // jointBelow
  const a = need(pose, p.a);
  const b = need(pose, p.b);
  if (!(a.y > b.y + p.by)) return `${p.label ?? p.a} not below ${p.b} by ${p.by} (Δy=${(a.y - b.y).toFixed(1)})`;
  return null;
}

function checkInvariant(pose: Pose, start: Pose, inv: Invariant): string | null {
  if (inv.kind === 'pointFixed') {
    const d = dist(need(pose, inv.point), need(start, inv.point));
    if (d > inv.tol) return `${inv.label ?? inv.point} moved ${d.toFixed(2)} (> ${inv.tol})`;
    return null;
  }
  if (inv.kind === 'segmentAngleFixed') {
    const cur = angleAt({ x: need(pose, inv.a).x + 1, y: need(pose, inv.a).y }, need(pose, inv.a), need(pose, inv.b));
    const ref = angleAt({ x: need(start, inv.a).x + 1, y: need(start, inv.a).y }, need(start, inv.a), need(start, inv.b));
    if (Math.abs(cur - ref) > inv.tolDeg) return `${inv.label ?? `${inv.a}→${inv.b}`} angle drifted ${Math.abs(cur - ref).toFixed(1)}° (> ${inv.tolDeg}°)`;
    return null;
  }
  // angleNever
  const a = angleAt(need(pose, inv.neighbors[0]), need(pose, inv.joint), need(pose, inv.neighbors[1]));
  if (a > inv.aboveDeg) return `${inv.label ?? inv.joint} angle ${a.toFixed(1)}° exceeded ${inv.aboveDeg}°`;
  return null;
}

/**
 * Validate a rig against its FormSpec. `samples` poses are taken across one rep; start/end
 * predicates are checked at rom 0 / rom 1, invariants and the path at every sample.
 */
export function validate(rig: Rig, samples = 120): ValidationResult {
  const spec: FormSpec = rig.formspec;
  const violations: Violation[] = [];
  const startPose = rig.poseAt(0);
  const endPose = rig.poseAt(1);

  for (const p of spec.start) {
    const msg = checkPredicate(startPose, p);
    if (msg) violations.push({ where: 'start', detail: msg });
  }
  for (const p of spec.end) {
    const msg = checkPredicate(endPose, p);
    if (msg) violations.push({ where: 'end', detail: msg });
  }

  // Path: the tracked joint must hold its axis across the whole rep, and must actually travel
  // (a degenerate path that never moves is not a demonstration).
  const refX = rig.poseAt(0).j[spec.path.track]?.x;
  const refY = rig.poseAt(0).j[spec.path.track]?.y;
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;

  for (let i = 0; i <= samples; i++) {
    const rom = i / samples;
    const pose = rig.poseAt(rom);

    if (spec.path.kind === 'vertical' && refX != null) {
      const tx = need(pose, spec.path.track).x;
      if (Math.abs(tx - refX) > spec.path.tol) {
        violations.push({ where: `path@rom=${rom.toFixed(2)}`, detail: `${spec.path.track} x=${tx.toFixed(2)} left the vertical axis (ref ${refX.toFixed(2)}, tol ${spec.path.tol})` });
      }
    }
    if (spec.path.kind === 'horizontal' && refY != null) {
      const ty = need(pose, spec.path.track).y;
      if (Math.abs(ty - refY) > spec.path.tol) {
        violations.push({ where: `path@rom=${rom.toFixed(2)}`, detail: `${spec.path.track} y=${ty.toFixed(2)} left the horizontal axis (ref ${refY.toFixed(2)}, tol ${spec.path.tol})` });
      }
    }
    const tp = need(pose, spec.path.track);
    minY = Math.min(minY, tp.y); maxY = Math.max(maxY, tp.y);
    minX = Math.min(minX, tp.x); maxX = Math.max(maxX, tp.x);

    for (const inv of spec.invariants) {
      const msg = checkInvariant(pose, startPose, inv);
      if (msg) violations.push({ where: `invariant@rom=${rom.toFixed(2)}`, detail: msg });
    }
  }

  const travel = Math.max(maxY - minY, maxX - minX);
  if (travel < 5) violations.push({ where: 'path', detail: `tracked point barely travels (${travel.toFixed(1)}u) — not a real range of motion` });

  // de-duplicate identical invariant/path messages across samples for a readable report
  const seen = new Set<string>();
  const deduped = violations.filter((x) => {
    const key = x.where.replace(/@rom=[0-9.]+/, '@*') + '|' + x.detail.replace(/[0-9.]+/g, '#');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { ok: deduped.length === 0, violations: deduped };
}
