/**
 * EIGHT WAYS TO DRAW THE SAME MAN.
 *
 *   node tools/motion-harness/m3/styles.js <out.html> [--rig id]
 *
 * The founder stopped the build to choose a look, which is the right order and should have been
 * the first thing on the table. This renders ONE pose, at ONE camera, in eight treatments — four
 * flat and four dimensional — so the choice is made by comparison rather than by describing it.
 *
 * The 3D four are the same geometry through four different fills: nothing about the engine
 * changes, only how a face's light and specular are turned into a colour. The 2D four never touch
 * the tessellator at all — they take the projected JOINTS and draw a pictogram, which is what the
 * old system did and what a small icon may well still want.
 */
// @ts-nocheck

const fs = require('fs');
const path = require('path');
const { tessellate, castShadows } = require('./solids');
const { figureSolids } = require('./skin');
const { bestCamera } = require('./solve');
const L = require('./library');

const OUT = process.argv[2] || path.join(__dirname, 'STYLES.html');
const ri = process.argv.indexOf('--rig');
const rig = L.get(ri > 0 ? process.argv[ri + 1] : 'machine_chest_press');
const ROM = 0.62;

const solved = bestCamera(rig);
const CAM = solved.cam;
const pose = rig.poseAt(ROM);
const station = rig.stationAt(ROM);
const figure = figureSolids(pose);

const prims = tessellate(CAM, [...station, ...figure], { floorY: rig.FLOOR });
castShadows(CAM, figure, rig.RECEIVERS, prims);
castShadows(CAM, station, [rig.RECEIVERS[0]], prims);
prims.sort((a, b) => a.depth - b.depth);

let dLo = Infinity, dHi = -Infinity;
for (const p of prims) if (p.depth > -1e5) { dLo = Math.min(dLo, p.depth); dHi = Math.max(dHi, p.depth); }

/* frame on the athlete, hardware allowed to run off */
let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
for (const p of tessellate(CAM, figure, { floorY: rig.FLOOR })) {
  for (const q of (p.pts || [])) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
}
const S = Math.max(x1 - x0, y1 - y0) * 1.30;
const VB = [(x0 + x1) / 2 - S / 2, (y0 + y1) / 2 - S * 0.52, S, S].map((n) => Math.round(n * 10) / 10);

const r1 = (n) => Math.round(n * 10) / 10;
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

/* ── the four dimensional treatments: same faces, four different fills ───────── */
const SKIN = { limb: '#e9e0cf', trunk: '#ded4c0', face: '#cfc5ae', kit: '#4a4741' };
const GEAR = { frame: '#3c3833', pad: '#26231f', rail: '#6e6659', grip: '#a79d8c',
  plateOn: '#bcb3a2', plateOff: '#302d28', cable: '#847c70' };

const FILLS = {
  studio: (p, t) => {
    const base = rgbOf({ ...SKIN, ...GEAR }[p.tone] || '#888888');
    const k = Math.min(1.18, p.light * (0.80 + 0.20 * t) * 1.14);
    const sp = (p.spec || 0) * 255 * (0.55 + 0.45 * t);
    return hex(base[0] * k + sp, base[1] * k + sp, base[2] * k + sp);
  },
  clay: (p, t) => {
    const skin = { limb: '#d9cdbb', trunk: '#d2c6b3', face: '#c6b9a5', kit: '#6b6459' };
    const gear = { frame: '#5b554d', pad: '#463f38', rail: '#8b8478', grip: '#a89e8e',
      plateOn: '#b3a999', plateOff: '#4c463e', cable: '#8e8578' };
    const base = rgbOf({ ...skin, ...gear }[p.tone] || '#888888');
    const k = 0.62 + 0.38 * ((p.light - 0.44) / 0.56) * (0.86 + 0.14 * t) + 0.18;
    return hex(base[0] * k, base[1] * k, base[2] * k);
  },
  poster: (p, t) => {
    const skin = { limb: '#efe7d6', trunk: '#efe7d6', face: '#efe7d6', kit: '#3a3833' };
    const gear = { frame: '#2b2824', pad: '#1e1c19', rail: '#57514a', grip: '#6f6759',
      plateOn: '#8d8578', plateOff: '#242220', cable: '#4d473f' };
    const base = rgbOf({ ...skin, ...gear }[p.tone] || '#888888');
    const band = [0.58, 0.82, 1.0][Math.min(2, Math.floor(((p.light - 0.44) / 0.56) * 3))];
    return hex(base[0] * band, base[1] * band, base[2] * band);
  },
  highkey: (p, t) => {
    const isBody = SKIN[p.tone] != null;
    const base = rgbOf(isBody ? (p.tone === 'kit' ? '#8e8779' : '#f6f1e6') : '#211f1c');
    const k = isBody ? 0.80 + 0.20 * ((p.light - 0.44) / 0.56) : 0.72 + 0.28 * ((p.light - 0.44) / 0.56);
    return hex(base[0] * k, base[1] * k, base[2] * k);
  },
};

function render3D(name) {
  const f = FILLS[name];
  return prims.map((p) => {
    if (p.tone === 'shadow') {
      const a = name === 'poster' ? p.alpha * 1.5 : p.alpha;
      return '<path d="M' + p.pts.map((q) => r1(q.x) + ' ' + r1(q.y)).join('L') + 'Z" fill="rgba(0,0,0,' + a.toFixed(2) + ')"/>';
    }
    const t = (p.depth - dLo) / ((dHi - dLo) || 1);
    const col = f(p, t);
    if (p.kind === 'circle') return '<circle cx="' + r1(p.c.x) + '" cy="' + r1(p.c.y) + '" r="' + r1(p.r) + '" fill="' + col + '"/>';
    return '<path d="M' + p.pts.map((q) => r1(q.x) + ' ' + r1(q.y)).join('L') + 'Z" fill="' + col + '"/>';
  }).join('');
}

/* ── the four flat treatments: joints only, no tessellator ───────────────────── */
const J = (k) => { const p = CAM.project(pose.j[k]); return { x: p.u, y: p.v }; };
const LIMBS = [['hipR', 'kneeR', 15, 12], ['kneeR', 'ankleR', 12, 8], ['hipL', 'kneeL', 15, 12],
  ['kneeL', 'ankleL', 12, 8], ['shoulderR', 'elbowR', 12, 10], ['elbowR', 'wristR', 10, 7],
  ['shoulderL', 'elbowL', 12, 10], ['elbowL', 'wristL', 10, 7]];

function torsoPoly() {
  const a = J('pelvis'), b = J('chest');
  let dx = b.x - a.x, dy = b.y - a.y;
  const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  const nx = -dy, ny = dx, hw = 11, sw = 15;
  return [{ x: a.x + nx * hw, y: a.y + ny * hw }, { x: b.x + nx * sw, y: b.y + ny * sw },
    { x: b.x - nx * sw, y: b.y - ny * sw }, { x: a.x - nx * hw, y: a.y - ny * hw }];
}
const poly = (pts, fill, stroke, w) => '<path d="M' + pts.map((q) => r1(q.x) + ' ' + r1(q.y)).join('L') +
  'Z" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + w + '" stroke-linejoin="round"' : '') + '/>';
const bone = (a, b, w, col, cap = 'round') => '<line x1="' + r1(a.x) + '" y1="' + r1(a.y) + '" x2="' + r1(b.x) +
  '" y2="' + r1(b.y) + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="' + cap + '"/>';

function render2D(mode) {
  const head = J('head'), out = [];
  const INK = '#141310', BODY = '#e9e2d3', KIT = '#4a4741';
  if (mode === 'solid') {
    for (const [a, b, w] of LIMBS) out.push(bone(J(a), J(b), w, BODY));
    out.push(poly(torsoPoly(), BODY));
    out.push('<circle cx="' + r1(head.x) + '" cy="' + r1(head.y) + '" r="10" fill="' + BODY + '"/>');
  } else if (mode === 'outline') {
    for (const [a, b, w] of LIMBS) out.push(bone(J(a), J(b), w, '#0c0b09'));
    out.push(poly(torsoPoly(), '#0c0b09'));
    out.push('<circle cx="' + r1(head.x) + '" cy="' + r1(head.y) + '" r="10.5" fill="#0c0b09"/>');
    for (const [a, b, w] of LIMBS) out.push(bone(J(a), J(b), w - 3.4, '#0c0b09'));
    for (const [a, b, w] of LIMBS) out.push(bone(J(a), J(b), Math.max(1, w - 5), BODY));
    out.push(poly(torsoPoly(), '#0c0b09'));
    out.push('<circle cx="' + r1(head.x) + '" cy="' + r1(head.y) + '" r="7.6" fill="#0c0b09"/>');
  } else if (mode === 'twotone') {
    for (const [a, b, w] of LIMBS) out.push(bone(J(a), J(b), w + 3, INK));
    out.push(poly(torsoPoly(), INK, INK, 3));
    out.push('<circle cx="' + r1(head.x) + '" cy="' + r1(head.y) + '" r="11.6" fill="' + INK + '"/>');
    for (const [a, b, w] of LIMBS) out.push(bone(J(a), J(b), w, BODY));
    out.push(poly(torsoPoly(), BODY));
    out.push('<circle cx="' + r1(head.x) + '" cy="' + r1(head.y) + '" r="10" fill="' + BODY + '"/>');
    for (const [a, b, w] of [['hipR', 'kneeR', 15], ['hipL', 'kneeL', 15]]) {
      const p = J(a), q = J(b);
      out.push(bone(p, { x: p.x + (q.x - p.x) * 0.42, y: p.y + (q.y - p.y) * 0.42 }, w + 1, KIT));
    }
  } else {                                              // hard shadow
    const off = { x: 4.5, y: 3.2 };
    const sh = (p) => ({ x: p.x + off.x, y: p.y + off.y });
    for (const [a, b, w] of LIMBS) out.push(bone(sh(J(a)), sh(J(b)), w, '#8d8677'));
    out.push(poly(torsoPoly().map(sh), '#8d8677'));
    out.push('<circle cx="' + r1(head.x + off.x) + '" cy="' + r1(head.y + off.y) + '" r="10" fill="#8d8677"/>');
    for (const [a, b, w] of LIMBS) out.push(bone(J(a), J(b), w, BODY));
    out.push(poly(torsoPoly(), BODY));
    out.push('<circle cx="' + r1(head.x) + '" cy="' + r1(head.y) + '" r="10" fill="' + BODY + '"/>');
  }
  return out.join('');
}

const TILES = [
  ['1', 'תלת־ממד — סטודיו', 'מה שקיים היום: תאורה, ברק, פאזות', render3D('studio'), '#0b0a09'],
  ['2', 'תלת־ממד — חימר', 'בלי ברק, גוון אחד, אור רך', render3D('clay'), '#100e0c'],
  ['3', 'תלת־ממד — פוסטר', 'שלוש רמות אור בלבד, ניגוד גבוה', render3D('poster'), '#0a0908'],
  ['4', 'תלת־ממד — מפתח גבוה', 'גוף כמעט לבן, ציוד כמעט שחור', render3D('highkey'), '#0d0c0b'],
  ['5', 'דו־ממד — צללית', 'צורה אחת מלאה, בלי פנים', render2D('solid'), '#0b0a09'],
  ['6', 'דו־ממד — קו', 'מתאר בלבד, בלי מילוי', render2D('outline'), '#e9e2d3'],
  ['7', 'דו־ממד — שני גוונים', 'גוף ומדים, קו מתאר כהה', render2D('twotone'), '#0b0a09'],
  ['8', 'דו־ממד — צל קשה', 'שטוח עם צל אחד מוסט', render2D('shadow'), '#12100e'],
];

const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<title>Hush — שמונה שפות עיצוב</title>
<style>
  :root{color-scheme:dark}*{box-sizing:border-box}
  body{margin:0;background:#070706;color:#e9e3d7;
       font:400 15px/1.6 -apple-system,"Segoe UI",system-ui,sans-serif;padding:44px 22px 70px}
  h1{font-size:25px;font-weight:600;margin:0 0 6px;text-align:center}
  p.sub{margin:0 0 34px;color:#847d70;text-align:center;font-size:14px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;max-width:1420px;margin:0 auto}
  .tile{border-radius:16px;overflow:hidden;border:1px solid #232120}
  .art{aspect-ratio:1;display:block}
  svg{display:block;width:100%;height:100%}
  .cap{padding:10px 12px 12px;background:#0e0d0c}
  .cap b{display:block;font-size:14px}
  .cap i{display:block;font-style:normal;font-size:12px;color:#7d766a;margin-top:2px}
  .n{display:inline-block;min-width:20px;height:20px;line-height:20px;text-align:center;border-radius:6px;
     background:#2a2724;color:#cfc7b6;font-size:12px;margin-left:7px}
  @media(max-width:1080px){.grid{grid-template-columns:repeat(2,1fr)}}
</style>
<h1>שמונה שפות עיצוב</h1>
<p class="sub">אותה תנוחה, אותה מצלמה. תגיד מספר.</p>
<div class="grid">
${TILES.map(([n, title, note, body, bg]) => `<div class="tile">
  <div class="art" style="background:${bg}"><svg viewBox="${VB.join(' ')}" xmlns="http://www.w3.org/2000/svg">${body}</svg></div>
  <div class="cap"><b><span class="n">${n}</span>${title}</b><i>${note}</i></div>
</div>`).join('\n')}
</div>
</html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log('rig ' + rig.id + '   camera az ' + solved.az + ' el ' + solved.el);
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
