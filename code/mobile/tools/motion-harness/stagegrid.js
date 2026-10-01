/**
 * The whole catalogue on the app's own ladder, a page at a time — `stagepanel.js`'s rendering (stage
 * palette, stage black, fitted stage frame) laid out as a contact sheet for a full eye-pass.
 *
 *   node stagegrid.js <outDir> [perPage=24] [roms=0,0.5,1] [male|female] [idFilter…]
 *
 * Writes <outDir>/page-NN.html; shoot each with `node shot.js <html> <png> 1500,<h>`.
 */
const fs = require('fs');
const path = require('path');
const BUILD = process.env.MOTION_BUILD ? path.resolve(process.env.MOTION_BUILD) : path.resolve(__dirname, '../../.motion-build');
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, stageFrame } = require(path.join(BUILD, 'frame.js'));
const { MOTION_PALETTE_STAGE: PAL } = require(path.join(BUILD, 'palette.js'));
const { svgEl } = require('./prims');

const OUT = path.resolve(process.argv[2]);
const PER = Number(process.argv[3] || 24);
const ROMS = (process.argv[4] || '0,0.5,1').split(',').map(Number);
const FIGURE = process.argv[5] === 'female' ? 'female' : 'male';
const FILTER = process.argv.slice(6);
fs.mkdirSync(OUT, { recursive: true });

const ids = Object.keys(EXERCISE_MOTION).filter((id) => FILTER.length === 0 || FILTER.some((f) => id.includes(f)));
const cell = (rig, r) => {
  const b = stageFrame(rig);
  return `<svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" xmlns="http://www.w3.org/2000/svg">${buildFrame(rig, r, FIGURE).map((p) => svgEl(p, PAL)).join('')}</svg>`;
};
let page = 0;
for (let i = 0; i < ids.length; i += PER) {
  page++;
  const slice = ids.slice(i, i + PER);
  const blocks = slice.map((id) => `<div class=ex><div class=frames>${ROMS.map((r) => cell(EXERCISE_MOTION[id], r)).join('')}</div><div class=lab>${id}</div></div>`);
  const html =
    `<!doctype html><meta charset=utf8><style>body{margin:0;background:#1b1914;padding:10px;font-family:ui-monospace,monospace;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}` +
    `.frames{display:flex;gap:3px}.frames svg{width:158px;aspect-ratio:264/202;background:#000;border-radius:6px;display:block}` +
    `.lab{font-size:11px;color:#d3ccbc;margin-top:3px}</style>${blocks.join('')}`;
  fs.writeFileSync(path.join(OUT, `page-${String(page).padStart(2, '0')}.html`), html);
}
console.log(`${ids.length} rigs → ${page} pages in ${OUT}`);
