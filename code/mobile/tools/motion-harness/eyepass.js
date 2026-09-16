/**
 * EYE-PASS rasterizer — the surface for reviewing one exercise, one exercise at a time.
 *
 * `filmstrip.js` answers "does this rig pass its FormSpec"; seven small panels are enough for that.
 * This answers a different question — "is this the best clip we could ship for THIS movement" —
 * and that needs the whole motion at a size an eye can actually judge: joint angles, which limb is
 * near, where the equipment sits, whether the camera is standing in the right place.
 *
 * So: N positions across the rep at a panel size that survives downsampling, on the real striped
 * media field, from the exact compiled geometry the app ships.
 *
 *   node tools/motion-harness/eyepass.js <exerciseId> [cols] [rows] [male|female] [--roms=0.9,0.95,1]
 */
const fs = require('fs');
const path = require('path');

const EX = process.argv[2] || 'bb_bench_press';
const COLS = Number(process.argv[3] || 3);
const ROWS = Number(process.argv[4] || 4);
const FIG = process.argv[5] === 'female' ? 'female' : 'male';
const N = COLS * ROWS;

const BUILD = (process.env.MOTION_BUILD ? path.resolve(process.env.MOTION_BUILD) : path.resolve(__dirname, '../../.motion-build'));
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, VIEWBOX } = require(path.join(BUILD, 'frame.js'));
const { MOTION_PALETTE } = require(path.join(BUILD, 'palette.js'));
const { svgEl } = require('./prims');

const rig = EXERCISE_MOTION[EX];
if (!rig) { console.error('no rig for', EX); process.exit(2); }

const OUTDIR = path.resolve(__dirname, '../../.motion-build/eyepass');
fs.mkdirSync(OUTDIR, { recursive: true });
const OUT = path.join(OUTDIR, `${EX}.html`);

const romArg = process.argv.find((a) => a.startsWith('--roms='));
const roms = romArg
  ? romArg.slice(7).split(',').map(Number)
  : Array.from({ length: N }, (_, i) => i / (N - 1));
const cropArg = process.argv.find((a) => a.startsWith('--crop='));
const VB = cropArg
  ? (([x, y, w, h]) => ({ x, y, w, h }))(cropArg.slice(7).split(',').map(Number))
  : VIEWBOX;

const cells = roms.map((rom) => {
  const frame = buildFrame(rig, rom, FIG).map((p) => svgEl(p, MOTION_PALETTE)).join('');
  return `<div class="cell"><div class="pan"><svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" xmlns="http://www.w3.org/2000/svg">${frame}</svg></div><div class="cap">${rom.toFixed(3)}</div></div>`;
}).join('');

const html = `<!doctype html><meta charset=utf8><title>${EX} eye-pass</title>
<style>
 body{margin:0;background:#efedea;color:#191714;font-family:ui-monospace,monospace;padding:10px}
 h1{font-size:15px;margin:0 0 8px}
 .grid{display:grid;grid-template-columns:repeat(${COLS},1fr);gap:6px}
 .pan{aspect-ratio:${(VB.w / VB.h).toFixed(4)};border:1px solid #dcdad8;border-radius:6px;overflow:hidden;
   background:#e3ded0}
 .pan svg{display:block;width:100%;height:100%}
 .cap{font-size:11px;color:#726f6c;text-align:center;margin-top:2px}
</style>
<h1>${EX} — ${FIG} — rom 0 (start) → 1 (endpoint)</h1>
<div class="grid">${cells}</div>`;
fs.writeFileSync(OUT, html);
console.log(OUT);
