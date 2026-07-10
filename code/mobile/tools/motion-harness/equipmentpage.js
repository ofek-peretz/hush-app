/**
 * Founder review page — THE FRONTAL DIRECTIVE, EXECUTED (§3.4 Amendment 7, 2026-07-08): every
 * chest-family and shoulder-family exercise presents front-view. Renders all six chest rigs LIVE
 * from the compiled motion core, the orthographic-vs-perspective head-to-head, the covered-athlete
 * cells, and the chest/shoulder family-separation strips.
 * Output is Artifact-ready content (title + style + body + script; no doctype/html/head/body).
 *
 *   npx tsc -p tsconfig.harness.json
 *   node tools/motion-harness/equipmentpage.js <out.html>
 */
const fs = require('fs');
const path = require('path');
const BUILD = path.resolve(__dirname, '../../.motion-build');
const { EXERCISE_MOTION } = require(path.join(BUILD, 'registry.js'));
const { buildFrame, VIEWBOX } = require(path.join(BUILD, 'frame.js'));
const { validate } = require(path.join(BUILD, 'formspec.js'));
const { loopDurationMs, romAt } = require(path.join(BUILD, 'timeline.js'));
const { MOTION_PALETTE } = require(path.join(BUILD, 'palette.js'));

const OUT = process.argv[2] || path.resolve(BUILD, 'equipment.html');

const EXES = [
  {
    id: 'bb_bench_press', name: 'Barbell Bench Press', tag: 'Benchmark · head-end camera',
    station: ['THE SPOTTER’S FRAME — the lying press’s stroke is world-vertical, so face-on it lives entirely in the drawing plane: this is the one frontal staging where a chest press draws its whole path. Rule 5 is satisfied, not bought off.',
      'HONEST ARMS — lockout is canonical 25/23 in-plane (the side view needed a foreshortening license even at the top). The one projected fold sits at the chest: the humerus tucks toward the feet (25→17), which stacks the forearms vertically under the bar — the classic frontal bottom.',
      'WHAT THE SIDE VIEW NEVER SAID — both arms, both plates, the full bar crossing the frame, the straddle over the end-on bench, and the RACK GOALPOST: two uprights with J-hooks. The station now names itself with the athlete covered.'],
    strip: ['Unrack', '', 'Lower', '', 'Chest'],
  },
  {
    id: 'incline_bb_press', name: 'Incline Barbell Press', tag: 'Raised shoulder line',
    station: ['The reclined body approaches the camera, so its projection opens up: shoulders +12, the head rides above the chest dome on a visible neck, and the RECLINED BACK PAD draws behind the trunk, fused into the bench.',
      'Contact lands at the upper-chest line, just under the chin — the bar passes behind the head mid-stroke (honest occlusion; both endpoint holds are fully clear).',
      'Same rack goalpost, same vertical groove — the incline’s slant is along the depth axis, so it honestly projects vertical from this camera.'],
    strip: ['Unrack', '', 'Lower', '', 'Upper chest'],
  },
  {
    id: 'db_bench_press', name: 'Dumbbell Bench Press', tag: 'Two implements · no rack',
    station: ['Both dumbbells travel — wider and a touch deeper at the bottom (the honest stretch), converging over the chest at the top: the dumbbell arc the side view could only imply.',
      'NO RACK — the empty-handed bench is the dumbbell statement. Size hierarchy alone says dumbbell (r8 heads) vs the barbell’s r16 plates.',
      'Each hand declares its own straight converging line; the validator holds it to ±1.5.'],
    strip: ['Lockout', '', 'Lower', '', 'Chest'],
  },
  {
    id: 'incline_db_press', name: 'Incline Dumbbell Press', tag: 'Raised + converging',
    station: ['The incline body (raised shoulders, head above the dome, reclined pad) with the dumbbell arc — settle beside the upper chest, converge high.',
      'Distinct at a glance from the seated dumbbell shoulder press: reclined dome + straddle vs upright trunk; dumbbells finish close together here, wide at the ears there.'],
    strip: ['Lockout', '', 'Lower', '', 'Upper chest'],
  },
  {
    id: 'close_grip_bench', name: 'Close-Grip Bench Press', tag: 'Grip param, finally visible',
    station: ['Grip width is a FRONTAL fact — the side view could never show it. Hands at ±17 vs the bench’s ±27, read instantly against the same rack and bar.',
      'The tuck is the member’s projection: the upper arms fold along the torso into depth (25→14), keeping the elbows narrow while the forearms stay vertical columns.'],
    strip: ['Unrack', '', 'Lower', '', 'Lower chest'],
  },
  {
    id: 'machine_chest_press', name: 'Machine Chest Press', tag: 'Perspective license · presses at the viewer',
    station: ['THE PERSPECTIVE LICENSE (§3.4 Am. 7) — the press axis is the camera axis, where orthographic projection leaves no pixels (proven in the strip above the cards). Depth is therefore drawn as scale: screen = center + offset · D/(D−depth), D = 72, true stroke 30.',
      'THE GROWTH IS THE STROKE — fists (Pose.fistR), handles, and press-arm struts grow ~1.7× as they near the viewer; the elbow flare sweeps from wide-at-the-chest to gone-behind-the-fists. Played backward it no longer reads the same: growth is directional.',
      'THE CLOCK (§3.6) stands — the rep opens where the machine rests (stack seated, handles home) and PRESSES through the emphasized 2s stroke, now toward the viewer. The stack rides the true 3D stroke 1:1; the range ticks live on the tower, where the plate top lands on a tick at each hold.',
      'SIGNATURE kept + separated — high-back seat past the shoulders to head height; and against the pec deck’s reserved frame: gripped handles with UNFOLDING elbows and scale change, never wing pads with frozen elbows.'],
    strip: ['Chest', '', 'Press → viewer', '', 'Lockout, near'],
  },
];

const { packPrim, BROWSER_DRAW_JS } = require('./prims');
const { frontalStrip } = require('./frontexhibit');

const NF = 48;
/** The recognition test, drawn: the station at rom 0.85 with the athlete REMOVED. */
const coveredFrame = (rig, rom) => {
  const d = rig.decorAt(rom);
  return [...rig.scene, ...d.back, ...d.front].map(packPrim);
};
const stripOf = (rig) => [0, 0.25, 0.5, 0.75, 1].map((rom) => buildFrame(rig, rom).map(packPrim));
const data = EXES.map((ex) => {
  const rig = EXERCISE_MOTION[ex.id];
  const res = validate(rig, 240);
  const tempo = rig.formspec.tempo;
  const loop = loopDurationMs(tempo);
  const frames = [];
  for (let i = 0; i < NF; i++) frames.push(buildFrame(rig, romAt((i / NF) * loop, tempo)).map(packPrim));
  const spec = rig.formspec;
  const checks = [
    ...spec.start.map((p) => ['Start', p.label]),
    ...spec.end.map((p) => ['Endpoint', p.label]),
    ['Path', `${spec.path.track} · ${spec.path.kind} · ±${spec.path.tol}`],
    ...spec.invariants.map((i) => ['Hold', i.label]),
  ];
  return { ...ex, ok: res.ok, loopMs: loop, frames, strip: stripOf(rig), sil: coveredFrame(rig, 0.85), checks };
});

// family-separation strips: the nearest neighbors a frontal chest press must never be confused with
const SEP = [
  ['bb_bench_press', 'Bench press — lying dome, head nested, rack, bar over the chest'],
  ['bb_overhead_press', 'Overhead press — upright trunk, head on top, bar from the chin'],
  ['machine_chest_press', 'Machine chest press — chest-height handles GROWING toward you'],
  ['machine_shoulder_press', 'Machine shoulder press — handles above the shoulders, arms folding up from pillars'],
].map(([id, lab]) => ({ lab, strip: stripOf(EXERCISE_MOTION[id]) }));

const meta = { viewBox: VIEWBOX, palette: MOTION_PALETTE };
const DRAW_JS = BROWSER_DRAW_JS;

const cardHtml = (d, i) => `
  <article class="card">
    <div class="chead">
      <span class="tag">${d.tag}</span>
      <span class="badge">${d.ok ? 'FormSpec · PASS' : 'FormSpec · FAIL'}</span>
    </div>
    <h3>${d.name}</h3>
    <div class="media"><div class="live" id="live${i}"></div><div class="chip"><span class="dot"></span><span>Looping</span></div></div>
    <div class="cues">${d.station.map((c) => `<div class="cue"><span class="b">·</span><span>${c}</span></div>`).join('')}</div>
    <div class="strip" id="strip${i}"></div>
    <ul class="checks">${d.checks.map(([k, v]) => `<li><span class="ck">✓</span><span class="ct">${k}</span><span class="cd">${v}</span></li>`).join('')}</ul>
  </article>`;

const html = `<title>Hush Motion — The Frontal Directive</title>
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
 .card h3{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:11px 0 13px}
 .media{position:relative;aspect-ratio:16/10;border-radius:11px;overflow:hidden;border:1px solid var(--hair);
   background:repeating-linear-gradient(45deg,var(--stripeA) 0 11px,var(--stripeB) 11px 22px)}
 .media .live{position:absolute;inset:0}.media svg{position:absolute;inset:0;width:100%;height:100%}
 .chip{position:absolute;top:10px;left:10px;display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;
   background:var(--panel);border:1px solid var(--hair)}
 .chip .dot{width:6px;height:6px;border-radius:3px;background:var(--up)}
 .chip span:last-child{font-size:8.5px;font-weight:600;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;font-family:var(--sans)}
 .cues{margin:13px 0 4px;display:flex;flex-direction:column;gap:2px}
 .cue{display:flex;gap:8px;font-size:13.5px;color:var(--ink1)}.cue .b{color:var(--signal);font-weight:700}
 .strip{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin:15px 0 4px}
 .strip .sp{aspect-ratio:16/10;border:1px solid var(--hair);border-radius:6px;overflow:hidden;position:relative;
   background:repeating-linear-gradient(45deg,var(--stripeA) 0 7px,var(--stripeB) 7px 14px)}
 .strip .sp.cov{border-color:var(--signal)}
 .strip .cap.covcap{color:var(--signalink);font-weight:700}
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
 .hh{display:flex;flex-direction:column;gap:12px;margin:16px 0 18px}
 .hhlab{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
 .hhstrip{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}
 .hhstrip .sp{aspect-ratio:16/10;border:1px solid var(--hair);border-radius:6px;overflow:hidden;position:relative;
   background:repeating-linear-gradient(45deg,var(--stripeA) 0 7px,var(--stripeB) 7px 14px)}
 .hhstrip .sp svg{position:absolute;inset:0;width:100%;height:100%}
 .foot{margin-top:44px;color:var(--faint);font-size:12.5px;max-width:80ch}
 .foot code{font-family:var(--mono);font-size:.86em;background:var(--panel2);border:1px solid var(--hair);border-radius:4px;padding:1px 5px;color:var(--muted)}
</style>
<div class="wrap">
  <p class="eyebrow">Hush Motion System · §3.4 Amendment 7</p>
  <h1>The frontal directive, executed</h1>
  <p class="lede">Your decision, applied as law: <b>every chest-family and shoulder-family
  exercise presents front-view</b> — machine, cable, barbell, dumbbell, and every future member.
  The shoulder family was already frontal (its four rigs are untouched). The chest family is
  rebuilt below: the benchmark bench press, both inclines, both grips, both dumbbells, and the
  seated machine — <b>no side-view chest press remains in the catalog.</b> Nothing about the
  movement canon moved: same cues, same FormSpec endpoints, same tempo, same validator —
  <b>18/18 validations · jest 567/567 · tsc clean · expo export ok.</b></p>
  <div class="law"><b>Amendment 7 (§3.4) — the frontal identity families.</b> The camera for the
  chest and shoulder families is a <b>product decision</b>, not the outcome of the view-selection
  rules: these movements’ identity lives in upper-body <b>symmetry</b>, and the family must be
  obvious from posture and overall impression before biomechanics or equipment are read. Two
  stagings implement it: lying presses take the <b>head-end camera</b>, where a world-vertical
  stroke draws fully in-plane; toward-camera strokes take the <b>perspective license</b>, where
  depth draws as scale. Rule 5 — “the stroke must live in the drawing plane” — is now scoped to
  what it always was: a theorem about <i>orthographic</i> projection.</div>

  <h2 class="sec">Why this frontal works · the two stagings</h2>
  <div class="rec">
    <p class="verdict">The lying presses did not need a license — they needed the right frontal camera. The machine press needed the assumption broken.</p>
    <p><b>The head-end camera (spotter’s frame).</b> A bench press presses <i>up</i>, not at the
    wall — so the frame that faces the athlete’s symmetry is the one looking down the bench, and
    in it the whole stroke is in-plane, with canonical arm lengths at lockout. The side view
    always needed a documented foreshortening exception; the frontal view needs one only at the
    chest, where the humerus honestly tucks. It also finally draws the things that make a bench
    press <i>look like a bench press</i>: two hands on one long bar, plates both sides, the rack
    goalpost, the straddle. The posture-primacy concern from the last round does not apply here:
    a lying dome with a nested head and a racked bar is nobody else’s signature.</p>
    <p><b>The perspective license.</b> The seated machine presses at the camera. Orthographically
    that stroke leaves no pixels — your prototype proved it, and that evidence stands (below,
    left). The broken assumption is orthography itself: with a declared perspective
    (D = 72, stroke 30), the press draws as <b>growth</b> — fists, handles, and struts scale
    ~1.7× across the emphasized 2s stroke, the elbow flare vanishes behind the fists, and the
    stack rides the true 3D stroke 1:1. Growth is directional: played backward it reads as a
    retreat, not a pull — the orthographic ambiguity is gone.</p>
    <div class="hh">
      <div class="hhrow"><div class="hhlab">Before — orthographic frontal (the 2026-07-07 prototype): the press leaves no pixels</div><div class="hhstrip" id="hhortho"></div></div>
      <div class="hhrow"><div class="hhlab">After — the perspective license, live from the shipped source: the press grows at you</div><div class="hhstrip" id="hhpersp"></div></div>
    </div>
  </div>

  <div class="grid" style="margin-top:40px">${data.map(cardHtml).join('')}</div>

  <h2 class="sec">Family separation · chest is never shoulder</h2>
  <div class="rec">
    <p class="verdict">One camera for both families, four signatures that never touch.</p>
    <p>The risk of an all-frontal upper body is chest and shoulder presses blurring. They don’t —
    each pair below separates on posture alone: <b>where the body is</b> (lying dome + straddle
    vs upright trunk), <b>where the hands start</b> (chest line vs chin/ears), and <b>where the
    stroke goes</b> (up the frame vs at the viewer vs from the shoulders).</p>
    <div class="hh">${SEP.map((s, i) => `<div class="hhrow"><div class="hhlab">${s.lab}</div><div class="hhstrip" id="sep${i}"></div></div>`).join('')}</div>
  </div>

  <h2 class="sec">What changed · what didn’t</h2>
  <div class="rec">
    <ol>
      <li><b>Six rigs restaged frontal</b> (bench, incline bb, db bench, incline db, close grip,
      machine chest press); the four shoulder rigs were already frontal and are byte-untouched.
      No side-view chest press remains.</li>
      <li><b>Movement canon untouched.</b> Same contact lines, same 172°-derived lockouts, same
      anchors, same tempo and §3.6 clock (barbells unrack and lower first; the machine presses
      first). Projected endpoints assert positions per rule 4; the machine’s true stroke is a
      measurable <code>stroke</code> pseudo-joint, so the depth axis is validated data.</li>
      <li><b>New statements the side view owed us:</b> the rack goalpost, grip width (close-grip
      is finally visible), the dumbbell convergence arc, the incline’s reclined pad, and full
      left/right symmetry — now asserted in jest as mirror geometry.</li>
      <li><b>The standard is amended, not bent:</b> §3.4 Amendment 7 (frontal identity families +
      perspective license), §2 benchmark restaged, §3.5 registry re-ratified (bench station added;
      pec deck’s reserved signature refined to stay disjoint from the press), §4.1 rows updated —
      arc_fly (pec deck, flies, raises) inherits <code>view: front</code> for rollout.</li>
      <li><b>Sequencing.</b> Presentation only — biomechanics, FormSpec predicates’ meanings,
      camera-never-moves, tempo, and the Duotone language are all as ratified. The GIF benchmark
      and validation deliverables are regenerated from the same source the app ships.</li>
    </ol>
  </div>

  <p class="foot">Bodies: <code>src/motion/bodies.ts (supineFrontCore)</code> · stations:
  <code>src/motion/machines.ts</code> · vocabulary: <code>src/motion/kit.ts (benchEndOn,
  rackUprights)</code>. Standard: <code>docs/canonical/MOTION_FORM_STANDARD_V1.md</code> §3.4
  Amendment 7. Rendered by <code>tools/motion-harness/equipmentpage.js</code> from the same
  compiled source the app ships. 18/18 FormSpec PASS · jest 567/567 · tsc clean · expo export
  iOS ok. Not yet committed.</p>
</div>
<script>
const META=${JSON.stringify(meta)};
const DATA=${JSON.stringify(data.map((d) => ({ frames: d.frames, strip: d.strip, sil: d.sil, loopMs: d.loopMs, stripLabels: d.strip.map((_, i) => EXES.find((e) => e.name === d.name).strip[i]) })))};
${DRAW_JS}
const ORTHO=${JSON.stringify(frontalStrip())};
const SEP=${JSON.stringify(SEP.map((s) => s.strip))};
const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.getElementById('hhortho').innerHTML=ORTHO.map((f)=>'<div class="sp">'+frameSVG(f)+'</div>').join('');
document.getElementById('hhpersp').innerHTML=DATA[5].strip.map((f)=>'<div class="sp">'+frameSVG(f)+'</div>').join('');
SEP.forEach((s,i)=>{document.getElementById('sep'+i).innerHTML=s.map((f)=>'<div class="sp">'+frameSVG(f)+'</div>').join('');});
DATA.forEach((d,i)=>{const el=document.getElementById('strip'+i);
  el.innerHTML=d.strip.map((f,j)=>'<div><div class="sp">'+frameSVG(f)+'</div><div class="cap">'+(d.stripLabels[j]||'')+'</div></div>').join('')
    +'<div><div class="sp cov">'+frameSVG(d.sil)+'</div><div class="cap covcap">Covered</div></div>';});
const lives=DATA.map((d,i)=>({el:document.getElementById('live'+i),d}));
if(reduce){lives.forEach(({el,d})=>el.innerHTML=frameSVG(d.frames[0]));}
else{let t0=null;function play(ts){if(t0==null)t0=ts;for(const{el,d}of lives){const idx=Math.floor((((ts-t0)%d.loopMs)/d.loopMs)*d.frames.length)%d.frames.length;el.innerHTML=frameSVG(d.frames[idx]);}requestAnimationFrame(play);}requestAnimationFrame(play);}
</script>`;

fs.writeFileSync(OUT, html);
console.log('wrote', OUT, '·', (html.length / 1024).toFixed(0) + 'KB', '· all PASS:', data.every((d) => d.ok));
