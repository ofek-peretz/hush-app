# Hush Motion Form Standard — V1

**Date:** 2026-07-06
**Status:** Proposed for ratification (Phase 0.5 — precedes the motion engine).
**Scope:** Defines what "correct" means for every demonstration the Hush Motion System renders,
and how correctness is encoded, enforced, and kept from drifting.
**Supersedes nothing; extends** `docs/analysis/EXERCISE_VIDEO_STRATEGY_2026-07-06.md` after the
founder's 2026-07-06 reframe: the animation is not an illustration that a movement exists — it is
**the canonical Hush demonstration** of the movement.

---

## 0. The governing law

> **The animation is the cues, drawn.**
> Hush already states its technique standard in each exercise's three cues. The demonstration
> must be a faithful drawing of those cues — never more advanced than them, and never in
> contradiction with them. If the figure does anything the cues would correct, the demonstration
> is wrong, even if a textbook would allow it.

This resolves every "expert nuance vs. diagram simplicity" dispute mechanically. Example: real
bench bar paths curve slightly toward the shoulders; Hush's cue says *"Drive the bar straight
up."* The canonical demonstration therefore shows a straight vertical path. The app must never
prescribe one thing and demonstrate another — including disagreeing with itself.

Corollaries:

1. **Correct beats rich.** A simpler animation with correct movement always wins over a richer
   one with compromised movement. No secondary motion (no breathing idle, no head bob, no
   flourish) — every pixel of motion is prescribed movement.
2. **Both reps identical.** The loop shows exactly 2 reps; rep 2 is bit-identical to rep 1. No
   fatigue acting, no variation. Canon does not degrade.
3. **The mental model is the deliverable.** An athlete who watches 2–3 loops should come away
   knowing: where the movement starts, where it ends, what travels along what path, what stays
   still, and how fast each direction is. Those five things are the spec, below.

## 1. What every demonstration must encode

Five properties, each *measurable on the rendered skeleton* (not vibes):

| Property | Encoding | Enforced by |
|---|---|---|
| **Range of motion** | Canonical start and end positions defined as joint/bar predicates (e.g. "bar contacts chest line", "hip crease below knee top") | endpoint keyframes + validator |
| **Start/end positions** | The loop opens and closes at the true setup position, held for a settle beat | timeline structure |
| **Bar/hand path** | Path predicate per lift (vertical within tolerance; fixed x) | validator, sampled every frame |
| **Body position** | Invariants — what must NOT move (row hinge angle, bench hips, pulldown lean) | validator, sampled every frame |
| **Tempo** | Explicit per-phase durations: controlled eccentric, endpoint hold, decisive concentric | FormSpec `tempo`, single source |

### The FormSpec — correctness as data

Correctness is not "tests I remembered to write." Every exercise carries a typed `FormSpec`,
validated by **one generic engine** that samples the interpolated timeline and asserts every
predicate — in jest, on every commit. A keyframe edit that breaks canon fails CI.

```ts
interface FormSpec {
  tempo: { eccentricMs: number; bottomHoldMs: number; concentricMs: number; topHoldMs: number };
  start: PosePredicate[];        // what defines the setup position
  end:   PosePredicate[];        // what defines the working endpoint
  path:  { track: 'bar' | 'hand'; kind: 'vertical'; xTolerance: number };
  invariants: Invariant[];       // hold for the WHOLE rep, sampled every frame
}

type PosePredicate =            // examples — all measurable on the skeleton
  | { kind: 'contact'; a: 'bar'; b: 'chestLine' | 'torso' | 'collarboneLine' }
  | { kind: 'jointBelow'; a: 'hip'; b: 'knee'; byAtLeast: number }     // squat depth
  | { kind: 'angleAt'; joint: Joint; deg: number; tol: number };      // e.g. elbow 175±3 at lockout

type Invariant =
  | { kind: 'segmentAngleFixed'; segment: 'torso' | 'shank'; tolDeg: number } // row hinge
  | { kind: 'pointFixed'; point: 'hip' | 'ankle' | 'head'; tolPx: number }    // bench hips, planted feet
  | { kind: 'angleNever'; joint: 'elbow' | 'knee'; aboveDeg: number };        // no hyperextension
```

FormSpecs are defined per **category template** (horizontal press, squat pattern, hinge row,
vertical pull, …aligned with the catalog's capability patterns) and inherited by each exercise
with per-exercise overrides — 60 exercises, a handful of templates, one validator.

### Canonical tempo (all categories, V1)

Eccentric **2000 ms** · endpoint hold **400 ms** · concentric **1100 ms** · top reset **500 ms**
≈ 4 s/rep → 2 reps + settle ≈ 8.5 s loop. Matches the cue language ("lower with control",
"control the return") and the motion law *confirms, never performs*. Per-exercise overrides
allowed only where a cue demands it.

## 2. Canonical definitions — the four benchmarks

*(These instantiate the founder's category definitions as measurable predicates. Each line cites
the cue it draws.)*

### Barbell Bench Press — template: horizontal press
- **Start/end of rep:** lockout — bar over shoulder line, elbows ~175° (never ≥178°).
- **Bottom:** bar **contacts the chest line** (visible meeting + 400 ms hold) — *"Lower to the chest with control."*
- **Path:** vertical, x fixed ±1.5 units — *"Drive the bar straight up."*
- **Invariants:** hips and shoulders fixed on bench; head fixed; **feet planted, zero movement** — *"Keep your feet planted."*

### Barbell Back Squat — template: squat pattern
- **Start/end of rep:** standing tall — hips and knees fully extended, bar over midfoot.
- **Bottom:** **hip crease below knee top** (`hip.y > knee.y + 2`) + hold — one unambiguous depth, every rep.
- **Path:** bar vertical over midfoot ±1.5 — the balance line the athlete should feel.
- **Invariants:** torso angle at any %-of-ascent within ±5° of the same %-of-descent (**no
  good-morning squat** — hips and chest rise together, *"Drive up evenly"*); heels never leave
  the floor; knee travel forward is set at the bottom keyframe and never wobbles laterally
  (single plane by construction).

### Barbell Row — template: hinge row
- **Start/end of rep:** dead hang — elbows ~175°, bar below shoulders at arms' length.
- **Top:** bar **contacts the torso at the lower-rib point** + hold — *"Pull to your lower ribs."*
- **Path:** vertical ±1.5 under the shoulder.
- **Invariants:** **torso angle fixed at 45° ± 3° for the entire rep** — the defining rule
  (*"Hinge to about 45°"*); knee angle fixed (soft, set once); head on the torso line (neutral
  neck, no craning).

### Lat Pulldown — template: vertical pull
- **Start/end of rep:** full stretch — elbows ~175°, arms long overhead, visible lat stretch.
- **Bottom:** bar reaches the **collarbone line** + hold — *"Pull to the collarbone"*, and never
  lower (a chest-bounce endpoint would contradict the cue).
- **Path:** bar vertical ±2 in front of the face.
- **Invariants:** torso lean fixed at ~15° ± 3° (**no swing** — *"Tall chest"*); hips fixed on
  seat; thighs fixed under pad; elbows travel down-and-back, never flaring forward past the bar
  line at the bottom.

Every remaining exercise gets the same treatment when its category template is instantiated —
the four above are the patterns most of the catalog inherits from.

## 3. The three decisions (recommendations)

### 3.1 Does Duotone remain the right skin? — **Yes, with one amendment.**

Correctness lives in the pose data and the FormSpec — the skin only determines how *verifiable*
correctness is to the athlete's eye. Duotone's depth reading (near limb dark, far limb faint) is
genuinely useful for body-position comprehension, and its capsule weight keeps it feeling like
Hush rather than embedded media. Its one weakness for the new goal: thicker limbs make exact
endpoints slightly softer to read.

**Amendment — range ticks:** the ochre dashed bar path gains two short perpendicular ticks at
the canonical endpoints. The bar dot visibly touches each tick every rep; the 400 ms endpoint
hold happens exactly on the tick. Range of motion stops being something the athlete infers and
becomes something the drawing *states* — pure instrument language, borrowed from the Technical
direction's vocabulary, still within the ~2 % ochre budget. No joint nodes, no other Technical
elements migrate.

Emphasis mechanism at contact: **the hold is the emphasis.** No flashes, no pulses — motion
confirms, never performs.

**Amendment 2 (2026-07-07) — the Duotone Athlete (skin v2).** The duotone language (near side
dark `ink0`, far side faint `ink4`, no shading, no 3D) is unchanged; what the strokes describe
changed. The trunk is a **filled silhouette** generated around the hip→shoulder spine (glutes,
lumbar hollow, chest mass, trap slope — one profile that also renders the hinge and the lying
bench arch); limbs are **tapered capsules** (thigh 13 → ankle 6.5; shoulder 9 → wrist 5,
diameters) closed with a fist at the bar; feet are planted wedges with a soft ground shadow.
All rigs share one canonical anthropometry (`src/motion/anthro.ts`: arm = trunk = 48u, thigh 40,
shank 37; a rig may document a projected foreshortening, e.g. the bench humerus). Equipment is
true-scale: a 45cm plate is r16, drawn as a transparent **ghost disc** (rim + sleeve hub + bar
dot) in front of the figure — behind-the-head z-order concession only where the rim would cross
the face (back squat draws the head above the plate). Poses, FormSpecs, tempo, and the validator
are untouched by the skin.

### 3.2 Is the current architecture sufficient? — **Yes, structurally — upgraded in one place.**

The planned pipeline (pose keyframes + 2-bone IK contact constraints + interpolation) already
guarantees hands-on-bar and single-plane motion by construction. The upgrade this reframe
demands: form rules stop being per-exercise test code and become the **FormSpec data layer**
(§1) with one generic validator. The keyframes must *satisfy* the spec; the spec — not the
animation — is the canonical statement of Hush technique. It doubles as documentation, and
future exercises inherit canon from their category template instead of re-deciding it.

The IK also gains one derived guarantee for free: since limbs are solved from the bar path and
the FormSpec fixes the path and the invariants, most form errors become *unrepresentable* rather
than merely detected — a row whose torso angle is an invariant cannot be authored with a moving
hinge without the validator failing the build.

### 3.3 Is there a better visual approach for "canonical demonstration"? — **No — this one, held to a harder standard.**

The objective shift changes what the motion must satisfy, not what medium can satisfy it. Under
the single-operator constraint the alternatives (3D, AI video) got *worse* for canon — canon
requires exact, repeatable, testable positions, which is precisely what numeric skeletons give
and stochastic or hand-animated pipelines don't. What the shift genuinely adds is:

- the FormSpec layer (§1) — adopted;
- range ticks (§3.1) — adopted;
- endpoint holds and canonical tempo as normative, not stylistic — adopted;
- rejected: muscle highlighting, multi-view v1, annotation overlays — richness that doesn't
  serve the mental model, and clutter risks contradicting the paper/ink restraint.

## 4. The category model (ratification artifact — requested 2026-07-06)

### 4.0 Three mechanics, twenty templates, sixty exercises

Every demonstration in the catalog — current and future — is one of **three mechanics**:

- **Mechanic A — the implement travels; the body is anchored.** Presses, rows, pulldowns,
  isolations. The FormSpec tracks the implement's path; the invariants pin the body.
- **Mechanic B — the body travels about a fixed contact.** Squats, hinges, bridges, calf
  raises, bodyweight push/pull. The FormSpec tracks a body landmark (hip, chest, heel); the
  invariants pin the contact points (feet, hands, pads) and the alignment rules.
- **Mechanic C — static hold.** No current catalog member (no planks in V1); reserved. Tempo
  degenerates to a single `holdMs`; ROM degenerates to one position held.

A **template** is a mechanic plus a parameterization (what travels, between which endpoints,
what is pinned). An **exercise** is a template plus parameters (bench angle, grip, stance,
cable origin) and — rarely — predicate overrides. Adding a future exercise means choosing a
template and filling parameters; inventing a new template is a deliberate, reviewed event
(expected a handful per year at most, e.g. `static_hold` when planks arrive).

**Global defaults (every template inherits; overrides are per-template, listed below):**
- Tempo: eccentric **2000 ms** → endpoint hold **400 ms** → concentric **1100 ms** → top reset
  **500 ms**; loop = 2 identical reps ≈ 8.5 s. Rep order is eccentric-first unless the lift
  starts at its stretch (`concentric_first`, e.g. deadlift from the floor).
- Extension endpoints: "straight" joints at 175° ± 3°, never ≥ 178° (no hyperextension) —
  applies to every lockout and every dead-hang.
- Path: vertical within ± 1.5 units unless the template declares an arc (isolations that
  rotate about a single joint declare `arc(center=joint, radius=segment)` — the radius is the
  limb, so the arc is exact by construction; the "path constraint" becomes *the pivot joint
  must not move*).
- Camera: side view. Templates whose information is frontal declare `view: front`.
- Range ticks sit on the tracked path at the two canonical endpoints; the 400 ms hold lands
  exactly on the tick.

### 4.1 Mechanic A templates — implement travels

| Template | Start → End (canonical ROM) | Path / tracked point | Stability & invariants | Members (params) |
|---|---|---|---|---|
| **press_horizontal** | Lockout over shoulder (elbow 175°) → **bar/handle contacts chest line** | vertical, bar | hips+shoulders on bench, head fixed, feet planted (zero movement) | bb_bench_press · incline_bb_press (30° bench) · db_bench_press · incline_db_press · machine_chest_press (seated; horizontal handle path) · close_grip_bench (grip param) — **6** |
| **press_vertical** | Bar at collarbone → lockout overhead, bar over mid-foot | vertical, bar | torso vertical ±3° (no layback), knees fixed, feet planted | bb_overhead_press · db_shoulder_press (start at ears) · machine_shoulder_press · arnold_press (rotation param, path unchanged) — **4** |
| **pull_row** | Arms long (elbow 175°) → **handle contacts torso landmark** | vertical (hinged) or horizontal (seated/supported), handle | **torso angle frozen ±3° for the whole rep**; knees fixed | bb_row (45° hinge, lower ribs) · t_bar_row (chest) · db_row (bench-supported, hip) · cable_row (seated upright, waist) · machine_row (chest pad, elbows back) · face_pull (high cable, endpoint forehead, elbows lead) — **6** |
| **pull_vertical** | Full overhead stretch (elbow 175°, lats long) → **bar at collarbone line, never lower** | vertical, bar | torso lean frozen ~15° ±3° (no swing), hips on seat, thighs under pad | lat_pulldown — **1** |
| **arc_fly** | Arms open/low → arms together / **raised to shoulder height, never higher** | arc about shoulder; **elbow angle frozen (soft, ~160°)** | shoulder (pivot) fixed; torso fixed; no shrug (shoulder y constant) | pec_deck · cable_fly · rear_delt_fly (reverse direction) · lateral_raise (endpoint = shoulder height per cue) · cable_lateral_raise — **5** |
| **elbow_flexion** | Elbow 175° at side → full flexion (~55°) | arc about elbow; **elbow point pinned ±1** (the "no swinging" cue as geometry) | torso vertical fixed; shoulder fixed; wrist neutral | bb_curl · db_curl · hammer_curl (grip param) · preacher_curl (elbow pinned on pad param) — **4** |
| **elbow_extension** | Full flexion → elbow 175° lockout | arc about elbow; elbow pinned ±1 | upper-arm orientation param is **frozen** (at side / overhead / lying-vertical); torso fixed | triceps_pushdown (upper arm at side) · overhead_triceps_ext (overhead) · skullcrusher (lying, upper arm vertical) — **3** |
| **knee_extension** | Knee ~90° seated → knee 175° | arc about knee; knee pinned | hips on seat, torso fixed ("sit tall") | leg_extension — **1** |
| **knee_flexion** | Knee 175° → full curl (~60°) | arc about knee; knee pinned | **hips down/fixed** (the defining fault is hip lift) | leg_curl — **1** |
| **sled_press** | Knees ~90° (sled low) → knees 175°-minus (per cue "don't lock out hard": endpoint 168° ±3 for leg_press) | **linear along the machine rail** (declared axis), sled/platform | back flat on pad (torso angle = rail-frame constant), hips never rise off pad, heels planted on platform | leg_press · hack_squat (body rides the sled — same rail geometry) — **2** |
| **hip_arc** | Limb at neutral → limb at canonical arc endpoint | arc about hip; hip pinned; torso frozen | pelvis fixed (no rocking) | hip_abduction (**front view**, knees out) · cable_kickback (heel back, slight fixed forward hinge) · hanging_leg_raise (hang anchor = hands; "no swing" = shoulder pinned) — **3** |
| **crunch_flexion** | Spine long → spine flexed (chest toward pelvis) | arc of the chest landmark about a **fixed hip point** ("hips fixed" cue as geometry) | hips pinned ±1; arms ride, never pull | cable_crunch (kneeling) · machine_crunch (seated, chest on pad) — **2** |

### 4.2 Mechanic B templates — body travels

| Template | Start → End (canonical ROM) | Path / tracked point | Stability & invariants | Members (params) |
|---|---|---|---|---|
| **squat_bilateral** | Standing tall (hip+knee 175°) → **hip crease below knee top** (`hip.y > knee.y + 2`) | bar/load vertical over mid-foot ±1.5 | heels never leave floor; **torso angle at any % of ascent within ±5° of same % of descent** (no good-morning); single plane | bb_back_squat (bar on traps) · front_squat (bar on front delts, more upright torso param) · goblet_squat (load at chest) — **3** |
| **squat_single_leg** | Standing split → **rear knee just above floor** (front knee ~90°) | load/torso vertical (front-shank tracks toes) | front heel planted; torso lean frozen ±5°; "drop straight down" = hip x fixed ±2 | bulgarian_split_squat (rear foot elevated param) · walking_lunge (step param; loop shows one canonical rep in place + step note) — **2** |
| **hinge** | Standing tall → **bar below knee / torso ~horizontal-limit for the variant**, bar never drifts from legs | bar vertical, **within 2 units of the leg line** ("keep the bar close") | knees soft & frozen after setup; back flat (neutral spine — torso drawn straight, never curled); shins vertical at RDL bottom | bb_rdl · db_rdl · bb_deadlift (**concentric_first**, from floor, ROM floor→lockout) · sumo_deadlift (stance param, concentric_first) · cable_pull_through (cable origin behind) · back_extension (hips pinned on pad; torso is the moving segment) — **6** |
| **bridge** | Hips on/near floor-bench → **hip lockout** (shoulder-hip-knee line straight, 175°) | hip landmark vertical arc about shoulders | shoulders anchored (bench/floor), feet planted, shins ~vertical at top | hip_thrust (bench param) · glute_bridge (floor param) — **2** |
| **calf_raise** | **Heel below platform edge (full stretch)** → full rise onto ball of foot | heel landmark vertical; ball-of-foot pinned | knee angle frozen (straight standing / 90° seated / on-sled param); no bounce (hold at both ends: bottom hold 400 ms **and** top hold 400 ms per "pause at the top") | standing_calf_raise · seated_calf_raise · leg_press_calf_raise (sled param) — **3** |
| **bodyweight_push** | Elbow 175° → **chest to floor line / deep dip stretch** | chest landmark vertical; hands pinned | body line straight head-to-anchor ±3° for the whole rep (push-up plank line; dip forward-lean frozen) | push_up · knee_push_up (pivot = knees param) · chest_dip (vertical, depth = shoulder below elbow) — **3** |
| **bodyweight_pull** | Dead hang (elbow 175°) → **chin over bar** | chest/chin landmark vertical; hands pinned on bar | no kip: hip x fixed ±2; legs quiet | pull_up · chin_up (grip param) — **2** |
| **rollout** | Kneeling, wheel under shoulders → **wheel at controlled max, hips open, body line straight** | wheel horizontal along floor | hips never sag below the shoulder-knee line ("brace hard"); knees pinned | ab_wheel — **1** |

**Coverage check: 6+4+6+1+5+4+3+1+1+2+3+2 (A) + 3+2+6+2+3+3+2+1 (B) = 60 / 60.** Every
member is parameters only — zero bespoke predicate sets in the current catalog. Templates
with one member (pull_vertical, knee_extension, knee_flexion, rollout) are kept separate
because their mechanics are genuinely distinct, not because they needed exceptions.

### 4.3 Why this stays sound over 5 years

- **New exercise, existing pattern** (the overwhelming case — a new curl, press, or squat
  variant): template + parameters, canon inherited, nothing re-decided.
- **New pattern** (rare — e.g. planks → `static_hold`): a new template is a reviewed,
  deliberate addition of one table row, not an accumulation of per-exercise rules.
- **Drift is structurally blocked**: predicates live in templates; an exercise can only
  *tighten or parameterize* them. The validator runs template predicates on every exercise's
  timeline in CI, so a pose edit that violates its category fails the build — the same
  mechanism from §1, now guaranteed uniform across categories.

## 5. Ready state for Phase 1

On ratification of this standard, the first animated benchmark (Barbell Bench Press) is built
against: Duotone skin + range ticks · FormSpec `horizontal press` template instantiated per §2 ·
validator running in jest · filmstrip + GIF harness for visual QC. Success = the founder can
watch the loop and check every §2 bench predicate with their own eyes, and CI can check them
without eyes.
