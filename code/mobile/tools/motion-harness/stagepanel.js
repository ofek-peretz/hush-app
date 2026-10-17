/**
 * The app's own view of a rig, for eyes: the STAGE ladder (`MOTION_PALETTE_STAGE`) on the stage's
 * black, in the fitted stage frame (`stageFrame`) — exactly what `FormMedia` and the set stage draw,
 * which the older scripts (paper ladder, shared 16:10 crop) do not.
 *
 *   node stagepanel.js <out.html> <spec> [<spec> …]
 *     spec = <registry id>                   a catalogue rig
 *          | <module>#<export>               any rig a module exports (e.g. library/life#celebratingRig,
 *                                            altViews#ALT_VIEWS.bb_back_squat)
 *   ROMS=0,0.5,1  FIGURE=male|female
 *
 * Then `node shot.js <out.html> <out.png> 1500,<h>` to look at it.
 */
const fs = require('fs');
const path = require('path');
const BUILD = process.env.MOTION_BUILD ? path.resolve(process.env.MOTION_BUILD) : path.resolve(__dirname, '../../.motion-build');
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, stageFrame } = require(path.join(BUILD, 'frame.js'));
const { MOTION_PALETTE_STAGE: PAL } = require(path.join(BUILD, 'palette.js'));
const { svgEl } = require('./prims');

const OUT = process.argv[2];
const SPECS = process.argv.slice(3);
const ROMS = (process.env.ROMS || '0,0.5,1').split(',').map(Number);
const FIGURE = process.env.FIGURE === 'female' ? 'female' : 'male';

function resolve(spec) {
  if (!spec.includes('#')) return EXERCISE_MOTION[spec];
  const [mod, pathExpr] = spec.split('#');
  let v = require(path.join(BUILD, mod + '.js'));
  for (const k of pathExpr.split('.')) v = v[k];
  return v;
}

const rows = SPECS.map((spec) => {
  const rig = resolve(spec);
  if (!rig) return `<div class=row><div class=lab>${spec}: NOT FOUND</div></div>`;
  const b = stageFrame(rig);
  const panels = ROMS.map(
    (r) =>
      `<div class=pan><svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" xmlns="http://www.w3.org/2000/svg">${buildFrame(rig, r, FIGURE)
        .map((p) => svgEl(p, PAL))
        .join('')}</svg><div class=cap>${spec} · rom ${r}</div></div>`,
  );
  return `<div class=row>${panels.join('')}</div>`;
});

fs.writeFileSync(
  OUT,
  `<!doctype html><meta charset=utf8><style>body{margin:0;background:#1b1914;padding:14px;font-family:ui-monospace,monospace}` +
    `.row{display:flex;gap:12px;margin-bottom:12px}.pan{width:360px}.pan svg{width:360px;aspect-ratio:264/202;background:#000;border-radius:10px;display:block}` +
    `.cap{font-size:11px;color:#a8a290;text-align:center;margin-top:4px}.lab{color:#f1eee5}</style>${rows.join('')}`,
);
console.log('wrote', OUT);
