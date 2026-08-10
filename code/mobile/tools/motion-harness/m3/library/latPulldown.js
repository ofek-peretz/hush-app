/**
 * lat_pulldown — the cable station.
 *
 * ⛔ EVERY CABLE SO FAR RAN BETWEEN FIXED POINTS. On the seated machines it followed the frame
 * from a carriage to a stack, and both ends of every leg were bolted down; the run from the
 * carriage was the only one that moved, and it moved along a rail. A cable station is different in
 * the one way that matters: ONE END IS IN HIS HANDS. The free run changes length AND direction
 * every frame, and the stack must rise by exactly the amount that run grows — which is not a
 * drawing decision, it is the machine's only law, and it is checked.
 */
// @ts-nocheck

const { V, add, sub, mul, norm, len } = require('../core');
const { ATH, FLOOR, STANDARD, reachFor, slerp, seated, placeArms } = require('../athlete');

const ELBOW_TOP = 172, ELBOW_BOTTOM = 44;
const OUT = 14;                                         // a wide bar, 1.74× shoulder width
const SHEAVE = V(46, -104, 0);                          // the high pulley, out in front of him

const body = seated({
  lean: 12, leanTop: 8, protract: 6,
  proDir: (s) => norm(V(0.22, -0.92, s * 0.32)),
  ankle: (rom, s) => V(40, FLOOR - 6.5, s * 13),
  toe: (rom, s) => V(55, FLOOR - 3, s * 13.5),
});
const GRIP_Z = ATH.shoulderHalf + OUT;

/** The bar is rigid, so the grip is absolute and only its centre gets a path. */
function barEnd(rom) {
  const S = body.shoulderAt(rom, 1);
  const dz = GRIP_Z - S.z;
  const reach = reachFor(rom === 0 ? ELBOW_TOP : ELBOW_BOTTOM);
  const fwd = rom === 0 ? 6 : 9;
  return V(S.x + fwd, S.y - Math.sqrt(reach * reach - dz * dz - fwd * fwd), 0);
}
const BAR = { top: barEnd(0), bottom: barEnd(1) };
const barAt = (rom) => add(BAR.top, mul(sub(BAR.bottom, BAR.top), rom));
const handleAt = (rom, s) => add(barAt(rom), V(0, 0, s * GRIP_Z));
const RAIL = { top: { R: handleAt(0, 1), L: handleAt(0, -1) },
               bottom: { R: handleAt(1, 1), L: handleAt(1, -1) } };

/** How much cable the athlete has pulled out of the tower — and therefore how far the stack rose. */
const drawnAt = (rom) => len(sub(barAt(rom), SHEAVE)) - len(sub(BAR.top, SHEAVE));

const poleAt = (rom, s) => slerp(norm(V(0.34, 0.10, s * 0.93)), norm(V(-0.18, 0.72, s * 0.67)), rom);

const GRIP_AXIS = V(0, 0, 1);
function poseAt(rom) {
  // rom 0 = hanging from the bar at full stretch; rom 1 = the bar pulled to the collarbone
  return { j: placeArms(body.jointsAt(rom), rom, handleAt, poleAt), rom, gripAxis: GRIP_AXIS };
}

function stationAt(rom) {
  const P = [];
  const box = (c, h, tone) => P.push({ k: 'box', c, h, tone });
  const rod = (a, b, r, tone) => P.push({ k: 'rod', a, b, r, tone });
  const sheave = (c, r) => P.push({ k: 'disc', c, axis: V(0, 0, 1), r, thick: r * 0.7, tone: 'rail' });

  /* seat, thigh pad and the frame under them */
  box(V(4, 12.6, 0), [15, 2.2, 13], 'frame');
  box(V(4, 8.8, 0), [14, 2.6, 12.1], 'pad');
  box(V(2, 31, 0), [5.5, 19, 5.5], 'frame');
  box(V(26, -12, 0), [11, 3.2, 18], 'pad');                       // the pad that holds him down
  /* ⛔ ITS POSTS STOOD AT z = ±13, WHICH IS INSIDE HIS OWN KNEES — the brace for a thigh pad ran
     straight down through the thighs it was bracing. Outboard of the legs, and thinner. */
  for (const s of [1, -1]) box(V(26, 2, s * 20), [2.6, 12, 2.6], 'frame');
  for (const s of [1, -1]) box(V(10, FLOOR - 3.4, s * 26), [56, 3.4, 4.4], 'frame');

  /* the tower: an upright out in front, its head carrying the sheave the bar hangs from */
  const X = SHEAVE.x, top = SHEAVE.y - 8;
  box(V(X + 9, (FLOOR + top) / 2, 0), [4.6, (FLOOR - top) / 2, 8], 'frame');
  box(V(X + 2, top, 0), [12, 4, 8], 'frame');
  box(V(X + 9, FLOOR - 3.4, 0), [14, 3.4, 26], 'frame');
  sheave(SHEAVE, 6.5);

  /* the stack, hung on the far side of the upright and rising with what he has pulled out */
  const SX = X + 20, lift = drawnAt(rom), stop = top + 6, PITCH = 6.4;
  for (const a of [1, -1]) for (const b of [1, -1]) {
    box(V(SX + a * 9.5, (FLOOR + stop) / 2, b * 13), [2.2, (FLOOR - stop) / 2, 2.2], 'frame');
  }
  for (const s of [1, -1]) rod(V(SX, FLOOR - 4, s * 7), V(SX, stop + 3, s * 7), 1.6, 'rail');
  for (let i = 0; i < 7; i++) box(V(SX, FLOOR - 6 - i * PITCH, 0), [9, 2.6, 11], 'plateOff');
  for (let i = 0; i < 5; i++) box(V(SX, FLOOR - 51 - lift - i * PITCH, 0), [9, 2.6, 11], 'plateOn');
  box(V(SX, stop, 0), [11, 3, 14], 'frame');
  sheave(V(SX, stop + 7, 0), 5);
  rod(V(SX, stop + 7, 0), V(SX, FLOOR - 51 - lift, 0), 1.2, 'cable');
  rod(V(X, top - 1, 0), V(SX, stop + 7, 0), 1.2, 'cable');
  rod(SHEAVE, V(X, top - 1, 0), 1.2, 'cable');

  /* and the run that is actually in his hands */
  rod(SHEAVE, barAt(rom), 1.3, 'cable');

  const c = barAt(rom), lat = V(0, 0, 1), at = (z) => add(c, mul(lat, z));
  P.push({ k: 'rod', a: at(-40), b: at(40), r: 1.7, tone: 'rail' });
  for (const s of [1, -1]) {
    P.push({ k: 'rod', a: at(s * 38), b: add(at(s * 48), V(0, -8, 0)), r: 1.7, tone: 'rail' });
    P.push({ k: 'rod', a: sub(at(s * GRIP_Z), V(0, -9, 0)), b: add(at(s * GRIP_Z), V(0, -9, 0)), r: 3.1, tone: 'grip' });
  }
  return P;
}

const RECEIVERS = [
  { p: V(0, FLOOR, 0), n: V(0, -1, 0), u: V(1, 0, 0), v: V(0, 0, 1), hu: 100, hv: 62, strength: 0.16, fade: 150 },
  { p: V(4, 6.2, 0), n: V(0, -1, 0), u: V(1, 0, 0), v: V(0, 0, 1), hu: 14, hv: 12.1, strength: 0.22, fade: 46 },
];

module.exports = {
  id: 'lat_pulldown',
  title: 'משיכת פולי עליון',
  poseAt,
  stationAt,
  handleAt,
  pressAxis: V(0, 1, 0),                                // the work is DOWN
  barbell: true,                                        // a lat bar is as rigid as any barbell
  cableFrom: SHEAVE,
  cableAt: barAt,                                       // it clips to the bar's centre, not a hand
  drawnAt,
  ...STANDARD,
  form: {
    topElbow: [150, 178], bottomElbow: [36, 56],
    topGrip: [1.5, 2.0], bottomGrip: [1.5, 2.0],
    axisShare: [0.6, 1.0],
    handTravel: [26, 50],
  },
  RECEIVERS,
  ATH, FLOOR, RAIL, TRAVEL: len(sub(RAIL.top.R, RAIL.bottom.R)),
};
