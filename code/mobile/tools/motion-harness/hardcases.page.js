/**
 * Founder page for hardcases.js. Artifact-ready content (title + style + body + script).
 * NOTE: this whole file is one template literal — no backticks below.
 */
// @ts-nocheck

module.exports = function page(data) {
  const V = data.viewbox;
  const vb = V.x + ' ' + V.y + ' ' + V.w + ' ' + V.h;
  const DARK = {
    paper0: '#1a1714', paper1: '#221e1a', paper2: '#15120f', paper3: '#0e0c0a',
    ink0: '#f4f1e8', ink1: '#cfc8b8', ink2: '#8a8375', ink3: '#5c5650', ink4: '#332f2b',
    line0: '#2a2621', line1: '#3a352f', line2: '#4a443d', up: '#a9c49f',
  };

  const cell = (c) => '<figure class="cell' + (c.old ? ' old' : '') + '">' +
    '<svg viewBox="' + vb + '" id="sv_' + c.key + '"></svg>' +
    '<figcaption><b>' + c.title + '</b><span>' + c.plane + ' · ' + c.muscle + '</span></figcaption></figure>';

  const frontal = data.cells.filter((c) => !c.old && c.plane.indexOf('חזיתי') >= 0);
  const sagittal = data.cells.filter((c) => !c.old && c.plane.indexOf('סגיטלי') >= 0);
  const old = data.cells.filter((c) => c.old);

  return '<title>Hush — שלושת המקרים הקשים</title>\n' +
'<style>\n' +
':root{--ground:#000;--cream:#f4f1e8;--cream2:#a8a290;--cream3:#7d7768;--ember:#e8853f;--moss:#a9c49f;--hair:rgba(244,241,232,.12);}\n' +
'*{box-sizing:border-box;margin:0;padding:0}\n' +
'body,.page{background:var(--ground);color:var(--cream)}\n' +
'.page{direction:rtl;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;padding:34px 20px 80px;max-width:1040px;margin:0 auto;line-height:1.55}\n' +
'h1{font-size:clamp(25px,5.6vw,36px);font-weight:700;letter-spacing:-.02em;text-wrap:balance;margin-bottom:12px}\n' +
'.sub{color:var(--cream2);font-size:16px;max-width:62ch;margin-bottom:14px}\n' +
'.rule{margin:22px 0 8px;padding:18px 20px;border-radius:16px;background:rgba(244,241,232,.05);border-right:2px solid var(--moss);font-size:16px}\n' +
'.rule b{color:var(--cream)}\n' +
'.rule .big{display:block;font-size:19px;font-weight:700;margin:8px 0 2px;color:var(--moss)}\n' +
'h2{font-size:12px;font-weight:700;letter-spacing:.2em;color:var(--cream3);margin:40px 0 12px}\n' +
'.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}\n' +
'.cell{position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--hair);background:#000}\n' +
'.cell.old{background:#f7f6f3}\n' +
'.cell svg{display:block;width:100%;height:auto}\n' +
'figcaption{position:absolute;inset:auto 0 0 0;padding:10px 15px;display:flex;flex-direction:column;gap:1px;background:linear-gradient(transparent,#000 45%)}\n' +
'.cell.old figcaption{background:linear-gradient(transparent,#f7f6f3 45%);color:#43403e}\n' +
'figcaption b{font-size:15px}\n' +
'figcaption span{font-size:11.5px;letter-spacing:.05em;color:var(--cream3)}\n' +
'.cell.old figcaption span{color:#726f6c}\n' +
'.foot{margin-top:34px;font-size:15px;color:var(--cream2);max-width:62ch}\n' +
'.foot b{color:var(--cream)}\n' +
'@media (prefers-reduced-motion:reduce){.cell svg{opacity:1}}\n' +
'</style>\n' +
'<div class="page">\n' +
'<h1>הכלל שנשבר: המצלמה נקבעה לפי אזור בגוף, לא לפי מישור התנועה</h1>\n' +
'<p class="sub">הדירקטיבה הקודמת אמרה "כל תרגילי החזה מלפנים". אבל אזור בגוף הוא לא כיוון, ובחזה יש תנועות בשני מישורים שונים.</p>\n' +
'<div class="rule">לחיצת חזה נוסעת על ציר <b>קדימה־אחורה</b> של הגוף. מבט חזית מכוון את המצלמה בדיוק לאורך הציר הזה, ולכן הנסיעה מתאפסת ונשארים רק מרפקים.<br>פרפר וכבלים נוסעים <b>לרוחב הגוף</b>. שם מבט חזית הוא בדיוק הנכון — הידיים נסגרות מרחוק אל המרכז, וזו כל התנועה. מבט צד היה מניח זרוע אחת על השנייה.\n' +
'<span class="big">המצלמה הולכת אחרי מישור התנועה, לא אחרי אזור בגוף.</span>\n' +
'סגיטלי → מבט צד · חזיתי → מבט חזית.</div>\n' +
'<h2>מישור חזיתי — מבט חזית הוא הנכון</h2>\n' +
'<div class="grid">' + frontal.map(cell).join('') + '</div>\n' +
'<h2>מישור סגיטלי — מבט צד הוא הנכון</h2>\n' +
'<div class="grid">' + sagittal.map(cell).join('') + '</div>\n' +
'<h2>ולשם השוואה — face pull כפי שהוא היום</h2>\n' +
'<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(250px,320px))">' + old.map(cell).join('') + '</div>\n' +
'<p class="foot">ה-face pull הישן צויר <b>מהגב</b> כדי שעמוד הכבל לא יחצה את הגוף. הוא לא היה צריך את זה — הוא תרגיל במישור חזיתי, אז המצלמה מלפנים תמיד הייתה נכונה. מה שהיה חסר זה לתלות את החבל <b>מלמעלה</b>, וההסתרה נפתרת בלי להפוך את האתלט.</p>\n' +
'<p class="foot"><b>עומק מצויר בכנות:</b> איבר שמסתובב לכיוון המצלמה <b>מתקצר</b> על המסך והאגרוף שלו גדל. זו אותה רישיון פרספקטיבה שהריגים הקיימים כבר משתמשים בו — לא טריק חדש.</p>\n' +
'</div>\n' +
'<script>\n' +
'(function(){"use strict";\n' +
'var D = ' + JSON.stringify(data) + ';\n' +
'var C = ' + JSON.stringify(DARK) + ';\n' +
'var LIGHT = {paper0:"#fbfaf8",paper1:"#f7f6f3",paper2:"#eeede9",paper3:"#e4e3de",ink0:"#191714",ink1:"#43403e",ink2:"#726f6c",ink3:"#a09e9b",ink4:"#c5c4c1",line0:"#dcdad8",line1:"#c5c4c0",line2:"#b3b1ad",up:"#597f60"};\n' +
'var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;\n' +
'function prim(p,C){var o=p.opacity==null?1:p.opacity;\n' +
' switch(p.kind){\n' +
'  case "line": case "dash": return "<line x1=\\""+p.a.x+"\\" y1=\\""+p.a.y+"\\" x2=\\""+p.b.x+"\\" y2=\\""+p.b.y+"\\" stroke=\\""+C[p.color]+"\\" stroke-width=\\""+p.w+"\\" stroke-opacity=\\""+o+"\\" stroke-linecap=\\"round\\""+(p.kind==="dash"?" stroke-dasharray=\\""+p.dash[0]+","+p.dash[1]+"\\"":"")+"/>";\n' +
'  case "polyline": return "<polyline points=\\""+p.pts.map(function(q){return q.x+","+q.y;}).join(" ")+"\\" fill=\\"none\\" stroke=\\""+C[p.color]+"\\" stroke-width=\\""+p.w+"\\" stroke-opacity=\\""+o+"\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"/>";\n' +
'  case "quad": return "<path d=\\"M "+p.a.x+" "+p.a.y+" Q "+p.c.x+" "+p.c.y+" "+p.b.x+" "+p.b.y+"\\" fill=\\"none\\" stroke=\\""+C[p.color]+"\\" stroke-width=\\""+p.w+"\\" stroke-opacity=\\""+o+"\\" stroke-linecap=\\"round\\"/>";\n' +
'  case "circle": return "<circle cx=\\""+p.c.x+"\\" cy=\\""+p.c.y+"\\" r=\\""+p.r+"\\" fill=\\""+(p.fill?C[p.fill]:"none")+"\\" fill-opacity=\\""+(p.fillOpacity==null?1:p.fillOpacity)+"\\""+(p.stroke?" stroke=\\""+C[p.stroke]+"\\" stroke-width=\\""+(p.w||0)+"\\"":"")+"/>";\n' +
'  case "ellipse": return "<ellipse cx=\\""+p.c.x+"\\" cy=\\""+p.c.y+"\\" rx=\\""+p.rx+"\\" ry=\\""+p.ry+"\\" fill=\\""+C[p.fill]+"\\" fill-opacity=\\""+o+"\\"/>";\n' +
'  case "rect": return "<rect x=\\""+p.x+"\\" y=\\""+p.y+"\\" width=\\""+p.width+"\\" height=\\""+p.height+"\\" rx=\\""+(p.rx||0)+"\\" fill=\\""+(p.fill?C[p.fill]:"none")+"\\""+(p.stroke?" stroke=\\""+C[p.stroke]+"\\" stroke-width=\\""+(p.w||0)+"\\"":"")+"/>";\n' +
'  case "poly": return "<polygon points=\\""+p.pts.map(function(q){return q.x+","+q.y;}).join(" ")+"\\" fill=\\""+C[p.fill]+"\\" fill-opacity=\\""+o+"\\"/>";\n' +
'  case "path": var d="M "+p.start.x+" "+p.start.y+" "+p.segs.map(function(s){return "C "+s.c1.x+" "+s.c1.y+" "+s.c2.x+" "+s.c2.y+" "+s.to.x+" "+s.to.y;}).join(" ")+(p.closed?" Z":"");\n' +
'   return "<path d=\\""+d+"\\" fill=\\""+(p.fill?C[p.fill]:"none")+"\\" fill-opacity=\\""+o+"\\""+(p.stroke?" stroke=\\""+C[p.stroke]+"\\" stroke-width=\\""+(p.w||0)+"\\"":"")+"/>";\n' +
' } return "";}\n' +
'function expand(clip){if(clip.__f)return clip.__f;var base=clip.frames[0].p,out=[base];\n' +
' for(var i=1;i<clip.frames.length;i++){var d=clip.frames[i].d,row=base.slice();if(d)for(var k in d)row[k]=d[k];out.push(row);} clip.__f=out;return out;}\n' +
'function glow(f,id){if(!f.m)return "";return "<circle cx=\\""+f.m.x+"\\" cy=\\""+f.m.y+"\\" r=\\"16\\" fill=\\"url(#g"+id+")\\" opacity=\\""+(f.c?1:0.2)+"\\"/>";}\n' +
'function arrow(f){if(!f.c||!f.at||!f.dir)return "";var L=Math.hypot(f.dir.x,f.dir.y);if(L<0.05)return "";\n' +
' var ux=f.dir.x/L,uy=f.dir.y/L,ox=-uy*13,oy=ux*13;\n' +
' var x0=f.at.x+ox-ux*3,y0=f.at.y+oy-uy*3,x1=x0+ux*20,y1=y0+uy*20,hx=-uy,hy=ux;\n' +
' return "<g stroke=\\"#e8853f\\" fill=\\"#e8853f\\" stroke-linecap=\\"round\\"><line x1=\\""+x0+"\\" y1=\\""+y0+"\\" x2=\\""+x1+"\\" y2=\\""+y1+"\\" stroke-width=\\"2.3\\"/>"+\n' +
'  "<polygon points=\\""+(x1+ux*4.6)+","+(y1+uy*4.6)+" "+(x1-ux*2+hx*3.8)+","+(y1-uy*2+hy*3.8)+" "+(x1-ux*2-hx*3.8)+","+(y1-uy*2-hy*3.8)+"\\" stroke=\\"none\\"/></g>";}\n' +
'function mount(c){var id="sv_"+c.key,el=document.getElementById(id);if(!el)return;\n' +
' var pal=c.old?LIGHT:C, prims=expand(c.clip), n=c.clip.frames.length;\n' +
' var defs="<defs><radialGradient id=\\"g"+id+"\\"><stop offset=\\"0%\\" stop-color=\\"#ff9a4d\\" stop-opacity=\\".85\\"/><stop offset=\\"100%\\" stop-color=\\"#ff9a4d\\" stop-opacity=\\"0\\"/></radialGradient></defs>";\n' +
' function paint(i){var f=c.clip.frames[i];\n' +
'  el.innerHTML=defs+(c.old?"":glow(f,id))+prims[i].map(function(p){return prim(p,pal);}).join("")+(c.old?"":arrow(f));}\n' +
' var frz=new URLSearchParams(location.search).get("freeze");\n' +
' if(frz!==null){paint(Math.min(n-1,Math.max(0,Math.round(parseFloat(frz)*(n-1)))));return;}\n' +
' paint(0); if(reduce)return;\n' +
' var t0=performance.now(),last=0;\n' +
' (function tick(now){requestAnimationFrame(tick);\n' +
'  var i=Math.floor((((now-t0)%c.clip.repMs)/c.clip.repMs)*n)%n;\n' +
'  if(i!==last){last=i;paint(i);}})(t0);}\n' +
'D.cells.forEach(mount);\n' +
'})();\n' +
'</script>';
};
