/** Founder page for the 3D core. No backticks below — this returns one concatenated string. */
// @ts-nocheck

module.exports = function page(d) {
  const cell = (c, i) => {
    const label = c.az === d.cam.az ? 'המצלמה שנפתרה — ' + c.az + '°'
      : c.az === 0 ? 'מבט צד — 0°' : 'מבט חזית — 90°';
    const note = 'מרפק על המסך ' + c.elbow[0] + '° → ' + c.elbow[1] + '°';
    const solved = c.az === d.cam.az ? ' solved' : '';
    return '<figure class="cell' + solved + '"><svg id="sv' + i + '" viewBox="' +
      [c.bounds.x, c.bounds.y, c.bounds.w, c.bounds.h].map((n) => Math.round(n * 10) / 10).join(' ') +
      '"></svg><figcaption><b>' + label + '</b><span>' + note + '</span></figcaption></figure>';
  };

  const bar = (r) => {
    const on = r.az === d.cam.az;
    return '<div class="row' + (on ? ' on' : '') + '"><i>' + r.az + '°</i>' +
      ['travel:' + r.travel, 'fid:' + r.fidelity, 'sep:' + r.separation, 'sol:' + r.solidity]
        .map((s) => { const [k, v] = s.split(':'); return '<u title="' + k + '" style="width:' + (Math.round(v * 100)) + '%"></u>'; }).join('') +
      '<b>' + r.score.toFixed(3) + '</b></div>';
  };

  return '<title>Hush — הליבה התלת-ממדית</title>\n' +
'<style>\n' +
':root{--g:#000;--c:#f4f1e8;--c2:#a8a290;--c3:#7d7768;--moss:#a9c49f;--ember:#e8853f;--hair:rgba(244,241,232,.12)}\n' +
'*{box-sizing:border-box;margin:0;padding:0}body,.page{background:var(--g);color:var(--c)}\n' +
'.page{direction:rtl;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;padding:32px 20px 70px;max-width:1000px;margin:0 auto;line-height:1.55}\n' +
'h1{font-size:clamp(24px,5.4vw,34px);font-weight:700;letter-spacing:-.02em;text-wrap:balance;margin-bottom:10px}\n' +
'.sub{color:var(--c2);font-size:16px;max-width:60ch;margin-bottom:26px}\n' +
'h2{font-size:12px;letter-spacing:.2em;color:var(--c3);font-weight:700;margin:38px 0 12px}\n' +
'.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}\n' +
'.cell{position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--hair);background:#000}\n' +
'.cell.solved{border-color:rgba(169,196,159,.5)}\n' +
'.cell svg{display:block;width:100%;height:auto}\n' +
'figcaption{position:absolute;inset:auto 0 0 0;padding:10px 14px;display:flex;flex-direction:column;background:linear-gradient(transparent,#000 45%)}\n' +
'figcaption b{font-size:14px}figcaption span{font-size:12px;color:var(--c3)}\n' +
'.cell.solved figcaption b{color:var(--moss)}\n' +
'.sweep{margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:11px}\n' +
'.row{display:flex;align-items:center;gap:4px;padding:1.5px 0}\n' +
'.row i{width:34px;color:var(--c3);font-style:normal;text-align:left;direction:ltr}\n' +
'.row u{height:7px;border-radius:2px;text-decoration:none;background:rgba(244,241,232,.22);min-width:1px}\n' +
'.row u:nth-of-type(1){background:#7eb2d6}.row u:nth-of-type(2){background:var(--moss)}\n' +
'.row u:nth-of-type(3){background:#8a8375}.row u:nth-of-type(4){background:var(--ember)}\n' +
'.row b{width:44px;text-align:left;direction:ltr;color:var(--c3);font-weight:400}\n' +
'.row.on b{color:var(--moss);font-weight:700}\n' +
'.legend{display:flex;gap:14px;font-size:11.5px;color:var(--c3);margin:10px 0 0;flex-wrap:wrap}\n' +
'.legend s{text-decoration:none;display:inline-flex;align-items:center;gap:5px}\n' +
'.legend s em{width:9px;height:9px;border-radius:2px;display:inline-block}\n' +
'.note{margin-top:24px;padding:16px 18px;border-radius:14px;background:rgba(244,241,232,.05);border-right:2px solid var(--moss);font-size:15px;color:var(--c2)}\n' +
'.note b{color:var(--c)}\n' +
'code{font-family:ui-monospace,Menlo,monospace;font-size:.88em;background:rgba(244,241,232,.09);padding:1px 5px;border-radius:5px;direction:ltr;display:inline-block}\n' +
'</style>\n' +
'<div class="page">\n' +
'<h1>הליבה נכתבה מחדש בתלת-ממד, והמצלמה נפתרת</h1>\n' +
'<p class="sub">המפרקים חיים בחלל. הזרוע ממוקמת לפי אילוץ אורך עצם, לא מצוירת. המצלמה נבחרת על ידי סריקה של כל זווית ומדידה של ארבעה דברים.</p>\n' +
'<div class="grid">' + d.compare.map(cell).join('') + '</div>\n' +
'<h2>הסריקה שבחרה את הזווית</h2>\n' +
'<div class="sweep">' + d.rows.map(bar).join('') + '</div>\n' +
'<div class="legend">' +
'<s><em style="background:#7eb2d6"></em>travel — כמה מהנסיעה האמיתית שורדת את ההיטל</s>' +
'<s><em style="background:#a9c49f"></em>fidelity — כמה הזוויות בקצוות נאמנות למציאות</s>' +
'<s><em style="background:#8a8375"></em>separation — האם יד אחת מסתירה את השנייה</s>' +
'<s><em style="background:#e8853f"></em>solidity — האם איבר מתכווץ לגדם</s></div>\n' +
'<div class="note"><b>מרפק אמיתי בחלל:</b> ' + d.truth.join('° → ') + '°. <b>על המסך במצלמה שנפתרה:</b> ' +
  d.read.join('° → ') + '°.<br>' +
'לשם השוואה, מבט צד מקרין את אותה תחתית ל־' + d.compare[0].elbow[1] + '° ומבט חזית ל־' + d.compare[2].elbow[1] + '°. ' +
'התשובה היא לא אחד משניהם — היא <code>azimuth ' + d.cam.az + '° / elevation ' + d.cam.el + '°</code>, וזה מספר אחד לכל תרגיל.</div>\n' +
'</div>\n' +
'<script>\n' +
'(function(){"use strict";var D=' + JSON.stringify(data(d)) + ';\n' +
'var TONE={limb:"#e9e0cf",trunk:"#ded4c0",kit:"#4a4741",frame:"#3c3833",pad:"#26231f",rail:"#6e6659",grip:"#a79d8c",cable:"#847c70",plateOn:"#bcb3a2",plateOff:"#302d28",face:"#cfc5ae",shadow:"#000000"};\n' +
'var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;\n' +
'function shade(hex,f,s){s=s||0;var n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;\n' +
' r=Math.max(0,Math.min(255,Math.round(r*f+s)));g=Math.max(0,Math.min(255,Math.round(g*f+s)));b=Math.max(0,Math.min(255,Math.round(b*f+s)));\n' +
' return "#"+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);}\n' +
'function draw(el,frame,dmin,dmax){var s="",i,p;\n' +
' for(i=0;i<frame.length;i++){p=frame[i];\n' +
'  var t=dmax>dmin?(p.d-dmin)/(dmax-dmin):1;              // 0 = furthest, 1 = nearest\n' +
'  var f=Math.min(1.18,(0.80+0.20*t)*(p.sh||1)*1.14);      // light first, then distance\n' +
'  var col=shade(TONE[p.t]||"#888888",f,(p.sp||0)*255*(0.55+0.45*t));  // specular ADDS white\n' +
'  if(p.k==="p"){var pts="";for(var q=0;q<p.v.length;q+=2)pts+=p.v[q]+","+p.v[q+1]+" ";\n' +
'   s+="<polygon points=\\""+pts+"\\" fill=\\""+col+"\\"/>";}\n' +
'  else if(p.k==="c"){s+="<circle cx=\\""+p.v[0]+"\\" cy=\\""+p.v[1]+"\\" r=\\""+p.r+"\\" fill=\\""+col+"\\"/>";}\n' +
'  else{s+="<line x1=\\""+p.v[0]+"\\" y1=\\""+p.v[1]+"\\" x2=\\""+p.v[2]+"\\" y2=\\""+p.v[3]+"\\" stroke=\\""+col+"\\" stroke-width=\\""+(p.r*2)+"\\" stroke-linecap=\\"round\\"/>";}}\n' +
' el.innerHTML=s;}\n' +
'D.compare.forEach(function(c,idx){var el=document.getElementById("sv"+idx);if(!el)return;\n' +
' var dmin=1e9,dmax=-1e9;c.frames.forEach(function(f){f.forEach(function(p){if(p.d<dmin)dmin=p.d;if(p.d>dmax)dmax=p.d;});});\n' +
' draw(el,c.frames[0],dmin,dmax); if(reduce)return;\n' +
' var n=c.frames.length,t0=performance.now(),last=-1;\n' +
' (function tick(now){requestAnimationFrame(tick);\n' +
'  var i=Math.floor((((now-t0)%3400)/3400)*n)%n; if(i!==last){last=i;draw(el,c.frames[i],dmin,dmax);}})(t0);});\n' +
'})();\n' +
'</script>';

  function data(dd) { return { compare: dd.compare.map((c) => ({ frames: c.frames })) }; }
};
