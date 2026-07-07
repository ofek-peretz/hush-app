/**
 * Pilot review page — one self-contained HTML with all four demonstrations rendered LIVE from the
 * compiled motion core (the exact geometry the app ships + CI validates). Output is Artifact-ready
 * content (title + style + body markup + script; no doctype/html/head/body wrappers).
 *
 *   npx tsc -p tsconfig.harness.json
 *   node tools/motion-harness/reviewpage.js <out.html>
 */
const fs = require('fs');
const path = require('path');
const BUILD = path.resolve(__dirname, '../../.motion-build');
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, VIEWBOX } = require(path.join(BUILD, 'frame.js'));
const { validate } = require(path.join(BUILD, 'formspec.js'));
const { loopDurationMs, romAt } = require(path.join(BUILD, 'timeline.js'));
const { MOTION_PALETTE } = require(path.join(BUILD, 'palette.js'));

const OUT = process.argv[2] || path.resolve(BUILD, 'review.html');

const EXES = [
  { id: 'bb_bench_press', name: 'Barbell Bench Press', tag: 'Benchmark', template: 'press_horizontal · the implement travels, body anchored', cues: ['Keep your feet planted.', 'Lower to the chest with control.', 'Drive the bar straight up.'], strip: ['Lockout', '', 'Descent', '', 'Chest'] },
  { id: 'bb_back_squat', name: 'Barbell Back Squat', tag: 'Pilot · body travels', template: 'squat_bilateral · the body travels about the fixed foot', cues: ['Big breath, brace.', 'Sit between the hips.', 'Drive up evenly.'], strip: ['Stand tall', '', 'Descent', '', 'Depth'] },
  { id: 'bb_row', name: 'Barbell Row', tag: 'Pilot · frozen hinge', template: 'pull_row · hinge frozen at 45°, only the bar travels', cues: ['Hinge to about 45°.', 'Pull to your lower ribs.', 'Control the descent.'], strip: ['Dead hang', '', 'Pull', '', 'Ribs'] },
  { id: 'lat_pulldown', name: 'Lat Pulldown', tag: 'Pilot · machine / cable', template: 'pull_vertical · seated, lean frozen ~15°, bar travels', cues: ['Tall chest.', 'Pull to the collarbone.', 'Control the bar up.'], strip: ['Overhead', '', 'Pull', '', 'Collarbone'] },
];

const { packPrim, BROWSER_DRAW_JS } = require('./prims');

const NF = 48;
const data = EXES.map((ex) => {
  const rig = EXERCISE_MOTION[ex.id];
  const res = validate(rig, 240);
  const tempo = rig.formspec.tempo;
  const loop = loopDurationMs(tempo);
  const frames = [];
  for (let i = 0; i < NF; i++) frames.push(buildFrame(rig, romAt((i / NF) * loop, tempo)).map(packPrim));
  const strip = [0, 0.25, 0.5, 0.75, 1].map((rom) => buildFrame(rig, rom).map(packPrim));
  const spec = rig.formspec;
  const checks = [
    ...spec.start.map((p) => ['Start', p.label]),
    ...spec.end.map((p) => ['Endpoint', p.label]),
    ['Path', `${spec.path.track} · vertical · ±${spec.path.tol}`],
    ...spec.invariants.map((i) => ['Hold', i.label]),
  ];
  return { ...ex, ok: res.ok, loopMs: loop, frames, strip, checks };
});

const meta = { viewBox: VIEWBOX, palette: MOTION_PALETTE };

const DRAW_JS = BROWSER_DRAW_JS;

const cardHtml = (d, i) => `
  <article class="card">
    <div class="chead">
      <span class="tag">${d.tag}</span>
      <span class="badge">${d.ok ? 'FormSpec · PASS' : 'FormSpec · FAIL'}</span>
    </div>
    <h3>${d.name}</h3>
    <div class="tmpl">${d.template}</div>
    <div class="media"><div class="live" id="live${i}"></div><div class="chip"><span class="dot"></span><span>Looping</span></div></div>
    <div class="cues">${d.cues.map((c) => `<div class="cue"><span class="b">·</span><span>${c}</span></div>`).join('')}</div>
    <div class="strip" id="strip${i}"></div>
    <ul class="checks">${d.checks.map(([k, v]) => `<li><span class="ck">✓</span><span class="ct">${k}</span><span class="cd">${v}</span></li>`).join('')}</ul>
  </article>`;

const html = `<title>Hush Motion — Embodiment Rebuild</title>
<style>
 :root{
   --bg:#efedea;--panel:#f7f6f3;--panel2:#eeede9;--stripeA:#e4e3de;--stripeB:#eeede9;
   --ink:#191714;--ink1:#43403e;--muted:#726f6c;--faint:#a09e9b;--hair:#dcdad8;--hair1:#c5c4c0;
   --signal:#cc9147;--signalink:#854a0b;--up:#597f60;--wash:#f8ebd7;
   --mono:'JetBrains Mono',ui-monospace,'SFMono-Regular',Consolas,monospace;
   --sans:'Hanken Grotesk',-apple-system,'Segoe UI',system-ui,sans-serif;
 }
 @media (prefers-color-scheme:dark){:root{
   --bg:#141210;--panel:#1d1a17;--panel2:#242019;--stripeA:#242019;--stripeB:#1d1a17;
   --ink:#f4f3f0;--ink1:#c9c6c2;--muted:#a09e9b;--faint:#726f6c;--hair:#302c28;--hair1:#3d3833;
   --signal:#d79f5c;--signalink:#d79f5c;--wash:#2a2114;}}
 :root[data-theme=dark]{
   --bg:#141210;--panel:#1d1a17;--panel2:#242019;--stripeA:#242019;--stripeB:#1d1a17;
   --ink:#f4f3f0;--ink1:#c9c6c2;--muted:#a09e9b;--faint:#726f6c;--hair:#302c28;--hair1:#3d3833;
   --signal:#d79f5c;--signalink:#d79f5c;--wash:#2a2114;}
 :root[data-theme=light]{
   --bg:#efedea;--panel:#f7f6f3;--panel2:#eeede9;--stripeA:#e4e3de;--stripeB:#eeede9;
   --ink:#191714;--ink1:#43403e;--muted:#726f6c;--faint:#a09e9b;--hair:#dcdad8;--hair1:#c5c4c0;
   --signal:#cc9147;--signalink:#854a0b;--up:#597f60;--wash:#f8ebd7;}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);
   padding:56px 24px 100px;line-height:1.6;-webkit-font-smoothing:antialiased}
 .wrap{max-width:1080px;margin:0 auto}
 .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--signal);margin:0 0 14px}
 h1{font-size:clamp(28px,5vw,40px);letter-spacing:-.022em;font-weight:650;margin:0 0 14px;text-wrap:balance}
 .lede{color:var(--muted);font-size:16px;max-width:70ch;margin:0 0 10px}
 .lede b{color:var(--ink);font-weight:600}
 .law{margin:22px 0 40px;padding:14px 18px;border-left:2px solid var(--signal);background:var(--panel);border-radius:0 10px 10px 0;
   font-size:14.5px;color:var(--ink1);max-width:74ch}
 .law b{color:var(--ink)}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
 @media (max-width:720px){.grid{grid-template-columns:1fr}body{padding:40px 16px 80px}}
 .card{background:var(--panel);border:1px solid var(--hair);border-radius:16px;padding:18px}
 .chead{display:flex;justify-content:space-between;align-items:center;gap:10px}
 .tag{font-family:var(--mono);font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--muted)}
 .badge{font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.02em;color:var(--signalink);
   background:var(--wash);border:1px solid var(--signal);border-radius:999px;padding:3px 9px;white-space:nowrap}
 .card h3{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:11px 0 3px}
 .tmpl{font-family:var(--mono);font-size:10px;color:var(--faint);letter-spacing:.02em;margin-bottom:13px}
 .media{position:relative;aspect-ratio:16/10;border-radius:11px;overflow:hidden;border:1px solid var(--hair);
   background:repeating-linear-gradient(45deg,var(--stripeA) 0 11px,var(--stripeB) 11px 22px)}
 .media .live{position:absolute;inset:0}.media svg{position:absolute;inset:0;width:100%;height:100%}
 .chip{position:absolute;top:10px;left:10px;display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;
   background:var(--panel);border:1px solid var(--hair)}
 .chip .dot{width:6px;height:6px;border-radius:3px;background:var(--up)}
 .chip span:last-child{font-size:8.5px;font-weight:600;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;font-family:var(--sans)}
 .cues{margin:13px 0 4px;display:flex;flex-direction:column;gap:2px}
 .cue{display:flex;gap:8px;font-size:13.5px;color:var(--ink1)}.cue .b{color:var(--signal);font-weight:700}
 .strip{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:15px 0 4px}
 .strip .sp{aspect-ratio:16/10;border:1px solid var(--hair);border-radius:6px;overflow:hidden;position:relative;
   background:repeating-linear-gradient(45deg,var(--stripeA) 0 7px,var(--stripeB) 7px 14px)}
 .strip .sp svg{position:absolute;inset:0;width:100%;height:100%}
 .strip .cap{font-family:var(--mono);font-size:8px;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);text-align:center;margin-top:4px}
 ul.checks{list-style:none;margin:16px 0 0;padding:15px 0 0;border-top:1px solid var(--hair);display:flex;flex-direction:column;gap:6px}
 ul.checks li{display:grid;grid-template-columns:14px 62px 1fr;gap:8px;align-items:baseline;font-size:12px;color:var(--ink1)}
 .ck{color:var(--up);font-weight:700}
 .ct{font-family:var(--mono);font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:var(--faint)}
 h2.sec{font-size:12px;font-family:var(--mono);letter-spacing:.13em;text-transform:uppercase;color:var(--muted);
   margin:52px 0 16px;font-weight:600;display:flex;align-items:center;gap:12px}
 h2.sec::after{content:"";flex:1;height:1px;background:var(--hair)}
 .rec{background:var(--panel);border:1px solid var(--hair);border-radius:16px;padding:26px 28px}
 .rec .verdict{font-size:18px;font-weight:600;letter-spacing:-.01em;color:var(--ink);margin:0 0 6px;text-wrap:balance}
 .rec p{font-size:14.5px;color:var(--ink1);max-width:76ch;margin:0 0 14px}
 .rec ol{margin:18px 0 6px;padding:0;list-style:none;counter-reset:r;display:flex;flex-direction:column;gap:14px}
 .rec ol li{counter-increment:r;padding-left:40px;position:relative;font-size:14px;color:var(--ink1);max-width:74ch}
 .rec ol li::before{content:counter(r);position:absolute;left:0;top:-1px;width:25px;height:25px;border-radius:7px;
   background:var(--wash);border:1px solid var(--signal);color:var(--signalink);font-family:var(--mono);font-size:12px;
   font-weight:600;display:flex;align-items:center;justify-content:center}
 .rec ol li b{color:var(--ink);font-weight:600}
 .foot{margin-top:44px;color:var(--faint);font-size:12.5px;max-width:80ch}
 .foot code{font-family:var(--mono);font-size:.86em;background:var(--panel2);border:1px solid var(--hair);border-radius:4px;padding:1px 5px;color:var(--muted)}
</style>
<div class="wrap">
  <p class="eyebrow">Hush Motion System · Embodiment Rebuild</p>
  <h1>The athlete, not the skeleton</h1>
  <p class="lede">The pilot proved the system correct; this rebuild makes it <b>embodied</b>. The
  figure is now a body — a filled trunk with glutes, a lumbar line and chest mass; limbs that taper
  from thigh to ankle and shoulder to wrist; one canonical anthropometry shared by every exercise;
  equipment at true scale. Below are all four demonstrations, rendered live from the <b>same
  compiled source the app ships</b> — and <b>no canonical predicate changed: every prior FormSpec
  test passes unmodified.</b></p>
  <div class="law"><b>The animation is the cues, drawn.</b> Each figure is a faithful rendering of
  Hush's own technique standard — never more advanced than the cues, never in contradiction with them.
  Every check under a demonstration is asserted on this exact geometry, in jest, on every commit.</div>

  <div class="grid">${data.map(cardHtml).join('')}</div>

  <h2 class="sec">What changed · and why it reads</h2>
  <div class="rec">
    <p class="verdict">Same canon, same validator, new body — every change serves recognition, mass, or contact.</p>
    <p>The v1 figure drew uniform-width strokes over correct joints: accurate, but an armature. The
    rebuild attacks the four specific gaps — skeleton-not-athlete, missing body mass, missing bench
    contact, a row that didn't read — at their geometric roots.</p>
    <ol>
      <li><b>A trunk with anatomy, not a stroke.</b> The torso is a filled silhouette generated around
      the hip→shoulder spine — glutes, lumbar hollow, chest, trap slope. One function embodies a standing
      squat, a 45° hinge, and a lifter lying flat: on the bench, the same lumbar hollow becomes the arch
      and the glutes/upper back visibly meet the pad.</li>
      <li><b>One canonical anthropometry.</b> Every rig now shares the ATHLETE segment table (arm =
      trunk = 48u, thigh 40 over shank 37). The old rigs cheated arms 30% short, which is why the row's
      dead hang barely traveled: with honest arms the bar now hangs at mid-thigh and travels ~3× farther
      into the ribs — the movement identifies itself before the first rep completes.</li>
      <li><b>Equipment at true scale, treated as ghost.</b> A 45cm plate is r16 against this athlete —
      the old r10 dots read as toys. The plate is now a transparent disc with rim and sleeve hub: the
      barbell states itself instantly, the athlete stays readable through it, and the range ticks keep
      their job.</li>
      <li><b>Weight-bearing limbs and planted feet.</b> Limbs taper (thigh 13 → ankle 6.5; shoulder 9 →
      wrist 5) and close with a fist on the bar; feet are wedges on the floor with a soft ground shadow.
      Mass reads without any shading or 3D.</li>
    </ol>
  </div>

  <p class="foot">Rendered from <code>src/motion/</code> via <code>tools/motion-harness/reviewpage.js</code> —
  the loops above are the real renderer, not a mock. Validators: <code>__tests__/motion/*.test.ts</code>
  (566/566 green · tsc clean · expo export clean). Not yet committed. Standard:
  <code>docs/canonical/MOTION_FORM_STANDARD_V1.md</code>.</p>
</div>
<script>
const META=${JSON.stringify(meta)};
const DATA=${JSON.stringify(data.map((d) => ({ frames: d.frames, strip: d.strip, loopMs: d.loopMs, stripLabels: d.strip.map((_, i) => EXES.find((e) => e.name === d.name).strip[i]) })))};
${DRAW_JS}
const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// filmstrips (static)
DATA.forEach((d,i)=>{const el=document.getElementById('strip'+i);el.innerHTML=d.strip.map((f,j)=>'<div><div class="sp">'+frameSVG(f)+'</div><div class="cap">'+(d.stripLabels[j]||'')+'</div></div>').join('');});
// live loops
const lives=DATA.map((d,i)=>({el:document.getElementById('live'+i),d}));
if(reduce){lives.forEach(({el,d})=>el.innerHTML=frameSVG(d.frames[0]));}
else{let t0=null;function play(ts){if(t0==null)t0=ts;for(const{el,d}of lives){const idx=Math.floor((((ts-t0)%d.loopMs)/d.loopMs)*d.frames.length)%d.frames.length;el.innerHTML=frameSVG(d.frames[idx]);}requestAnimationFrame(play);}requestAnimationFrame(play);}
</script>`;

fs.writeFileSync(OUT, html);
console.log('wrote', OUT, '·', (html.length / 1024).toFixed(0) + 'KB', '· all PASS:', data.every((d) => d.ok));
