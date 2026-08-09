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
 *   • THE KNOCKOUT SEAM (v2.1): every near-plane element — the working arm, the near leg, the
 *     head — is drawn over a copy of itself widened by a thin PAPER gap. Over the pale media
 *     field the seam all but vanishes; over the dark trunk it becomes the crisp gap that keeps
 *     the moving limb readable — the demonstration can never dissolve into the body it crosses.
 *     High contrast exactly where mass overlaps mass, near-zero everywhere else, by construction.
 *
 * Correctness still lives in the pose data and the FormSpec; this file only decides how the
 * figure looks. Pure: Pose + chains → Primitive[].
 */
// @ts-nocheck

// 

import type { ColorToken, CubicSeg, FigureChains, Pose, Primitive, Vec2 } from './types';
import { LIMB_W } from './anthro';

const NECK_W = 6.5;
/** Knockout-seam width added to EACH side of a near-plane element. */
const HALO = 2;
const SEAM: ColorToken = 'paper1';

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

/**
 * A near-plane limb: knockout seam first (the widened silhouette + the fist's seam disc, in
 * paper), then the limb itself, then the fist. The fist's seam is laid down BEFORE the limb ink
 * so the forearm stays attached to its own hand — the seam only shows past the limb's edge.
 */
function nearLimb(pts: Vec2[], widths: readonly number[], color: ColorToken, fistR?: number): Primitive[] {
  const out: Primitive[] = [...taperedLimb(pts, widths.map((w) => w + HALO * 2), SEAM)];
  const end = pts[pts.length - 1];
  if (fistR != null) out.push({ kind: 'circle', c: end, r: fistR + HALO, fill: SEAM });
  out.push(...taperedLimb(pts, widths, color));
  if (fistR != null) out.push({ kind: 'circle', c: end, r: fistR, fill: color });
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

/**
 * The trunk silhouette. `bow` > 0 rounds the spine toward the back (crunch flexion): stations ride
 * a quadratic bezier from hip to shoulder whose control point is pushed `bow` units behind the
 * straight spine, and each station's offset follows the LOCAL normal — the whole profile flexes.
 */
function trunk(hip: Vec2, shoulder: Vec2, facing: 1 | -1, bow = 0): Primitive {
  const straightDir = norm({ x: shoulder.x - hip.x, y: shoulder.y - hip.y });
  const nStraight = rot90(straightDir);
  const ctrl: Vec2 = {
    x: (hip.x + shoulder.x) / 2 - nStraight.x * facing * bow,
    y: (hip.y + shoulder.y) / 2 - nStraight.y * facing * bow,
  };
  const at = (t: number): Vec2 => ({
    x: (1 - t) * (1 - t) * hip.x + 2 * (1 - t) * t * ctrl.x + t * t * shoulder.x,
    y: (1 - t) * (1 - t) * hip.y + 2 * (1 - t) * t * ctrl.y + t * t * shoulder.y,
  });
  const dirAt = (t: number): Vec2 =>
    norm({
      x: 2 * (1 - t) * (ctrl.x - hip.x) + 2 * t * (shoulder.x - ctrl.x),
      y: 2 * (1 - t) * (ctrl.y - hip.y) + 2 * t * (shoulder.y - ctrl.y),
    });
  const pts = TRUNK_PROFILE.map(([t, off]) => {
    const p = at(t);
    const n = rot90(dirAt(t));
    return { x: p.x + n.x * facing * off, y: p.y + n.y * facing * off };
  });
  return smoothClosed(pts, 'ink1');
}

/** The symmetric frontal trunk (view: 'front'): hipCenter → neckBase, half-widths mirrored. */
const TRUNK_FRONT_PROFILE: ReadonlyArray<[number, number]> = [
  [-0.08, 8], // pelvis floor
  [0.02, 13.5], // hips
  [0.35, 11], // waist
  [0.75, 15.5], // chest
  [0.97, 17], // shoulders
  [1.05, 9], // traps
];

function trunkFront(hipC: Vec2, neckBase: Vec2): Primitive {
  const dir = norm({ x: neckBase.x - hipC.x, y: neckBase.y - hipC.y });
  const len = Math.hypot(neckBase.x - hipC.x, neckBase.y - hipC.y);
  const n = rot90(dir);
  const P = (t: number, off: number): Vec2 => ({
    x: hipC.x + dir.x * t * len + n.x * off,
    y: hipC.y + dir.y * t * len + n.y * off,
  });
  const right = TRUNK_FRONT_PROFILE.map(([t, w]) => P(t, w));
  const left = TRUNK_FRONT_PROFILE.map(([t, w]) => P(t, -w)).reverse();
  return smoothClosed([...right, P(1.09, 0), ...left], 'ink1');
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

/**
 * Render the Duotone Athlete for a pose. Back-to-front: far limbs (side view: faint depth, no
 * seam) → trunk → near leg/foot → head → near arm, the near-plane elements each over their
 * knockout seam. In `view: 'front'` there IS no far side — the LEFT chains are equally near, so
 * they draw after the trunk in solid ink1 with the same seam, and both sides articulate.
 */
export function skinFigure(pose: Pose, chains: FigureChains): Primitive[] {
  const out: Primitive[] = [];
  const j = pose.j;
  const facing = chains.facing ?? 1;
  const front = chains.view === 'front';

  const farArm = chainPts(pose, chains.farArm);
  const farLeg = chainPts(pose, chains.farLeg);
  const farFoot: [Vec2, Vec2] | null =
    chains.farFoot && j[chains.farFoot[0]] && j[chains.farFoot[1]] ? [j[chains.farFoot[0]], j[chains.farFoot[1]]] : null;
  if (!front) {
    if (farArm) out.push(...taperedLimb(farArm, LIMB_W.arm, 'ink4'));
    if (farLeg) out.push(...taperedLimb(farLeg, LIMB_W.leg, 'ink4'));
    if (farFoot) out.push(footWedge(farFoot[0], farFoot[1], 'ink4'));
  }

  const hip = j[chains.torso[0]];
  const shoulder = j[chains.torso[1]];
  if (hip && shoulder) out.push(front ? trunkFront(hip, shoulder) : trunk(hip, shoulder, facing, pose.trunkBow ?? 0));

  const fistR = pose.fistR ?? LIMB_W.handR;
  if (front) {
    if (farLeg) out.push(...nearLimb(farLeg, LIMB_W.leg, 'ink1'));
    if (farFoot) out.push(footWedge(farFoot[0], farFoot[1], 'ink1'));
    if (farArm) out.push(...nearLimb(farArm, LIMB_W.arm, 'ink1', fistR));
  }

  const nearLeg = chainPts(pose, chains.nearLeg);
  if (nearLeg) out.push(...nearLimb(nearLeg, LIMB_W.leg, 'ink0'));
  if (chains.nearFoot) {
    const [h, t] = chains.nearFoot;
    if (j[h] && j[t]) out.push(footWedge(j[h], j[t], 'ink0'));
  }

  const head = j[chains.head];
  if (head) out.push({ kind: 'circle', c: head, r: pose.headR + HALO, fill: SEAM });
  if (head && shoulder) {
    out.push({ kind: 'line', a: shoulder, b: neckJoin(head, pose.headR, shoulder), w: NECK_W, color: 'ink1', cap: 'round' });
  }
  if (head) out.push({ kind: 'circle', c: head, r: pose.headR, fill: 'ink1' });

  const nearArm = chainPts(pose, chains.nearArm);
  // the fist closing the chain — the figure visibly holds the implement
  if (nearArm) out.push(...nearLimb(nearArm, LIMB_W.arm, 'ink0', fistR));

  return out;
}
