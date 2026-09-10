/**
 * The two-athletes review page: for each exercise, the SAME rig at the same roms, him on the top
 * row and her on the bottom — the eye checks that the pose, equipment, and form read identically
 * and only the athlete changed. node figures.js <out.html> [ex,ex,...] [rom,rom,...]
 */
const fs = require('fs');
const path = require('path');
const BUILD = (process.env.MOTION_BUILD ? path.resolve(process.env.MOTION_BUILD) : path.resolve(__dirname, '../../.motion-build'));
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, VIEWBOX } = require(path.join(BUILD, 'frame.js'));
const { MOTION_PALETTE: PAL } = require(path.join(BUILD, 'palette.js'));
const { svgEl } = require('./prims');

const OUT = process.argv[2];
const EXES = (process.argv[3] || 'bb_back_squat,bb_deadlift,bb_bench_press,lat_pulldown').split(',');
const ROMS = (process.argv[4] || '0,0.5,1').split(',').map(Number);
const vb = VIEWBOX;

const panel = (rig, rom, figure) =>
  `<div class="pan"><svg viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" xmlns="http://www.w3.org/2000/svg">${buildFrame(rig, rom, figure)
    .map((p) => svgEl(p, PAL))
    .join('')}</svg><div class=cap>${figure} · rom ${rom}</div></div>`;

const blocks = EXES.map((ex) => {
  const rig = EXERCISE_MOTION[ex];
  if (!rig) return `<h2>${ex} — NOT FOUND</h2>`;
  const rows = ['male', 'female']
    .map((f) => `<div class=row>${ROMS.map((r) => panel(rig, r, f)).join('')}</div>`)
    .join('');
  return `<h2>${ex}</h2>${rows}`;
}).join('');

fs.writeFileSync(
  OUT,
  `<!doctype html><meta charset=utf8><style>body{margin:0;background:#efedea;padding:16px;font-family:ui-monospace,monospace}h2{font-size:13px;color:#43403e;margin:18px 2px 8px}.row{display:flex;gap:12px;margin-bottom:10px}.pan svg{width:460px;aspect-ratio:16/10;border:1px solid #dcdad8;border-radius:10px;background:repeating-linear-gradient(45deg,#e4e3de 0 14px,#eeede9 14px 28px)}.cap{font-size:10px;color:#726f6c;text-align:center;margin-top:3px}</style>${blocks}`,
);
console.log('wrote', OUT);
