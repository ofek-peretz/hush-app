/**
 * Joint table — the numeric companion to `eyepass`. Prints every joint of a rig at N roms so a
 * shape the eye flags ("did the legs just move?") can be settled by measurement instead of by
 * argument. Also prints per-joint travel across the rep, sorted, which is usually the answer.
 *
 *   node tools/motion-harness/joints.js <exerciseId> [n]
 */
const path = require('path');
const BUILD = (process.env.MOTION_BUILD ? path.resolve(process.env.MOTION_BUILD) : path.resolve(__dirname, '../../.motion-build'));
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const EX = process.argv[2];
const N = Number(process.argv[3] || 9);
const rig = EXERCISE_MOTION[EX];
if (!rig) { console.error('no rig for', EX); process.exit(2); }
const roms = Array.from({ length: N }, (_, i) => i / (N - 1));
const poses = roms.map((r) => rig.poseAt(r));
const names = Object.keys(poses[0].j);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('joint', 14) + roms.map((r) => pad(r.toFixed(2), 15)).join(''));
for (const n of names) {
  console.log(pad(n, 14) + poses.map((p) => pad(`${p.j[n].x.toFixed(1)},${p.j[n].y.toFixed(1)}`, 15)).join(''));
}
console.log('\ntravel (max displacement from rom 0):');
const travel = names.map((n) => {
  const a = poses[0].j[n];
  let m = 0;
  for (const p of poses) m = Math.max(m, Math.hypot(p.j[n].x - a.x, p.j[n].y - a.y));
  return [n, m];
}).sort((x, y) => y[1] - x[1]);
for (const [n, m] of travel) console.log('  ' + pad(n, 14) + m.toFixed(2));
console.log('\nheadR: ' + poses.map((p) => p.headR.toFixed(2)).join(' '));
if (poses[0].trunkBow !== undefined) console.log('trunkBow: ' + poses.map((p) => (p.trunkBow ?? 0).toFixed(2)).join(' '));
if (poses[0].fistR !== undefined) console.log('fistR: ' + poses.map((p) => (p.fistR ?? 0).toFixed(2)).join(' '));
if (poses[0].z) console.log('z@rom0.5: ' + JSON.stringify(poses[Math.floor(N/2)].z));

// ── the angles, which is where form actually lives ───────────────────────────
const { angleAt, segAngle, dist } = require(path.join(BUILD, 'geometry.js'));
const CHAINS = [
  ['elbowR', 'shoulderR', 'handR'], ['elbowL', 'shoulderL', 'handL'],
  ['elbow', 'shoulder', 'hand'], ['elbowF', 'shoulderF', 'handF'],
  ['kneeR', 'hipR', 'ankleR'], ['kneeL', 'hipL', 'ankleL'],
  ['knee', 'hip', 'ankle'], ['kneeF', 'hipF', 'ankleF'],
  ['kneeB', 'hipB', 'ankleB'],
  ['shoulderR', 'hipR', 'elbowR'], ['shoulderL', 'hipL', 'elbowL'],
  ['shoulder', 'hipC', 'elbow'], ['shoulder', 'hip', 'elbow'],
  ['hipR', 'shoulderR', 'kneeR'], ['hipL', 'shoulderL', 'kneeL'],
  ['hip', 'shoulder', 'knee'], ['hipC', 'neckBase', 'kneeR'],
  ['ankleR', 'kneeR', 'toeR'], ['ankle', 'knee', 'toe'],
];
console.log('\ninterior angles (deg):');
for (const [vx, a, b] of CHAINS) {
  if (!poses[0].j[vx] || !poses[0].j[a] || !poses[0].j[b]) continue;
  console.log('  ' + pad(`${a}-${vx}-${b}`, 26) + poses.map((p) => pad(angleAt(p.j[a], p.j[vx], p.j[b]).toFixed(1), 8)).join(''));
}
const SEGS = [
  ['hipC', 'neckBase'], ['hip', 'shoulder'], ['hipC', 'head'],
  ['shoulderR', 'elbowR'], ['elbowR', 'handR'], ['shoulder', 'elbow'], ['elbow', 'hand'],
  ['hipR', 'kneeR'], ['kneeR', 'ankleR'], ['hip', 'knee'], ['knee', 'ankle'],
  ['heelR', 'toeR'], ['heel', 'toe'],
];
console.log('\nsegment angle (deg, 0 = +x right, 90 = down the page) / projected length:');
for (const [a, b] of SEGS) {
  if (!poses[0].j[a] || !poses[0].j[b]) continue;
  console.log('  ' + pad(`${a}->${b}`, 22) + poses.map((p) => pad(`${segAngle(p.j[a], p.j[b]).toFixed(0)}/${dist(p.j[a], p.j[b]).toFixed(1)}`, 12)).join(''));
}
