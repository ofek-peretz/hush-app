/**
 * VARIANT sheet — the same rom, rendered from several patched copies of one rig's compiled module.
 * Authoring a clip is a series of small numeric bets (how far does the elbow flare, where does the
 * bar stop); this makes the bet visible side by side instead of one render at a time.
 *
 *   node tools/motion-harness/variants.js <exerciseId> <libFile> <constName> <v1,v2,...> <rom1,rom2,...>
 */
const fs = require('fs');
const path = require('path');
const BUILD = path.resolve(__dirname, '../../.motion-build');
const [EX, LIB, CONST, VALS, ROMS] = process.argv.slice(2);
const vals = VALS.split(',');
const roms = ROMS.split(',').map(Number);
const libPath = path.join(BUILD, 'library', LIB + '.js');
const orig = fs.readFileSync(libPath, 'utf8');
const { buildFrame, VIEWBOX } = require(path.join(BUILD, 'frame.js'));
const { MOTION_PALETTE } = require(path.join(BUILD, 'palette.js'));
const { svgEl } = require('./prims');

const rows = [];
for (const val of vals) {
  const re = new RegExp(`((?:const |exports\.)${CONST} = )[-0-9.]+`);
  if (!re.test(orig)) { console.error('no such const:', CONST); process.exit(2); }
  const patched = orig.replace(re, `$1${val}`);
  fs.writeFileSync(libPath, patched);
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
  const rig = EXERCISE_MOTION[EX];
  const cells = roms.map((rom) => {
    const frame = buildFrame(rig, rom).map((p) => svgEl(p, MOTION_PALETTE)).join('');
    return `<div><div class="pan"><svg viewBox="${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}">${frame}</svg></div><div class="cap">rom ${rom}</div></div>`;
  }).join('');
  rows.push(`<div class="lab">${CONST} = ${val}</div><div class="grid">${cells}</div>`);
}
fs.writeFileSync(libPath, orig);

const OUTDIR = path.join(BUILD, 'eyepass');
fs.mkdirSync(OUTDIR, { recursive: true });
const OUT = path.join(OUTDIR, `${EX}.variants.html`);
fs.writeFileSync(OUT, `<!doctype html><meta charset=utf8><title>${EX} variants</title>
<style>
 body{margin:0;background:#efedea;color:#191714;font-family:ui-monospace,monospace;padding:10px}
 h1{font-size:15px;margin:0 0 8px}.lab{font-size:13px;font-weight:700;margin:8px 0 4px}
 .grid{display:grid;grid-template-columns:repeat(${roms.length},1fr);gap:6px}
 .pan{aspect-ratio:16/10;border:1px solid #dcdad8;border-radius:6px;overflow:hidden;
   background:repeating-linear-gradient(45deg,#e4e3de 0 9px,#eeede9 9px 18px)}
 .pan svg{display:block;width:100%;height:100%}
 .cap{font-size:10px;color:#726f6c;text-align:center;margin-top:2px}
</style><h1>${EX} — ${CONST} variants</h1>${rows.join('')}`);
console.log(OUT);
