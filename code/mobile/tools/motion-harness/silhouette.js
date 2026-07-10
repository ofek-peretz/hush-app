/**
 * The recognition test, literally: every machine/cable station rendered with the ATHLETE REMOVED
 * (scene + back decor + front implement only — no figure). If each station can be named from this
 * page, the equipment language passes §3.5 Amendment 4 at the silhouette level.
 *
 *   npx tsc -p tsconfig.harness.json
 *   node tools/motion-harness/silhouette.js <out.html>
 */
const fs = require('fs');
const path = require('path');
const BUILD = path.resolve(__dirname, '../../.motion-build');
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { VIEWBOX } = require(path.join(BUILD, 'frame.js'));
const { MOTION_PALETTE } = require(path.join(BUILD, 'palette.js'));
const { svgEl } = require('./prims');

const OUT = process.argv[2] || path.resolve(BUILD, 'silhouette.html');
const IDS = process.argv[3]
  ? process.argv[3].split(',')
  : ['lat_pulldown', 'cable_row', 'machine_row', 'machine_chest_press', 'machine_shoulder_press', 'face_pull', 't_bar_row'];

function stationSVG(rig, rom) {
  const decor = rig.decorAt(rom);
  const prims = [...rig.scene, ...decor.back, ...decor.front];
  const vb = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`;
  return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${prims.map((p) => svgEl(p, MOTION_PALETTE)).join('')}</svg>`;
}

const cells = IDS.map((id) => {
  const rig = EXERCISE_MOTION[id];
  return `<div class="cell"><div class="pair">${stationSVG(rig, 0)}${stationSVG(rig, 0.85)}</div><div class="cap">${id}</div></div>`;
}).join('');

fs.writeFileSync(
  OUT,
  `<!doctype html><meta charset="utf-8"><title>silhouette test</title><style>
  body{background:#efedea;font-family:monospace;padding:16px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;max-width:1380px}
  .cell{background:#f7f6f3;border:1px solid #dcdad8;border-radius:10px;padding:8px}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  svg{width:100%;aspect-ratio:16/10;background:#eeede9;border-radius:6px}
  .cap{font-size:11px;color:#726f6c;margin-top:5px;text-align:center}
  </style><div class="grid">${cells}</div>`,
);
console.log('wrote', OUT);
