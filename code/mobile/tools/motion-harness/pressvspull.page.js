/**
 * The founder-facing page for pressvspull.js. Artifact-ready content only
 * (title + style + body + script — no doctype/html/head/body).
 */
// @ts-nocheck

module.exports = function page(data) {
  const V = data.viewbox;
  const vb = `${V.x} ${V.y} ${V.w} ${V.h}`;

  // TODAY — the shipped light palette, exactly as it renders now.
  const LIGHT = {
    paper0: '#fbfaf8', paper1: '#f7f6f3', paper2: '#eeede9', paper3: '#e4e3de',
    ink0: '#191714', ink1: '#43403e', ink2: '#726f6c', ink3: '#a09e9b', ink4: '#c5c4c1',
    line0: '#dcdad8', line1: '#c5c4c0', line2: '#b3b1ad', up: '#597f60',
  };
  // AFTER — the same primitives, re-lit. The body is the light; the machine recedes.
  const DARK = {
    paper0: '#1a1714', paper1: '#221e1a', paper2: '#15120f', paper3: '#0e0c0a',
    ink0: '#f4f1e8', ink1: '#cfc8b8', ink2: '#8a8375', ink3: '#5c5650', ink4: '#332f2b',
    line0: '#2a2621', line1: '#3a352f', line2: '#4a443d', up: '#a9c49f',
  };

  const json = JSON.stringify(data);

  return `<title>Hush — דחיקה מול משיכה</title>
<style>
:root{
  --ground:#000; --cream:#f4f1e8; --cream2:#a8a290; --cream3:#7d7768;
  --ember:#e8853f; --moss:#a9c49f; --hair:rgba(244,241,232,.12);
  --settle:cubic-bezier(.22,1,.36,1);
}
*{box-sizing:border-box;margin:0;padding:0}
body,.page{background:var(--ground);color:var(--cream)}
.page{direction:rtl;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;
  padding:34px 20px 80px;max-width:940px;margin:0 auto;line-height:1.55}

h1{font-size:clamp(26px,6vw,38px);font-weight:700;letter-spacing:-.02em;text-wrap:balance;
  margin-bottom:10px}
.sub{color:var(--cream2);font-size:16px;max-width:60ch;margin-bottom:34px}
h2{font-size:13px;font-weight:700;letter-spacing:.18em;color:var(--cream3);
  margin:44px 0 4px;text-transform:uppercase}
.lede{font-size:19px;font-weight:600;margin-bottom:20px;text-wrap:balance}
.lede.bad{color:#e08a6a}
.lede.good{color:var(--moss)}

.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:620px){.pair{grid-template-columns:1fr}}

.cell{border-radius:20px;overflow:hidden;position:relative;border:1px solid var(--hair)}
.cell.today{background:#f7f6f3}
.cell.after{background:#000}
.cell svg{display:block;width:100%;height:auto}
.cap{position:absolute;inset:auto 0 0 0;padding:11px 16px;display:flex;
  justify-content:space-between;align-items:baseline;gap:10px;font-size:14px}
.cell.today .cap{color:#43403e;background:linear-gradient(transparent,#f7f6f3 42%)}
.cell.after .cap{color:var(--cream2);background:linear-gradient(transparent,#000 42%)}
.cap b{font-weight:700}
.cell.after .cap b{color:var(--cream)}
.tag{font-size:11px;letter-spacing:.14em;font-weight:700;padding:3px 8px;border-radius:999px;
  white-space:nowrap}
.tag.press{background:rgba(232,133,63,.16);color:var(--ember)}
.tag.pull{background:rgba(126,178,214,.16);color:#7eb2d6}

.signals{margin-top:26px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1px;
  background:var(--hair);border:1px solid var(--hair);border-radius:16px;overflow:hidden}
.sig{background:#000;padding:16px 17px}
.sig .n{font-size:11px;letter-spacing:.16em;color:var(--cream3);font-weight:700;margin-bottom:6px}
.sig .t{font-weight:700;margin-bottom:4px}
.sig .d{font-size:14px;color:var(--cream2);line-height:1.5}
.sig.free .n{color:var(--moss)}

.note{margin-top:22px;padding:16px 18px;border-radius:14px;background:rgba(244,241,232,.045);
  border-right:2px solid var(--ember);font-size:15px;color:var(--cream2)}
.note b{color:var(--cream)}
code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.88em;
  background:rgba(244,241,232,.09);padding:1px 5px;border-radius:5px;direction:ltr;display:inline-block}
@media (prefers-reduced-motion:reduce){.cell svg{opacity:1}}
</style>

<div class="page">
  <h1>למה דחיקה במכונה נראית כמו משיכה — ומה מתקן את זה</h1>
  <p class="sub">שתי העמודות למטה מרונדרות מהריגים האמיתיים שבקוד. השמאלית היא מה שרץ היום.</p>

  <h2>המבחן שנתת</h2>
  <p class="lede bad">שניהם מרפקים שנפתחים ונסגרים. אי אפשר לדעת מי דוחף ומי מושך.</p>
  <div class="pair">
    <div class="cell today"><svg viewBox="${vb}" id="todayPress"></svg>
      <div class="cap"><b>דחיקת חזה במכונה</b><span class="tag press">דחיקה</span></div></div>
    <div class="cell today"><svg viewBox="${vb}" id="todayPull"></svg>
      <div class="cap"><b>משיכת פולי</b><span class="tag pull">משיכה</span></div></div>
  </div>
  <div class="note">
    <b>הסיבה, מתוך הנתונים:</b> ה-FormSpec של דחיקת החזה עוקב אחרי מפרק בשם <code>stroke</code>
    שנע מ-<code>x=0</code> ל-<code>x=30</code>. <b>אין מפרק כזה בגוף.</b> במבט חזיתי הדחיקה נוסעת
    לכיוון המצלמה — אפס תזוזה על המסך — אז הריג מזייף אותה כמספר. מה שנשאר לעין זה מרפקים,
    וזה בדיוק מה שמשיכה נראית. <b>המבט החזיתי מוחק את הציר היחיד שמבדיל ביניהם.</b>
  </div>

  <h2>אחרי</h2>
  <p class="lede good">היד של הדחיקה נוסעת <u>מהגוף החוצה</u>. היד של המשיכה נוסעת <u>אל הגוף</u>. הפוך, ולא ניתן לבלבול.</p>
  <div class="pair">
    <div class="cell after"><svg viewBox="${vb}" id="newPress"></svg>
      <div class="cap"><b>דחיקת חזה במכונה</b><span class="tag press">דחיקה</span></div></div>
    <div class="cell after"><svg viewBox="${vb}" id="newPull"></svg>
      <div class="cap"><b>משיכת פולי</b><span class="tag pull">משיכה</span></div></div>
  </div>

  <div class="signals">
    <div class="sig"><div class="n">1 — מצלמה</div><div class="t">מבט צד לכל דחיקה</div>
      <div class="d">הציר שנמחק חוזר. זה החלק היחיד שדורש נתוני ריג חדשים — 18 תרגילים.</div></div>
    <div class="sig free"><div class="n">2 — חינם</div><div class="t">חץ רק על הקונצנטרי</div>
      <div class="d">החץ מופיע רק בחצי המאמץ ומצביע לכיוון הנסיעה. שכבת רינדור בלבד.</div></div>
    <div class="sig free"><div class="n">3 — חינם</div><div class="t">השריר העובד נדלק</div>
      <div class="d">חזה לדחיקה, גב למשיכה. נגזר מהמפרקים, לא ממוקם ביד. נקרא גם בגודל אגודל.</div></div>
    <div class="sig free"><div class="n">4 — כבר בנתונים</div><div class="t">המאמץ הוא החצי המהיר</div>
      <div class="d">2000ms מול 1100ms — קיים בכל FormSpec ואף אחד לא צרך את זה. הזמן עצמו אומר מה העבודה.</div></div>
  </div>

  <div class="note" style="border-right-color:#e08a6a">
    <b>באג שלישי שנפל לי ביד תוך כדי:</b> שלבי ה-<code>Tempo</code> נקראו על שם <b>דחיקה</b> והוחלו
    על הכל. הרצף הוא <code>eccentric</code> ב-rom 0→1 ואז <code>concentric</code> ב-1→0, וכל ריג
    יורש את <code>DEFAULT_TEMPO</code>. בלחיצת חזה זה נכון. <b>במשיכת פולי rom=1 הוא המוט בחזה —
    כלומר המאמץ הוא 0→1, בדיוק החצי שהמערכת קוראת לו "אקצנטרי".</b> כלומר היום, בכל תרגיל משיכה,
    האפליקציה מנגנת את <b>העבודה לאט (2000ms) ואת החזרה מהר (1100ms)</b> — הפוך. בעמודה מימין זה
    כבר מתוקן.
  </div>

  <h2>אותה דמות, בגודל של גיבור</h2>
  <p class="lede">זו העטיפה. היא מתחלפת בכל תרגיל, כי היא הריג של התרגיל.</p>
  <div class="cell after" style="border-radius:26px">
    <svg viewBox="${vb}" id="hero" style="height:auto"></svg>
    <div class="cap" style="padding:16px 20px"><b style="font-size:19px">דחיקת חזה במכונה</b>
      <span class="tag press">חזה · דחיקה</span></div>
  </div>
</div>

<script>
(function(){
"use strict";
var D = ${json};
var LIGHT = ${JSON.stringify(LIGHT)}, DARK = ${JSON.stringify(DARK)};
var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

function prim(p, C){
  var o = p.opacity==null?1:p.opacity;
  switch(p.kind){
    case 'line': case 'dash':
      return '<line x1="'+p.a.x+'" y1="'+p.a.y+'" x2="'+p.b.x+'" y2="'+p.b.y+
        '" stroke="'+C[p.color]+'" stroke-width="'+p.w+'" stroke-opacity="'+o+
        '" stroke-linecap="round"'+(p.kind==='dash'?' stroke-dasharray="'+p.dash[0]+','+p.dash[1]+'"':'')+'/>';
    case 'polyline':
      return '<polyline points="'+p.pts.map(function(q){return q.x+','+q.y;}).join(' ')+
        '" fill="none" stroke="'+C[p.color]+'" stroke-width="'+p.w+'" stroke-opacity="'+o+
        '" stroke-linecap="round" stroke-linejoin="round"/>';
    case 'quad':
      return '<path d="M '+p.a.x+' '+p.a.y+' Q '+p.c.x+' '+p.c.y+' '+p.b.x+' '+p.b.y+
        '" fill="none" stroke="'+C[p.color]+'" stroke-width="'+p.w+'" stroke-opacity="'+o+'" stroke-linecap="round"/>';
    case 'circle':
      return '<circle cx="'+p.c.x+'" cy="'+p.c.y+'" r="'+p.r+'" fill="'+(p.fill?C[p.fill]:'none')+
        '" fill-opacity="'+(p.fillOpacity==null?1:p.fillOpacity)+'"'+
        (p.stroke?' stroke="'+C[p.stroke]+'" stroke-width="'+(p.w||0)+'"':'')+'/>';
    case 'ellipse':
      return '<ellipse cx="'+p.c.x+'" cy="'+p.c.y+'" rx="'+p.rx+'" ry="'+p.ry+'" fill="'+C[p.fill]+'" fill-opacity="'+o+'"/>';
    case 'rect':
      return '<rect x="'+p.x+'" y="'+p.y+'" width="'+p.width+'" height="'+p.height+'" rx="'+(p.rx||0)+
        '" fill="'+(p.fill?C[p.fill]:'none')+'"'+(p.stroke?' stroke="'+C[p.stroke]+'" stroke-width="'+(p.w||0)+'"':'')+'/>';
    case 'poly':
      return '<polygon points="'+p.pts.map(function(q){return q.x+','+q.y;}).join(' ')+
        '" fill="'+C[p.fill]+'" fill-opacity="'+o+'"/>';
    case 'path':
      var d='M '+p.start.x+' '+p.start.y+' '+p.segs.map(function(s){
        return 'C '+s.c1.x+' '+s.c1.y+' '+s.c2.x+' '+s.c2.y+' '+s.to.x+' '+s.to.y;}).join(' ')+(p.closed?' Z':'');
      return '<path d="'+d+'" fill="'+(p.fill?C[p.fill]:'none')+'" fill-opacity="'+o+'"'+
        (p.stroke?' stroke="'+C[p.stroke]+'" stroke-width="'+(p.w||0)+'"':'')+'/>';
  }
  return '';
}

/* signal 3 — the working muscle lights during the effort */
function muscle(f, id){
  if(!f.m) return '';
  var a = f.c ? 1 : 0.22;                     // only the concentric is lit
  return '<circle cx="'+f.m.x+'" cy="'+f.m.y+'" r="17" fill="url(#g'+id+')" opacity="'+a+'"/>';
}
/* signal 2 — an arrow on the concentric only, along the direction of travel */
function arrow(f){
  // f.dir is the travel direction. NOT f.d — that is the frame's primitive patch, and reading
  // it here produced a well-formed arrow at NaN,NaN on every frame but the first.
  // (this file is one template literal: no backticks below this line)
  if(!f.c || !f.at || !f.dir) return '';
  var L = Math.hypot(f.dir.x, f.dir.y); if(L < 0.05) return '';
  var ux = f.dir.x/L, uy = f.dir.y/L;
  var ox = -uy*14, oy = ux*14;                 // sit beside the hand, not on it
  var x0 = f.at.x + ox - ux*4, y0 = f.at.y + oy - uy*4;
  var x1 = x0 + ux*22, y1 = y0 + uy*22;
  var hx = -uy, hy = ux;
  return '<g stroke="#e8853f" fill="#e8853f" stroke-linecap="round">'+
    '<line x1="'+x0+'" y1="'+y0+'" x2="'+x1+'" y2="'+y1+'" stroke-width="2.4"/>'+
    '<polygon points="'+(x1+ux*5)+','+(y1+uy*5)+' '+(x1-ux*2+hx*4)+','+(y1-uy*2+hy*4)+' '+
      (x1-ux*2-hx*4)+','+(y1-uy*2-hy*4)+'" stroke="none"/></g>';
}

/* frame 0 is whole; every later frame is a sparse {index: primitive} patch over it */
function expand(clip){
  if(clip.__f) return clip.__f;
  var base = clip.frames[0].p, out = [base];
  for(var i=1;i<clip.frames.length;i++){
    var d = clip.frames[i].d, row = base.slice();
    if(d) for(var k in d) row[k] = d[k];
    out.push(row);
  }
  clip.__f = out;
  return out;
}

function mount(id, clip, dark, withSignals){
  var el = document.getElementById(id); if(!el) return;
  var C = dark ? DARK : LIGHT;
  var prims = expand(clip);
  var defs = '<defs><radialGradient id="g'+id+'">'+
    '<stop offset="0%" stop-color="#ff9a4d" stop-opacity=".85"/>'+
    '<stop offset="100%" stop-color="#ff9a4d" stop-opacity="0"/></radialGradient></defs>';
  var n = clip.frames.length, t0 = performance.now();
  function paint(i){
    var f = clip.frames[i];
    el.innerHTML = defs + (withSignals ? muscle(f, id) : '') +
      prims[i].map(function(p){return prim(p, C);}).join('') +
      (withSignals ? arrow(f) : '');
  }
  // ?freeze=0..1 holds every figure at one point of its rep — for review screenshots and for
  // reading a single frame without chasing it. 0.9 lands inside the effort on both columns.
  var frz = new URLSearchParams(location.search).get('freeze');
  if(frz !== null){ paint(Math.min(n-1, Math.max(0, Math.round(parseFloat(frz) * (n-1))))); return; }
  paint(0);
  if(reduce) return;
  /* A clip holds n frames over repMs — repainting on EVERY rAF rebuilds the same SVG
     string 60 times a second to draw 12 distinct frames. Five figures on one page and the
     renderer stalls. Paint only when the frame index actually changes. */
  var last = 0;
  (function tick(now){
    requestAnimationFrame(tick);
    var i = Math.floor((((now - t0) % clip.repMs) / clip.repMs) * n) % n;
    if(i !== last){ last = i; paint(i); }
  })(t0);
}

mount('todayPress', D.todayPress, false, false);
mount('todayPull',  D.todayPull,  false, false);
mount('newPress',   D.newPress,   true,  true);
mount('newPull',    D.newPull,    true,  true);
mount('hero',       D.newPress,   true,  true);
})();
</script>`;
};
