/**
 * db_shoulder_press — the first exercise where the two hands are on DIFFERENT objects.
 *
 * ⚠ AND A CORRECTION TO SOMETHING I SAID: dumbbells do not, by themselves, break the mirror
 * assumption. Two of them pressed together are as symmetric as a barbell. What they break is the
 * opposite constraint — RIGIDITY. A barbell forces the hands to stay collinear and the same
 * distance apart; a pair of dumbbells forces neither, and the movement that results is one no
 * barbell can perform: the hands CONVERGE, from 1.16× shoulder width at the ears to well inside
 * that overhead.
 *
 * The mirror assumption is still intact and still checked. It breaks on the first UNILATERAL
 * exercise — a one-arm row — and that is a separate piece of work, not this one.
 */
// @ts-nocheck

const { V, add, sub, mul, norm, len } = require('../core');
const { ATH, FLOOR, STANDARD, reachFor, slerp, seated, placeArms } = require('../athlete');

const ELBOW_TOP = 168, ELBOW_BOTTOM = 64;
const GRIP = {
  top: { out: 3, fwd: 2 },        // the bells all but touch overhead
  bottom: { out: 12, fwd: 5 },    // and start wide, out by the ears
};

const body = seated({
  lean: 10, leanTop: 6, protract: 6,
  proDir: (s) => norm(V(0.14, -0.93, s * 0.33)),
  ankle: (rom, s) => add(V(38, FLOOR - 6.5, s * 14), mul(V(-0.7, -1.4, 0), 1 - rom)),
  toe: (rom, s) => V(53, FLOOR - 3, s * 14.5),
});

function handleEnd(rom, s) {
  const g = rom === 0 ? GRIP.top : GRIP.bottom;
  const reach = reachFor(rom === 0 ? ELBOW_TOP : ELBOW_BOTTOM);
  const up = Math.sqrt(reach * reach - g.out * g.out - g.fwd * g.fwd);
  return add(body.shoulderAt(rom, s), V(g.fwd, -up, s * g.out));
}
const RAIL = { top: { R: handleEnd(0, 1), L: handleEnd(0, -1) },
               bottom: { R: handleEnd(1, 1), L: handleEnd(1, -1) } };
const handleAt = (rom, s) => {
  const k = s > 0 ? 'R' : 'L';
  return add(RAIL.top[k], mul(sub(RAIL.bottom[k], RAIL.top[k]), rom));
};

const poleAt = (rom, s) => slerp(norm(V(0.50, 0.14, s * 0.86)), norm(V(0.26, 0.84, s * 0.48)), rom);

const GRIP_AXIS = V(0, 0, 1);                           // handles across, palms forward
function poseAt(rom) {
  // rom 0 = the bells pressed together overhead, rom 1 = down at the ears
  return { j: placeArms(body.jointsAt(rom), rom, handleAt, poleAt), rom, gripAxis: GRIP_AXIS };
}

/** A bench to sit on, and two dumbbells that go where the hands go. */
function stationAt(rom) {
  const P = [];
  const box = (c, h, tone) => P.push({ k: 'box', c, h, tone });

  box(V(4, 12.6, 0), [15, 2.2, 13], 'frame');
  box(V(4, 8.8, 0), [14, 2.6, 12.1], 'pad');
  box(V(2, 31, 0), [5.5, 19, 5.5], 'frame');
  const back = norm(V(-Math.cos(10 * Math.PI / 180), Math.sin(10 * Math.PI / 180), 0));
  const spine = body.SPINE;
  const mid = add(mul(spine, 20), mul(back, 12.6));
  P.push({ k: 'obox', c: mid, U: mul(back, 2.2), V: mul(spine, 22), W: V(0, 0, 14), tone: 'frame' });
  P.push({ k: 'obox', c: add(mid, mul(back, -4.4)), U: mul(back, 2.6), V: mul(spine, 20.5), W: V(0, 0, 12.8), tone: 'pad' });
  for (const s of [1, -1]) box(V(-6, FLOOR - 3.2, s * 20), [30, 3.2, 4.2], 'frame');

  /* the bells: a knurled handle with a stack of discs either side, on the hand's own axis */
  for (const s of [1, -1]) {
    const c = handleAt(rom, s), a = V(0, 0, 1), at = (t) => add(c, mul(a, t));
    P.push({ k: 'rod', a: at(-8), b: at(8), r: 2.0, tone: 'rail' });
    for (const e of [1, -1]) {
      P.push({ k: 'disc', c: at(e * 9.6), axis: a, r: 3.6, thick: 1.6, tone: 'rail' });
      for (let i = 0; i < 3; i++) {
        P.push({ k: 'disc', c: at(e * (12.4 + i * 3.4)), axis: a, r: 10.5 - i * 1.4, thick: 3.0, tone: 'plateOn' });
      }
    }
  }
  return P;
}

const RECEIVERS = [
  { p: V(0, FLOOR, 0), n: V(0, -1, 0), u: V(1, 0, 0), v: V(0, 0, 1), hu: 90, hv: 62, strength: 0.16, fade: 140 },
  { p: V(4, 6.2, 0), n: V(0, -1, 0), u: V(1, 0, 0), v: V(0, 0, 1), hu: 14, hv: 12.1, strength: 0.22, fade: 46 },
];

module.exports = {
  id: 'db_shoulder_press',
  title: 'לחיצת כתפיים עם משקולות יד',
  poseAt,
  stationAt,
  handleAt,
  pressAxis: V(0, -1, 0),
  converging: true,                                     // the hands may close: no bar joins them
  ...STANDARD,
  form: {
    topElbow: [150, 178], bottomElbow: [56, 76],
    topGrip: [1.0, 1.30], bottomGrip: [1.45, 1.85],
    axisShare: [0.6, 1.0],
    handTravel: [24, 44],
  },
  RECEIVERS,
  ATH, FLOOR, RAIL, TRAVEL: len(sub(RAIL.top.R, RAIL.bottom.R)),
};
