/**
 * db_row — one arm works, the other braces. THE FIRST EXERCISE THAT IS NOT SYMMETRIC.
 *
 * ⛔ THE WHOLE SYSTEM ASSUMED A MIRROR, AND MOST OF IT NEVER SAID SO. `placeArms` took one handle
 * function and one pole and applied them with s = ±1. `pairs` fed the solver's separation and
 * levelness terms, both of which are questions about a matched pair. The check asserted that every
 * joint on the right equals its twin on the left. None of that is wrong for the six exercises
 * before this one — and all of it is wrong for this one.
 *
 * What survives is the part that was actually general: `handleAt(rom, s)` was always allowed to
 * return something different per side. It simply never had. Here the right hand rows a dumbbell
 * and the left is planted on the knee, and the rig declares `unilateral` so the checks and the
 * solver ask the questions that still make sense instead of the ones that no longer do.
 */
// @ts-nocheck

const { V, add, sub, mul, norm, len } = require('../core');
const { ATH, FLOOR, reachFor, slerp, hinged, placeArms } = require('../athlete');

const ELBOW_TOP = 172, ELBOW_BOTTOM = 52;

const body = hinged({
  hinge: 32, hingeTop: 32, protract: 6, headTilt: 34,
  proDir: (s) => norm(V(0.30, 0.92, s * 0.24)),
  kneePole: (rom, s) => norm(V(0.92, -0.36, s * 0.16)),
});

/**
 * The working arm: hangs at full stretch, then drives the elbow back past the ribs.
 *
 * ⛔ THE BELL WAS 1.9 UNITS INSIDE HIS OWN THIGH and every check passed, because `clearance` asks
 * what the hardware HIDES from the camera and not what it passes THROUGH. It hangs 14 units
 * outboard now, which is where a one-arm row's dumbbell hangs anyway — outside the knee, not over
 * it. Swept: below 13 it bites, above 20 the offsets exceed the arm's own reach and the geometry
 * goes imaginary.
 */
function workingHand(rom) {
  const S = body.shoulderAt(rom, 1);
  const g = rom === 0 ? { out: 14, fwd: 1 } : { out: 14, fwd: -15 };
  const reach = reachFor(rom === 0 ? ELBOW_TOP : ELBOW_BOTTOM);
  return add(S, V(g.fwd, Math.sqrt(reach * reach - g.out * g.out - g.fwd * g.fwd), g.out));
}
const WORK = { top: workingHand(0), bottom: workingHand(1) };

/** The braced arm: planted on his own knee and going nowhere. That is the whole point of it. */
const BRACE = (() => {
  const k = body.jointsAt(0).kneeL;
  return V(k.x - 2, k.y - 7, k.z - 1);
})();

const handleAt = (rom, s) => (s > 0
  ? add(WORK.top, mul(sub(WORK.bottom, WORK.top), rom))
  : BRACE);

const poleAt = (rom, s) => (s > 0
  ? slerp(norm(V(0.34, 0.06, 0.94)), norm(V(-0.88, -0.26, 0.40)), rom)
  : norm(V(0.20, -0.10, -0.97)));

const GRIP_AXIS = V(0, 0, 1);
function poseAt(rom) {
  // rom 0 = the bell hanging at arm's length; rom 1 = rowed to the ribs
  return { j: placeArms(body.jointsAt(rom), rom, handleAt, poleAt), rom, gripAxis: GRIP_AXIS };
}

function stationAt(rom) {
  const P = [], c = handleAt(rom, 1), a = V(0, 0, 1), at = (t) => add(c, mul(a, t));
  P.push({ k: 'rod', a: at(-8), b: at(8), r: 2.0, tone: 'rail' });
  for (const e of [1, -1]) {
    P.push({ k: 'disc', c: at(e * 9.6), axis: a, r: 3.6, thick: 1.6, tone: 'rail' });
    for (let i = 0; i < 3; i++) {
      P.push({ k: 'disc', c: at(e * (12.4 + i * 3.4)), axis: a, r: 10.5 - i * 1.4, thick: 3.0, tone: 'plateOn' });
    }
  }
  return P;
}

const RECEIVERS = [
  { p: V(0, FLOOR, 0), n: V(0, -1, 0), u: V(1, 0, 0), v: V(0, 0, 1), hu: 100, hv: 70, strength: 0.16, fade: 150 },
];

module.exports = {
  id: 'db_row',
  title: 'חתירה עם משקולת יד',
  poseAt,
  stationAt,
  handleAt,
  pressAxis: V(0, -1, 0),
  unilateral: true,
  track: 'wristR',
  cues: [['shoulderR', 'elbowR', 'wristR']],            // only one arm is doing anything
  pairs: [],                                            // and there is no pair to separate or level
  form: {
    topElbow: [150, 178], bottomElbow: [42, 62],
    axisShare: [0.6, 1.0],
    handTravel: [28, 52],
  },
  RECEIVERS,
  ATH, FLOOR, RAIL: { top: { R: WORK.top }, bottom: { R: WORK.bottom } },
  TRAVEL: len(sub(WORK.top, WORK.bottom)),
};
