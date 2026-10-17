/**
 * ONE implementation of Primitive → drawing for the whole harness, in both forms:
 *   • svgEl(p, PAL)       — Node-side, unpacked {x,y} vectors (filmstrip.js, hero.js)
 *   • BROWSER_DRAW_JS     — a JS source string for the browser pages (emit.js, reviewpage.js),
 *                           consuming the PACKED [x,y] frames, with SVG + canvas renderers.
 * Every primitive kind (line/dash/polyline/quad/circle/ellipse/rect/poly/path) is supported in
 * all three code paths so the skin can evolve without renderer drift.
 */

const o = (v) => (v == null ? '' : v);

function pathD(p, X, Y) {
  return (
    `M ${X(p.start)} ${Y(p.start)} ` +
    p.segs.map((s) => `C ${X(s.c1)} ${Y(s.c1)} ${X(s.c2)} ${Y(s.c2)} ${X(s.to)} ${Y(s.to)}`).join(' ') +
    (p.closed ? ' Z' : '')
  );
}

function svgEl(p, PAL) {
  if (p.kind === 'line' || p.kind === 'dash') {
    return `<line x1="${p.a.x}" y1="${p.a.y}" x2="${p.b.x}" y2="${p.b.y}" stroke="${PAL[p.color]}" stroke-width="${p.w}" stroke-opacity="${o(p.opacity ?? 1)}" stroke-linecap="${p.kind === 'line' ? p.cap || 'round' : 'round'}"${p.kind === 'dash' ? ` stroke-dasharray="${p.dash[0]},${p.dash[1]}"` : ''}/>`;
  }
  if (p.kind === 'polyline') {
    return `<polyline points="${p.pts.map((q) => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="${PAL[p.color]}" stroke-width="${p.w}" stroke-opacity="${o(p.opacity ?? 1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (p.kind === 'quad') {
    return `<path d="M ${p.a.x} ${p.a.y} Q ${p.c.x} ${p.c.y} ${p.b.x} ${p.b.y}" fill="none" stroke="${PAL[p.color]}" stroke-width="${p.w}" stroke-linecap="round"/>`;
  }
  if (p.kind === 'circle') {
    return `<circle cx="${p.c.x}" cy="${p.c.y}" r="${p.r}" fill="${p.fill ? PAL[p.fill] : 'none'}" fill-opacity="${o(p.fillOpacity ?? 1)}" stroke="${p.stroke ? PAL[p.stroke] : 'none'}" stroke-width="${o(p.w ?? 0)}"/>`;
  }
  if (p.kind === 'ellipse') {
    return `<ellipse cx="${p.c.x}" cy="${p.c.y}" rx="${p.rx}" ry="${p.ry}" fill="${PAL[p.fill]}" fill-opacity="${o(p.opacity ?? 1)}"/>`;
  }
  if (p.kind === 'rect') {
    return `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${o(p.rx ?? 0)}" fill="${p.fill ? PAL[p.fill] : 'none'}" stroke="${p.stroke ? PAL[p.stroke] : 'none'}" stroke-width="${o(p.w ?? 0)}"/>`;
  }
  if (p.kind === 'poly') {
    return `<polygon points="${p.pts.map((q) => `${q.x},${q.y}`).join(' ')}" fill="${PAL[p.fill]}" fill-opacity="${o(p.opacity ?? 1)}"/>`;
  }
  if (p.kind === 'path') {
    return `<path d="${pathD(p, (v) => v.x, (v) => v.y)}" fill="${p.fill ? PAL[p.fill] : 'none'}" fill-opacity="${o(p.opacity ?? 1)}" stroke="${p.stroke ? PAL[p.stroke] : 'none'}" stroke-width="${o(p.w ?? 0)}"/>`;
  }
  return '';
}

// Browser-side renderer over PACKED prims ({k, a:[x,y], ...}). Expects a global META.palette.
const BROWSER_DRAW_JS = `
const PAL=META.palette;const o=(v)=>v==null?'':v;
function pathD(p){return 'M '+p.start[0]+' '+p.start[1]+' '+p.segs.map(s=>'C '+s.c1[0]+' '+s.c1[1]+' '+s.c2[0]+' '+s.c2[1]+' '+s.to[0]+' '+s.to[1]).join(' ')+(p.closed?' Z':'');}
function svgEl(p){
  if(p.k==='line'||p.k==='dash'){return '<line x1="'+p.a[0]+'" y1="'+p.a[1]+'" x2="'+p.b[0]+'" y2="'+p.b[1]+'" stroke="'+PAL[p.color]+'" stroke-width="'+p.w+'" stroke-opacity="'+o(p.opacity??1)+'" stroke-linecap="'+(p.k==='line'?(p.cap||'round'):'round')+'"'+(p.k==='dash'?' stroke-dasharray="'+p.dash[0]+','+p.dash[1]+'"':'')+'/>';}
  if(p.k==='polyline'){return '<polyline points="'+p.pts.map(q=>q[0]+','+q[1]).join(' ')+'" fill="none" stroke="'+PAL[p.color]+'" stroke-width="'+p.w+'" stroke-opacity="'+o(p.opacity??1)+'" stroke-linecap="round" stroke-linejoin="round"/>';}
  if(p.k==='quad'){return '<path d="M '+p.a[0]+' '+p.a[1]+' Q '+p.c[0]+' '+p.c[1]+' '+p.b[0]+' '+p.b[1]+'" fill="none" stroke="'+PAL[p.color]+'" stroke-width="'+p.w+'" stroke-linecap="round"/>';}
  if(p.k==='circle'){return '<circle cx="'+p.c[0]+'" cy="'+p.c[1]+'" r="'+p.r+'" fill="'+(p.fill?PAL[p.fill]:'none')+'" fill-opacity="'+o(p.fillOpacity??1)+'" stroke="'+(p.stroke?PAL[p.stroke]:'none')+'" stroke-width="'+o(p.w??0)+'"/>';}
  if(p.k==='ellipse'){return '<ellipse cx="'+p.c[0]+'" cy="'+p.c[1]+'" rx="'+p.rx+'" ry="'+p.ry+'" fill="'+PAL[p.fill]+'" fill-opacity="'+o(p.opacity??1)+'"/>';}
  if(p.k==='rect'){return '<rect x="'+p.x+'" y="'+p.y+'" width="'+p.width+'" height="'+p.height+'" rx="'+o(p.rx??0)+'" fill="'+(p.fill?PAL[p.fill]:'none')+'" stroke="'+(p.stroke?PAL[p.stroke]:'none')+'" stroke-width="'+o(p.w??0)+'"/>';}
  if(p.k==='poly'){return '<polygon points="'+p.pts.map(q=>q[0]+','+q[1]).join(' ')+'" fill="'+PAL[p.fill]+'" fill-opacity="'+o(p.opacity??1)+'"/>';}
  if(p.k==='path'){return '<path d="'+pathD(p)+'" fill="'+(p.fill?PAL[p.fill]:'none')+'" fill-opacity="'+o(p.opacity??1)+'" stroke="'+(p.stroke?PAL[p.stroke]:'none')+'" stroke-width="'+o(p.w??0)+'"/>';}
  return '';
}
function frameSVG(frame, cls){
  const vb=META.viewBox;
  return '<svg class="'+(cls||'')+'" viewBox="'+vb.x+' '+vb.y+' '+vb.w+' '+vb.h+'" xmlns="http://www.w3.org/2000/svg">'+frame.map(svgEl).join('')+'</svg>';
}
function drawCanvas(ctx, frame, scale){
  const vb=META.viewBox;
  ctx.setTransform(scale,0,0,scale,-vb.x*scale,-vb.y*scale);
  for(const p of frame){
    ctx.globalAlpha=1;ctx.lineJoin='round';
    if(p.k==='line'||p.k==='dash'){
      ctx.globalAlpha=p.opacity??1;ctx.strokeStyle=PAL[p.color];ctx.lineWidth=p.w;ctx.lineCap=p.k==='line'?(p.cap||'round'):'round';
      ctx.setLineDash(p.k==='dash'?[p.dash[0],p.dash[1]]:[]);
      ctx.beginPath();ctx.moveTo(p.a[0],p.a[1]);ctx.lineTo(p.b[0],p.b[1]);ctx.stroke();ctx.setLineDash([]);
    } else if(p.k==='polyline'){
      ctx.globalAlpha=p.opacity??1;ctx.strokeStyle=PAL[p.color];ctx.lineWidth=p.w;ctx.lineCap='round';
      ctx.beginPath();p.pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.stroke();
    } else if(p.k==='quad'){
      ctx.strokeStyle=PAL[p.color];ctx.lineWidth=p.w;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(p.a[0],p.a[1]);ctx.quadraticCurveTo(p.c[0],p.c[1],p.b[0],p.b[1]);ctx.stroke();
    } else if(p.k==='circle'){
      ctx.beginPath();ctx.arc(p.c[0],p.c[1],p.r,0,7);
      if(p.fill){ctx.globalAlpha=p.fillOpacity??1;ctx.fillStyle=PAL[p.fill];ctx.fill();ctx.globalAlpha=1;}
      if(p.stroke){ctx.strokeStyle=PAL[p.stroke];ctx.lineWidth=p.w||1;ctx.stroke();}
    } else if(p.k==='ellipse'){
      ctx.beginPath();ctx.ellipse(p.c[0],p.c[1],p.rx,p.ry,0,0,7);
      ctx.globalAlpha=p.opacity??1;ctx.fillStyle=PAL[p.fill];ctx.fill();ctx.globalAlpha=1;
    } else if(p.k==='rect'){
      ctx.beginPath();
      if(ctx.roundRect)ctx.roundRect(p.x,p.y,p.width,p.height,p.rx||0);else ctx.rect(p.x,p.y,p.width,p.height);
      if(p.fill){ctx.fillStyle=PAL[p.fill];ctx.fill();}
      if(p.stroke){ctx.strokeStyle=PAL[p.stroke];ctx.lineWidth=p.w||1;ctx.stroke();}
    } else if(p.k==='poly'){
      ctx.globalAlpha=p.opacity??1;ctx.fillStyle=PAL[p.fill];
      ctx.beginPath();p.pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();ctx.fill();ctx.globalAlpha=1;
    } else if(p.k==='path'){
      ctx.beginPath();ctx.moveTo(p.start[0],p.start[1]);
      for(const s of p.segs)ctx.bezierCurveTo(s.c1[0],s.c1[1],s.c2[0],s.c2[1],s.to[0],s.to[1]);
      if(p.closed)ctx.closePath();
      if(p.fill){ctx.globalAlpha=p.opacity??1;ctx.fillStyle=PAL[p.fill];ctx.fill();ctx.globalAlpha=1;}
      if(p.stroke){ctx.strokeStyle=PAL[p.stroke];ctx.lineWidth=p.w||1;ctx.stroke();}
    }
  }
  ctx.setTransform(1,0,0,1,0,0);
}
`;

/** Pack a primitive for the browser pages: vectors → [x,y], nested seg vectors too. */
function packPrim(p) {
  const round = (n) => Math.round(n * 10) / 10;
  const packV = (v) => [round(v.x), round(v.y)];
  const out = { k: p.kind };
  for (const key of Object.keys(p)) {
    if (key === 'kind') continue;
    const val = p[key];
    if (val && typeof val === 'object' && 'x' in val) out[key] = packV(val);
    else if (Array.isArray(val) && val.length && typeof val[0] === 'object' && 'x' in val[0]) out[key] = val.map(packV);
    else if (key === 'segs') out[key] = val.map((s) => ({ c1: packV(s.c1), c2: packV(s.c2), to: packV(s.to) }));
    else out[key] = val;
  }
  return out;
}

module.exports = { svgEl, BROWSER_DRAW_JS, packPrim };
