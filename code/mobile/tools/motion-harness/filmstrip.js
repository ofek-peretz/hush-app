/**
 * Filmstrip rasterizer — renders a rig at N range-of-motion positions into a labeled SVG grid,
 * for visual QC during authoring. Writes a self-contained HTML; screenshot it with headless Chrome:
 *
 *   npx tsc -p tsconfig.harness.json
 *   node tools/motion-harness/filmstrip.js <exerciseId> <out.html>
 *   chrome --headless --screenshot=<out.png> --window-size=1120,<h> --hide-scrollbars file://<out.html>
 *
 * The panels draw the EXACT compiled geometry the app ships (via buildFrame), on the real striped
 * media field, so what the eye QCs is what renders.
 */
const fs = require('fs');
const path = require('path');

const EX = process.argv[2] || 'bb_bench_press';
const OUT = process.argv[3] || path.resolve(__dirname, `../../.motion-build/${EX}.filmstrip.html`);

const BUILD = path.resolve(__dirname, '../../.motion-build');
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, VIEWBOX } = require(path.join(BUILD, 'frame.js'));
const { validate } = require(path.join(BUILD, 'formspec.js'));
const { MOTION_PALETTE } = require(path.join(BUILD, 'palette.js'));

const rig = EXERCISE_MOTION[EX];
if (!rig) { console.error('no rig for', EX); process.exit(2); }

const { svgEl } = require('./prims');
const PAL = MOTION_PALETTE;
function panel(rom, label) {
  const vb = VIEWBOX;
  const frame = buildFrame(rig, rom).map((p) => svgEl(p, PAL)).join('');
  return `<div class="cell"><div class="pan"><svg viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" xmlns="http://www.w3.org/2000/svg">${frame}</svg></div><div class="cap">${label}</div></div>`;
}

const res = validate(rig, 240);
const roms = [0, 0.166, 0.333, 0.5, 0.666, 0.833, 1];
const labels = roms.map((r) => `rom ${r.toFixed(2)}`);
const cells = roms.map((r, i) => panel(r, labels[i])).join('');

const vlines = res.ok
  ? '<span class="ok">FormSpec PASS — every predicate holds across the loop.</span>'
  : `<span class="bad">FAIL (${res.violations.length})</span><ul>${res.violations.map((v) => `<li>${v.where}: ${v.detail}</li>`).join('')}</ul>`;

const html = `<!doctype html><meta charset=utf8><title>${EX} filmstrip</title>
<style>
 body{margin:0;background:#efedea;color:#191714;font-family:'Segoe UI',system-ui,sans-serif;padding:20px}
 h1{font-size:18px;margin:0 0 4px}.sub{color:#726f6c;font-size:12px;margin:0 0 16px;font-family:ui-monospace,monospace}
 .grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
 .pan{aspect-ratio:16/10;border:1px solid #dcdad8;border-radius:8px;overflow:hidden;
   background:repeating-linear-gradient(45deg,#e4e3de 0 9px,#eeede9 9px 18px)}
 .pan svg{display:block;width:100%;height:100%}
 .cap{font-family:ui-monospace,monospace;font-size:9px;color:#726f6c;text-align:center;margin-top:4px}
 .val{margin-top:16px;font-size:12px;font-family:ui-monospace,monospace}
 .ok{color:#2f6b39;font-weight:600}.bad{color:#a23;font-weight:600}
 ul{margin:6px 0 0;padding-left:18px;color:#a23}
</style>
<h1>${EX}</h1>
<p class="sub">7 positions · rom 0 = rep start · rom 1 = working endpoint · viewBox ${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}</p>
<div class="grid">${cells}</div>
<div class="val">${vlines}</div>`;
fs.writeFileSync(OUT, html);
console.log('wrote', OUT, '\nvalidate:', res.ok ? 'PASS' : `FAIL ${JSON.stringify(res.violations)}`);
