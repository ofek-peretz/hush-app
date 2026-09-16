/**
 * HUSH MOTION 3D — THE SELECTORISED STATION.
 *
 * A seat, a pad, two guide rails with carriages, and a weight stack driven by a routed cable.
 * That is one machine, and it is roughly forty of the catalogue's exercises: chest press, shoulder
 * press, row, pulldown, curl, extension, fly — they differ in where the rails run and how the
 * athlete sits, not in what the hardware IS.
 *
 * ⛔ EVERY LESSON BELOW WAS PAID FOR ON ONE EXERCISE, AND WOULD HAVE BEEN PAID FOR AGAIN ON EACH
 * OF THE OTHERS. The first machine was a lat pulldown wearing a chest press's name; its supports
 * landed on the athlete twice; its shroud ate its own weight stack; its cable connected nothing.
 * Fixing those in a file that only one exercise imports is how a system ends up with eighteen
 * hand-built rigs and no way to add a nineteenth.
 *
 * THE RULE THAT GOVERNS ALL OF IT: no machine member crosses the athlete. The frame reads because
 * its lines are horizontal and vertical while the body's are diagonal, and because every support
 * meets the floor out at the frame's own width.
 */
// @ts-nocheck

const { V, add, sub, mul, norm, len } = require('./core');
const { FLOOR } = require('./athlete');

const DEFAULTS = {
  side: 40,             // the frame's half-width — every support meets the floor out here
  stackX: -52,
  plateH: 2.6, pitch: 6.4, plateW: 9, plateD: 11,
  restingPlates: 7, liftedPlates: 5,
  seatC: V(4, 12.6, 0), seatH: [16.5, 2.2, 13.5],
  padThick: 2.2, padHalfLen: 27, padHalfW: 16, padOut: 13.4, padUp: 22,
  gripHalf: 8, gripR: 3.1,
};

/**
 * @param o.body      the seated athlete, for its pelvis / spine / back frame
 * @param o.rail      { top:{R,L}, bottom:{R,L} } — the two ends of the handle's path
 * @param o.handleAt  (rom, s) → where the hand is right now
 * @param o.railOff   (s) → offset from the hand to the carriage riding below/outboard of it
 */
function selectorised(o) {
  const c = { ...DEFAULTS, ...o };
  const { body, rail, handleAt } = c;
  const railOff = c.railOff || ((s) => V(0, 10, s * 6.5));
  const TRAVEL = len(sub(rail.top.R, rail.bottom.R));
  const { PELVIS, SPINE, BACK } = body;

  const padMid = add(add(PELVIS, mul(SPINE, c.padUp)), mul(BACK, c.padOut));
  const cushion = add(padMid, mul(BACK, -(c.padThick + 2.2)));

  /**
   * The flat things that catch shadows. Between them they carry every shadow that matters: the
   * floor under everything, the seat he is sitting in, and the pad his back is against — the last
   * being the one that makes him look like he is IN the machine rather than beside it.
   */
  const receivers = [
    { p: V(0, FLOOR, 0), n: V(0, -1, 0), u: V(1, 0, 0), v: V(0, 0, 1), hu: 96, hv: 58, strength: 0.15, fade: 130 },
    { p: V(c.seatC.x, c.seatC.y - c.seatH[1] - 4.4, 0), n: V(0, -1, 0), u: V(1, 0, 0), v: V(0, 0, 1),
      hu: c.seatH[0] - 1, hv: c.seatH[2] - 0.9, strength: 0.22, fade: 46 },
    { p: add(cushion, mul(BACK, -2.6)), n: mul(BACK, -1), u: SPINE, v: V(0, 0, 1),
      hu: c.padHalfLen - 1.5, hv: c.padHalfW - 1.4, strength: 0.20, fade: 52 },
  ];

  function partsAt(rom) {
    const P = [];
    const box = (ctr, h, tone) => P.push({ k: 'box', c: ctr, h, tone });
    const rod = (a, b, r, tone) => P.push({ k: 'rod', a, b, r, tone });
    const sheave = (ctr, axis, r) => P.push({ k: 'disc', c: ctr, axis, r, thick: r * 0.76, tone: 'rail' });

    /* ── base: skids and cross members. Gym steel is heavy section; thin rods read as scaffolding ── */
    for (const s of [1, -1]) box(V(-8, FLOOR - 3.4, s * c.side), [56, 3.4, 4.4], 'frame');
    box(V(46, FLOOR - 3.4, 0), [4.4, 3.4, c.side], 'frame');
    box(V(-62, FLOOR - 3.4, 0), [4.4, 3.4, c.side], 'frame');

    /* ── seat and back pad. Upholstery is a steel plate with a CUSHION proud of its face: one
       solid painted flat can be a seat or a slab of anything; two say what it is made of. ── */
    box(c.seatC, c.seatH, 'frame');
    box(V(c.seatC.x, c.seatC.y - 3.8, 0), [c.seatH[0] - 1, 2.6, c.seatH[2] - 0.9], 'pad');
    box(V(2, 31, 0), [5.5, 19, 5.5], 'frame');
    P.push({ k: 'obox', c: padMid, U: mul(BACK, c.padThick), V: mul(SPINE, c.padHalfLen), W: V(0, 0, c.padHalfW), tone: 'frame' });
    P.push({ k: 'obox', c: cushion, U: mul(BACK, 2.6), V: mul(SPINE, c.padHalfLen - 1.5), W: V(0, 0, c.padHalfW - 1.4), tone: 'pad' });
    rod(add(padMid, mul(SPINE, -(c.padHalfLen - 3))), V(-6, 16, 0), 3.6, 'frame');

    /* ── rails, carriages, grips and the cable that ties them to the load ── */
    for (const [k, s] of [['R', 1], ['L', -1]]) {
      const A = rail.bottom[k], B = rail.top[k];
      const u = norm(sub(B, A)), off = railOff(s);
      const railA = add(add(A, off), mul(u, -3));
      const railB = add(add(B, off), mul(u, 6));
      P.push({ k: 'obox', c: mul(add(railA, railB), 0.5),
        U: mul(u, len(sub(railB, railA)) / 2), V: V(0, 3, 0), W: V(0, 0, s * 3), tone: 'frame' });

      /* ONE leg per side, at the FRONT. Screen-u runs cos(az)·x − sin(az)·z, so on the near side
         pushing a support further out sideways drags it ACROSS the body and only moving it
         forward takes it clear. A second leg only ever doubled the crossing. */
      const legTop = V(railB.x, railB.y, s * c.side);
      rod(railB, legTop, 3, 'frame');
      P.push({ k: 'obox', c: mul(add(legTop, V(legTop.x, FLOOR - 6.8, legTop.z)), 0.5),
        U: V(4, 0, 0), V: V(0, (FLOOR - 6.8 - legTop.y) / 2, 0), W: V(0, 0, s * 4), tone: 'frame' });

      const H = handleAt(rom, s), car = add(H, off), ga = mul(norm(c.gripAxis || V(0, 1, 0)), c.gripHalf);
      box(car, [5, 5, 3.6], 'rail');
      rod(car, add(H, mul(ga, 1.38)), 2.3, 'rail');
      rod(sub(H, mul(ga, 1.38)), add(H, mul(ga, 1.38)), 1.9, 'rail');
      rod(sub(H, ga), add(H, ga), c.gripR, 'grip');

      /* The cable. Every leg axis-aligned, following the frame the way a real one does, and the
         long run back travels at the frame's full width so it clears the torso on screen. */
      const P1 = V(railA.x, car.y, car.z);
      const P2 = V(railA.x, FLOOR - 8, s * c.side);
      const P3 = V(c.stackX, FLOOR - 8, s * c.side);
      rod(car, P1, 1.15, 'cable'); rod(P1, P2, 1.15, 'cable');
      rod(P2, P3, 1.15, 'cable'); rod(P3, V(c.stackX, FLOOR - 8, 0), 1.15, 'cable');
      sheave(P1, V(0, 0, 1), 3.2); sheave(P2, V(0, 0, 1), 3.4); sheave(P3, V(0, 1, 0), 3.4);
    }

    /* ── the stack. ⛔ ITS FIRST SHROUD WAS A SOLID CHEEK EACH SIDE AND IT ATE THE PLATES — from
       any three-quarter camera they vanished behind a slab, taking with them the one part of the
       machine that MOVES and therefore the only thing saying a rep is under load. Four corner
       posts hold the same housing and hide nothing. ── */
    const X = c.stackX, lift = (1 - rom) * TRAVEL, top = -53;
    for (const a of [1, -1]) for (const b of [1, -1]) {
      box(V(X + a * 9.5, (FLOOR + top) / 2, b * 13), [2.2, (FLOOR - top) / 2, 2.2], 'frame');
    }
    for (const s of [1, -1]) rod(V(X, FLOOR - 4, s * 7), V(X, top + 3, s * 7), 1.6, 'rail');
    for (let i = 0; i < c.restingPlates; i++) box(V(X, FLOOR - 6 - i * c.pitch, 0), [c.plateW, c.plateH, c.plateD], 'plateOff');
    for (let i = 0; i < c.liftedPlates; i++) box(V(X, FLOOR - 51 - lift - i * c.pitch, 0), [c.plateW, c.plateH, c.plateD], 'plateOn');
    box(V(X, top, 0), [11, 3, 14], 'frame');
    box(V(X, FLOOR - 1.5, 0), [11, 3, 14], 'frame');
    rod(V(X, FLOOR - 8, 0), V(X, top + 6, 0), 1.15, 'cable');
    rod(V(X, top + 6, 0), V(X, FLOOR - 51 - lift, 0), 1.2, 'cable');
    sheave(V(X, top + 6, 0), V(0, 0, 1), 4.2); sheave(V(X, FLOOR - 8, 0), V(0, 0, 1), 3.8);
    return P;
  }

  return { partsAt, receivers, TRAVEL };
}

module.exports = { selectorised, DEFAULTS };
