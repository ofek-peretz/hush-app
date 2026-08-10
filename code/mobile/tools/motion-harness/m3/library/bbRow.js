/**
 * bb_row — the hinged posture's first exercise, and the first PULL in the library.
 *
 * Everything until now drove away from the body. A row comes back to it, which turns out to
 * change almost nothing in the machinery and one thing in the language: `pressAxis` is the
 * direction the WORK happens along, not the direction of a press, and for this it points up and
 * back along the trunk.
 */
// @ts-nocheck

const { V, add, sub, mul, norm, len } = require('../core');
const { ATH, FLOOR, STANDARD, reachFor, slerp, hinged, placeArms } = require('../athlete');

const ELBOW_TOP = 170, ELBOW_BOTTOM = 58;               // "top" is the hanging start of a row
const OUT = 5;                                          // 1.26× shoulder width

const body = hinged({ hinge: 32, hingeTop: 32, protract: 6, headTilt: 30 });
const GRIP_Z = ATH.shoulderHalf + OUT;

function barEnd(rom) {
  const S = body.shoulderAt(rom, 1);
  const dz = GRIP_Z - S.z;
  const reach = reachFor(rom === 0 ? ELBOW_TOP : ELBOW_BOTTOM);
  const fwd = rom === 0 ? -2 : -14;                     // it tucks back to the belly as it comes up
  return V(S.x + fwd, S.y + Math.sqrt(reach * reach - dz * dz - fwd * fwd), 0);
}
const BAR = { top: barEnd(0), bottom: barEnd(1) };
const ARC = 3;
const barAt = (rom) => {
  const b = add(BAR.top, mul(sub(BAR.bottom, BAR.top), rom));
  return V(b.x + ARC * Math.sin(Math.PI * rom), b.y, 0);
};
const handleAt = (rom, s) => add(barAt(rom), V(0, 0, s * GRIP_Z));
const RAIL = { top: { R: handleAt(0, 1), L: handleAt(0, -1) },
               bottom: { R: handleAt(1, 1), L: handleAt(1, -1) } };

/* Hanging, the elbow points straight down and slightly out; rowed, it drives back past the ribs. */
const poleAt = (rom, s) => slerp(norm(V(0.30, 0.06, s * 0.95)), norm(V(-0.86, -0.30, s * 0.41)), rom);

const GRIP_AXIS = V(0, 0, 1);
function poseAt(rom) {
  // rom 0 = the bar hanging at arm's length; rom 1 = the bar pulled to the belly
  return { j: placeArms(body.jointsAt(rom), rom, handleAt, poleAt), rom, gripAxis: GRIP_AXIS };
}

function stationAt(rom) {
  const P = [], c = barAt(rom), lat = V(0, 0, 1), at = (z) => add(c, mul(lat, z));
  P.push({ k: 'rod', a: at(-72), b: at(72), r: 1.9, tone: 'rail' });
  for (const s of [1, -1]) {
    P.push({ k: 'rod', a: at(s * 70), b: at(s * 104), r: 3.0, tone: 'rail' });
    P.push({ k: 'disc', c: at(s * 73), axis: lat, r: 4.2, thick: 2.0, tone: 'rail' });
    for (let i = 0; i < 3; i++) {
      P.push({ k: 'disc', c: at(s * (78 + i * 5.4)), axis: lat, r: 21 - i * 1.2, thick: 4.4, tone: 'plateOn' });
    }
    P.push({ k: 'disc', c: at(s * 99), axis: lat, r: 5.2, thick: 2.6, tone: 'rail' });
  }
  return P;
}

const RECEIVERS = [
  { p: V(0, FLOOR, 0), n: V(0, -1, 0), u: V(1, 0, 0), v: V(0, 0, 1), hu: 110, hv: 80, strength: 0.16, fade: 150 },
];

module.exports = {
  id: 'bb_row',
  title: 'חתירה עם מוט',
  poseAt,
  stationAt,
  handleAt,
  pressAxis: V(0, -1, 0),                               // the work is up, back along the trunk
  barbell: true,
  ...STANDARD,
  form: {
    topElbow: [150, 178], bottomElbow: [48, 68],
    topGrip: [1.1, 1.45], bottomGrip: [1.1, 1.45],
    axisShare: [0.6, 1.0],
    handTravel: [22, 46],
  },
  RECEIVERS,
  ATH, FLOOR, RAIL, TRAVEL: len(sub(RAIL.top.R, RAIL.bottom.R)),
};
