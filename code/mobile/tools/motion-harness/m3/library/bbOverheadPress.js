/**
 * bb_overhead_press — the first exercise with no machine at all.
 *
 * It shares the athlete and every check with the two seated machines, and shares NOTHING of the
 * station: there is no seat, no rail, no stack and no cable. What it needs instead is a bar, a
 * floor to stand on, and the standing posture.
 *
 * ⛔ AND ONE THING THAT IS TRUE OF EVERY FREE-WEIGHT LIFT AND OF NO MACHINE: BOTH HANDS ARE ON THE
 * SAME OBJECT. A machine gives each arm its own carriage on its own rail, so a rig can place the
 * hands independently and the geometry forgives it. A barbell cannot: if the two hands do not stay
 * collinear and level, the bar is bent. That is now a check of its own, because nothing else in
 * the system would have noticed.
 */
// @ts-nocheck

const { V, add, sub, mul, norm, len } = require('../core');
const { ATH, FLOOR, STANDARD, reachFor, slerp, standing, placeArms } = require('../athlete');

const ELBOW_TOP = 168, ELBOW_BOTTOM = 52;
const OUT = 8;                                          // hands just outside the shoulders

const body = standing({ lean: 6, leanTop: 2, protract: 5 });

/**
 * ⛔ THE HANDS WERE PLACED RELATIVE TO THE SHOULDER, AND THE BAR CAME OUT 2.7 UNITS LONGER AT ONE
 * END OF THE REP THAN THE OTHER. The shoulder drifts sideways as it shrugs — which is correct, and
 * harmless on a machine where each arm owns its own carriage — but a barbell is rigid, so a grip
 * that rides that drift is a grip that stretches steel. THE GRIP IS AN ABSOLUTE COORDINATE.
 *
 * And because the bar is rigid, its PATH is the thing that gets authored and the elbow angle is an
 * OUTCOME to be checked — the reverse of a machine, where the cue drives the reach. The path is a
 * shallow arc, not a chord: a press that goes straight up hits the chin, and the real bar clears
 * the face on the way and finishes over the ears. The arc is also what keeps the elbow monotonic.
 */
const GRIP_Z = ATH.shoulderHalf + OUT;                  // fixed: a bar does not widen
function barEnd(rom) {
  const S = body.shoulderAt(rom, 1);
  const dz = GRIP_Z - S.z;
  const reach = reachFor(rom === 0 ? ELBOW_TOP : ELBOW_BOTTOM);
  return rom === 0
    ? V(S.x - 3, S.y - Math.sqrt(reach * reach - dz * dz - 9), 0)
    : V(S.x + Math.sqrt(reach * reach - dz * dz - 4), S.y + 2, 0);
}
const BAR = { top: barEnd(0), bottom: barEnd(1) };
const ARC = 9.5;   // how far forward the bar bows mid-path — swept, not guessed: below 9 the
                   // elbow re-opens mid-rep, because a shallower path lets the reach grow again
const barAt = (rom) => {
  const b = add(BAR.top, mul(sub(BAR.bottom, BAR.top), rom));
  return V(b.x + ARC * Math.sin(Math.PI * rom), b.y, 0);
};
const handleAt = (rom, s) => add(barAt(rom), V(0, 0, s * GRIP_Z));
const RAIL = { top: { R: handleAt(0, 1), L: handleAt(0, -1) },
               bottom: { R: handleAt(1, 1), L: handleAt(1, -1) } };

/* Racked, the elbows are UNDER the bar and forward; overhead they finish out to the sides. */
const poleAt = (rom, s) => slerp(norm(V(0.42, 0.10, s * 0.90)), norm(V(0.86, 0.44, s * 0.26)), rom);

const GRIP_AXIS = V(0, 0, 1);                           // the bar runs across him
function poseAt(rom) {
  // rom 0 = overhead lockout, rom 1 = the bar racked on the front of his shoulders
  return { j: placeArms(body.jointsAt(rom), rom, handleAt, poleAt), rom, gripAxis: GRIP_AXIS };
}

/**
 * The bar: a shaft, two knurled sleeves, and the plates the sleeves carry.
 *
 * ⛔ THE FIRST ONE WAS HALF THE LENGTH OF A BARBELL. It ran to ±54 with 22-unit plates, which at
 * this athlete's scale is a 113 cm bar carrying 23 cm discs — the plates sat against his shoulders
 * and it read as a toy. A competition bar is 220 cm with 45 cm plates; against a 40 cm shoulder
 * width that is ±104 and a radius of 21, and the size of it is a large part of why a barbell lift
 * looks like one.
 */
function stationAt(rom) {
  const P = [];
  const c = barAt(rom);
  const lat = V(0, 0, 1);
  const at = (z) => add(c, mul(lat, z));
  P.push({ k: 'rod', a: at(-72), b: at(72), r: 1.9, tone: 'rail' });
  for (const s of [1, -1]) {
    P.push({ k: 'rod', a: at(s * 70), b: at(s * 104), r: 3.0, tone: 'rail' });
    P.push({ k: 'disc', c: at(s * 73), axis: lat, r: 4.2, thick: 2.0, tone: 'rail' });   // collar
    for (let i = 0; i < 3; i++) {
      P.push({ k: 'disc', c: at(s * (78 + i * 5.4)), axis: lat, r: 21 - i * 1.2, thick: 4.4, tone: 'plateOn' });
    }
    P.push({ k: 'disc', c: at(s * 99), axis: lat, r: 5.2, thick: 2.6, tone: 'rail' });   // clip
  }
  return P;
}

/** Standing, the floor is the only thing a shadow can land on. */
const RECEIVERS = [
  { p: V(0, FLOOR, 0), n: V(0, -1, 0), u: V(1, 0, 0), v: V(0, 0, 1), hu: 90, hv: 70, strength: 0.16, fade: 150 },
];

module.exports = {
  id: 'bb_overhead_press',
  title: 'לחיצת כתפיים עם מוט',
  poseAt,
  stationAt,
  handleAt,
  pressAxis: V(0, -1, 0),
  barbell: true,                                        // both hands on one rigid object
  ...STANDARD,
  form: {
    topElbow: [150, 178], bottomElbow: [44, 64],
    topGrip: [1.2, 1.6], bottomGrip: [1.2, 1.6],
    axisShare: [0.6, 1.0],
    handTravel: [45, 75],
  },
  RECEIVERS,
  ATH, FLOOR, RAIL, TRAVEL: len(sub(RAIL.top.R, RAIL.bottom.R)),
};
