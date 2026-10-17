/**
 * Renders the 3D rig at its SOLVED camera, plus the sweep that chose it.
 *   node tools/motion-harness/m3/emit.js <out.html>
 */
// @ts-nocheck

const fs = require('fs');
const path = require('path');
const { camera, angle2, angle3, sub, add, mul, len, V } = require('./core');
const { tessellate, castShadows } = require('./solids');
const { figureSolids } = require('./skin');
const { bestCamera } = require('./solve');
const { get } = require('./library');
const ri = process.argv.indexOf('--rig');
const rig = get(ri > 0 ? process.argv[ri + 1] : undefined);

/* The camera comes from solve.js, the same call check.js and figure.js make. This file used to
   run its own copy of the elevation sweep, which is how a page can end up verifying a view the
   product never shows. */
const OPT = { floorY: rig.FLOOR };

const OUT = process.argv[2];
const FRAMES = 22;

/* Station and athlete speak one language now — solid descriptors — and one tessellator lights
   and flattens both. This file used to carry its own copy of the box-face code with hand-typed
   shade factors, which is exactly how the two drifted apart in the first place. */
const r1 = (n) => Math.round(n * 100) / 100;
function pack(p) {
  const o = { k: p.kind === "poly" ? "p" : "c", t: p.tone, d: r1(p.depth), sh: r1(p.light), sp: r1(p.spec || 0) };
  if (p.alpha != null) o.a = r1(p.alpha);
  if (p.kind === 'poly') o.v = p.pts.map((q) => [r1(q.x), r1(q.y)]).flat();
  else { o.v = [r1(p.c.x), r1(p.c.y)]; o.r = r1(p.r); }
  return o;
}

function build(cam) {
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const t = i / (FRAMES - 1);
    // one rep: out and back, so the loop shows both halves
    const rom = t < 0.5 ? t * 2 : (1 - t) * 2;
    const station = rig.stationAt(rom), figure = figureSolids(rig.poseAt(rom));
    const prims = tessellate(cam, [...station, ...figure], OPT);
    castShadows(cam, figure, rig.RECEIVERS, prims);
    castShadows(cam, station, [rig.RECEIVERS[0]], prims);
    prims.sort((a, b) => a.depth - b.depth);          // painter: far first
    frames.push(prims.map(pack));
  }
  return frames;
}

/* the drawn extent, so the page can frame it without guessing */
function bounds(frames) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const f of frames) for (const p of f) {
    if (p.k === 'c') { x0 = Math.min(x0, p.v[0] - p.r); x1 = Math.max(x1, p.v[0] + p.r); y0 = Math.min(y0, p.v[1] - p.r); y1 = Math.max(y1, p.v[1] + p.r); }
    else for (let i = 0; i < p.v.length; i += 2) { x0 = Math.min(x0, p.v[i]); x1 = Math.max(x1, p.v[i]); y0 = Math.min(y0, p.v[i + 1]); y1 = Math.max(y1, p.v[i + 1]); }
  }
  const m = 10;
  return { x: x0 - m, y: y0 - m, w: (x1 - x0) + m * 2, h: (y1 - y0) + m * 2 };
}

const solved = bestCamera(rig);
const CAM = solved.cam;
const p0 = rig.poseAt(0), p1 = rig.poseAt(1);
const read = (p) => Math.round(angle2(CAM, p.j.shoulderR, p.j.elbowR, p.j.wristR));
const truth = (p) => Math.round(angle3(p.j.shoulderR, p.j.elbowR, p.j.wristR));

const compare = [0, solved.az, 90].map((az) => {
  const c = camera(az, solved.el);
  return { az, frames: build(c), elbow: [Math.round(angle2(c, p0.j.shoulderR, p0.j.elbowR, p0.j.wristR)), Math.round(angle2(c, p1.j.shoulderR, p1.j.elbowR, p1.j.wristR))] };
});

const data = {
  cam: { az: solved.az, el: solved.el },
  metrics: solved.metrics,
  rows: solved.rows.filter((r) => r.az % 3 === 0 || r.az === solved.az),
  truth: [truth(p0), truth(p1)],
  read: [read(p0), read(p1)],
  compare: compare.map((c) => ({ az: c.az, elbow: c.elbow, bounds: bounds(c.frames), frames: c.frames })),
};

const html = require('./page.js')(data);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

// a render is not verified because it was produced — check it before claiming it
let bad = 0, total = 0;
for (const c of data.compare) for (const f of c.frames) for (const p of f) {
  total++;
  if (p.v.some((n) => !isFinite(n)) || (p.r != null && !isFinite(p.r))) bad++;
}
console.log('camera  az ' + data.cam.az + '°  el ' + data.cam.el + '°');
console.log('elbow   true ' + data.truth.join('° → ') + '°   on screen ' + data.read.join('° → ') + '°');
console.log('pieces  ' + total + '   non-finite ' + bad);
console.log('sorted  ' + data.compare.every((c) => c.frames.every((f) => f.every((p, i) => i === 0 || p.d >= f[i - 1].d - 1e-6))));
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
