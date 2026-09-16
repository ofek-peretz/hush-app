/**
 * bb_bench_press — the lying posture's first exercise.
 *
 * Shares everything with the standing barbell press except which way the man is pointing: the bar
 * is still rigid, the grip is still an absolute coordinate, the path is still authored and the
 * elbow is still an outcome. That the same rules held when the athlete was rotated ninety degrees
 * is the only evidence that they were rules and not coincidences.
 */
// @ts-nocheck

const { V, add, sub, mul, norm, len } = require('../core');
const { ATH, FLOOR, STANDARD, reachFor, slerp, lying, placeArms } = require('../athlete');

const ELBOW_TOP = 170, ELBOW_BOTTOM = 48;
const OUT = 15;                                         // a competition-width grip, 1.79× shoulders
const BENCH_Y = 8;

const body = lying({ benchY: BENCH_Y });
const GRIP_Z = ATH.shoulderHalf + OUT;

function barEnd(rom) {
  const S = body.shoulderAt(rom, 1);
  const dz = GRIP_Z - S.z;
  const reach = reachFor(rom === 0 ? ELBOW_TOP : ELBOW_BOTTOM);
  const fwd = rom === 0 ? 3 : 7;                        // the bar tracks slightly toward the feet
  return V(S.x + fwd, S.y - Math.sqrt(reach * reach - dz * dz - fwd * fwd), 0);
}
const BAR = { top: barEnd(0), bottom: barEnd(1) };
/* Swept, like the overhead press: a shallower bow lets the reach grow again mid-rep and the elbow
   re-opens. A real bench bar arcs from the chest back over the shoulder, and this is that arc. */
const ARC = 5.5;
const barAt = (rom) => {
  const b = add(BAR.top, mul(sub(BAR.bottom, BAR.top), rom));
  return V(b.x - ARC * Math.sin(Math.PI * rom), b.y, 0);
};
const handleAt = (rom, s) => add(barAt(rom), V(0, 0, s * GRIP_Z));
const RAIL = { top: { R: handleAt(0, 1), L: handleAt(0, -1) },
               bottom: { R: handleAt(1, 1), L: handleAt(1, -1) } };

/* Off the chest the elbows are down and out, under the bar; at lockout they finish nearly stacked. */
const poleAt = (rom, s) => slerp(norm(V(-0.30, 0.16, s * 0.94)), norm(V(0.42, 0.30, s * 0.86)), rom);

const GRIP_AXIS = V(0, 0, 1);
function poseAt(rom) {
  // rom 0 = lockout, arms straight above the chest; rom 1 = the bar on the chest
  return { j: placeArms(body.jointsAt(rom), rom, handleAt, poleAt), rom, gripAxis: GRIP_AXIS };
}

/** The bench, its uprights, and the bar. */
function stationAt(rom) {
  const P = [];
  const box = (c, h, tone) => P.push({ k: 'box', c, h, tone });
  const rod = (a, b, r, tone) => P.push({ k: 'rod', a, b, r, tone });

  box(V(-26, BENCH_Y + 3.2, 0), [46, 3.2, 15.5], 'frame');       // the pad's steel plate
  box(V(-26, BENCH_Y - 1.4, 0), [45, 3.4, 14.6], 'pad');         // and the cushion on it
  for (const x of [-66, 12]) box(V(x, (FLOOR + BENCH_Y) / 2 + 3, 0), [4.2, (FLOOR - BENCH_Y) / 2 - 3, 4.2], 'frame');
  for (const x of [-70, 16]) box(V(x, FLOOR - 3.2, 0), [5, 3.2, 26], 'frame');   // the feet
  box(V(-27, FLOOR - 3.2, 0), [44, 3.2, 4.4], 'frame');          // spine of the base

  /* the rack: two uprights behind his head, with the hooks the bar came off */
  for (const s of [1, -1]) {
    box(V(-84, (FLOOR - 62) / 2, s * 30), [4.4, (FLOOR + 62) / 2, 4.4], 'frame');
    rod(V(-84, -58, s * 30), V(-74, -62, s * 30), 2.6, 'frame');
    box(V(-84, FLOOR - 3.2, s * 30), [12, 3.2, 5], 'frame');
  }

  const c = barAt(rom), lat = V(0, 0, 1), at = (z) => add(c, mul(lat, z));
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
  { p: V(-26, BENCH_Y - 4.8, 0), n: V(0, -1, 0), u: V(1, 0, 0), v: V(0, 0, 1),
    hu: 45, hv: 14.6, strength: 0.22, fade: 40 },
];

module.exports = {
  id: 'bb_bench_press',
  title: 'לחיצת חזה עם מוט',
  poseAt,
  stationAt,
  handleAt,
  pressAxis: V(0, -1, 0),
  barbell: true,
  ...STANDARD,
  form: {
    topElbow: [150, 178], bottomElbow: [40, 60],
    topGrip: [1.5, 2.0], bottomGrip: [1.5, 2.0],
    axisShare: [0.6, 1.0],
    handTravel: [26, 50],
  },
  RECEIVERS,
  ATH, FLOOR, RAIL, TRAVEL: len(sub(RAIL.top.R, RAIL.bottom.R)),
};
