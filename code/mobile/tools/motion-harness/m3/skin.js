/**
 * HUSH MOTION 3D — THE FIGURE.
 *
 * The athlete is described as SOLIDS in space and handed to `solids.js` to be lit and flattened.
 * Nothing here knows about the screen, and nothing here decides draw order.
 *
 * ⛔ THE FIGURE USED TO BE A FLAT RIBBON FOR A TORSO AND SEVEN UNSHADED CAPSULES. It read as cut
 * paper because it was: a single six-point polygon spanning hip to shoulder has no front and no
 * back, so it cannot turn, and a capsule painted one value has no roundness to lose. What makes
 * a body read is MASS — a pelvis and a ribcage are two blocks joined at a narrow waist, and the
 * shoulders are a yoke laid across the top of the second one. Give those their real widths and
 * depths and the silhouette does the rest.
 */
// @ts-nocheck

const { V, add, sub, mul, norm, len, cross, dot } = require('./core');

/**
 * A HAND, GRIPPING.
 *
 * ⛔ THE FIST WAS A BALL ON THE END OF THE FOREARM and the bar ran straight through it. At any
 * size the eye reads that as a limb ENDING at a handle, not a hand HOLDING one — and holding is
 * the entire relationship between an athlete and a machine.
 *
 * Four fingers wrap the bar from the palm side round to the far side, the thumb closes the other
 * way, and the palm is a block set against the near face. The geometry is built from the bar's
 * own axis, so the grip stays correct wherever the handle goes and whatever angle it is at.
 */
function handSolids(j, k, gripAxis, out) {
  const W = j['wrist' + k], E = j['elbow' + k];
  const a = norm(gripAxis);
  let r = sub(norm(sub(W, E)), mul(a, dot(norm(sub(W, E)), a)));   // forearm, flattened off the bar
  r = len(r) < 1e-4 ? V(1, 0, 0) : norm(r);
  const sd = norm(cross(a, r));
  const RB = 3.1;                                                  // the bar the hand is on
  const at = (ang, rad, h) => add(add(add(W, mul(r, Math.cos(ang) * rad)), mul(sd, Math.sin(ang) * rad)), mul(a, h));

  out.push({ k: 'obox', c: add(W, mul(r, RB + 1.8)),
    U: mul(r, 1.8), V: mul(a, 5.4), W: mul(sd, 3.2), tone: 'limb', bevel: 0.7 });
  for (let i = 0; i < 4; i++) {
    const h = -4.0 + i * 2.7;
    const k0 = at(0.30, RB + 1.7, h), k1 = at(1.30, RB + 1.5, h), k2 = at(2.20, RB + 1.0, h);
    out.push({ k: 'tube', a: k0, b: k1, r0: 1.5, r1: 1.35, tone: 'limb' });
    out.push({ k: 'tube', a: k1, b: k2, r0: 1.35, r1: 1.15, tone: 'limb' });
  }
  out.push({ k: 'tube', a: at(-0.45, RB + 1.6, 4.8), b: at(-1.45, RB + 1.3, 2.6), r0: 1.75, r1: 1.4, tone: 'limb' });
}

/**
 * Body dimensions. Girths are absolute; the trunk profile is a FRACTION of the trunk's length,
 * so changing the athlete's proportions cannot leave the silhouette behind.
 *
 * ⛔ THE PROFILES BELOW ARE THE DIFFERENCE BETWEEN A MANNEQUIN AND AN ATHLETE. Every limb used to
 * be a cone: one radius at the root, a smaller one at the tip, straight between. No arm is that
 * shape. Each now carries its belly where the muscle actually is — biceps a third down, forearm
 * thickest just below the elbow, calf high and almost nothing at the ankle — and the trunk flares
 * at the lats and cuts at the waist instead of running smoothly from hip to shoulder.
 */
const BODY = {
  shoulderR: 5.9, elbowR: 4.6, hipR: 6.3, kneeR: 5.8, fistR: 4.7,
  neck: [4.8, 4.2], headR: 7.4, headLong: 1.36,
  footW: [4.2, 4.7], footD: [4.8, 2.7],
  yokeR: 5.4, deltR: 7.3,

  /**
   * WHOLE-LIMB profiles: t runs shoulder → elbow → wrist (and hip → knee → ankle) along ONE
   * swept surface, so the deltoid, the biceps belly, the elbow's narrowing and the forearm are
   * all the same skin. The joint fractions are where the bones actually divide: 29/52.5 for the
   * arm, 40/80 for the leg.
   */
  /**
   * ⛔ THE ARM STARTED AT THE SHOULDER JOINT AND THERE WAS A HOLE WHERE HIS SHOULDER SHOULD BE.
   * The joint sits 19 units off the centre line and the trunk's widest section reaches 13, so six
   * units of nothing ran down each side — with the arms overhead it read as two planks floating
   * beside a skittle. A yoke bar used to paper over it and was removed for looking like a plank
   * of its own, which fixed the symptom and left the cause.
   *
   * A deltoid does not begin at the shoulder joint. It originates INBOARD, on the clavicle and the
   * scapula, and it travels with the arm — so the sweep now starts inside the ribcage, swells over
   * the joint, and the trunk closes around its root. There is no gap because there is no join.
   */
  armRootIn: 0.42,                                       // how far toward the chest the sweep starts
  arm: { r: 5.9, ratio: 0.90, prof: [[0, 0.60], [0.135, 1.31], [0.24, 1.19], [0.40, 1.02],
    [0.53, 0.87], [0.613, 0.80], [0.70, 0.94], [0.85, 0.70], [1, 0.50]] },
  leg: { r: 8.4, ratio: 0.92, prof: [[0, 0.82], [0.13, 0.99], [0.33, 0.92], [0.45, 0.74],
    [0.50, 0.70], [0.61, 0.85], [0.80, 0.57], [1, 0.42]] },
  thigh: { r: 8.4, ratio: 0.92 },
  pec: { r: 6.4, ratio: 0.40, prof: [[0, 0.62], [0.42, 1.0], [0.78, 0.92], [1, 0.60]] },

  /**
   * ONE SURFACE FROM HIP TO CROWN, swept along a spine that is allowed to BEND at the neck.
   * `t` is the fraction of the pelvis→crown path. Lobes are declared separately, each with a fixed
   * angle and spread and an amplitude that varies along t — the front of the body is 270°, so a
   * pectoral is the pair at 236 and 304 and the lats are the pair at 52 and 128.
   */
  torsoRings: [
    /* ⛔ THE FIRST RING WAS THE FULL WIDTH OF HIS HIPS AND ITS END CAP WAS A FLAT DISC. Upright it
       points at the floor and is never seen; hinged over a dumbbell it turns to face the camera
       and reads as a white slab bolted to his lower back. A body is closed with a taper, not a
       lid — so the sweep now runs a little further past the pelvis and shuts down to nothing. */
    [0.000, 7.4, 5.6], [0.045, 9.6, 7.2], [0.100, 10.9, 8.1], [0.190, 8.9, 6.5],
    [0.290, 11.4, 8.0], [0.400, 12.6, 8.6], [0.490, 13.0, 8.7], [0.575, 12.6, 8.4],
    [0.645, 10.6, 7.0], [0.695, 8.2, 6.6], [0.740, 5.4, 5.0], [0.780, 5.2, 4.8],
    [0.820, 7.3, 6.7], [0.878, 8.1, 7.6], [0.946, 7.3, 6.9], [1.000, 3.4, 3.2],
  ],
  torsoLobes: [
    { at: 52, spread: 46, amps: [[0.22, 0], [0.40, 0.13], [0.53, 0.06], [0.65, 0]] },
    { at: 128, spread: 46, amps: [[0.22, 0], [0.40, 0.13], [0.53, 0.06], [0.65, 0]] },
    { at: 236, spread: 34, amps: [[0.26, 0], [0.42, 0.15], [0.51, 0.20], [0.61, 0.10], [0.67, 0]] },
    { at: 304, spread: 34, amps: [[0.26, 0], [0.42, 0.15], [0.51, 0.20], [0.61, 0.10], [0.67, 0]] },
  ],
  /**
   * The shorts. ⛔ THE FIRST SET CLEARED THE SKIN BY A QUARTER OF A UNIT and the leg poked through
   * it in stripes — two co-axial lofts of nearly equal radius, each made of flat facets, will
   * always interpenetrate somewhere. Cloth stands OFF a body; the margin is now a unit and a half,
   * which is both what a garment does and what flat-faceted geometry needs.
   */
  kitProfile: [
    /* ⛔ I TAPERED THE WRONG END. The taper went on t = +0.335, which is the WAISTBAND, so the
       shorts pinched shut at the top; and the trunk's own sweep ran on past the bottom edge and
       narrowed to 3.2 — exactly the gap between the thighs — leaving a pale spur protruding below
       the hem. Read from behind or in front it was obscene, and it was on a figure meant to be the
       face of the product. Shorts are WIDE at the waist and they reach DOWN past the crotch. */
    [-0.34, 9.0, 7.2], [-0.26, 10.6, 8.2], [-0.15, 11.7, 8.9],
    [0.045, 12.8, 9.6], [0.20, 12.1, 9.0], [0.31, 11.0, 8.2],
  ],
};

/** Every solid the athlete is made of, at one pose. */
function figureSolids(pose) {
  const j = pose.j;
  const out = [];
  const spine = norm(sub(j.chest, j.pelvis));

  /* ── the trunk: one lofted body, hip to shoulder, and the yoke across the top ──
     ⛔ IT USED TO BE TWO SQUARE BLOCKS BUTTED AT THE WAIST, and the join showed as a hard step —
     two flat faces meeting at slightly different angles, each carrying its own lambert value. A
     body has no seam there. One loft through the profile below, ten-sided, has no join to show
     and no corners to catch the light wrong. */
  const lat = norm(sub(j.shoulderR, j.shoulderL));
  const dep = norm(cross(spine, lat));
  const trunkLen = len(sub(j.chest, j.pelvis));
  /* pelvis → chest → crown. The last leg may point somewhere else entirely: a hinged lifter
     extends his neck so his head stays level while his trunk is nearly horizontal. */
  const crown = add(j.head, mul(norm(sub(j.head, j.chest)), BODY.headR * 1.30));
  out.push({ k: 'body', tone: 'trunk', sides: 22, latRef: lat,
    path: [add(j.pelvis, mul(spine, -4.5)), j.chest, crown],   // stops inside the shorts
    rings: BODY.torsoRings, lobes: BODY.torsoLobes });
  /* ⛔ THE SHOULDER YOKE IS GONE. It was a bar drawn between the two shoulder joints, from back
     when the trunk was a flat ribbon with no shoulders of its own. The trunk now carries traps in
     its own section and each arm opens with a deltoid, so the yoke added nothing but width — and
     from the front, with the arms overhead and the deltoids up at the bar, it was left standing
     alone across his chest like a plank he was carrying. */

  /* ── neck and head ──
     The head carries a flat facial plane. Without it the head is an egg, and an egg does not
     say which way a man is facing — which for a demonstration is not a detail: it is the
     difference between a press and a row. A wooden mannequin solves it the same way, with one
     flat facet and no features at all. */
  const headDir = norm(sub(j.head, j.chest));
  const face = norm(cross(V(0, 0, 1), headDir));    // out of the face, square to the NECK
  out.push({ k: 'obox', c: add(j.head, mul(face, BODY.headR * 0.60)),
    U: mul(face, 0.8), V: mul(headDir, BODY.headR * 0.44), W: V(0, 0, BODY.headR * 0.36), tone: 'face' });

  /* ── the shorts, over the hips and the top of the thighs ──
     Not decoration. A figure with no kit reads as an anatomical model; a figure with kit reads as
     a man in a gym, and that is the register a demonstration wants. It also breaks the single
     unrelieved value that ran from ankle to skull. */
  out.push({ k: 'loft', lat, dep, tone: 'kit', sides: 10,
    rings: BODY.kitProfile.map(([t, w, d]) => ({ c: add(j.pelvis, mul(spine, t * trunkLen)), w, d })) });


  /* ── limbs, each ONE continuous surface from root to tip ──
     ⛔ THEY USED TO BE FOUR SOLIDS APIECE — a ball for the deltoid, a cone, a ball for the elbow,
     another cone — jammed into one another, and every join a visible seam. At three-quarters it
     passed; the moment a camera looked straight on, the body read as parts rather than as a body.
     A swept path has no join to show, because there is no join. */
  for (const s of ['L', 'R']) {
    out.push({ k: 'chain', path: [j['hip' + s], j['knee' + s], j['ankle' + s]],
      ...BODY.leg, ref: lat, tone: 'limb' });
    /* the short's leg, over the top of the thigh — a hip-only kit is invisible from every camera
       that has a seat in it, which is every camera a seated exercise has */
    out.push({ k: 'limb', a: add(j['hip' + s], mul(sub(j['knee' + s], j['hip' + s]), -0.12)),
      b: add(j['hip' + s], mul(sub(j['knee' + s], j['hip' + s]), 0.44)),
      prof: [[0, 1.02], [0.35, 1.14], [0.78, 1.11], [1, 1.02]],
      r: BODY.thigh.r, ratio: BODY.thigh.ratio, ref: lat, tone: 'kit' });
    out.push({ k: 'frustum', a: j['ankle' + s], b: j['toe' + s], ref: V(0, 1, 0),
      w0: BODY.footW[0], d0: BODY.footD[0], w1: BODY.footW[1], d1: BODY.footD[1], tone: 'limb' });
  }
  for (const s of ['L', 'R']) {
    const S = j['shoulder' + s];
    const root = add(S, mul(sub(j.chest, S), BODY.armRootIn));
    out.push({ k: 'chain', path: [root, S, j['elbow' + s], j['wrist' + s]],
      ...BODY.arm, ref: lat, tone: 'limb' });
    if (pose.gripAxis) handSolids(j, s, pose.gripAxis, out);
    else out.push({ k: 'ball', c: j['wrist' + s], r: BODY.fistR, tone: 'limb' });
  }
  return out;
}

module.exports = { figureSolids, handSolids, BODY };
