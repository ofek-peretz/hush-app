/**
 * HUSH MOTION 3D — SOLIDS, LIGHT, MATERIAL, AND WHAT THE CAMERA CANNOT SEE.
 *
 * Everything drawn — the athlete and the machine alike — is described here as a SOLID in space,
 * and turned into flat polygons by one tessellator.
 *
 * Six things make a shape read as a real object rather than a sticker:
 *
 *   ORIENTATION — a solid carries its own axes, so a pad reclines with the spine and a rail runs
 *                 where the rail runs, instead of everything being square to the world.
 *   LIGHT       — every face has a true normal, so the top of a plate catches light and its side
 *                 falls away. One light direction, one lambert term, no per-part fudge factors.
 *   DEPTH       — what is far sinks toward the ground.
 *   CONTACT     — and the floor blocks the sky, so everything near it loses ambient. Without that
 *                 a foot hovers no matter how well it is lit.
 *   MATERIAL    — ⛔ EVERY SURFACE USED TO BE PURE MATTE, and matte is the one thing gym steel is
 *                 not. Diffuse light tells you a shape; the hard bright kick of a SPECULAR
 *                 highlight is what tells you the shape is metal and not cardboard. Painted
 *                 frame, bare rail, cast plate, rubber grip and upholstery each get their own
 *                 strength and tightness, and that difference is most of what "made of something"
 *                 means in a picture with no texture in it.
 *   BEVEL       — ⛔ AND EVERY EDGE WAS MATHEMATICALLY SHARP, which nothing in the world is. A
 *                 real chamfer catches a thin line of light along every corner; it is a small
 *                 thing on one box and the entire difference between "modelled" and "drawn"
 *                 across a whole machine. The boxes are genuinely chamfered — 26 faces, not 6 —
 *                 rather than faked with an outline, because a faked one breaks the moment two
 *                 parts touch.
 */
// @ts-nocheck

const { V, add, sub, mul, norm, len, cross, dot } = require('./core');

/**
 * THE KEY LIGHT, SET RELATIVE TO THE CAMERA.
 *
 * ⛔ IT USED TO BE NAILED TO THE WORLD, and that was invisible for as long as every camera stood
 * in front of the athlete. The moment the solver was allowed all the way round — which is the only
 * way to see past a pulldown's tower — it put the lens behind him and the light stayed where it
 * was, lighting the side nobody was looking at. The figure came back a silhouette.
 *
 * No photographer nails a key light to the room. It is set relative to the LENS: a little to one
 * side, a little above. Thirty-five degrees round and forty up, wherever the camera goes.
 */
const KEY_AZ = 35, KEY_EL = 40;
let LIGHT = norm(V(0.34, -1, 0.42));
function setKeyFor(cam) {
  const a = (cam.azimuth + KEY_AZ) * (Math.PI / 180), e = KEY_EL * (Math.PI / 180);
  LIGHT = norm(V(Math.sin(a) * Math.cos(e), -Math.sin(e), Math.cos(a) * Math.cos(e)));
}
const AMBIENT = 0.44, DIFFUSE = 0.56;
const AO_REACH = 34;      // how far the floor's shadowing reaches up
const AO_DEPTH = 0.34;    // and how much ambient it takes away at contact
const BEVEL = 1.4;        // world units taken off every box edge

/** How each surface answers a light: how strong its highlight is, and how tight. */
const MATERIAL = {
  frame: { spec: 0.17, shine: 26 },      // painted steel section
  rail: { spec: 0.36, shine: 74 },       // bare steel — the tightest highlight in the scene
  plateOn: { spec: 0.21, shine: 34 },    // cast plate, semi-gloss
  plateOff: { spec: 0.15, shine: 30 },
  cable: { spec: 0.28, shine: 54 },
  grip: { spec: 0.07, shine: 12 },       // rubber: a broad, weak sheen
  pad: { spec: 0.05, shine: 9 },         // upholstery barely returns anything
  limb: { spec: 0.13, shine: 23 },       // skin: a soft, fairly broad sheen
  kit: { spec: 0.06, shine: 11 },        // cloth returns almost nothing
  trunk: { spec: 0.11, shine: 19 },
  face: { spec: 0.12, shine: 21 },
};
const matOf = (tone) => MATERIAL[tone] || { spec: 0.10, shine: 20 };

const lambert = (n) => AMBIENT + DIFFUSE * Math.max(0, dot(n, LIGHT));

/**
 * GRAIN. ⛔ EVERY FACE OF A GIVEN MATERIAL RETURNED EXACTLY THE SAME VALUE, and nothing real does
 * — cast iron, painted tube and vinyl all vary panel to panel. A percent or two of deterministic
 * variation is below the threshold of being noticed as an effect and above the threshold of being
 * felt as a surface. It is keyed to the part's index and the face's index within it, never to a
 * running counter, so a face keeps its own value across every frame instead of shimmering.
 */
const GRAIN = { frame: 0.030, rail: 0.020, plateOn: 0.038, plateOff: 0.038, pad: 0.042,
  grip: 0.030, cable: 0.018, limb: 0.010, trunk: 0.010, face: 0.008, kit: 0.026 };
let PART_I = 0, FACE_I = 0;
function grain(tone) {
  const amp = GRAIN[tone] == null ? 0.02 : GRAIN[tone];
  const x = Math.sin((PART_I * 131.7 + FACE_I++) * 12.9898) * 43758.5453;
  return 1 + amp * ((x - Math.floor(x)) * 2 - 1);
}

/** A direction (not a point) in the camera's own axes. Projection is linear, so this is exact. */
function inCamera(cam, v) {
  const O = cam.project(V(0, 0, 0)), P = cam.project(v);
  return { u: P.u - O.u, v: P.v - O.v, d: P.d - O.d };
}

const floorAO = (y, floorY) =>
  floorY == null ? 1 : (1 - AO_DEPTH) + AO_DEPTH * Math.min(1, Math.max(0, (floorY - y) / AO_REACH));

/** Blinn–Phong, in world space, against the camera's own view axis. */
function specularWorld(cam, n, tone) {
  const m = matOf(tone);
  const h = norm(add(LIGHT, cam.dir));
  return m.spec * Math.pow(Math.max(0, dot(n, h)), m.shine);
}

/** The same, for surfaces whose normal is only known in camera space (round limbs, balls). */
function specularCamera(Lc, nu, nv, nd, tone) {
  const m = matOf(tone);
  const hu = Lc.u, hv = Lc.v, hd = Lc.d + 1;
  const hl = Math.hypot(hu, hv, hd) || 1;
  const c = (nu * hu + nv * hv + nd * hd) / hl;
  return m.spec * Math.pow(Math.max(0, c), m.shine);
}

/**
 * One polygon of any vertex count. `ref` is a point known to be INSIDE the solid: the normal is
 * turned away from it, so winding stops being something every builder has to get right. The
 * normal itself is Newell's — exact for a triangle, and stable for the chamfer's slivers.
 */
function face(cam, p, tone, out, ref, floorY, gFixed) {
  const g = gFixed != null ? gFixed : grain(tone);      // drawn on it or not, the face keeps its number
  let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
    cx += a.x; cy += a.y; cz += a.z;
  }
  const m = Math.hypot(nx, ny, nz);
  if (m < 1e-9) return;
  let n = V(nx / m, ny / m, nz / m);
  const mid = V(cx / p.length, cy / p.length, cz / p.length);
  if (ref && dot(n, sub(mid, ref)) < 0) n = mul(n, -1);
  if (dot(n, cam.dir) <= 0.001) return;                 // back-face: never the one you see
  const Q = p.map((q) => cam.project(q));
  out.push({
    kind: 'poly',
    pts: Q.map((r) => ({ x: r.u, y: r.v })),
    depth: Q.reduce((a, r) => a + r.d, 0) / p.length,
    tone,
    light: lambert(n) * floorAO(mid.y, floorY) * g,
    spec: specularWorld(cam, n, tone),
  });
}

/* ── the solids ──────────────────────────────────────────────────────────── */

/**
 * A CHAMFERED oriented box: six inset faces, twelve edge strips and eight corner triangles. The
 * edge strips carry a normal halfway between their two faces, which is exactly the surface that
 * produces the bright line down a real corner.
 */
function obox(cam, c, U, V_, W, tone, out, floorY, bevel = BEVEL) {
  const uh = len(U), vh = len(V_), wh = len(W);
  const b = Math.max(0, Math.min(bevel, uh * 0.42, vh * 0.42, wh * 0.42));
  const Ui = mul(U, 1 - b / uh), Vi = mul(V_, 1 - b / vh), Wi = mul(W, 1 - b / wh);
  const P = (a, bb, d) => add(c, add(add(mul(U, a), mul(V_, bb)), mul(W, d)));
  const Q = (a, bb, d) => add(c, add(add(mul(Ui, a), mul(Vi, bb)), mul(Wi, d)));

  /* six faces, each pulled in along the two axes it does not own */
  const axes = [[U, Ui, 0], [V_, Vi, 1], [W, Wi, 2]];
  for (let k = 0; k < 3; k++) {
    const [A] = axes[k];
    const [, Bi] = axes[(k + 1) % 3], [, Ci] = axes[(k + 2) % 3];
    for (const s of [1, -1]) {
      face(cam, [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p1, p2]) =>
        add(c, add(add(mul(A, s), mul(Bi, p1)), mul(Ci, p2)))), tone, out, c, floorY);
    }
  }
  /* twelve edges: between each pair of faces */
  for (let k = 0; k < 3; k++) {
    const [A, Ai] = axes[k], [B, Bi] = axes[(k + 1) % 3], [, Ci] = axes[(k + 2) % 3];
    for (const sa of [1, -1]) for (const sb of [1, -1]) {
      face(cam, [
        add(c, add(add(mul(A, sa), mul(Bi, sb)), mul(Ci, 1))),
        add(c, add(add(mul(A, sa), mul(Bi, sb)), mul(Ci, -1))),
        add(c, add(add(mul(Ai, sa), mul(B, sb)), mul(Ci, -1))),
        add(c, add(add(mul(Ai, sa), mul(B, sb)), mul(Ci, 1))),
      ], tone, out, c, floorY);
    }
  }
  /* eight corners */
  for (const a of [1, -1]) for (const bb of [1, -1]) for (const d of [1, -1]) {
    face(cam, [
      add(c, add(add(mul(U, a), mul(Vi, bb)), mul(Wi, d))),
      add(c, add(add(mul(Ui, a), mul(V_, bb)), mul(Wi, d))),
      add(c, add(add(mul(Ui, a), mul(Vi, bb)), mul(W, d))),
    ], tone, out, c, floorY);
  }
  void P; void Q;
}

/** A tapered rectangular block — feet and anything with a square section that changes. */
function frustum(cam, a, b, ref, w0, d0, w1, d1, tone, out, floorY) {
  const axis = norm(sub(b, a));
  let W = cross(axis, ref);
  if (len(W) < 1e-5) W = cross(axis, V(1, 0, 0));
  W = norm(W);
  const D = norm(cross(axis, W));
  const ring = (p, w, d) => [
    add(add(p, mul(W, w)), mul(D, d)), add(add(p, mul(W, -w)), mul(D, d)),
    add(add(p, mul(W, -w)), mul(D, -d)), add(add(p, mul(W, w)), mul(D, -d)),
  ];
  const A = ring(a, w0, d0), B = ring(b, w1, d1), mid = mul(add(a, b), 0.5);
  for (let i = 0; i < 4; i++) face(cam, [A[i], A[(i + 1) % 4], B[(i + 1) % 4], B[i]], tone, out, mid, floorY);
  face(cam, A, tone, out, mid, floorY);
  face(cam, B, tone, out, mid, floorY);
}

/** An elliptical cross-section swept along a spine — the trunk, and every pulley in the scene. */
/**
 * ⛔ AN ELLIPSE CANNOT HAVE A CHEST. The trunk's section was a plain ellipse, so pectorals had to
 * be bolted on as two separate flattened solids — and from the front they read as a shelf with a
 * seam where they met the ribs. A body's cross-section is not an ellipse; it has LOBES. Each ring
 * may now carry them: [angle°, amount, spread°], measured from +lat, pushing the surface out
 * radially. Pecs, lats and traps stop being parts and become the shape the trunk already is.
 */
function loft(cam, rings, lat, dep, tone, out, floorY, sides = 10) {
  /* ⛔ PER-FACE GRAIN TURNED EVERY LOFT INTO A BARBER'S POLE. A chamfered box wants its panels to
     differ — that is what panels do — but a thigh is ONE piece of one material, and giving each
     ring its own value drew stripes down the leg. Bodies take a single number. */
  const g = grain(tone);
  const pt = (r, i) => {
    const t = (i / sides) * Math.PI * 2;
    let k = 1;
    if (r.lobes) {
      const deg = t * 180 / Math.PI;
      for (const [at, amp, spread] of r.lobes) {
        const d = ((deg - at + 540) % 360) - 180;
        k += amp * Math.exp(-(d / spread) * (d / spread));
      }
    }
    return add(r.c, add(mul(lat, Math.cos(t) * r.w * k), mul(dep, Math.sin(t) * r.d * k)));
  };
  /* ⛔ EVERY FACE USED TO BE ORIENTED AWAY FROM THE SOLID'S OVERALL CENTRE, and for the rings near
     either END that direction runs ALONG the axis rather than out from it — so their normals came
     out inverted, lit from the wrong side, and the limb wore stripes. A side face belongs to its
     own slice: orient it away from the point on the AXIS between the two rings it spans. */
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1];
    const axisPt = mul(add(A.c, B.c), 0.5);
    for (let i = 0; i < sides; i++) face(cam, [pt(A, i), pt(A, i + 1), pt(B, i + 1), pt(B, i)], tone, out, axisPt, floorY, g);
  }
  const inward = (k) => mul(sub(rings[k].c, rings[k === 0 ? 1 : rings.length - 2].c), 0.35);
  for (const k of [0, rings.length - 1]) {
    const r = rings[k], ref = sub(r.c, inward(k));     // a cap faces out along the axis, not sideways
    for (let i = 0; i < sides; i += 2) face(cam, [r.c, pt(r, i), pt(r, i + 1), pt(r, i + 2)], tone, out, ref, floorY, g);
  }
}

/**
 * A LIMB WITH A MUSCLE BELLY.
 *
 * ⛔ EVERY LIMB WAS A CONE — one radius at the root, a smaller one at the tip, straight between.
 * No arm is that shape. A biceps is widest a third of the way down and the forearm is widest just
 * below the elbow and narrow at the wrist; a calf carries its mass HIGH and runs to almost nothing
 * at the ankle. Those bellies are what the eye reads as muscle, and a cone has none of them, which
 * is why the figure read as a shop mannequin rather than an athlete.
 *
 * `prof` is [distance along the bone 0→1, radius as a fraction of `r`], and `ratio` flattens the
 * section — a forearm is not round.
 *
 * ⚠ It falls back to the screen-space capsule when the bone is badly foreshortened. A world-space
 * loft degenerates into a scribble when its axis points at the lens, which is exactly the case the
 * capsule was built for; the solver's `solidity` term normally keeps us far away from it, but a
 * catalogue of 123 exercises will find the exception and this must not be the thing that breaks.
 */
const LIMB_RINGS = 10;

/**
 * ⛔ A FIVE-POINT PROFILE DRAWN STRAIGHT BECAME FIVE FLAT CONES, and every join showed as a kink
 * down the arm — the silhouette of a muscle was a polyline. Catmull–Rom through the same control
 * points costs nothing and gives the curve the belly actually has.
 */
function splineAt(prof, t) {
  let i = 0;
  while (i < prof.length - 2 && prof[i + 1][0] < t) i++;
  const p1 = prof[i], p2 = prof[i + 1];
  const p0 = prof[i - 1] || p1, p3 = prof[i + 2] || p2;
  const span = p2[0] - p1[0];
  const u = span > 1e-6 ? Math.max(0, Math.min(1, (t - p1[0]) / span)) : 0;
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u
    + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2
    + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
}

/**
 * A LIMB SWEPT ALONG A BENT PATH — shoulder through elbow to wrist as ONE surface.
 *
 * ⛔ THE BODY WAS AN ASSEMBLY OF INTERSECTING SOLIDS AND FROM THE FRONT IT SHOWED. A ball for the
 * deltoid, a cone for the upper arm, a ball for the elbow, a cone for the forearm: four closed
 * surfaces jammed into each other, and every join a visible seam. At three-quarters it passed; the
 * moment a camera looked straight on it read as parts, not as a body.
 *
 * One loft along the whole chain has no join to show, because there is no join. The deltoid is
 * just the profile being fat at t=0, the elbow is just the profile narrowing at t=0.55, and the
 * limb bends because the SECTION FOLLOWS THE PATH.
 *
 * The frame is parallel-transported rather than rebuilt from a fixed reference at each step: any
 * frame derived independently per segment spins as the tangent turns, and a swept section that
 * spins is a limb with a twist in it.
 */
function limbPath(cam, path, prof, r, ratio, ref, tone, out, floorY) {
  const N = 26;
  /* arc-length sample of the polyline */
  const segs = [], cum = [0];
  for (let i = 0; i < path.length - 1; i++) {
    segs.push(len(sub(path[i + 1], path[i])));
    cum.push(cum[i] + segs[i]);
  }
  const total = cum[cum.length - 1];
  if (total < 1e-4) return;
  const pointAt = (t) => {
    const d = t * total;
    let i = 0;
    while (i < segs.length - 1 && cum[i + 1] < d) i++;
    const u = segs[i] > 1e-9 ? (d - cum[i]) / segs[i] : 0;
    return add(path[i], mul(sub(path[i + 1], path[i]), u));
  };

  const pts = [];
  for (let i = 0; i <= N; i++) pts.push(pointAt(i / N));
  const tang = pts.map((p, i) => norm(sub(pts[Math.min(N, i + 1)], pts[Math.max(0, i - 1)])));

  let lat = cross(tang[0], ref || V(0, 0, 1));
  if (len(lat) < 1e-5) lat = cross(tang[0], V(1, 0, 0));
  lat = norm(lat);
  const rings = [];
  for (let i = 0; i <= N; i++) {
    lat = norm(sub(lat, mul(tang[i], dot(lat, tang[i]))));   // transport, never rebuild
    const k = r * splineAt(prof, i / N);
    rings.push({ c: pts[i], w: k, d: k * (ratio || 1), lat, dep: norm(cross(tang[i], lat)) });
  }
  /* the section turns with the path, so each ring carries its own axes */
  const sides = 12;
  const pt = (g, i) => {
    const a = (i / sides) * Math.PI * 2;
    return add(g.c, add(mul(g.lat, Math.cos(a) * g.w), mul(g.dep, Math.sin(a) * g.d)));
  };
  const gr = grain(tone);
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1], axisPt = mul(add(A.c, B.c), 0.5);
    for (let i = 0; i < sides; i++) face(cam, [pt(A, i), pt(A, i + 1), pt(B, i + 1), pt(B, i)], tone, out, axisPt, floorY, gr);
  }
  for (const [g, other] of [[rings[0], rings[1]], [rings[N], rings[N - 1]]]) {
    /* ⛔ INSIDE, NOT OUTSIDE. `face` turns a normal AWAY from the reference point, so the point
       has to be within the solid. This one sat beyond the end ring, which flipped every end cap
       to face inward — the crown of his skull came out lit from underneath, a dark disc on top of
       his head, and the same inversion was on the end of every limb where a hand or a foot
       happened to hide it. */
    const refPt = sub(g.c, mul(sub(g.c, other.c), 0.4));
    for (let i = 0; i < sides; i += 2) face(cam, [g.c, pt(g, i), pt(g, i + 1), pt(g, i + 2)], tone, out, refPt, floorY, gr);
  }
}

function limb(cam, a, b, prof, r, ratio, ref, tone, out, floorY) {
  const axis = sub(b, a), L = len(axis);
  const A = cam.project(a), B = cam.project(b);
  if (Math.hypot(B.u - A.u, B.v - A.v) < L * 0.42) {
    tube(cam, a, b, r * prof[0][1], r * prof[prof.length - 1][1], tone, out, floorY);
    return;
  }
  const dir = mul(axis, 1 / L);
  let lat = cross(dir, ref || V(0, 0, 1));
  if (len(lat) < 1e-4) lat = cross(dir, V(1, 0, 0));
  lat = norm(lat);
  const dep = norm(cross(dir, lat));
  const rings = [];
  for (let i = 0; i <= LIMB_RINGS; i++) {
    const t = i / LIMB_RINGS, k = r * splineAt(prof, t);
    rings.push({ c: add(a, mul(dir, t * L)), w: k, d: k * (ratio || 1) });
  }
  loft(cam, rings, lat, dep, tone, out, floorY, 14);
}

/**
 * A BODY SWEPT ALONG A BENT SPINE — pelvis through chest to crown, with a section that changes.
 *
 * ⛔ THE TRUNK WAS A STRAIGHT LOFT, WHICH FORCED THE HEAD TO BE IN LINE WITH THE SPINE. Upright
 * that is invisible. Bent over a barbell it means he is staring at the floor, and the camera sees
 * the crown of his skull end-on — a stump where a head should be. Nobody rows like that: a hinged
 * lifter extends his neck and keeps his head roughly level, because he is looking where he is
 * going.
 *
 * It takes the same parallel-transported frame as a limb, and the same lobed section as the loft,
 * so the chest still has pectorals and the neck still pinches while the whole thing bends.
 */
function bodyPath(cam, path, rings, lobes, latRef, tone, out, floorY, sides = 20) {
  const N = 34;
  const segs = [], cum = [0];
  for (let i = 0; i < path.length - 1; i++) { segs.push(len(sub(path[i + 1], path[i]))); cum.push(cum[i] + segs[i]); }
  const total = cum[cum.length - 1];
  if (total < 1e-4) return;
  const pointAt = (t) => {
    const d = t * total;
    let i = 0;
    while (i < segs.length - 1 && cum[i + 1] < d) i++;
    return add(path[i], mul(sub(path[i + 1], path[i]), segs[i] > 1e-9 ? (d - cum[i]) / segs[i] : 0));
  };
  const pts = [];
  for (let i = 0; i <= N; i++) pts.push(pointAt(i / N));
  const tang = pts.map((p, i) => norm(sub(pts[Math.min(N, i + 1)], pts[Math.max(0, i - 1)])));

  let lat = cross(tang[0], latRef);
  if (len(lat) < 1e-5) lat = cross(tang[0], V(1, 0, 0));
  lat = norm(lat);
  const R = [];
  for (let i = 0; i <= N; i++) {
    lat = norm(sub(lat, mul(tang[i], dot(lat, tang[i]))));
    const t = i / N;
    R.push({ c: pts[i], w: splineAt(rings.map((r) => [r[0], r[1]]), t), d: splineAt(rings.map((r) => [r[0], r[2]]), t),
      lat, dep: norm(cross(tang[i], lat)),
      lobes: lobes.map((L) => [L.at, splineAt(L.amps, t), L.spread]).filter((L) => L[1] > 0.004) });
  }
  const gr = grain(tone);
  const pt = (g, i) => {
    const a = (i / sides) * Math.PI * 2;
    let k = 1;
    if (g.lobes) {
      const deg = a * 180 / Math.PI;
      for (const [at, amp, spread] of g.lobes) {
        const dd = ((deg - at + 540) % 360) - 180;
        k += amp * Math.exp(-(dd / spread) * (dd / spread));
      }
    }
    return add(g.c, add(mul(g.lat, Math.cos(a) * g.w * k), mul(g.dep, Math.sin(a) * g.d * k)));
  };
  for (let k = 0; k < N; k++) {
    const A = R[k], B = R[k + 1], axisPt = mul(add(A.c, B.c), 0.5);
    for (let i = 0; i < sides; i++) face(cam, [pt(A, i), pt(A, i + 1), pt(B, i + 1), pt(B, i)], tone, out, axisPt, floorY, gr);
  }
  for (const [g, o2] of [[R[0], R[1]], [R[N], R[N - 1]]]) {
    const refPt = sub(g.c, mul(sub(g.c, o2.c), 0.4));   // inside the body, so the cap faces out
    for (let i = 0; i < sides; i += 2) face(cam, [g.c, pt(g, i), pt(g, i + 1), pt(g, i + 2)], tone, out, refPt, floorY, gr);
  }
}

/** A pulley: a disc on an axle. Two rims and a grooved face, built as a two-ring loft. */
function disc(cam, c, axis, r, thick, tone, out, floorY) {
  const ax = norm(axis);
  let lat = cross(ax, V(0, 1, 0));
  if (len(lat) < 1e-5) lat = cross(ax, V(1, 0, 0));
  lat = norm(lat);
  const dep = norm(cross(ax, lat));
  loft(cam, [{ c: add(c, mul(ax, -thick / 2)), w: r, d: r }, { c: add(c, mul(ax, thick / 2)), w: r, d: r }],
    lat, dep, tone, out, floorY, 12);
}

/**
 * A round limb, in screen space — the outline of a projected capsule is exact there, and it keeps
 * a bone pointing at the lens as a disc of the right size rather than a needle. Three overlapping
 * strips give it the roundness a single flat fill throws away, and each carries its own highlight.
 */
function tube(cam, a, b, r0, r1, tone, out, floorY) {
  const A = cam.project(a), B = cam.project(b);
  const ao = floorAO((a.y + b.y) / 2, floorY) * grain(tone);
  let dx = B.u - A.u, dy = B.v - A.v;
  const L = Math.hypot(dx, dy);
  const Lc = inCamera(cam, LIGHT);
  if (L < 1e-4) {
    out.push({ kind: 'circle', c: { x: A.u, y: A.v }, r: Math.max(r0, r1), depth: (A.d + B.d) / 2, tone,
      light: (AMBIENT + DIFFUSE * Math.max(0, Lc.d)) * ao, spec: specularCamera(Lc, 0, 0, 1, tone) });
    return;
  }
  dx /= L; dy /= L;
  const nx = -dy, ny = dx;
  const side = Lc.u * nx + Lc.v * ny;
  const sgn = side >= 0 ? 1 : -1;

  const strip = (offset, scale, c) => {
    const nd = Math.sqrt(Math.max(0, 1 - c * c));
    const S = 10;
    const oa = { u: A.u + nx * offset * r0, v: A.v + ny * offset * r0 };
    const ob = { u: B.u + nx * offset * r1, v: B.v + ny * offset * r1 };
    const at = (P, r, phi) => ({ x: P.u + (nx * Math.cos(phi) + dx * Math.sin(phi)) * r,
                                 y: P.v + (ny * Math.cos(phi) + dy * Math.sin(phi)) * r });
    const pts = [at(oa, r0 * scale, 0)];
    for (let i = 0; i <= S; i++) pts.push(at(ob, r1 * scale, (i / S) * Math.PI));
    for (let i = 0; i <= S; i++) pts.push(at(oa, r0 * scale, Math.PI + (i / S) * Math.PI));
    out.push({ kind: 'poly', pts, depth: (A.d + B.d) / 2 + offset * 0.02, tone,
      light: (AMBIENT + DIFFUSE * Math.max(0, side * c + Lc.d * nd)) * ao,
      spec: specularCamera(Lc, nx * c, ny * c, nd, tone) });
  };
  strip(0, 1, 0);
  strip(-sgn * 0.42, 0.58, -sgn * 0.78);
  strip(sgn * 0.40, 0.46, sgn * 0.86);
}

/** A joint, or a head. Same treatment so it reads as a ball and not a coin. */
function ball(cam, c, r, tone, out, squashDir, squash, floorY) {
  const C = cam.project(c);
  const Lc = inCamera(cam, LIGHT);
  const ao = floorAO(c.y, floorY) * grain(tone);
  const L2 = Math.hypot(Lc.u, Lc.v) || 1;
  const ux = Lc.u / L2, uy = Lc.v / L2;
  let ax = 1, ay = 0, bx = 0, by = 1, rx = r, ry = r;
  if (squashDir) {
    const D = inCamera(cam, squashDir);
    const m = Math.hypot(D.u, D.v) || 1;
    ax = D.u / m; ay = D.v / m; bx = -ay; by = ax;
    rx = r * squash; ry = r;
  }
  const poly = (cx, cy, sx, sy, light, nu, nv, nd) => {
    const pts = [];
    for (let i = 0; i < 26; i++) {
      const t = (i / 26) * Math.PI * 2, ca = Math.cos(t) * sx, sa = Math.sin(t) * sy;
      pts.push({ x: cx + ax * ca + bx * sa, y: cy + ay * ca + by * sa });
    }
    out.push({ kind: 'poly', pts, depth: C.d + (light > 0.8 ? 0.03 : 0.01), tone,
      light: light * ao, spec: specularCamera(Lc, nu, nv, nd, tone) });
  };
  poly(C.u, C.v, rx, ry, AMBIENT + DIFFUSE * Math.max(0, Lc.d), 0, 0, 1);
  poly(C.u + ux * r * 0.37, C.v + uy * r * 0.37, rx * 0.50, ry * 0.50, AMBIENT + DIFFUSE * 0.80, ux * 0.5, uy * 0.5, 0.866);
  poly(C.u - ux * r * 0.44, C.v - uy * r * 0.44, rx * 0.54, ry * 0.54, AMBIENT + DIFFUSE * 0.10, -ux * 0.8, -uy * 0.8, 0.6);
}

/** A soft dark patch on the floor. Grounding, and cheap. */
function patch(cam, centre, rx, rz, y, strength, out, rings = 3) {
  for (let k = 0; k < rings; k++) {
    const g = 1 + k * 0.5, pts = [];
    for (let i = 0; i < 28; i++) {
      const t = (i / 28) * Math.PI * 2;
      const P = cam.project(V(centre.x + Math.cos(t) * rx * g, y, centre.z + Math.sin(t) * rz * g));
      pts.push({ x: P.u, y: P.v });
    }
    out.push({ kind: 'poly', pts, depth: -1e6 + k, tone: 'shadow', light: 1, spec: 0, alpha: strength * (1 - k * 0.32) });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   CAST SHADOWS

   ⛔ THE ONLY SHADOW IN THE SCENE WAS A BLUR ON THE FLOOR, and it was the same blur whatever the
   athlete was doing. An arm cast nothing on the chest, a man sitting cast nothing on the seat he
   was sitting in, and a rep could run end to end without one shadow moving. Contact shading told
   you a foot was NEAR the floor; nothing told you a body was in front of a pad.

   These are real: every caster's silhouette is projected along the light onto a bounded plane,
   clipped to that plane's rectangle, and drawn where it lands. It is exact for a flat receiver —
   which the floor, the seat and the back pad all are — and it costs one convex hull per caster.

   Per-caster alpha is deliberately low. Overlapping shadows then build a darker core where many
   parts stack, which is not how light works but is very close to how a penumbra looks, and it
   beats the alternative of one flat slab of grey.
   ═════════════════════════════════════════════════════════════════════════ */

/** Sutherland–Hodgman against the receiver's own rectangle. */
function clipRect(poly, hu, hv) {
  const edges = [
    [(p) => p.x <= hu, (a, b) => (hu - a.x) / (b.x - a.x)],
    [(p) => p.x >= -hu, (a, b) => (-hu - a.x) / (b.x - a.x)],
    [(p) => p.y <= hv, (a, b) => (hv - a.y) / (b.y - a.y)],
    [(p) => p.y >= -hv, (a, b) => (-hv - a.y) / (b.y - a.y)],
  ];
  let cur = poly;
  for (const [ok, cut] of edges) {
    const next = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i], b = cur[(i + 1) % cur.length];
      const ain = ok(a), bin = ok(b);
      if (ain) next.push(a);
      if (ain !== bin) {
        const t = cut(a, b);
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    cur = next;
    if (cur.length < 3) return [];
  }
  return cur;
}

/**
 * @param receivers  [{ p, n, u, v, hu, hv, strength, fade }] — n points AT the light side.
 */
function castShadows(cam, casters, receivers, out) {
  setKeyFor(cam);
  for (const R of receivers) {
    const denom = dot(LIGHT, R.n);
    if (Math.abs(denom) < 0.16) continue;               // light skimming the plane: no honest shadow
    if (dot(R.n, cam.dir) <= 0) continue;               // and we are behind it anyway
    for (const part of casters) {
      const cs = corners(part);
      if (!cs) continue;
      const flat = [];
      let tSum = 0, bad = false;
      for (const X of cs) {
        const t = dot(sub(X, R.p), R.n) / denom;
        if (t <= 0.4) { bad = true; break; }             // on or under the surface: casts nothing
        const d = sub(sub(X, mul(LIGHT, t)), R.p);
        flat.push({ x: dot(d, R.u), y: dot(d, R.v) });
        tSum += t;
      }
      if (bad || flat.length < 3) continue;
      const poly = clipRect(hull(flat), R.hu, R.hv);
      if (poly.length < 3) continue;
      const drop = tSum / cs.length;
      const alpha = (R.strength == null ? 0.15 : R.strength) * Math.max(0, 1 - drop / (R.fade || 90));
      if (alpha < 0.012) continue;
      const Q = poly.map((q) => cam.project(add(R.p, add(mul(R.u, q.x), mul(R.v, q.y)))));
      out.push({ kind: 'poly', pts: Q.map((r) => ({ x: r.u, y: r.v })),
        depth: Q.reduce((a, r) => a + r.d, 0) / Q.length + 0.07,
        tone: 'shadow', light: 1, spec: 0, alpha });
    }
  }
}

/** Turn a list of solid descriptors into flat, depth-carrying polygons. */
function tessellate(cam, parts, opts = {}) {
  setKeyFor(cam);
  const out = [], F = opts.floorY;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    PART_I = i; FACE_I = 0;                             // grain is keyed here, not to a running count
    if (p.k === 'box') obox(cam, p.c, V(p.h[0], 0, 0), V(0, p.h[1], 0), V(0, 0, p.h[2]), p.tone, out, F, p.bevel);
    else if (p.k === 'obox') obox(cam, p.c, p.U, p.V, p.W, p.tone, out, F, p.bevel);
    else if (p.k === 'frustum') frustum(cam, p.a, p.b, p.ref || V(0, 0, 1), p.w0, p.d0, p.w1, p.d1, p.tone, out, F);
    else if (p.k === 'loft') loft(cam, p.rings, p.lat, p.dep, p.tone, out, F, p.sides);
    else if (p.k === 'limb') limb(cam, p.a, p.b, p.prof, p.r, p.ratio, p.ref, p.tone, out, F);
    else if (p.k === 'chain') limbPath(cam, p.path, p.prof, p.r, p.ratio, p.ref, p.tone, out, F);
    else if (p.k === 'body') bodyPath(cam, p.path, p.rings, p.lobes || [], p.latRef || V(0, 0, 1), p.tone, out, F, p.sides);
    else if (p.k === 'disc') disc(cam, p.c, p.axis, p.r, p.thick, p.tone, out, F);
    else if (p.k === 'tube' || p.k === 'rod') tube(cam, p.a, p.b, p.r0 != null ? p.r0 : p.r, p.r1 != null ? p.r1 : (p.r0 != null ? p.r0 : p.r), p.tone, out, F);
    else if (p.k === 'ball') ball(cam, p.c, p.r, p.tone, out, p.squashDir, p.squash, F);
    else if (p.k === 'shadow') patch(cam, p.c, p.rx, p.rz, p.y, p.strength == null ? 0.5 : p.strength, out, p.rings);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   WHAT THE SOLVER COULD NOT SEE

   ⛔ THE CAMERA SOLVER SCORED THE SKELETON AND NOTHING ELSE, so it could rate a view perfect
   while a frame upright stood squarely across the athlete's chest. Every machine fix so far was
   made by hand, by looking — which does not survive being repeated across a catalogue.

   This measures it. Sample points down every bone, project them, and ask whether any piece of
   hardware NEARER TO THE LENS covers them. The answer is a fraction the solver subtracts, so a
   camera that hides the man loses on the scoreboard rather than in review.
   ═════════════════════════════════════════════════════════════════════════ */

const HELD = new Set(['grip']);   // he is holding it; overlap there is the point, not a fault

function hull(points) {
  const p = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const half = (src) => {
    const h = [];
    for (const q of src) {
      while (h.length >= 2) {
        const a = h[h.length - 2], b = h[h.length - 1];
        if ((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x) > 0) break;
        h.pop();
      }
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(p), ...half(p.reverse())];
}

/**
 * ⛔ THIS TEST WAS INVERTED, AND THE WHOLE CLEARANCE METRIC HAS BEEN DEAD SINCE THE DAY IT WAS
 * WRITTEN. `hull` builds a COUNTER-CLOCKWISE polygon — its monotone chain keeps left turns — and
 * this asked the clockwise question, so an interior point failed on the very first edge and every
 * sample in every rig came back visible. `clearance` reported a confident 1.000 for a camera with
 * a weight stack standing squarely between the lens and the athlete, and for a bare slab the size
 * of a door planted in front of him.
 *
 * Every machine occlusion fixed so far was found BY EYE and credited to a term that was returning
 * a constant. A metric that cannot fail is not a metric, and it should have been tested against a
 * deliberate obstruction on the day it was added — which is now the first thing check.js does.
 */
function inside(h, x, y) {
  if (h.length < 3) return false;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < -1e-9) return false;
  }
  return true;
}

/** Corner points of a solid, enough to bound its silhouette. */
function corners(p) {
  if (p.k === 'box') {
    const o = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
      o.push(V(p.c.x + a * p.h[0], p.c.y + b * p.h[1], p.c.z + c * p.h[2]));
    }
    return o;
  }
  if (p.k === 'obox') {
    const o = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
      o.push(add(p.c, add(add(mul(p.U, a), mul(p.V, b)), mul(p.W, c))));
    }
    return o;
  }
  if (p.k === 'frustum') {
    const ax = norm(sub(p.b, p.a));
    let W = cross(ax, p.ref || V(0, 0, 1));
    if (len(W) < 1e-5) W = cross(ax, V(1, 0, 0));
    W = norm(W);
    const D = norm(cross(ax, W)), o = [];
    for (const [e, w, d] of [[p.a, p.w0, p.d0], [p.b, p.w1, p.d1]]) {
      for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) o.push(add(e, add(mul(W, s1 * w), mul(D, s2 * d))));
    }
    return o;
  }
  if (p.k === 'body') {
    const rmax = Math.max(...p.rings.map((r) => Math.max(r[1], r[2]))) * 1.25, o = [];
    for (const e of p.path) {
      for (const d of [V(rmax, 0, 0), V(-rmax, 0, 0), V(0, rmax, 0), V(0, -rmax, 0), V(0, 0, rmax), V(0, 0, -rmax)]) o.push(add(e, d));
    }
    return o;
  }
  if (p.k === 'chain') {
    const rmax = p.r * Math.max(...p.prof.map((q) => q[1])), o = [];
    for (const e of p.path) {
      for (const d of [V(rmax, 0, 0), V(-rmax, 0, 0), V(0, rmax, 0), V(0, -rmax, 0), V(0, 0, rmax), V(0, 0, -rmax)]) o.push(add(e, d));
    }
    return o;
  }
  if (p.k === 'limb') {
    const rmax = p.r * Math.max(...p.prof.map((q) => q[1]));
    const o = [];
    for (const e of [p.a, p.b]) {
      for (const d of [V(rmax, 0, 0), V(-rmax, 0, 0), V(0, rmax, 0), V(0, -rmax, 0), V(0, 0, rmax), V(0, 0, -rmax)]) o.push(add(e, d));
    }
    return o;
  }
  if (p.k === 'tube' || p.k === 'rod') {
    const r = (p.r != null ? p.r : Math.max(p.r0, p.r1 == null ? p.r0 : p.r1));
    const o = [];
    for (const e of [p.a, p.b]) {
      for (const d of [V(r, 0, 0), V(-r, 0, 0), V(0, r, 0), V(0, -r, 0), V(0, 0, r), V(0, 0, -r)]) o.push(add(e, d));
    }
    return o;
  }
  if (p.k === 'ball') {
    return [V(p.r, 0, 0), V(-p.r, 0, 0), V(0, p.r, 0), V(0, -p.r, 0), V(0, 0, p.r), V(0, 0, -p.r)].map((d) => add(p.c, d));
  }
  if (p.k === 'loft') {
    const o = [];
    for (const g of p.rings) {
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        o.push(add(g.c, add(mul(p.lat, Math.cos(t) * g.w), mul(p.dep, Math.sin(t) * g.d))));
      }
    }
    return o;
  }
  if (p.k === 'disc') {
    const o = [];
    for (const d of [V(p.r, 0, 0), V(-p.r, 0, 0), V(0, p.r, 0), V(0, -p.r, 0), V(0, 0, p.r), V(0, 0, -p.r)]) o.push(add(p.c, d));
    return o;
  }
  return null;                                        // balls and shadows never occlude usefully
}

/** Build a clearance test for one rig: (cam, poses) → fraction of the athlete left visible. */
function makeClearance(rig) {
  const BONES = [['shoulderR', 'elbowR'], ['elbowR', 'wristR'], ['shoulderL', 'elbowL'], ['elbowL', 'wristL'],
    ['pelvis', 'chest'], ['chest', 'head'], ['shoulderL', 'shoulderR'],
    ['hipR', 'kneeR'], ['kneeR', 'ankleR'], ['hipL', 'kneeL'], ['kneeL', 'ankleL']];
  /* ⛔ FIVE SAMPLES A BONE COULD NOT SEE A CABLE. A routed cable is a unit wide; sampled that
     coarsely the athlete's silhouette is a sieve and thin hardware slips between the points, so
     the metric returned a confident 1.000 while a cable ran across his chest. The cost is linear
     and the whole sweep still takes under a second. */
  const STEPS = 14;
  return function clearance(cam, poses) {
    let seen = 0, total = 0;
    for (const pose of poses) {
      const blockers = [];
      for (const part of rig.stationAt(pose.rom)) {
        if (HELD.has(part.tone)) continue;
        const c = corners(part);
        if (!c) continue;
        const Q = c.map((q) => cam.project(q));
        blockers.push({ h: hull(Q.map((q) => ({ x: q.u, y: q.v }))), d: Math.max(...Q.map((q) => q.d)) });
      }
      for (const [a, b] of BONES) {
        const A = pose.j[a], B = pose.j[b];
        if (!A || !B) continue;
        for (let i = 0; i <= STEPS; i++) {
          const t = i / STEPS;
          const P = cam.project(V(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, A.z + (B.z - A.z) * t));
          total++;
          if (!blockers.some((k) => k.d > P.d && inside(k.h, P.u, P.v))) seen++;
        }
      }
    }
    return total ? seen / total : 1;
  };
}

module.exports = { tessellate, castShadows, setKeyFor, makeClearance, LIGHT, AMBIENT, DIFFUSE, MATERIAL, lambert, inCamera };
