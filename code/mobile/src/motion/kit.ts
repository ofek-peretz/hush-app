/**
 * The shared equipment kit — plates, bar, bar-path ticks, ground shadow — so every rig states
 * "this is a loaded barbell" in the same voice. The plate is drawn at TRUE scale (a 45cm plate is
 * r=16 against the canonical athlete) as a GHOST: a transparent disc with a rim and a sleeve hub.
 * True scale is what makes the lift instantly recognizable; the ghost treatment is what keeps the
 * figure — the actual demonstration — readable through it. Pure data, no dependencies.
 */

// 

import type { Primitive, Vec2 } from './types';
import { BAR_R, PLATE_R } from './anthro';

/** The near-side plate + bar end, drawn IN FRONT of the figure (nearest the camera).
 *  `r` defaults to the 45cm competition plate; lighter implements (curl bars) pass a smaller disc. */
export function plateGhost(bar: Vec2, r = PLATE_R): Primitive[] {
  return [
    /* `ink3` at 0.14, not `ink4` at 0.2: the far-limb token darkened for legibility (palette.ts,
       2026-09-03) and the ghost's tint must not darken with it — this pair reproduces the old tint. */
    { kind: 'circle', c: bar, r, fill: 'ink3', fillOpacity: 0.14, stroke: 'ink3', w: 2.2 },
    /*
     * The sleeve collar — a RING, not a filled disc.
     *
     * It used to carry `fill: 'paper1'` at 75 %, and in every side-view barbell rig the plate is
     * concentric with the HAND: the collar was an opaque paper disc laid exactly over the fist,
     * and the athlete's grip — the one thing that says he is holding the bar rather than standing
     * next to it — was erased in the back squat, the row, the deadlift, the shrug and the curl
     * alike. A real collar is out at the sleeve, a foot outboard of the hand; it is only
     * concentric because we see it end-on, and drawing it opaque is a projection artifact, not the
     * object. Unfilled it still reads as the collar, and the fist reads through it.
     */
    { kind: 'circle', c: bar, r: Math.min(4.6, r * 0.32), stroke: 'ink3', w: 1.5 },
    { kind: 'circle', c: bar, r: BAR_R, fill: 'ink0' }, // the bar, end-on
  ];
}

/**
 * The canonical range statement: a dashed path with a tick at each endpoint.
 *
 * ── Why this is ink and not ochre (founder, 2026-07-17: "the ochre in the videos — take it off")
 * The range statement was the clip's one coloured mark, budgeted at ~2 % of the frame (MOTION_FORM
 * _STANDARD §3.1). The READOUT law retired the accent hue from the product: the ochre survives as
 * the HushMark seal and nothing else. It applies here too — a clip is the product speaking.
 *
 * The ochre was here because every ink value was already spoken for: near limbs `ink0`, trunk
 * `ink1`, far limbs `ink4` (the duotone), equipment `ink3`, the bar `ink0`. With the ladder full,
 * hue was the only axis left — the same bandage the SegmentedControl's ochre fill turned out to be.
 *
 * What states it instead is what states a dimension in any technical drawing: the SAME pencil, a
 * different LINE TYPE. Nothing else in the frame is dashed, so the dash alone reads "annotation,
 * not limb" — at a 19 % duty cycle it cannot compete with a solid limb even in the same ink. And
 * `ink0` is the bar's own ink, which is the point: §3.1 requires the bar dot to "visibly touch each
 * tick every rep", and a dot landing on a mark of its own kind reads as contact, not coincidence.
 * One instrument, one pencil.
 */
export function barPathTicks(x: number, y0: number, y1: number, tick = 4.5): Primitive[] {
  return [
    { kind: 'dash', a: { x, y: y0 }, b: { x, y: y1 }, w: 2, color: 'ink0', dash: [1.5, 6.5], opacity: 0.9 },
    { kind: 'line', a: { x: x - tick, y: y0 }, b: { x: x + tick, y: y0 }, w: 2, color: 'ink0', cap: 'round' },
    { kind: 'line', a: { x: x - tick, y: y1 }, b: { x: x + tick, y: y1 }, w: 2, color: 'ink0', cap: 'round' },
  ];
}

/** The same range statement along an arbitrary rail (incline grooves): dashed a→b with a
 *  perpendicular tick at each endpoint. Reduces to barPathTicks when the rail is vertical. */
export function linePathTicks(a: Vec2, b: Vec2, tick = 4.5): Primitive[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const t = (p: Vec2): Primitive => ({
    kind: 'line',
    a: { x: p.x - n.x * tick, y: p.y - n.y * tick },
    b: { x: p.x + n.x * tick, y: p.y + n.y * tick },
    w: 2,
    color: 'ink0',
    cap: 'round',
  });
  return [{ kind: 'dash', a, b, w: 2, color: 'ink0', dash: [1.5, 6.5], opacity: 0.9 }, t(a), t(b)];
}

/**
 * The range statement for a CURVED tracked path (hinges, curls, flies — anything whose motion is
 * a rotation, not a rail). Same grammar as `barPathTicks` — the same pencil (`ink0`), the same
 * ~19% duty cycle, a perpendicular tick at each canonical endpoint — but the dash follows the
 * SAMPLED true path instead of claiming a straight line the tracked point never travels. The
 * caller hands in the actual path (poseAt sampled across rom); nothing is idealized.
 */
export function sampledPathTicks(pts: Vec2[], tick = 4.5): Primitive[] {
  if (pts.length < 2) return [];
  const out: Primitive[] = [];
  // walk the polyline emitting 1.5u marks every 8u of arc length — the barPathTicks duty cycle
  const MARK = 1.5;
  const PERIOD = 8;
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg < 1e-6) continue;
    const u = { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg };
    let s = carry <= 0 ? 0 : carry;
    while (s < seg) {
      const e = Math.min(s + MARK, seg);
      out.push({
        kind: 'line',
        a: { x: a.x + u.x * s, y: a.y + u.y * s },
        b: { x: a.x + u.x * e, y: a.y + u.y * e },
        w: 2,
        color: 'ink0',
        opacity: 0.9,
        cap: 'butt',
      });
      s += PERIOD;
    }
    carry = s - seg;
  }
  const tickAt = (p: Vec2, q: Vec2): Primitive => {
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
    return {
      kind: 'line',
      a: { x: p.x - n.x * tick, y: p.y - n.y * tick },
      b: { x: p.x + n.x * tick, y: p.y + n.y * tick },
      w: 2,
      color: 'ink0',
      cap: 'round',
    };
  };
  out.push(tickAt(pts[0], pts[1]), tickAt(pts[pts.length - 1], pts[pts.length - 2]));
  return out;
}

/** A soft grounding shadow under the support — mass meets the floor. */
export function groundShadow(cx: number, rx: number, floorY: number): Primitive {
  // `ink3` at 0.38 reproduces the tint `ink4` at 0.55 gave before the far-limb token darkened (2026-09-03)
  return { kind: 'ellipse', c: { x: cx, y: floorY + 1.5 }, rx, ry: 2.4, fill: 'ink3', opacity: 0.38 };
}

/** A dumbbell seen END-ON (plate face toward the camera) — the "held load" statement, in the
 *  same ghost grammar as the barbell plate at HONEST scale: a working dumbbell head is ≈18cm
 *  across → r≈8 against the canonical athlete (the 45cm barbell plate is r16), so the size
 *  hierarchy alone says barbell vs dumbbell. The solid center is the handle, end-on. */
export function dumbbellEnd(hand: Vec2, r = 8): Primitive[] {
  return [
    { kind: 'circle', c: hand, r, fill: 'ink3', fillOpacity: 0.14, stroke: 'ink3', w: 2 }, // same tint as `plateGhost`
    { kind: 'circle', c: hand, r: 2.2, fill: 'ink0' },
  ];
}

/** A dumbbell seen SIDE-ON along direction `dir` (hammer grips, goblet holds): handle + two plates. */
/* half 7.5 / plateR 6, not 6.5 / 4 (2026-09-07): a 10–15 kg bell's plates are ~14 cm ≈ 6u; at r4 every
   lunge, calf raise and kickback carried a toy. Callers that pass their own numbers are unchanged. */
export function dumbbellSide(hand: Vec2, dir: Vec2, half = 7.5, plateR = 6): Primitive[] {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const u = { x: dir.x / len, y: dir.y / len };
  const a = { x: hand.x - u.x * half, y: hand.y - u.y * half };
  const b = { x: hand.x + u.x * half, y: hand.y + u.y * half };
  return [
    { kind: 'line', a, b, w: 2.5, color: 'ink0', cap: 'round' },
    { kind: 'circle', c: a, r: plateR, fill: 'ink1' },
    { kind: 'circle', c: b, r: plateR, fill: 'ink1' },
  ];
}

/** A dumbbell held by one end with the axis along `dir` — the pullover's hold — so the camera sees the
 *  plates EDGE-ON: a handle with two thin bars across it, not two discs (2026-09-07). */
export function dumbbellEdgeOn(hand: Vec2, dir: Vec2, half = 6.5, plateR = 6): Primitive[] {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const u = { x: dir.x / len, y: dir.y / len };
  const n = { x: -u.y, y: u.x };
  const a = { x: hand.x - u.x * half, y: hand.y - u.y * half };
  const b = { x: hand.x + u.x * half, y: hand.y + u.y * half };
  const plate = (c: Vec2): Primitive => ({ kind: 'line', a: { x: c.x - n.x * plateR, y: c.y - n.y * plateR }, b: { x: c.x + n.x * plateR, y: c.y + n.y * plateR }, w: 3.2, color: 'ink1', cap: 'butt' });
  return [{ kind: 'line', a, b, w: 2.5, color: 'ink0', cap: 'round' }, plate(a), plate(b)];
}

/** A dumbbell in FRONT view, honest rotation projection. `spin` 0 = palms-in (axis toward the
 *  camera: the near plate face-on, one ghost disc) → 1 = palms-forward (axis across the frame:
 *  handle visible, plates foreshortened to edge-on slivers). The Arnold press drives `spin` with
 *  the rep; plain presses hold spin = 1. */
export function dumbbellFront(hand: Vec2, spin = 1, half = 9, plateR = 8): Primitive[] {
  const s = Math.sin((spin * Math.PI) / 2);
  const c = Math.cos((spin * Math.PI) / 2);
  const out: Primitive[] = [];
  const hx = half * s;
  if (hx > 1) out.push({ kind: 'line', a: { x: hand.x - hx, y: hand.y }, b: { x: hand.x + hx, y: hand.y }, w: 2.5, color: 'ink0', cap: 'round' });
  const rx = Math.max(2.4, plateR * c);
  out.push({ kind: 'ellipse', c: { x: hand.x - hx, y: hand.y }, rx, ry: plateR, fill: 'ink3', opacity: 0.55 });
  out.push({ kind: 'ellipse', c: { x: hand.x + hx, y: hand.y }, rx, ry: plateR, fill: 'ink3', opacity: 0.55 });
  out.push({ kind: 'circle', c: hand, r: 2.2, fill: 'ink0' });
  return out;
}

/** A barbell in FRONT view: the bar crossing the frame with edge-on plate slabs at the sleeves. */
export function barbellFront(cx: number, y: number, halfBar = 78, plateX = 62, plateR = PLATE_R): Primitive[] {
  return [
    { kind: 'ellipse', c: { x: cx - plateX, y }, rx: 3.4, ry: plateR, fill: 'ink3', opacity: 0.55 },
    { kind: 'ellipse', c: { x: cx + plateX, y }, rx: 3.4, ry: plateR, fill: 'ink3', opacity: 0.55 },
    { kind: 'line', a: { x: cx - halfBar, y }, b: { x: cx + halfBar, y }, w: 3, color: 'ink0', cap: 'round' },
  ];
}

/** A cable from an anchor/pulley to the hand — same stroke grammar as the pulldown machine. */
export function cable(from: Vec2, to: Vec2): Primitive {
  return { kind: 'line', a: from, b: to, w: 1.5, color: 'ink2' };
}

export function pulley(c: Vec2): Primitive[] {
  return [{ kind: 'circle', c, r: 4, stroke: 'ink3', w: 2, fill: 'paper1' }];
}

// ── the Recognition Layer (§3.5 Amendment 4): the force chain, stated ────────────
// The full station assemblies (stack towers, pulldown/row/press machines) live in machines.ts;
// this kit keeps the shared vocabulary they compose.

/** A floor-pivoted lever shaft (t-bar row, landmine) — drawn in the BAR voice, never the cable
 *  stroke (§3.5): a solid shaft from the pivot to the handle, over a small anchor mount. */
export function leverBar(pivot: Vec2, handle: Vec2): Primitive[] {
  return [
    {
      kind: 'poly',
      pts: [
        { x: pivot.x - 6, y: pivot.y + 3 },
        { x: pivot.x, y: pivot.y - 5 },
        { x: pivot.x + 6, y: pivot.y + 3 },
      ],
      fill: 'ink3',
    }, // the anchor mount
    { kind: 'line', a: pivot, b: handle, w: 3, color: 'ink1', cap: 'round' }, // the shaft
    { kind: 'circle', c: pivot, r: 2.5, fill: 'ink0' }, // the hinge pin
  ];
}

/** An upholstered pad drawn as an outlined thick stroke between two points (benches, rollers). */
export function padStroke(a: Vec2, b: Vec2, w: number): Primitive[] {
  return [
    { kind: 'line', a, b, w: w + 3.5, color: 'ink3', cap: 'round' },
    { kind: 'line', a, b, w, color: 'paper3', cap: 'round' },
  ];
}

/** A bench seen END-ON (the head-end camera of the frontal lying presses): the pad's
 *  cross-section under the athlete, with its two splayed legs to the floor. */
export function benchEndOn(cx: number, top: number, floorY: number, halfW = 24): Primitive[] {
  return [
    { kind: 'line', a: { x: cx - 15, y: top + 8 }, b: { x: cx - 19, y: floorY }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: cx + 15, y: top + 8 }, b: { x: cx + 19, y: floorY }, w: 3, color: 'ink3' },
    { kind: 'rect', x: cx - halfW, y: top, width: halfW * 2, height: 9, rx: 3.5, fill: 'paper3', stroke: 'ink3', w: 2 },
  ];
}

/** The incline back pad, face-on: the reclined rest rising behind the chest dome — its top edge
 *  and side slivers read past the trunk (the reclined-body statement of the incline members). */
export function inclineBackPadFront(cx: number, topY: number, bottomY: number, halfW = 20, floorY = 193): Primitive[] {
  /* An incline bench seen from its head end SAYS incline only if it stands on legs that splay
     back to the floor behind the pad (2026-09-07); a pad alone read as a seat back. */
  const leg = (s: 1 | -1): Primitive => ({ kind: 'line', a: { x: cx + s * (halfW - 4), y: bottomY - 2 }, b: { x: cx + s * (halfW + 6), y: floorY - 1 }, w: 3, color: 'ink3' });
  return [
    leg(1),
    leg(-1),
    { kind: 'line', a: { x: cx - halfW - 6, y: floorY - 1 }, b: { x: cx + halfW + 6, y: floorY - 1 }, w: 2.5, color: 'ink3', cap: 'round' },
    { kind: 'rect', x: cx - halfW, y: topY, width: halfW * 2, height: bottomY - topY, rx: 6, fill: 'paper3', stroke: 'ink3', w: 2 },
  ];
}

/** The bench-press rack, face-on: two uprights either side of the athlete with J-hooks toward
 *  the bar — the goalpost that names a barbell bench station from the equipment alone. */
export function rackUprights(cx: number, halfSpan: number, hookY: number, floorY: number): Primitive[] {
  const post = (s: 1 | -1): Primitive[] => {
    const x = cx + s * halfSpan;
    return [
      { kind: 'line', a: { x, y: hookY - 4 }, b: { x, y: floorY }, w: 3.5, color: 'ink3' },
      { kind: 'line', a: { x: x - 7, y: floorY }, b: { x: x + 7, y: floorY }, w: 2.5, color: 'ink3', cap: 'round' },
      // the J-hook: a short seat toward the bar, lipped up at its mouth
      { kind: 'polyline', pts: [{ x, y: hookY - 4 }, { x: x - s * 6.5, y: hookY - 4 }, { x: x - s * 6.5, y: hookY - 8 }], w: 2.5, color: 'ink3' },
    ];
  };
  return [...post(1), ...post(-1)];
}

/** A flat bench: pad from x0..x1 at `top`, with two legs to the floor. */
export function flatBench(x0: number, x1: number, top: number, floorY: number): Primitive[] {
  const legIn = 16;
  return [
    { kind: 'line', a: { x: x0 + legIn, y: top + 10 }, b: { x: x0 + legIn, y: floorY }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: x1 - legIn, y: top + 10 }, b: { x: x1 - legIn, y: floorY }, w: 3, color: 'ink3' },
    { kind: 'rect', x: x0, y: top, width: x1 - x0, height: 10, rx: 4, fill: 'paper3', stroke: 'ink3', w: 2 },
  ];
}

/** A seat + back-pad unit for upright machines (chest press, shoulder press, pec deck…). */
export function machineSeat(seatCx: number, seatTop: number, floorY: number, back?: { x: number; y0: number; y1: number }): Primitive[] {
  const out: Primitive[] = [
    { kind: 'rect', x: seatCx - 19, y: seatTop, width: 38, height: 7, rx: 2, fill: 'paper3', stroke: 'ink3', w: 2 },
    { kind: 'line', a: { x: seatCx, y: seatTop + 7 }, b: { x: seatCx, y: floorY - 3 }, w: 2.5, color: 'ink3' },
  ];
  if (back) out.push(...padStroke({ x: back.x, y: back.y0 }, { x: back.x, y: back.y1 }, 7));
  return out;
}

/** The scene floor line + shadow every side-view rig shares. */
export function floorScene(floorY: number, shadowCx: number, shadowRx: number): Primitive[] {
  return [
    { kind: 'line', a: { x: 20, y: floorY }, b: { x: 332, y: floorY }, w: 1.5, color: 'line1' },
    groundShadow(shadowCx, shadowRx, floorY),
  ];
}
