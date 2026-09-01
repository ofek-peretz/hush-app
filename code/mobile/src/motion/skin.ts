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
 *   • Limbs are FLESHED, not tapered capsules (v3): every segment carries a muscle belly, so the
 *     shank swells to a calf and pinches to the ankle, the humerus carries a biceps, the forearm
 *     a flexor mass. v2's straight knee→ankle taper had no calf at all, and that single missing
 *     curve is most of what made the figure read as a mannequin instead of an athlete. Each limb
 *     still closes with a fist at the hand so the figure visibly GRIPS the bar.
 *   • The head is a SKULL in side view (v3), not a disc: crown, brow, jaw, occiput, built in the
 *     neck-axis frame so it points where the lift does. Front view keeps the disc — there the
 *     face is aimed at the camera and there is no profile to draw.
 *   • The foot is built from its own three joints — ankle, heel, toe (v3.1) — so it has an
 *     achilles, an instep and a ball, and a calf raise draws the heel climbing off a planted
 *     forefoot instead of tilting a rigid plank.
 *   • THE KNOCKOUT SEAM (v2.1): every near-plane element — the working arm, the near leg, the
 *     head — is drawn over a copy of itself widened by a thin PAPER gap. Over the pale media
 *     field the seam all but vanishes; over the dark trunk it becomes the crisp gap that keeps
 *     the moving limb readable — the demonstration can never dissolve into the body it crosses.
 *     High contrast exactly where mass overlaps mass, near-zero everywhere else, by construction.
 *
 * Correctness still lives in the pose data and the FormSpec; this file only decides how the
 * figure looks. Pure: Pose + chains → Primitive[].
 */

// 

import type { ColorToken, CubicSeg, FigureChains, FigureSex, Pose, Primitive, Vec2 } from './types';
import { LIMB_W, LIMB_W_F, type LimbProfile } from './anthro';

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

/**
 * A smooth 0 → 1 → 0 hump peaking at `p`, used to swell a segment at its muscle belly. Raised-sine
 * on each side of the peak, so the contour leaves each joint tangent to the straight taper — no
 * corner where the belly starts.
 */
function hump(t: number, p: number): number {
  const s = t < p ? (p <= 0 ? 1 : t / p) : p >= 1 ? 1 : (1 - t) / (1 - p);
  const c = Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, s)));
  return c * c;
}

/** How finely a segment's belly contour is sampled. 8 reads as a curve at every size we render. */
const BELLY_STEPS = 8;

/**
 * The bend at the chain's articulating joint (the knee, the elbow): a vector POINTING into the
 * interior of the angle whose LENGTH is the confidence — 0 for a straight limb, 1 for a folded one.
 * See `LimbProfile` for why one vector must carry both: it is what lets the muscle lean to its own
 * side without ever being able to snap across when the limb passes through straight.
 */
function bendAt(pts: Vec2[], joint: number): Vec2 {
  const j = pts[joint];
  const a = pts[joint - 1];
  const b = pts[joint + 1];
  if (!j || !a || !b) return { x: 0, y: 0 };
  const u = norm({ x: a.x - j.x, y: a.y - j.y });
  const v = norm({ x: b.x - j.x, y: b.y - j.y });
  return { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 };
}

/**
 * A limb as a chain of fleshed segments: a joint disc at every joint, and between them a closed
 * contour sampled along the segment so the muscle belly (see `LimbProfile`) is part of the
 * silhouette, leaning to the side the muscle actually sits on. `pad` is added to every diameter —
 * that is how the knockout seam is drawn: the same contour, fattened, in paper.
 */
function taperedLimb(pts: Vec2[], prof: LimbProfile, color: ColorToken, pad = 0, hint?: Vec2): Primitive[] {
  const out: Primitive[] = [];
  if (pts.length < 2) return out;
  const w = (i: number) => prof.w[Math.min(i, prof.w.length - 1)];
  const belly = (i: number) => prof.belly[Math.min(i, prof.belly.length - 1)] ?? ([0.5, 1, 0] as const);
  // every segment leans about the SAME joint — the knee for a leg, the elbow for an arm
  const bend = pts.length >= 3 ? bendAt(pts, Math.min(1, pts.length - 2)) : { x: 0, y: 0 };
  // A STRAIGHT limb still has a back and a front. The joint bend goes to zero when the limb
  // locks out — correct, it has stopped saying anything — but a standing calf is emphatically
  // still behind the shin. `hint` is the posterior direction from a source that never vanishes
  // (the foot's heel for a leg, the trunk's facing for an arm); it is admitted only in the room
  // the bend leaves empty, so a bent joint always outranks it and the two never fight.
  // The falloff is QUADRATIC, and that is load-bearing rather than cosmetic. A hinge (an RDL, a
  // deadlift off the floor) carries a softly bent knee whose interior disagrees with the foot,
  // and a linear falloff let the hint out-vote it at exactly those roms — the calf jumped to the
  // shin. Squared, the hint is worth ~0.2 against a half-bent knee and ~0.7 against a locked one,
  // so a joint that still has something to say always outranks the fallback.
  const conf = Math.min(1, Math.hypot(bend.x, bend.y));
  const k = hint ? (1 - conf) * (1 - conf) * 0.8 : 0;
  const dir = hint ? { x: bend.x + hint.x * k, y: bend.y + hint.y * k } : bend;
  out.push({ kind: 'circle', c: pts[0], r: (w(0) + pad) / 2, fill: color });
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = rot90(norm({ x: b.x - a.x, y: b.y - a.y }));
    const [peak, mult, lean = 0] = belly(i);
    // how much of this segment's swelling goes to the +n side rather than the −n side, in [-1,1]
    const d = Math.max(-1, Math.min(1, lean * (dir.x * n.x + dir.y * n.y)));
    const baseR = (t: number) => (w(i) + (w(i + 1) - w(i)) * t) / 2;
    const bulge = (t: number) => baseR(t) * (mult - 1) * hump(t, peak);
    const near: Vec2[] = [];
    const far: Vec2[] = [];
    for (let s = 0; s <= BELLY_STEPS; s++) {
      const t = s / BELLY_STEPS;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const base = baseR(t) + pad / 2;
      const g = bulge(t);
      const rN = base + g * (1 + d);
      const rF = base + g * (1 - d);
      near.push({ x: p.x + n.x * rN, y: p.y + n.y * rN });
      far.push({ x: p.x - n.x * rF, y: p.y - n.y * rF });
    }
    out.push({ kind: 'poly', pts: [...near, ...far.reverse()], fill: color });
    out.push({ kind: 'circle', c: b, r: (w(i + 1) + pad) / 2, fill: color });
  }
  return out;
}

/**
 * The closed fist at the end of a limb. A disc is what shipped, and a disc has no wrist: the hand
 * read as a ball bearing on the end of a rod. A real fist around a bar is taller than it is long —
 * it stands ACROSS the forearm — and it carries a knuckle line at the far edge and the heel of the
 * hand behind. Drawn in the forearm's own frame, so it turns with every rep for free.
 */
function fistAt(pts: Vec2[], r: number, fill: ColorToken, grow: number): Primitive {
  const end = pts[pts.length - 1];
  const prev = pts[pts.length - 2] ?? { x: end.x - 1, y: end.y };
  const f = norm({ x: end.x - prev.x, y: end.y - prev.y }); // along the forearm, toward the hand
  const a = rot90(f); // across it
  const R = r + grow;
  const P = (along: number, across: number): Vec2 => ({
    x: end.x + f.x * along * R + a.x * across * R,
    y: end.y + f.y * along * R + a.y * across * R,
  });
  return smoothClosed(
    [
      P(0.62, 0.42), // knuckles, leading edge
      P(0.34, 0.98), // across the knuckle line
      P(-0.28, 1.12), // the back of the hand
      P(-0.72, 0.62), // the wrist, one side
      P(-0.78, -0.16), // heel of the hand
      P(-0.4, -0.82), // the wrist, the other side
      P(0.26, -1.02), // the curl of the fingers
      P(0.66, -0.4), // back to the knuckles
    ],
    fill,
  );
}

/**
 * A near-plane limb: knockout seam first (the widened silhouette + the fist's seam, in paper),
 * then the limb itself, then the fist. The fist's seam is laid down BEFORE the limb ink so the
 * forearm stays attached to its own hand — the seam only shows past the limb's edge.
 */
function nearLimb(pts: Vec2[], prof: LimbProfile, color: ColorToken, fistR?: number, hint?: Vec2): Primitive[] {
  const out: Primitive[] = [...taperedLimb(pts, prof, SEAM, HALO * 2, hint)];
  if (fistR != null) out.push(fistAt(pts, fistR, SEAM, HALO));
  out.push(...taperedLimb(pts, prof, color, 0, hint));
  if (fistR != null) out.push(fistAt(pts, fistR, color, 0));
  return out;
}

/**
 * The same flesh with every lean zeroed — the profile a FRONT view must use. Leaning is a
 * statement about the athlete's front-to-back axis, and in a front view that axis runs into the
 * screen: there is no near side to throw the calf onto. Worse, the rigs author front-view feet
 * pointing outward (near toe +13x, far toe −13x), so an unsuppressed hint would shove each calf
 * toward the other leg — a mirrored artefact, in the one view where the eye most expects symmetry.
 */
const flattenLean = (prof: LimbProfile): LimbProfile => ({
  w: prof.w,
  belly: prof.belly.map(([peak, mult]) => [peak, mult, 0] as const),
});

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
  [-0.12, -2.5], // pelvis floor (rounded seat of the trunk)
  [0.02, -11.5], // glute mass, stepping out behind the pelvis
  [0.24, -9], // upper glute tie-in
  [0.46, -6.2], // lumbar hollow — the small of the back
  [0.68, -8.6], // lat insertion, flaring back out
  [0.86, -10], // lat spread at its widest
  [1.02, -6], // trap slope
  [1.1, 0.6], // over the shoulder joint (the deltoid crown)
  [1.02, 6.6], // front deltoid
  [0.86, 10], // the pec shelf
  [0.66, 8.6], // under the pec
  [0.42, 7], // abdominal wall — the cut
  [0.14, 8], // lower abdomen
  [0, 8.6], // hip bone
];

/**
 * Her side profile — same stations, her distribution: full glutes and a deeper lumbar hollow,
 * less lat and trap mass into a softer shoulder, the bust projected at a slightly lower station
 * than the pec bulge, and a narrower abdomen line into the same hip bone.
 */
const TRUNK_PROFILE_F: ReadonlyArray<[number, number]> = [
  [-0.12, -2.5], // pelvis floor
  [0.02, -12], // glutes (fuller than his)
  [0.24, -8.6], // glute tie-in
  [0.44, -5.6], // lumbar hollow (deeper, higher than his)
  [0.68, -7.2], // upper back (no lat flare)
  [0.86, -8], // upper back at its widest
  [1.02, -4.6], // traps (soft slope)
  [1.1, 0.4], // over the shoulder joint
  [1.02, 5.8], // front of the shoulder
  [0.82, 9.6], // bust (lower station than his pec shelf)
  [0.62, 7.2], // under the bust
  [0.4, 6.2], // abdomen (narrow waistline)
  [0.14, 7.6], // lower abdomen
  [0, 8.2], // hip bone
];

/**
 * The trunk silhouette. `bow` > 0 rounds the spine toward the back (crunch flexion): stations ride
 * a quadratic bezier from hip to shoulder whose control point is pushed `bow` units behind the
 * straight spine, and each station's offset follows the LOCAL normal — the whole profile flexes.
 */
function trunk(
  hip: Vec2,
  shoulder: Vec2,
  facing: 1 | -1,
  bow: number,
  profile: ReadonlyArray<[number, number]>,
): Primitive {
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
  const pts = profile.map(([t, off]) => {
    const p = at(t);
    const n = rot90(dirAt(t));
    return { x: p.x + n.x * facing * off, y: p.y + n.y * facing * off };
  });
  return smoothClosed(pts, 'ink1');
}

/**
 * The symmetric frontal trunk (view: 'front'): hipCenter → neckBase, half-widths mirrored.
 *
 * The line that decides whether he reads as an athlete is shoulder ÷ waist. It used to be 17 ÷ 11
 * with the chest at 15.5 — a chest almost as wide as the shoulder flattens the whole upper body
 * into a slab and there is no taper left to see. Now 18.4 ÷ 10.8 ≈ 1.7, the ratio a trained man
 * actually carries, with the deltoid (0.95) the widest line on the figure and the rib cage stepping
 * down to a real waist cut. The shoulder joints sit at ±15.5, so the deltoid station covers them
 * by ~3u and the arm leaves the body from inside its own delt instead of budding off the edge.
 */
const TRUNK_FRONT_PROFILE: ReadonlyArray<[number, number]> = [
  [-0.1, 8.6], // pelvis floor
  [0.03, 13], // hips
  [0.2, 11.4], // upper pelvis
  [0.38, 10.8], // waist — the cut
  [0.6, 13.6], // lower rib cage
  [0.78, 15.6], // chest
  [0.95, 18.4], // deltoids — the widest line on him
  [1.03, 9.6], // traps sloping into the neck
];

/**
 * Her frontal trunk. The shoulder station may NOT drop below ~15.8: the shoulder JOINTS sit at
 * ±15.5 on the shared skeleton, and a narrower line strands the arm outside the trunk with a
 * floating gap. So her frontal identity is the waist cut and the hip line, not sloped-off
 * shoulders — which is also the honest anatomy: her deltoids still cap her arms.
 */
const TRUNK_FRONT_PROFILE_F: ReadonlyArray<[number, number]> = [
  [-0.1, 8.4], // pelvis floor
  [0.03, 14.4], // hips (her widest soft-tissue line)
  [0.2, 11.6], // upper pelvis
  [0.38, 8.8], // waist (the cut)
  [0.6, 11.6], // lower rib cage
  [0.78, 13.2], // chest
  [0.95, 16.2], // shoulders (covering the ±15.5 joints)
  [1.03, 8.2], // traps
];

function trunkFront(hipC: Vec2, neckBase: Vec2, profile: ReadonlyArray<[number, number]>): Primitive {
  const dir = norm({ x: neckBase.x - hipC.x, y: neckBase.y - hipC.y });
  const len = Math.hypot(neckBase.x - hipC.x, neckBase.y - hipC.y);
  const n = rot90(dir);
  const P = (t: number, off: number): Vec2 => ({
    x: hipC.x + dir.x * t * len + n.x * off,
    y: hipC.y + dir.y * t * len + n.y * off,
  });
  const right = profile.map(([t, w]) => P(t, w));
  const left = profile.map(([t, w]) => P(t, -w)).reverse();
  return smoothClosed([...right, P(1.09, 0), ...left], 'ink1');
}

/**
 * ── THE TRUNK AS A SOLID, SEEN FROM ANY ANGLE ───────────────────────────────────────────────────
 *
 * The two authored profiles are not two drawings of two different things. They are the same torso
 * measured along two axes: `TRUNK_PROFILE` gives its DEPTH at each station down the spine (how far
 * the chest projects forward, how far the glutes step back) and `TRUNK_FRONT_PROFILE` gives its
 * WIDTH (the deltoid line, the waist cut). Given both, the cross-section at any station is known:
 * a lateral half-axis `W`, an anterior half-axis `F`, a posterior half-axis `B`.
 *
 * The silhouette of that cross-section, seen from a camera `θ` degrees round from the side view, is
 * the support function of the half-ellipse in the image direction:
 *
 *     extent(θ) = sqrt( (W · sin θ)² + (R · cos θ)² ),  R = F on the front side, B on the back
 *
 * which is exactly `F` and `B` at θ = 0 and exactly `W` at θ = 90 — the two authored views fall out
 * of it as the cardinal cases, and everything between them is a genuine three-quarter torso rather
 * than a cross-fade between two pictures.
 *
 * IT IS NOT USED AT THE CARDINAL ANGLES. `trunk()` and `trunkFront()` still draw 0° and 90°
 * verbatim, because 136 clips have been ratified by eye against those exact stations and
 * re-deriving them through a resampled grid would move every one of them by a fraction of a unit
 * for no gain. Two code paths is the honest cost of not regressing a shipping system; this one owns
 * the angles that had no drawing at all.
 */
type Chain = ReadonlyArray<readonly [number, number]>;

/** Sample a station chain (ascending in t) at `t`, clamping past both ends. */
function sampleChain(chain: Chain, t: number): number {
  if (!chain.length) return 0;
  if (t <= chain[0][0]) return chain[0][1];
  const last = chain[chain.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < chain.length; i++) {
    const [t1, v1] = chain[i];
    if (t <= t1) {
      const [t0, v0] = chain[i - 1];
      const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * k;
    }
  }
  return last[1];
}

/** Split a side profile into its back chain and its front chain, each ascending in t, both positive. */
function splitSide(profile: Chain): { back: Chain; front: Chain } {
  const back = profile.filter(([, off]) => off < 0).slice().sort((a, b) => a[0] - b[0]);
  const front = profile.filter(([, off]) => off >= 0).slice().sort((a, b) => a[0] - b[0]);
  return { back: back.map(([t, o]) => [t, -o] as const), front };
}

const TRUNK_STATIONS = 15;

/**
 * The trunk at an arbitrary viewing angle. `viewDeg` is measured from the authored SIDE view:
 * 0 = side, 90 = face-on. `bow` flexes the spine exactly as `trunk()` does.
 */
function trunkAtAngle(
  hip: Vec2,
  shoulder: Vec2,
  facing: 1 | -1,
  bow: number,
  side: Chain,
  frontW: Chain,
  viewDeg: number,
): Primitive {
  const rad = (viewDeg * Math.PI) / 180;
  const sinT = Math.abs(Math.sin(rad));
  const cosT = Math.abs(Math.cos(rad));
  const { back: backChain, front: frontChain } = splitSide(side);
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
  const support = (W: number, R: number) => Math.sqrt((W * sinT) ** 2 + (R * cosT) ** 2);
  const T_LO = -0.12;
  const T_HI = 1.1;
  const edge = (t: number, sign: 1 | -1): Vec2 => {
    const W = sampleChain(frontW, t);
    const R = sign === 1 ? sampleChain(frontChain, t) : sampleChain(backChain, t);
    const off = support(W, R) * sign;
    const p = at(t);
    const n = rot90(dirAt(t));
    return { x: p.x + n.x * facing * off, y: p.y + n.y * facing * off };
  };
  const backSide: Vec2[] = [];
  const frontSide: Vec2[] = [];
  for (let i = 0; i < TRUNK_STATIONS; i++) {
    const t = T_LO + ((T_HI - T_LO) * i) / (TRUNK_STATIONS - 1);
    backSide.push(edge(t, -1));
    frontSide.push(edge(t, 1));
  }
  return smoothClosed([...backSide, ...frontSide.reverse()], 'ink1');
}

/**
 * The foot, built from the THREE joints the pose already carries — ankle, heel, toe — in the
 * foot's own frame: `s` runs heel → toe, `u` runs from that line toward the ankle.
 *
 * It used to be a five-point wedge from heel to toe with two hard-coded heights, which threw the
 * ankle away entirely. That cost more than prettiness: in a calf raise the rig lifts the heel 26u
 * while the toe stays planted, and a rigid wedge answers by tilting like a plank — no ankle column
 * rising, no forefoot bending over the ball. Reading it off the joints instead gives an achilles
 * line, an instep, a ball and a tapering toe, and the calf raise draws itself.
 *
 * `up` is the measured perpendicular from the foot line to the ankle, clamped so a degenerate pose
 * can neither collapse the foot nor inflate it.
 */
function footWedge(heel: Vec2, toe: Vec2, color: ColorToken, ankle?: Vec2): Primitive {
  const span = { x: toe.x - heel.x, y: toe.y - heel.y };
  const len = Math.hypot(span.x, span.y) || 1e-9;
  const s = { x: span.x / len, y: span.y / len };
  const nRaw = rot90(s);
  // point `u` at the ankle when we have one; otherwise up-screen, which is where it always was
  const toAnkle = ankle ? { x: ankle.x - heel.x, y: ankle.y - heel.y } : { x: 0, y: -1 };
  const sign = nRaw.x * toAnkle.x + nRaw.y * toAnkle.y >= 0 ? 1 : -1;
  const u = { x: nRaw.x * sign, y: nRaw.y * sign };
  const h = ankle ? Math.max(4.5, Math.min(11, Math.abs(nRaw.x * toAnkle.x + nRaw.y * toAnkle.y))) : 5.5;
  const P = (t: number, up: number): Vec2 => ({
    x: heel.x + s.x * len * t + u.x * up,
    y: heel.y + s.y * len * t + u.y * up,
  });
  return {
    kind: 'poly',
    pts: [
      P(-0.05, 0.06 * h), // back of the heel, just off the floor
      P(0.0, 0.58 * h), // achilles
      P(0.2, 1.0 * h), // the ankle itself
      P(0.36, 0.82 * h), // instep
      P(0.62, 0.42 * h), // over the top of the foot
      P(0.85, 0.22 * h), // the ball
      P(1.0, 0.1 * h), // toe tip, top
      P(1.0, 0.0), // toe tip, sole
      P(0.08, 0.0), // the sole, back to the heel
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
 * The side-view skull, in units of `headR`, walked around the head in a local frame: `u` runs up
 * the neck axis toward the crown, `v` runs toward the athlete's front. A plain disc is the one
 * place the figure had no direction at all — you could not tell which way he was looking except by
 * reading his body. This gives him a brow, a cheek, a jaw and an occiput, so the head points where
 * the lift does, and the crown/jaw asymmetry alone reads at thumbnail size.
 *
 * FRONT view keeps the disc: there the face is aimed at the camera and there is no profile to draw.
 */
const SKULL: ReadonlyArray<readonly [number, number]> = [
  // taller than deep — a head is ~23cm chin-to-crown against ~20cm brow-to-occiput, and drawing
  // it as a disc (which is what shipped) is what made the figure read as a mannequin from the neck
  // up. `u` is stretched past 1, `v` pulled in.
  [1.12, 0.02], // crown
  [0.94, 0.6], // forehead
  [0.44, 0.9], // brow
  [-0.06, 0.9], // cheekbone
  [-0.6, 0.72], // jaw line
  [-1.0, 0.3], // chin
  [-1.12, -0.18], // under the jaw
  [-0.82, -0.6], // nape
  [-0.26, -0.9], // back of the skull, low
  [0.36, -0.96], // occiput
  [0.86, -0.66], // back of the crown
];

/** The skull as a closed path, `grow` units fatter than `r` (that is how its seam is drawn). */
function skullPath(head: Vec2, r: number, anchor: Vec2, facing: 1 | -1, grow: number, fill: ColorToken): Primitive {
  const u = norm({ x: head.x - anchor.x, y: head.y - anchor.y }); // neck axis, toward the crown
  const v = rot90(u); // × facing = the athlete's front
  const R = r + grow;
  const pts = SKULL.map(([a, b]) => ({
    x: head.x + u.x * a * R + v.x * facing * b * R,
    y: head.y + u.y * a * R + v.y * facing * b * R,
  }));
  return smoothClosed(pts, fill);
}

// ── the two athletes ─────────────────────────────────────────────────────────────

/** Everything the skin may vary between the two athletes. Joints may NOT appear here. */
interface AthleteSkin {
  limb: { leg: LimbProfile; arm: LimbProfile; handR: number };
  neckW: number;
  trunkSide: ReadonlyArray<[number, number]>;
  trunkFront: ReadonlyArray<[number, number]>;
  /** She wears her hair up — the gym bun, a silhouette-level word that survives every pose. */
  bun: boolean;
}

const SKINS: Record<FigureSex, AthleteSkin> = {
  // his neck is 7.4, not 6.5: a trained man's neck is nearly as thick as his own jaw, and a thin
  // one under the new deltoid line reads as a head balanced on a stick
  male: { limb: LIMB_W, neckW: 7.4, trunkSide: TRUNK_PROFILE, trunkFront: TRUNK_FRONT_PROFILE, bun: false },
  female: { limb: LIMB_W_F, neckW: 5.6, trunkSide: TRUNK_PROFILE_F, trunkFront: TRUNK_FRONT_PROFILE_F, bun: true },
};

/**
 * The bun rides the BACK of the skull, high: offset opposite the facing normal of the neck axis
 * (side view) or past the crown along the neck axis (front view, where the crown points at the
 * camera or the sky). Rigid to the head — no gravity to fake, so it is correct lying, hanging,
 * and hinged. Drawn with its own seam, UNDER the head ink, so the skull always overlaps the bun.
 */
function bunAt(head: Vec2, headR: number, anchor: Vec2, facing: 1 | -1, front: boolean): Vec2 {
  const d = norm({ x: head.x - anchor.x, y: head.y - anchor.y }); // neck axis, toward the crown
  if (front) return { x: head.x + d.x * headR * 0.95, y: head.y + d.y * headR * 0.95 };
  const back = rot90(d); // -facing × front normal
  return {
    x: head.x - back.x * facing * headR * 0.9 + d.x * headR * 0.25,
    y: head.y - back.y * facing * headR * 0.9 + d.y * headR * 0.25,
  };
}
const BUN_R = 4.4;

/**
 * Render the Duotone Athlete for a pose. Back-to-front: far limbs (side view: faint depth, no
 * seam) → trunk → near leg/foot → head → near arm, the near-plane elements each over their
 * knockout seam. In `view: 'front'` there IS no far side — the LEFT chains are equally near, so
 * they draw after the trunk in solid ink1 with the same seam, and both sides articulate.
 *
 * `sex` selects which of the two athletes performs (default 'male' — every pre-existing surface
 * renders byte-identical output). The pose is the same person either way; only the skin differs.
 */
export function skinFigure(
  pose: Pose,
  chains: FigureChains,
  sex: FigureSex = 'male',
  viewDeg?: number,
): Primitive[] {
  const skin = SKINS[sex];
  const out: Primitive[] = [];
  const j = pose.j;
  const facing = chains.facing ?? 1;
  /*
   * The viewing angle, measured from the athlete's SIDE. Left undefined it is read off the
   * authored view, which is what every flat rig does and why they all take the cardinal paths
   * below unchanged. A rig that orbits its camera passes the sum, and only then does anything here
   * behave differently.
   */
  const view = viewDeg ?? (chains.view === 'front' ? 90 : 0);
  const faceOn = Math.abs(view - 90) < 1;
  const threeQuarter = !faceOn && Math.abs(view) >= 1;
  /*
   * `front` selects the FACE-ON treatment: a symmetric trunk, both limbs in near ink, a disc for a
   * head. Three-quarter is not a mild version of that — it has a near side and a far side and a
   * profile to the skull, so it takes the SIDE treatment and differs only in the trunk it draws.
   */
  const front = faceOn;

  const farArm = chainPts(pose, chains.farArm);
  const farLeg = chainPts(pose, chains.farLeg);

  /**
   * Where the flesh sits when no joint is bent enough to say. Both point at the athlete's BACK,
   * because that is the side the calf and the hamstring take and the side the biceps and the quad
   * refuse (their `lean` is negative, which flips them to the front). Neither can vanish: the foot
   * is drawn from heel and toe in every rig, and the trunk always has a spine and a facing.
   */
  const backOfLeg = (foot: [string, string] | undefined): Vec2 | undefined => {
    if (!foot || !j[foot[0]] || !j[foot[1]]) return undefined;
    return norm({ x: j[foot[0]].x - j[foot[1]].x, y: j[foot[0]].y - j[foot[1]].y }); // toe → heel
  };
  const hipJ = j[chains.torso[0]];
  const shoulderJ = j[chains.torso[1]];
  const backOfArm: Vec2 | undefined =
    !front && hipJ && shoulderJ
      ? (() => {
          const f = rot90(norm({ x: shoulderJ.x - hipJ.x, y: shoulderJ.y - hipJ.y })); // × facing = front
          return { x: -f.x * facing, y: -f.y * facing };
        })()
      : undefined;
  const farFoot: [Vec2, Vec2] | null =
    chains.farFoot && j[chains.farFoot[0]] && j[chains.farFoot[1]] ? [j[chains.farFoot[0]], j[chains.farFoot[1]]] : null;
  const farAnkle = farLeg?.[farLeg.length - 1];
  /*
   * HOW FAINT THE FAR SIDE IS DEPENDS ON HOW MUCH OF IT YOU CAN SEE. `ink4` was chosen for a pure
   * side view, where the far limb is a sliver behind the body and only has to say "there is another
   * one of these". Walk the camera round and that limb comes clear of the torso: at three-quarter
   * it is a whole arm standing on its own, and at `ink4` it stops reading as the far side and starts
   * reading as a second, ghostly figure. `ink3` is the value that keeps it subordinate without
   * making it a spectre. The cardinal views keep exactly the inks they were ratified with.
   */
  const farInk: ColorToken = threeQuarter ? 'ink3' : 'ink4';
  if (!front) {
    if (farArm) out.push(...taperedLimb(farArm, skin.limb.arm, farInk, 0, backOfArm));
    if (farLeg) out.push(...taperedLimb(farLeg, skin.limb.leg, farInk, 0, backOfLeg(chains.farFoot)));
    if (farFoot) out.push(footWedge(farFoot[0], farFoot[1], farInk, farAnkle));
  }

  const hip = hipJ;
  const shoulder = shoulderJ;
  if (hip && shoulder) {
    const bow = pose.trunkBow ?? 0;
    out.push(
      threeQuarter
        ? trunkAtAngle(hip, shoulder, facing, bow, skin.trunkSide, skin.trunkFront, view)
        : front
          ? trunkFront(hip, shoulder, skin.trunkFront)
          : trunk(hip, shoulder, facing, bow, skin.trunkSide),
    );
  }

  const fistR = pose.fistR ?? skin.limb.handR;
  if (front) {
    // BOTH sides in ink0. They used to be ink1 — the trunk's own value — so in a front view the
    // left arm and left leg dissolved into the torso while the right stayed black, and a
    // symmetric pose (a lateral raise, two dumbbells at the same height) read as a rendering
    // fault rather than as depth. There is no near side in a front view; the knockout seam, not
    // a tonal step, is what keeps the limbs apart from the trunk and from each other.
    if (farLeg) out.push(...nearLimb(farLeg, flattenLean(skin.limb.leg), 'ink0'));
    if (farFoot) out.push(footWedge(farFoot[0], farFoot[1], 'ink0', farAnkle));
    if (farArm) out.push(...nearLimb(farArm, flattenLean(skin.limb.arm), 'ink0', fistR));
  }

  const nearLeg = chainPts(pose, chains.nearLeg);
  if (nearLeg) {
    out.push(
      ...(front
        ? nearLimb(nearLeg, flattenLean(skin.limb.leg), 'ink0')
        : nearLimb(nearLeg, skin.limb.leg, 'ink0', undefined, backOfLeg(chains.nearFoot))),
    );
  }
  if (chains.nearFoot) {
    const [h, t] = chains.nearFoot;
    if (j[h] && j[t]) out.push(footWedge(j[h], j[t], 'ink0', nearLeg?.[nearLeg.length - 1]));
  }

  const head = j[chains.head];
  // the bun's seam joins the head's seam FIRST, then its ink lands after both — so the gap wraps
  // the head+bun cluster as one silhouette and the skull still overlaps its own hair
  const bun = head && shoulder && skin.bun ? bunAt(head, pose.headR, shoulder, facing, front) : null;
  // side view gets the skull profile (it has a facing to draw against); front view keeps the disc
  const skull = !front && head && shoulder;
  if (bun) out.push({ kind: 'circle', c: bun, r: BUN_R + HALO, fill: SEAM });
  if (skull) out.push(skullPath(head, pose.headR, shoulder, facing, HALO, SEAM));
  else if (head) out.push({ kind: 'circle', c: head, r: pose.headR + HALO, fill: SEAM });
  if (bun) out.push({ kind: 'circle', c: bun, r: BUN_R, fill: 'ink1' });
  if (head && shoulder) {
    out.push({ kind: 'line', a: shoulder, b: neckJoin(head, pose.headR, shoulder), w: skin.neckW, color: 'ink1', cap: 'round' });
  }
  if (skull) out.push(skullPath(head, pose.headR, shoulder, facing, 0, 'ink1'));
  else if (head) out.push({ kind: 'circle', c: head, r: pose.headR, fill: 'ink1' });

  const nearArm = chainPts(pose, chains.nearArm);
  // the fist closing the chain — the figure visibly holds the implement
  if (nearArm) {
    out.push(
      ...(front
        ? nearLimb(nearArm, flattenLean(skin.limb.arm), 'ink0', fistR)
        : nearLimb(nearArm, skin.limb.arm, 'ink0', fistR, backOfArm)),
    );
  }

  return out;
}
