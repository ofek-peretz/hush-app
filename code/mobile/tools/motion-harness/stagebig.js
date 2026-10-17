/**
 * Large single frames on the app's ladder — the eye-pass at the size a detail is judged at.
 *   node stagebig.js <out.html> <rom> <spec> [<spec> …]      spec = registry id | module#export
 *   FIGURE=female  COLS=2  W=700
 */
const fs = require('fs');
const path = require('path');
const BUILD = process.env.MOTION_BUILD ? path.resolve(process.env.MOTION_BUILD) : path.resolve(__dirname, '../../.motion-build');
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, stageFrame } = require(path.join(BUILD, 'frame.js'));
const { MOTION_PALETTE_STAGE: PAL } = require(path.join(BUILD, 'palette.js'));
const { svgEl } = require('./prims');

const OUT = process.argv[2];
const ROM = Number(process.argv[3]);
const SPECS = process.argv.slice(4);
const FIGURE = process.env.FIGURE === 'female' ? 'female' : 'male';
const COLS = Number(process.env.COLS || 2);
const W = Number(process.env.W || 700);

function resolve(spec) {
  if (!spec.includes('#')) return EXERCISE_MOTION[spec];
  const [mod, pathExpr] = spec.split('#');
  let v = require(path.join(BUILD, mod + '.js'));
  for (const k of pathExpr.split('.')) v = v[k];
  return v;
}
const cells = SPECS.map((spec) => {
  const rig = resolve(spec);
  const b = stageFrame(rig);
  return `<div><svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" xmlns="http://www.w3.org/2000/svg">${buildFrame(rig, ROM, FIGURE).map((p) => svgEl(p, PAL)).join('')}</svg><div class=lab>${spec} · rom ${ROM}</div></div>`;
});
fs.writeFileSync(
  OUT,
  `<!doctype html><meta charset=utf8><style>body{margin:0;background:#1b1914;padding:12px;display:grid;grid-template-columns:repeat(${COLS},${W}px);gap:12px;font-family:ui-monospace,monospace}` +
    `svg{width:${W}px;aspect-ratio:264/202;background:#000;border-radius:12px;display:block}.lab{font-size:12px;color:#a8a290;margin-top:4px}</style>${cells.join('')}`,
);
console.log('wrote', OUT);
