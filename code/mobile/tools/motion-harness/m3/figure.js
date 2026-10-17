/**
 * THE FIGURE, MOVING.
 *
 *   node tools/motion-harness/m3/figure.js <out.html>
 *
 * emit.js draws the instruments; this draws the thing itself. The solved camera, the rep running
 * at its real tempo, and no number anywhere on the page. It answers the only question that
 * matters about a demonstration: does this look like the exercise, and does it look good.
 */
// @ts-nocheck

const fs = require('fs');
const path = require('path');
const { camera } = require('./core');
const { tessellate, castShadows } = require('./solids');
const { figureSolids } = require('./skin');
const { bestCamera, secondCamera } = require('./solve');
const { get } = require('./library');
const ri = process.argv.indexOf('--rig');
const rig = get(ri > 0 ? process.argv[ri + 1] : undefined);

const OUT = process.argv[2] || path.join(__dirname, 'FIGURE.html');
const FRAMES = 22;
const STRIP = 6;

const TONE = {
  limb: '#e9e0cf', trunk: '#ded4c0', face: '#cfc5ae', kit: '#4a4741',
  frame: '#3c3833', pad: '#26231f', rail: '#6e6659', grip: '#a79d8c',
  plateOn: '#bcb3a2', plateOff: '#302d28', cable: '#847c70',
};

const solved = bestCamera(rig);
const alt = secondCamera(rig, solved);
let PRIMARY = solved.cam;
const argAz = process.argv.indexOf('--az'), argEl = process.argv.indexOf('--el');
if (argAz > 0 || argEl > 0) {
  PRIMARY = camera(argAz > 0 ? Number(process.argv[argAz + 1]) : solved.az,
    argEl > 0 ? Number(process.argv[argEl + 1]) : solved.el);
}

const OPT = { floorY: rig.FLOOR };
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * One camera's worth of the rep, framed and shaded.
 *
 * FRAMING. ⛔ THE VIEWBOX USED TO BE THE BOUNDING BOX OF EVERYTHING DRAWN, and the machine won:
 * a base 100 units wide and a tower above the head pushed the athlete down to half the picture,
 * in a demonstration whose entire subject is the athlete. It is built around HIM, and the
 * hardware is allowed to run off the edges — what a photographer would do, and what makes the
 * crop read as a decision instead of an accident.
 */
function buildView(cam, zoom = 1.22) {
  const frames = Array.from({ length: FRAMES }, (_, i) => {
    const rom = i / (FRAMES - 1);
    const station = rig.stationAt(rom), figure = figureSolids(rig.poseAt(rom));
    const prims = tessellate(cam, [...station, ...figure], OPT);
    /* the athlete falls on all three receivers; the machine only ever falls on the floor */
    castShadows(cam, figure, rig.RECEIVERS, prims);
    castShadows(cam, station, [rig.RECEIVERS[0]], prims);
    return prims.sort((a, b) => a.depth - b.depth);
  });

  let dLo = Infinity, dHi = -Infinity;
  for (const f of frames) for (const p of f) if (p.depth > -1e5) { dLo = Math.min(dLo, p.depth); dHi = Math.max(dHi, p.depth); }

  let fx0 = 1e9, fy0 = 1e9, fx1 = -1e9, fy1 = -1e9;
  for (let i = 0; i < FRAMES; i++) {
    for (const p of tessellate(cam, figureSolids(rig.poseAt(i / (FRAMES - 1))), OPT)) {
      const pts = p.kind === 'circle'
        ? [{ x: p.c.x - p.r, y: p.c.y - p.r }, { x: p.c.x + p.r, y: p.c.y + p.r }] : p.pts;
      for (const q of pts) { fx0 = Math.min(fx0, q.x); fx1 = Math.max(fx1, q.x); fy0 = Math.min(fy0, q.y); fy1 = Math.max(fy1, q.y); }
    }
  }
  const S = Math.max(fx1 - fx0, fy1 - fy0) * zoom;
  const VB = [(fx0 + fx1) / 2 - S / 2, (fy0 + fy1) / 2 - S * 0.52, S, S].map(r1);

  /* Diffuse MULTIPLIES the material's colour; specular ADDS white on top of it. Folding the
     highlight into the multiplier instead would only make the paint paler — a highlight is light
     arriving at the eye, not pigment, and it has to be able to blow past the colour it sits on. */
  const fill = (p) => {
    if (p.tone === 'shadow') return 'rgba(0,0,0,' + p.alpha.toFixed(2) + ')';
    const t = (p.depth - dLo) / ((dHi - dLo) || 1);
    const k = Math.min(1.18, p.light * (0.80 + 0.20 * t) * 1.14);
    const s = (p.spec || 0) * 255 * (0.55 + 0.45 * t);
    const n = parseInt((TONE[p.tone] || '#888888').slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * k + s))).toString(16).padStart(2, '0');
    return '#' + c(n >> 16) + c((n >> 8) & 255) + c(n & 255);
  };
  const draw = (f) => f.map((p) => (p.kind === 'circle'
    ? '<circle cx="' + r1(p.c.x) + '" cy="' + r1(p.c.y) + '" r="' + r1(p.r) + '" fill="' + fill(p) + '"/>'
    : '<path d="M' + p.pts.map((q) => r1(q.x) + ' ' + r1(q.y)).join('L') + 'Z" fill="' + fill(p) + '"/>')).join('');

  return { frames, VB, draw };
}

const main = buildView(PRIMARY);
const side = alt ? buildView(alt.cam, 1.58) : null;

const svg = (v, body, cls) =>
  '<svg class="' + cls + '" viewBox="' + v.VB.join(' ') + '" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
const reel = (v, cls) => svg(v, v.frames.map((f, i) =>
  '<g' + (i ? ' style="display:none"' : '') + '>' + v.draw(f) + '</g>').join(''), cls);

const strip = Array.from({ length: STRIP }, (_, i) =>
  '<div class="cell">' + svg(main, main.draw(main.frames[Math.round((i / (STRIP - 1)) * (FRAMES - 1))]), 'sm') + '</div>').join('');

/**
 * TEMPO. A rep is not a triangle wave. It is slow going out under load, a beat at the chest, a
 * quicker return, and a beat at lockout — and the eye reads those four as effort. Even timing
 * reads as a machine part cycling, which is exactly what the old page looked like. Both views run
 * off ONE clock, so they always show the same instant of the same rep.
 */
const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<title>Hush — ${rig.title}</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#080807;color:#e9e3d7;
       font:400 16px/1.65 -apple-system,"Segoe UI",system-ui,sans-serif;
       padding:52px 24px 76px;display:flex;flex-direction:column;align-items:center}
  h1{font-size:27px;font-weight:600;margin:0 0 8px;letter-spacing:-.015em}
  p.sub{margin:0 0 38px;font-size:15px;color:#847d70}
  .views{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;justify-content:center}
  .stage{background:radial-gradient(120% 90% at 50% 32%,#191713 0%,#0b0a09 68%);
         border-radius:24px;padding:18px;box-shadow:0 40px 90px -30px #000}
  .stage.a{width:min(520px,92vw)}
  .stage.b{width:min(300px,92vw)}
  svg{display:block;width:100%;height:auto}
  .strip{display:grid;grid-template-columns:repeat(${STRIP},1fr);gap:9px;
         width:min(1180px,96vw);margin-top:36px}
  .cell{background:#100f0d;border-radius:13px;padding:7px}
  @media(max-width:820px){.strip{grid-template-columns:repeat(3,1fr)}}
</style>
<h1>${rig.title}</h1>
<p class="sub">שתי זוויות, חזרה אחת, בקצב אמיתי.</p>
<div class="views">
  <div class="stage a">${reel(main, 'hero')}</div>
  ${side ? '<div class="stage b">' + reel(side, 'hero2') + '</div>' : ''}
</div>
<div class="strip">${strip}</div>
<script>
(function(){
  var reels = [].map.call(document.querySelectorAll('.hero, .hero2'), function(s){
    return { g: s.querySelectorAll(':scope > g'), cur: 0 };
  });
  var HOLD_TOP = 300, ECC = 1550, HOLD_BOT = 220, CON = 1050;
  var TOTAL = HOLD_TOP + ECC + HOLD_BOT + CON;
  var ease = function(x){ return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x+2,3)/2; };
  function romAt(t){
    t %= TOTAL;
    if (t < HOLD_TOP) return 0;
    t -= HOLD_TOP;  if (t < ECC) return ease(t/ECC);
    t -= ECC;       if (t < HOLD_BOT) return 1;
    return 1 - ease((t - HOLD_BOT)/CON);
  }
  var t0 = performance.now();
  (function tick(now){
    var rom = romAt(now - t0);
    reels.forEach(function(r){
      var i = Math.round(rom * (r.g.length - 1));
      if (i !== r.cur) { r.g[r.cur].style.display = 'none'; r.g[i].style.display = ''; r.cur = i; }
    });
    requestAnimationFrame(tick);
  })(t0);
})();
</script>
</html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

let bad = 0, total = 0;
for (const v of [main, side]) {
  if (!v) continue;
  for (const f of v.frames) for (const p of f) {
    const nums = p.kind === 'circle' ? [p.c.x, p.c.y, p.r] : p.pts.flatMap((q) => [q.x, q.y]);
    total += 1;
    if (nums.some((n) => !isFinite(n))) bad++;
  }
}
const m = solved.metrics;
console.log('camera  az ' + solved.az + '  el ' + solved.el +
  '   clearance ' + m.clearance.toFixed(3) + '   score ' + m.score.toFixed(3));
console.log('second  ' + (alt ? 'az ' + alt.az + '  el ' + alt.el + '   clearance ' + alt.metrics.clearance.toFixed(3) : 'none'));
console.log('pieces  ' + total + '   non-finite ' + bad);
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
