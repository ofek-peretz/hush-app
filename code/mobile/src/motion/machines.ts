/**
 * The equipment stations — MOTION_FORM_STANDARD §3.5 as rewritten by Amendment 4 (2026-07-07):
 * RECOGNITION FIRST, REDUCTION SECOND. Machine exercises are named after their machines, so the
 * machine is drawn whole: every station makes four statements — FRAME (grounded on the floor),
 * RESISTANCE (the stack, and its selected plate visibly riding the cable in 1:1 proportion to
 * handle travel), TRANSMISSION (the taut routing from plate to fist), INTERFACE (seat, pads,
 * footplates, attached to the frame, never floating). The voice is unchanged — `ink3` structure,
 * `paper3` upholstery, slab stacks — so a complete machine still never competes with the athlete.
 *
 * One station per equipment family; rigs pass the moving handle and the current stack lift
 * (lift = handle travel × rom, the honest 1:1 cable). Pure data, no dependencies beyond the kit
 * vocabulary and the shared IK.
 */

// 

import type { Primitive, Vec2, Vec3 } from './types';
import { project, type Camera } from './camera';
import { cable, pulley } from './kit';
import { twoBoneIK } from './geometry';

const FLOOR = 193;

/** A stack slab (poly, so it can fade): the visual unit of selectorized resistance. */
function slab(cx: number, w: number, y: number, opacity: number): Primitive {
  return {
    kind: 'poly',
    pts: [
      { x: cx - w / 2, y },
      { x: cx + w / 2, y },
      { x: cx + w / 2, y: y + 3.5 },
      { x: cx - w / 2, y: y + 3.5 },
    ],
    fill: 'ink3',
    opacity,
  };
}

// ── the shared resistance statement ──────────────────────────────────────────────

export interface TowerSpec {
  /** Tower footprint (outer frame uprights). */
  x0: number;
  x1: number;
  /** Top of the frame (cap beam). */
  capY: number;
  /** Resting top of the selected plate. */
  stackTopY: number;
}

/**
 * A selectorized weight-stack tower: frame uprights + cap beam + base feet, guide rods, the
 * resting slab run, and the SELECTED plate riding `lift` units above its rest position — the
 * resistance is not a symbol, it moves. Returns the plate-top point for the cable attachment.
 */
export function stackTower(t: TowerSpec, lift: number): { prims: Primitive[]; plateTop: Vec2 } {
  const cx = (t.x0 + t.x1) / 2;
  const slabW = t.x1 - t.x0 - 4;
  const prims: Primitive[] = [
    // frame: uprights, cap beam, base feet on the floor
    { kind: 'line', a: { x: t.x0, y: t.capY }, b: { x: t.x0, y: FLOOR }, w: 2.5, color: 'ink3' },
    { kind: 'line', a: { x: t.x1, y: t.capY }, b: { x: t.x1, y: FLOOR }, w: 2.5, color: 'ink3' },
    { kind: 'line', a: { x: t.x0 - 1.5, y: t.capY }, b: { x: t.x1 + 1.5, y: t.capY }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: t.x0 - 5, y: FLOOR }, b: { x: t.x0 + 5, y: FLOOR }, w: 2.5, color: 'ink3', cap: 'round' },
    { kind: 'line', a: { x: t.x1 - 5, y: FLOOR }, b: { x: t.x1 + 5, y: FLOOR }, w: 2.5, color: 'ink3', cap: 'round' },
    // guide rods
    { kind: 'line', a: { x: cx - slabW / 2 + 2.5, y: t.capY + 3 }, b: { x: cx - slabW / 2 + 2.5, y: FLOOR }, w: 1.2, color: 'ink3', opacity: 0.6 },
    { kind: 'line', a: { x: cx + slabW / 2 - 2.5, y: t.capY + 3 }, b: { x: cx + slabW / 2 - 2.5, y: FLOOR }, w: 1.2, color: 'ink3', opacity: 0.6 },
  ];
  // the resting run (unselected plates stay put)…
  for (let y = t.stackTopY + 5; y + 3.5 <= FLOOR - 0.5; y += 5) prims.push(slab(cx, slabW, y, 0.4));
  // …and the selected plate — the load — riding the cable
  const plateY = t.stackTopY - lift;
  prims.push(slab(cx, slabW, plateY, 0.75));
  return { prims, plateTop: { x: cx, y: plateY } };
}

/** A two-segment machine press/pull arm from a fixed pivot to the moving handle — the linkage
 *  visibly folds through the rep (a rigid arm cannot track a straight handle path from a fixed
 *  pivot; real machines use linkages, and so does the drawing). Drawn in the machine voice. */
export function machineArm(pivot: Vec2, handle: Vec2, l1: number, l2: number, bend: 1 | -1): Primitive[] {
  const joint = twoBoneIK(pivot, handle, l1, l2, bend);
  return [
    { kind: 'polyline', pts: [pivot, joint, handle], w: 3, color: 'ink3' },
    { kind: 'circle', c: pivot, r: 3, fill: 'paper1', stroke: 'ink3', w: 2 }, // the pivot hinge
    { kind: 'circle', c: joint, r: 1.8, fill: 'ink3' }, // the linkage knuckle
  ];
}

/** Upholstery: an outlined pad stroke (same grammar as kit.padStroke, local to avoid a cycle). */
function pad(a: Vec2, b: Vec2, w: number): Primitive[] {
  return [
    { kind: 'line', a, b, w: w + 3.5, color: 'ink3', cap: 'round' },
    { kind: 'line', a, b, w, color: 'paper3', cap: 'round' },
  ];
}

/** The frame's base rail along the floor — the machine is one grounded object, not parts. */
function baseRail(x0: number, x1: number): Primitive {
  return { kind: 'line', a: { x: x0, y: FLOOR - 1.5 }, b: { x: x1, y: FLOOR - 1.5 }, w: 2.5, color: 'ink3', opacity: 0.8 };
}

// ── lat pulldown — tall front tower, overhead beam, high pulley, seat + thigh pad ──

/** `bar` is the moving wide-grip bar center; `lift` the current stack excursion. */
export function latPulldownStation(bar: Vec2, lift: number): Primitive[] {
  const TOWER: TowerSpec = { x0: 218, x1: 240, capY: 40, stackTopY: 144 };
  const HIGH: Vec2 = { x: bar.x, y: 44 }; // the overhead pulley, above the bar path
  const STACK_PULLEY: Vec2 = { x: 229, y: 44 };
  const { prims: tower, plateTop } = stackTower(TOWER, lift);
  return [
    ...tower,
    baseRail(148, 240),
    // the overhead beam, from above the athlete to the tower cap
    { kind: 'line', a: { x: HIGH.x - 6, y: 40 }, b: { x: 240, y: 40 }, w: 3, color: 'ink3' },
    // seat on its post + the thigh pad on its own post (the anchor the cue talks about)
    { kind: 'rect', x: 134, y: 162, width: 38, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: 153, y: 169 }, b: { x: 153, y: FLOOR - 2 }, w: 2.5, color: 'ink3' },
    { kind: 'rect', x: 168, y: 136, width: 32, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: 196, y: 143 }, b: { x: 196, y: FLOOR - 2 }, w: 2.5, color: 'ink3' },
    // transmission: bar → high pulley → along the beam → down to the selected plate
    cable(HIGH, bar),
    cable(HIGH, STACK_PULLEY),
    cable(STACK_PULLEY, plateTop),
    ...pulley(HIGH),
    ...pulley(STACK_PULLEY),
  ];
}

// ── seated cable row — long low bench, footplate, low exit pulley, stack tower ──

export function seatedRowStation(hand: Vec2, lift: number): Primitive[] {
  const TOWER: TowerSpec = { x0: 250, x1: 272, capY: 96, stackTopY: 144 };
  const EXIT: Vec2 = { x: 246, y: 158 }; // the low pulley the cable leaves the machine through
  const TOP: Vec2 = { x: 246, y: 102 }; // the riser pulley on the tower's front upright
  const { prims: tower, plateTop } = stackTower(TOWER, lift);
  return [
    ...tower,
    baseRail(120, 272),
    // the low bench on its legs
    ...pad({ x: 116, y: 170 }, { x: 208, y: 170 }, 7),
    { kind: 'line', a: { x: 130, y: 174 }, b: { x: 130, y: FLOOR - 2 }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: 196, y: 174 }, b: { x: 196, y: FLOOR - 2 }, w: 3, color: 'ink3' },
    // the footplate, braced against the frame
    ...pad({ x: 226, y: 188 }, { x: 238, y: 164 }, 6),
    { kind: 'line', a: { x: 232, y: 176 }, b: { x: 246, y: 182 }, w: 2.5, color: 'ink3' }, // its strut
    // transmission: handle → exit pulley → up the tower face → over → the selected plate
    cable(EXIT, hand),
    cable(EXIT, TOP),
    cable(TOP, plateTop),
    ...pulley(EXIT),
    ...pulley(TOP),
  ];
}

// ── chest-supported machine row — fused front tower + stack, folding pull arm, chest pad ──
// Selectorized machine: the routing is shrouded inside the frame (§3.5 shroud license) — the
// visible chain is arm → pivot column → fused tower, with the stack in exact sync.

export function machineRowStation(hand: Vec2, lift: number): Primitive[] {
  const TOWER: TowerSpec = { x0: 216, x1: 240, capY: 58, stackTopY: 142 };
  const PIVOT: Vec2 = { x: 210, y: 64 }; // the arm hinge atop the front column
  const { prims: tower } = stackTower(TOWER, lift);
  return [
    ...tower,
    baseRail(138, 240),
    // the front column carrying the pivot, fused into the tower cap
    { kind: 'line', a: { x: 210, y: 60 }, b: { x: 210, y: FLOOR - 2 }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: 208.5, y: 58 }, b: { x: 216, y: 58 }, w: 3, color: 'ink3' },
    // seat + post
    { kind: 'rect', x: 127, y: 162, width: 38, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: 146, y: 169 }, b: { x: 146, y: FLOOR - 2 }, w: 2.5, color: 'ink3' },
    // the chest pad, mounted off the column — tall enough to read past the working arm
    // (the brace is the machine's identity: it must survive the athlete's own occlusion)
    ...pad({ x: 159, y: 106 }, { x: 159, y: 142 }, 8),
    { kind: 'line', a: { x: 161, y: 145 }, b: { x: 210, y: 145 }, w: 2.5, color: 'ink3' },
    // transmission: the pull arm folds from the pivot to the handle
    /* 42, not 38: a 76u reach could not deliver the handle to a row's finish — the elbow behind the
       trunk needs the handle at ≤160/126, 79.6u from the pivot (execution pass, 2026-09-03). */
    ...machineArm(PIVOT, hand, 42, 42, -1),
  ];
}

// ── seated machine chest press (SIDE view) ─────────────────────────────────────
/*
 * THIS STATION WAS FRONT-VIEW, AND THE FRONT VIEW CANNOT DRAW THIS EXERCISE.
 *
 * The chest family is frontal by founder directive, and for the LYING members that is right: a
 * bench press stroke is world-vertical, so face-on it lives entirely in the drawing plane. This
 * machine's stroke does the opposite — it runs straight down the camera axis. The old rig met that
 * with a perspective license (screen = centre + offset · D/(D−depth)) and hand-authored 3D
 * endpoints, and the result failed on its own terms:
 *
 *   · The elbow interior angle ran 14.7° → 5.5° → 130° across the rep. The arm was drawn as a
 *     horizontal black bar for two thirds of the clip and then turned inside out, because the
 *     elbow's projected x CROSSED the fist's mid-rep.
 *   · The bones were not preserved by anything. Solving the authored triples in 3D, the upper arm
 *     ran 23.1 → 16.5 against a canonical 25 and the forearm 17.4 → 14.1 against 23: the whole arm
 *     shrank by a quarter through the press.
 *
 * Neither is a tuning error. Face-on, the hand at the stretch sits ~8u from its own shoulder in
 * projection while the arm is 48u long, so the arm MUST fold flat — every frontal staging of a
 * chest press has that property, and no constant changes it.
 *
 * Side-on, the same stroke is fully in the drawing plane: the handle travels 25u horizontally, the
 * elbow opens 58° → 168°, and the press arm, the high back pad, the seat and the stack are all
 * unoccluded. The recognition the directive was protecting is not lost — it moves from the
 * symmetry of two arms to the SIGNATURE of the station, which is what §3.5 says names a machine
 * anyway: a high back pad with a press arm swinging forward off a pivot behind the shoulder.
 */
export interface PressStationSpec {
  /** The back pad, as the two ends of its upholstered stroke (top, bottom). */
  padA: Vec2;
  padB: Vec2;
  /** The press-arm hinge on the rear column. */
  pivot: Vec2;
  /** Seat pad left edge and top. */
  seatX: number;
  seatY: number;
  /** The linkage segments, proximal then distal. */
  arm: [number, number];
}

/** The flat seated chest press. */
export const CHEST_PRESS: PressStationSpec = {
  padA: { x: 124, y: 92 },
  padB: { x: 126, y: 156 },
  pivot: { x: 110, y: 116 },
  seatX: 128,
  seatY: 161,
  arm: [44, 38],
};

/**
 * The INCLINE seated press: the same station with its back pad laid further back and its press arm
 * hinged lower, so the handles swing up-and-forward instead of straight out. The pad angle is the
 * whole difference between the two machines and it is the only thing that changes here.
 */
export const INCLINE_PRESS: PressStationSpec = {
  padA: { x: 108, y: 96 },
  padB: { x: 132, y: 158 },
  pivot: { x: 112, y: 132 },
  seatX: 130,
  seatY: 163,
  arm: [44, 38],
};

export function chestPressStation(hand: Vec2, lift: number, spec: PressStationSpec = CHEST_PRESS): Primitive[] {
  const TOWER: TowerSpec = { x0: 62, x1: 84, capY: 58, stackTopY: 142 };
  const { prims: tower } = stackTower(TOWER, lift);
  return [
    ...tower,
    baseRail(62, 196),
    // the rear column carrying the pivot, fused into the tower cap — one machine, not parts
    { kind: 'line', a: { x: 104, y: 62 }, b: { x: 104, y: FLOOR - 2 }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: 84, y: 58 }, b: { x: 105.5, y: 58 }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: 104, y: spec.pivot.y }, b: { x: spec.pivot.x, y: spec.pivot.y }, w: 2.5, color: 'ink3' },
    // the HIGH BACK PAD (the family signature): it runs past the shoulders to head height
    ...pad(spec.padA, spec.padB, 9),
    { kind: 'line', a: { x: spec.padA.x - 3, y: (spec.padA.y + spec.padB.y) / 2 }, b: { x: 104, y: (spec.padA.y + spec.padB.y) / 2 }, w: 2.5, color: 'ink3' },
    // seat + posts
    { kind: 'rect', x: spec.seatX, y: spec.seatY, width: 44, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: spec.seatX + 8, y: spec.seatY + 7 }, b: { x: spec.seatX + 8, y: FLOOR - 2 }, w: 2.5, color: 'ink3' },
    { kind: 'line', a: { x: spec.seatX + 38, y: spec.seatY + 7 }, b: { x: spec.seatX + 38, y: FLOOR - 2 }, w: 2.5, color: 'ink3' },
    // transmission: the press arm folds from the pivot out to the handle
    ...machineArm(spec.pivot, hand, spec.arm[0], spec.arm[1], 1),
  ];
}

// ── machine shoulder press (FRONT view) — twin press arms folding beside the shoulders ──
// §3.5 Amendment 5 (one station, one signature): the rail+carriage staging is retired — a
// full-height gate with a sliding crossbar is the SMITH MACHINE's silhouette, and no two
// families may share a signature. The shoulder press's own signature is the pair of press-arm
// linkages folding up from short side pillars (lever-machine grammar); the handles keep their
// exact vertical path and the linkage tracks them by the same IK every folding arm uses.

export function shoulderPressStation(cx: number, gripX: number, handY: number, lift: number): Primitive[] {
  const TOWER: TowerSpec = { x0: 242, x1: 264, capY: 88, stackTopY: 142 }; // 12u inboard (2026-09-07): at 254–276 the stack reached x 281 and the composition sat 30u heavy to the right
  const PILLAR_TOP = 118;
  const L = cx - gripX - 13.5; // pillars stand outboard of the grips, chest height — never a gate
  const R = cx + gripX + 13.5;
  const { prims: tower } = stackTower(TOWER, lift);
  return [
    ...tower,
    // short side pillars, grounded with feet
    { kind: 'line', a: { x: L, y: PILLAR_TOP }, b: { x: L, y: FLOOR }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: R, y: PILLAR_TOP }, b: { x: R, y: FLOOR }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: L - 7, y: FLOOR }, b: { x: L + 7, y: FLOOR }, w: 2.5, color: 'ink3', cap: 'round' },
    { kind: 'line', a: { x: R - 7, y: FLOOR }, b: { x: R + 7, y: FLOOR }, w: 2.5, color: 'ink3', cap: 'round' },
    // the fusing beam: near pillar into the tower upright — one machine, not parts
    { kind: 'line', a: { x: R, y: 122 }, b: { x: 242, y: 122 }, w: 2.5, color: 'ink3' },
    // the signature: twin press arms folding OUTWARD from the pillar-top pivots to the handles
    ...machineArm({ x: L, y: PILLAR_TOP }, { x: cx - gripX, y: handY }, 26, 26, -1),
    ...machineArm({ x: R, y: PILLAR_TOP }, { x: cx + gripX, y: handY }, 26, 26, 1),
  ];
}

// ── face pull (FRONT view, athlete FACING the station — camera behind the athlete) ──
// The complete cable column draws in the far plane: mast to the top of the frame, height-adjuster
// carriage, high pulley above the head, rope V taut to both fists, stack visible where the body
// honestly does not occlude it (between and beside the legs).

/**
 * THE CABLE COLUMN, seen from wherever the camera is standing.
 *
 * This used to be a flat function that took two fists and drew a mast on the athlete's own centre
 * line — which meant the body erased the whole machine, and the stack's rise was computed from the
 * sum of two hand-to-pulley distances (a rope has one cable, so that lifted at double rate).
 *
 * It now takes the column's real position in the athlete's space and the CAMERA, and projects its
 * own hardware: equipment depth is scene knowledge, and a rig that orbits owns the projection of
 * the things standing around it (see `frame.ts`). Two consequences worth naming:
 *
 *   · the mast is a vertical line at any azimuth, because the orbit runs about the vertical — so
 *     the column stays a column and only MOVES ACROSS, out from behind the athlete;
 *   · a weight plate is a box, and the silhouette of a box under an orthographic three-quarter is
 *     `width·|cos| + depth·|sin|` wide — WIDER than face-on, not narrower. Scaling the drawn width
 *     by cos alone (the obvious thing) makes a stack that visibly slims as the camera turns.
 */
export function facePullStation(p: {
  cam: Camera;
  cx: number;
  z: number;
  pulley: Vec3;
  carabiner: Vec3;
  lift: number;
}): Primitive[] {
  const P = (q: Vec3): Vec2 => {
    const r = project({ x: q.x, y: q.y }, q.z, p.cam);
    return { x: r.x, y: r.y };
  };
  const rad = (p.cam.azimuth * Math.PI) / 180;
  const kx = Math.abs(Math.cos(rad));
  const kz = Math.abs(Math.sin(rad));
  const mastX = P({ x: p.cx, y: 0, z: p.z }).x;
  const PLATE_W = 18;
  const PLATE_D = 22;
  const halfPlate = (PLATE_W * kx + PLATE_D * kz) / 2;

  const pulleyP = P(p.pulley);
  const prims: Primitive[] = [
    // the mast, frame-top to floor (occluded by the athlete only where he honestly stands in front)
    { kind: 'line', a: { x: mastX, y: 26 }, b: { x: mastX, y: FLOOR - 1 }, w: 3.5, color: 'ink3' },
    // the base plate, seen as the parallelogram it is
    {
      kind: 'line',
      a: P({ x: p.cx - 12, y: FLOOR, z: p.z - 11 }),
      b: P({ x: p.cx + 12, y: FLOOR, z: p.z + 11 }),
      w: 2.5,
      color: 'ink3',
      cap: 'round',
    },
    // the height-adjuster carriage + the high pulley
    { kind: 'rect', x: mastX - 3.5, y: 26, width: 7, height: 10, rx: 1.5, fill: 'paper1', stroke: 'ink3', w: 1.5 },
    ...pulley(pulleyP),
    // the steel cable, pulley to carabiner — thinner than the rope, because it is not the rope
    { kind: 'line', a: pulleyP, b: P(p.carabiner), w: 1.4, color: 'ink3' },
    { kind: 'circle', c: P(p.carabiner), r: 2.2, fill: 'paper1', stroke: 'ink3', w: 1.4 },
  ];
  /*
   * A FULL-HEIGHT stack. The old one was 34u of plates, which is 39 cm — and a face pull pays out
   * about 62 cm of cable, so the selected plate left the machine behind and floated up the bare
   * mast on its own. A real column carries ~85 cm of plates and the pull uses most of that travel;
   * drawn at true height the same lift reads as a stack doing its job.
   */
  for (let y = 120; y + 3.5 <= FLOOR - 0.5; y += 5) prims.push(slab(mastX, halfPlate * 2, y, 0.35));
  prims.push(slab(mastX, halfPlate * 2, Math.max(p.pulley.y + 12, 115 - p.lift), 0.6));
  return prims;
}
