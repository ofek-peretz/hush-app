/**
 * MONTAGE — many exercises on one sheet, three positions each.
 *
 * `eyepass.js` answers "is THIS clip right", and it is the tool for judging one. This answers the
 * question that comes before it: "which of these hundred needs looking at". One row per exercise —
 * start, middle, endpoint — at a size that still shows whether the equipment reads, whether the
 * range is a whole rep, and whether a limb has collapsed. Anything that looks wrong here gets the
 * eye-pass treatment; anything that looks right has still been LOOKED at, which is the point.
 *
 *   node tools/motion-harness/montage.js <out-name> <id> <id> ...
 */
const fs = require('fs');
const path = require('path');

const BUILD = path.resolve(__dirname, '../../.motion-build');
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, VIEWBOX } = require(path.join(BUILD, 'frame.js'));
const { MOTION_PALETTE } = require(path.join(BUILD, 'palette.js'));
const { svgEl } = require('./prims');

const NAME = process.argv[2];
const IDS = process.argv.slice(3);
const FIG = 'male';
const ROMS = [0, 0.5, 1];

const OUTDIR = path.join(BUILD, 'eyepass');
fs.mkdirSync(OUTDIR, { recursive: true });

const rows = IDS.map((id) => {
  const rig = EXERCISE_MOTION[id];
  if (!rig) return `<div class="row"><div class="lab">${id} — MISSING</div></div>`;
  const cells = ROMS.map((rom) => {
    const frame = buildFrame(rig, rom, FIG).map((p) => svgEl(p, MOTION_PALETTE)).join('');
    return `<div class="pan"><svg viewBox="${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}" xmlns="http://www.w3.org/2000/svg">${frame}</svg></div>`;
  }).join('');
  return `<div class="row"><div class="lab">${id}</div><div class="cells">${cells}</div></div>`;
}).join('');

const html = `<!doctype html><meta charset=utf8><title>${NAME}</title>
<style>
 body{margin:0;background:#efedea;color:#191714;font-family:ui-monospace,monospace;padding:8px}
 .row{margin-bottom:8px}
 .lab{font-size:13px;font-weight:700;margin:0 0 2px}
 .cells{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
 .pan{aspect-ratio:${(VIEWBOX.w / VIEWBOX.h).toFixed(4)};border:1px solid #dcdad8;border-radius:5px;overflow:hidden;
   background:repeating-linear-gradient(45deg,#e4e3de 0 9px,#eeede9 9px 18px)}
 .pan svg{display:block;width:100%;height:100%}
</style>
${rows}`;
const out = path.join(OUTDIR, `${NAME}.html`);
fs.writeFileSync(out, html);
console.log(out);
