/**
 * HUSH MOTION 3D — THE ATHLETE.
 *
 * One man does all 123 exercises. His bones, his proportions and the way his joints solve belong
 * here and nowhere else, so that a fix to any of them is a fix to the whole catalogue at once.
 *
 * ⛔ THIS FILE EXISTS BECAUSE OF HOW THE 2D SYSTEM DIED. Every rig there authored its own body
 * from literal offsets, so a correction had to be made eighteen times and usually was not: by the
 * end its legs broke their own declared bone lengths and nobody knew, because there was no single
 * place where a leg was defined. Eighteen exercises was not a schedule problem. It was the ceiling
 * of an architecture where the athlete is copied instead of shared.
 *
 * An exercise supplies WHERE THE HANDS GO. It does not get to redefine the man holding them.
 */
// @ts-nocheck

const { V, add, sub, mul, norm, len, ik, R } = require('./core');

/**
 * Proportion, as a fraction of biacromial (shoulder) width — the one measurement that was already
 * right when the rest were audited, and the stable reference every other segment is quoted from.
 * The forearm carries the hand, because what reaches a handle is the fist, not the wrist.
 */
const SHOULDER_W = 38;
const RATIO = { torso: 1.18, neck: 0.45, upperArm: 0.76, foreArm: 0.62, thigh: 1.05, shank: 1.05 };
const ATH = {
  shoulderHalf: SHOULDER_W / 2,
  torso: 45, neck: 17, upperArm: 29, foreArm: 23.5, thigh: 40, shank: 40,
};
const FLOOR = 51;                                       // where the soles and every frame stand

/** The shoulder→hand distance that PRODUCES a given elbow angle — law of cosines on the arm. */
function reachFor(theta) {
  const l1 = ATH.upperArm, l2 = ATH.foreArm;
  return Math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(theta * R));
}

/**
 * ⛔ THE HEAD WAS ALWAYS IN LINE WITH THE SPINE, and upright that is invisible. Bent over a
 * barbell it means he is staring at the floor and the camera sees the crown of his skull end-on.
 * A person looks WHERE HE IS GOING: hinge the trunk and the neck extends to keep the head level.
 * `headTilt` is that extension, in degrees above the trunk's own angle.
 */
const tiltHead = (spine, deg) => {
  if (!deg) return spine;
  const a = deg * R, c = Math.cos(a), sn = Math.sin(a);
  return norm(V(spine.x * c - spine.y * sn, spine.x * sn + spine.y * c, spine.z));
};

/** Shortest arc between two directions. Poles and axes are interpolated with it, never lerped. */
function slerp(a, b, t) {
  const A = norm(a), B = norm(b);
  const d = Math.max(-1, Math.min(1, A.x * B.x + A.y * B.y + A.z * B.z));
  const w = Math.acos(d);
  if (w < 1e-4) return A;
  const s = Math.sin(w);
  return norm(V((Math.sin((1 - t) * w) * A.x + Math.sin(t * w) * B.x) / s,
                (Math.sin((1 - t) * w) * A.y + Math.sin(t * w) * B.y) / s,
                (Math.sin((1 - t) * w) * A.z + Math.sin(t * w) * B.z) / s));
}

/**
 * THE SEATED POSTURE. Pelvis at the origin, spine reclined, feet planted on the floor.
 *
 * The trunk is not rigid and the shoulders are not nailed down — both were, and the cost was a
 * hand that could only travel as far as one elbow's straightening allows, which read as bending
 * an arm rather than pressing. Scapular protraction and a few degrees of trunk drive are real
 * movement, and between them they are most of the last third of any press.
 *
 * The knee is placed by the same two-bone IK the arm uses, from an authored hip and an authored
 * foot, so leg bones cannot drift — the failure that went unnoticed for the whole life of the
 * previous system, because every check watched the arm.
 */
function seated(cfg = {}) {
  const c = {
    lean: 16, leanTop: 10, protract: 7,
    proDir: (s) => norm(V(0.97, 0, s * 0.24)),
    protractAt: (rom) => c.protract * (1 - rom),
    hip: (s) => V(2, 1, s * 10),
    ankle: (rom, s) => add(V(44, FLOOR - 6.5, s * 13), mul(V(-0.9, -1.7, 0), 1 - rom)),
    toe: (rom, s) => V(59, FLOOR - 3, s * 13.5),
    kneePole: (rom, s) => norm(V(0.78, -0.52 - 0.06 * (1 - rom), s * (0.22 + 0.07 * (1 - rom)))),
    shoulderDrop: 4.5,
    ...cfg,
  };
  if (cfg.protractAt) c.protractAt = cfg.protractAt;

  const PELVIS = V(0, 0, 0);
  const spineAt = (rom) => {
    const a = (c.leanTop + (c.lean - c.leanTop) * rom) * R;
    return norm(V(-Math.sin(a), -Math.cos(a), 0));
  };
  /* the static frame the MACHINE is built against — his deepest recline, where the pad is */
  const SPINE = spineAt(1);
  const BACK = V(-Math.cos(c.lean * R), Math.sin(c.lean * R), 0);

  const chestAt = (rom) => add(PELVIS, mul(spineAt(rom), ATH.torso));
  const headAt = (rom) => add(chestAt(rom), mul(tiltHead(spineAt(rom), c.headTilt), ATH.neck));
  const shoulderAt = (rom, s) => add(add(chestAt(rom), V(0, c.shoulderDrop, s * ATH.shoulderHalf)),
    mul(c.proDir(s), c.protractAt(rom)));

  const jointsAt = (rom) => {
    const j = { pelvis: PELVIS, chest: chestAt(rom), head: headAt(rom) };
    for (const [k, s] of [['R', 1], ['L', -1]]) {
      j['shoulder' + k] = shoulderAt(rom, s);
      j['hip' + k] = c.hip(s);
      j['ankle' + k] = c.ankle(rom, s);
      j['toe' + k] = c.toe(rom, s);
      j['knee' + k] = ik(j['hip' + k], j['ankle' + k], ATH.thigh, ATH.shank, c.kneePole(rom, s));
    }
    return j;
  };

  return { cfg: c, PELVIS, SPINE, BACK, spineAt, chestAt, headAt, shoulderAt, jointsAt };
}

/**
 * Put the arms on. `handleAt(rom, s)` is the exercise's whole contribution to the pose: where the
 * hand is. `poleAt(rom, s)` only picks a SIDE of the shoulder→hand axis — the IK finds the circle.
 */
function placeArms(j, rom, handleAt, poleAt) {
  for (const [k, s] of [['R', 1], ['L', -1]]) {
    const W = handleAt(rom, s);
    j['elbow' + k] = ik(j['shoulder' + k], W, ATH.upperArm, ATH.foreArm, poleAt(rom, s));
    j['wrist' + k] = W;
  }
  return j;
}

/** What every rig declares about itself, so the solver and the checks need no special cases. */
const STANDARD = {
  track: 'wristR',
  cues: [['shoulderR', 'elbowR', 'wristR'], ['shoulderL', 'elbowL', 'wristL']],
  pairs: [['wristR', 'wristL'], ['elbowR', 'elbowL']],
};

/**
 * THE STANDING POSTURE — and with it the whole free-weight half of the catalogue.
 *
 * The pelvis is no longer at the origin: it is wherever it has to be for the soles to reach the
 * floor with the knees carrying a real standing bend, which for these bones is 76.5 of an
 * available 80. Everything else follows from that, and `FLOOR` stays the one fact both postures
 * agree on.
 *
 * A standing lift also drives from the ground: the trunk extends a few degrees and the shoulders
 * shrug at lockout, the same way a seated press protracts, and for the same reason — it is real
 * range, and without it a barbell would move only as far as an elbow can straighten.
 */
function standing(cfg = {}) {
  const c = {
    lean: 6, leanTop: 2, protract: 5,
    proDir: (s) => norm(V(0.34, -0.90, s * 0.27)),
    hipY: -32,
    stance: 11,
    protractAt: (rom) => c.protract * (1 - rom),
    kneePole: (rom, s) => norm(V(0.96, -0.14, s * 0.08)),
    shoulderDrop: 4.5,
    ...cfg,
  };
  c.hip = c.hip || ((s) => V(0, c.hipY, s * 10));
  c.ankle = c.ankle || ((rom, s) => V(2, FLOOR - 6.5, s * c.stance));
  c.toe = c.toe || ((rom, s) => V(16, FLOOR - 3, s * (c.stance + 0.5)));

  const PELVIS = V(0, c.hipY, 0);
  const spineAt = (rom) => {
    const a = (c.leanTop + (c.lean - c.leanTop) * rom) * R;
    return norm(V(-Math.sin(a), -Math.cos(a), 0));
  };
  const SPINE = spineAt(1);
  const BACK = V(-Math.cos(c.lean * R), Math.sin(c.lean * R), 0);
  const chestAt = (rom) => add(PELVIS, mul(spineAt(rom), ATH.torso));
  const headAt = (rom) => add(chestAt(rom), mul(tiltHead(spineAt(rom), c.headTilt), ATH.neck));
  const shoulderAt = (rom, s) => add(add(chestAt(rom), V(0, c.shoulderDrop, s * ATH.shoulderHalf)),
    mul(c.proDir(s), c.protractAt(rom)));

  const jointsAt = (rom) => {
    const j = { pelvis: PELVIS, chest: chestAt(rom), head: headAt(rom) };
    for (const [k, s] of [['R', 1], ['L', -1]]) {
      j['shoulder' + k] = shoulderAt(rom, s);
      j['hip' + k] = c.hip(s);
      j['ankle' + k] = c.ankle(rom, s);
      j['toe' + k] = c.toe(rom, s);
      j['knee' + k] = ik(j['hip' + k], j['ankle' + k], ATH.thigh, ATH.shank, c.kneePole(rom, s));
    }
    return j;
  };
  return { cfg: c, PELVIS, SPINE, BACK, spineAt, chestAt, headAt, shoulderAt, jointsAt };
}

/**
 * THE LYING POSTURE — the bench, and with it every press and fly done on one.
 *
 * ⛔ THE SHOULDER OFFSET WAS A WORLD-Y VECTOR IN BOTH EARLIER POSTURES, and world-Y is only "down
 * the body" while the body is upright. Lying down it points through his ribs. It is taken along
 * −spine here, which is what it always meant: the shoulder joint sits a little way BACK DOWN the
 * trunk from the top of the chest, whichever way the trunk happens to be pointing.
 *
 * He lies head-toward −x, which puts the rack behind his head where a rack goes, and his feet are
 * planted on the floor beside the bench — a bench press drives through the floor, and legs folded
 * onto the pad would be a different exercise with the same name.
 */
function lying(cfg = {}) {
  const c = {
    lean: 6, leanTop: 6, protract: 4,                 // "lean" here is the trunk's tilt off flat
    proDir: (s) => norm(V(-0.20, -0.94, s * 0.28)),
    protractAt: (rom) => c.protract * (1 - rom),
    benchY: 8,
    hip: (s) => V(8, 0, s * 10),
    ankle: (rom, s) => V(58, FLOOR - 6.5, s * 16),
    toe: (rom, s) => V(72, FLOOR - 3, s * 16.5),
    kneePole: (rom, s) => norm(V(-0.16, -0.95, s * 0.27)),
    shoulderDrop: 4.5,
    ...cfg,
  };
  const PELVIS = V(0, 0, 0);
  const LAT = V(0, 0, 1);
  const spineAt = (rom) => {
    const a = (c.leanTop + (c.lean - c.leanTop) * rom) * R;
    return norm(V(-Math.cos(a), -Math.sin(a), 0));     // along the bench, head slightly raised
  };
  const SPINE = spineAt(1);
  const BACK = V(0, 1, 0);                             // his back is against the pad below him
  const chestAt = (rom) => add(PELVIS, mul(spineAt(rom), ATH.torso));
  const headAt = (rom) => add(chestAt(rom), mul(tiltHead(spineAt(rom), c.headTilt), ATH.neck));
  const shoulderAt = (rom, s) => add(add(chestAt(rom), mul(spineAt(rom), -c.shoulderDrop)),
    add(mul(LAT, s * ATH.shoulderHalf), mul(c.proDir(s), c.protractAt(rom))));

  const jointsAt = (rom) => {
    const j = { pelvis: PELVIS, chest: chestAt(rom), head: headAt(rom) };
    for (const [k, s] of [['R', 1], ['L', -1]]) {
      j['shoulder' + k] = shoulderAt(rom, s);
      j['hip' + k] = c.hip(s);
      j['ankle' + k] = c.ankle(rom, s);
      j['toe' + k] = c.toe(rom, s);
      j['knee' + k] = ik(j['hip' + k], j['ankle' + k], ATH.thigh, ATH.shank, c.kneePole(rom, s));
    }
    return j;
  };
  return { cfg: c, PELVIS, SPINE, BACK, spineAt, chestAt, headAt, shoulderAt, jointsAt };
}

/**
 * THE HINGED POSTURE — bent at the hip, and with it every row.
 *
 * `hinge` is the trunk's angle ABOVE HORIZONTAL, because that is the number a coach says and the
 * number a lifter can see: 0° is parallel to the floor, 90° is standing up. The hips travel BACK
 * as the trunk comes down — a hinge is not a bend, and a figure that folds without shifting its
 * weight back is one that would fall over.
 */
function hinged(cfg = {}) {
  const c = {
    hinge: 25, hingeTop: 25, protract: 6, headTilt: 42,
    proDir: (s) => norm(V(0.35, 0.90, s * 0.20)),      // hanging, the shoulders are protracted
    protractAt: (rom) => c.protract * (1 - rom),
    hipX: -10, hipY: -26.5, stance: 11,
    kneePole: (rom, s) => norm(V(0.94, -0.30, s * 0.14)),
    shoulderDrop: 4.5,
    ...cfg,
  };
  c.hip = c.hip || ((s) => V(c.hipX, c.hipY, s * 10));
  c.ankle = c.ankle || ((rom, s) => V(2, FLOOR - 6.5, s * c.stance));
  c.toe = c.toe || ((rom, s) => V(16, FLOOR - 3, s * (c.stance + 0.5)));

  const PELVIS = V(c.hipX, c.hipY, 0);
  const LAT = V(0, 0, 1);
  const spineAt = (rom) => {
    const a = (c.hingeTop + (c.hinge - c.hingeTop) * rom) * R;
    return norm(V(Math.cos(a), -Math.sin(a), 0));      // forward and up, out over the feet
  };
  const SPINE = spineAt(1);
  const BACK = norm(V(-Math.sin(c.hinge * R), -Math.cos(c.hinge * R), 0));
  const chestAt = (rom) => add(PELVIS, mul(spineAt(rom), ATH.torso));
  const headAt = (rom) => add(chestAt(rom), mul(tiltHead(spineAt(rom), c.headTilt), ATH.neck));
  const shoulderAt = (rom, s) => add(add(chestAt(rom), mul(spineAt(rom), -c.shoulderDrop)),
    add(mul(LAT, s * ATH.shoulderHalf), mul(c.proDir(s), c.protractAt(rom))));

  const jointsAt = (rom) => {
    const j = { pelvis: PELVIS, chest: chestAt(rom), head: headAt(rom) };
    for (const [k, s] of [['R', 1], ['L', -1]]) {
      j['shoulder' + k] = shoulderAt(rom, s);
      j['hip' + k] = c.hip(s);
      j['ankle' + k] = c.ankle(rom, s);
      j['toe' + k] = c.toe(rom, s);
      j['knee' + k] = ik(j['hip' + k], j['ankle' + k], ATH.thigh, ATH.shank, c.kneePole(rom, s));
    }
    return j;
  };
  return { cfg: c, PELVIS, SPINE, BACK, spineAt, chestAt, headAt, shoulderAt, jointsAt };
}

/**
 * THE HANGING POSTURE — and with it the whole bodyweight half of the catalogue.
 *
 * ⛔ EVERY POSTURE UNTIL NOW ANCHORED THE BODY AND MOVED THE HANDS. It was never stated because it
 * was never contradicted: the pelvis was a constant, the trunk grew from it, and an exercise
 * supplied where the hands went. A pull-up is the exact inverse — THE HANDS ARE BOLTED TO A BAR
 * AND THE MAN MOVES — and no amount of parameterising a fixed pelvis expresses that.
 *
 * So this one takes `originAt(rom)`: the rig computes where the body must BE for the arms to
 * reach a bar that is not going anywhere, and hands it back. And the feet are in the air, which
 * is the first time in eight exercises that `toe on the floor` has been the wrong assertion.
 */
function hanging(cfg = {}) {
  const c = {
    lean: 4, leanTop: 8, headTilt: 0, protract: 5,
    proDir: (s) => norm(V(0.10, -0.96, s * 0.26)),
    protractAt: (rom) => c.protract * (1 - rom),
    originAt: () => V(0, -40, 0),
    kneeBend: 26,                                      // the legs hang, knees a little folded
    shoulderDrop: 4.5,
    ...cfg,
  };
  const LAT = V(0, 0, 1);
  const spineAt = (rom) => {
    const a = (c.leanTop + (c.lean - c.leanTop) * rom) * R;
    return norm(V(-Math.sin(a), -Math.cos(a), 0));
  };
  const SPINE = spineAt(1), BACK = V(-1, 0, 0);
  const chestAt = (rom) => add(c.originAt(rom), mul(spineAt(rom), ATH.torso));
  const headAt = (rom) => add(chestAt(rom), mul(tiltHead(spineAt(rom), c.headTilt), ATH.neck));
  const shoulderAt = (rom, s) => add(add(chestAt(rom), V(0, c.shoulderDrop, s * ATH.shoulderHalf)),
    mul(c.proDir(s), c.protractAt(rom)));

  const jointsAt = (rom) => {
    const O = c.originAt(rom);
    const j = { pelvis: O, chest: chestAt(rom), head: headAt(rom) };
    const down = norm(V(0.16, 1, 0)), back = norm(V(-0.55, 1, 0));
    for (const [k, s] of [['R', 1], ['L', -1]]) {
      j['shoulder' + k] = shoulderAt(rom, s);
      j['hip' + k] = add(O, V(0, 1, s * 10));
      /* normalised, or the sideways splay silently lengthens the bone it is added to */
      j['knee' + k] = add(j['hip' + k], mul(norm(add(down, V(0, 0, s * 0.10))), ATH.thigh));
      j['ankle' + k] = add(j['knee' + k], mul(norm(add(back, V(0, 0, s * 0.04))), ATH.shank));
      j['toe' + k] = add(j['ankle' + k], V(-9, 12, s * 0.5));
    }
    return j;
  };
  return { cfg: c, PELVIS: c.originAt(0), SPINE, BACK, spineAt, chestAt, headAt, shoulderAt, jointsAt };
}

module.exports = { ATH, FLOOR, SHOULDER_W, RATIO, STANDARD, reachFor, slerp,
  seated, standing, lying, hinged, hanging, placeArms };
