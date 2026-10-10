/**
 * The shared equipment kit — plates, bar, bar-path ticks, ground shadow — so every rig states
 * "this is a loaded barbell" in the same voice. The plate is drawn at TRUE scale (a 45cm plate is
 * r=16 against the canonical athlete) as a GHOST: a transparent disc with a rim and a sleeve hub.
 * True scale is what makes the lift instantly recognizable; the ghost treatment is what keeps the
 * figure — the actual demonstration — readable through it. Pure data, no dependencies.
 */

// 

import type { ColorToken, Primitive, Vec2 } from './types';
import { BAR_R, PLATE_R } from './anthro';

/**
 * The knockout seam a held implement is cut out with — the skin's own device (`skin.ts`: the same
 * paper token, laid first and fattened), so a dumbbell or a bell crossing a thigh or the trunk reads
 * as an object IN FRONT of it rather than a patch of the same cream fused into the body. It was the
 * absence of this that turned the walking lunge's two bells into one blob on the hip (2026-09-30).
 */
const IMPLEMENT_SEAM: ColorToken = 'paper1';
const IMPLEMENT_SEAM_W = 0.9;

const unit = (d: Vec2): Vec2 => {
  const len = Math.hypot(d.x, d.y) || 1;
  return { x: d.x / len, y: d.y / len };
};

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
    /* The plate's RIM (2026-09-30): the raised lip every cast plate and every bumper's steel face
       carries, a hairline a fifth in from the edge. It is what turns "a ring" into "a plate" at hero
       size, and at thumbnail size it simply vanishes into the disc. Only a real plate has one — the
       curl bar's small discs stay plain. */
    ...(r >= 10 ? [{ kind: 'circle' as const, c: bar, r: r * 0.8, stroke: 'ink3' as const, w: 0.9 }] : []),
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
/*
 * ⛔ A HEXAGON, NOT A DISC (2026-09-30). End-on, the old dumbbell was the barbell plate at half size
 * — the same ring in the same ink — and the size hierarchy was the only thing telling them apart,
 * which a thumbnail does not preserve. The hex head is the gym's own word for "dumbbell": no plate is
 * six-sided, so the silhouette alone names the implement at any size. It stays a GHOST (the fist is
 * concentric with it and must read through), and it is locked to `along` — the forearm, or any
 * direction rigid to the hand — so the head turns with the grip through a curl instead of standing
 * still while the hand rotates inside it. Without `along` it rests flat-bottomed, as a bell on a rack.
 */
/** The hex face's turn: a flat face square to `along`, so a bell on a hanging forearm rests flat-bottomed. */
const hexTurn = (along?: Vec2): number => (along ? Math.atan2(along.y, along.x) + Math.PI / 2 : 0);

/**
 * A dumbbell head's hex face, end-on — the one shape every end-on bell in the library is cut from.
 * `r` is the radius of the disc it replaced (circumradius 1.06r, so the two weigh the same on the
 * page); `stroke` outlines it with round joins; `along` turns it with the grip (see `hexTurn`).
 */
export function hexFace(c: Vec2, r: number, fill: ColorToken, o: { opacity?: number; stroke?: ColorToken; w?: number; along?: Vec2 } = {}): Primitive[] {
  const a0 = hexTurn(o.along);
  const R = r * 1.06;
  const hex = Array.from({ length: 6 }, (_, i) => ({ x: c.x + Math.cos(a0 + (i * Math.PI) / 3) * R, y: c.y + Math.sin(a0 + (i * Math.PI) / 3) * R }));
  const out: Primitive[] = [{ kind: 'poly', pts: hex, fill, ...(o.opacity != null ? { opacity: o.opacity } : {}) }];
  if (o.stroke) out.push({ kind: 'polyline', pts: [...hex, hex[0], hex[1]], w: o.w ?? 2, color: o.stroke });
  return out;
}

export function dumbbellEnd(hand: Vec2, r = 8, along?: Vec2): Primitive[] {
  return [
    ...hexFace(hand, r, 'ink3', { opacity: 0.14, stroke: 'ink3', w: 2, along }), // same tint as `plateGhost`
    { kind: 'circle', c: hand, r: 2.2, fill: 'ink0' },
  ];
}

/**
 * A KETTLEBELL, hanging from `hand` in direction `dir` (2026-09-10, the home-gym family).
 *
 * ⛔ IT IS DRAWN AS THE SILHOUETTE, NOT AS A DUMBBELL WITH A LABEL. The whole reason a kettlebell is
 * a different family from a dumbbell is that the mass hangs BELOW the grip rather than sitting in
 * line with it — which is why a swing swings and why the bell rests on the back of the forearm in a
 * rack. Drawn as two discs on a handle, every one of these clips would have taught a dumbbell
 * movement under a kettlebell's name, which is the defect `theClipOutranksTheCard` exists for.
 *
 * The shape is the honest minimum a coach reads at a glance: a squat body offset a bell's-height
 * along `dir`, and the two horns of the handle running from the hand to its shoulders.
 */
export function kettlebellHang(hand: Vec2, dir: Vec2, r = 8): Primitive[] {
  const u = unit(dir);
  const n = { x: -u.y, y: u.x };
  /** The bell's centre — a handle's height plus the body's radius, along the hang. */
  const c = { x: hand.x + u.x * (r * 1.55), y: hand.y + u.y * (r * 1.55) };
  /* The body is a ball with its BASE cut flat (2026-09-30) — the flat foot a kettlebell stands on is
     the other half of its silhouette, and a full disc read as a ball on a handle. The chord sits at
     0.8 of the radius along the hang, so it faces the floor whenever the bell does. */
  const body = (grow: number): Primitive => {
    const R = r + grow;
    const pts = Array.from({ length: 28 }, (_, i) => {
      const t = (i / 28) * Math.PI * 2;
      const a = Math.min(Math.cos(t) * R, 0.8 * r + grow);
      const b = Math.sin(t) * R;
      return { x: c.x + u.x * a + n.x * b, y: c.y + u.y * a + n.y * b };
    });
    return { kind: 'poly', pts, fill: grow > 0 ? IMPLEMENT_SEAM : 'ink1' };
  };
  const horn = (s: number): Primitive => ({
    kind: 'line',
    a: { x: hand.x + n.x * s * 1.6, y: hand.y + n.y * s * 1.6 },
    b: { x: c.x + n.x * s * r * 0.78 - u.x * r * 0.55, y: c.y + n.y * s * r * 0.78 - u.y * r * 0.55 },
    w: 2.4,
    color: 'ink0',
    cap: 'round',
  });
  return [body(IMPLEMENT_SEAM_W), body(0), horn(-1), horn(1)];
}

/**
 * One dumbbell head seen SIDE-ON: the silhouette of a cylinder (or a hex) with its axis in the
 * drawing plane — a block ACROSS the handle, its corners eased to the rubber's radius. `grow` fattens
 * it evenly on every side; that is how its seam is drawn.
 */
function headSide(c: Vec2, u: Vec2, halfLen: number, halfH: number, grow: number, fill: ColorToken): Primitive {
  const n = { x: -u.y, y: u.x };
  const L = halfLen + grow;
  const H = halfH + grow;
  const k = Math.min(L, H) * 0.45;
  const P = (a: number, b: number): Vec2 => ({ x: c.x + u.x * a + n.x * b, y: c.y + u.y * a + n.y * b });
  return { kind: 'poly', pts: [P(-L + k, -H), P(L - k, -H), P(L, -H + k), P(L, H - k), P(L - k, H), P(-L + k, H), P(-L, H - k), P(-L, -H + k)], fill };
}

/** A dumbbell seen SIDE-ON along direction `dir` (hammer grips, goblet holds, bells at the sides). */
/* half 7.5 / plateR 6, not 6.5 / 4 (2026-09-07): a 10–15 kg bell's plates are ~14 cm ≈ 6u; at r4 every
   lunge, calf raise and kickback carried a toy. Callers that pass their own numbers are unchanged. */
/*
 * ⛔ THE HEADS WERE DISCS, AND A DISC IS WHAT A HEAD LOOKS LIKE END-ON (2026-09-30). With the axis in
 * the drawing plane the camera sees each head from its SIDE — a block as tall as the head is round
 * and about half as long — and the bell reads as the ▮─▮ every gym sign uses. Two discs 3u apart
 * read as a pair of balls, and at the lunge's hip, over the hand and the thigh, as one blob. The
 * heads are centred where the discs were, so the bell's reach is unchanged; each is cut out with the
 * implement seam.
 */
/*
 * `plane: 'far'` is the bell in the OTHER hand (2026-09-30). A pair at the sides hang a hand's width
 * apart in depth and a few units apart on the page, and drawn twice in the near ink they stacked into
 * four heads on the hip. The far one is drawn the way the far limb is — the far ink, no seam — and its
 * caller lays it in `back`, under the body, so it peeks out past the near thigh as the bell behind it.
 */
export function dumbbellSide(hand: Vec2, dir: Vec2, half = 7.5, plateR = 6, plane: 'near' | 'far' = 'near'): Primitive[] {
  const u = unit(dir);
  const a = { x: hand.x - u.x * half, y: hand.y - u.y * half };
  const b = { x: hand.x + u.x * half, y: hand.y + u.y * half };
  /* a head is ~0.55 of its own diameter long: 6.6u at the working bell, leaving ~8u of handle for the fist */
  const hl = plateR * 0.55;
  if (plane === 'far') {
    return [
      { kind: 'line', a, b, w: 2.5, color: 'ink4', cap: 'round' },
      headSide(a, u, hl, plateR, 0, 'ink4'),
      headSide(b, u, hl, plateR, 0, 'ink4'),
    ];
  }
  return [
    headSide(a, u, hl, plateR, IMPLEMENT_SEAM_W, IMPLEMENT_SEAM),
    headSide(b, u, hl, plateR, IMPLEMENT_SEAM_W, IMPLEMENT_SEAM),
    { kind: 'line', a, b, w: 2.5, color: 'ink0', cap: 'round' },
    headSide(a, u, hl, plateR, 0, 'ink1'),
    headSide(b, u, hl, plateR, 0, 'ink1'),
  ];
}

/**
 * The cable's D-HANDLE (stirrup), seen side-on (2026-09-30): the grip bar across the fist and the
 * strap's two sides converging to the clip on the cable's line. It was a 3u dumbbell profile — a toy
 * bell on a wire — and the rebuilt `dumbbellSide` would have made it two tiny blocks. A stirrup is a
 * triangle hanging off the cable; that is its whole word. `toward` is where the cable comes from.
 */
export function stirrupHandle(hand: Vec2, dir: Vec2, toward: Vec2): Primitive[] {
  const u = unit(dir);
  const t = unit({ x: toward.x - hand.x, y: toward.y - hand.y });
  const a = { x: hand.x - u.x * 3.4, y: hand.y - u.y * 3.4 };
  const b = { x: hand.x + u.x * 3.4, y: hand.y + u.y * 3.4 };
  const clip = { x: hand.x + t.x * 6.5, y: hand.y + t.y * 6.5 };
  return [
    { kind: 'polyline', pts: [a, clip, b], w: 1.6, color: 'ink2' },
    { kind: 'line', a, b, w: 2.6, color: 'ink0', cap: 'round' },
    { kind: 'circle', c: clip, r: 1.3, fill: 'ink2' },
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
/*
 * THE HEAD AS THE SOLID IT IS (2026-09-30). Each head is a hex prism; the camera sees its face
 * foreshortened by the spin and swept sideways by its own length — the convex hull of the face at
 * both ends of the head. At spin 0 that is the end-on hex of `dumbbellEnd`; at spin 1 it is the
 * block `dumbbellSide` draws. The old ellipses were a disc squashed to a lens, which no dumbbell is
 * from any side. `along` turns the face with the arm (the lateral raise rotates it a quarter turn
 * about the handle); the fill thickens as the heads leave the fist, since the ghost exists only so
 * the fist reads through a head laid over it.
 */
export function dumbbellFront(hand: Vec2, spin = 1, half = 9, plateR = 8, along?: Vec2): Primitive[] {
  const s = Math.sin((spin * Math.PI) / 2);
  const c = Math.cos((spin * Math.PI) / 2);
  const out: Primitive[] = [];
  const hx = half * s;
  if (hx > 1) out.push({ kind: 'line', a: { x: hand.x - hx, y: hand.y }, b: { x: hand.x + hx, y: hand.y }, w: 2.5, color: 'ink0', cap: 'round' });
  const a0 = hexTurn(along);
  const R = plateR * 1.06;
  const d = plateR * 0.55 * s;
  for (const side of [-1, 1]) {
    const cx = hand.x + side * hx;
    const pts: Vec2[] = [];
    for (let i = 0; i < 6; i++) {
      const t = a0 + (i * Math.PI) / 3;
      const x = Math.cos(t) * R * c;
      const y = hand.y + Math.sin(t) * R;
      pts.push({ x: cx + x - d, y }, { x: cx + x + d, y });
    }
    const hull = convexHull(pts);
    out.push(
      { kind: 'poly', pts: hull, fill: 'ink3', opacity: 0.14 + 0.41 * s },
      { kind: 'polyline', pts: [...hull, hull[0], hull[1]], w: 1.8, color: 'ink3' },
    );
  }
  out.push({ kind: 'circle', c: hand, r: 2.2, fill: 'ink0' });
  return out;
}

/** Andrew's monotone chain — the silhouette of a swept face. */
function convexHull(points: Vec2[]): Vec2[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-9) lower.pop();
    lower.push(q);
  }
  const upper: Vec2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-9) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A barbell in FRONT view: the bar crossing the frame with edge-on plate slabs at the sleeves. */
/*
 * A plate edge-on is a SLAB — a 45 cm disc 5 cm thick is a tall block with its rim eased — not the
 * lens an ellipse draws (2026-09-30). Each sleeve carries the slab and, outboard of it, the collar
 * that locks it on: the small square step every loaded bar shows from the front.
 */
export function barbellFront(cx: number, y: number, halfBar = 78, plateX = 62, plateR = PLATE_R): Primitive[] {
  const slabAt = (x: number): Primitive => ({ ...(headSide({ x, y }, { x: 1, y: 0 }, 2.2, plateR, 0, 'ink3') as Extract<Primitive, { kind: 'poly' }>), opacity: 0.55 });
  const collar = (x: number): Primitive => ({ kind: 'line', a: { x, y: y - 3 }, b: { x, y: y + 3 }, w: 2.6, color: 'ink3', cap: 'butt' });
  return [
    slabAt(cx - plateX),
    slabAt(cx + plateX),
    collar(cx - plateX - 4.4),
    collar(cx + plateX + 4.4),
    { kind: 'line', a: { x: cx - halfBar, y }, b: { x: cx + halfBar, y }, w: 3, color: 'ink0', cap: 'round' },
  ];
}

/** A cable from an anchor/pulley to the hand — same stroke grammar as the pulldown machine. */
export function cable(from: Vec2, to: Vec2): Primitive {
  return { kind: 'line', a: from, b: to, w: 1.5, color: 'ink2' };
}

export function pulley(c: Vec2): Primitive[] {
  /* the axle (2026-09-30): an empty ring is a washer; the pin at its centre makes it a wheel */
  return [
    { kind: 'circle', c, r: 4, stroke: 'ink3', w: 2, fill: 'paper1' },
    { kind: 'circle', c, r: 1.2, fill: 'ink3' },
  ];
}

/**
 * An elastic BAND from where it is tied off to the hand (2026-09-10) — drawn so it cannot be read
 * as a cable. A cable is a constant 1.5u wire over a pulley with a stack that rises; a band has no
 * stack, and its one honest signal is that it THINS as it stretches. So the stroke's width IS the
 * stretch: 3.6u at `rest` (its length at the slack end of the rep), narrowing to 1.8u by the time
 * it has doubled — never thinner, so it never disappears on a phone.
 */
export function bandStrip(from: Vec2, to: Vec2, rest: number): Primitive {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const r = Math.max(1, rest);
  const w = Math.max(1.8, 3.6 - 1.8 * Math.min(1, Math.max(0, len - r) / r));
  return { kind: 'line', a: from, b: to, w, color: 'ink2', cap: 'round' };
}

/** Where a band is tied off — a door anchor's strap block, a loop under a foot, a knot on a post. */
export function bandAnchor(c: Vec2): Primitive[] {
  return [{ kind: 'rect', x: c.x - 3.5, y: c.y - 4.5, width: 7, height: 9, rx: 2, fill: 'paper1', stroke: 'ink3', w: 2 }];
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
  /* its feet (2026-09-30): a bench stands on two cross-feet, as the rack's uprights do — legs that
     simply end at the floor line read as a table on stilts */
  const foot = (x: number): Primitive => ({ kind: 'line', a: { x: x - 6, y: floorY }, b: { x: x + 6, y: floorY }, w: 2.5, color: 'ink3', cap: 'round' });
  return [
    { kind: 'line', a: { x: x0 + legIn, y: top + 10 }, b: { x: x0 + legIn, y: floorY }, w: 3, color: 'ink3' },
    { kind: 'line', a: { x: x1 - legIn, y: top + 10 }, b: { x: x1 - legIn, y: floorY }, w: 3, color: 'ink3' },
    foot(x0 + legIn),
    foot(x1 - legIn),
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
