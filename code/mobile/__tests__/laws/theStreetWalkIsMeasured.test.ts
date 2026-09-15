/**
 * ════ ⛔ THE STREET WALK IS MEASURED — AND THE CHAIR STILL IS NOT ════
 *
 * FOUNDER, 2026-09-15: *"בפעם האחרונה שעשיתי קרדיו בחוץ זה לא הראה לי את המטרים שאני עושה."*
 *
 * The gates judged one-second segments, which at a walk are mostly jitter, and a single loose fix
 * cleared the chain. On the traces below the old code credited a street walk ~63%, a walk between
 * tall buildings 0–11%, a city walk with turns ~41%. The fix and its measurements are written at
 * `noiseFloorM` in cardioMath.
 *
 * These traces go through the REAL `ingestFix` — the same path the foreground watcher and the
 * background task use — so a regression anywhere in the chain shows up here, not only in the maths.
 *
 * ⚠️ BOTH HALVES ARE THE LAW. A change that raises the walks by letting the chair through fails the
 * second block; a change that re-tightens the chair by zeroing walks fails the first. The founder's
 * ruling from 2026-07-12 stands: a stationary phone reads 0.00 km.
 */
// @ts-nocheck

jest.mock('@/platform/notifications', () => ({ notifier: { kilometre: async () => {} } }));

import { beginRun, endRun, ingestFix, setPaused, snapshot } from '@/platform/cardio/cardioRun';

const T0 = Date.parse('2026-09-15T06:00:00.000Z');
const M_LAT = 111_320;
const M_LON = 111_320 * Math.cos((32 * Math.PI) / 180);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const fix = (north, east, i, acc, sp) => ({
  lat: 32 + north / M_LAT,
  lon: 34.8 + east / M_LON,
  tsMs: T0 + i * 1000,
  accuracyM: acc,
  speedMs: sp,
});

/** A straight line with correlated position jitter, loose accuracy, and dropped Doppler — a real receiver. */
function straight(o, seed) {
  const r = rng(seed);
  const out = [];
  let jx = 0;
  let jy = 0;
  for (let i = 0; i <= 600; i++) {
    jx = jx * 0.7 + gauss(r) * o.jitterM * 0.7;
    jy = jy * 0.7 + gauss(r) * o.jitterM * 0.7;
    const acc = o.accLo + r() * (o.accHi - o.accLo);
    const sp = r() < o.invalidSpeedP ? -1 : Math.max(0, o.speed + gauss(r) * o.speedNoise);
    out.push(fix(o.speed * i + jy, jx, i, acc, sp));
  }
  out.truthKm = (o.speed * 600) / 1000;
  return out;
}
const STREET_WALK = { speed: 1.4, jitterM: 3, speedNoise: 0.4, accLo: 8, accHi: 18, invalidSpeedP: 0.08 };
// Accuracy up to 35 m: some fixes are over the 30 m cap — the case that used to clear the chain.
const CANYON_WALK = { speed: 1.4, jitterM: 5, speedNoise: 0.6, accLo: 12, accHi: 35, invalidSpeedP: 0.15 };
const CANYON_RUN = { speed: 3.3, jitterM: 5, speedNoise: 0.7, accLo: 12, accHi: 35, invalidSpeedP: 0.15 };

/** A city walk: a right or left turn every 40 s. */
function cityTurns(seed) {
  const r = rng(seed);
  const out = [];
  let n = 0;
  let e = 0;
  let dir = 0;
  let jx = 0;
  let jy = 0;
  for (let i = 0; i <= 600; i++) {
    if (i % 40 === 0) dir = (dir + (r() < 0.5 ? 1 : 3)) % 4;
    const [dn, de] = [[1, 0], [0, 1], [-1, 0], [0, -1]][dir];
    n += dn * 1.4;
    e += de * 1.4;
    jx = jx * 0.7 + gauss(r) * 3;
    jy = jy * 0.7 + gauss(r) * 3;
    out.push(fix(n + jy, e + jx, i, 8 + r() * 10, r() < 0.08 ? -1 : 1.4 + gauss(r) * 0.4));
  }
  out.truthKm = 0.84;
  return out;
}

/** Out 150 m and back, again and again — the shape that punishes a progress check hardest. */
function outAndBack(seed) {
  const r = rng(seed);
  const out = [];
  let n = 0;
  let dir = 1;
  let jx = 0;
  let jy = 0;
  for (let i = 0; i <= 600; i++) {
    n += dir * 1.4;
    if (n > 150 || n < 0) dir = -dir;
    jx = jx * 0.7 + gauss(r) * 2.1;
    jy = jy * 0.7 + gauss(r) * 2.1;
    out.push(fix(n + jy, jx, i, 8 + r() * 10, r() < 0.08 ? -1 : Math.max(0, 1.4 + gauss(r) * 0.4)));
  }
  out.truthKm = 0.84;
  return out;
}

/** A walk with a 40 s wait at a light every two minutes. */
function stopAndGo(seed) {
  const r = rng(seed);
  const out = [];
  let n = 0;
  let jx = 0;
  let jy = 0;
  for (let i = 0; i <= 900; i++) {
    const waiting = i % 120 >= 80;
    const sp = waiting ? 0 : 1.4;
    n += sp;
    jx = jx * 0.7 + gauss(r) * 2.1;
    jy = jy * 0.7 + gauss(r) * 2.1;
    out.push(fix(n + jy, jx, i, 8 + r() * 10, r() < 0.08 ? -1 : Math.max(0, sp + gauss(r) * (waiting ? 0.15 : 0.4))));
  }
  out.truthKm = n / 1000;
  return out;
}

/**
 * THE CHAIR, as adversarial as it gets: WiFi trilateration hopping between reference points, with a
 * "speed" differentiated from the hops — the lie the founder's 0.07 km came from.
 */
function chair(seed) {
  const r = rng(seed);
  const refs = [[0, 0], [22, 8], [-12, 25], [30, -15], [-25, -10]];
  const out = [];
  let cur = refs[0];
  let untilHop = 3;
  let sp = 0;
  for (let i = 0; i <= 900; i++) {
    if (--untilHop <= 0) {
      const prev = cur;
      cur = refs[Math.floor(r() * refs.length)];
      untilHop = 3 + Math.floor(r() * 4);
      sp = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) / 3;
    }
    sp *= 0.8;
    out.push(fix(cur[0] + gauss(r), cur[1] + gauss(r), i, 12 + r() * 16, sp));
  }
  return out;
}
/** A harsher room: half an hour, hops of 10–50 m every 2–7 s, accuracy 8–30 m. */
function wideChair(seed) {
  const r = rng(seed);
  const out = [];
  let cur = [0, 0];
  let untilHop = 2;
  let sp = 0;
  for (let i = 0; i <= 1800; i++) {
    if (--untilHop <= 0) {
      const prev = cur;
      const a = r() * 2 * Math.PI;
      const d = 10 + r() * 40;
      cur = [Math.sin(a) * d, Math.cos(a) * d];
      untilHop = 2 + Math.floor(r() * 5);
      sp = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) / 2.5;
    }
    sp *= 0.85;
    out.push(fix(cur[0] + gauss(r) * 2, cur[1] + gauss(r) * 2, i, 8 + r() * 22, sp));
  }
  return out;
}
/** What iOS actually hands a WiFi fix: no Doppler at all. */
const withoutDoppler = (trace) => trace.map((f) => ({ ...f, speedMs: -1 }));

function creditedKm(trace) {
  endRun();
  beginRun(75);
  setPaused(false);
  for (const f of trace) ingestFix(f);
  const km = snapshot().distanceKm;
  endRun();
  return km;
}
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ratios = (gen) => SEEDS.map((s) => {
  const t = gen(s);
  return creditedKm(t) / t.truthKm;
});

afterEach(() => endRun());

describe('a real walk outdoors reads the metres it covered', () => {
  const cases = [
    ['a street walk', (s) => straight(STREET_WALK, s), 0.85],
    ['a walk between tall buildings, with fixes over the cap', (s) => straight(CANYON_WALK, s), 0.6],
    ['a run between tall buildings', (s) => straight(CANYON_RUN, s), 0.85],
    ['a city walk with a turn every 40 s', cityTurns, 0.55],
    ['an out-and-back walk', outAndBack, 0.7],
    ['a walk that waits at lights', stopAndGo, 0.7],
  ];
  it.each(cases)('%s', (_name, gen, floor) => {
    const r = ratios(gen);
    expect(median(r)).toBeGreaterThanOrEqual(floor);
    // …and never invents distance the athlete did not cover.
    expect(Math.max(...r)).toBeLessThanOrEqual(1.1);
  });
});

describe('and a phone that does not move still reads nothing', () => {
  it('the WiFi-hopping chair, with lying Doppler, stays under the 0.05 km the summary would show', () => {
    for (const s of SEEDS) expect(creditedKm(chair(s))).toBeLessThan(0.05);
  });
  it('the harsher room, half an hour of wide hops, stays under 0.05 km', () => {
    for (const s of SEEDS) expect(creditedKm(wideChair(s))).toBeLessThan(0.05);
  });
  it('a chair as iOS really reports it — no Doppler — reads exactly 0.00', () => {
    for (const s of SEEDS) {
      expect(creditedKm(withoutDoppler(chair(s)))).toBe(0);
      expect(creditedKm(withoutDoppler(wideChair(s)))).toBe(0);
    }
  });
});
