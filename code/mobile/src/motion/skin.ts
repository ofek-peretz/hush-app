/**
 * The Duotone Athlete skin (v2 of the approved Duotone Depth direction) — the ONE figure renderer
 * shared by every exercise. v1 drew uniform-width strokes and read as an articulated skeleton;
 * v2 renders a BODY while keeping the same two-tone depth language (near side dark, far side
 * faint, zero shading, zero outline decoration):
 *
 *   • The trunk is a filled silhouette built around the hip→shoulder spine — glutes behind the
 *     pelvis, a lumbar hollow, chest mass in front, a trap slope into the shoulder. Because it is
 *     generated from the two spine joints + a facing normal, the SAME code embodies a standing
 *     squat, a 45° hinge, and a lifter lying on a bench (where the lumbar hollow becomes the arch
 *     and the glutes/upper back become the pad contact).
 *   • Limbs are tapered capsules — thigh mass narrowing to the ankle, upper arm narrowing to the
 *     wrist — closed with a fist at the hand so the figure visibly GRIPS the bar.
 *   • Feet are planted wedges, heel to toe.
 *
 * Correctness still lives in the pose data and the FormSpec; this file only decides how the
 * figure looks. Pure: Pose + chains → Primitive[].
 */
import type { ColorToken, CubicSeg, FigureChains, Pose, Primitive, Vec2 } from './types';
import { LIMB_W } from './anthro';

const NECK_W = 6.5;

// ── small pure helpers ───────────────────────────────────────────────────────────

const norm = (v: Vec2): Vec2 => {
  const l = Math.hypot(v.x, v.y) || 1e-9;
  return { x: v.x / l, y: v.y / l };
};
/** rot90 in screen coords (y down): the athlete's front for a right-facing figure. */
const rot90 = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x });

/** Closed Catmull-Rom loop → cubic-bezier path primitive (deterministic smoothing). */
function smoothClosed(pts: Vec2[], fill: ColorToken, opacity?: number): Primitive {
  const n = pts.length;
  const segs: CubicSeg[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    segs.push({
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      to: p2,
    });
  }
  return { kind: 'path', start: pts[0], segs, closed: true, fill, opacity };
}

/** A limb as a chain of tapered capsules: joint discs + filled trapezoids between them. */
function taperedLimb(pts: Vec2[], widths: readonly number[], color: ColorToken): Primitive[] {
  const out: Primitive[] = [];
  if (pts.length < 2) return out;
  const w = (i: number) => widths[Math.min(i, widths.length - 1)];
  out.push({ kind: 'circle', c: pts[0], r: w(0) / 2, fill: color });
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = rot90(norm({ x: b.x - a.x, y: b.y - a.y }));
    const ra = w(i) / 2;
    const rb = w(i + 1) / 2;
    out.push({
      kind: 'poly',
      pts: [
        { x: a.x + n.x * ra, y: a.y + n.y * ra },
        { x: b.x + n.x * rb, y: b.y + n.y * rb },
        { x: b.x - n.x * rb, y: b.y - n.y * rb },
        { x: a.x - n.x * ra, y: a.y - n.y * ra },
      ],
      fill: color,
    });
    out.push({ kind: 'circle', c: b, r: rb, fill: color });
  }
  return out;
}

function chainPts(pose: Pose, names: string[] | undefined): Vec2[] | null {
  if (!names) return null;
  const pts = names.map((n) => pose.j[n]).filter(Boolean) as Vec2[];
  return pts.length >= 2 ? pts : null;
}

// ── the trunk silhouette ─────────────────────────────────────────────────────────

/**
 * Profile stations along the spine (t: 0 = hip, 1 = shoulder; off: signed offset along the front
 * normal, + = front). The shape they trace is the athlete: glute mass behind the pelvis, a lumbar
 * hollow, lat spread into a trap slope behind; hip bone, abdomen line, chest mass in front.
 */
const TRUNK_PROFILE: ReadonlyArray<[number, number]> = [
  [-0.1, -1.5], // pelvis floor (rounded seat of the trunk)
  [0.05, -9.5], // glutes
  [0.45, -5.5], // lumbar hollow
  [0.8, -7.5], // lats / upper back
  [1.06, -4], // traps rising to the shoulder
  [1.1, 1.5], // over the shoulder joint
  [0.94, 7], // front of the shoulder
  [0.68, 9], // chest
  [0.34, 6.5], // abdomen
  [0, 7.5], // hip bone
];

function trunk(hip: Vec2, shoulder: Vec2, facing: 1 | -1): Primitive {
  const dir = norm({ x: shoulder.x - hip.x, y: shoulder.y - hip.y });
  const len = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
  const n = rot90(dir);
  const fx = n.x * facing;
  const fy = n.y * facing;
  const pts = TRUNK_PROFILE.map(([t, off]) => ({
    x: hip.x + dir.x * t * len + fx * off,
    y: hip.y + dir.y * t * len + fy * off,
  }));
  return smoothClosed(pts, 'ink1');
}

/** Planted foot: a low wedge from the heel, over the instep, down to the toe. */
function footWedge(heel: Vec2, toe: Vec2, color: ColorToken): Primitive {
  const dx = toe.x - heel.x;
  return {
    kind: 'poly',
    pts: [
      { x: heel.x, y: heel.y },
      { x: heel.x + dx * 0.06, y: heel.y - 5.5 },
      { x: heel.x + dx * 0.62, y: heel.y - 4 },
      { x: toe.x, y: toe.y - 0.5 },
      { x: toe.x, y: toe.y },
    ],
    fill: color,
  };
}

/** The point on the head circle facing the shoulder, so the neck meets the head cleanly. */
function neckJoin(head: Vec2, r: number, shoulder: Vec2): Vec2 {
  const d = norm({ x: shoulder.x - head.x, y: shoulder.y - head.y });
  return { x: head.x + d.x * r, y: head.y + d.y * r };
}

/** Render the Duotone Athlete for a pose. Back-to-front: far limbs → trunk → near leg/foot → neck/head → near arm. */
export function skinFigure(pose: Pose, chains: FigureChains): Primitive[] {
  const out: Primitive[] = [];
  const j = pose.j;
  const facing = chains.facing ?? 1;

  const farArm = chainPts(pose, chains.farArm);
  const farLeg = chainPts(pose, chains.farLeg);
  if (farArm) out.push(...taperedLimb(farArm, LIMB_W.arm, 'ink4'));
  if (farLeg) out.push(...taperedLimb(farLeg, LIMB_W.leg, 'ink4'));
  if (chains.farFoot) {
    const [h, t] = chains.farFoot;
    if (j[h] && j[t]) out.push(footWedge(j[h], j[t], 'ink4'));
  }

  const hip = j[chains.torso[0]];
  const shoulder = j[chains.torso[1]];
  if (hip && shoulder) out.push(trunk(hip, shoulder, facing));

  const nearLeg = chainPts(pose, chains.nearLeg);
  if (nearLeg) out.push(...taperedLimb(nearLeg, LIMB_W.leg, 'ink0'));
  if (chains.nearFoot) {
    const [h, t] = chains.nearFoot;
    if (j[h] && j[t]) out.push(footWedge(j[h], j[t], 'ink0'));
  }

  const head = j[chains.head];
  if (head && shoulder) {
    out.push({ kind: 'line', a: shoulder, b: neckJoin(head, pose.headR, shoulder), w: NECK_W, color: 'ink1', cap: 'round' });
  }
  if (head) out.push({ kind: 'circle', c: head, r: pose.headR, fill: 'ink1' });

  const nearArm = chainPts(pose, chains.nearArm);
  if (nearArm) {
    out.push(...taperedLimb(nearArm, LIMB_W.arm, 'ink0'));
    // the fist — the figure visibly holds the implement
    out.push({ kind: 'circle', c: nearArm[nearArm.length - 1], r: LIMB_W.handR, fill: 'ink0' });
  }

  return out;
}
