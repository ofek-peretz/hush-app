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
import type { Primitive, Vec2 } from './types';
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
    ...machineArm(PIVOT, hand, 38, 38, -1),
  ];
}

// ── seated machine chest press (FRONT view, §3.4 Amendment 7) — high-back pad, twin press
// arms sweeping toward the viewer under the PERSPECTIVE LICENSE, fused tower ──
// The press stroke travels along the camera axis, so the station draws depth as SCALE: the
// struts track handles that grow with the stroke, and the stack rides 1:1 with the true 3D
// stroke (shroud license — the routing is inside the frame). The family signature (§3.5 Am. 5)
// stays the HIGH-BACK seat: the pad runs past the shoulders to head height, its top edge and
// side slivers reading past the trunk — never the machine row's floating chest pad.

export function chestPressStation(cx: number, fistR: Vec2, fistL: Vec2, scale: number, lift: number): Primitive[] {
  const TOWER: TowerSpec = { x0: 254, x1: 276, capY: 88, stackTopY: 142 };
  const PAD_HW = 21;
  const { prims: tower } = stackTower(TOWER, lift);
  // a press-arm strut: from its pivot at the pad's top corner (behind the athlete) out to the
  // top of its handle — it lengthens, swings outward, AND thickens toward its near end as the
  // handle approaches the camera (the perspective license applies to the machine too)
  const strut = (pivot: Vec2, fist: Vec2): Primitive[] => {
    const tip: Vec2 = { x: fist.x, y: fist.y - 8 * scale };
    const len = Math.hypot(tip.x - pivot.x, tip.y - pivot.y) || 1;
    const n = { x: -(tip.y - pivot.y) / len, y: (tip.x - pivot.x) / len };
    const w0 = 1.3; // half-width at the far pivot
    const w1 = 1.7 * scale; // half-width at the near handle
    return [
      {
        kind: 'poly',
        pts: [
          { x: pivot.x + n.x * w0, y: pivot.y + n.y * w0 },
          { x: tip.x + n.x * w1, y: tip.y + n.y * w1 },
          { x: tip.x - n.x * w1, y: tip.y - n.y * w1 },
          { x: pivot.x - n.x * w0, y: pivot.y - n.y * w0 },
        ],
        fill: 'ink3',
      },
      { kind: 'circle', c: pivot, r: 3, fill: 'paper1', stroke: 'ink3', w: 2 },
    ];
  };
  return [
    ...tower,
    baseRail(cx - 30, 276),
    // the high-back pad (signature) + seat + legs — the interface, grounded
    { kind: 'rect', x: cx - PAD_HW, y: 88, width: PAD_HW * 2, height: 68, rx: 8, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'rect', x: cx - 26, y: 161, width: 52, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: cx - 18, y: 168 }, b: { x: cx - 18, y: FLOOR - 2 }, w: 2.5, color: 'ink3' },
    { kind: 'line', a: { x: cx + 18, y: 168 }, b: { x: cx + 18, y: FLOOR - 2 }, w: 2.5, color: 'ink3' },
    // the fusing beam into the tower — one machine, not parts (below the elbow flare)
    { kind: 'line', a: { x: cx + PAD_HW, y: 132 }, b: { x: 254, y: 132 }, w: 2.5, color: 'ink3' },
    // twin press arms tracking the handles toward the viewer
    ...strut({ x: cx + PAD_HW + 2.6, y: 99 }, fistR),
    ...strut({ x: cx - PAD_HW - 2.6, y: 99 }, fistL),
  ];
}

// ── machine shoulder press (FRONT view) — twin press arms folding beside the shoulders ──
// §3.5 Amendment 5 (one station, one signature): the rail+carriage staging is retired — a
// full-height gate with a sliding crossbar is the SMITH MACHINE's silhouette, and no two
// families may share a signature. The shoulder press's own signature is the pair of press-arm
// linkages folding up from short side pillars (lever-machine grammar); the handles keep their
// exact vertical path and the linkage tracks them by the same IK every folding arm uses.

export function shoulderPressStation(cx: number, gripX: number, handY: number, lift: number): Primitive[] {
  const TOWER: TowerSpec = { x0: 254, x1: 276, capY: 88, stackTopY: 142 };
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
    { kind: 'line', a: { x: R, y: 122 }, b: { x: 254, y: 122 }, w: 2.5, color: 'ink3' },
    // the signature: twin press arms folding OUTWARD from the pillar-top pivots to the handles
    ...machineArm({ x: L, y: PILLAR_TOP }, { x: cx - gripX, y: handY }, 26, 26, -1),
    ...machineArm({ x: R, y: PILLAR_TOP }, { x: cx + gripX, y: handY }, 26, 26, 1),
  ];
}

// ── face pull (FRONT view, athlete FACING the station — camera behind the athlete) ──
// The complete cable column draws in the far plane: mast to the top of the frame, height-adjuster
// carriage, high pulley above the head, rope V taut to both fists, stack visible where the body
// honestly does not occlude it (between and beside the legs).

export function facePullStation(cx: number, handR: Vec2, handL: Vec2, restR: Vec2, restL: Vec2): Primitive[] {
  const PULLEY: Vec2 = { x: cx, y: 31 }; // high enough that the strands clear the head at the reach
  // rope payout is stack rise: the plate climbs by exactly the rope drawn past the pulley
  const d = (p: Vec2) => Math.hypot(p.x - PULLEY.x, p.y - PULLEY.y);
  const lift = Math.max(0, d(handR) + d(handL) - d(restR) - d(restL));
  const prims: Primitive[] = [
    // the mast, frame-top to floor (occluded by the athlete's body on its way down — honest)
    { kind: 'line', a: { x: cx, y: 26 }, b: { x: cx, y: FLOOR - 1 }, w: 3.5, color: 'ink3' },
    { kind: 'line', a: { x: cx - 12, y: FLOOR }, b: { x: cx + 12, y: FLOOR }, w: 2.5, color: 'ink3', cap: 'round' }, // base foot
    // the height-adjuster carriage + high pulley
    { kind: 'rect', x: cx - 3.5, y: 26, width: 7, height: 10, rx: 1.5, fill: 'paper1', stroke: 'ink3', w: 1.5 },
    ...pulley(PULLEY),
    // the rope, taut from the pulley to each fist (thicker than cable stroke — it IS a rope)
    { kind: 'line', a: PULLEY, b: handR, w: 2.2, color: 'ink2' },
    { kind: 'line', a: PULLEY, b: handL, w: 2.2, color: 'ink2' },
  ];
  // the stack, behind the athlete's legs — visible through and beside the stance
  for (let y = 150 + 5; y + 3.5 <= FLOOR - 0.5; y += 5) prims.push(slab(cx, 18, y, 0.35));
  prims.push(slab(cx, 18, 150 - lift, 0.6));
  return prims;
}
