/** Large single-frame panels for close visual QC. node hero.js <ex> <out.html> [rom,rom,...] */
const fs = require('fs');
const path = require('path');
const BUILD = path.resolve(__dirname, '../../.motion-build');
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, VIEWBOX } = require(path.join(BUILD, 'frame.js'));
const { MOTION_PALETTE: PAL } = require(path.join(BUILD, 'palette.js'));
const { svgEl } = require('./prims');
const EX = process.argv[2];
const OUT = process.argv[3];
const ROMS = (process.argv[4] || '0,0.5,1').split(',').map(Number);
const rig = EXERCISE_MOTION[EX];
const vb = VIEWBOX;
const panels = ROMS.map((r) => `<div class="pan"><svg viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" xmlns="http://www.w3.org/2000/svg">${buildFrame(rig, r).map((p) => svgEl(p, PAL)).join('')}</svg><div class=cap>rom ${r}</div></div>`).join('');
fs.writeFileSync(OUT, `<!doctype html><meta charset=utf8><style>body{margin:0;background:#efedea;padding:16px;display:flex;gap:14px;flex-wrap:wrap}.pan{width:440px}.pan svg{width:440px;aspect-ratio:16/10;border:1px solid #dcdad8;border-radius:12px;background:repeating-linear-gradient(45deg,#e4e3de 0 14px,#eeede9 14px 28px)}.cap{font-family:ui-monospace,monospace;font-size:11px;color:#726f6c;text-align:center;margin-top:6px}</style>${panels}`);
console.log('wrote', OUT);
