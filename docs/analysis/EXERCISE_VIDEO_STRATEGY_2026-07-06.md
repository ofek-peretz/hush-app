# Exercise Video Strategy — First Principles

**Date:** 2026-07-06 (revised same day under the single-operator constraint)
**Status:** Strategy proposal — no production work started. Founder decision required.
**Scope:** The Technique/Form demonstration system for the full exercise catalog (60 exercises today, growing).
**Binding constraint (founder, 2026-07-06):** the entire system must be creatable and maintainable
by Claude alone — no animators, 3D artists, motion designers, or contractors. Claude Design is
available for visual direction. This constraint changed the recommendation (see §4).

---

## 1. What the video is for (and what it is not)

The brief, restated as design law:

> When an athlete taps Technique mid-workout, they should immediately understand how to
> perform the movement correctly and confidently. The video supports execution. Nothing more.

Consequences that fall out of this before choosing any technology:

1. **It is a reference, not content.** The athlete is standing at a bench with a phone in one
   hand. They glance for 5–10 seconds. Anything that optimizes for watch time is wrong.
2. **Correctness is the floor, not a feature.** A demonstration with subtly wrong form is
   *worse than no demonstration* — it teaches the error with authority. This single fact
   disqualifies entire categories of solutions.
3. **Clarity beats realism.** The athlete needs joint angles, bar path, tempo, and range of
   motion. A technical drawing in motion can communicate those *better* than photoreal
   footage, the same way an exploded diagram beats a photo in a repair manual.
4. **It must feel like Hush.** One product, one hand. The existing app is a quiet paper/ink/
   ochre instrument. A demonstration that looks like a YouTube clip or a video game breaks
   the spell instantly.

## 2. Constraints from the product as it exists

| Constraint | Source | Implication |
|---|---|---|
| 60 exercises, 5 equipment families (barbell / dumbbell / machine / cable / bodyweight) | `src/data/exercises.ts` | ~18 exercises need **equipment drawings** (machines, cables), not just a figure |
| 100% on-device; backend decommissioned | launch-readiness cleanup 2026-06-24 | Remote/CDN video re-introduces hosting we deliberately killed. On-device or bust |
| `react-native-svg` 15.12 + `reanimated` 4.1 already installed; FormMedia already draws an SVG silhouette | `package.json`, `components/FormMedia.tsx` | A vector motion renderer needs **zero new native modules** |
| Media seam already built: `EXERCISE_VIDEO` map → `ExerciseVideoPlayer` (muted, looping, no controls) inside `FormMedia` (16:10, striped field, state chip) | `src/platform/media/exerciseVideo.ts` | The frame, chip, and fallback UX carry over regardless of what fills the frame |
| Cues are text, in i18n, English + Hebrew, exactly 3 per exercise | `exercises.ts`, `he.json` | **Never bake text into the asset** — it breaks Hebrew and future locales |
| Watch is deliberately minimal, phone is sole authority | watch spec | No demonstration on watch in v1 |
| 15 EAS builds/month; new native deps already force Build 23 | build budget memory | Content that needs a binary per iteration is expensive; JS+data content **rides EAS Update free** |
| Light instrument design (paper/ink/ochre), Hanken + JetBrains | design pivot 2026-06-21 | The asset should be **live-themed from design tokens**, not baked pixels, if possible |

## 3. The options, evaluated under both lenses

Each option is scored twice: on absolute merit, and under the binding constraint
("Claude executes everything").

### Option A — Fully AI-generated video (Sora/Veo/Runway class)

- **Absolute:** rejected. Anatomically unreliable (hallucinated rep mechanics — for a
  technique reference, disqualifying), and structurally drift-prone: no source of truth,
  sixty prompts are sixty slightly different worlds, and a 2027 regeneration will never
  match the 2026 batch.
- **Under the constraint, it gets worse:** curation requires *watching motion*. Claude
  can inspect extracted frames, but judging stochastic video quality frame-by-frame across
  hundreds of rerolls is the worst possible fit for the operator. **Rejected.**

### Option B — Licensed exercise-animation library (stock 3D sets)

- **Absolute:** rejected — someone else's identity, never matches our exact catalog (gaps
  get filled from a second source: exactly the "every exercise from a different app"
  failure), can't extend in-style, license risk. Instructive, though: those libraries are
  internally consistent because *one rigged character performs everything*. Own that idea.

### Option C — Mocap + AI restyling

- Rejected as a pipeline (restyle pass reintroduces drift), and mocap acquisition
  (Mixamo/ActorCore accounts, retargeting toolchains) is interactive, external work that
  the constraint excludes.

### Option D — Real-time in-app 3D

- Rejected: RN+GL maintenance tax, game-asset risk, battery cost mid-workout,
  over-engineered for an 8-second glance.

### Option E — 3D motion library rendered to stylized video (the original recommendation)

One rigged athlete in one Blender scene, mocap-seeded, line-art shader, rendered to
bundled looping clips through the existing video seam.

- **Absolute merit:** excellent — consistency by construction, owned durable asset,
  ~30–50 MB bundled. This was the right studio answer.
- **Under the constraint: fails, honestly.** Claude can script Blender headlessly and
  inspect rendered stills, but *authoring believable humanoid animation* through numeric
  keyframes judged one still at a time is precisely the workflow where a solo Claude
  produces janky output slowly. Mocap seeding (the correctness shortcut) requires
  interactive marketplace accounts and retargeting sessions. Equipment modeling in 3D
  compounds it. The plan's Phase 3 quietly assumed a human animator's eye in the loop —
  which is exactly what the founder has now excluded. **Superseded by Option F.**

### Option F — Procedural vector motion system (code-defined 2D skeletal animation) ★ RECOMMENDED

A 2D skeletal figure defined in code, per-exercise motion defined as typed pose-keyframe
data, rendered live in the app with the already-installed `react-native-svg` +
`reanimated`. The moving version of the ink silhouette `FormMedia` already draws.

- **Visual quality:** a *technical illustration in motion* — ink figure on the paper field,
  ochre accent tracing the bar path. Not photoreal, and that is the point (§1.3): it shows
  joint angles, range of motion, and tempo with diagrammatic clarity. Resolution-independent
  forever; themed live from design tokens.
- **Consistency:** perfect by construction. One figure, one stroke weight, one motion
  grammar, colors from tokens. Drift is impossible — nothing is regenerated, everything is
  versioned code+data in the repo.
- **Correctness — the decisive advantage under this operator:** motion is *authored as
  biomechanics, not as pictures*. Bar path, stance, hip/knee/elbow angles at each phase are
  numeric and reviewable; limbs are derived by inverse kinematics so hands never leave the
  bar; and **form rules become executable tests** (elbow never hyperextends; squat bar path
  stays within vertical tolerance; row torso angle holds). No video pipeline of any kind can
  regression-test technique. This converts "correct exercise technique" from a per-clip
  human judgment into a suite property.
- **Executability by Claude:** every layer is Claude's native medium — TypeScript, SVG,
  trigonometry, easing curves, test harnesses. Quality control loops through a filmstrip
  harness (render any exercise at N sample times → PNG grid → visual inspection → adjust),
  which is a workflow Claude can actually run, unlike judging video motion.
- **Cost/size/architecture:** pose data is ~1–3 KB per exercise. Zero video assets, zero
  binary growth, zero hosting, fully offline, new exercises and fixes ship via EAS Update
  without a build. No new native dependencies.
- **Risks, honestly:**
  - *The figure could look cheap.* Mitigations: the figure is styled with Claude Design
    before any animation exists (Phase 0 gate — founder approves static poses in-frame or
    the project stops there); IK + easing (not raw angle lerp) is what separates "drawn
    figure moving" from "stick figure jitter"; motion is slow and deliberate (controlled
    reps), which is the easy end of animation — no gait, no ballistics, no physics.
  - *A single side view under-communicates some movements* (stance width, grip width,
    rotation). Mitigation: the skeleton supports a locked **front view** variant; ~8–10
    exercises get it as their primary or secondary view.
  - *Perceived quality ceiling vs. rendered 3D.* True. Under the constraint, the honest
    comparison is not "vector vs. beautiful 3D" but "vector executed well vs. 3D executed
    poorly." A crisp instrument-grade diagram beats janky CGI in Hush's own design language.

**Delivery sub-decision:** render **live in-app**, not pre-rendered to video files. Live
rendering keeps theming, enables tempo control and future cue-phase sync, costs KBs, and is
*simpler* for this operator (pure RN code, no ffmpeg encode pipeline). The `EXERCISE_VIDEO`
video seam stays untouched as a parallel path — if a real video source ever appears, the map
still works; `FormMedia` gains a motion branch alongside it.

## 4. Recommendation (revised): the Hush Motion System

> **One 2D skeletal figure, defined once in code, styled once with Claude Design, performing
> every exercise from typed pose-keyframe data, rendered live on the paper field inside the
> existing `FormMedia` frame.** Correctness is enforced by inverse-kinematic constraints and
> biomechanics tests; identity is enforced by tokens; the whole library is diffable
> TypeScript that one operator — Claude — authors, verifies, and maintains.

Why this wins under the five stated criteria:

1. **Consistent Hush identity** — it doesn't imitate the design system; it is *rendered
   from* it. Paper, ink, ochre, stroke weight, the striped field: all live tokens.
2. **Correct technique** — numeric, reviewable, IK-constrained, regression-tested. The only
   option where form errors are caught by CI instead of eyeballs.
3. **Long-term maintainability** — no Blender install, no render farm, no asset binaries,
   no toolchain outside the repo. `git diff` shows exactly what changed in a movement.
   A design refresh in 2028 is a token/stroke change, applied to all 60+ instantly.
4. **Full single-operator executability** — every artifact (renderer, poses, tests,
   harness) is code Claude writes and verifies through tools it actually has.
5. **Highest quality achievable without specialists** — the quality ceiling of executed-well
   vector is genuinely high (instrument-grade technical illustration), and unlike every
   alternative, this operator can actually *reach* its ceiling.

### The one figure question

One neutral athletic figure for all 60+, not per-sex variants. Form is form; two figures
double the authoring and QA surface for zero execution value. Sex-specific setup notes live
in the text cues, where they already are.

## 5. System architecture (what actually gets built)

```
src/motion/
  skeleton.ts        — the figure: named joints, fixed segment proportions, side + front views
  kinematics.ts      — forward kinematics (pose → joint xy) + closed-form 2-bone IK
                       (shoulder–elbow–hand, hip–knee–foot) so hands/feet honor contact
                       constraints (bar, floor, bench) exactly
  pose.ts            — Pose type: root position + driven joint angles + contact targets
  timeline.ts        — keyframe interpolation with per-phase easing (setup → eccentric →
                       bottom → concentric → top), loop = exactly 2 reps + a settle beat
  equipment.ts       — the vector equipment kit, same stroke grammar as the figure:
                       barbell (bar + plate discs), dumbbell, bench, rack, cable column +
                       pulley + handle, simplified machine profiles, pull-up bar, floor line
  render/MotionFigure.tsx — the SVG renderer: figure + equipment + optional ochre path
                       trace, driven by reanimated on the shared timeline
  library/           — one file per exercise, e.g. bb_bench_press.ts:
                       view, equipment refs, contact constraints, keyframes, tempo, accent path
  index.ts           — EXERCISE_MOTION map + exerciseMotion(id) (mirrors exerciseVideo.ts)
tools/motion-harness/ — Node harness: renders any exercise at N times → SVG → PNG filmstrip
                       + animated GIF, for visual QC during authoring and founder review
__tests__/motion/     — form-rule tests (per-exercise joint-angle envelopes, bar-path
                       tolerances, contact-constraint invariants) + golden-frame snapshots
```

**Authoring model — why 60 exercises is tractable:** an exercise is *not* 15 hand-tuned
angles × 5 keyframes. The author specifies the physically meaningful curves — bar/hand path,
root (hip) path, stance, torso angle, tempo — and IK derives the limbs. A bench press is
~15 lines of data. Movements also share grammar: `incline_db_press` is `db_bench_press`
with a bench angle and adjusted path; five squat/press/row *families* cover most of the
catalog as variations. Expected steady-state authoring rate after the pilot: **4–8
exercises per working session**, including filmstrip QC and form tests.

**Integration:** `FormMedia` gains a motion branch: motion data → `MotionFigure` (chip:
LOOPING); else video (seam preserved); else the static silhouette (chip: ILLUSTRATION).
`ExerciseDemo` and `SessionFlow` need no API changes — same `exerciseId` in, same sheet out.

## 6. The system beyond the clips

- **Camera:** none — and that's now literal. One locked side-view projection as default
  (technique reads in the sagittal plane); a locked front view for the ~8–10 movements
  where stance/symmetry is the point. Nothing ever pans, zooms, or cuts. Camera motion is
  engagement language; a reference instrument holds still.
- **Framing:** the existing 16:10 `FormMedia` frame. Constant floor line, constant figure
  scale, equipment in the same stroke weight. Every exercise composes identically — that
  sameness *is* the unified feel.
- **Looping:** exactly 2 reps, 4–6 s, starting from setup with a beat of stillness so the
  loop boundary reads as "reset," not a glitch. Autoplay, muted, no controls, no scrubber,
  no play chrome — a living illustration, not a video player.
- **Are they videos at all?** No — and under the constraint that's a feature, not a
  compromise. The asset is data; the renderer is the app. "Video" survives only as the
  untouched fallback seam.
- **Technique cues:** the 3 text lines below the media stay canonical — localized,
  RTL-correct, already shipped in English and Hebrew. Never baked into the drawing.
  **Phase-synced cue highlighting** (each cue gently emphasized as the figure passes its
  phase) becomes a cheap enhancement on this architecture — it was impossible on every
  video option. Deferred to a polish phase, not v1.
- **Tempo:** the timeline takes a tempo parameter. v1 uses one calm default; the door is
  open to matching the athlete's prescribed rep tempo later.
- **Phone + Watch:** phone only in v1, per the ratified minimal-watch spec. Uniquely, this
  architecture makes a future watch glyph *possible* (the same pose data rendered tiny) —
  video never could. Not planned; just no longer impossible.
- **Offline / loading:** moot — KBs of code+data, bundled, instant, airplane-mode-proof.
  No CDN, no hosting resurrection, no binary bloat.
- **Catalog expansion:** a new exercise = one data file (usually a variation of an existing
  family) + its form test + a filmstrip check. Minutes-to-an-hour of work, in-style by
  construction, shippable via EAS Update without a build.

## 7. Production plan (single operator: Claude + Claude Design)

Every step names its executor and its verification. No step assumes a human specialist.

| Phase | Work | Executor / verification | Exit gate |
|---|---|---|---|
| **0 · Figure & style lock** | Design the figure with Claude Design: proportions, head/torso treatment, stroke weight, joint style, ochre accent grammar, equipment stroke language. Deliver 4 static poses (bench setup, squat bottom, row hinge, pulldown top) rendered inside the real `FormMedia` frame | Claude Design + static SVG in-app; founder reviews screenshots | **Founder approves the figure or the project stops here** — no animation exists yet, nothing wasted |
| **1 · Motion engine** | `skeleton` / `kinematics` (FK + 2-bone IK) / `timeline` / `MotionFigure` / the filmstrip harness; bench press end-to-end as the proving exercise | Filmstrip + GIF inspection; golden-frame snapshots; form-rule test for bench | Bench press looks right on device, loops seamlessly |
| **2 · Pilot** | 10 exercises spanning all 5 equipment families, incl. 2 machines + 1 cable (retires the equipment-drawing risk early) + the front-view variant (squat) | Filmstrips per exercise; form tests; founder device QA of the sheet | Founder passes the pilot on device |
| **3 · Batch** | Remaining ~50 by movement family (presses → rows/pulls → squats/hinges → isolation), reusing family grammars; form test per exercise | Per-batch filmstrip review + suite green; founder spot-checks each batch in-app | Full catalog covered |
| **4 · Ship & wire** | `FormMedia` motion branch, `EXERCISE_MOTION` map, i18n chip copy (en+he), remove nothing (video seam + silhouette stay as fallbacks) | tsc + jest + expo export; founder device QA | In a TestFlight build |
| **5 · Polish (post-ship, optional)** | Phase-synced cue highlighting; tempo matching; bar-path trace refinements | Same harness + tests | — |

**Realistic effort, honestly estimated:** Phase 0 ≈ 1–2 working sessions. Phase 1 ≈ 2–3
sessions (the IK/timeline engine is the hard part and the biggest quality lever). Phase 2 ≈
2–3 sessions. Phase 3 ≈ 6–10 sessions at 4–8 exercises each. Phase 4 ≈ 1 session. **Total
≈ 12–19 working sessions** at founder pace — comparable calendar time to the studio plan's
"one quarter," but with no external dependency, no procurement, and every intermediate
state verifiable and shippable.

**Quality expectation, stated plainly:** the output will read as a *precise, calm,
instrument-grade technical illustration in motion* — the moving version of the silhouette
already in the app, in Hush's exact visual language. It will not look like film or CGI. On
the brief's actual goal — *immediately understand how to perform the movement correctly* —
a clear diagram with a true bar path outperforms both, and it is the highest ceiling this
operator can genuinely reach and maintain alone for 5+ years.

## 8. What was explicitly rejected, for the record

- **AI-generated video** — anatomy unreliable, drift structural, no source of truth, and
  motion curation is the worst possible fit for this operator.
- **Stock/licensed libraries** — someone else's identity, can't extend in-style.
- **Real human footage** — excluded by the brief.
- **Real-time 3D in-app** — maintenance tax and game-asset risk without execution value.
- **3D motion library → rendered clips (the original §4)** — the right *studio* answer;
  superseded because its quality path silently depended on a human animator's eye, which
  the single-operator constraint excludes. Its durable idea (one performer, one scene, one
  style, authoring separated from delivery) survives fully in the Motion System.
- **Remote/CDN delivery** — resurrects hosting the launch architecture deliberately
  removed; unnecessary once assets are code+data.
